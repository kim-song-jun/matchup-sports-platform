# Mobile wrapping in admin image QA

## Scope
Frontend v1, CODE. Follow-up to .github/tasks/20261102-tournament-two-images.md and merged PR https://github.com/kim-song-jun/matchup-sports-platform/pull/2045. Independent Alpha evidence: https://github.com/kim-song-jun/matchup-sports-platform/pull/2045#issuecomment-6446632242.

## Findings
At 390x844, two Korean help strings in the admin image and visibility area break inside words. At 768 and 1440 screenshots no matching wrap was observed. Proposed fix must remain local, handle long unbroken text, and respect shared consumers.

## Acceptance Criteria
- [ ] Confirm current component contract, apply smallest safe correction with regression coverage.
- [ ] Independent immutable-head review and narrow tests; dev PR.
- [ ] After dev merge verify actual Alpha at 390, 768, and 1440 and record screenshots.

## Parallel Work Breakdown
- Frontend worker owns affected components and tests, no commit/push.
- Root verifies, reviews, and coordinates Git/PR.

## Risks and Dependencies
Shared components are also used in team matches and competition visibility. Avoid global token changes.

## Ambiguity Log
No new UX pattern requested; preserve existing layout and make Korean wrapping readable.

## Progress Snapshot
- 2026-10-28: Actual Alpha screenshots at 390/768/1440 captured, independently visually reviewed; 390 needs correction. Dedicated worktree created from origin/dev 392906709c15bf3e31d5b4099d8f203b032f39c5. Admin image persistence checks are partial and tracked in PR 2045 comment.
- Two focused style-contract tests failed before the fix and both component files now pass, 5/5 tests total. These jsdom tests do not prove actual browser layout; post-merge 390/768/1440 Alpha QA remains necessary.
- Independent review identified the first targeted text was not the actual screenshot source. The worker removed that unrelated change and added a RED consumer test for the actual tournament image switch description. The corrected two component tests now pass 2/2; diff re-review found no additional concrete defects. Visual Alpha confirmation is pending.
