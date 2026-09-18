# Task 159 — Friendly Team Match Player Records

## Scope

- Backend: `apps/v1_api` friendly `team-matches` result revision path
- Tests: team-match Game adapter integration coverage
- Docs: Game result contract and v1 team-match scenario ledger
- Out of scope: personal `matches`, league fixtures, tournaments, result-entry UI redesign

## Problem

Friendly team matches already project an official score into both teams' records, but the normal
host result screen only submits the host roster in `actualParticipants`. The approved opponent
roster is linked to real users, yet receives no `V1GameResultParticipant` rows, so those users do
not receive an appearance or result in public/user records.

## Contract

- A friendly team-match result revision uses the latest valid lineup revision independently for
  HOME and AWAY.
- Existing client-provided participant statistics remain authoritative.
- Any latest-lineup participant omitted by the client is appended with zero counting stats.
- Result rows continue to store `started=true` because the v1 lineup contract is
  "lineup = appeared participants".
- Tournament and league result derivation is unchanged.

## Acceptance Criteria

- [x] Given a matched friendly team match with linked HOME and AWAY roster participants,
      when the host creates a result revision containing only HOME statistics,
      then the stored revision contains both HOME and AWAY participants.
- [x] The supplied HOME statistics are preserved and the appended AWAY participant has zero
      goals/assists/fouls/cards while retaining its side and goalkeeper snapshot.
- [x] After the opponent approves the revision, both participant rows belong to the current
      official revision and are eligible for the existing user-record projection.
- [x] Duplicate/invalid submitted participants are still rejected by the existing invariants.
- [x] Relevant API and scenario documentation describes the friendly-only hydration behavior.

## Progress Snapshot

- 2026-09-18: Confirmed the gap on `origin/dev` (`e724a002`): team facts are projected for both
  sides, but the ordinary result screen submits only the host roster.
- 2026-09-18: Implementation started in isolated worktree
  `output/worktrees/team-match-friendly-records` on branch `fix/team-match-friendly-records`.
- 2026-09-18: Friendly-only server hydration implemented. League and tournament competition
  contexts bypass it; supplied statistics remain authoritative and only omitted latest-roster
  rows receive zero counting stats.
- 2026-09-18: Ran the complete friendly flow against the local v1 API and game-operations worker.
  The official projection produced a `1W 0D 0L, 2:1` team record and the linked host player
  received `1 appearance / 1 goal`; the guest remained team-only as designed.
- 2026-09-18: Captured all 16 route/state screens at mobile and desktop viewports and documented
  their inputs, displayed information, record semantics, privacy, and async projection behavior.

## Validation

- PASS: `pnpm --filter v1_api exec jest --selectProjects unit --runInBand
  src/games/core/friendly-team-match-result-participants.spec.ts
  src/games/core/latest-lineup-participants.spec.ts` — 2 suites / 10 tests.
- PASS: `pnpm --filter v1_api exec tsc --noEmit` after `pnpm v1:db:generate`.
- PASS: `git diff --check` and touched-path tech-debt grep (no new markers).
- NOTE: `team-match-game-adapter.integration-spec.ts` is excluded by the repository Jest config;
  it was still extended as executable adapter contract coverage.
- PASS: real local v1 API flow from application through opponent approval and async official-fact
  projection; both team and owner-visible user records were verified.
- PASS: 32 headed Chromium captures (16 screens × mobile/desktop), all HTTP 200 with zero page
  errors. Known `useShellOverride` render-time React warnings are recorded in the screenshot doc.
