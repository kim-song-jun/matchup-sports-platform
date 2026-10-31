import type { Prisma } from '@prisma/client';

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
}
