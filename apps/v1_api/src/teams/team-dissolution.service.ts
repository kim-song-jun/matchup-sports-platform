import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { V1AuthUser } from '../auth/v1-auth-user';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { DissolveTeamDto } from './dto/team-dissolution.dto';
import {
  TEAM_RESTORE_WINDOW_DAYS,
  buildDissolutionInfo,
  findDissolutionBlockers,
  isWithinRestoreWindow,
  loadTeamArchivedBy,
} from './team-dissolution';
import {
  TeamDissolutionOutcome,
  dissolveTeamInTx,
  loadDissolutionCleanupPreview,
  restoreTeamInTx,
} from './team-dissolution-tx';

/**
 * 팀 해체(보관)·복구. 해체와 30일 셀프 복구는 팀장만 한다 — 멤버가 있는 팀도 팀장 한 명의 결정으로
 * 사라지므로 팀 이름 확인·전원 알림·복구 기간으로 완화한다(Task 180 H3).
 */
@Injectable()
export class TeamDissolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async preview(user: V1AuthUser, teamId: string) {
    const team = await this.getOwnedTeam(user, teamId);
    this.assertDissolvable(team.status);
    const now = new Date();
    const [blockers, cleanup] = await Promise.all([
      findDissolutionBlockers(this.prisma, teamId, now),
      loadDissolutionCleanupPreview(this.prisma, { teamId, actorUserId: user.id, now }),
    ]);
    return {
      teamId: team.id,
      teamName: team.name,
      canDissolve: blockers.length === 0,
      blockers,
      cleanup,
      restoreWindowDays: TEAM_RESTORE_WINDOW_DAYS,
    };
  }

  async dissolve(user: V1AuthUser, teamId: string, dto: DissolveTeamDto) {
    const team = await this.getOwnedTeam(user, teamId);
    this.assertDissolvable(team.status);
    if (dto.confirmTeamName.trim() !== team.name.trim()) {
      throw new BadRequestException({
        code: 'TEAM_NAME_MISMATCH',
        message: '팀 이름이 달라요. 팀 이름을 그대로 입력해 주세요.',
        details: { field: 'confirmTeamName' },
      });
    }

    const outcome = await this.prisma.$transaction((tx) =>
      dissolveTeamInTx(tx, {
        teamId,
        actor: { type: 'user', userId: user.id },
        reason: 'team_dissolved_by_owner',
        now: new Date(),
        logTeamTransition: true,
      }),
    );
    emitTeamDissolutionNotifications(this.notifications, this.prisma, outcome);

    const info = buildDissolutionInfo(outcome.dissolvedAt, 'owner', true, outcome.dissolvedAt);
    return {
      teamId,
      status: 'archived' as const,
      ...info,
      cancelledTeamMatchCount: outcome.cancelledTeamMatches.length,
      cancelledScheduleCount: outcome.cancelledScheduleCount,
      notifiedMemberCount: outcome.memberUserIds.length,
      detailRoute: `/teams/${teamId}`,
    };
  }

  async restore(user: V1AuthUser, teamId: string) {
    const team = await this.getOwnedTeam(user, teamId);
    if (team.status !== 'archived') {
      throw new ConflictException({ code: 'TEAM_NOT_DISSOLVED', message: '해체된 팀이 아니에요.' });
    }
    await assertSelfRestorable(this.prisma, teamId, team.deletedAt);

    await this.prisma.$transaction(async (tx) => {
      // 잠금 뒤 다시 본다 — 위 판정과 잠금 사이에 기간 경계를 넘거나 운영팀이 풀었다 다시 보관할 수 있다.
      await restoreTeamInTx(tx, { teamId, toStatus: 'active', guard: (locked) => assertSelfRestorable(tx, teamId, locked.deletedAt) });
      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'team',
          targetId: teamId,
          fromStatus: 'archived',
          toStatus: 'active',
          actorType: 'user',
          actorUserId: user.id,
          reason: 'team_restored_by_owner',
        },
      });
    });

    return { teamId, status: 'active' as const, detailRoute: `/teams/${teamId}` };
  }

  /**
   * 마이 > 팀 > 해체한 팀. 내가 팀장인 보관 팀만 — 기간이 지난 팀과 운영팀이 보관한 팀도 "운영팀 문의"
   * 안내를 위해 함께 준다(canRestore=false).
   */
  async myDissolvedTeams(user: V1AuthUser) {
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: { userId: user.id, status: 'active', role: 'owner', team: { status: 'archived' } },
      select: {
        team: {
          select: {
            id: true,
            name: true,
            memberCount: true,
            deletedAt: true,
            sport: { select: { name: true } },
            profile: { select: { logoUrl: true } },
          },
        },
      },
    });
    const now = new Date();
    const archivedBy = await loadTeamArchivedBy(this.prisma, memberships.map(({ team }) => team.id));
    const items = memberships
      .map(({ team }) => ({
        teamId: team.id,
        name: team.name,
        logoUrl: team.profile?.logoUrl ?? null,
        sportName: team.sport.name,
        memberCount: team.memberCount,
        ...buildDissolutionInfo(team.deletedAt, archivedBy(team.id), true, now),
        detailRoute: `/teams/${team.id}`,
      }))
      .sort((a, b) => (b.dissolvedAt?.getTime() ?? 0) - (a.dissolvedAt?.getTime() ?? 0));
    return { items, restoreWindowDays: TEAM_RESTORE_WINDOW_DAYS };
  }

  /** 팀장 본인만 통과한다. 매니저·멤버·비팀원은 같은 403 을 받는다. */
  private async getOwnedTeam(user: V1AuthUser, teamId: string) {
    if (user.accountStatus !== 'active') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Account cannot mutate teams' });
    }
    const team = await this.prisma.v1Team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true, status: true, deletedAt: true },
    });
    if (!team) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '팀을 찾을 수 없어요.' });
    }
    const ownership = await this.prisma.v1TeamMembership.findFirst({
      where: { teamId, userId: user.id, status: 'active', role: 'owner' },
      select: { id: true },
    });
    if (!ownership) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: '팀장만 팀을 해체하거나 복구할 수 있어요.' });
    }
    return team;
  }

  private assertDissolvable(status: string) {
    if (status === 'archived') {
      throw new ConflictException({ code: 'TEAM_ALREADY_DISSOLVED', message: '이미 해체된 팀이에요.' });
    }
    if (status !== 'active') {
      throw new ConflictException({ code: 'TEAM_NOT_ACTIVE', message: '운영이 멈춘 팀은 해체할 수 없어요. 운영팀에 문의해 주세요.' });
    }
  }
}

/** 셀프 복구는 팀장이 해체한 팀을 기간 안에만. 운영팀 보관이 기간보다 먼저 걸러진다. */
async function assertSelfRestorable(db: Prisma.TransactionClient, teamId: string, dissolvedAt: Date | null) {
  const archivedBy = await loadTeamArchivedBy(db, [teamId]);
  if (archivedBy(teamId) !== 'owner') {
    throw new ForbiddenException({
      code: 'TEAM_RESTORE_ADMIN_ONLY',
      message: '운영팀이 보관한 팀은 직접 복구할 수 없어요. 운영팀에 문의해 주세요.',
    });
  }
  assertRestoreWindow(dissolvedAt);
}

function assertRestoreWindow(dissolvedAt: Date | null) {
  if (!isWithinRestoreWindow(dissolvedAt, new Date())) {
    throw new ConflictException({
      code: 'TEAM_RESTORE_WINDOW_EXPIRED',
      message: `해체하고 ${TEAM_RESTORE_WINDOW_DAYS}일이 지나 직접 복구할 수 없어요. 운영팀에 문의해 주세요.`,
    });
  }
}

/**
 * 해체 뒤 알림. 모두 fire-and-forget 이라 해체 자체를 깨지 않는다.
 * - 팀원(해체한 본인 제외)·대기 중이던 가입 신청자: 해체 알림 1건(도착지는 해체된 팀 페이지)
 * - 자동 취소된 팀매치에 신청했던 팀의 팀장·매니저: 기존 '팀매치 취소' 알림
 * - 이 팀이 신청해 둔 팀매치의 호스트 팀장·매니저: 기존 '상대팀 신청 취소' 알림
 * - 초대받은 사람: 받은 초대 알림을 '초대가 취소됐어요'로 바꾼다(새 푸시 없음)
 */
export function emitTeamDissolutionNotifications(
  notifications: NotificationsService,
  prisma: PrismaService,
  outcome: TeamDissolutionOutcome,
) {
  const { teamId, teamName } = outcome;
  void notifications.emitNotificationToMany(outcome.memberUserIds, 'team_dissolved', teamId, `"${teamName}" · 지난 기록은 그대로 남아요.`);
  void notifications.emitNotificationToMany(
    outcome.expiredJoinApplicantUserIds,
    'team_dissolved',
    teamId,
    `"${teamName}" 팀이 해체되어 가입 신청이 종료됐어요.`,
  );
  for (const match of outcome.cancelledTeamMatches) {
    if (match.applicantTeamIds.length === 0) continue;
    notifications.emitToManyDeferred(
      () => activeManagerUserIds(prisma, match.applicantTeamIds),
      'team_match_cancelled',
      match.teamMatchId,
      `"${match.title}" 팀매치가 취소됐어요.`,
    );
  }
  for (const application of outcome.withdrawnApplications) {
    const hostTeamId = application.hostTeamId;
    if (hostTeamId === null) continue;
    notifications.emitToManyDeferred(
      () => activeManagerUserIds(prisma, [hostTeamId]),
      'team_match_application_withdrawn',
      application.teamMatchId,
      `"${application.title}" 팀매치 상대팀 신청이 취소됐어요.`,
    );
  }
  for (const invitation of outcome.cancelledInvitations) {
    void notifications.markTeamInvitationCancelled(invitation.userId, teamId, teamName, invitation.sentAt);
  }
}

async function activeManagerUserIds(prisma: PrismaService, teamIds: string[]): Promise<string[]> {
  const memberships = await prisma.v1TeamMembership.findMany({
    where: { teamId: { in: teamIds }, status: 'active', role: { in: ['owner', 'manager'] } },
    select: { userId: true },
  });
  return [...new Set(memberships.map((membership) => membership.userId))];
}
