import type { V1GameState } from '@prisma/client';
import type { GameRosterComputation } from './game-roster-computation';
import type { LoadedGameRoster } from './game-roster-loader';
import { reconcilePlayedLineup, type GameRosterCardsView, type GameRosterDisciplineRulesView, type PlayedLineupRow } from './game-roster-view';

export interface GameRosterSummary {
  readonly participating: number;
  readonly excluded: number;
  readonly unavailable: number;
  readonly suspended: number;
}

export function summarizeGameRoster(computation: GameRosterComputation): GameRosterSummary {
  return {
    participating: computation.participants.length,
    excluded: computation.excluded.length,
    unavailable: computation.unavailable.length,
    suspended: computation.suspended.length,
  };
}

export interface TeamRosterMatrixGame {
  readonly gameId: string;
  readonly sideId: string;
  readonly teamMatchId: string;
  readonly competitionId: string;
  readonly competitionKind: 'TOURNAMENT' | 'LEAGUE';
  readonly competitionTitle: string | null;
  readonly opponentName: string | null;
  readonly scheduledAt: Date | null;
  readonly gameState: V1GameState;
  readonly goalkeeperEditable?: boolean;
  /** 이 경기가 속한 대회·리그의 정지 규정. 규정이 없거나 기준 명단이 없는 경기는 null. */
  readonly disciplineRules?: GameRosterDisciplineRulesView | null;
}

export type TeamRosterCellStatus = 'PARTICIPATING' | 'EXCLUDED' | 'UNAVAILABLE' | 'SUSPENDED' | 'NOT_IN_ROSTER';

export interface TeamRosterCell {
  readonly gameId: string;
  readonly status: TeamRosterCellStatus;
  readonly reason: string | null;
  readonly actorRole: string | null;
  readonly adjustmentId: string | null;
  readonly unavailabilityId: string | null;
  readonly remainingMatches: number | null;
  /** 이 경기 직전까지 쌓인 카드. 카드 기록이 없는 선수는 null. */
  readonly cards?: GameRosterCardsView | null;
  readonly goalkeeper?: boolean;
}

export interface TeamRosterMatrix {
  readonly games: (TeamRosterMatrixGame & { editable: boolean; summary: GameRosterSummary | null })[];
  readonly players: {
    readonly userId: string;
    readonly displayName: string;
    /** 대회 운영진에게만, 계정 실명이 있을 때만 실린다 — 그 밖에는 키 자체가 없다(경기 명단 화면과 같은 규칙). */
    readonly realName?: string;
    readonly accountLinked: boolean;
    /** `games` 와 같은 순서·길이. */
    readonly cells: TeamRosterCell[];
  }[];
}

const EMPTY_CELL = { reason: null, actorRole: null, adjustmentId: null, unavailabilityId: null, remainingMatches: null };

/**
 * 팀 B·어드민의 선수 × 경기 표. 행 = 어느 경기든 기준 명단·기록 명단에 있는 사람,
 * 기준 명단이 없는 경기(`loaded === null`)나 그 경기 명단 밖이면 `NOT_IN_ROSTER`.
 */
export function buildTeamRosterMatrix(input: {
  /** `playedLineup` 은 시작된 경기의 기록 명단(`loadPlayedLineup`) — 없거나 null 이면 계산한 출전자를 쓴다. */
  readonly columns: readonly { game: TeamRosterMatrixGame; loaded: LoadedGameRoster | null; playedLineup?: readonly PlayedLineupRow[] | null }[];
  readonly canWrite: boolean;
  readonly canEditEnded?: boolean;
  /** 계정 id → 실명. 대회 운영진에게만 채워 넘긴다. */
  readonly realNameByUserId?: ReadonlyMap<string, string>;
}): TeamRosterMatrix {
  const players = new Map<string, { displayName: string; accountLinked: boolean }>();
  const addPlayer = (userId: string, displayName: string, accountLinked: boolean) => {
    if (!players.has(userId)) players.set(userId, { displayName, accountLinked });
  };
  const byGame = input.columns.map(({ game, loaded, playedLineup }) => {
    const cells = new Map<string, TeamRosterCell>();
    if (loaded === null) return { cells, summary: null };
    for (const entry of loaded.base) addPlayer(entry.userId, entry.displayNameSnapshot, entry.accountLinked);
    // 시작된 경기는 기록 명단이 출전자다(경기 명단 화면과 같은 규칙) — 공식 정정·시작 뒤 생긴 결장이 그대로 반영된다.
    const { played, excluded, unavailable, suspended } = reconcilePlayedLineup(loaded.computation, loaded.base, playedLineup ?? null);
    for (const row of played ?? []) addPlayer(row.userId, row.displayName, row.accountLinked);
    const goalkeeperByUser = new Map([...loaded.base, ...(played ?? [])].map((row) => [row.userId, row.goalkeeper ?? false]));
    const participants = played ?? loaded.computation.participants;
    for (const entry of participants) {
      cells.set(entry.userId, { gameId: game.gameId, status: 'PARTICIPATING', ...EMPTY_CELL });
    }
    for (const row of excluded) {
      cells.set(row.entry.userId, {
        ...EMPTY_CELL,
        gameId: game.gameId,
        status: 'EXCLUDED',
        reason: row.reason,
        actorRole: row.actorRole,
        adjustmentId: row.adjustmentId,
      });
    }
    for (const row of unavailable) {
      cells.set(row.entry.userId, {
        ...EMPTY_CELL,
        gameId: game.gameId,
        status: 'UNAVAILABLE',
        reason: row.reason,
        actorRole: row.actorRole,
        unavailabilityId: row.unavailabilityId,
      });
    }
    for (const row of suspended) {
      cells.set(row.entry.userId, {
        ...EMPTY_CELL,
        gameId: game.gameId,
        status: 'SUSPENDED',
        reason: row.reason,
        remainingMatches: row.remainingMatches,
      });
    }
    for (const [userId, cell] of cells) {
      cells.set(userId, {
        ...cell,
        cards: loaded.discipline.rules === null ? null : (loaded.discipline.cardsByUserId.get(userId) ?? null),
        goalkeeper: goalkeeperByUser.get(userId) ?? false,
      });
    }
    const summary: GameRosterSummary = {
      participating: participants.length,
      excluded: excluded.length,
      unavailable: unavailable.length,
      suspended: suspended.length,
    };
    return { cells, summary };
  });

  return {
    games: input.columns.map(({ game, loaded }, index) => ({
      ...game,
      disciplineRules: loaded?.discipline.rules ?? null,
      editable: input.canWrite && loaded !== null && (game.gameState === 'SCHEDULED' || (input.canEditEnded === true && game.gameState === 'ENDED')),
      goalkeeperEditable: game.goalkeeperEditable !== false && input.canWrite && loaded !== null && game.gameState === 'SCHEDULED',
      summary: byGame[index].summary,
    })),
    // 대회·리그마다 등번호가 달라 한 번호로 줄 세울 수 없다 — 이름순.
    players: [...players.entries()]
      .sort(([aId, a], [bId, b]) => a.displayName.localeCompare(b.displayName, 'ko') || aId.localeCompare(bId))
      .map(([userId, player]) => ({
      userId,
      ...player,
      ...(input.realNameByUserId?.has(userId) ? { realName: input.realNameByUserId.get(userId)! } : {}),
      cells: input.columns.map(
        ({ game }, index) =>
          byGame[index].cells.get(userId) ?? { gameId: game.gameId, status: 'NOT_IN_ROSTER' as const, ...EMPTY_CELL },
      ),
    })),
  };
}
