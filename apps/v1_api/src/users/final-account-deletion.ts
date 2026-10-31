import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { enqueueRosterResync, teamMembersTargets } from '../games/roster/roster-resync-events';
import { removeUserFromActiveRosters } from '../tournaments/roster-cleanup';

/**
 * Placeholder values a deleted account keeps in rows that stay behind. Each is derived from the user id, so it is
 * unique and frees the real value (the email, phone, provider key and nickname are all unique columns).
 */
export function buildDeletedEmail(userId: string) {
  return `deleted+${userId}@deleted.teameet.local`;
}

export function buildDeletedPhone(userId: string) {
  return `deleted-${userId}`;
}

export function buildDeletedProviderUserKey(userId: string, identityId: string) {
  return `deleted:${userId}:${identityId}`;
}

function buildDeletedNickname(userId: string) {
  return `deleted_${userId.slice(0, 8)}`;
}

function buildDeletedProfileData(userId: string, deletedAt: Date) {
  return {
    nickname: buildDeletedNickname(userId),
    displayName: '탈퇴 회원',
    realName: null,
    gender: null,
    birthDate: null,
    bio: null,
    profileImageUrl: null,
    displayRegion: null,
    visibility: 'private' as const,
    tournamentRealNameVisible: false,
    deletedAt,
  };
}

/**
 * Personal data every final account deletion removes, whether an operator deletes the account or an unfinished
 * signup is retired when its login moves to another account. Runs inside the caller's transaction; the user row,
 * its auth identities and its audit log stay with the caller.
 */
export async function clearDeletedAccountData(tx: Prisma.TransactionClient, userId: string, deletedAt: Date) {
  await tx.v1UserProfile.updateMany({
    where: { userId },
    data: buildDeletedProfileData(userId, deletedAt),
  });
  // 공개 개인 기록 게이트(`isParticipantPubliclyEligible`, public-consent.ts)는
  // `V1UserRecordConsent.state`가 GRANTED인지만 본다 -- 여기서 REVOKED로 함께
  // 전환하지 않으면 탈퇴 전 동의를 켰던 사용자의 경기 기록(사용자 기록 페이지 +
  // 대회 기록/랭킹 등 같은 게이트를 쓰는 다른 공개 화면)이 탈퇴 후에도 계속 공개
  // 후보로 남는다. 동의 행이 없던 사용자는 그대로 두어도 이미 non-eligible이므로
  // updateMany 로 기존 GRANTED 행만 REVOKED 전환한다(없는 행을 새로 만들 필요 없음).
  await tx.v1UserRecordConsent.updateMany({
    where: { userId, state: 'GRANTED' },
    data: { state: 'REVOKED', effectiveAt: deletedAt },
  });
  // 탈퇴 요청 단계에서는 기기 등록을 revoked 상태로 남겨 운영 이력을 보존하지만,
  // 최종 삭제 단계에서는 FCM/APNs 토큰과 웹 Push endpoint 자체가 더 이상 필요하지
  // 않다. 둘 다 재식별 가능한 기기 식별자이므로 계정 삭제 트랜잭션 안에서 제거한다.
  await tx.v1PushSubscription.deleteMany({ where: { userId } });
  await tx.v1PushDevice.deleteMany({ where: { userId } });
  await tx.v1ChatUserBlock.deleteMany({ where: { OR: [{ blockerUserId: userId }, { blockedUserId: userId }] } });
  await tx.v1UserRegion.deleteMany({ where: { userId } });
  await tx.v1UserSportPreference.deleteMany({ where: { userId } });
  await tx.v1SearchHistory.deleteMany({ where: { userId } });
  await tx.v1VerificationToken.deleteMany({ where: { userId } });
  // Kakao/Apple sign-in prefill (name, phone, gender, birth date) is parked here until the signup is finished.
  await tx.v1UserOnboardingProgress.updateMany({ where: { userId }, data: { draftJson: {} } });
}

/** Who ends an account: an operator acting through the admin console, or the platform on its own schedule. */
export type AccountDeletionActor =
  | { type: 'admin'; admin: { id: string; userId: string } }
  | { type: 'system' };

type CommitmentLogger = { info(obj: object, msg: string): void };

export async function lockUserRow(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "v1_users" WHERE id = ${userId} FOR UPDATE
  `;
}

/** The active team this user still owns or manages, if any. */
export async function findTeamAuthority(tx: Prisma.TransactionClient, userId: string) {
  return tx.v1TeamMembership.findFirst({
    where: {
      userId,
      status: 'active',
      role: { in: ['owner', 'manager'] },
      team: { status: 'active', deletedAt: null },
    },
    select: { team: { select: { id: true, name: true } }, role: true },
  });
}

// Same rule as a member's own withdrawal (ProfileService.assertWithdrawable): disabling a team owner or manager
// would leave the team active with nobody running it.
export async function assertNoTeamAuthority(tx: Prisma.TransactionClient, userId: string) {
  const authority = await findTeamAuthority(tx, userId);
  if (authority) {
    throw new ConflictException({
      code: 'USER_HAS_TEAM_AUTHORITY',
      message: `이 사용자는 '${authority.team.name}' 팀의 ${authority.role === 'owner' ? '소유자' : '매니저'}예요. 팀 권한을 다른 멤버에게 넘긴 뒤 다시 시도해주세요.`,
    });
  }
}

// A disabled account must leave upcoming tournament rosters and team rosters, or it keeps occupying capacity.
// Finished tournaments are left alone to keep their records (see roster-cleanup.ts).
export async function detachUserFromActiveCommitments(
  tx: Prisma.TransactionClient,
  userId: string,
  actor: AccountDeletionActor,
  options: { reason?: string; at?: Date; logger?: CommitmentLogger } = {},
) {
  const at = options.at ?? new Date();
  const actorUserId = actor.type === 'admin' ? actor.admin.userId : null;
  const memberships = await tx.v1TeamMembership.findMany({
    where: { userId, status: 'active' },
    select: { id: true, teamId: true, role: true },
  });
  const removedRosterCount = await removeUserFromActiveRosters(tx, userId, { at });

  for (const membership of memberships) {
    await tx.v1TeamMembership.update({
      where: { id: membership.id },
      data: { status: 'removed', removedByUserId: actorUserId, leftAt: at },
    });
    await tx.v1Team.update({
      where: { id: membership.teamId },
      data: {
        memberCount: { decrement: 1 },
        ...(membership.role === 'manager' ? { managerCount: { decrement: 1 } } : {}),
      },
    });
    await tx.v1StatusChangeLog.create({
      data: {
        targetType: 'team_membership',
        targetId: membership.id,
        fromStatus: 'active',
        toStatus: 'removed',
        actorType: actor.type,
        actorUserId,
        reason: options.reason ?? (actor.type === 'admin' ? 'admin_account_deactivated' : 'system_account_deactivated'),
      },
    });
  }
  await enqueueRosterResync(tx, teamMembersTargets(memberships.map((membership) => membership.teamId)));

  if (removedRosterCount > 0 || memberships.length > 0) {
    options.logger?.info(
      { userId, rosters: removedRosterCount, teams: memberships.length },
      '계정 비활성화에 따른 대회 명단·팀 멤버십 정리',
    );
  }
}

/**
 * Ends an account for good: tombstones its contact values, releases it from rosters and teams, unlinks its logins,
 * clears personal data and records who did it. The caller holds the user row lock and has decided the account may
 * be deleted (an operator's checks, or the grace period having run out); this only refuses while the user still
 * owns or manages a team.
 */
export async function finalizeAccountDeletion(
  tx: Prisma.TransactionClient,
  input: {
    target: { id: string; accountStatus: string; email: string | null; phone: string | null; deletedAt: Date | null };
    actor: AccountDeletionActor;
    reason: string;
    deletedAt: Date;
    logger?: CommitmentLogger;
  },
) {
  const { target, actor, reason, deletedAt } = input;
  const userId = target.id;
  await assertNoTeamAuthority(tx, userId);

  const updated = await tx.v1User.update({
    where: { id: userId },
    data: {
      accountStatus: 'deleted',
      deletedAt,
      email: target.email ? buildDeletedEmail(userId) : null,
      phone: target.phone ? buildDeletedPhone(userId) : null,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
    },
  });

  await detachUserFromActiveCommitments(tx, userId, actor, { reason, at: deletedAt, logger: input.logger });
  const identities = await tx.v1AuthIdentity.findMany({
    where: { userId },
    select: { id: true, provider: true },
  });
  await Promise.all(
    identities.map((identity) =>
      tx.v1AuthIdentity.update({
        where: { id: identity.id },
        data: {
          status: 'unlinked',
          providerUserKey: buildDeletedProviderUserKey(userId, identity.id),
          email: null,
          passwordHash: null,
          providerRefreshTokenCiphertext: null,
          unlinkedAt: deletedAt,
        },
      }),
    ),
  );
  await clearDeletedAccountData(tx, userId, deletedAt);

  const actionLog =
    actor.type === 'admin'
      ? await tx.v1AdminActionLog.create({
          data: {
            adminUserId: actor.admin.id,
            action: 'user.delete',
            targetType: 'user',
            targetId: userId,
            reason,
            beforeJson: {
              accountStatus: target.accountStatus,
              deletedAt: target.deletedAt?.toISOString() ?? '',
              hasEmail: target.email ? 'true' : 'false',
              hasPhone: target.phone ? 'true' : 'false',
            },
            afterJson: {
              accountStatus: updated.accountStatus,
              deletedAt: deletedAt.toISOString(),
              personalDataMasked: 'true',
            },
          },
        })
      : null;
  const statusChangeLog = await tx.v1StatusChangeLog.create({
    data: {
      targetType: 'user',
      targetId: userId,
      fromStatus: target.accountStatus,
      toStatus: updated.accountStatus,
      actorType: actor.type,
      adminUserId: actor.type === 'admin' ? actor.admin.id : null,
      reason,
    },
  });

  return {
    userId,
    previousStatus: target.accountStatus,
    status: updated.accountStatus,
    actionLogId: actionLog?.id ?? null,
    statusChangeLogId: statusChangeLog.id,
  };
}
