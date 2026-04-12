# Task 45 — Design System Consolidation

> Historical rollout record. Canonical rules live in `DESIGN.md`, document navigation lives in `docs/DESIGN_DOCUMENT_MAP.md`, and the current design remediation contract lives in `.github/tasks/52-current-design-drift-audit-and-remediation-plan.md`. This file remains history, not source of truth.

Owner: project-director -> frontend-dev -> frontend-review -> design/qa/docs
Date drafted: 2026-04-11
Status: Completed
Priority: P1

## Documentation Realignment — 2026-04-11

이번 후속 문서 정리에서 design system의 canonical source를 `DESIGN.md`로 승격했다.

- `DESIGN.md`를 추가해 shadow / border / layout / glass 규칙을 한 문서에 통합
- `docs/DESIGN_DOCUMENT_MAP.md`를 추가해 active vs historical 문서 탐색 허브를 고정
- `.impeccable.md`는 brand memo 중심의 compatibility entry로 축소
- `CLAUDE.md`, `AGENTS.md`, `docs/PROJECT_OVERVIEW.md`, `docs/DESIGN_CONSISTENCY_REPORT.md`가 모두 `DESIGN.md`를 우선 참조하도록 동기화
- 과거 audit/task 문서는 규칙 정의가 아니라 evidence/history 역할로 재정의

## Execution Report — 2026-04-11

### Completed This Run

- Added a thin primitive layer in `apps/web/src/components/ui/`
  - `Button`
  - `Input`
  - `Textarea`
  - `Select`
  - `Card`
  - `FormField`
  - `SectionHeader`
- Migrated the primary form targets to shared primitives
  - `apps/web/src/app/(auth)/login/page.tsx`
  - `apps/web/src/app/(main)/settings/account/page.tsx`
  - `apps/web/src/app/(main)/matches/new/page.tsx`
  - `apps/web/src/app/(main)/marketplace/new/page.tsx`
  - `apps/web/src/app/(main)/teams/new/page.tsx`
- Removed the duplicated page-local `<style jsx>` form styling from `matches/new`, `marketplace/new`, and `teams/new`.
- Performed low-risk surface consolidation by extracting `SectionHeader` and adopting it in `apps/web/src/app/(main)/home/home-client.tsx`.
- Completed representative surface consolidation in:
  - `apps/web/src/app/(main)/matches/matches-client.tsx`
  - `apps/web/src/app/(main)/marketplace/page.tsx`
  - `apps/web/src/app/(main)/teams/[id]/page.tsx`
  - `apps/web/src/app/admin/dashboard/page.tsx`
- Tightened the dark-mode contract in `apps/web/src/app/globals.css` so migrated primitives own their surface contract while raw controls retain a limited legacy fallback.
- Added primitive coverage tests
  - `apps/web/src/components/ui/__tests__/button.test.tsx`
  - `apps/web/src/components/ui/__tests__/form-field.test.tsx`
  - `apps/web/src/components/ui/__tests__/section-header.test.tsx`

### Validation Completed

- `pnpm --filter web exec tsc --noEmit`
- `pnpm --filter web build`
- `pnpm --filter web test`
- Review round 2 completed with no unresolved `Critical` or `Warning` items.
- Design review completed with no unresolved `Critical` or `Warning` items.
- QA completed `4/4` personas with no failures.

### Remaining Follow-up

- Non-blocking UX follow-up ideas from review/QA:
  - collapse `matches` active filters closer to the search bar for faster mobile scanning
  - surface result-count feedback in `marketplace` after search/category changes
  - lower the visual weight of `팀 나가기` relative to the management CTA in `teams/[id]`
- Non-blocking brand exception:
  - social pills on `teams/[id]` remain an explicit social-brand exception

### Constraint Recorded

- The repository worktree already contained overlapping edits on several representative surface files and on `globals.css`.
- To avoid overwriting unrelated in-flight work, this execution intentionally completed the highest-value safe slice first: `primitive foundation + form consolidation + low-risk shared helper extraction`.

## Planning Report

### Project Director: Approved

- 기존 audit와 partial remediation은 충분히 쌓였다. 이제 같은 문제를 페이지별로 다시 고치는 대신 design system consolidation으로 묶는 것이 맞다.
- 이번 범위는 리디자인이 아니라 현재 MatchUp visual language를 유지한 채 재사용 구조를 닫는 작업으로 정의한다.
- 우선순위는 `primitive foundation -> form consolidation -> repeated surface normalization -> dark mode cleanup -> design/QA/docs` 순서로 고정한다.

### Tech Planner

- 현재 strongest layer는 `token + layout/shell pattern`이고, weakest layer는 `primitive + variant`다.
- 따라서 target shape는 `globals.css token -> components/ui primitive -> repeated surface pattern -> route migration`의 4층 구조여야 한다.
- `matches/new`, `marketplace/new`, `teams/new`의 duplicated `style jsx`를 첫 migration 대상으로 삼는 것이 기술부채 대비 효과가 가장 크다.
- dark mode는 broad global override를 당장 걷어내는 것이 아니라, migrated component coverage가 확보된 후 단계적으로 축소해야 한다.

## Context

Task 29, 30, 33, 41을 거치면서 MatchUp의 UI는 이미 여러 핵심 정리를 끝냈다.

- skip link, label, image fallback, brand alignment, mobile glass chrome 같은 기반 정리는 존재한다.
- `globals.css`에는 color, typography, motion, mobile glass token이 정리되어 있다.
- `MobilePageTopZone`, `MobileGlassHeader`, `BottomNav`, `EmptyState`, `ErrorState`, `SafeImage`, `MediaLightbox`, `TrustSignalBanner` 같은 shared pattern도 실제 화면에 퍼져 있다.

하지만 현재 상태는 “제품 UI가 작동하는 것”과 “디자인 시스템이 구조적으로 닫혀 있는 것” 사이에 있다.

현재 남은 핵심 갭:

1. `Button`, `Input`, `Textarea`, `Select`, `Card`, `FormField` 같은 primitive 계층이 없다.
2. `matches/new`, `marketplace/new`, `teams/new`는 거의 같은 form 스타일을 page-local `style jsx`로 중복 보유한다.
3. dark mode는 컴포넌트 variant보다 전역 `.dark` + `!important` override에 크게 의존한다.
4. public landing / auth / main app / admin surface가 같은 브랜드 톤 위에 있지만 accent, spacing, surface 언어가 아직 완전히 정렬되지는 않았다.
5. 새 페이지를 만들수록 shared abstraction보다 page-local utility 조합을 다시 쓰게 되는 구조다.

이 task의 목적은 “전면 리디자인”이 아니라, 이미 만들어진 MatchUp UI를 유지보수 가능한 design system shape로 끌어올리는 것이다.

## Goal

- MatchUp의 frontend UI를 `token -> primitive -> repeated surface -> route migration` 순서로 재정리한다.
- 반복되는 form/card/CTA 스타일을 shared primitive와 surface pattern으로 끌어올린다.
- dark mode와 semantic accent 사용을 현재보다 더 예측 가능한 구조로 정리한다.
- 기존 mobile glass chrome, trust-first tone, honest-data contract를 유지한 채 drift를 줄인다.

## Original Conditions (checkboxes)

- [x] 계획만 수립하고, 이번 턴에서는 구현하지 않는다.
- [x] 기존 MatchUp 브랜드 톤과 mobile-first language는 유지한다.
- [x] 새 리디자인이 아니라 consolidation / systemization 범위로 정의한다.
- [x] 최소 primitive layer 도입 방향을 task 범위에 포함한다.
- [x] create/edit form duplication과 one-off field styling을 우선 해소 대상으로 둔다.
- [x] public / auth / main / admin 사이의 drift를 정리 대상으로 포함한다.
- [x] dark mode broad override 의존을 줄이는 방향을 포함한다.
- [x] feature contract나 backend/API 변경은 범위에서 제외한다.
- [x] representative route validation 계획을 task 문서에 포함한다.

## Why Now

- Task 29는 audit를 했고, Task 30은 일부 접근성/폼 개선을 했으며, Task 33/41은 brand/public shell/mobile glass를 정리했다.
- 즉, 문제는 “무엇이 잘못됐는지 모른다”가 아니라, 조각 단위 개선은 있었지만 system consolidation이 아직 없다는 점이다.
- 현재 이 작업을 미루면 이후 feature task마다 create/edit/list/detail surface에서 동일한 결정과 보정이 반복된다.

## Evidence

- `.github/tasks/29-ux-design-audit.md`
- `.github/tasks/30-frontend-quality-improvements.md`
- `.github/tasks/33-brand-and-public-shell-alignment.md`
- `.github/tasks/41-mobile-glass-chrome-system.md`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/ui/**`
- `apps/web/src/components/layout/mobile-page-top-zone.tsx`
- `apps/web/src/components/layout/mobile-glass-header.tsx`
- `apps/web/src/components/layout/bottom-nav.tsx`
- `apps/web/src/app/landing/page.tsx`
- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/(main)/home/home-client.tsx`
- `apps/web/src/app/(main)/matches/matches-client.tsx`
- `apps/web/src/app/(main)/marketplace/page.tsx`
- `apps/web/src/app/(main)/teams/[id]/page.tsx`
- `apps/web/src/app/admin/dashboard/page.tsx`
- `apps/web/src/app/(main)/settings/account/page.tsx`
- `apps/web/src/app/(main)/matches/new/page.tsx`
- `apps/web/src/app/(main)/marketplace/new/page.tsx`
- `apps/web/src/app/(main)/teams/new/page.tsx`

## Baseline Findings

- `apps/web/src/app`에는 `<style jsx>` 기반 form style block이 최소 3곳 남아 있다.
  - `matches/new`
  - `marketplace/new`
  - `teams/new`
- `apps/web/src/app/globals.css`에는 `.dark` override `!important`가 55개 남아 있다.
- `components/ui`에는 state component는 있지만 `Button/Input/Card` 같은 primitive는 없다.
- `MobilePageTopZone`은 주요 진입 화면 다수에서 재사용되고, `MobileGlassHeader`도 상세 화면 다수에 퍼져 있다. 즉 shell pattern은 이미 성숙했지만 primitive layer가 비어 있다.

## In Scope

- `apps/web/src/components/ui/`에 최소 primitive layer 추가 또는 기존 shared UI를 primitive-friendly shape로 재구성
- form-heavy route의 shared field / input / textarea / select / button styling 정리
- list/detail/public/auth/admin shell에서 반복되는 card/surface/section header 패턴 정리
- dark mode broad override 중 component migration이 가능한 구간의 우선순위 정리 및 단계적 이관
- 기존 design token과 mobile glass language를 유지하면서 system rule을 문서화
- task 범위 validation 기준과 rollout wave 정의

## Out Of Scope

- brand color rebrand
- typography 교체
- admin IA 재설계
- 새로운 애니메이션 프레임워크 도입
- shadcn 같은 외부 UI kit 대규모 도입
- feature/domain contract 변경
- backend/API 변경
- landing 전면 마케팅 리디자인

## User Scenarios

### Scenario 1 — Consistent Form UX

Given 사용자가 매치/장터/팀 생성 폼을 오간다  
When 서로 다른 create flow를 경험한다  
Then input, label, help text, CTA, validation feedback의 시각 규칙이 동일한 언어로 보인다

### Scenario 2 — Stable Cross-Surface Brand

Given 사용자가 landing -> login -> home -> list -> detail로 이동한다  
When route group이 바뀐다  
Then 브랜드 톤은 유지되고, 필요한 맥락 차이만 남으며 갑작스러운 스타일 drift는 보이지 않는다

### Scenario 3 — Predictable Dark Mode

Given 사용자가 dark mode로 앱을 본다  
When list, detail, form, overlay를 오간다  
Then 대비와 surface hierarchy가 일관되고 특정 utility override에 의해 예상치 못한 색상이 튀지 않는다

### Scenario 4 — Trust-First Decision Surface

Given 사용자가 결제, 리뷰, 티켓, 구장, 거래 관련 화면을 본다  
When 상태/경고/신뢰 신호를 읽는다  
Then 색상만이 아니라 구조와 copy로도 상태를 이해할 수 있다

## Test Scenarios

### Happy Path

- primitive 도입 후 create/edit/list/detail representative routes가 기존 기능 회귀 없이 렌더된다.
- `matches/new`, `marketplace/new`, `teams/new`, `login`, `settings/account`가 shared field/input/button 스타일을 공통 사용한다.
- `landing`, `login`, `home`, `matches`, `marketplace`, `teams/[id]`, `admin/dashboard`에서 surface language가 지정된 규칙을 따른다.

### Edge Cases

- dark mode 전환 시 기존 `bg-white`, `text-gray-*`, chip/badge/card style이 readable pair를 유지한다.
- reduced motion 환경에서 existing motion-safe behavior가 깨지지 않는다.
- social login CTA는 brand color exception을 유지하되 주변 form layout과 충돌하지 않는다.
- image-heavy detail surface와 modal/lightbox가 새 primitive layer와 충돌하지 않는다.
- mobile glass chrome과 dense content surface가 시각적으로 충돌하지 않는다.

### Error Cases

- error / empty / unsupported / trust-signal 상태가 generic gray fallback이 아니라 shared state pattern으로 유지된다.
- shared button/input migration 중 one-off route-level override가 남아도 기능 회귀 없이 점진 이관 가능해야 한다.

## Architecture Assessment

- 현재 시스템의 strongest layer는 `token + layout pattern`이다.
- weakest layer는 `primitive + variant layer`다.
- 따라서 이번 task의 target shape는 “디자인 토큰을 다시 만드는 것”이 아니라 `primitive -> surface composition -> route-level adoption`의 3단 구조를 만드는 것이다.

### Recommended Target Shape

1. `globals.css`
   - token / motion / global fallback만 유지
2. `components/ui/primitives` 또는 동등한 shared layer
   - `Button`
   - `Input`
   - `Textarea`
   - `Select`
   - `Card`
   - `FormField`
   - `SectionHeader`
3. feature routes
   - page-specific spacing/content decision만 담당
   - 색상/테두리/입력 상태/CTA shape는 shared variant 사용

이 구조는 현재 코드베이스에 가장 읽기 쉽고, 기존 톤을 살리면서 부채를 줄이는 방향이다.

## Execution Waves

### Wave 0 — Design Contract Freeze

- existing token, accent, typography, glass usage rule을 frozen contract로 명시한다.
- 예외 목록을 먼저 고정한다.
  - social brand buttons
  - mobile glass chrome
  - trust/status semantic banners

### Wave 1 — Primitive Foundation

- 최소 primitive set을 추가한다.
- 새 primitive는 current MatchUp tone에 맞춰 thin abstraction으로 유지한다.
- broad `one-size-fits-all` abstraction은 만들지 않는다.

### Wave 2 — Form Consolidation

- auth/account track
  - `login`
  - `settings/account`
- create/edit track
  - `matches/new`
  - `marketplace/new`
  - `teams/new`

폼 계열부터 공통화한다. 현재 duplication과 drift가 가장 명확하기 때문이다.

### Wave 3 — Surface Consolidation

- public/auth/app track
  - `landing`
  - `home`
  - `matches`
  - `marketplace`
- detail/admin track
  - `teams/[id]`
  - `admin/dashboard`

card, section header, chip, CTA tone을 공통 규칙으로 정리한다.

### Wave 4 — Dark Mode Cleanup

- component migration이 끝난 구간부터 global `!important` override 의존을 줄인다.
- 전역 규칙 제거는 마지막에 한다. 먼저 component coverage를 확보해야 한다.
- accent 사용 규칙을 맞춘다.
  - blue = primary action / primary emphasis
  - semantic colors = trust/status/secondary data signal only

### Wave 5 — Validation And Docs

- visual/a11y regression 확인
- representative route smoke
- follow-up debt와 non-migrated surface 기록
- docs/task write-back

## Parallel Work Breakdown

### Sequential First

- primitive foundation (`ui/*`)는 단일 오너가 먼저 만든다.
- shared token/variant shape가 확정되기 전에는 route migration을 병렬화하지 않는다.

### Parallel After Foundation

- Wave 2 이후 create/edit/auth/account 폼은 route 단위 병렬 가능
- Wave 3 이후 list/detail/public/admin shell도 route 단위 병렬 가능

### Suggested Ownership

- Frontend foundation owner
  - `components/ui/**`
  - `globals.css`
  - shared layout helpers
- Route migration owner A
  - create/edit/auth/account routes
- Route migration owner B
  - public/auth shell + discovery/detail/admin routes
- Review focus
  - frontend-review: abstraction leakage / regression
  - design review: tone consistency
  - QA: route smoke + dark mode + mobile touch targets

## Owned Write Scope

- `apps/web/src/app/globals.css`
- `apps/web/src/components/ui/**`
- `apps/web/src/components/layout/mobile-page-top-zone.tsx`
- `apps/web/src/components/layout/mobile-glass-header.tsx`
- `apps/web/src/components/layout/bottom-nav.tsx`
- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/(main)/settings/account/page.tsx`
- `apps/web/src/app/(main)/matches/new/page.tsx`
- `apps/web/src/app/(main)/marketplace/new/page.tsx`
- `apps/web/src/app/(main)/teams/new/page.tsx`
- `apps/web/src/app/(main)/home/home-client.tsx`
- `apps/web/src/app/(main)/matches/matches-client.tsx`
- `apps/web/src/app/(main)/marketplace/page.tsx`
- `apps/web/src/app/(main)/teams/[id]/page.tsx`
- `apps/web/src/app/admin/dashboard/page.tsx`
- related tests / docs

## Must Not Touch

- `.env*`
- backend domain/API contract
- payments / lesson / marketplace business logic
- upload transport logic
- mobile glass chrome를 full-surface theme로 확대하는 변경
- one-off cosmetic refactor만 하고 shared abstraction을 남기지 않는 변경

## Acceptance Criteria

- `components/ui`에 MatchUp tone에 맞는 최소 primitive layer가 생긴다.
- `matches/new`, `marketplace/new`, `teams/new`가 duplicated local field styling 없이 shared primitive를 사용한다.
- representative list/detail/public/auth/admin routes가 shared card/header/button/input language를 사용한다.
- `login`과 `settings/account`도 같은 form language를 사용한다.
- dark mode가 broad `!important` override에만 의존하지 않고, migrated surface는 component-level pair로 설명 가능해진다.
- 기존 mobile glass rule은 유지되며, dense content surface는 solid 원칙을 계속 지킨다.
- Task 33의 brand/public shell alignment를 깨지 않는다.
- task 종료 시 남은 non-migrated routes와 follow-up debt가 문서에 분명히 남는다.

## Validation

- `pnpm --filter web exec tsc --noEmit`
- `pnpm --filter web test`
- route grep / drift audit
  - `rg -n "<style jsx|style jsx" apps/web/src/app`
  - `rg -n "bg-\\[#|text-\\[#|border: 1px solid #|background: #" apps/web/src/app apps/web/src/components`
- targeted component tests
  - `apps/web/src/components/ui/**`
- targeted browser smoke
  - `/landing`
  - `/login`
  - `/home`
  - `/matches`
  - `/matches/new`
  - `/marketplace`
  - `/marketplace/new`
  - `/teams/new`
  - `/teams/:id`
  - `/admin/dashboard`
- dark mode manual check
  - `375px`
  - `768px`
  - `1024px`
  - `1440px`

## Tech Debt Resolved

- duplicated create-form field styling
- page-level one-off button/input/card variants
- unclear boundary between token layer and route layer
- missing primitive layer in `components/ui`
- part of dark-mode override debt where component migration is complete
- unclear semantic accent boundaries across public/app/admin surfaces

## Security Notes

- 이번 task는 visual/system refactor지만, auth/login/create flow를 건드리므로 redirect/auth gate/submit binding은 회귀 없이 유지해야 한다.
- shared primitive 도입 시 disabled/loading/focus state가 기존 action safety를 약화시키면 안 된다.
- form abstraction 과정에서 DTO와 무관한 UI-only field가 submit payload로 다시 흘러들어가면 안 된다.
- UI refactor가 mock/sample/unsupported state를 실제 가능 기능처럼 보이게 만들면 안 된다.

## Risks & Dependencies

### Main Risks

- abstraction 과잉으로 현재 코드보다 읽기 어려워질 수 있다.
- dark mode cleanup을 너무 이르게 시작하면 예상치 못한 visual regression이 넓게 날 수 있다.
- list/detail/form을 한 번에 만지면 review 범위가 과도하게 커진다.
- dirty worktree가 큰 상태라 shared files 변경 시 충돌 가능성이 높다.

### Dependencies

- Task 29 audit findings
- Task 30 form/accessibility cleanup evidence
- Task 33 brand/public shell alignment
- Task 41 mobile glass chrome rules

## Ambiguity Log

- 2026-04-11 — 이 task는 “리디자인”이 아니라 “consolidation”으로 정의한다.
- 2026-04-11 — primitive layer는 추가하되, 외부 UI kit 도입이나 heavy abstraction은 이번 범위 밖으로 둔다.
- 2026-04-11 — dark mode 전역 override 제거는 목표가 아니라 결과다. component migration coverage가 확보된 후에만 축소한다.
- 2026-04-11 — social login button의 brand color는 design-system exception으로 유지한다.
- 2026-04-11 — admin은 consumer UI와 완전히 동일한 skin으로 통일하지 않는다. 같은 제품 언어 안에서 operational density를 유지한다.

## Next Action

This task is complete. Future work should track the non-blocking follow-up notes above as separate route-level improvements, not as blockers for Task 45 closure.
