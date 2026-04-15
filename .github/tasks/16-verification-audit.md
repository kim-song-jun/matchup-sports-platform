# 16 — Verification Audit (Phase 1)

> **Parent plan**: `/Users/kimsungjun/.claude/plans/enumerated-scribbling-popcorn.md`
> **Wave**: 0 (사전 검증, 다른 task의 입력값을 확정하는 단계)
> **Owner**: orchestrator + Explore agents
> **Status**: pending
> **Estimated PRs**: 1 (verification-report.md만 추가, 코드 변경 없음)

---

## Context

사용자가 프로덕션 화면에서 `React error #310` 크래시와 `팀 매치 상세 페이지의 경기방식/매치 유형 빈 필드`를 발견했다. 표면 증상은 2개지만, 사전 Explore 결과 backend/frontend/infra 전반에 누락 필드, 검증 우회 DTO, 미구현 UI, fail-soft deploy 등 광범위한 부채가 잠재해 있을 가능성이 큼.

이 task의 목적은 **수정을 시작하기 전에**, 의심되는 모든 영역을 사실로 확정하는 것이다. 결과는 단일 산출물 (`.github/tasks/16-verification-report.md`)로 정리되어, 17~20번 task의 입력값이 된다.

## Goal

read-only 검증만 수행하여:
1. React #310의 진범 페이지를 sourcemap으로 식별
2. 51개 page route 각각의 데이터 fetch 상태를 표로 정리
3. Frontend 타입 vs Prisma schema의 drift 매트릭스 작성
4. 현재 테스트 게이트(typecheck/unit/integration/e2e)의 실측 통과 상태 캡처

수정은 **금지**. 수정은 17~20에서 한다.

## Original Conditions (사용자 요청 체크리스트)

- [ ] 기술 검증 — 실제 구현이 되어있는지부터 확인
- [ ] 페이지 검증 — 모든 라우트가 의도대로 동작하는지 확인
- [ ] 개선할 점 식별
- [ ] 개선 계획 수립 (이 task가 그 계획의 입력)

---

## Phase 1.1 — React #310 진범 식별

> Wave A (단독, sourcemap 빌드 1회)

### Background
프로덕션 에러 trace:
```
Error: Minified React error #310
  at E (page-42b09a0ef3e9b188.js:1:21173)
  at l9 (...) ← React render
  ...useEffect...
```
- React #310 = "Rendered more hooks during this render than during the previous render"
- `E` 함수 = 단일 page component (Next.js App Router page.tsx의 default export)
- hash `page-42b09a0ef3e9b188.js`는 빌드별로 바뀌므로 sourcemap 필요

### Steps

- [ ] **1.1.1** `apps/web/next.config.ts`에 `productionBrowserSourceMaps: true` 임시 추가 (커밋하지 않음, 검증 후 revert)
- [ ] **1.1.2** `pnpm --filter @teameet/web build` 실행
- [ ] **1.1.3** `.next/static/chunks/app/`에서 `page-42b09a0ef3e9b188.js` 또는 가장 최근 빌드 hash 확인
  - 빌드 hash가 매번 바뀌므로, prod와 동일한 commit/env로 빌드해야 매칭됨
  - prod commit SHA 확인: deploy log 또는 `git log --grep deploy`
- [ ] **1.1.4** 해당 파일의 `.map`을 `source-map-explorer` 또는 Chrome devtools에서 열어 `E` 함수가 어느 source file에 매핑되는지 확인
- [ ] **1.1.5** 후보 페이지 사전 점검 (sourcemap 없이도 가능):
  - [ ] `apps/web/src/app/(main)/payments/checkout/page.tsx` — Toss SDK lifecycle, useEffect로 widget 마운트
  - [ ] `apps/web/src/app/(main)/chat/[id]/page.tsx` — Socket subscribe in useEffect
  - [ ] `apps/web/src/app/(main)/team-matches/[id]/page.tsx` — status 조건부 분기
  - [ ] `apps/web/src/app/(main)/lessons/[id]/page.tsx` — 일정 캘린더 + 예약 분기
  - [ ] `apps/web/src/app/(main)/marketplace/[id]/page.tsx`
  - [ ] `apps/web/src/app/(main)/matches/[id]/page.tsx`
  - 각 파일에서 다음 패턴 확인:
    - early return 이후의 hook 호출
    - `if (...) useEffect(...)` 같은 조건부 hook
    - `useMemo` 안에서 다른 hook
    - children list에서 동적 hook 호출
- [ ] **1.1.6** 진범 파일 + line + 패턴을 검증 리포트에 기록
- [ ] **1.1.7** `next.config.ts` 임시 변경 revert (production sourcemap은 보안상 끔)

### Acceptance
진범 파일 1개 (또는 N개)와 정확한 line + 위반 패턴을 리포트에 기록. **수정은 task 18에서.**

---

## Phase 1.2 — 51개 페이지 라우트 스모크 검증

> Wave B (병렬 가능, Explore agent 활용)

### Background
사전 enumerate 결과 51개 page.tsx 발견 (apps/web/src/app/**). 각각이 실제로 동작하는지 사실 기반으로 표를 만든다.

### Steps

- [ ] **1.2.1** Explore agent 1: `/(main)` 라우트 전수 (home, matches, team-matches, mercenary, marketplace, lessons, venues, teams, chat, payments, settings, my, user) — 약 30개
- [ ] **1.2.2** Explore agent 2: `/admin/*` 라우트 전수 (statistics, payments, settlements, disputes, matches, lessons, venues, team-matches, users, teams, mercenary, reviews, lesson-tickets, dashboard) — 약 20개
- [ ] **1.2.3** Explore agent 3: `/(auth)`, `/landing`, `/guide`, `/faq`, `/about` 등 외곽 라우트
- [ ] **1.2.4** 각 페이지에 대해 다음 컬럼으로 표 작성:

| 컬럼 | 의미 | 예시 값 |
|------|------|---------|
| Route | URL path | `/team-matches/[id]` |
| File | 절대 경로 | `apps/web/src/app/(main)/team-matches/[id]/page.tsx` |
| Auth | useRequireAuth 사용 | `Y` / `N` / `N/A (public)` |
| Data fetch | 실 API 호출 여부 | `useTeamMatch()` / `mock` / `static` |
| Empty state | EmptyState 컴포넌트 사용 | `Y` / `inline` / `none` |
| Error state | ErrorState 컴포넌트 사용 | `Y` / `inline` / `none` |
| Hook risk | early return 이후 hook | `OK` / `RISK:line` |
| Schema drift | 응답 필드 누락 | `OK` / `missing: gameFormat,...` |
| Notes | 기타 발견 | TODO 코멘트, dead import 등 |

- [ ] **1.2.5** 표를 검증 리포트에 첨부

### Acceptance
51개 페이지 모두에 대한 표 + 빨간 줄(Critical) 페이지 5개 이내로 추려서 highlight.

---

## Phase 1.3 — Frontend ↔ Prisma schema drift 매트릭스

> Wave B (병렬, single-file 비교)

### Background
이미 발견된 drift: TeamMatch 6필드. 다른 모델도 같은 패턴이 있을 수 있음.

### Steps

- [ ] **1.3.1** `apps/web/src/types/api.ts` 전체 read → 모델 인터페이스 추출
- [ ] **1.3.2** `apps/api/prisma/schema.prisma` 전체 read → model 정의 추출
- [ ] **1.3.3** 다음 모델별로 `frontend interface field` ↔ `prisma model field` 매트릭스:
  - [ ] `User` / `UserProfile`
  - [ ] `Match`
  - [ ] `TeamMatch` (이미 6개 알려짐, 추가 확인)
  - [ ] `SportTeam` / `Team`
  - [ ] `Lesson` / `LessonTicket`
  - [ ] `MarketplaceListing` / `MarketplaceOrder`
  - [ ] `Mercenary` / `MercenaryApplication`
  - [ ] `Venue`
  - [ ] `ChatRoom` / `ChatMessage`
  - [ ] `Notification`
  - [ ] `Payment` / `Settlement`
  - [ ] `Review`
- [ ] **1.3.4** 각 매트릭스에서 다음 표시:
  - ✅ `both` — schema에도 있고 frontend type에도 있음
  - 🟥 `frontend-only` — frontend가 기대하지만 schema에 없음 (drift)
  - 🟨 `schema-only` — schema에는 있지만 frontend가 사용 안 함
- [ ] **1.3.5** 🟥만 모아서 우선순위 결정 (사용자 화면에 노출되면 P0)

### Acceptance
12개 모델 매트릭스 + 🟥 필드 종합 리스트.

---

## Phase 1.4 — 테스트/빌드 게이트 실측

> Wave C (sequential, 환경 의존)

### Background
CI는 deploy 전 typecheck/lint/test를 돌리지만, 로컬에서 현재 main의 게이트가 실제 통과하는지 확인하지 않았다.

### Steps

- [ ] **1.4.1** 사전 확인: docker compose up (PostgreSQL + Redis) — integration 테스트 의존
  ```bash
  cd /Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform
  docker compose up -d
  ```
- [ ] **1.4.2** Frontend typecheck:
  ```bash
  pnpm --filter @teameet/web exec tsc --noEmit
  ```
  → 에러 개수, 파일별 카운트 기록
- [ ] **1.4.3** Backend typecheck:
  ```bash
  pnpm --filter @teameet/api exec tsc --noEmit
  ```
- [ ] **1.4.4** Frontend unit (Vitest):
  ```bash
  pnpm --filter @teameet/web test -- --run
  ```
  → suite/case 통과율 기록
- [ ] **1.4.5** Backend unit (Jest):
  ```bash
  pnpm --filter @teameet/api test
  ```
- [ ] **1.4.6** Backend integration (Supertest):
  ```bash
  pnpm --filter @teameet/api test:integration
  ```
- [ ] **1.4.7** E2E list (실행 X, dry):
  ```bash
  cd e2e && npx playwright test --list
  ```
- [ ] **1.4.8** Lint:
  ```bash
  pnpm lint
  ```
- [ ] **1.4.9** 모든 결과를 리포트의 "Baseline Test Health" 섹션에 기록

### Acceptance
6개 명령의 실측 결과 (pass/fail 카운트 + 실패 시 첫 5줄 stderr).

---

## Phase 1.5 — 검증 리포트 작성 & 후속 task 핸드오프

> Wave D (final, sequential)

### Steps

- [ ] **1.5.1** `.github/tasks/16-verification-report.md` 파일 신규 작성, 다음 섹션 구조:
  ```markdown
  # 16 — Verification Audit Report
  ## Phase 1.1 — React #310 진범
  ## Phase 1.2 — 페이지 라우트 표
  ## Phase 1.3 — Schema drift 매트릭스
  ## Phase 1.4 — Baseline Test Health
  ## Findings Summary (Critical/Warning/Info)
  ## Handoff
    - task 17 (TeamMatch fields) inputs: ...
    - task 18 (React #310 fix) target file: ...
    - task 19 (Admin DTO + image-upload) confirmed scope: ...
    - task 20 (deploy/security) confirmed scope: ...
  ```
- [ ] **1.5.2** 17~20번 task 문서가 참조할 수 있도록 핸드오프 섹션을 명확히 작성
- [ ] **1.5.3** 사용자에게 보고 — Critical 항목 / 새로 발견된 항목이 있으면 17~20번 task 수정 필요 여부 확인

### Acceptance
- 리포트 파일이 단일 markdown으로 존재
- 각 후속 task의 "Open Questions" 섹션이 이 리포트로 답변됨

---

## User Scenarios

이 task는 검증만 수행하므로 사용자 노출 시나리오 없음. 산출물(리포트)이 다음 task들의 입력.

## Test Scenarios

- **Happy**: 모든 4개 phase 통과, 리포트 생성 성공
- **Edge**: sourcemap 빌드 시 메모리 부족 → `NODE_OPTIONS=--max-old-space-size=4096` 재시도
- **Error**: 진범 페이지 식별 실패 → 후보 페이지를 모두 task 18 범위에 포함하는 fallback 채택
- **Mock updates**: 없음 (read-only)

## Parallel Work Breakdown

| Wave | Phase | 병렬 가능 | 의존성 |
|------|-------|-----------|--------|
| A | 1.1 | 단독 (build) | 없음 |
| B | 1.2, 1.3 | 동시 가능 (read-only Explore agents) | 없음 |
| C | 1.4 | sequential (port/DB 공유) | docker compose 준비 |
| D | 1.5 | 최종 정리 | A+B+C 완료 |

전체 wave A→B→C→D 순. B는 A와 동시 진행 가능 (서로 다른 파일 영역).

## Acceptance Criteria

- [ ] `.github/tasks/16-verification-report.md` 파일 존재
- [ ] React #310 진범 또는 후보 리스트가 line 단위로 명시
- [ ] 51개 페이지 표 작성
- [ ] 12개 모델 schema drift 매트릭스 작성
- [ ] 6개 검증 명령 실측 결과 기록
- [ ] task 17~20의 inputs/scope가 핸드오프 섹션에 명시
- [ ] **코드 변경 zero** (next.config.ts 임시 변경은 commit 금지)

## Tech Debt Resolved

이 task 자체는 코드 부채를 해결하지 않음. 부채 식별만 수행. 17~20에서 해결.

## Security Notes

- `productionBrowserSourceMaps: true`는 임시 검증용. 검증 후 즉시 revert. **commit 금지** — sourcemap이 prod에 노출되면 코드 reverse engineering 가능
- read-only 검증이므로 다른 보안 영향 없음

## Risks & Dependencies

- **Risk R1**: 진범 hash가 prod와 로컬 빌드에서 다를 수 있음 (commit/env 차이) → mitigation: prod commit SHA 일치 후 빌드
- **Risk R2**: integration 테스트가 docker compose 의존 → 로컬 환경 사전 점검
- **Dependency D1**: Phase 1.4는 Phase 1.1보다 먼저 시작 가능 (독립)

## Ambiguity Log

- **Q1**: 진범 페이지 식별 실패 시 대응? → fallback: 모든 후보를 task 18 scope에 포함
- **Q2**: 51개 page enumerate가 맞는지? → glob `apps/web/src/app/**/page.tsx` 카운트로 재확인
- **Q3**: 검증 리포트는 commit 대상인가, 일회성인가? → commit (작업 이력 보존)
