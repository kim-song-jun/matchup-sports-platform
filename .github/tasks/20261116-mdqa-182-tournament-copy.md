# MD-QA #182: Tournament operation copy and awards

## Target / mode
Frontend v1, CODE. Report: https://teameet.jmandu.kr/issues/182/.

## Background
Four reported scenarios: staff role name mismatch; roster goalkeeper terminology; misleading deep-link message following result confirmation; empty third-place podium without third-place game. Read-only source investigation found inconsistent director role labels, a stale result-review deep link and unconditional empty podium. The reported obsolete goalkeeper wording was not found on current dev; verify before changes. Do not infer joint third place without data.

## Scope and boundaries
Use current v1 behavior and prior task 168 podium guidance. Keep unrelated shared API/types/hooks unchanged; no destructive data changes and no local web server.

## Acceptance Criteria
- [ ] Diagnose all four scenarios, preserve real review failure paths and accurate awards.
- [ ] Narrow regression checks and independent review at exact committed SHA.
- [ ] PR on dev, original tracker progress comment, actual Alpha evidence after deployment.

## Parallel Work Breakdown
- Result-review owner: role label and confirmation/deep-link UI; dedicated tests.
- Awards owner: podium display and tests, independent files.
- Root: contracts, serial validation, git, PR and Alpha QA.

## Risks and Dependencies
The success message must only appear on actual success. Do not invent rank data. Changes to shared contracts require a separate owner.

## Ambiguity Log
Report suggests joint third or hiding an empty position; task 168 says show only existing podium positions. Preserve actual backend ranking and hide absent positions.

## Progress Snapshot
- 2026-10-28: Claimed and confirmed assignee/in-progress. Dedicated worktree starts at origin/dev 392906709c15bf3e31d5b4099d8f203b032f39c5. Source findings await reproduction and tests; no Alpha fix verification.
- Alpha 392906709c15bf3e31d5b4099d8f203b032f39c5, public awards at 390x844, displayed an empty third-place podium for the reported tournament. Captured pre-fix evidence.
- Confirmed consumer RED for absent third-place podium and three result-review cases. Initial fix passed 58 tests; independent review found two query navigation regressions, confirmed RED and corrected, with 34 relevant tests GREEN. Independent diff re-review found no additional concrete defects. Post-deploy Alpha and exact committed-head verification pending.
- Current roster code uses the existing goalkeeper label; the report's obsolete wording was not found in source, and its Alpha scenario remains unverified.
