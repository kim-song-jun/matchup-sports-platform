# Task 148 — Allow tournament lineup-size changes before kickoff

## Scope

- Backend: `apps/v1_api/src/tournaments/competition-config/tournament-competition-config.ts`
- Tests: focused competition-config service coverage
- No schema or migration change

## Problem

An admin cannot change a tournament's lineup size after creating group fixtures, even when no
match has started and no lineup/result/event exists. Empty group-standing rows are currently
treated as recorded results, and the linked `V1Game` rows keep their old pinned competition
config when the tournament/fixtures change.

## Acceptance Criteria

- [x] Empty zero-value standings do not block a competition-config change.
- [x] A scheduled tournament game with no lineup, event, or result revision is repointed with its fixture.
- [x] Completed fixtures or games with lineup/event/result activity still require explicit recalculation confirmation.
- [x] Existing admin update behavior returns a successful lineup-size change for a bracket-only tournament.
- [x] Narrow regression tests pass.

## Progress Snapshot

- `TournamentCompetitionConfig.change()` now distinguishes empty standings from recorded data.
- Untouched scheduled `V1Game` rows are repointed in the same transaction as their fixtures.
- Focused Jest: 3/3 passed.
- API TypeScript `tsc --noEmit`: passed.
- DB integration test was not run because the local Docker engine is unavailable in WSL.
