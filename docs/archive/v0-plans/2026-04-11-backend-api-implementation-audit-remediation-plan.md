# Backend API Implementation Audit Remediation Plan

Date: 2026-04-11
Scope: `docs/api/**` 대비 `apps/api` 구현 감사 및 후속 remediation 설계
Status: Completed

## 1. Goal

이 문서의 목적은 이미 정리된 `docs/api/**` 계약을 기준으로 실제 백엔드 구현이 어디까지 일치하는지 감사하고, 불일치/중복/개선 포인트를 우선순위가 있는 remediation roadmap으로 고정하는 것이다.

이번 작업은 계획/감사 문서화까지가 범위이며, 실제 코드 remediation은 포함하지 않는다.

## 2. Audit Basis

### Source Of Truth Priority

1. `docs/api/**`
2. `apps/api/src/**/*controller.ts`
3. `apps/api/src/**/dto/*.ts`
4. `apps/api/src/**/*.service.ts`
5. `apps/api/src/**/*.spec.ts`, `apps/api/test/integration/*.e2e-spec.ts`
6. `apps/web/src/hooks/use-api.ts`, `apps/web/src/types/api.ts`

### Audit Posture

- Swagger만으로 계약을 확정하지 않는다.
- route summary보다 guard/service 동작을 우선 사실로 본다.
- DTO가 없으면 controller body/query parse와 service 입력 가정을 직접 본다.
- optional-auth surface는 “정상적 차이”와 “드리프트 리스크”를 구분해서 분류한다.

## 3. Audit Dimensions

| Dimension | What To Audit | Current Hotspots | Done Condition |
| --- | --- | --- | --- |
| Capability gating | summary/docs가 말하는 접근 제어와 실제 guard/service gate가 일치하는지 | `badges`, `auth/apple`, 일부 admin/support surface | route visibility, guard, service permission, docs wording이 같은 의미를 갖는다 |
| Request typing and validation | mutation/query가 DTO + `ValidationPipe` 보호를 받는지 | `badges`, `reviews`, `venues/:id/reviews`, `disputes`, `settlements` | DTO 없는 raw-body mutation이 예외 수준으로 축소되거나 정책적으로 명시된다 |
| Pagination and query normalization | cursor/limit/filter 파싱과 응답 shape가 도메인별로 일관적인지 | `notifications`, `teams`, `lessons`, `marketplace`, `chat` | 같은 종류의 list endpoint는 같은 query normalization과 metadata policy를 사용한다 |
| Response contract stability | list/detail envelope, metadata, error shape가 consumer 입장에서 예측 가능한지 | `notifications`, `chat`, validation error surface | frontend가 domain별 ad hoc parsing 없이 공통 helper를 적용할 수 있다 |
| Optional-auth variance | 로그인 여부에 따라 응답 shape가 달라질 때 그 차이가 문서/테스트에 고정돼 있는지 | `teams/:id/hub`, `mercenary/:id`, `venues/:id/hub` | auth state별 response delta가 명시되고 integration/spec로 잠긴다 |
| Persistence and auditability | 관리자/운영성 데이터가 재시작/다중 인스턴스/감사 추적에 안전한지 | `disputes` | 운영 판단이 개입되는 상태는 durable persistence와 history를 가진다 |
| Duplication and abstraction | 같은 parsing/guard/presenter/policy가 여러 구현으로 쪼개져 있는지 | optional JWT guard, 수동 `parseInt`/clamp | 공통 추상화 하나로 수렴하거나 예외 사유가 명확히 문서화된다 |
| Docs-to-code governance | 문서 변경이 테스트/구현/consumer 타입으로 연결되는지 | `docs/api` caution hotspots 전반 | contract 변경 시 docs, code, tests, consumer types가 같은 PR에서 sync된다 |

## 4. Finding Categories

### C1. Security / Capability Mismatch

- 문서나 summary는 제한된 기능처럼 보이지만 실제 route는 열려 있는 경우
- route가 public contract에 노출됐지만 실제로는 사용할 수 없는 경우

### C2. Validation / DTO Gap

- mutation이 raw object를 받아 DTO 검증을 우회하는 경우
- query parsing이 endpoint마다 수동 구현으로 흩어진 경우

### C3. Response Contract Inconsistency

- cursor query는 있으나 cursor metadata가 없는 경우
- list envelope가 도메인마다 달라 frontend 공통화가 깨지는 경우

### C4. Optional-Auth Drift Zone

- 인증 여부에 따라 `viewer`, `capabilities`, applicant info 같은 필드가 달라지는데, 이 차이가 테스트/문서로 고정돼 있지 않은 경우

### C5. Persistence / Ops Integrity Weakness

- 관리자 판단이 개입되는 state가 in-memory 또는 transient 구현에 머무는 경우

### C6. Duplication / Governance Debt

- guard, presenter, query helper, error normalization 규칙이 중복 구현되어 drift risk가 높은 경우

## 5. Confirmed Findings

### F-001 `POST /badges/team/:teamId` capability gating mismatch

- Priority: `P0`
- Category: `C1`
- Evidence:
  - `apps/api/src/badges/badges.controller.ts`
  - summary는 `팀 뱃지 부여 (관리자)`이지만 `JwtAuthGuard`/`AdminGuard`가 없다.
  - request body도 inline object라 DTO 검증을 받지 않는다.
- Why it matters:
  - frontend와 운영자는 관리자 전용 mutation으로 인식하지만 실제 surface는 public mutation이다.
  - security 이슈이면서 동시에 문서 계약 위반이다.
- Remediation direction:
  - route visibility를 실제 정책에 맞게 닫는다.
  - award body를 DTO로 승격한다.
  - 필요 시 issuance audit trail까지 같은 wave에서 판단한다.

### F-002 `POST /auth/apple` is exposed but not implemented

- Priority: `P0`
- Category: `C1`
- Evidence:
  - `apps/api/src/auth/auth.controller.ts`
  - `apps/api/src/auth/auth.service.ts`
  - `oauthLogin()`은 `kakao`, `naver`만 처리하고, 그 외 provider는 `UnauthorizedException`을 던진다.
- Why it matters:
  - route가 존재하고 문서에도 노출되는데 실제 capability는 unavailable이다.
  - frontend가 “지원 provider”로 오해해 dead-end UX를 만들 수 있다.
- Remediation direction:
  - Apple OAuth를 실제 구현하거나
  - route/docs/UI 노출을 함께 내린다.
  - “미구현 provider”를 public contract에 남길 정책 자체를 명시한다.

### F-003 `GET /notifications` cursor contract is incomplete

- Priority: `P0`
- Category: `C2`, `C3`
- Evidence:
  - `apps/api/src/notifications/notifications.controller.ts`
  - `apps/api/src/notifications/notifications.service.ts`
  - query는 `cursor`, `limit`를 받지만 response는 bare array다.
  - controller는 `limit ? parseInt(limit, 10) : undefined`만 수행한다.
  - service는 `{ limit = 20 }` destructuring을 쓰므로 `NaN`이 default로 정규화되지 않는다.
- Why it matters:
  - cursor pagination처럼 보이지만 frontend가 다음 페이지 판단을 할 metadata가 없다.
  - `limit=abc` 같은 invalid query의 처리 기준이 다른 endpoint와 다르다.
- Remediation direction:
  - `NotificationQueryDto` 도입
  - `items + nextCursor` 또는 explicit array-only contract 중 하나로 확정
  - invalid query normalization 정책을 matches/mercenary 등과 맞춘다

### F-004 `disputes` is still an in-memory admin surface

- Priority: `P0`
- Category: `C5`
- Evidence:
  - `apps/api/src/disputes/disputes.service.ts`
  - `private disputes: Dispute[] = [...]`로 상태를 메모리에 유지한다.
- Why it matters:
  - 재시작, 멀티 인스턴스, 운영 감사 추적에 취약하다.
  - `/admin/disputes`를 real ops surface로 간주하기 어렵다.
- Remediation direction:
  - Prisma persistence로 승격하거나
  - transitional/demo surface로 contract에서 격하하고 UI/문서도 함께 분리한다.

### F-005 DTO-less raw-body mutations are spread across multiple domains

- Priority: `P1`
- Category: `C2`
- Evidence:
  - `apps/api/src/venues/venues.controller.ts` — `POST /venues/:id/reviews`
  - `apps/api/src/reviews/reviews.controller.ts` — `POST /reviews`
  - `apps/api/src/disputes/disputes.controller.ts` — `POST /admin/disputes`, `PATCH /admin/disputes/:id/status`
  - `apps/api/src/settlements/settlements.controller.ts` — `PATCH /admin/settlements/:id/process`
  - `apps/api/src/badges/badges.controller.ts` — `POST /badges/team/:teamId`
- Why it matters:
  - `ValidationPipe` 보호가 약하고 Swagger schema 정확도도 떨어진다.
  - frontend payload drift가 build/test가 아니라 runtime late failure로 남기 쉽다.
- Remediation direction:
  - mutation DTO policy를 세우고 위 surface를 wave별로 DTO화한다.
  - DTO를 못 두는 surface는 예외 사유와 validation 책임 위치를 명시한다.

### F-006 pagination shape is fragmented

- Priority: `P1`
- Category: `C3`
- Evidence:
  - `items + nextCursor`: matches, teams, lessons, marketplace, mercenary, team-matches, 일부 admin list
  - `data + nextCursor + hasMore`: chat
  - bare array: notifications, venues, 일부 supporting domain
- Why it matters:
  - frontend list abstraction이 domain 예외 처리로 찢어진다.
  - contract 문서가 좋아도 runtime integration tax가 계속 누적된다.
- Remediation direction:
  - canonical list taxonomy를 확정한다.
  - 최소한 `cursor-list`, `legacy-chat-list`, `non-paginated-list`를 구분하고 helper를 분리한다.

### F-007 query parsing policy is duplicated and inconsistent

- Priority: `P1`
- Category: `C2`, `C6`
- Evidence:
  - 수동 parse/clamp: `teams`, `lessons`, `marketplace`, `notifications`
  - DTO/class-transformer 기반: `matches`, `mercenary`, `chat`, `tournaments`
- Why it matters:
  - 같은 `limit=abc`라도 endpoint마다 다르게 처리될 수 있다.
  - 수동 `parseInt`/clamp 코드가 controller에 반복된다.
- Remediation direction:
  - list query DTO + shared normalization helper를 표준으로 잡는다.
  - 수동 parse endpoint를 단계적으로 줄인다.

### F-008 optional-auth response variance is a high-risk drift zone

- Priority: `P1`
- Category: `C4`
- Evidence:
  - `apps/api/src/teams/teams.controller.ts` + `teams.service.ts` — `GET /teams/:id/hub`
  - `apps/api/src/mercenary/mercenary.controller.ts` + `mercenary.service.ts` — `GET /mercenary/:id`
  - `apps/api/src/venues/venues.controller.ts` + `venues.service.ts` — `GET /venues/:id/hub`
  - `mercenary.controller.ts`는 비로그인 요청에서 applicant `user` 정보를 strip한다.
  - `teams.service.ts`, `venues.service.ts`는 viewer context에 따라 `capabilities`를 계산한다.
- Why it matters:
  - 이 variance 자체는 의도된 동작일 수 있다.
  - 하지만 auth-state별 response delta가 명시적으로 잠기지 않으면 frontend에서 “같은 타입”으로 오해하기 쉽다.
- Remediation direction:
  - optional-auth endpoint를 별도 audit bucket으로 관리한다.
  - 로그인/비로그인 response 예시와 tests를 각각 갖게 한다.
  - presenter 계층에서 어떤 필드가 auth-state에 따라 달라지는지 규칙을 문서화한다.

### F-009 duplicate optional JWT guard implementation exists

- Priority: `P2`
- Category: `C6`
- Evidence:
  - `apps/api/src/common/guards/optional-jwt-auth.guard.ts`
  - `apps/api/src/mercenary/guards/optional-jwt-auth.guard.ts`
- Why it matters:
  - behavior drift와 유지보수 비용이 생긴다.
- Remediation direction:
  - common guard 하나로 통합하고 mercenary는 재사용한다.

### F-010 error payload normalization burden remains high

- Priority: `P2`
- Category: `C3`, `C6`
- Evidence:
  - `apps/api/src/common/filters/http-exception.filter.ts`
  - validation 에러는 `message: string[]`
  - 일반 HTTP 에러는 `message: string`
  - 일부 realtime/chat 관련 문서는 object-shaped message 사례를 이미 caution으로 다룬다
- Why it matters:
  - frontend가 defensive parsing 분기를 계속 유지해야 한다.
- Remediation direction:
  - `code/message/details` 중심의 표준 error envelope를 정하고
  - 점진 migration 대상 endpoint를 분리한다.

## 6. Prioritization Model

- `P0`: security, broken capability exposure, 운영성 contract blocker
- `P1`: frontend integration tax를 지속적으로 발생시키는 일관성 문제
- `P2`: 즉시 장애는 아니지만 drift를 재생산하는 구조 문제

우선순위는 severity만이 아니라 아래 두 축으로도 판단한다.

1. consumer blast radius가 큰가
2. 같은 문제를 여러 도메인이 반복하는가

## 7. Remediation Waves

### Wave 1 — Contract Blockers

Objective:
- 문서와 구현이 정면 충돌하는 surface를 먼저 닫는다.

Scope:
- `badges` capability hardening
- `auth/apple` implement-or-hide 결정
- `notifications` cursor contract 정상화
- `disputes` canonicality 결정

Exit Criteria:
- 관리자/공개 capability가 문서와 일치한다.
- public contract에 노출된 auth provider가 실제로 동작하거나 노출에서 제거된다.
- `notifications`는 query/response pagination policy가 명확하다.
- `disputes`는 durable persistence 또는 demo surface 분리 중 하나로 확정된다.

### Wave 2 — Consistency Standardization

Objective:
- frontend가 공통 request/response helper를 쓸 수 있게 contract를 정리한다.

Scope:
- raw-body mutation DTO rollout
- query normalization standard 도입
- list response taxonomy 확정
- optional-auth response delta 명세/테스트 추가

Exit Criteria:
- 주요 mutation이 DTO 기반이다.
- manual parse/clamp endpoint 수가 크게 줄거나 shared helper로 수렴한다.
- optional-auth endpoint는 로그인/비로그인 contract 예시와 테스트를 가진다.

### Wave 3 — Maintainability And Governance

Objective:
- 같은 drift가 다시 생기지 않도록 공통 규칙과 검증 루프를 만든다.

Scope:
- optional JWT guard dedupe
- error envelope normalization roadmap
- docs-to-code compliance checklist 또는 audit script 도입

Exit Criteria:
- 공통 guard/helper가 단일 구현으로 수렴한다.
- contract reviewer가 같은 체크리스트로 문서/코드/test를 같이 볼 수 있다.

## 8. Validation Strategy For Follow-up Work

### Route-Level Validation

- guard가 바뀌는 endpoint는 permission test를 추가한다.
- DTO가 새로 생기는 endpoint는 invalid body / extra field / wrong type 테스트를 추가한다.
- query normalization을 손대는 endpoint는 `limit=abc`, `limit=0`, `limit=999`, `cursor` invalid case를 명시적으로 테스트한다.

### Contract Validation

- response shape가 바뀌는 list endpoint는 integration test snapshot 또는 explicit shape assertion을 둔다.
- optional-auth endpoint는 anonymous / authenticated 두 케이스를 모두 검증한다.
- public contract에서 제거하거나 숨기는 capability는 docs/api와 Swagger surface를 같이 확인한다.

### Consumer Validation

- `apps/web/src/hooks/use-api.ts`
- `apps/web/src/types/api.ts`
- 영향을 받는 hook/test/MSW handler를 함께 확인한다.
- backend만 맞고 frontend consumer type이 그대로인 상태는 close로 보지 않는다.

### Done Definition Per Finding

- controller, DTO, service, test, docs/api가 같은 계약을 설명한다.
- 관련 caution은 실제 리스크가 해소되면 제거하거나 더 좁은 caution으로 바뀐다.
- 변경 전후 예시 payload/response가 문서에 남는다.

## 9. Maintenance Workflow

### Same-PR Contract Workflow

1. endpoint 변경 전 `docs/api`의 해당 문서를 먼저 찾는다.
2. controller, DTO, service, tests, frontend consumer type까지 변경 영향 범위를 고정한다.
3. contract가 바뀌면 docs/api를 같은 PR에서 갱신한다.
4. caution hotspot을 건드린 경우 “왜 아직 caution인지” 또는 “왜 제거 가능한지”를 PR에서 설명한다.

### Audit Checklist For Future Backend PRs

- route summary와 guard가 같은 의미를 가지는가
- mutation/query가 DTO 또는 명시적 validation 정책을 가지는가
- cursor를 받는다면 cursor metadata policy가 문서와 일치하는가
- optional-auth endpoint라면 auth-state별 response 차이가 문서와 테스트에 있는가
- 운영/관리 surface라면 persistence와 auditability가 충분한가
- 동일 책임의 helper/guard/presenter가 중복 구현되지 않았는가

### Drift Escalation Rule

- `docs/api`에 새로운 `CAUTION`을 추가했다면 follow-up remediation task를 같이 남긴다.
- 반대로 caution을 제거하려면 코드, 테스트, consumer type이 모두 닫혀야 한다.
- “문서만 맞다” 또는 “코드만 맞다” 상태는 close 조건이 아니다.

## 10. Recommended Follow-up Task Buckets

- Task A: badge/admin capability hardening
- Task B: Apple OAuth visibility decision
- Task C: notifications pagination and query normalization
- Task D: disputes persistence or contract downgrade
- Task E: DTO rollout for raw-body mutations
- Task F: list/pagination/query standardization
- Task G: optional-auth response contract locking
- Task H: shared guard/error/governance cleanup
- Task 58 — optional auth / error envelope governance cleanup

## Out Of Scope For This Turn

- backend code changes
- frontend hook rewrites
- E2E expansion
- Prisma migration authoring
