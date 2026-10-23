# Task MD-QA 178: Public player records disclosure

Status: Review — revised-copy test passed; new-head CI and alpha visual acceptance pending
**Owner**: Frontend UI
**Created**: 2026-10-23 KST

## Context
The tournament awards page can show one player's public goal record while `hiddenByEligibility` is true because other records are hidden by identity-linking or consent eligibility. The component previously used this flag only when both public lists were empty, so the visible list could appear inconsistent with the awards totals.

## Goal
Show the existing eligibility explanation whenever records are hidden, including when public goal or assist rows remain visible, and name both identity linking and record-publication consent.

## Original Conditions (must all be satisfied)
- [x] Preserve server-provided player rows, values, ordering, and rank calculation.
- [x] Show an explicit disclosure for non-empty results when `hiddenByEligibility` is true.
- [x] Name both identity linking and public record consent as eligibility requirements.
- [x] Do not show the disclosure for non-empty results when `hiddenByEligibility` is false.
- [x] Preserve the existing empty, loading, and error states.
- [x] Record focused regression evidence for the revised copy.
- [ ] Hand off the updated diff for independent review and alpha visual verification.

## User Scenarios
### Public awards with partial eligibility
As a visitor viewing tournament awards, I want to know that only records meeting identity-linking and publication-consent eligibility appear in the rankings so that visible rows do not seem to contradict the award totals.

Steps:
1. Open tournament awards where at least one public goal or assist row exists and `hiddenByEligibility` is true.
2. Read the eligibility explanation above the ranking sections.
3. Confirm displayed players and numbers remain unchanged.

Expected result: The page explains that public rankings depend on player identity linking and public record consent.

## Test Scenarios
### Happy path
- [x] Hidden eligibility with a public goals row shows the complete identity-linking and consent explanation and preserves the row.
- [x] Hidden eligibility with a public assists row shows the same explanation and preserves the row.
- [x] Existing tie ranks and profile links remain intact.
### Edge cases
- [x] No hidden records means no partial disclosure.
- [x] Empty hidden and non-hidden states retain their existing copy.
### Error paths
- [x] Existing loading and error states remain intact.
### Mock data updates needed
- [x] No API or MSW contract changed; component tests use synthetic public rows.

## Parallel Work Breakdown
### Frontend
- [x] Restore the shared existing eligibility copy in the non-empty component path and assert the complete user-facing explanation.
### Sequential
- [ ] Independent review, exact-head CI, then alpha visual verification by the root task owner.

## Acceptance Criteria
- [x] Original conditions are satisfied in source and focused tests.
- [x] No score, rank, order, privacy gate, API contract, or server policy changed.
- [x] Existing design tokens and Korean 해요체 copy are used.
- [x] Revised copy passes the focused test on the current worktree diff based on head `f5b8ed36e4d0c3d5e5780d410d4f7ae18b926a20`.
- [ ] Independent review and alpha before/after at required viewports are recorded.

## Tech Debt Resolved
The eligibility disclosure no longer disappears when public rows coexist with hidden records, and it names both causes represented by the aggregate server flag.

## Security Notes
The UI renders only existing public rows and the aggregate eligibility flag. It does not infer hidden player identity or values and does not change privacy or consent policy.

## Risks & Dependencies
- Focused component tests verify the rendering contract; actual deployed appearance at 390, 768, and 1440 pixels remains an alpha QA dependency.
- Earlier exact-head CI run `39906532982` passed Gates/API/Web and independent Sol review on head `f5b8ed36e4d0c3d5e5780d410d4f7ae18b926a20`. These review-driven edits create a new uncommitted head; its CI and review are pending.
- The task-start base before the initial implementation was `b3cbb4b63cfaa385d7daea1ea16a0258a311901b`.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-23 | frontend-ui | Is a new product design needed for this notice? | No. This explicit MD-QA autofix restores the existing shared eligibility copy in the existing component pattern. No new layout, structure, or interaction is introduced. If product design beyond that restoration becomes necessary, stop for the user choice gate. |
| 2026-10-23 | independent review | Does the aggregate flag represent consent alone? | No. Existing empty-state copy and the server contract identify both identity linking and public record consent; reuse that shared copy. |

## Progress Snapshot
- Owned source/test remain `apps/v1_web/src/components/public-game-records/player-records-sections.tsx` and `.test.tsx`.
- No API, hook, shared type, or MSW contract was changed.
- Initial implementation RED: focused test had 2 failing regression cases / 7 passing, actual exit 1. Initial implementation GREEN: 9/9 passed, actual exit 0. Both were run on worktree base `b3cbb4b63cfaa385d7daea1ea16a0258a311901b`.
- Review of head `f5b8ed36e4d0c3d5e5780d410d4f7ae18b926a20`: CI run `39906532982` Gates/API/Web passed; independent Sol review returned findings addressed by the current uncommitted copy and task-doc edits. Do not treat that CI as validation of the new diff.
- Revised-copy focused test: `pnpm --filter v1_web exec vitest run src/components/public-game-records/player-records-sections.test.tsx --maxWorkers=1 --minWorkers=1` — 9/9 passed, actual exit 0; process PID 28330, PPID 65113, exited before cleanup check. Preflight: 12 cores, load `33.33 44.51 41.03`, swap `3589.69/5120 MB`, 63 node/browser-like processes, 10 Docker containers (other projects untouched). No test server was started.
- Full lint/typecheck, new-head CI, independent review of this follow-up diff, and alpha visual QA remain pending.
