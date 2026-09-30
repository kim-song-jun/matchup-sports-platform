import { Injectable, Logger } from '@nestjs/common';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { TeamUpcomingGamesService, type NextTeamGame } from '../team-lineups/team-upcoming-games.service';

/** 홈에 실리는 "내 팀" 쪽 정보 — 다음 경기 카드와 팀 유도 배너(초대·가입 신청)의 재료. */
export interface HomeTeamActivity {
  /** 활성 팀이 하나라도 있는지. 없으면 다음 경기 자리가 "먼저 해 볼 일" 빈 상태가 된다. */
  hasTeam: boolean;
  nextGame: NextTeamGame | null;
  /** 내가 받은 대기 중인 팀 초대. 없으면 null. */
  pendingInvitations: { count: number; latestTeamName: string } | null;
  /** 내가 팀장·매니저인 팀들에 쌓인 대기 가입 신청. 링크는 가장 많이 쌓인 팀으로 간다. 없으면 null. */
  pendingJoinRequests: { count: number; teamId: string; teamName: string; otherTeamCount: number } | null;
}

const NO_TEAM_ACTIVITY: HomeTeamActivity = {
  hasTeam: false,
  nextGame: null,
  pendingInvitations: null,
  pendingJoinRequests: null,
};

@Injectable()
export class HomeTeamActivityService {
  private readonly logger = new Logger(HomeTeamActivityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly upcomingGames: TeamUpcomingGamesService,
  ) {}

  /**
   * 홈 전체가 이 조회 하나 때문에 죽으면 안 되므로, 실패하면 로그를 남기고 `null` 을 돌려준다.
   * `null` 은 "팀이 없다"가 아니라 "계산하지 못했다"이며, 웹은 그때 이 영역을 그리지 않는다.
   */
  async forUser(user: V1AuthUser | null, now: Date = new Date()): Promise<HomeTeamActivity | null> {
    if (user === null) return NO_TEAM_ACTIVITY;
    try {
      const [memberships, invitations] = await Promise.all([
        // 활성 멤버십으로 좁힌 팀만 넘긴다 — 다음 경기·가입 신청 집계가 이 목록 밖의 팀을 보지 못하게 하는 권한 경계다.
        this.prisma.v1TeamMembership.findMany({
          where: { userId: user.id, status: 'active', team: { status: 'active', deletedAt: null } },
          select: { teamId: true, role: true, team: { select: { name: true } } },
        }),
        // 초대함(`GET /me/invitations`)과 같은 조건이다 — 배너의 건수와 초대함 목록이 갈리면 안 된다.
        this.prisma.v1TeamInvitation.findMany({
          where: { invitedUserId: user.id, status: 'pending' },
          orderBy: [{ createdAt: 'desc' }],
          select: { team: { select: { name: true } } },
        }),
      ]);
      const managed = memberships.filter((membership) => membership.role === 'owner' || membership.role === 'manager');
      const [nextGame, pendingJoinRequests] = await Promise.all([
        memberships.length === 0 ? null : this.upcomingGames.nextForMemberships(user.id, memberships, now),
        this.pendingJoinRequests(managed),
      ]);
      return {
        hasTeam: memberships.length > 0,
        nextGame,
        pendingInvitations:
          invitations.length === 0 ? null : { count: invitations.length, latestTeamName: invitations[0].team.name },
        pendingJoinRequests,
      };
    } catch (error) {
      this.logger.error(
        `홈 팀 정보 조회에 실패했어요 (user ${user.id})`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  private async pendingJoinRequests(
    managed: readonly { teamId: string; team: { name: string } }[],
  ): Promise<HomeTeamActivity['pendingJoinRequests']> {
    if (managed.length === 0) return null;
    const grouped = await this.prisma.v1TeamJoinApplication.groupBy({
      by: ['teamId'],
      where: { teamId: { in: managed.map((membership) => membership.teamId) }, status: 'requested' },
      _count: { _all: true },
    });
    const countByTeam = new Map(grouped.map((row) => [row.teamId, row._count._all]));
    const waiting = managed
      .map((membership) => ({ teamId: membership.teamId, teamName: membership.team.name, count: countByTeam.get(membership.teamId) ?? 0 }))
      .filter((team) => team.count > 0);
    if (waiting.length === 0) return null;
    const top = waiting.reduce((best, team) => (team.count > best.count ? team : best));
    return {
      count: waiting.reduce((sum, team) => sum + team.count, 0),
      teamId: top.teamId,
      teamName: top.teamName,
      otherTeamCount: waiting.length - 1,
    };
  }
}
