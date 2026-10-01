import { Injectable } from '@nestjs/common';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { LineupTodoService, loadRosterSummaries } from './lineup-todo.service';
import { assertTeamLineupMember } from './team-lineup-access';
import { loadViewerParticipation } from './viewer-game-participation';

/**
 * 홈 "다음 경기" 는 킥오프 뒤에도 결과가 나갈 때까지 그 경기에 머문다. 결과가 늦어져도 이 시간이
 * 지나면 다음 경기로 넘어간다(2026-10-01 사용자 결정 — 홈 카드만, 팀 화면·할 일·리마인더는 그대로).
 */
export const NEXT_GAME_STARTED_GRACE_MS = 3 * 60 * 60 * 1000;

/** 홈 맨 위 "다음 경기" 카드가 그리는 경기 하나. 출전 여부는 서버가 판정해 내려 준다. */
export interface NextTeamGame {
  gameId: string;
  teamMatchId: string | null;
  competitionKind: 'TOURNAMENT' | 'LEAGUE' | 'FRIENDLY';
  /** 대회면 대회 id, 리그면 리그 id — 경기 상세 경로가 종류마다 다르다. */
  competitionId: string | null;
  title: string;
  opponentName: string | null;
  scheduledAt: Date;
  placeName: string | null;
  teamId: string;
  teamName: string;
  /** 팀장·매니저면 카드가 "명단 확인"으로 바뀐다. */
  viewerCanManage: boolean;
  viewerParticipating: boolean;
  /** 대회·리그의 계산된 출전 인원. 친선과 확정 명단 없는 팀은 null. */
  participantCount: number | null;
}

/**
 * 팀 화면의 "다가오는 경기" — 전술보드로 들어가는 입구.
 *
 * 수집은 `LineupTodoService` 가 이미 하고 있다(대회 픽스처 + 팀매치를 한 경로에서 모은다).
 * 여기서 하는 일은 두 가지뿐이다: **누가 볼 수 있는지 판정**하고, 화면이 바로 쓸 모양으로
 * 옮겨 담는다. 수집 로직을 복사하지 않는 것이 요점이다 — 두 벌이 되면 한쪽만 고쳐지는
 * 순간 홈의 할 일 카드와 이 목록이 서로 다른 경기를 보여주기 시작한다.
 */
@Injectable()
export class TeamUpcomingGamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lineupTodos: LineupTodoService,
  ) {}

  async listForTeam(user: V1AuthUser, teamId: string, now: Date = new Date()) {
    // 전술보드 읽기와 같은 선 — 활성 팀원이면 본다. 팀이 없으면 404, 팀원이 아니면 403.
    await assertTeamLineupMember(this.prisma, teamId, user.id);
    const games = await this.lineupTodos.listUpcomingForTeam(teamId, now);
    // 조회라 DB 를 바꾸지 않는다 — 리그 명단 자동 채움은 동기화 쓰기 경로에서만 돈다.
    const rosters = await loadRosterSummaries(this.prisma, teamId, games);
    const participating = await loadViewerParticipation(this.prisma, { userId: user.id, games, rosters });
    return {
      items: games.map((game) => ({
        gameId: game.gameId,
        source: game.source,
        competitionKind: game.competitionKind,
        teamMatchId: rosters.get(game.gameId)?.teamMatchId ?? null,
        sideId: rosters.get(game.gameId)?.sideId ?? null,
        title: game.title,
        opponentName: game.opponentName,
        scheduledAt: game.scheduledAt,
        tournamentId: game.tournamentId,
        tournamentTitle: game.tournamentTitle,
        // 라인업 상태는 그대로 넘긴다 — 전술보드와는 다른 축이지만, 팀장이 "라인업은
        // 냈나"를 같은 줄에서 확인할 수 있어야 두 화면을 오가지 않는다.
        lineupState: game.lineupState,
        // 대회·리그만. 친선과 기준 명단이 없는 팀(확정 신청 없는 대회)은 null.
        rosterSummary: rosters.get(game.gameId)?.summary ?? null,
        // "내 출전" 칩의 근거. 빠진 경기는 false 일 뿐 "빠졌다"는 값을 따로 두지 않는다.
        viewerParticipating: participating.has(game.gameId),
      })),
    };
  }

  /**
   * 내 팀들의 경기 중 **가장 가까운 경기** 하나. 팀원이 아니면 애초에 이 팀들에 들지 않으므로
   * 남의 팀 경기는 나오지 않는다 — `memberships` 는 호출자가 활성 멤버십으로 조회한 값이다.
   * 킥오프가 지난 경기는 결과가 나가기 전(팀매치 `matched`)이고 `NEXT_GAME_STARTED_GRACE_MS` 안이면 남는다.
   */
  async nextForMemberships(
    userId: string,
    memberships: readonly { teamId: string; role: string }[],
    now: Date,
  ): Promise<NextTeamGame | null> {
    const games = await this.lineupTodos.listUpcomingForTeams(
      memberships.map((membership) => membership.teamId),
      now,
      { startedWithinMs: NEXT_GAME_STARTED_GRACE_MS },
    );
    const next = games.find((game) => game.scheduledAt !== null);
    if (next === undefined || next.scheduledAt === null) return null;

    const rosters = await loadRosterSummaries(this.prisma, next.teamId, [next]);
    const roster = rosters.get(next.gameId);
    const participating = await loadViewerParticipation(this.prisma, { userId, games: [next], rosters });
    const place =
      roster?.teamMatchId == null
        ? null
        : await this.prisma.v1TeamMatch.findUnique({ where: { id: roster.teamMatchId }, select: { placeName: true } });
    const role = memberships.find((membership) => membership.teamId === next.teamId)?.role;

    return {
      gameId: next.gameId,
      teamMatchId: roster?.teamMatchId ?? null,
      competitionKind: next.competitionKind,
      competitionId: next.tournamentId,
      title: next.title,
      opponentName: next.opponentName,
      scheduledAt: next.scheduledAt,
      placeName: place?.placeName ?? null,
      teamId: next.teamId,
      teamName: next.teamName,
      viewerCanManage: role === 'owner' || role === 'manager',
      viewerParticipating: participating.has(next.gameId),
      participantCount: roster?.summary?.participating ?? null,
    };
  }
}
