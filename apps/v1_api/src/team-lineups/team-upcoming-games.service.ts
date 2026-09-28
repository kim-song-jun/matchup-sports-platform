import { Injectable } from '@nestjs/common';
import type { V1AuthUser } from '../auth/v1-auth-user';
import type { Prisma } from '@prisma/client';
import { loadCompetitionRosterBase, loadGameRoster } from '../games/roster/game-roster-loader';
import { summarizeGameRoster, type GameRosterSummary } from '../games/roster/game-roster-matrix';
import { PrismaService } from '../prisma/prisma.service';
import { loadTeamCompetitionGameOrder } from '../tournaments/discipline/team-game-order';
import { LineupTodoService, type TeamUpcomingGame } from './lineup-todo.service';
import { assertTeamLineupMember } from './team-lineup-access';

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

  async listForTeam(user: V1AuthUser, teamId: string) {
    // 전술보드 읽기와 같은 선 — 활성 팀원이면 본다. 팀이 없으면 404, 팀원이 아니면 403.
    await assertTeamLineupMember(this.prisma, teamId, user.id);
    const games = await this.lineupTodos.listUpcomingForTeam(teamId, new Date());
    // 리그 기준 명단 로드가 명단 없는 확정 신청을 채울 수 있어(경기 명단 조회와 같은 이유) 트랜잭션이다.
    const rosters = await this.prisma.$transaction((tx) => loadRosterSummaries(tx, teamId, games));
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
      })),
    };
  }
}

async function loadRosterSummaries(
  tx: Prisma.TransactionClient,
  teamId: string,
  games: readonly TeamUpcomingGame[],
): Promise<Map<string, { teamMatchId: string | null; sideId: string; summary: GameRosterSummary | null }>> {
  const sides = await tx.v1GameSide.findMany({
    where: { gameId: { in: games.map((game) => game.gameId) }, teamId },
    select: { id: true, gameId: true, game: { select: { teamMatchId: true } } },
  });
  const sideByGame = new Map(sides.map((side) => [side.gameId, side]));
  const preloaded = new Map<string, Awaited<ReturnType<typeof preload>>>();
  async function preload(competitionId: string, isLeague: boolean) {
    const scope = { competitionId, isLeague, teamId };
    const base = await loadCompetitionRosterBase(tx, scope);
    return { base, orderedGames: base === null ? [] : await loadTeamCompetitionGameOrder(tx, scope) };
  }

  const result = new Map<string, { teamMatchId: string | null; sideId: string; summary: GameRosterSummary | null }>();
  for (const game of games) {
    const side = sideByGame.get(game.gameId);
    if (side === undefined) continue;
    let summary: GameRosterSummary | null = null;
    if (game.competitionKind !== 'FRIENDLY' && game.tournamentId !== null) {
      let cached = preloaded.get(game.tournamentId);
      if (cached === undefined) {
        cached = await preload(game.tournamentId, game.competitionKind === 'LEAGUE');
        preloaded.set(game.tournamentId, cached);
      }
      const loaded =
        cached.base === null ? null : await loadGameRoster(tx, { gameId: game.gameId, sideId: side.id }, cached);
      summary = loaded === null ? null : summarizeGameRoster(loaded.computation);
    }
    result.set(game.gameId, { teamMatchId: side.game.teamMatchId, sideId: side.id, summary });
  }
  return result;
}
