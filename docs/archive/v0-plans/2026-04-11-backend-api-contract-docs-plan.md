# Backend API Contract Documentation Plan

Date: 2026-04-11
Scope: `apps/api` + frontend integration touchpoints
Status: Completed

## Planning Report

### Project Director: Approved

- Swagger는 현재 API surface를 보여주지만, 프론트가 실제로 틀리기 쉬운 계약을 막기에는 불충분하다.
- 이번 문서는 "endpoint catalog"가 아니라 "frontend integration manual"이어야 한다.
- 우선순위는 프론트 사용 빈도와 실패 비용 기준으로 둔다.
  - Tier 1: auth, users, matches, teams, team-matches
  - Tier 2: venues, lessons, marketplace, payments
  - Tier 3: chat, notifications, uploads, admin/support domains
- 문서가 상세할수록 가치가 있지만, giant single file은 탐색성이 떨어지므로 global contract + domain split이 필요하다.

### Tech Planner

- canonical source of truth는 Swagger 단독이 아니라 아래 6개를 함께 봐야 한다.
  1. `apps/api/src/**/*controller.ts`
  2. `apps/api/src/**/dto/*.ts`
  3. service layer status/permission gate
  4. integration tests
  5. `apps/web/src/hooks/use-api.ts`
  6. `apps/web/src/types/api.ts`
- 문서가 반드시 다뤄야 할 핵심 위험은 validation rejection, hidden defaults, enum drift, permission mismatch, cursor semantics, multipart rules, duplicate mutation behavior다.
- 예시는 DTO 필드명 그대로 적고, 프론트 mapping 예시는 별도 박스로 분리해야 한다.

### Agreed Implementation Plan

1. 실제 endpoint inventory와 frontend usage inventory를 고정한다.
2. global contract 문서를 먼저 만든다.
3. high-traffic domain docs를 병렬로 작성한다.
4. Swagger / DTO / tests / frontend hooks와 diff를 정리한다.
5. examples, edge cases, maintenance checklist를 추가해 문서를 닫는다.

Planning complete. Implementation finished on 2026-04-11 with `docs/api/` canonical contract docs generated.

---

## Why Swagger Alone Is Not Enough

Swagger만으로는 아래를 안정적으로 전달하지 못한다.

- success wrapper와 error wrapper의 실전 처리 방식
- `forbidNonWhitelisted` 때문에 UI 전용 필드가 실패하는 규칙
- guard는 통과해도 service layer ownership check에서 막히는 케이스
- duplicate request 시 409 또는 no-op이 나는 지점
- cursor가 무엇을 기준으로 만들어지는지
- `null`, omitted, empty string이 같은 의미가 아닌 필드
- mock mode / unavailable semantics
- file upload field name, count, size, MIME 제한
- websocket event만 믿으면 안 되는 backfill/focus refresh 패턴

즉, Swagger는 reference이고, frontend integration doc는 behavioral contract여야 한다.

## Proposed Output Structure

```text
docs/api/
  README.md
  global-contract.md
  auth-and-session.md
  errors-and-validation.md
  pagination-filtering-and-sorting.md
  uploads-and-media.md
  realtime-and-notifications.md
  domains/
    auth.md
    users.md
    matches.md
    teams.md
    team-matches.md
    venues.md
    lessons.md
    marketplace.md
    payments.md
    mercenary.md
    chat.md
    admin-and-ops.md
    supporting-domains.md
```

## README Contract

`docs/api/README.md`는 아래 순서로 읽히게 만든다.

1. 이 문서의 목적: 프론트 통합용 계약서
2. 전역 URL / auth / response wrapper
3. "처음 붙는 개발자라면 여기부터" 링크
4. domain 문서 목록
5. 변경 시 유지보수 규칙

## Mandatory Global Chapters

### 1. Global Contract

- base URL: `/api/v1`
- content types: `application/json`, `multipart/form-data`
- success wrapper

```json
{
  "status": "success",
  "data": {},
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

- error wrapper

```json
{
  "status": "error",
  "statusCode": 400,
  "message": "Bad Request",
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

- frontend note:
  - `message`는 string일 수도 있고 validation failure에서는 string array일 수도 있다.
  - axios interceptor는 현재 `response.data`를 바로 반환하므로 훅에서는 `ApiResponse<T>`의 `data`를 꺼내 쓴다.

### 2. Auth And Session

- Bearer token 전달 방식
- `auth/refresh` 재발급 흐름
- `auth/dev-login`은 development 전용이라는 계약
- unauthenticated / expired / forbidden 차이
- 프론트 interceptor와 redirect behavior

### 3. Errors And Validation

- `ValidationPipe` semantics
- unknown field rejection
- enum mismatch
- implicit conversion 가능 필드와 그래도 프론트가 string으로 보내면 안 되는 필드
- representative failures

예시:

```json
{
  "sportType": "soccer",
  "title": "Sunday Game",
  "uiOnlyPreview": true
}
```

위 payload는 DTO에 `uiOnlyPreview`가 없으면 실패할 수 있다는 식으로 명시한다.

### 4. Pagination / Filtering / Sorting

- 기본 list shape

```json
{
  "items": [],
  "nextCursor": null
}
```

- first page / middle page / last page
- invalid cursor behavior
- cursor가 opaque identifier인지, id 기반인지, createdAt 기반인지
- 빈 목록 시 `items: []`, `nextCursor: null`

### 5. Uploads And Media

- endpoint: `POST /uploads`
- auth required
- field name: `files`
- max count: 5
- max size per file: 10MB
- allowed MIME: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- 예시 cURL

```bash
curl -X POST http://localhost:8111/api/v1/uploads \
  -H "Authorization: Bearer <token>" \
  -F "files=@/tmp/a.jpg" \
  -F "files=@/tmp/b.webp"
```

### 6. Realtime / Notifications

- REST endpoint와 websocket의 역할 분리
- notification unread count, read, read-all
- late-connect / hidden-tab 복귀 시 backfill refetch 필요성
- websocket event만으로 완전 일관성을 보장하지 않는다는 주의

## Domain Doc Template

각 domain 문서는 동일 템플릿을 따른다.

1. Domain overview
2. Common enums and states
3. Endpoint matrix
4. Endpoint details
5. Frontend mapping notes
6. Edge cases
7. Source references

### Endpoint detail template

- Method / path
- Purpose
- Auth
- Permission
- Path params
- Query params
- Body fields
- Success response
- Error responses
- State gates
- Duplicate request behavior
- Frontend implementation notes
- Source refs

## Endpoint Inventory By Domain

### Tier 1

- `auth`
  - `POST /auth/register`
  - `POST /auth/login`
  - `POST /auth/dev-login`
  - `POST /auth/kakao`
  - `POST /auth/naver`
  - `POST /auth/apple`
  - `POST /auth/refresh`
  - `GET /auth/me`
  - `DELETE /auth/withdraw`
- `users`
  - `GET /users/me`
  - `PATCH /users/me`
  - `GET /users/me/matches`
  - `GET /users/me/invitations`
  - `GET /users/search`
  - `GET /users/:id`
- `matches`
  - list / recommended / create / detail / update / cancel / close / join / leave / teams / complete / arrive
- `teams`
  - list / me / hub / detail / create / update / delete
  - members / apply / leave / transfer-ownership / invitations
- `team-matches`
  - list / me applications / detail / create / applications / apply / approve / reject / check-in / result / evaluate / referee-schedule

### Tier 2

- `venues`
- `lessons`
- `marketplace`
- `payments`
- `mercenary`

### Tier 3

- `chat`
- `notifications`
- `uploads`
- `reviews`
- `reports`
- `badges`
- `tournaments`
- `admin`
- `settlements`
- `disputes`
- `user-blocks`
- `health`

## Must-Document Edge Cases

아래는 문서에 반드시 들어가야 하는 edge case 목록이다.

1. Unknown field rejection
2. `null` vs omitted 차이
3. enum 허용값과 display label 분리
4. `POST` 재시도 시 duplicate conflict
5. 이미 처리된 read / read-all mutation의 동작
6. 이미 완료된 경기에서 result/evaluate 재제출 차단
7. owner/manager/member 권한 차이
8. admin-only endpoint의 shell/context 유지
9. `venues/:id/schedule`이 availability가 아니라 reservation list라는 점
10. mock payment / refund semantics
11. legacy unavailable payment state
12. refresh token 실패 시 logout
13. cursor가 없는 첫 요청과 마지막 페이지
14. upload file type/size/count 초과
15. query string boolean/number conversion
16. dev-login production 금지
17. optional relationship field가 항상 포함되지 않을 수 있음
18. empty array vs field omission
19. websocket late-connect/backfill
20. message shape normalization
21. optional-auth endpoint의 로그인/비로그인 응답 shape 차이
22. DTO 기반 query transform과 수동 parse endpoint의 clamp/default 처리 차이
23. DTO-less body endpoint는 caution surface로 분리 문서화

## Example Style Guide

- 요청 예시는 최소 payload와 full payload를 둘 다 적는다.
- 응답 예시는 최소 성공 예시와 대표 실패 예시를 같이 둔다.
- 날짜와 시간은 포맷을 고정해서 적는다.
  - date: `YYYY-MM-DD`
  - time: `HH:mm`
  - timestamp: ISO 8601
- 프론트에서 화면용으로 가공한 필드는 payload 예시에 넣지 않는다.

### Example: Create Team Match

Minimal request:

```json
{
  "hostTeamId": "1f9a47aa-6ef8-4d21-a2e4-6b6c9fdb0c10",
  "sportType": "SOCCER",
  "title": "Sunday Away Match",
  "matchDate": "2026-04-20",
  "startTime": "18:00",
  "endTime": "20:00",
  "venueName": "Jamsil Field",
  "venueAddress": "Seoul Songpa-gu ..."
}
```

Expanded request:

```json
{
  "hostTeamId": "1f9a47aa-6ef8-4d21-a2e4-6b6c9fdb0c10",
  "sportType": "SOCCER",
  "title": "Sunday Away Match",
  "description": "Need fair-play opponents",
  "matchDate": "2026-04-20",
  "startTime": "18:00",
  "endTime": "20:00",
  "totalMinutes": 120,
  "quarterCount": 4,
  "venueName": "Jamsil Field",
  "venueAddress": "Seoul Songpa-gu ...",
  "totalFee": 80000,
  "opponentFee": 40000,
  "requiredLevel": 3,
  "allowMercenary": true,
  "hasReferee": false,
  "skillGrade": "B+",
  "gameFormat": "11:11",
  "matchType": "away",
  "uniformColor": "white"
}
```

Frontend warning:

- `sportType`와 enum label은 분리해서 적는다.
- `uiSelectedVenue`, `displaySkillLabel` 같은 화면 전용 필드는 payload에 넣지 않는다.
- boolean default를 프론트가 임의로 추론하지 말고 문서 표를 따른다.

## Validation Workflow

### Authoring checklist

1. controller에서 route / decorator / guard 확인
2. DTO에서 required / optional / enum / pattern 확인
3. service에서 state gate / ownership / duplicate handling 확인
4. DTO-less endpoint는 controller/body handling과 service validation 경로를 별도 확인
5. integration test에서 실제 happy/error path 확인
6. `use-api.ts`에서 현재 프론트 usage 확인
7. `types/api.ts`와 drift 여부 확인
8. Swagger UI 예시와 description 보정 필요 여부 확인

### Pre-merge checklist

- endpoint inventory diff 없음
- examples가 DTO와 모순되지 않음
- auth requirement가 틀리지 않음
- 대표 4xx/409 케이스가 누락되지 않음
- mock mode 표기가 필요한 곳에서 빠지지 않음

## Maintenance Rules

- controller, DTO, service status gate, integration test, frontend hook/type 중 하나라도 contract에 영향이 가면 문서를 같은 PR에서 갱신한다.
- 문서 업데이트를 뒤로 미루지 않는다.
- giant changelog식 문서보다 domain split을 유지한다.
- endpoint가 아직 unstable이면 문서에서 "planned"가 아니라 "partial" 또는 "not supported"로 적는다.

## Suggested Build Execution Order

1. `docs/api/README.md`
2. `global-contract.md`
3. `errors-and-validation.md`
4. `auth-and-session.md`
5. Tier 1 domain docs
6. `pagination-filtering-and-sorting.md`
7. `uploads-and-media.md`
8. Tier 2 domain docs
9. `realtime-and-notifications.md`
10. Tier 3 domain docs
11. drift checklist and docs index polishing

## Expected Follow-up Risks

- 프론트 타입이 runtime contract보다 앞서거나 뒤처진 지점이 드러날 수 있다.
- 일부 service layer가 명시적 domain error code 없이 message만 던지는 경우, 문서가 정확하지만 아직 충분히 structured하지 않을 수 있다.
- Swagger annotation 품질이 낮은 endpoint는 문서 작성 자체가 숨은 API cleanup task를 유발할 수 있다.
