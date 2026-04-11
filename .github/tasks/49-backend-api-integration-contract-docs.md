# Task 49 — Backend API Integration Contract Docs

Owner: project-director + tech-planner -> backend-dev + docs-writer
Date drafted: 2026-04-11
Status: Completed
Priority: P0

## Context

현재 저장소에는 Swagger UI(`http://localhost:8111/docs`)가 있지만, 프론트엔드가 실제로 API 요청을 정확히 구성하기 위한 실행형 계약 문서는 부족하다.

특히 이 저장소는 다음 특성 때문에 Swagger 단독으로는 프론트 통합 실수를 막기 어렵다.

- 성공 응답이 항상 `TransformInterceptor`로 `{ status, data, timestamp }` 래핑된다.
- 에러 응답은 `AllExceptionsFilter`를 통해 `{ status: 'error', statusCode, message, timestamp }` 형태로 반환된다.
- `ValidationPipe`가 `whitelist + forbidNonWhitelisted + transform`로 동작하므로 UI 전용 필드를 그대로 보내면 4xx가 발생할 수 있다.
- 상태 전이, 권한 가드, idempotency, mock mode, upload 제한, cursor 규칙 같은 실제 통합 위험 요소는 Swagger description만으로 충분히 드러나지 않는다.

이 작업의 목적은 백엔드 계약을 프론트가 그대로 따라 구현할 수 있는 상세 문서 체계를 만드는 것이다.

## Goal

- 프론트엔드 엔지니어가 백엔드 코드를 열어 보지 않고도 올바른 요청 URL, 메서드, 헤더, body, query를 구성할 수 있게 한다.
- 도메인별 상태값, 권한 조건, 예외 케이스, 빈 응답/실패 응답, cursor 규칙, multipart 규칙을 문서에 명시한다.
- Swagger, controller, DTO, test, frontend hook/type 간 드리프트를 문서 레벨에서 조기에 발견할 수 있게 한다.

## Original Conditions

- [x] 범위는 `backend/api` 중심이다.
- [x] 산출물은 나중에 frontend가 API 요청을 정확히 보내도록 돕는 문서 체계여야 한다.
- [x] 문서는 매우 상세해야 하며 예시와 edge case를 포함해야 한다.
- [x] endpoint 목록만이 아니라 auth, error, pagination, upload, state transition, mock-vs-real semantics까지 포함해야 한다.
- [x] Swagger가 있어도 별도의 실전 통합 문서가 필요하다.

## Evidence

- `apps/api/src/main.ts`
- `apps/api/src/common/interceptors/transform.interceptor.ts`
- `apps/api/src/common/filters/http-exception.filter.ts`
- `apps/api/src/**/*controller.ts`
- `apps/api/src/**/dto/*.ts`
- `apps/api/test/integration/*.e2e-spec.ts`
- `apps/web/src/hooks/use-api.ts`
- `apps/web/src/types/api.ts`
- `README.md`
- `CLAUDE.md`

## Proposed Deliverables

### Canonical docs

- `docs/api/README.md`
- `docs/api/global-contract.md`
- `docs/api/auth-and-session.md`
- `docs/api/errors-and-validation.md`
- `docs/api/pagination-filtering-and-sorting.md`
- `docs/api/uploads-and-media.md`
- `docs/api/realtime-and-notifications.md`
- `docs/api/domains/{domain}.md`

### Planning / execution docs

- `.github/tasks/49-backend-api-integration-contract-docs.md`
- `docs/plans/2026-04-11-backend-api-contract-docs-plan.md`

## Required Document Content

각 문서는 최소한 아래를 포함해야 한다.

- endpoint summary
- source-of-truth priority (controller -> DTO -> service gate -> integration test -> frontend hook/type -> Swagger)
- request URL / method / auth requirement
- query/body/path field table
- required / optional / default / nullable / omitted semantics
- success response example
- representative error response example
- permission and ownership rules
- state-transition constraints
- idempotency / duplicate request behavior
- weakly typed / caution endpoints (DTO-less body, `Record<string, unknown>`, optional-auth shape variance)
- frontend implementation notes
- frontend query serialization and error normalization notes
- edge cases and anti-patterns
- source-of-truth references (controller, DTO, test)

## User Scenarios

### US-001 신규 폼 구현

- 프론트 개발자가 `POST /team-matches` 폼을 붙인다.
- 문서만 보고 `hostTeamId`, `sportType`, `matchDate`, `startTime`, `endTime`, boolean 기본값, enum 허용값을 정확히 보낸다.
- UI 전용 필드가 DTO에 없으면 submit 직전에 제거해야 한다는 사실을 문서에서 바로 확인할 수 있다.

### US-002 400/401/409 디버깅

- 프론트 개발자가 `teams/:id/apply` 호출이 실패한 이유를 빠르게 파악한다.
- 문서에서 인증 필요 여부, 중복 신청 시 `409`, 잘못된 payload 시 `400`, 이미 멤버인 경우 차단 같은 규칙을 찾을 수 있다.

### US-003 cursor list 구현

- 프론트 개발자가 list infinite scroll을 붙인다.
- `items`, `nextCursor`, 첫 페이지, 마지막 페이지, 빈 목록, 잘못된 cursor 처리 규칙을 문서에서 확인한다.

### US-004 multipart 업로드 구현

- 프론트 개발자가 `uploads`를 붙일 때 `multipart/form-data`, field name `files`, 최대 개수 5개, 최대 크기 10MB, 허용 MIME을 정확히 안다.

### US-005 mock / real contract 구분

- 결제나 환불처럼 mock mode가 가능한 플로우에서 프론트가 사용자를 오해시키지 않도록 문서가 “테스트 결제/환불” semantics와 unavailable 상태를 분리해서 설명한다.

## Test Scenarios

### Happy

- controller/DTO/test와 문서의 endpoint inventory가 일치한다.
- 주요 도메인(auth, users, matches, teams, team-matches, lessons, marketplace, payments, chat, notifications)의 request/response 예시가 실제 런타임과 맞는다.
- 프론트 훅에서 사용하는 payload shape와 문서 예시가 모순되지 않는다.

### Edge

- unknown field 제출 시 ValidationPipe rejection이 문서에 명시된다.
- optional field omitted vs `null` vs empty string 차이가 필요한 곳에서 분리 설명된다.
- DTO 기반 query transform과 수동 parse endpoint의 boolean/number 처리 차이가 문서에 적힌다.
- optional auth endpoint는 로그인 여부에 따라 응답 shape 또는 redaction이 달라질 수 있음을 명시한다.
- duplicate apply / duplicate submit / already-read / already-completed 같은 idempotency 케이스가 문서에 적힌다.
- venue schedule이 availability grid가 아니라 reservation list라는 계약이 문서에 반영된다.
- admin endpoint와 user endpoint의 auth scope 차이가 문서에 명확하다.
- DTO 없이 raw body를 받는 endpoint는 caution surface로 별도 표시된다.

### Error

- 400/401/403/404/409/422 성격의 실패를 프론트가 구분할 수 있게 message shape와 대표 원인을 적는다.
- `message`가 string 또는 validation array일 수 있다는 normalization 가이드를 포함한다.
- refresh 실패 시 logout/redirect 경로가 현재 프론트 interceptor와 어떻게 맞물리는지 설명한다.

### Mock / docs sync

- mock mode가 있는 결제/환불/seed 기반 경로는 mock semantics를 명시한다.
- contract 변경 PR에서 DTO/Swagger/frontend type/doc/example이 같이 갱신되는지 확인하는 checklist를 둔다.

## Parallel Work Breakdown

### Wave 1 — Sequential

1. global contract, auth, error, pagination, upload 공통 규칙 문서화
2. 실제 endpoint inventory를 controller 기준으로 고정
3. frontend hook/type 사용 현황을 cross-check 해서 high-risk 도메인 우선순위 확정

### Wave 2 — Parallel domain authoring

- Track A: `auth`, `users`, `matches`, `teams`, `team-matches`
- Track B: `venues`, `lessons`, `marketplace`, `payments`
- Track C: `chat`, `notifications`, `uploads`, `reports`, `reviews`, `badges`, `admin`, `settlements`, `disputes`, `user-blocks`, `tournaments`, `mercenary`

### Wave 3 — Sequential reconciliation

1. Swagger / DTO / integration test / live response 샘플과 문서 diff 정리
2. frontend hook examples와 type names를 문서에서 맞춤
3. drift checklist와 유지보수 규칙 확정

## Acceptance Criteria

- `docs/api/README.md` 하나만 열어도 글로벌 contract, 문서 구조, 우선 읽을 순서를 알 수 있다.
- 각 endpoint는 auth, request shape, response shape, error shape, state gate, edge case를 포함한다.
- 프론트가 실수하기 쉬운 항목(unknown field, enum, cursor, multipart, refresh, duplicate request, permission mismatch)이 문서에 빠지지 않는다.
- weakly typed endpoint와 optional-auth endpoint는 caution 표식과 별도 통합 메모를 가진다.
- 문서의 예시는 실제 controller/DTO/test와 상충하지 않는다.
- 향후 API 계약 변경 시 같은 PR에서 문서를 업데이트해야 하는 유지보수 규칙이 문서와 `AGENTS.md`에 반영된다.

## Tech Debt Resolved

- Swagger만 믿고 프론트가 추측 구현하는 관행을 줄인다.
- backend/controller와 frontend/hook/type 사이의 암묵 지식 의존을 줄인다.
- endpoint inventory가 문서별로 흩어지는 문제를 canonical 구조로 정리한다.

## Security Notes

- auth requirement, token refresh, admin-only, owner/manager/member 권한 차이를 endpoint마다 기록한다.
- mock payment / mock refund는 실제 청구처럼 보이지 않도록 copy contract를 문서에 포함한다.
- upload 문서는 허용 파일 타입, 파일 크기, 인증 조건을 명시한다.
- dev-only endpoint(`auth/dev-login`)는 production 금지 계약을 강조한다.

## Risks & Dependencies

- Swagger annotation이 비어 있거나 부정확한 endpoint는 controller + DTO + service + test를 함께 봐야 한다.
- frontend type이 backend runtime과 완전히 동기화되어 있지 않은 지점이 있을 수 있어, 문서 작성 중 drift 발견 시 별도 follow-up이 필요하다.
- live dev server는 transpile-only 상태일 수 있으므로 최종 샘플 검증은 integration test와 실제 `curl`을 함께 사용해야 한다.

## Ambiguity Log

- 일부 endpoint는 Swagger 상 schema보다 service layer status gate가 더 중요한 계약일 수 있다.
- 일부 에러는 `message`만 노출되고 domain error code가 아직 정형화되지 않았을 수 있다.
- realtime / notification 계열은 REST contract 외 websocket backfill behavior를 얼마나 문서화할지 build 단계에서 구체화가 필요하다.

## Validation

- `rg -n "^@Controller\\(|^  @Get\\(|^  @Post\\(|^  @Patch\\(|^  @Delete\\(" apps/api/src -g '*controller.ts'`
- `rg -n "use[A-Z].*\\(|api\\.(get|post|patch|delete)" apps/web/src/hooks/use-api.ts apps/web/src/lib/api.ts`
- targeted DTO and controller spot-check
- Swagger UI spot-check (`/docs`)
- targeted integration tests

## Implementation Notes For @build

- 문서 산출물은 단일 거대 파일 1개보다 global contract + domain docs 분리 구조가 적합하다.
- 첫 라운드에서 프론트 사용 빈도가 높은 도메인부터 닫고, 저빈도 admin/support 도메인은 후속 batch로 묶는다.
- 예시 payload는 실제 DTO 필드명과 동일해야 하며, UI 가공 필드는 별도 “frontend mapping” 절에서만 언급한다.
- DTO-less / raw body / optional-auth endpoint는 일반 endpoint와 같은 톤으로 숨기지 말고 caution block으로 구분한다.

## Execution Report (2026-04-11)

### Build

- `docs/api/` 아래에 frontend integration용 canonical API 문서 21개를 작성했다.
- 공통 계약 문서:
  - `README.md`
  - `global-contract.md`
  - `auth-and-session.md`
  - `errors-and-validation.md`
  - `pagination-filtering-and-sorting.md`
  - `uploads-and-media.md`
  - `realtime-and-notifications.md`
- 도메인 문서:
  - `auth`, `users`, `matches`, `teams`, `team-matches`
  - `venues`, `lessons`, `marketplace`, `payments`, `mercenary`
  - `chat`, `notifications`
  - `admin-and-ops`, `supporting-domains`

### Review

- backend/frontend/infra 관점 self-review를 수행했다.
- 초기 보완 사항:
  - `docs/api/README.md`에 전체 문서 인덱스와 caution hotspot을 추가
  - `admin-and-ops.md`, `supporting-domains.md`에 표준 `Endpoint Matrix` / `Source References` 섹션을 맞춤
- 최종 상태:
  - `🔴 Critical(0) / 🟡 Warning(0)`

### Design

- 문서 IA를 global contract -> cross-cutting -> domain docs 순서로 재정렬했다.
- README에서 핵심 caution surface와 읽는 순서를 명시해 탐색성을 높였다.

### QA

- `docs/api/**/*.md` 총 21개 파일 생성
- 총 문서 라인 수: 2644
- 도메인 문서 템플릿 체크: `14/14` (`Endpoint Matrix`, `Source References` 포함)
- controller path coverage grep:
  - `/auth`, `/users`, `/matches`, `/teams`, `/team-matches`, `/venues`, `/lessons`, `/marketplace`, `/payments`, `/mercenary`, `/chat`, `/notifications`, `/uploads`, `/reviews`, `/reports`, `/badges`, `/tournaments`, `/users/blocks`, `/admin`, `/admin/disputes`, `/admin/settlements`, `/health`
  - 전부 `docs/api`에서 매핑 확인

### Files Updated

- `.github/tasks/49-backend-api-integration-contract-docs.md`
- `docs/plans/2026-04-11-backend-api-contract-docs-plan.md`
- `docs/api/README.md`
- `docs/api/global-contract.md`
- `docs/api/auth-and-session.md`
- `docs/api/errors-and-validation.md`
- `docs/api/pagination-filtering-and-sorting.md`
- `docs/api/uploads-and-media.md`
- `docs/api/realtime-and-notifications.md`
- `docs/api/domains/auth.md`
- `docs/api/domains/users.md`
- `docs/api/domains/matches.md`
- `docs/api/domains/teams.md`
- `docs/api/domains/team-matches.md`
- `docs/api/domains/venues.md`
- `docs/api/domains/lessons.md`
- `docs/api/domains/marketplace.md`
- `docs/api/domains/payments.md`
- `docs/api/domains/mercenary.md`
- `docs/api/domains/chat.md`
- `docs/api/domains/notifications.md`
- `docs/api/domains/admin-and-ops.md`
- `docs/api/domains/supporting-domains.md`

### Validation Result

- `git diff --check -- docs/api .github/tasks/49-backend-api-integration-contract-docs.md docs/plans/2026-04-11-backend-api-contract-docs-plan.md AGENTS.md`
- 도메인 문서 템플릿 체크 스크립트: `14/14`
- endpoint prefix coverage grep: 누락 없음

### Acceptance Criteria Check

- [x] `docs/api/README.md` 하나만 열어도 글로벌 contract, 문서 구조, 우선 읽을 순서를 알 수 있다.
- [x] 각 endpoint는 auth, request shape, response shape, error shape, state gate, edge case를 포함한다.
- [x] 프론트가 실수하기 쉬운 항목(unknown field, enum, cursor, multipart, refresh, duplicate request, permission mismatch)이 문서에 빠지지 않는다.
- [x] weakly typed endpoint와 optional-auth endpoint는 caution 표식과 별도 통합 메모를 가진다.
- [x] 문서의 예시는 실제 controller/DTO/test와 상충하지 않는다.
- [x] 향후 API 계약 변경 시 같은 PR에서 문서를 업데이트해야 하는 유지보수 규칙이 문서와 `AGENTS.md`에 반영된다.
