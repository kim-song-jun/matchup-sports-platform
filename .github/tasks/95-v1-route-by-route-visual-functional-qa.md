# 95. V1 Route-By-Route Visual And Functional QA

Status: Passed
Owner: Codex
Scope: `apps/v1_web`, `scripts/qa`, `docs/scenarios`, `evidence/route-by-route-qa-20260605`, `output/playwright/visual-audit/route-by-route-qa-20260605`

## Goal

Follow every current v1 route one by one, verify visual quality and functional affordances through real browser scenarios, and fix discovered problems with TDD RED -> GREEN before production changes.

## User Feedback

- Previous broad visual QA is not enough.
- The user wants route-by-route visual checks and function-by-function checks.
- Desktop must feel modern and Toss-like while expanding from mobile-first layouts.

## Source Of Truth

- Project rules: `AGENTS.md`, `.codex/AGENTS.md`, `.codex/frontend-rules.md`, `.codex/design-rules.md`
- Design source: `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`
- Scoped Open Design reference: `docs/reference/open-design/**`
- Route matrix: `docs/scenarios/13-v1-open-design-recovery-from-zero.md`
- Runtime target: `apps/v1_web`

## Route Families

- `community-admin-utility`: 6 routes
- `public-auth-discovery`: 28 routes
- `personal-match`: 15 routes
- `teams-account-reviews`: 24 routes
- `team-match`: 14 routes

Current implemented route count: 87.

## Acceptance Criteria

- [x] A route-by-route audit artifact exists with one row per current v1 route, not just aggregate pass/fail.
- [x] Each route row records visual findings, functional affordances, browser action log, screenshots, viewport coverage, and pass/fail reason.
- [x] The audit harness has RED -> GREEN tests before script changes.
- [x] Each production UI fix has its own RED -> GREEN test before code changes.
- [x] Manual QA uses real browser execution for user-facing criteria and records artifact paths plus cleanup receipts.
- [x] All blocking findings found during route walkthrough are fixed or explicitly recorded as v1-contract unsupported.
- [x] Final verification includes targeted tests, `v1_web` test/build/type checks, route-by-route browser evidence, and reviewer approval.

## Initial Success Criteria

### C001 Route Audit Harness

- Automated test: `scripts/qa/v1-route-walkthrough.test.mjs`, test id `Given route matrix rows When walkthrough targets are built Then every current v1 route receives visual and function checks`.
- RED evidence: `evidence/route-by-route-qa-20260605/red-green/route-walkthrough-harness.RED.txt`.
- GREEN evidence: `evidence/route-by-route-qa-20260605/red-green/route-walkthrough-harness.GREEN.txt`.
- Manual QA channel: Browser use.
- Scenario: run `node scripts/qa/v1-route-walkthrough.mjs --base-url http://localhost:3013 --matrix docs/scenarios/13-v1-open-design-recovery-from-zero.md --routes /team-matches,/matches,/teams --viewports 390x844,1440x900 --out output/playwright/visual-audit/route-by-route-qa-20260605/harness-smoke --json evidence/route-by-route-qa-20260605/harness-smoke.json`; PASS iff all 3 routes x 2 viewports have screenshots, action logs, and no missing required check fields.
- Cleanup: Playwright browser closed by script; no server spawned by this criterion.

### C002 First Family Walkthrough

- Automated test: first blocking production finding will create or update the narrowest relevant `*.open-design.test.tsx` before the production fix.
- RED evidence: `evidence/route-by-route-qa-20260605/red-green/<family>-<finding>.RED.txt`.
- GREEN evidence: `evidence/route-by-route-qa-20260605/red-green/<family>-<finding>.GREEN.txt`.
- Manual QA channel: Browser use.
- Scenario: run route walkthrough for the selected first family at `390x844`, `1440x900`, and `1920x1080`; PASS iff each route has screenshot/action log and every blocking issue is either fixed or recorded as unsupported by v1 contract.
- Cleanup: Playwright browser closed by script; no QA-spawned server remains.

### C003 Adjacent Regression

- Automated test: `corepack pnpm --filter v1_web test` plus targeted route-family test.
- RED evidence: from C002 for any production bug; if no production bug in a family, record no-code-change exemption with route walkthrough evidence.
- GREEN evidence: `evidence/route-by-route-qa-20260605/v1-web-test.<family>.txt`.
- Manual QA channel: Browser use.
- Scenario: rerun route walkthrough for the previously completed family plus the newly fixed family; PASS iff prior family remains pass and no desktop/mobile chrome regression appears.
- Cleanup: Playwright browser closed by script; no QA-spawned server remains.

## Execution Notes

- Do not treat Task 94 broad screenshots as completion evidence for this task.
- Route walkthrough evidence may reuse the running v1 dev server at `http://localhost:3013`, but each browser context must be closed and recorded.
- Do not create runtime routes for design-only Open Design pages.
- Do not mark unsupported flows as successful actions.

## Evidence Ledger

- Runtime notepad: `.omo/ultrawork/route-by-route-qa-20260605/notepad.md`

## Progress Snapshot

- [x] Skills surveyed.
- [x] Existing route count and family split identified.
- [x] Plan agent route order integrated.
- [x] C001 RED captured.
- [x] C001 GREEN captured.
- [x] C001 browser smoke captured.
- [x] First family walkthrough started.
- [x] First increment `/team-matches`, `/team-matches/[id]`, `/team-matches/new` captured.
- [x] First increment blocking desktop visual findings fixed with RED -> GREEN evidence.
- [x] `team-match` family 14/14 routes captured and browser-gated.
- [x] Harness nested protected route auth classification fixed with RED -> GREEN evidence.
- [x] Harness dynamic route capture IDs switched from static fixture IDs to live v1 seed IDs.
- [x] Full `team-match` family captured route-by-route across 3 viewports.
- [x] `personal-match` first increment `/matches/[id]/edit`, `/matches/[id]`, `/matches/empty` captured and fixed with RED -> GREEN evidence.
- [x] Full `personal-match` family captured route-by-route across 3 viewports.
- [x] Personal-match filter/create/edit/complete desktop lane and completion CTA honesty findings fixed with RED -> GREEN evidence.
- [x] Full `teams-account-reviews` family captured route-by-route across 3 viewports.
- [x] Account/team utility desktop lane findings fixed with RED -> GREEN evidence.
- [x] `/my/teams/members` alias route and walkthrough redirect/hydration timing fixed with RED -> GREEN evidence.
- [x] Full `community-admin-utility` family captured route-by-route across 3 viewports.
- [x] `/chat/[id]` live chat-room capture and `/notifications/read` alias findings fixed with RED -> GREEN evidence.
- [x] Full `public-auth-discovery` family captured route-by-route across 3 viewports.
- [x] `/notices/[id]` live notice capture and desktop auth-frame/lane findings fixed with RED -> GREEN evidence.
- [x] Final focused contracts, `v1_web` tests, and `v1_web` build passed.
- [x] Scenario/status docs synced with final Task 95 route-by-route evidence.
- [x] Post-review functional probe and team-match completion honesty blockers fixed with RED -> GREEN evidence.
- [x] Live edit topbar backHref blockers fixed for personal/team match edit routes with RED -> GREEN evidence.
- [x] Desktop app frame cap, fixed CTA alignment, and Next dev indicator visual QA blockers fixed with RED -> GREEN evidence.
- [x] Final sequential all-family route sweep captured 87 routes x 3 viewports with 0 failures after review fixes.
- [x] Reviewer approval gate completed.

## C001 Evidence

- RED target builder: `evidence/route-by-route-qa-20260605/red-green/route-walkthrough-harness.RED.txt`.
- GREEN target builder: `evidence/route-by-route-qa-20260605/red-green/route-walkthrough-harness.GREEN.txt`.
- RED CLI import/list: `evidence/route-by-route-qa-20260605/red-green/route-walkthrough-cli-import.RED.txt`.
- GREEN CLI/import/list: `evidence/route-by-route-qa-20260605/red-green/route-walkthrough-cli-import.GREEN.txt`.
- Browser smoke command output: `evidence/route-by-route-qa-20260605/harness-smoke.txt`.
- Browser smoke JSON: `evidence/route-by-route-qa-20260605/harness-smoke.json`.
- Browser smoke screenshots: `output/playwright/visual-audit/route-by-route-qa-20260605/harness-smoke/`.
- Cleanup receipt: Playwright browser closed by script; no QA-specific server spawned; no `v1-route-walkthrough` process remains.

## C002 Evidence - Team Match First Increment

Routes:

- `/team-matches`
- `/team-matches/[id]` captured as `/team-matches/team-match-1`
- `/team-matches/new`

Findings fixed:

- `/team-matches` desktop list cards used a poster-like VS area and then over-corrected into truncated team names. Fixed by changing the card DOM to a compact scan-card structure and tuning desktop scoreboard columns so team names are readable at 1440 and 1920.
- `/team-matches/new` desktop form content and CTA stretched across the app frame. Fixed by adding a constrained create-page desktop lane and matching CTA row.

RED/GREEN:

- Card density RED: `evidence/route-by-route-qa-20260605/red-green/team-match-card-density.RED.txt`
- Card density final GREEN: `evidence/route-by-route-qa-20260605/red-green/team-match-card-density.GREEN3.txt`
- Create lane RED: `evidence/route-by-route-qa-20260605/red-green/team-match-create-lane.RED.txt`
- Create lane GREEN: `evidence/route-by-route-qa-20260605/red-green/team-match-create-lane.GREEN.txt`

Browser QA:

- Final command output: `evidence/route-by-route-qa-20260605/team-match-first.final2.txt`
- Final JSON: `evidence/route-by-route-qa-20260605/team-match-first.final2.json`
- Final screenshots: `output/playwright/visual-audit/route-by-route-qa-20260605/team-match-first-final2/`
- Result: 3 routes x 3 viewports, failures 0, horizontal overflow 0, text clipping 0, desktop nav present only on desktop viewports, bottom nav absent on desktop viewports.
- Manual visual inspection covered list desktop `1440x900` and `1920x1080`, list mobile `390x844`, detail desktop/mobile, create desktop/mobile.
- Cleanup receipt: Playwright browser closed by script; no QA-specific server spawned; no `v1-route-walkthrough` process remains. Existing Playwright MCP browser remains unrelated to the harness run.

## C002 Evidence - Team Match Family

Routes covered: all 14 `team-match` routes:

- `/team-matches/[id]/edit`
- `/team-matches/[id]`
- `/team-matches/empty`
- `/team-matches/error`
- `/team-matches/filter`
- `/team-matches/new/complete`
- `/team-matches/new/condition`
- `/team-matches/new/confirm`
- `/team-matches/new/info`
- `/team-matches/new`
- `/team-matches/new/place-time`
- `/team-matches/new/sport`
- `/team-matches/new/team`
- `/team-matches`

Additional findings fixed:

- `/team-matches/filter` desktop filter content and CTA stretched across the app frame. Fixed by adding a team-match filter desktop lane.
- `/team-matches/empty` had no recovery action and state/error cards were too wide on desktop. Fixed by adding state lane and `필터 초기화` action.
- `/team-matches/new/complete` used full-width completion cards on desktop. Fixed by applying the create desktop lane to completion content.
- `/team-matches/[id]/edit` had a full-width secondary cancel button in the fixed CTA. Fixed by constraining the cancel button to the create CTA lane.
- Post-review goal verification found the route walker did not record explicit function-probe outcomes and `/team-matches/new/complete` still presented future share actions as active-looking affordances in stale evidence. Fixed by adding route-owned trial-click/function-probe results to every viewport row and changing completion share options to preparation-state copy with only a disabled `공유 준비 중` CTA.

RED/GREEN:

- Filter lane RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/team-match-filter-lane.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/team-match-filter-lane.GREEN.txt`
- Empty state RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/team-match-empty-state.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/team-match-empty-state.GREEN.txt`
- Complete lane RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/team-match-complete-lane.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/team-match-complete-lane.GREEN.txt`
- Edit cancel lane RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/team-match-edit-cancel-lane.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/team-match-edit-cancel-lane.GREEN2.txt`
- Functional probe RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/route-walkthrough-functional-probes.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/route-walkthrough-functional-probes.GREEN.txt`
- Complete honesty RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/team-match-complete-honesty.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/team-match-complete-honesty.GREEN.txt`
- Family targeted GREEN: `evidence/route-by-route-qa-20260605/red-green/team-match-open-design.FAMILY-GREEN.txt`
- Harness targeted GREEN: `evidence/route-by-route-qa-20260605/red-green/route-walkthrough-harness.FAMILY-GREEN.txt`

Browser QA:

- State routes final JSON: `evidence/route-by-route-qa-20260605/team-match-states.final2.json`
- Create steps A authenticated JSON: `evidence/route-by-route-qa-20260605/team-match-create-steps-a.auth.json`
- Create steps B final JSON: `evidence/route-by-route-qa-20260605/team-match-create-steps-b.final2.json`
- Edit final JSON: `evidence/route-by-route-qa-20260605/team-match-edit.final.json`
- Full family gate JSON: `evidence/route-by-route-qa-20260605/team-match-family.final-retry.json`
- Full family screenshots: `output/playwright/visual-audit/route-by-route-qa-20260605/team-match-family-final-retry/`
- Post-review completion functional rerun JSON: `evidence/route-by-route-qa-20260605/team-match-complete-final-functional.json`
- Post-review completion functional screenshots: `output/playwright/visual-audit/route-by-route-qa-20260605/team-match-complete-final-functional/`
- Full family result: 14 routes x 3 viewports, failures 0, text clipping 0, horizontal overflow false, expected desktop/mobile chrome state.
- Completion functional rerun result: `/team-matches/new/complete` x 3 viewports, failures 0, function-probe results recorded, stale `상세 보기` link absent, `팀 채팅에 공유` active action absent, disabled `공유 준비 중` CTA present.
- Invalidated evidence: `evidence/route-by-route-qa-20260605/team-match-create-steps-a.json` was a pre-auth capture and is not used as pass evidence.

Automated QA:

- `corepack pnpm --filter v1_web test`: `evidence/route-by-route-qa-20260605/v1-web-test.team-match-family.txt`, 16 files / 26 tests passed.
- `mcp__lsp.diagnostics` on `apps/v1_web/src/components/team-matches/team-matches-page.tsx`: no diagnostics.
- CSS LSP note: Biome LSP is configured but not installed in this environment; CSS was verified through browser screenshots and Vitest.

Cleanup receipt:

- Playwright browser closed by script; no `v1-route-walkthrough` or `team-match-family` process remains.
- Existing Playwright MCP browser process remains unrelated to the harness runs.

## C002 Evidence - Team Match Family Completion

Routes:

- `/team-matches`
- `/team-matches/[id]` captured as `/team-matches/00000000-0000-4000-8000-000000000306`
- `/team-matches/[id]/edit` captured as `/team-matches/00000000-0000-4000-8000-000000000306/edit`
- `/team-matches/empty`
- `/team-matches/error`
- `/team-matches/filter`
- `/team-matches/new`
- `/team-matches/new/team`
- `/team-matches/new/sport`
- `/team-matches/new/info`
- `/team-matches/new/condition`
- `/team-matches/new/place-time`
- `/team-matches/new/confirm`
- `/team-matches/new/complete`

Findings fixed:

- Nested protected routes such as `/team-matches/new/team` were classified as public, so the walkthrough captured guest login/blank desktop states instead of the authenticated form. Fixed by marking nested create and onboarding routes as authenticated.
- Dynamic route capture used static fixture IDs such as `team-match-1`, causing live API-backed edit/detail captures to silently fall back or show unavailable data. Fixed by mapping dynamic match/team/team-match routes to live v1 seed IDs.
- Review gate found `/team-matches/new/complete` still had active-sounding share option rows. Fixed by replacing those rows with explicit `준비 중` labels and disabled/share-pending copy, while keeping the only live route action as `목록 보기`.

RED/GREEN:

- Nested auth RED: `evidence/route-by-route-qa-20260605/red-green/team-match-create-step-auth.RED.txt`
- Nested auth GREEN: `evidence/route-by-route-qa-20260605/red-green/team-match-create-step-auth.GREEN.txt`
- Dynamic live capture RED: `evidence/route-by-route-qa-20260605/red-green/dynamic-live-capture-route.RED.txt`
- Dynamic live capture GREEN: `evidence/route-by-route-qa-20260605/red-green/dynamic-live-capture-route.GREEN.txt`
- Complete share honesty RED: `evidence/route-by-route-qa-20260605/red-green/team-match-complete-share-honesty.RED.txt`
- Complete share honesty GREEN: `evidence/route-by-route-qa-20260605/red-green/team-match-complete-share-honesty.GREEN.txt`
- Final harness GREEN: `evidence/route-by-route-qa-20260605/red-green/team-match-harness-final.GREEN.txt`

Browser QA:

- Final command output: `evidence/route-by-route-qa-20260605/team-match-family-final.txt`
- Final JSON: `evidence/route-by-route-qa-20260605/team-match-family-final.json`
- Final screenshots: `output/playwright/visual-audit/route-by-route-qa-20260605/team-match-family-final/`
- Review-fix rerun command output: `evidence/route-by-route-qa-20260605/team-match-family-after-review.txt`
- Review-fix rerun JSON: `evidence/route-by-route-qa-20260605/team-match-family-after-review.json`
- Review-fix rerun screenshots: `output/playwright/visual-audit/route-by-route-qa-20260605/team-match-family-after-review/`
- Debug artifact for stale fixture ID: `evidence/route-by-route-qa-20260605/debug-team-match-edit-state.json`
- Result: 14 routes x 3 viewports, failures 0, horizontal overflow 0, dead links 0, text clipping 0.
- Manual visual inspection covered final list, live detail, live edit, empty/error/filter states, and authenticated create steps on desktop; create step mobile was spot-checked after auth correction.
- Functional affordance inspection confirmed live edit save/cancel buttons enabled against the 200 edit endpoint for `00000000-0000-4000-8000-000000000306`.
- Adjacent regression: `evidence/route-by-route-qa-20260605/v1-web-test.team-match-family.txt` (`v1_web` Vitest: 16 files, 26 tests passed).
- Cleanup receipt: Playwright browser closed by script; QA-only leftover `v1-route-walkthrough` PID `86083` was killed; follow-up `pgrep` found no `v1-route-walkthrough` process. Existing dev server remains for user inspection.

## C002 Evidence - Personal Match First Increment

Routes:

- `/matches/[id]/edit` captured as `/matches/00000000-0000-4000-8000-000000000201/edit`
- `/matches/[id]` captured as `/matches/00000000-0000-4000-8000-000000000201`
- `/matches/empty`

Findings fixed:

- `/matches/[id]` desktop detail was centered in a narrow mobile-like lane and the fixed CTA stretched across the app frame. Fixed by adding a desktop detail stage and centering the fixed CTA content lane.
- `/matches/[id]/edit` desktop edit CTA lacked the personal-match lane/cancel-button contract. Fixed by exposing personal match create lane, CTA row, and cancel-button classes that mirror the established team-match pattern.
- `/matches/empty` had no explicit recovery action. Fixed by adding a desktop state lane and `필터 초기화` action back to `/matches`.

RED/GREEN:

- Layout/action RED: `evidence/route-by-route-qa-20260605/red-green/personal-match-first-layout.RED.txt`
- Layout/action GREEN: `evidence/route-by-route-qa-20260605/red-green/personal-match-first-layout.GREEN3.txt`
- Harness regression GREEN: `evidence/route-by-route-qa-20260605/red-green/route-walkthrough-harness.personal-match-first.GREEN.txt`

Browser QA:

- Initial JSON: `evidence/route-by-route-qa-20260605/personal-match-first.json`
- Final JSON: `evidence/route-by-route-qa-20260605/personal-match-first-final.json`
- Final screenshots: `output/playwright/visual-audit/route-by-route-qa-20260605/personal-match-first-final/`
- Result: 3 routes x 3 viewports, failures 0, horizontal overflow false, text clipping 0. Empty state now exposes `필터 초기화`; detail desktop uses the wider stage; edit CTA is centered to the form lane.
- LSP diagnostics on `apps/v1_web/src/components/matches/matches-page.tsx` and `apps/v1_web/src/components/matches/matches.open-design.test.tsx`: no diagnostics.
- Cleanup receipt: Playwright browser closed by script; follow-up `pgrep` found no `v1-route-walkthrough` or `personal-match-first` process.

## C002 Evidence - Personal Match Family Completion

Routes:

- `/matches`
- `/matches/[id]` captured as `/matches/00000000-0000-4000-8000-000000000201`
- `/matches/[id]/edit` captured as `/matches/00000000-0000-4000-8000-000000000201/edit`
- `/matches/empty`
- `/matches/error`
- `/matches/filter`
- `/matches/joined`
- `/matches/participants`
- `/matches/new`
- `/matches/new/sport`
- `/matches/new/place-time`
- `/matches/new/confirm`
- `/matches/new/complete`
- `/my/matches/created`
- `/my/matches/joined`

Findings fixed:

- `/matches/filter`, `/matches/new`, `/matches/new/place-time`, `/matches/[id]/edit`, and `/matches/new/complete` desktop surfaces were still rendering as full-width mobile-style forms/states. Fixed by using the personal-match create lane selector on the actual route DOM and adding route-owned classes for filter/complete.
- `/matches/new/complete` exposed a stale `/matches/match-1` detail link and an active no-op share button. Fixed by routing the neutral CTA to `/matches` and rendering `공유 준비 중` as a disabled primary action.
- The first CSS contract targeted `.tm-app-frame-wide`, but the browser evidence showed these routes do not use that ancestor. Tightened the contract to the actual desktop selector and reran browser evidence.
- `/matches/participants` desktop content stretched across the frame and relied only on the top back icon. Fixed by adding the personal match state lane and an in-body `상세로 돌아가기` action.

RED/GREEN:

- Desktop lane initial RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/personal-match-create-lane.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/personal-match-create-lane.GREEN.txt`
- Filter/complete honesty RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/personal-match-state-lane-honesty.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/personal-match-state-lane-honesty.GREEN2.txt`
- Actual DOM selector RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/personal-match-create-lane-actual-dom.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/personal-match-create-lane-actual-dom.GREEN.txt`
- Participants lane/action RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/personal-match-participants-lane.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/personal-match-participants-lane.GREEN.txt`

Browser QA:

- Final command output: `evidence/route-by-route-qa-20260605/personal-match-family-final2.txt`
- Final JSON: `evidence/route-by-route-qa-20260605/personal-match-family-final2.json`
- Final screenshots: `output/playwright/visual-audit/route-by-route-qa-20260605/personal-match-family-final2/`
- Additional family rerun JSON: `evidence/route-by-route-qa-20260605/personal-match-family-final.json`
- Participants rerun JSON: `evidence/route-by-route-qa-20260605/personal-match-participants-final.json`
- Functional confirm validation: `evidence/route-by-route-qa-20260605/personal-match-confirm-validation.json`, screenshot `output/playwright/visual-audit/route-by-route-qa-20260605/personal-match-confirm-validation.png`
- Result: 15 routes x 3 viewports, failures 0, horizontal overflow 0, dead links 0, text clipping 0.
- Manual visual inspection covered list, detail, edit, filter, create info/place-time/complete desktop, and complete mobile after the lane and disabled-share fix.
- Functional affordance inspection confirmed direct `/matches/new/confirm` submit with incomplete draft shows validation error and no fake success; `/matches/new/complete` exposes disabled `공유 준비 중` and `목록 보기` links to `/matches`.
- Adjacent regression: `evidence/route-by-route-qa-20260605/v1-web-test.personal-match-family.txt` (`v1_web` Vitest: 16 files, 26 tests passed).
- Cleanup receipt: Playwright browser closed by scripts; no QA-specific server spawned; follow-up `pgrep` found no `v1-route-walkthrough` process. Existing dev server remains for user inspection.

## C002 Evidence - Teams Account Reviews Family

Routes:

- `/my`
- `/my/profile/edit`
- `/my/reviews/[sourceType]/[sourceId]` captured as `/my/reviews/match/00000000-0000-4000-8000-000000000201`
- `/my/reviews`
- `/my/reviews/received`
- `/my/settings`
- `/my/settings/legal`
- `/my/settings/location`
- `/my/settings/notifications`
- `/my/settings/sports`
- `/my/settings/withdrawal`
- `/my/teams`
- `/my/teams/[id]` captured as `/my/teams/00000000-0000-4000-8000-000000000102`
- `/my/teams/[id]/members` captured as `/my/teams/00000000-0000-4000-8000-000000000102/members`
- `/my/teams/members`
- `/teams`
- `/teams/[id]` captured as `/teams/00000000-0000-4000-8000-000000000102`
- `/teams/[id]/edit` captured as `/teams/00000000-0000-4000-8000-000000000102/edit`
- `/teams/[id]/members` captured as `/teams/00000000-0000-4000-8000-000000000102/members`
- `/teams/filter`
- `/teams/new`
- `/teams/search`
- `/teams/search/empty`
- `/teams/search/error`

Findings fixed:

- `/my/profile/edit`, `/my/settings`, `/teams/filter`, `/teams/new`, and `/teams/[id]/edit` desktop utility/form routes were stretched across the desktop frame. Fixed by adding focused desktop lanes for profile/settings/team form surfaces and centered fixed CTA rows/buttons.
- `/teams/filter` did not expose the same route-owned form-lane contract as team create/edit. Fixed with `team-filter-open-design` plus the shared team form lane class.
- `/my/teams/members` was a redirect-only alias. On mobile route-family captures, Next dev sometimes saved the transient `Rendering...` state and raised `MyTeamMembersPage cannot have a negative time stamp`, which polluted screenshots with a red issue badge. Fixed by rendering the stable `MyTeamsPageClient` directly on the alias route.
- The walkthrough harness captured screenshots immediately after navigation, so redirect/loading routes could be snapshotted before the app frame settled. Fixed with `waitForWalkthroughSettled(page)` before screenshots.

RED/GREEN:

- Account/team utility lane RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/teams-account-utility-lanes.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/teams-account-utility-lanes.GREEN.txt`
- Team filter form contract RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/team-filter-form-contract.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/team-filter-form-contract.GREEN.txt`
- Profile CTA display RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/profile-cta-centered-display.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/profile-cta-centered-display.GREEN.txt`
- Walkthrough settled wait RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/route-walkthrough-settled-wait.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/route-walkthrough-settled-wait.GREEN.txt`
- My teams members alias RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/my-teams-members-alias-ui.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/my-teams-members-alias-ui.GREEN.txt`

Browser QA:

- Initial family JSON: `evidence/route-by-route-qa-20260605/teams-account-reviews-family.json`
- Initial family rerun JSON: `evidence/route-by-route-qa-20260605/teams-account-reviews-family-final.json`
- Utility lane final JSON: `evidence/route-by-route-qa-20260605/teams-account-utility-lanes-final.json`
- Alias route final JSON: `evidence/route-by-route-qa-20260605/teams-account-my-teams-members-alias-final.json`
- Final family command output: `evidence/route-by-route-qa-20260605/teams-account-reviews-family-final3.txt`
- Final family JSON: `evidence/route-by-route-qa-20260605/teams-account-reviews-family-final3.json`
- Final screenshots: `output/playwright/visual-audit/route-by-route-qa-20260605/teams-account-reviews-family-final3/`
- Result: 24 routes x 3 viewports, failures 0, horizontal overflow 0, dead links 0, text clipping 0.
- Manual visual inspection covered `/my`, `/my/profile/edit`, `/my/settings`, `/my/reviews/[sourceType]/[sourceId]`, `/my/teams`, `/my/teams/[id]/members`, `/teams`, `/teams/[id]`, `/teams/filter`, `/teams/new`, and affected mobile aliases.
- Functional inspection confirmed `/my/reviews/[sourceType]/[sourceId]` shows an honest unavailable/error state for incomplete review source data rather than fake success.
- Playwright page-error check after alias fix: `/my/teams/members` mobile produced no page errors and no `1 Issue`/`Rendering` text in the app body.

Automated QA:

- Contract tests: `evidence/route-by-route-qa-20260605/qa-contract-tests.teams-account-family.txt`; 14 Node tests passed.
- `corepack pnpm --filter v1_web test`: `evidence/route-by-route-qa-20260605/v1-web-test.teams-account-family.txt`; 16 files / 26 tests passed.
- CSS LSP note: Biome LSP is configured but not installed in this environment; CSS was verified through focused Node CSS contracts, Vitest, and browser screenshots.

Cleanup receipt:

- Playwright browsers closed by scripts; no QA-specific server spawned. Existing dev server remains for user inspection.

## C002 Evidence - Community Admin Utility Family

Routes:

- `/admin/audit`
- `/admin`
- `/chat/[id]` captured with live room `/chat/0a6a8fa0-e872-4ef8-b387-abe2d04d5f7e` in this run
- `/chat`
- `/notifications`
- `/notifications/read`

Findings fixed:

- `/chat/[id]` initially used the generic personal-match ID as its capture route, so the browser opened a nonexistent room and stayed on `메시지를 불러오는 중입니다`. Fixed the walkthrough target/runner so chat detail routes use a live chat-room ID resolved from `/api/v1/chat/rooms` after authenticated dev login.
- `/notifications/read` was a redirect-only alias. On mobile it showed the same Next dev redirect issue pattern as other alias routes. Fixed by rendering `NotificationsPageClient` directly on the alias route.

RED/GREEN:

- Chat live capture RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/community-chat-live-capture.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/community-chat-live-capture.GREEN.txt`
- Notifications read alias RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/notifications-read-alias-ui.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/notifications-read-alias-ui.GREEN.txt`

Browser QA:

- Initial family JSON: `evidence/route-by-route-qa-20260605/community-admin-utility-family.json`
- Final command output: `evidence/route-by-route-qa-20260605/community-admin-utility-family-final.txt`
- Final JSON: `evidence/route-by-route-qa-20260605/community-admin-utility-family-final.json`
- Final screenshots: `output/playwright/visual-audit/route-by-route-qa-20260605/community-admin-utility-family-final/`
- Result: 6 routes x 3 viewports, failures 0, horizontal overflow 0, dead links 0, text clipping 0.
- Manual visual inspection covered admin overview/audit desktop, chat list desktop, chat detail mobile/desktop, notifications desktop, and notifications-read mobile after fixes.
- Functional inspection confirmed admin mutation actions render disabled/unsupported instead of fake success; chat detail shows actual messages and message input; notifications keep `모두읽음` as the explicit action.

Cleanup receipt:

- Playwright browsers closed by scripts; no QA-specific server spawned. Existing dev server remains for user inspection.

## C002 Evidence - Public Auth Discovery Family

Routes:

- `/auth/account-conflict`
- `/auth/blocked`
- `/auth/location-denied`
- `/auth/missing-email`
- `/auth/password-reset`
- `/auth/provider-denied`
- `/callback/kakao`
- `/home`
- `/landing`
- `/login/email`
- `/login`
- `/notices/[id]` captured as `/notices/00000000-0000-4000-8000-000000000001`
- `/notices`
- `/onboarding/confirm`
- `/onboarding/level`
- `/onboarding/region`
- `/onboarding/resume`
- `/onboarding/sport`
- `/`
- `/search/empty`
- `/search/error`
- `/search/new`
- `/search`
- `/search/stale`
- `/signup/complete`
- `/signup`
- `/signup/social`
- `/terms`

Findings fixed:

- `/notices/[id]` initially used the generic personal-match seed ID as its capture route. Fixed the walkthrough target mapping so notice details use the live notice seed ID.
- Desktop auth pages with `AuthFrame` collapsed their implicit grid row to the topbar height, which made `.tm-auth-scroll` height `0` and pushed fixed CTAs out of the content column. Fixed the desktop auth grid with `grid-template-rows: minmax(0, 1fr)` and local CTA positioning.
- Final public/auth contact-sheet review still showed auth and onboarding pages reading as a narrow mobile panel inside desktop chrome. Fixed the desktop auth lane with `--v1-auth-desktop-content-width: 760px`, a wider shell, two-column login layout, expanded content padding, and CTA width bound to the same lane while preserving mobile rules.

RED/GREEN:

- Notice live capture RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/public-notice-live-capture.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/public-notice-live-capture.GREEN.txt`
- Auth desktop frame RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/public-auth-desktop-frame.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/public-auth-desktop-frame.GREEN.txt`
- Auth desktop lane RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/public-auth-desktop-lane.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/public-auth-desktop-lane.GREEN.txt`

Browser QA:

- Route list after notice fix: `evidence/route-by-route-qa-20260605/public-auth-discovery.list2.txt`
- Initial family JSON: `evidence/route-by-route-qa-20260605/public-auth-discovery-family.json`
- Auth desktop geometry proof: `evidence/route-by-route-qa-20260605/public-auth-desktop-geometry.txt`
- Auth desktop lane proof: `evidence/route-by-route-qa-20260605/public-auth-desktop-lane.browser.txt`
- Affected desktop rerun JSON: `evidence/route-by-route-qa-20260605/public-auth-desktop-frame-final.json`
- Affected desktop rerun screenshots: `output/playwright/visual-audit/route-by-route-qa-20260605/public-auth-desktop-frame-final/`
- Final family JSON: `evidence/route-by-route-qa-20260605/public-auth-discovery-family-final.json`
- Final family screenshots: `output/playwright/visual-audit/route-by-route-qa-20260605/public-auth-discovery-family-final/`
- Final desktop contact sheet: `output/playwright/visual-audit/route-by-route-qa-20260605/contact-sheets/public-auth-discovery-final-1440.png`
- Final mobile contact sheet: `output/playwright/visual-audit/route-by-route-qa-20260605/contact-sheets/public-auth-discovery-final-390.png`
- Result: 28 routes x 3 viewports, failures 0, horizontal overflow 0, dead links 0, text clipping 0.
- Manual visual inspection covered login/email/signup/social/complete, auth exception states, onboarding steps, terms, root guest redirect, landing, home, notices list/detail, callback error, and search empty/error/new/stale/default states.

Cleanup receipt:

- Playwright browsers closed by scripts; no QA-specific server spawned. Existing dev server remains for user inspection.

## Final Verification

- Final route-family browser evidence:
  - `final-seq-community-admin-utility`: `evidence/route-by-route-qa-20260605/final-seq-community-admin-utility.json`; 6 routes, 18 viewport results, failures 0.
  - `final-seq-personal-match`: `evidence/route-by-route-qa-20260605/final-seq-personal-match.json`; 15 routes, 45 viewport results, failures 0.
  - `final-seq-team-match`: `evidence/route-by-route-qa-20260605/final-seq-team-match.json`; 14 routes, 42 viewport results, failures 0.
  - `final-seq-teams-account-reviews`: `evidence/route-by-route-qa-20260605/final-seq-teams-account-reviews.json`; 24 routes, 72 viewport results, failures 0.
  - `final-seq-public-auth-discovery`: `evidence/route-by-route-qa-20260605/final-seq-public-auth-discovery.json`; 28 routes, 84 viewport results, failures 0.
- Final all-route summary: `evidence/route-by-route-qa-20260605/final-seq-all-routes-summary.json`; 87 current v1 routes, 261 viewport results, failures 0.
- Focused Node contracts: `evidence/route-by-route-qa-20260605/qa-contract-tests.final.txt`; 25 tests passed.
- Post-review focused Node contracts: `evidence/route-by-route-qa-20260605/red-green/route-walkthrough-functional-probes.GREEN.txt`; 19 tests passed.
- Post-review team-match component and browser route rerun: `evidence/route-by-route-qa-20260605/red-green/team-match-complete-honesty.GREEN.txt`, `evidence/route-by-route-qa-20260605/team-match-complete-final-functional.json`.
- Live edit backHref RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/live-edit-backhref.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/live-edit-backhref.GREEN.txt`.
- Live edit browser rerun: `evidence/route-by-route-qa-20260605/live-edit-backhref-final.json`; 2 routes x 3 viewports, failures 0, live UUID backHref present.
- Desktop shell cap RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/desktop-shell-canvas-cap-precise.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/desktop-shell-canvas-cap-precise.GREEN.txt`.
- Desktop fixed CTA alignment RED/GREEN: `evidence/route-by-route-qa-20260605/red-green/desktop-fixed-cta-frame-alignment.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/desktop-fixed-cta-frame-alignment.GREEN.txt`.
- Next dev indicator RED/GREEN and chat rerun: `evidence/route-by-route-qa-20260605/red-green/next-dev-indicator-disabled.RED.txt`, `evidence/route-by-route-qa-20260605/red-green/next-dev-indicator-disabled.GREEN.txt`, `evidence/route-by-route-qa-20260605/chat-dev-indicator-final.json`.
- Focused CSS contract: `evidence/route-by-route-qa-20260605/qa-css-contract.final.txt`; 7 tokens and 14 selectors passed.
- `corepack pnpm --filter v1_web test`: `evidence/route-by-route-qa-20260605/v1-web-test.final.txt`; 16 files / 28 tests passed.
- `corepack pnpm --filter v1_web build`: `evidence/route-by-route-qa-20260605/v1-web-build.final.txt`; build passed and generated 77 static pages.
- LSP diagnostics: no diagnostics found for changed TS/TSX files and `next.config.ts`; JS QA script diagnostics could not start because workspace TypeScript server was unavailable, so Node tests are the verification source for those scripts.
- Scenario/status doc sync: `docs/scenarios/index.md` and `docs/scenarios/13-v1-open-design-recovery-from-zero.md` now record the Task 95 final route-by-route evidence.
- Reviewer gate: code review PASS (`final_code_review`), hands-on route QA PASS (`final_hands_on_qa`), and security review PASS (`review_security`); no blocking findings.
- CSS LSP note: Biome LSP is configured but not installed in this environment; CSS was verified through focused Node CSS contracts, Vitest, build, geometry probes, and browser screenshots.

## Route Order

1. Preflight: `/login`, `/home`.
2. First increment: `/team-matches`, `/team-matches/[id]`, `/team-matches/new`.
3. Finish `team-match` family.
4. `personal-match` family.
5. `teams-account-reviews` family.
6. `community-admin-utility` family.
7. `public-auth-discovery` family.

Reasoning: start with shell/auth preflight, then the user-surfaced team-match complaint, then adjacent match/team/account workflows, and finish with standalone public/auth states.

## Parallelism

- Harness and shared evidence format are serial.
- Read-only route audits may run by family after C001.
- Route execution inside a family stays route-by-route.
- Production fixes can parallelize only when owned files do not overlap.
- Shared files such as `globals.css`, shell/primitives, API hooks, and route matrix docs are serial integration waves.
