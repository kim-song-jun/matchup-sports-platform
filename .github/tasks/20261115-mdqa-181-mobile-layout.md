# MD-QA #181: Mobile tournament screens

## Target / mode
Frontend v1, CODE. Report: https://teameet.jmandu.kr/issues/181/.

## Background and current evidence
Four 390px report scenarios: field console foul team names, admin match schedule table, public match scoreboard team-name wrapping, and staff field card alignment. Alpha 392906709c15bf3e31d5b4099d8f203b032f39c5 with authenticated E2E administrator at 390x844 reproduces the schedule table: 1135px table inside 390px horizontal scroll area with no clear hint. Other report scenarios require individual verification. Screenshot: tmp/qa/mdqa-assigned-monitor/2026-10-28-user-login-session/alpha-mdqa181-bracket-before-390.png in the original checkout.

## Scope / boundaries
Smallest v1 UI changes with existing design tokens. No API/types/hooks, unrelated files, local Next server or edits in another worktree. The schedule table may be near #177 work; avoid its owned bracket card/summary files.

## Acceptance Criteria
- [ ] Diagnose all four report scenarios against v1 and preserve real actions and data.
- [ ] Demonstrate narrow regression checks and independent review on exact commit.
- [ ] Verify responsive visual behavior on Alpha after dev merge, record persona/viewport/SHA and screenshots.
- [ ] Post accurate PR and verification status to the original report.

## Parallel Work Breakdown
- Worker: isolated frontend fix and targeted tests for owned paths, no self-commit or high-load checks.
- Root: evidence, serial validation, integration, git and PR.
- Independent reviewer: adversarial review on immutable head.

## Risks & Dependencies
Existing #177 PR modifies bracket card, helpers and tab. Avoid overlapping ownership and preserve actions. Do not label pre-deployment test results as Alpha pass.

## Ambiguity Log
No product policy decision identified; choose clear mobile presentation without hiding functionality.

## Progress Snapshot
- 2026-10-28: Claimed in UI, confirmed assignee and in-progress. Existing PR/task overlap researched; #177 is separate. Dedicated worktree based on current origin/dev 392906709c15bf3e31d5b4099d8f203b032f39c5.
- Actual Alpha 390px schedule table reproduction captured as above; remaining three scenarios not yet verified.
- Focused pre-commit tests: 4 files, 110/110 GREEN. Schedule mobile-card consumer test was RED before implementation. Independent diff review found no additional concrete defects; exact committed-head review still pending.
- The schedule table and scoreboard were observed on Alpha at 390x844; not all four original scenarios have a fresh baseline. No deployed fix or post-merge Alpha PASS is claimed.
