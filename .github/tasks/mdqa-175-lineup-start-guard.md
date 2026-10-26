# Task MD-QA #175: Block match start when either current lineup is empty

Status: In Progress  
**Owner**: Codex implementation → independent review by root-assigned gpt-6-sol  
**Created**: 2026-10-26

## Context

MD-QA #175 reports that a tournament or regular-league game can start after all players have been removed from one team's matchday lineup. The persisted official result can then contain zero participants for that team. The server currently validates team assignment, not the effective current lineup. A prior user decision permits starting when a team has not submitted a lineup, because the generated draft already contains the registered roster; this task must preserve that contract.

## Goal

Reject the ordinary start command unless both sides have at least one participant in the effective current matchday lineup, while preserving starts with valid unsubmitted draft rosters.

## Original Conditions (must all be satisfied)

- [ ] Both the server and existing operator-console start action block when either effective side roster is empty.
- [ ] One or more effective participants on each side still permits start, including an unsubmitted generated draft.
- [ ] Preserve team assignment, authorization, lifecycle, and current sport/team-match rules.
- [ ] Do not add no-show, forfeit, or other result policy. That is a separate decision.

## User Scenarios

### Scenario 1: Empty side

As an authorized tournament operator, I want a clear explanation when either side has no current matchday players, so I can correct the lineup before kickoff.

Steps: all players on one side are excluded → open the operations console → attempt start.

Expected result: the UI disables start and names the side with no players; a direct start request is rejected with a stable 409 code and Korean reason, leaving the game scheduled.

### Scenario 2: Valid roster without submitted lineup

As an authorized operator, I want to start a match with generated draft participants even if teams have not submitted a separate lineup.

Expected result: one or more effective players on each side allow start, regardless of whether those effective lineups are submitted.

## Test Scenarios

### Happy path

- [ ] Both sides have at least one effective player and start is allowed.
- [ ] Generated draft lineups with players but no submission still allow start.

### Edge cases

- [ ] Home empty, away populated; away empty, home populated; both empty each reject.
- [ ] A historical revision's players do not count when a later effective revision is empty.
- [ ] An invalidated revision does not count.
- [ ] A DRAFT opened above an operable submitted revision does not replace the submitted roster.

### Error paths

- [ ] Missing/duplicate team assignment and canceled/closed lifecycle checks retain their existing errors.
- [ ] Empty effective roster returns 409 `GAME_START_LINEUP_EMPTY` with an actionable Korean message and no state transition.
- [ ] UI blocks on roster lookup failure and exposes a retry-oriented error message; it does not treat missing data as an empty successful response.

### Mock data updates needed

- [ ] Unit and component fixtures include actual effective participants on both sides for allowed-start cases.
- [ ] Add a CI-only integration case for a one-sided empty current lineup; do not run it locally because it requires the integration database.

## Scope and ownership

### Owned files

- `apps/v1_api/src/games/games.service.ts`
- `apps/v1_api/src/games/games.service.spec.ts`
- `apps/v1_api/test/games/game-start-without-lineup.integration-spec.ts`
- `apps/v1_web/src/components/tournament-live/operate/operate-console.tsx`
- `apps/v1_web/src/components/tournament-live/operate/operate-console.test.tsx`
- `docs/api/domains/games.md`
- `.changeset/mdqa-175-lineup-start-guard.md`
- `.github/tasks/mdqa-175-lineup-start-guard.md`
- `/Users/sungjun/.cache/mdqa-loop/ticks/20261026-0907-fix175.md`

### Forbidden files/actions

- All files outside the owned list; Prisma schema/migrations/generation; shared frontend contracts; environment files; main/shared worktree; other worktrees; loop state/locks; tracker or PR writes; commit/push/PR; browser QA; local integration DB/tests.

## Acceptance Criteria

- [ ] Start guard reads the same effective lineup revision as the existing lineup display/result contract.
- [ ] Start and lineup writes remain serialized by their current game-row lock/transaction boundary.
- [ ] Server is authoritative; UI provides the same empty-side reason and fails closed if lineup data cannot be loaded.
- [ ] Targeted API unit and web component tests have captured RED then GREEN actual exits; integration test is added for CI and marked locally unverified.
- [ ] API domain contract and patch changeset are synchronized.
- [ ] No new TODO/FIXME/HACK/XXX markers; touched files pass diff check.
- [ ] Independent gpt-6-sol review is requested; no self-commit.

## Tech Debt Resolved

- Unify start eligibility with the existing effective-lineup revision rule instead of trusting team assignment alone.
- Remove or revise stale comments/tests that say empty effective rosters may start.

## Security Notes

- Authorization remains in the existing command boundary; this guard adds no role or identity exposure.
- The server checks the current lineup inside the serializable start transaction after the game-row lock. Existing roster writes take the same game-row lock.

## Risks & Dependencies

- The current effective-lineup helper intentionally prefers SUBMITTED/LOCKED when present, otherwise the latest DRAFT; preserve this behavior.
- Generated draft rosters must continue to permit start when their participant rows are non-empty.
- Alpha browser verification and dev PR workflow are root-owned follow-up steps.

## Ambiguity Log

| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-26 | Root | Should empty rosters be permitted for no-show/forfeit workflows? | Out of scope. Preserve the explicit core contract: regular start requires one effective participant on each side; do not add an alternate forfeit path. |

## Progress Snapshot

- 2026-10-26: Clean validation worktree at `d312dda13b523d57411c675113f4513c2fd89430`. Tests, task brief, and changeset were mechanically carried from the separate preparation worktree. The TEAM_MATCH empty-lineup component assertions produced actual RED (3 selected tests failed on the enabled start button, 108 skipped, exit 1), then passed after the UI guard and warning cleanup (final run: 3 passed, 108 skipped, exit 0 at 14:04:21). A first exploratory RED used legacy `TOURNAMENT_FIXTURE`; it was discarded after confirming current tournament/league commands use `TEAM_MATCH`. Server source and integration expectations are present but remain locally unverified; API CI/integration and independent review are required. The earlier preparation source remains preserved and is not validation evidence. No completion criteria are checked.
- 2026-10-26 review correction: independent Sol review found the newly introduced `useMemo` below loading/error/no-game returns and a result projection that included invalidated revisions. The component test now covers loading-to-loaded rerender; it reproduced the hook-order exception (1 failed, 111 skipped, exit 1) before correction. The calculation is a plain derivation before all early returns, and the selected UI regression set passes (5 passed, 107 skipped, exit 0 at 14:12:00). Result projection now filters `invalidatedAt: null`, matching start eligibility. The CI-only integration scenario now replaces the away team after a submitted lineup, invalidates the old submitted revision through the production helper, creates a populated new draft, starts and ends the game, and asserts the official result contains the replacement and host players but none from the old team. API unit/integration execution remains unverified locally due the shared Prisma-client compile baseline; current-head CI is required. No acceptance checkboxes are marked complete pending CI and independent re-review.
- 2026-10-26 final Sol follow-up: corrected the API contract wording to distinguish missing/duplicate/mismatched team assignment (`409 TOURNAMENT_MATCH_TEAMS_REQUIRED`) from an assigned side with an empty effective lineup (`409 GAME_START_LINEUP_EMPTY`). The UI fixture builder now preserves each input revision's `invalidatedAt` and gives invalidated rows no participants. Added a regression with an invalidated SUBMITTED revision and a populated current DRAFT; it asserts the console allows start based on the current draft. The requested focused serial UI run passed 6 selected tests, 107 skipped (exit 0 at 14:17:03), including loading transition, all three empty-side cases, valid one-sided submission, and invalidated-submitted/current-draft precedence. Preflight at 14:16: load averages 9.46/8.19/24.82; swap 8,807.5 MiB of 10,240 MiB; Node/browser count 93; Docker 29.8.2. Test PID 92619 exited and was absent; temporary dependency symlinks were removed and the process count returned to the same 93 baseline. `git diff --check` passed. API compile/integration remain CI-only and no completion checkbox is checked.
