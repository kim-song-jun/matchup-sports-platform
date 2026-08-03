/**
 * Read-authority seam for the operations board (Task 18).
 *
 * Task 10 (apps/v1_api/src/games/migration/compare-game-result-reads.ts) is not present in this
 * worktree, so the board cannot import its real comparator directly. Instead this port defines
 * the exact shape Task 10 must satisfy when it lands: `TournamentOperationsBoardModule.register()`
 * (see tournament-operations-board.module.ts) accepts the `GAME_READ_AUTHORITY` provider to bind
 * as a parameter, defaulting to `DirectGameReadAuthorityService`. Task 10 swaps in the real
 * comparator purely at the `app.module.ts` composition root --
 * `TournamentOperationsBoardModule.register({ provide: GAME_READ_AUTHORITY, useClass: CompareGameReadAuthorityService })`
 * -- with zero changes required to this controller/service/module.
 *
 * Contract:
 * - `resolve()` is called once per fixture row that has a current/official result, only while the
 *   `GAME_READ` operation flag (apps/v1_api/src/config/game-operation-flags.ts) is `'compare'`.
 * - `{ outcome: 'ok' }` means the legacy and projected reads agree (or there is nothing to compare
 *   yet under `'legacy'`/`'new'` modes, where the board never calls this port at all).
 * - `{ outcome: 'mismatch', detail }` means the board MUST fail closed: abort building the response
 *   and return `409 GAME_RESULT_READ_MISMATCH` rather than serve a value it cannot vouch for.
 * - `detail.field` mirrors the dotted-path shape used by compare-game-result-reads.spec.ts, e.g.
 *   `'score.regulation.home'`.
 */
export const GAME_READ_AUTHORITY = Symbol('GAME_READ_AUTHORITY');

export type GameResultMismatchDetail = {
  readonly entity: string; // e.g. `TOURNAMENT_FIXTURE:<fixtureId>`
  readonly revision: string; // gameId or resultRevisionId
  readonly field: string; // dotted path, e.g. 'score.regulation.home'
};

export type GameReadAuthorityResult =
  | { readonly outcome: 'ok' }
  | { readonly outcome: 'mismatch'; readonly detail: GameResultMismatchDetail };

export interface GameReadAuthorityPort {
  resolve(input: {
    readonly gameId: string;
    readonly tournamentFixtureId: string;
  }): Promise<GameReadAuthorityResult>;
}
