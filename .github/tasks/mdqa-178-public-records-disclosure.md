# Task MD-QA 178: Public player records disclosure

Status: Review — focused regression pending alpha visual acceptance
**Owner**: Frontend UI
**Created**: 2026-10-23 KST

## Context
The tournament awards page can show one player's public goal record while `hiddenByEligibility` is true because other records are hidden by identity or consent eligibility. The current component uses this flag only when both public lists are empty, so the visible list can appear inconsistent with the awards totals.

## Goal
Show the existing public-consent disclosure whenever records are hidden by eligibility, including when public goal or assist rows remain visible.

## Original Conditions (must all be satisfied)
- [x] Preserve server-provided player rows, values, ordering, and rank calculation.
- [x] Show an explicit disclosure for non-empty results when `hiddenByEligibility` is true.
- [x] Do not show the disclosure for non-empty results when `hiddenByEligibility` is false.
- [x] Preserve the existing empty, loading, and error states.
- [ ] Record focused regression evidence and hand off for independent review and alpha visual verification.

## User Scenarios
### Public awards with partial eligibility
As a visitor viewing tournament awards, I want to know that only consenting players appear in the rankings so that visible rows do not seem to contradict the award totals.

Steps:
1. Open tournament awards where at least one public goal or assist row exists and `hiddenByEligibility` is true.
2. Read the disclosure above the ranking sections.
3. Confirm displayed players and numbers remain unchanged.

Expected result: The page explains that only players who consented to public record display are shown.

## Test Scenarios
### Happy path
- [x] Hidden eligibility with a public goals row shows the disclosure and preserves the row.
- [x] Hidden eligibility with a public assists row shows the disclosure and preserves the row.
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
- [x] Extend the existing player records section and its component regression tests.
### Sequential
- [ ] Independent review, then alpha visual verification by the root task owner.

## Acceptance Criteria
- [x] Original conditions are satisfied in source and focused tests.
- [x] No score, rank, order, privacy gate, API contract, or server policy changed.
- [x] Existing design tokens and Korean 해요체 copy are used.
- [ ] Focused test result is recorded after the implementation.
- [ ] Independent review and alpha before/after at required viewports are recorded.

## Tech Debt Resolved
The eligibility disclosure no longer disappears when public rows coexist with hidden records.

## Security Notes
The UI renders only the existing public rows and the aggregate eligibility flag. It does not infer hidden player identity or values and does not change privacy or consent policy.

## Risks & Dependencies
- A focused component test verifies the rendering contract; actual deployed appearance at 390, 768, and 1440 pixels remains an alpha QA dependency.
- Base SHA: `b3cbb4b63cfaa385d7daea1ea16a0258a311901b`.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-23 | frontend-ui | Does adding this disclosure need a new layout choice? | No new layout is introduced; this restores an existing eligibility disclosure that was omitted in the non-empty rendering path, per the task scope. |

## Progress Snapshot
- Implementation and focused test are limited to `apps/v1_web/src/components/public-game-records/player-records-sections.tsx` and `.test.tsx`.
- No API, hook, shared type, or MSW contract was changed.
- Test source: focused consumer component test on worktree base `b3cbb4b63cfaa385d7daea1ea16a0258a311901b` plus the uncommitted patch. Initial clean-selector RED: 2 failed / 7 passed, actual exit 1. After the rendering fix, the same command passed 9/9, actual exit 0: `pnpm --filter v1_web exec vitest run src/components/public-game-records/player-records-sections.test.tsx --maxWorkers=1 --minWorkers=1`.
- Coverage includes hidden eligibility with non-empty goal and assist rows, no-hidden non-empty rows, existing empty hidden/no-hidden copy, loading, error, tie ranks and profile links. Full lint/typecheck, alpha visual QA and independent review remain unrun.
