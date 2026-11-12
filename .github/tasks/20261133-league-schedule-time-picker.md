# Regular league registered time choices
Status: In Progress
Owner: Codex
Created: 2026-11-13

## Context
User requested the recently added time choice behavior on regular leagues, matching Task 20261132 / PR #2348.
## Goal
Persist time choices, assign games and select existing times in league fixture editing through real league contracts.
## Original Conditions
- [x] Reuse time choice persistence and combine presets with actual fixture starts.
- [x] Add time assignment and the shared selector to league fixtures; keep manual datetime entry.
- [x] Preserve team, title, court and place by sending only startsAt.
- [x] Support collapse/expand, explicit errors and league permissions.
## User Scenarios
Open time assignment -> register time -> choose game -> confirm board/list -> edit using registered or manual time.
## Test Scenarios
League kind filter, admin/support/director scope, duplicate instant, existing tournament regression, time-only PATCH, failed save and shared selector.
## Parallel Work Breakdown
No agents. Sequential API -> shared hooks/picker -> league UI -> checks -> docs.
Owned: schedule-times service/controller/module, shared time hook/picker/model, league assignment/modal/page and related tests/docs/changeset.
Forbidden: unrelated root WIP, schema/migrations, game results, standings, production promotion.
## Acceptance Criteria
- [x] User explicitly chose matching the existing UI; reuse that direction without asking for a new design choice.
- [x] Web 12 (7 league + 5 existing tournament) and API 12 tests passed.
- [x] Both app type checks, Web pattern check, final diff and debt checks.
- [ ] Alpha screenshot/console/network evidence at 390/768/1440.
## Tech Debt Resolved
Shared time service and picker reused; explicit surface-specific cache and permission boundaries; no separate schedule copy.
## Security Notes
League uses platform getActiveAdmin/getMutationAdmin, with regular_league kind gate. Assigned tournament directors retain only tournament access. UUID/DTO checks and audit preserved.
## Risks & Dependencies
League startsAt remains mandatory, so null/unset is unavailable. Existing PATCH status/date/duration checks remain authoritative. Additive existing time storage needs no migration. Alpha after evidence requires deployment; Docker unavailable for integration.
## Ambiguity Log
Time choice identified as registered start times in PR #2348, not period duration. Scope is time assignment/selection; no new court feature.
## Progress Snapshot
Branch feat/league-schedule-time-picker based on origin/dev c339f1ee9 in isolated _worktrees/league-schedule-time-picker. Root WIP untouched. Dependencies installed with frozen lockfile. API 12 / Web 12 regression cases passed. API tsc spec and Web tsc passed. Web pattern check passed after adding installed Git Unix tools to process PATH. git diff --check passed; no new debt markers. User explicitly requested alpha deployment. Preparing a dev-target PR and rollout; production is out of scope. Alpha 0/10 flows and 0/3 viewports: after screenshots/console/network blocked by undeployed branch. DB integration not executed because Docker is unavailable. All source/import dependencies are tracked or included in the explicit untracked delivery scope.

## Deployment verification
PR #2353 targets dev. Initial CI API/Gates/security passed; Web found closed sheet router use and missing time-query test context/fixture. Corrected sheet mounting and synchronized existing field/mobile/page test boundaries. RED: initial CI 111 failed. GREEN: affected 4 files / 136 tests passed locally. Before alpha 1440/768/390 captured with no console/network errors. New CI and alpha rollout pending.

Pre-deploy review: unset place placeholders must not warn as an actual court collision. Reused isUnsetPlace and added both placeholder/real-court cases; new league suite 9/9 passed.
