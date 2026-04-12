# MatchUp Web Audit Remediation Plan

> Historical audit/planning note. Canonical design rules live in `DESIGN.md`, document navigation lives in `docs/DESIGN_DOCUMENT_MAP.md`, and current design remediation execution lives in `.github/tasks/52-current-design-drift-audit-and-remediation-plan.md`.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** MatchUp 웹이 “문서상 완성”이 아니라 “현재 구현 범위와 검증 상태를 자신 있게 설명할 수 있는 상태”가 되도록 브랜드, mock surface, unsupported contract, QA coverage를 정리한다.

**Architecture:** 먼저 truth source를 고정한다. 브랜드와 시나리오 허브를 단일 기준으로 맞춘 뒤, main app의 mock/false-affordance surface를 제거하고, 거래형·운영형 화면은 real-data 또는 honest unsupported contract로 정리한다. 마지막에 scenario docs와 Playwright를 실제 구현 상태에 맞게 write-back한다.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query, NestJS 11 API, pnpm workspace, Vitest, Playwright

---

## Preconditions

- 현재 dirty worktree가 존재한다. 특히 아래 파일은 이미 변경 중이므로 첫 구현 라운드에서 곧바로 덮어쓰지 않는다.
  - `apps/web/src/app/(main)/my/teams/page.tsx`
  - `apps/web/src/app/(main)/teams/[id]/members/page.tsx`
  - `apps/web/src/app/(main)/teams/[id]/page.tsx`
  - `apps/web/src/app/(main)/teams/new/page.tsx`
  - `apps/web/src/hooks/use-api.ts`
  - `docs/scenarios/04-team-and-membership.md`
  - `docs/scenarios/index.md`
  - `e2e/tests/team-owner-flow.spec.ts`
  - `e2e/tests/team-manager-membership.spec.ts`
- 검증 환경은 가능하면 Node 22 + `make dev` 기준으로 맞춘다.

### Task 1: Lock The Audit Baseline

**Files:**
- Modify: `.github/tasks/32-web-audit-and-remediation.md`
- Modify: `docs/plans/2026-04-10-web-audit-remediation-plan.md`
- Test: `git status --short`
- Test: `pnpm --filter web exec tsc --noEmit`
- Test: `pnpm --filter web test`

**Step 1: Snapshot the current working tree**

Run: `git status --short`
Expected: 현재 작업 중인 파일을 문서에 고정해 이후 구현 라운드에서 충돌 범위를 알 수 있다.

**Step 2: Confirm runtime health**

Run: `curl -I http://localhost:3003/landing && curl http://localhost:8111/api/v1/health`
Expected: web/api가 응답하고, 이 plan이 stale environment 위에 세워지지 않는다.

**Step 3: Record baseline quality signals**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web test`
Expected: typecheck와 Vitest 기준선이 현재 녹색인지 확인한다.

**Step 4: Record scenario and mock-surface counts**

Run: `python`/`rg`로 scenario completion count, mock page count를 재산출한다.
Expected: 이후 라운드에서 “무엇이 얼마나 줄었는가”를 비교할 수 있다.

**Step 5: Commit docs-only baseline**

Run: `git add .github/tasks/32-web-audit-and-remediation.md docs/plans/2026-04-10-web-audit-remediation-plan.md && git commit -m "docs: add web audit remediation plan"`
Expected: 구현 전 기준선이 별도 커밋으로 남는다.

### Task 2: Freeze A Single Brand Source Of Truth

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/public/manifest.json`
- Modify: `apps/web/src/app/landing/layout.tsx`
- Modify: `apps/web/src/app/about/layout.tsx`
- Modify: `apps/web/src/app/guide/layout.tsx`
- Modify: `apps/web/src/app/pricing/layout.tsx`
- Modify: `apps/web/src/app/faq/layout.tsx`
- Modify: `apps/web/src/components/layout/sidebar.tsx`
- Modify: `apps/web/src/components/layout/footer.tsx`
- Modify: `apps/web/src/components/landing/landing-nav.tsx`
- Modify: `apps/web/src/components/landing/landing-footer.tsx`
- Modify: `README.md`
- Modify: `docs/PROJECT_OVERVIEW.md`
- Modify: `docs/reference/app-icon-prompt-pack.md`
- Create: `apps/web/public/favicon.ico` or equivalent favicon asset
- Test: public page browser smoke (`/landing`, `/about`, `/faq`, `/login`, `/home`)

**Step 1: Make the naming decision explicit**

Run: `rg -n "TeamMeet|MatchUp" apps/web/src/app apps/web/src/components apps/web/public docs README.md`
Expected: 어디가 `MatchUp`, 어디가 `TeamMeet`인지 한 번에 보인다.

**Step 2: Pick one canonical product name**

Action: 사용자/문서 기준으로 canonical brand를 하나로 정한다.
Expected: 이후 문서/메타/UI가 같은 이름을 쓰게 된다.

**Step 3: Update metadata, manifest, visible shell copy**

Action: layout metadata, public manifest, sidebar/footer/nav, intro layouts를 단일 brand로 맞춘다.
Expected: 브라우저 title, PWA 이름, shell branding이 동일해진다.

**Step 4: Add the missing favicon**

Action: `apps/web/public/favicon.ico`를 추가하거나 기존 아이콘을 favicon으로 라우팅한다.
Expected: landing browser smoke의 `/favicon.ico` 404가 사라진다.

**Step 5: Re-run public smoke**

Run: browser smoke + console check
Expected: public pages가 같은 브랜드를 표시하고 콘솔이 깨끗하다.

### Task 3: Remove High-Traffic User Mock Surfaces

Progress 2026-04-11:
- Completed: `my/matches`, `my/lessons`, `my/listings`, `venues/[id]`
- Deferred: `my/reviews-received`, scenario doc write-back
- Note: `venues/:id/schedule` backend contract is a 7-day reservation list, not a free/busy slot grid

**Files:**
- Modify: `apps/web/src/app/(main)/my/matches/page.tsx`
- Modify: `apps/web/src/app/(main)/my/lessons/page.tsx`
- Modify: `apps/web/src/app/(main)/my/listings/page.tsx`
- Modify: `apps/web/src/app/(main)/my/reviews-received/page.tsx`
- Modify: `apps/web/src/app/(main)/venues/[id]/page.tsx`
- Modify: `apps/web/src/hooks/use-api.ts`
- Modify: `docs/scenarios/08-marketplace-and-lessons.md`
- Modify: `docs/scenarios/10-profile-settings-admin.md`
- Test: relevant Vitest for hooks/components
- Test: Playwright user-facing bundle for `/my/*`, `/venues/[id]`

**Step 1: Replace dev-only data with real-data-first contract**

Action: `my/matches`, `my/lessons`, `my/listings`, `my/reviews-received`에서 silent mock fallback을 제거한다.
Expected: API가 비면 empty state 또는 sample label을 보이고, 실제 데이터처럼 보이는 샘플 리스트는 사라진다.

**Step 2: Keep honest trust signals**

Action: sample data가 정말 필요하면 `sample`/`estimated` 배너를 붙이고 action을 제한한다.
Expected: mock이 실데이터처럼 보이지 않는다.

**Step 3: Remove venue detail fallback ambiguity**

Action: `venues/[id]`는 API 실패 시 generic mock venue를 대체 렌더하지 않고 empty/error contract로 바꾼다.
Expected: 특정 venue route가 다른 샘플 venue로 보이는 misleading 상태가 사라진다.

**Step 4: Update scenario docs**

Action: 관련 scenario 문서에 actual contract를 반영한다.
Expected: QA 문서가 구현보다 과장되지 않는다.

**Step 5: Verify**

Run: `pnpm --filter web exec tsc --noEmit`, targeted Playwright specs, manual smoke
Expected: user-facing high-traffic surfaces가 mock 없이 설명 가능해진다.

### Task 4: Fix Team-Match Operational Pages Before Expanding Coverage

**Files:**
- Modify: `apps/web/src/app/(main)/team-matches/[id]/arrival/page.tsx`
- Modify: `apps/web/src/app/(main)/team-matches/[id]/score/page.tsx`
- Modify: `apps/web/src/hooks/use-api.ts`
- Modify: `docs/scenarios/05-team-match-flows.md`
- Modify: `e2e/tests/team-owner-flow.spec.ts` or a new dedicated team-match operational spec

**Step 1: Decide the contract**

Action: arrival/score pages를 real API detail 기반으로 구현할지, 미구현이면 진입 CTA를 숨길지 결정한다.
Expected: `mockMatch` 기반 운영 화면을 그대로 두지 않는다.

**Step 2: Remove route-local mock state**

Action: 화면 헤더, 팀 정보, 쿼터 수, 도착 타임라인을 실제 server data로 받는다.
Expected: 특정 team-match route가 어떤 ID로 들어가도 샘플 경기처럼 보이지 않는다.

**Step 3: Wire actions to stable server outcomes**

Action: check-in/result submit 후 invalidate/refetch 경로를 붙인다.
Expected: optimistic-only local state가 아니라 reload 후에도 동일 상태를 본다.

**Step 4: Add real-flow QA**

Action: `05-team-match-flows.md`와 대응 Playwright spec을 강화한다.
Expected: smoke가 아니라 behavior contract 기준으로 검증된다.

**Step 5: Commit**

Run: targeted test + commit
Expected: team-match operational surfaces가 다음 도메인 확장 전 기준선이 된다.

### Task 5: Align Commerce And Notification Contracts

**Files:**
- Modify: `apps/web/src/app/(main)/lessons/[id]/page.tsx`
- Modify: `apps/web/src/app/(main)/marketplace/[id]/page.tsx`
- Modify: `apps/web/src/app/(main)/payments/checkout/page.tsx`
- Modify: `apps/web/src/app/(main)/settings/notifications/page.tsx`
- Modify: `docs/scenarios/08-marketplace-and-lessons.md`
- Modify: `docs/scenarios/09-payment-review-badge.md`
- Modify: `docs/scenarios/10-profile-settings-admin.md`

**Step 1: Remove fake surrounding signals**

Action: lesson detail의 sample curriculum, fixed coach stats, placeholder purchase language를 실제 데이터 또는 explicit sample banner로 바꾼다.
Expected: 결제는 막아 두더라도 주변 정보가 실제 운영값처럼 보이지 않는다.

**Step 2: Keep unsupported flows honest**

Action: marketplace/lesson payment unsupported state는 유지하되, entry points와 explanatory copy를 docs와 동일하게 정리한다.
Expected: 사용자는 “곧 결제될 것 같은 버튼”이 아니라 “지금 무엇까지 가능한지”를 정확히 본다.

**Step 3: Clarify notification scope**

Action: `/settings/notifications`가 truly device-local이면 그 사실을 문서와 QA에 반영하고, 영속화 계획이 있으면 follow-up으로 분리한다.
Expected: local-only state를 서버 설정처럼 오해하지 않는다.

**Step 4: Verify checkout boundaries**

Run: checkout deep-link tests for supported match checkout vs unsupported lesson/marketplace checkout
Expected: 지원 범위 밖 진입이 fake success 없이 막힌다.

**Step 5: Commit**

Run: targeted tests + commit
Expected: 거래형 화면의 “honest contract”가 사용자 입장에서 일관된다.

### Task 6: Replace Admin Mock Surfaces With Real Data Or Honest Empty States

**Files:**
- Modify: `apps/web/src/app/admin/payments/page.tsx`
- Modify: `apps/web/src/app/admin/reviews/page.tsx`
- Modify: `apps/web/src/app/admin/mercenary/page.tsx`
- Modify: `apps/web/src/app/admin/teams/[id]/page.tsx`
- Modify: `apps/web/src/app/admin/venues/[id]/page.tsx`
- Modify: `apps/web/src/hooks/use-api.ts`
- Modify: `docs/scenarios/10-profile-settings-admin.md`
- Modify: `e2e/tests/admin-dashboard.spec.ts` or new admin specs

**Step 1: Identify missing admin endpoints**

Action: 각 admin 화면이 실제로 소비할 API가 있는지 확인한다.
Expected: 프론트만 고쳐도 되는 화면과 backend dependency가 필요한 화면이 분리된다.

**Step 2: Remove silent mock fallback**

Action: API response가 없을 때 mock list를 렌더하지 않고 `EmptyState`/`ErrorState`로 바꾼다.
Expected: 운영자가 샘플 데이터를 실제 운영 데이터로 오해하지 않는다.

**Step 3: Add auditability where needed**

Action: admin action surface는 처리 결과, 실패, 후속 링크를 admin shell 안에서 유지한다.
Expected: local-only 완료 토스트 중심 흐름이 줄어든다.

**Step 4: Add admin QA**

Action: 최소한 payments/reviews/one detail surface에 대해 scenario + Playwright smoke를 추가한다.
Expected: admin도 “보여주기용 화면”이 아니라 검증 가능한 surface가 된다.

**Step 5: Commit**

Run: targeted admin checks + commit
Expected: admin mock surface 제거가 독립 라운드로 남는다.

### Task 7: Write Back The Truth To Docs And QA

**Files:**
- Modify: `docs/scenarios/index.md`
- Modify: `docs/PROJECT_OVERVIEW.md`
- Modify: `docs/WORK_SUMMARY.md`
- Modify: relevant scenario docs under `docs/scenarios/`
- Modify: `.github/tasks/32-web-audit-and-remediation.md`

**Step 1: Update scenario statuses**

Action: 실제로 구현/검증한 영역만 `[x]`로 두고 partial/planned를 정확히 남긴다.
Expected: 다음 세션이 잘못된 완성도 인상을 받지 않는다.

**Step 2: Rewrite product overview**

Action: overview와 work summary에서 “이미 완성된 것”과 “현재 제한된 것”을 분리해 기술한다.
Expected: 소개 문서가 현재 제품 상태를 과장하지 않는다.

**Step 3: Add latest validation output**

Action: latest run summary를 갱신한다.
Expected: 어떤 명령이 언제 녹색이었는지 바로 확인 가능하다.

**Step 4: Run final regression**

Run:
- `pnpm --filter web exec tsc --noEmit`
- `pnpm --filter web test`
- `pnpm exec playwright test --config=e2e/playwright.config.ts --project='Desktop Chrome' --workers=1 <updated specs>`
Expected: docs와 제품이 같은 상태를 가리킨다.

**Step 5: Final commit**

Run: `git add ... && git commit -m "docs: sync web audit results"`
Expected: plan 구현 결과가 문서까지 포함해 닫힌다.

## Suggested Execution Priority

1. Task 2
2. Task 3
3. Task 5
4. Task 6
5. Task 7

Reason:
- 브랜드 기준이 먼저 고정되어야 이후 문서/메타/UI 수정이 덜 흔들린다.
- user-facing mock surface와 team-match operational surface가 현재 제품 완성도 인상에 가장 큰 영향을 준다.
- commerce/admin은 사용자 노출 위험과 운영 리스크가 크지만, 먼저 기준선을 정한 뒤 들어가야 문서-코드 drift가 줄어든다.
