# 94. V1 Full Desktop UX Sweep

Status: Completed
Owner: Codex
Scope: `apps/v1_web`, `scripts/qa`, `evidence/full-desktop-ux-20260605`, `output/playwright/visual-audit/full-desktop-ux-20260605`

## Goal

Continue after Task 93's route-wide visual pass and fix the remaining desktop UX issue the user surfaced: several pages still read like mobile feeds stretched across wide monitors. The desired direction is a modern Toss-like v1 desktop experience that remains mobile-first, but expands into scan-friendly desktop workbenches.

## User Feedback

- `/team-matches` desktop screenshot looked visually inappropriate for desktop.
- The user explicitly requested `$omo:frontend-ui-ux`, parallel agents, all-page review/fix, `$harness-floor-codex:agent-all-codex`, `--loop`, and `--qa`.
- Desktop quality matters as much as mobile-first responsiveness: pages must use the wide canvas intentionally.

## Source Of Truth

- Root guidance: `AGENTS.md`, `.codex/AGENTS.md`, `.codex/frontend-rules.md`, `.codex/design-rules.md`
- Design source: `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`
- Pinned scoped Open Design reference: `docs/reference/open-design/**`
- Prior completed recovery: `.github/tasks/93-v1-open-design-recovery-from-zero.md`
- Runtime target: `apps/v1_web`

## Acceptance Criteria

- [x] Route-family audit covers current v1 routes and classifies desktop UX risks by page family.
- [x] Changed page families have RED -> GREEN Open Design/desktop contract tests that name the new workbench or desktop-specific structure.
- [x] List/discovery pages (`matches`, `team-matches`, `teams`) use desktop workbench structure: filter rail, compact insight strip, scan-friendly cards or rows, and clear primary action.
- [x] Account/workflow/ops pages (`my`, `reviews`, `community/chat/notifications`, `admin`) do not rely on phone-sized stacked rows or bottom-only actions on desktop.
- [x] Mobile-first behavior remains intact at phone widths.
- [x] QA loop passes: targeted component tests, `v1_web` tests, `v1_web` build, representative desktop visual captures, and broad route visual QA.
- [x] Review gate records design/QA/code findings and resolves blocking issues.

## Parallel Work Split

- Wave A: list/discovery workbenches
  - Owned: `apps/v1_web/src/components/matches/matches-page.tsx`, `apps/v1_web/src/components/team-matches/team-matches-page.tsx`, `apps/v1_web/src/components/teams/teams-page.tsx`, and their `*.open-design.test.tsx` files.
  - Forbidden: shared CSS until integration wave.
- Wave B: account/workflow/ops workbenches
  - Owned: `apps/v1_web/src/components/my/my-page.tsx`, `apps/v1_web/src/components/reviews/reviews-page.tsx`, admin/community/chat/notification component tests and page files as needed.
  - Forbidden: shared CSS until integration wave.
- Integration Wave: `apps/v1_web/src/app/globals.css` plus final visual QA.

## Progress Snapshot

- [x] Existing broad visual QA baseline identified from Task 93.
- [x] Representative desktop baseline captured for `/home`, `/matches`, `/team-matches`, `/teams`, `/my`, `/chat`, `/notifications`, `/admin`.
- [x] Parallel audit agents completed initial risk scan.
- [x] Wave A implementation.
- [x] Wave B implementation.
- [x] Integration CSS.
- [x] QA loop.
- [x] Review gate.

## Evidence Ledger

- Baseline desktop visual summary: `output/playwright/visual-audit/full-desktop-ux-20260605/baseline/desktop-summary.json`
- Baseline command output: `evidence/full-desktop-ux-20260605/baseline-desktop-visual.txt`
- Runtime notepad: `.omo/ultrawork/full-desktop-ux-20260605/notepad.md`
- Targeted Open Design desktop workbench tests: `evidence/full-desktop-ux-20260605/red-green/open-design-desktop-workbench.after-css.GREEN.txt`
- TypeScript direct check: `evidence/full-desktop-ux-20260605/v1-web-tsc.final.txt`
- Final v1 web tests: `evidence/full-desktop-ux-20260605/v1-web-test.final-2.txt`
- Final v1 web build: `evidence/full-desktop-ux-20260605/v1-web-build.final-2.txt`
- Route matrix final: `evidence/full-desktop-ux-20260605/route-matrix.final.txt`
- Representative desktop visual QA: `evidence/full-desktop-ux-20260605/desktop-visual-representative.txt`
- Focused desktop visual QA: `evidence/full-desktop-ux-20260605/desktop-visual-focused.txt`
- Notifications/chat desktop visual QA: `evidence/full-desktop-ux-20260605/desktop-visual-notifications-chat.txt`
- All-route wide desktop visual QA: `evidence/full-desktop-ux-20260605/desktop-visual-final-wide-all-routes.summary.json`
- Full 6-viewport live parity QA: `evidence/full-desktop-ux-20260605/full-parity-final.summary.json`
- Post-review targeted contracts: `evidence/full-desktop-ux-20260605/post-review-targeted-contracts-2.txt`
- Post-review TypeScript: `evidence/full-desktop-ux-20260605/post-review-v1-web-tsc-2.txt`
- Post-review v1 web tests: `evidence/full-desktop-ux-20260605/post-review-v1-web-test-2.txt`
- Post-review v1 web build: `evidence/full-desktop-ux-20260605/post-review-v1-web-build-2.txt`
- Post-review focused desktop visual QA: `output/playwright/visual-audit/full-desktop-ux-20260605/post-review-focused-2/desktop-summary.json`
- Post-review all-route wide desktop visual QA: `output/playwright/visual-audit/full-desktop-ux-20260605/post-review-wide-all-routes-2/desktop-summary.json`
- Post-review full 6-viewport live parity QA: `evidence/full-desktop-ux-20260605/post-review-full-parity.json`

## Review Gate

- Goal/constraint review: PASS. The implemented workbench structure matches the user request and Task 94 acceptance criteria.
- Hands-on QA review: PASS. Desktop and mobile-first evidence was checked; no blocking issue.
- Security/privacy review: PASS. No unsafe link, fake admin/transaction completion, secret exposure, or permission bypass was found in the scoped changes.
- Code quality review: initial FAIL on search default, brittle CSS selectors, and duplicate notification action. Fixed and rerun as PASS.
- Context-mining review: PASS. Work remains in v1 scope and uses Task 93/Open Design references as scoped visual references without treating design-only pages as runtime routes.

Post-review QA summary:

- `corepack pnpm --filter v1_web exec tsc --noEmit`: PASS.
- `corepack pnpm --filter v1_web test`: PASS, 16 files / 26 tests.
- `corepack pnpm --filter v1_web build`: PASS, 77 static pages generated.
- Focused desktop visual QA: PASS, 5 routes x 2 desktop viewports, 0 failures.
- All-route wide desktop visual QA: PASS, 87 routes x 4 desktop viewports = 348 results, 0 failures.
- Full live parity QA: PASS, 87 routes x 6 viewports = 522 captures, 0 live failures.

## Ambiguity Log

- Harness `agent-all-codex` Phase 0 expects a clean worktree and `.codex/skills/*/SKILL.md`; this repository is already heavily dirty from active Open Design recovery work and has agent docs under `.codex/agents/`, not `.codex/skills/`. For this run, project `AGENTS.md` and user explicit parallel-agent request take precedence. State is recorded in `.agent-all-state.json`, but commits/PR creation are skipped.
- Task docs use `.github/tasks/` per project rule rather than the harness default `docs/tasks/`.
