import type { V1GameState } from '@prisma/client';
import type { GameRosterComputation } from './game-roster-computation';
import type { LoadedGameRoster } from './game-roster-loader';

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
}

export interface TeamRosterMatrix {
  readonly games: (TeamRosterMatrixGame & { editable: boolean; summary: GameRosterSummary | null })[];
  readonly players: {
    readonly userId: string;
    readonly displayName: string;
    readonly accountLinked: boolean;
    /** `games` 와 같은 순서·길이. */
    readonly cells: TeamRosterCell[];
  }[];
}

const EMPTY_CELL = { reason: null, actorRole: null, adjustmentId: null, unavailabilityId: null, remainingMatches: null };

/**
 * 팀 B·어드민의 선수 × 경기 표. 행 = 어느 경기든 기준 명단에 있는 사람(처음 나온 순서),
 * 기준 명단이 없는 경기(`loaded === null`)나 그 경기 기준 명단 밖이면 `NOT_IN_ROSTER`.
 */
export function buildTeamRosterMatrix(input: {
  readonly columns: readonly { game: TeamRosterMatrixGame; loaded: LoadedGameRoster | null }[];
  readonly canWrite: boolean;
}): TeamRosterMatrix {
  const players = new Map<string, { displayName: string; accountLinked: boolean }>();
  const cellsByGame = input.columns.map(({ game, loaded }) => {
    const cells = new Map<string, TeamRosterCell>();
    if (loaded === null) return cells;
    for (const entry of loaded.base) {
      if (!players.has(entry.userId)) {
        players.set(entry.userId, { displayName: entry.displayNameSnapshot, accountLinked: entry.accountLinked });
      }
    }
    const { computation } = loaded;
    for (const entry of computation.participants) {
      cells.set(entry.userId, { gameId: game.gameId, status: 'PARTICIPATING', ...EMPTY_CELL });
    }
    for (const row of computation.excluded) {
      cells.set(row.entry.userId, {
        ...EMPTY_CELL,
        gameId: game.gameId,
        status: 'EXCLUDED',
        reason: row.reason,
        actorRole: row.actorRole,
        adjustmentId: row.adjustmentId,
      });
    }
    for (const row of computation.unavailable) {
      cells.set(row.entry.userId, {
        ...EMPTY_CELL,
        gameId: game.gameId,
        status: 'UNAVAILABLE',
        reason: row.reason,
        actorRole: row.actorRole,
        unavailabilityId: row.unavailabilityId,
      });
    }
    for (const row of computation.suspended) {
      cells.set(row.entry.userId, {
        ...EMPTY_CELL,
        gameId: game.gameId,
        status: 'SUSPENDED',
        reason: row.reason,
        remainingMatches: row.remainingMatches,
      });
    }
    return cells;
  });

  return {
    games: input.columns.map(({ game, loaded }) => ({
      ...game,
      editable: input.canWrite && loaded !== null && game.gameState === 'SCHEDULED',
      summary: loaded === null ? null : summarizeGameRoster(loaded.computation),
    })),
    players: [...players.entries()].map(([userId, player]) => ({
      userId,
      ...player,
      cells: input.columns.map(
        ({ game }, index) =>
          cellsByGame[index].get(userId) ?? { gameId: game.gameId, status: 'NOT_IN_ROSTER' as const, ...EMPTY_CELL },
      ),
    })),
  };
}
