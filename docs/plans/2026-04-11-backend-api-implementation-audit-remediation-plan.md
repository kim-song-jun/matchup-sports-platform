# Backend API Implementation Audit Remediation Plan

Date: 2026-04-11
Scope: `apps/api` implementation quality against `docs/api/**`
Status: Completed

## Executive Summary

`docs/api/**`를 기준으로 spot-check한 결과, 공개/핵심 도메인의 기본 contract는 대체로 성립하지만, 몇몇 surface는 아직 “문서화된 canonical contract를 안정적으로 구현한다” 수준까지 닫히지 않았다.

가장 큰 문제는 다음 네 축이다.

1. capability gating이 summary/document intent와 다르게 열려 있는 route
2. pagination / query parsing / error / body typing이 domain마다 달라지는 consistency debt
3. admin/support surface의 weak typing 또는 in-memory persistence
4. 이미 caution으로 문서화된 영역이 실제 remediation backlog로 연결되지 않은 상태

이번 문서는 후속 구현을 위한 audit findings와 remediation roadmap을 정리한다.

## Audit Method

### Source Of Truth Priority

1. `docs/api/**`
2. `apps/api/src/**/*controller.ts`
3. `apps/api/src/**/dto/*.ts`
4. `apps/api/src/**/*.service.ts`
5. `apps/api/test/integration/*.e2e-spec.ts` + `apps/api/src/**/*.spec.ts`
6. `apps/web/src/hooks/use-api.ts` / `apps/web/src/types/api.ts` (consumer impact 확인용)

### What Was Audited

- auth/capability gating
- request validation completeness
- pagination/query parsing consistency
- response shape consistency
- admin/support persistence and auditability
- duplicated helper/pattern existence
- docs/api와 코드 사이의 남은 caution surface

## Severity Rubric

- `P0` — security or contract blocker. 다음 구현 wave에서 우선 수정 필요.
- `P1` — user-visible inconsistency or repeated integration tax. 빠른 후속 권장.
- `P2` — maintainability / duplication / governance debt. 구조 개선 wave에서 처리.

## Confirmed Findings

### F-001 `POST /badges/team/:teamId` capability gating mismatch

- Priority: `P0`
- Category: security / contract correctness
- Evidence:
  - `apps/api/src/badges/badges.controller.ts`
  - summary는 `팀 뱃지 부여 (관리자)`인데 `JwtAuthGuard`/`AdminGuard`가 없다.
- Impact:
  - frontend가 문서를 믿고 관리자-only surface로 취급해도 실제로는 public mutation이 열려 있다.
  - production에서 badge issuance abuse surface가 된다.
- Recommended action:
  - `JwtAuthGuard + AdminGuard` 추가
  - request body DTO 도입
  - award action audit trail 필요 여부를 같이 결정

### F-002 `auth/apple` route exposed but not implemented

- Priority: `P0`
- Category: capability gating / auth contract
- Evidence:
  - `apps/api/src/auth/auth.controller.ts`
  - `apps/api/src/auth/auth.service.ts`
  - `oauthLogin()`은 `kakao`, `naver` 외 provider에 `UnauthorizedException("not yet implemented")`
- Impact:
  - route exists, Swagger/doc surface exists, but capability is operationally unavailable
  - frontend는 “지원되는 로그인”처럼 오해할 수 있다
- Recommended action:
  - implement Apple auth or explicitly disable/hide route from public contract
  - docs/api와 UI availability를 함께 정리

### F-003 notifications list contract is internally inconsistent

- Priority: `P0`
- Category: pagination / validation
- Evidence:
  - `apps/api/src/notifications/notifications.controller.ts`
  - `apps/api/src/notifications/notifications.service.ts`
- Observed gap:
  - query에 `cursor`, `limit`를 받지만 response는 array only라 cursor metadata가 없다
  - controller가 `limit ? parseInt(limit, 10) : undefined`만 수행해 `limit=abc`면 `NaN`이 service까지 간다
  - service는 `{ isRead, cursor, limit = 20 }` destructuring을 쓰므로 `NaN`이 default로 정규화되지 않는다
- Impact:
  - frontend infinite list 계약이 모호하다
  - invalid query handling이 다른 list endpoint와 다르다
- Recommended action:
  - `NotificationQueryDto` 도입
  - `items + nextCursor` 또는 explicit array-only contract 중 하나로 확정
  - invalid `limit` normalization policy 통일

### F-004 disputes surface is still in-memory admin state

- Priority: `P0`
- Category: persistence / ops integrity
- Evidence:
  - `apps/api/src/disputes/disputes.service.ts`
- Impact:
  - admin/dispute processing 결과가 재시작에 안전하지 않다
  - 운영 기록, 상태 변경, 감사 추적의 신뢰도가 낮다
- Recommended action:
  - Prisma persistence로 전환하거나
  - canonical contract에서 transitional/admin-demo surface로 명시 분리

### F-005 DTO-less raw-body mutations remain on important surfaces

- Priority: `P1`
- Category: validation / consistency
- Evidence:
  - `apps/api/src/venues/venues.controller.ts` — `POST /venues/:id/reviews`
  - `apps/api/src/reviews/reviews.controller.ts` — `POST /reviews`
  - `apps/api/src/disputes/disputes.controller.ts` — `POST /admin/disputes`, `PATCH /admin/disputes/:id/status`
  - `apps/api/src/settlements/settlements.controller.ts` — `PATCH /admin/settlements/:id/process`
  - `apps/api/src/badges/badges.controller.ts` — `POST /badges/team/:teamId`
- Impact:
  - `ValidationPipe` 보호를 거의 못 받는다
  - frontend payload drift가 늦게 발견된다
  - Swagger schema 품질도 떨어진다
- Recommended action:
  - mutation DTO policy 수립
  - raw-body surface를 DTO 기반으로 치환
  - weakly typed 불가피한 필드는 explicit `CAUTION` + contract test 추가

### F-006 pagination shape is fragmented across domains

- Priority: `P1`
- Category: contract consistency
- Evidence:
  - `items + nextCursor`: matches, teams, team-matches, lessons, marketplace, mercenary, tournaments, users history, admin lists
  - `data + nextCursor + hasMore`: chat rooms/messages
  - bare array: notifications, venues, some supporting domains
- Impact:
  - frontend query abstraction이 domain별 예외로 찢어진다
  - docs가 아무리 좋아도 구현 tax가 누적된다
- Recommended action:
  - list contract standard를 하나 정하거나
  - 최소한 “cursor list”, “non-cursor list”, “chat legacy list”를 명시적으로 분류하고 helper를 분리

### F-007 query parsing policy is duplicated and inconsistent

- Priority: `P1`
- Category: duplication / consistency
- Evidence:
  - manual parse+clamp: `teams`, `lessons`, `marketplace`, `notifications`
  - DTO/class-transformer: `matches`, `mercenary`, `chat`, `tournaments`
- Impact:
  - 동일한 `limit=abc`도 endpoint마다 다른 결과가 난다
  - controller마다 같은 parse/clamp 코드가 반복된다
- Recommended action:
  - list query DTO + shared pagination helper 도입
  - domain별 exceptions를 줄이고 default/clamp policy를 공통화

### F-008 duplicate optional JWT guard implementation exists

- Priority: `P2`
- Category: duplication / maintainability
- Evidence:
  - `apps/api/src/common/guards/optional-jwt-auth.guard.ts`
  - `apps/api/src/mercenary/guards/optional-jwt-auth.guard.ts`
- Impact:
  - 같은 역할의 guard가 두 군데 있으면 behavior drift 위험이 생긴다
- Recommended action:
  - common guard 하나로 통합
  - mercenary는 common guard를 재사용

### F-009 error payload normalization burden is still high

- Priority: `P2`
- Category: consistency / DX
- Evidence:
  - `apps/api/src/common/filters/http-exception.filter.ts`
  - 일부 domain은 `message: string`
  - validation은 `message: string[]`
  - chat/websocket related surface는 `message: { code, message }` object 사례가 문서화돼 있음
- Impact:
  - frontend가 endpoint마다 defensive parsing을 유지해야 한다
- Recommended action:
  - domain error envelope policy 수립
  - `code/message/details` 구조로 점진 정규화 검토

## Duplication / Improvement Themes

### 1. Pagination Governance

- duplicated parse+clamp
- fragmented list shapes
- missing explicit query DTO on some list endpoints

### 2. Mutation DTO Policy

- raw-body mutation이 “예외”가 아니라 여러 도메인에 반복됨
- DTO 도입만으로 validation, Swagger, docs, frontend typing이 동시에 좋아진다

### 3. Capability Gating Policy

- summary/document intent와 actual guard가 어긋나는 surface가 존재
- “route exists but feature unavailable” 상태를 계약에서 어떻게 표현할지 정책 필요

### 4. Admin / Support Surface Integrity

- in-memory admin surface는 운영용 contract로 보기 어렵다
- persistent auditability가 없는 관리자 액션은 점점 risk가 커진다

### 5. Contract Verification Workflow

- docs/api가 source of truth라면, controller/service/doc drift를 잡는 lightweight audit harness가 필요하다

## Remediation Roadmap

### Wave 1 — Contract Blockers (`P0`)

1. `badges` award route auth hardening + DTO 도입
2. `auth/apple` implement-or-hide 결정
3. `notifications` list query/response normalization
4. `disputes` canonicality 결정
   - production persistence로 올릴지
   - transitional/demo contract로 명시 분리할지

### Wave 2 — Consistency Debt (`P1`)

1. raw-body mutation DTO rollout
   - venues reviews
   - reviews create
   - disputes create/update
   - settlements process
2. pagination/query helper 공통화
3. list response shape taxonomy 확정

### Wave 3 — Maintainability (`P2`)

1. optional JWT guard dedupe
2. domain error code / message normalization
3. docs/api compliance checklist 또는 audit script 도입

## Validation Strategy For Follow-up Implementation

- backend
  - targeted unit/integration tests for each route fixed
  - permission tests for auth-gated mutations
  - invalid query / invalid body tests for newly DTO-ized endpoints
- frontend impact
  - `use-api.ts` consumer spot-check
  - affected hooks/tests sync
- docs
  - `docs/api/**` same-PR update
  - stale caution removal only after code + tests close the gap

## Recommended Task Split

- Task 53 — secure badge/admin capability gating
- Task 54 — normalize notifications pagination contract
- Task 55 — replace raw-body mutation surfaces with DTOs
- Task 56 — dispute/ops persistence hardening
- Task 57 — pagination/query helper unification
- Task 58 — optional auth / error envelope governance cleanup

## Out Of Scope For This Turn

- backend code changes
- frontend hook rewrites
- E2E expansion
- Prisma migration authoring
