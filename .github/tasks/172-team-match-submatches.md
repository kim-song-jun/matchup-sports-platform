# Task 172 — Team match submatches

## Goal

Allow a friendly team match result to contain optional ordered submatches while keeping the existing top scoreboard as the single official aggregate.

## Scope

- Backend: extend the team-match result score JSON contract with optional submatches and validate the aggregate server-side.
- Frontend: keep direct score entry when there are no submatches; when submatches exist, derive and display the top score from their sum.
- Approval/history: show the same submatch breakdown to the submitting and approving teams.
- Records: continue producing one official game result, one team result, and aggregate participant statistics.
- Docs/QA: sync API and scenario docs, add focused tests, and capture desktop/tablet/mobile evidence.

## Acceptance Criteria

- [x] A host can add, rename, score, preserve creation order, and remove multiple submatches before submission.
- [x] With zero submatches, the existing direct home/away score flow remains unchanged.
- [x] With one or more submatches, the top score is read-only and equals the sum of every submitted submatch.
- [x] The API rejects a submatch payload whose aggregate differs from the top score.
- [x] A correction request rehydrates every saved submatch without data loss.
- [x] Submitted, official, and approval views show the ordered breakdown.
- [x] Team and participant records are projected once from the aggregate result.
- [x] Desktop, tablet, and mobile headed-browser screenshots cover editing and the submitted breakdown.

## Ambiguity Log

- Submatches are score breakdowns inside one official game result. They do not create additional `V1Game`, schedule, team win/loss, or appearance records.
- Individual scorer/card/MVP statistics remain game-level aggregates in this increment. The stored submatch score contract can later be extended with per-submatch event attribution without changing the official team result boundary.

## Progress Snapshot

- 2026-09-22: Started from `origin/dev` at `83b3c8893`. Current schema is `V1TeamMatch 1:1 V1Game`; result scores are immutable JSON revisions. Chosen design extends that JSON contract instead of creating extra official games.
- 2026-09-22: Implemented optional `score.subMatches` without a schema migration. API DTO and invariant tests pass (22/22); result UI tests pass (48/48), including aggregate payload, correction rehydration, approval, and history rendering.
- 2026-09-22: Headed Playwright passed 2/2 on Pixel 5 and Desktop Chrome. Desktop, tablet, and mobile editing/submitted screenshots are in `docs/screenshots/task172-team-match-submatches/`; console errors, failed API requests, and horizontal overflow were all zero.
