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
 *
 * ## Binding the check to the exact serialized value (P0 fix, review finding #3)
 * `resolve()` previously received only `gameId`/`tournamentFixtureId` -- it was called AFTER the
 * board had already loaded a specific current revision/score, so a concurrent write between that
 * load and this call could let the authority approve a DIFFERENT revision than the one the board
 * goes on to serialize (the board would still have blindly trusted its own now-stale in-memory
 * `row.game.currentOfficialRevision`). `resolve()` now receives the EXACT expected identity/value
 * the board is about to serialize -- `expectedGameVersion`, `expectedRevisionId`,
 * `expectedScoreHash` (a `sha256` hex digest of `JSON.stringify(currentOfficialRevision.score)`,
 * computed once by the board from the same read it is about to serialize).
 *
 * A conforming implementation of `resolve()` MUST treat `{ outcome: 'ok' }` as meaning "the
 * expected identity/value given to me is exactly what I independently observe as the current
 * authoritative result right now" -- if its own fresh read disagrees with ANY of
 * `expectedGameVersion`/`expectedRevisionId`/`expectedScoreHash` (e.g. because a write raced this
 * call), it MUST return `{ outcome: 'mismatch', ... }` rather than compare against its own stale
 * or unrelated notion of "current". `TournamentOperationsBoardService.list()` additionally performs
 * its own post-resolution CAS-style recheck against `V1Game.version`/`currentOfficialRevisionId`
 * (fresh, non-transactional read) after every `'ok'` outcome and fails closed with
 * `409 GAME_RESULT_READ_STALE` if the board's own database disagrees with what it just served --
 * this defends the case where the authority implementation does not (or cannot) participate in
 * the board's own transaction/read path.
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
    /** `V1Game.version` at the instant the board read the row it is about to serialize. */
    readonly expectedGameVersion: number;
    /** `V1Game.currentOfficialRevisionId` at that same instant (never null when `resolve()` is
     * called -- the board only calls this port for rows that have a current official revision). */
    readonly expectedRevisionId: string;
    /** `sha256` hex digest of `JSON.stringify(currentOfficialRevision.score)` at that same
     * instant -- lets the authority detect a same-revision-id-different-payload drift, not just a
     * revision-id change. */
    readonly expectedScoreHash: string;
  }): Promise<GameReadAuthorityResult>;
}
