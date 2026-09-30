import { Injectable, Logger } from '@nestjs/common';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { TeamUpcomingGamesService, type NextTeamGame } from '../team-lineups/team-upcoming-games.service';

/** 홈에 실리는 "내 팀" 쪽 정보 — 다음 경기 카드와 팀 유도 배너의 재료. */
export interface HomeTeamActivity {
  /** 활성 팀이 하나라도 있는지. 없으면 다음 경기 자리가 "먼저 해 볼 일" 빈 상태가 된다. */
  hasTeam: boolean;
  nextGame: NextTeamGame | null;
}

const NO_TEAM_ACTIVITY: HomeTeamActivity = { hasTeam: false, nextGame: null };

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
      // 활성 멤버십으로 좁힌 팀만 넘긴다 — 다음 경기 수집이 이 목록 밖의 팀을 보지 못하게 하는 권한 경계다.
      const memberships = await this.prisma.v1TeamMembership.findMany({
        where: { userId: user.id, status: 'active', team: { status: 'active', deletedAt: null } },
        select: { teamId: true, role: true },
      });
      if (memberships.length === 0) return NO_TEAM_ACTIVITY;
      return {
        hasTeam: true,
        nextGame: await this.upcomingGames.nextForMemberships(user.id, memberships, now),
      };
    } catch (error) {
      this.logger.error(
        `홈 팀 정보 조회에 실패했어요 (user ${user.id})`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }
}
