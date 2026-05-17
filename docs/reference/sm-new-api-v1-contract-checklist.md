# SM New API v1 Contract Checklist

## 1. Status

```text
Status: v1 contract complete
Created: 2026-05-17
Design baseline: Team Design > 1차 디자인 완료
DB source: docs/reference/sm-new-db-v1-table-decision-checklist.md
Action source: docs/reference/sm-new-screen-action-inventory.md
Surface source: docs/reference/sm-new-api-surface-map.md
Scope: SM New API v1 URL, request, response, permission, state, error contract
Not for: implementation, Nest controller generation, Prisma migration
```

이 문서는 SM New API v1 계약을 DB 설계처럼 하나씩 확정하기 위한 진행판이다.

API 하나 또는 API 묶음 하나가 완료되려면 URL만 정하는 것으로 끝나지 않는다. 화면 버튼에서 출발해
요청 DTO, 응답 DTO, 권한, 상태 전이, 에러, idempotency, audit 영향까지 닫혀야 완료로 본다.

## 2. Completion Criteria

```text
Done = URL, method, auth, request, response, permission, state transition,
error, pagination/idempotency/audit, UI mapping, open question이 모두 닫힌 상태
```

공통 체크 항목:

- [ ] 화면 action 연결 확정
- [ ] HTTP method 확정
- [ ] URL path 확정
- [ ] auth guard 확정
- [ ] actor/permission 확정
- [ ] request params 확정
- [ ] request query 확정
- [ ] request body DTO 확정
- [ ] response data DTO 확정
- [ ] empty/loading/error UI mapping 확정
- [ ] 상태 전이 여부 및 `from -> to` 확정
- [ ] read/write table 확정
- [ ] audit/status log 필요 여부 확정
- [ ] idempotency 필요 여부 확정
- [ ] pagination/sort/filter 계약 확정
- [ ] error code/status 확정
- [ ] 권한 실패/상태 충돌/중복 요청 동작 확정
- [ ] deferred/payment 제외 여부 확인
- [ ] open question 없음

## 3. Progress Summary

| Domain | Done | Total | Status |
|---|---:|---:|---|
| Global Contract | 1 | 1 | Done |
| Auth/Onboarding | 9 | 9 | Done |
| Home/Search/Notice | 5 | 5 | Done |
| Personal Match | 15 | 15 | Done |
| Team | 13 | 13 | Done |
| Team Match | 13 | 13 | Done |
| Chat/Notification | 12 | 12 | Done |
| Profile/Settings | 7 | 7 | Done |
| Admin/Audit | 8 | 8 | Done |
| Deferred Boundaries | 1 | 1 | Done |
| **Total** | **84** | **84** | **Done** |

## 4. Decision Log

| Date | API area | Decision | Reason | Follow-up |
|---|---|---|---|---|
| 2026-05-17 | - | API v1 계약 체크리스트 생성 | URL/요청/응답/권한/상태/에러를 DB 설계처럼 단계별로 확정하기 위함 | Global Contract부터 검토 |
| 2026-05-17 | Global Contract | API prefix, envelope, cursor pagination, common error code, idempotency 기준 확정 | 뒤의 모든 endpoint URL/요청/응답/에러 형식을 같은 규칙으로 맞추기 위함 | Auth/Onboarding 검토 |
| 2026-05-17 | `GET /auth/me` | 현재 사용자/프로필/온보딩 요약 조회 API로 확정. 인증 필수이며 상태 전이는 없음 | 앱 재진입, 로그인 직후, 온보딩 이어하기, 차단 계정 hard stop 판단의 기준 API가 필요하기 때문 | OAuth callback 검토 |
| 2026-05-17 | Auth provider | API v1 provider는 `kakao | naver | email`로 확정. `google/apple`은 future provider로 보류 | 1차 디자인 완료의 소셜 흐름이 카카오/네이버 중심이고, email은 직접 로그인/가입에 필요하기 때문 | `auth_identities.provider` DB 후보와 구현 전 동기화 필요 |
| 2026-05-17 | `POST /auth/email/login` | 이메일 로그인은 기존 email identity 로그인 전용으로 확정. 계정 생성은 `POST /auth/signup`에서만 처리 | 로그인과 회원가입을 분리해야 입력 오류, 계정 없음, 차단 계정, 온보딩 resume 화면이 명확해지기 때문 | 회원가입 API 검토 |
| 2026-05-17 | `GET /terms/current` | 현재 게시 중인 필수/선택 약관 조회 API로 확정. guest/user 모두 접근 가능 | 회원가입 전 약관 화면과 설정 약관 화면 모두 같은 약관 원천을 봐야 하기 때문 | 약관 동의 저장 방식 결정 필요 |
| 2026-05-17 | `GET /onboarding` | 온보딩 resume 조회 API로 확정. 지역 0개 허용과 누락 step을 응답에 포함 | 사용자가 지역을 선택하지 않을 수 있고, 재진입 시 완료/누락 상태를 화면에서 복원해야 하기 때문 | 온보딩 저장 API 검토 |
| 2026-05-17 | `PATCH /onboarding/preferences` | 종목/실력/지역 선호 저장 API로 확정. 지역은 빈 배열 허용, 현재 위치는 자동 저장하지 않음 | DB 결정에서 `user_regions` 0개 이상과 위치 권한 비저장을 확정했기 때문 | 완료/defer API 검토 |
| 2026-05-17 | `POST /onboarding/complete` / `POST /onboarding/defer` | 온보딩 완료/나중에 설정 API로 확정. complete는 필수 종목/실력 검증, defer는 제한 추천 홈으로 이동 | 디자인에 완료와 나중에 설정 흐름이 모두 있고 DB status에 `completed/deferred`가 있기 때문 | Home/Search/Notice 검토 |
| 2026-05-17 | Terms consent draft | 회원가입 전 약관 동의는 guest draft token 방식으로 확정. `POST /terms/consents`가 `termsConsentToken`을 반환하고 `POST /auth/signup`에서 user 생성 후 `user_terms_consents`로 확정 | 약관 화면을 회원가입 전에 유지하면서도 `user_terms_consents.user_id` FK 무결성을 지키기 위함 | 구현 전 draft token 저장 방식 결정 |
| 2026-05-17 | `POST /auth/signup` | 회원가입은 `termsConsentToken`을 필수로 받아 user/email identity/profile/onboarding/terms consent를 transaction으로 생성 | 약관 동의 완료 후 회원가입 입력 화면으로 넘어가는 디자인 흐름과 DB FK를 모두 만족하기 위함 | Home/Search/Notice 검토 |
| 2026-05-17 | Home/Search/Notice | 홈 aggregate, 추천, 통합 검색, 공지 목록/상세 API를 확정. 공지는 read 저장 없이 조회만 제공 | 1차 디자인의 홈/검색/공지 동작과 DB 결정의 `notices`/추천 derived 정책을 반영하기 위함 | Personal Match 검토 |
| 2026-05-17 | Personal Match browse/detail | 개인 매치 목록/상세/신청 가능 여부/내 매치 목록 API 확정. 결제 없이 항상 신청 후 호스트 승인 상태를 표시 | 디자인의 참가 CTA와 DB의 `matches`/`match_applications`/`match_participants` lifecycle을 맞추기 위함 | Personal Match create/edit 검토 |
| 2026-05-17 | Personal Match create/edit | 개인 매치 생성은 즉시 `recruiting` 공개로 확정. 수정/취소는 host 전용이며 v1은 대표 이미지 1장, 직접 입력 장소, 결제 제외 | 디자인에 별도 임시저장/게시 단계가 없고 DB v1이 `matches.image_url`/manual place/payment excluded로 닫혔기 때문 | Personal Match application/manage 검토 |
| 2026-05-17 | Personal Match application/manage | 신청/철회/목록/승인/거절/승인취소/참가취소 API 확정. 승인 취소는 신청 이력을 유지하고 participant만 `removed` 처리 | DB에서 신청 심사 이력과 실제 참가 상태를 분리했고, 승인 이력은 감사/운영상 보존해야 하기 때문 | Team 검토 |
| 2026-05-17 | Team browse/profile | 팀 목록/상세/가입 가능 여부/내 팀 목록 API 확정. open 즉시 가입 없이 `approval_required`/`closed`만 사용 | DB 결정의 owner 1명, manager 최대 5명, 승인형 가입 정책과 디자인의 팀 탐색/가입 흐름을 맞추기 위함 | Team create/manage 검토 |
| 2026-05-17 | Team create/manage | 팀 생성/수정/멤버 목록/역할 변경/멤버 제거 API 확정. 생성자는 owner, manager는 최대 5명, owner 변경은 v1 일반 role API에서 제외 | owner 1명 불변과 manager 제한을 단순하게 지키고, 소유권 이전은 별도 고위험 플로우로 분리하기 위함 | Team join application 검토 |
| 2026-05-17 | Team join application | 팀 가입 신청/철회/목록/승인/거절 API 확정. open 가입은 없고 승인 시 member membership 생성 또는 복구 | DB 결정의 승인형 가입 정책과 `team_join_applications` 심사 이력 보존 원칙을 API에 반영하기 위함 | Team Match 검토 |
| 2026-05-17 | Team Match browse/detail | 팀매치 목록/상세/신청 가능 여부/내 팀매치 목록 API 확정. 신청 가능 여부는 사용자가 관리 권한을 가진 팀별로 반환 | 팀매치 신청 주체가 user가 아니라 applicant team이고, owner/manager 권한 확인이 필요하기 때문 | Team Match create/edit 검토 |
| 2026-05-17 | Team Match create/edit | 팀매치 생성은 즉시 `recruiting` 공개로 확정. host team owner/manager만 생성/수정/취소 가능하며 비용은 `costNote` 텍스트만 사용 | 개인 매치와 같은 공개 흐름을 유지하고, v1 DB에서 결제/시설 FK/스타일 정규화를 제외했기 때문 | Team Match application 검토 |
| 2026-05-17 | Team Match application | 팀매치 신청/철회/목록/승인/거절 API 확정. 승인 시 application approved + team_match matched, approved 상대팀은 최대 1개 | v1 팀매치가 1:1 팀 대 팀 매칭이고 DB가 partial unique 후보로 approved 1개를 전제하기 때문 | Chat/Notification 검토 |
| 2026-05-17 | Chat | 매치/팀매치 연결 채팅 API 확정. v1은 text-only, DM/팀 상시채팅/파일 첨부 제외 | DB 결정의 명시 FK 기반 chat room과 디자인의 매치 조율 채팅 범위를 맞추기 위함 | Notification 검토 |
| 2026-05-18 | Notification | 알림 목록/읽음/모두 읽음/설정 조회/설정 저장 API 확정. 공지 read와 분리하고 알림은 사용자별 `read_at`으로 처리 | DB 결정에서 `notifications`는 user별 row이고 `notification_reads`를 제외했기 때문 | Profile/Settings 검토 |
| 2026-05-18 | Profile/Settings | 내 프로필/공개 프로필/설정/로그아웃/탈퇴 요청 API 확정. 탈퇴는 `withdrawal_pending` 전환 후 삭제/익명화 정책으로 연결 | DB의 users lifecycle과 user_profiles 익명화 정책을 API 상태 전이로 반영하기 위함 | Admin/Audit 검토 |
| 2026-05-18 | Admin/Audit | 관리자 me/overview/상태 변경/감사 로그 API 확정. 상태 변경 mutation은 `admin_action_logs`와 `status_change_logs`를 함께 남김 | 운영 조치는 actor/reason/before/after와 실제 상태 전이를 모두 추적해야 하기 때문 | Deferred Boundaries 검토 |
| 2026-05-18 | Deferred Boundaries | 결제/환불/분쟁/DM/팀 상시채팅/파일 첨부/시설 예약/admin task queue는 v1 URL을 만들지 않는 것으로 확정 | DB v1 제외 결정과 사용자 결정에 따라 core API 범위를 매치/팀/팀매치/채팅/알림/관리자 기본 운영으로 고정하기 위함 | API v1 contract complete |

## 5. User Approval Rule

모든 endpoint를 매번 승인받지는 않는다.

바로 진행할 것:

- 이미 DB 체크리스트에서 확정된 정책을 API로 옮기는 일.
- `sm-new-api-surface-map.md`에 이미 있는 action을 URL/DTO 후보로 구체화하는 일.
- 결제 제외, 공지 read 제외, 팀 open 가입 제외처럼 이전에 닫힌 결정.
- 단순 read API의 pagination/filter/response shape 초안 작성.

사용자에게 물어볼 것:

- 화면에 보이는 버튼 문구나 행동이 바뀌는 결정.
- 권한이 넓어지는 결정.
- 상태 terminal 전이나 복구 가능 여부.
- 나중에 바꾸기 어려운 URL namespace 또는 DTO 구조.
- 기존 결정과 충돌하는 항목.

질문 형식:

```text
현재 판단:
이유:
선택지:
추천:
결정되면 반영할 API:
```

## 6. Global Contract

### 6.1 Envelope, Error, Pagination, Idempotency

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
SM New API v1 전체의 prefix, envelope, common error code, cursor pagination,
idempotency header, status conflict response를 고정한다.

Contract:
Base prefix = /api/v1/sm-new

Success envelope:
{
  "status": "success",
  "data": object | array | null,
  "timestamp": string
}

Error envelope:
{
  "status": "error",
  "statusCode": number,
  "code": string,
  "message": string,
  "details": object | array | null,
  "timestamp": string
}

Auth guard:
public = guest/user 모두 허용
optionalAuth = guest 허용, user면 개인화 포함
user = authenticated user 필요
admin = admin_users row 필요

Actor/permission:
개별 API에서 확정한다. 공통 contract는 actor 값을 response/error details에 노출하지 않는다.

Request params:
path param id는 uuid string으로 고정한다.
id naming은 도메인명을 포함한다. 예: matchId, teamId, teamMatchId, applicationId.

Request query:
cursor string optional
limit number optional, default 20, max 50
query string optional
sort string optional
status string optional
sportId uuid optional
regionId uuid optional
view card | compact optional

Request body:
DTO는 endpoint별로 확정한다.
unknown field는 허용하지 않는다.
UI-only field는 submit 전에 제거한다.

Response data:
단일 조회 = entity object
목록 조회 = { items, pageInfo }
mutation = 변경된 entity 또는 action result object
delete/cancel 같은 상태 변경 = 변경 후 status와 target id를 포함한다.

Pagination:
{
  "items": [],
  "pageInfo": {
    "nextCursor": "string | null",
    "hasNext": true
  }
}

Sort/filter:
검색, 필터, 보기 전환 실패 시 기존 query/filter/view context를 유지한다.
빈 query submit은 domain별로 guard하거나 기본 목록으로 해석하되, 해당 API에서 명시한다.

Idempotency:
Header = Idempotency-Key
Required for:
- create match/team/team match
- submit match/team/team match application
- approve/reject/withdraw/cancel mutations
- chat message send
- notification read-all
- admin status mutations

Not required for:
- GET
- 단일 알림 read처럼 같은 결과로 수렴하는 PATCH. 단, 중복 호출은 성공으로 처리한다.

Common error codes:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
NOT_FOUND_OR_ARCHIVED = 404
STATE_CONFLICT = 409
DUPLICATE_REQUEST = 409
ALREADY_PROCESSED = 409
IDEMPOTENCY_CONFLICT = 409
RATE_LIMITED = 429
INTERNAL_ERROR = 500

State transition:
공통 contract 자체는 상태 전이를 만들지 않는다.
상태 변경 API는 각 endpoint에서 from -> to, actor, audit를 명시한다.

Read/write tables:
공통 contract 자체는 table read/write 없음.

Audit/status log:
공통 contract 자체는 log 없음.
상태 변경 API는 status_change_logs 필요 여부를 endpoint별로 명시한다.
admin mutation은 admin_action_logs를 기본 required로 본다.

UI mapping:
loading = 클라이언트 pending state
empty = 200 success with empty items or null-like domain object. endpoint별 명시
error = error envelope의 code로 화면 복구 경로 선택
permission = PERMISSION_DENIED와 recovery action을 endpoint별 명시
conflict = STATE_CONFLICT/ALREADY_PROCESSED로 최신 상태 refetch 유도

Deferred/payment:
payment/refund/dispute 관련 URL은 v1 core에 만들지 않는다.
디자인의 결제 CTA는 개인 매치/팀매치 신청 mutation으로 치환한다.

Open questions:
없음. 기존 docs/api global contract와 호환되게 진행.
```

## 7. Auth/Onboarding

### 7.1 `GET /auth/me`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
현재 로그인 사용자, 계정 상태, 온보딩 요약, 프로필 요약을 반환한다.

Screen actions:
01 인증/온보딩 = 로그인 성공 후 다음 화면 판단
01 인증/온보딩 = 온보딩 이어하기 resume 판단
02 홈 = 로그인 사용자 개인화 여부 판단
07 마이/프로필 = 내 프로필 진입 기준
09 설정 = 계정 상태 표시

HTTP:
GET /api/v1/sm-new/auth/me

Auth guard:
user

Actor/permission:
authenticated user = 자기 계정만 조회
admin = 이 API 사용하지 않음. admin은 별도 /admin/me 사용

Request params:
없음

Request query:
없음

Request body:
없음

Response data:
{
  "user": {
    "id": "uuid",
    "email": "string | null",
    "phone": "string | null",
    "accountStatus": "active | suspended | blocked | withdrawal_pending | deleted",
    "onboardingStatus": "not_started | terms_done | signup_done | sport_done | level_done | region_done | completed | deferred",
    "lastLoginAt": "datetime | null",
    "createdAt": "datetime"
  },
  "profile": {
    "displayName": "string",
    "nickname": "string | null",
    "avatarUrl": "string | null",
    "profileVisibility": "public | members_only | private",
    "regionSummary": "string | null"
  },
  "onboarding": {
    "status": "not_started | terms_done | signup_done | sport_done | level_done | region_done | completed | deferred",
    "currentStep": "terms | signup | sport | level | region | confirm | done",
    "canResume": true,
    "missing": ["terms" | "profile" | "sports" | "levels" | "regions"]
  },
  "reputation": {
    "mannerScore": "number | null",
    "reviewCount": "number",
    "trustState": "verified | estimated | sample | none"
  }
}

UI mapping:
loading = 앱 부팅/세션 확인 skeleton
success active + completed = 홈으로 진입
success active + not completed = 온보딩 이어하기 또는 제한 추천 홈
suspended/blocked = 차단/정지 persistent card. 홈 이동 차단
withdrawal_pending = 탈퇴 유예 상태 안내와 복구 가능 여부 표시
401 UNAUTHENTICATED = 로그인 화면 또는 비로그인 홈 fallback

State transition:
없음. read-only API.

Read tables:
users
user_profiles
user_onboarding_progress
user_sport_preferences
user_regions
user_reputation_summaries

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
없음

Errors:
UNAUTHENTICATED = 401, 세션 없음 또는 만료
NOT_FOUND = 404, token subject에 해당하는 user 없음
PERMISSION_DENIED = 403, deleted 계정 또는 접근 차단된 계정
INTERNAL_ERROR = 500

Permission/status conflict:
자기 계정 외 조회 불가.
blocked/suspended는 200으로 계정 상태를 내려 UI hard stop 판단을 가능하게 한다.
deleted는 403 또는 404로 처리한다. 복구 가능한 withdrawal_pending과 구분하기 위함이다.

Deferred/payment:
관련 없음.

Open questions:
없음.
```

### 7.2 `POST /auth/oauth/:provider/callback`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
카카오/네이버 OAuth callback 결과를 받아 내부 user session을 만들거나 기존 계정 충돌/차단/이메일 누락
상태를 화면이 처리할 수 있게 반환한다.

Screen actions:
01 인증/온보딩 = 카카오/네이버 로그인 버튼 tap
01 인증/온보딩 = OAuth callback loading
01 인증/온보딩 = provider denied/network/account conflict/missing email/blocked account
01 인증/온보딩 = 온보딩 resume 또는 홈 진입

HTTP:
POST /api/v1/sm-new/auth/oauth/:provider/callback

Auth guard:
public

Actor/permission:
guest = provider callback으로 로그인/가입 시도 가능
authenticated user = 이미 로그인된 상태에서는 provider 연결 flow로 해석하지 않는다. v1에서는 409 처리

Request params:
provider = kakao | naver

Request query:
없음

Request body:
{
  "code": "string",
  "state": "string",
  "redirectUri": "string",
  "nonce": "string | null"
}

Response data:
{
  "authResult": "signed_in | signed_up | needs_terms | needs_onboarding | account_conflict | missing_email | blocked",
  "accessToken": "string | null",
  "refreshToken": "string | null",
  "user": {
    "id": "uuid",
    "accountStatus": "active | suspended | blocked | withdrawal_pending",
    "onboardingStatus": "not_started | terms_done | signup_done | sport_done | level_done | region_done | completed | deferred"
  } | null,
  "identity": {
    "provider": "kakao | naver",
    "email": "string | null",
    "linked": true
  } | null,
  "next": {
    "route": "/home | /onboarding/terms | /onboarding/resume | /login/account-resolve | /login/missing-email | /login/blocked",
    "reason": "string"
  }
}

UI mapping:
loading = provider callback skeleton, 중복 submit 차단
signed_in + completed = 홈 진입
signed_in/signed_up + not completed = 온보딩 이어하기
needs_terms = 회원가입 전 약관 화면
needs_onboarding = 운동 설정 resume
account_conflict = 기존 계정 확인/연결 안내 화면
missing_email = 직접 이메일 인증 fallback 화면
blocked/suspended = persistent hard stop, 홈 이동 차단
provider denied/network = 입력값 없음, 재시도/다른 방법 CTA

State transition:
none -> users.active when 신규 가입 생성
none -> auth_identities.active when 신규 identity 연결
auth_identities.active -> auth_identities.active with last_used_at update when 기존 identity 로그인
users.last_login_at 갱신
users.onboarding_status는 이 API에서 강제로 completed로 바꾸지 않는다.

Read tables:
users
auth_identities
user_profiles
user_onboarding_progress

Write tables:
users, 신규 가입 시
auth_identities, 신규 연결 또는 last_used_at 갱신
user_profiles, 신규 가입 기본 프로필 생성 시
user_onboarding_progress, 신규 가입 기본 progress 생성 시

Audit/status log:
status_change_logs = 계정 상태 변경 없음. 신규 생성 자체는 상태 전이 로그 대상 아님
admin_action_logs = 없음

Idempotency:
권장하지 않음. OAuth `state`와 provider code 일회성을 기준으로 중복 방지.
같은 code 재사용은 PROVIDER_CODE_ALREADY_USED 또는 PROVIDER_CALLBACK_INVALID로 실패.

Pagination/sort/filter:
없음

Errors:
VALIDATION_FAILED = 400, provider/code/state/redirectUri 누락 또는 provider 미지원
PROVIDER_CALLBACK_INVALID = 400, provider 검증 실패
PROVIDER_DENIED = 401, 사용자가 provider 권한을 거부
ACCOUNT_CONFLICT = 409, 같은 email/phone이 다른 user에 연결됨
MISSING_PROVIDER_EMAIL = 409, provider가 email을 제공하지 않음
ALREADY_AUTHENTICATED = 409, 로그인 상태에서 callback 호출
PERMISSION_DENIED = 403, blocked/deleted 계정
INTERNAL_ERROR = 500

Permission/status conflict:
blocked/suspended 계정은 성공 토큰을 발급하지 않고 authResult blocked로 반환한다.
deleted 계정은 복구 flow가 없으면 PERMISSION_DENIED로 처리한다.
withdrawal_pending은 복구 가능 안내가 필요하므로 authResult signed_in과 next reason으로 구분한다.

Deferred/payment:
관련 없음.

Open questions:
없음.
```

### 7.3 `POST /auth/email/login`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
이미 가입된 email identity로 로그인하고 세션 토큰과 다음 이동 경로를 반환한다.
계정이 없으면 자동 생성하지 않고 회원가입 CTA로 복구한다.

Screen actions:
01 인증/온보딩 = 이메일 로그인 화면 submit
01 인증/온보딩 = 이메일/비밀번호 inline 오류
01 인증/온보딩 = 네트워크 실패 시 입력값 보존 + 재시도 CTA
01 인증/온보딩 = 로그인 성공 후 홈 또는 온보딩 resume
01 인증/온보딩 = blocked account hard stop

HTTP:
POST /api/v1/sm-new/auth/email/login

Auth guard:
public

Actor/permission:
guest = email/password 로그인 가능
authenticated user = 이미 로그인된 상태에서는 409 ALREADY_AUTHENTICATED

Request params:
없음

Request query:
없음

Request body:
{
  "email": "string",
  "password": "string"
}

Validation:
email = required, email format, lowercase/trim normalize
password = required, min 8, max 128
unknown fields = rejected

Response data:
{
  "authResult": "signed_in | needs_onboarding | blocked",
  "accessToken": "string | null",
  "refreshToken": "string | null",
  "user": {
    "id": "uuid",
    "email": "string",
    "accountStatus": "active | suspended | blocked | withdrawal_pending",
    "onboardingStatus": "not_started | terms_done | signup_done | sport_done | level_done | region_done | completed | deferred"
  },
  "next": {
    "route": "/home | /onboarding/resume | /login/blocked",
    "reason": "string"
  }
}

UI mapping:
loading = 로그인 CTA submit lock
validation error = 필드별 inline 오류, 입력값 보존
INVALID_CREDENTIALS = 이메일/비밀번호 확인 안내, 입력값 보존
ACCOUNT_NOT_FOUND = 회원가입 CTA 표시
signed_in + completed = 홈 진입
signed_in + not completed = 온보딩 이어하기
blocked/suspended = persistent hard stop, 홈 이동 차단
network/internal error = 입력값 보존 + 재시도 CTA

State transition:
auth_identities.active -> auth_identities.active with last_used_at update
users.last_login_at 갱신
users.onboarding_status는 변경하지 않는다.

Read tables:
users
auth_identities
user_profiles
user_onboarding_progress

Write tables:
users.last_login_at
auth_identities.last_used_at

Audit/status log:
status_change_logs = 없음
admin_action_logs = 없음
보안 감사 로그가 별도 도입되면 실패 횟수/잠금은 future auth security scope에서 다룬다.

Idempotency:
불필요. 로그인은 같은 요청 반복 시 새 토큰 발급 가능.
단, 클라이언트는 submit 중복 lock을 적용한다.

Pagination/sort/filter:
없음

Errors:
VALIDATION_FAILED = 400, email/password 형식 오류
INVALID_CREDENTIALS = 401, 비밀번호 불일치
ACCOUNT_NOT_FOUND = 404, email identity 없음
ALREADY_AUTHENTICATED = 409, 이미 로그인된 상태
PERMISSION_DENIED = 403, blocked/deleted 계정
RATE_LIMITED = 429, 로그인 시도 제한
INTERNAL_ERROR = 500

Permission/status conflict:
blocked/suspended 계정은 성공 토큰을 발급하지 않고 authResult blocked 또는 PERMISSION_DENIED로 처리한다.
withdrawal_pending은 복구 가능 안내가 필요하므로 signed_in + next reason으로 구분한다.
deleted 계정은 ACCOUNT_NOT_FOUND처럼 계정 존재를 노출하지 않는 방향을 권장한다.

Deferred/payment:
관련 없음.

Open questions:
없음.
```

### 7.4 `POST /auth/signup`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
email/password 기반 계정을 생성한다. 회원가입 전에 생성된 `termsConsentToken`을 필수로 받아 user 생성 후
약관 동의를 `user_terms_consents`로 확정한다.

Screen actions:
01 인증/온보딩 = 회원가입 입력 submit
01 인증/온보딩 = 닉네임/이메일/비밀번호/비밀번호 확인 inline 오류
01 인증/온보딩 = 회원가입 완료 안내
01 인증/온보딩 = 운동 설정 시작

HTTP:
POST /api/v1/sm-new/auth/signup

Auth guard:
public

Actor/permission:
guest = 회원가입 가능
authenticated user = 409 ALREADY_AUTHENTICATED

Request params:
없음

Request query:
없음

Request body:
{
  "termsConsentToken": "string",
  "email": "string",
  "password": "string",
  "passwordConfirm": "string",
  "nickname": "string",
  "displayName": "string | null"
}

Validation:
termsConsentToken = required, not expired, not consumed, required terms included
email = required, email format, lowercase/trim normalize, unique
password = required, min 8, max 128
passwordConfirm = required, must match password
nickname = required, unique, 2-20 chars
displayName = optional, max 30 chars
unknown fields = rejected

Response data:
{
  "authResult": "signed_up",
  "accessToken": "string",
  "refreshToken": "string",
  "user": {
    "id": "uuid",
    "email": "string",
    "accountStatus": "active",
    "onboardingStatus": "signup_done"
  },
  "profile": {
    "displayName": "string",
    "nickname": "string",
    "avatarUrl": null
  },
  "next": {
    "route": "/onboarding/sport",
    "reason": "signup_completed"
  }
}

UI mapping:
loading = 가입 CTA submit lock
VALIDATION_FAILED = field inline 오류, 입력값 보존
EMAIL_ALREADY_EXISTS = 이메일 중복 안내, 로그인 CTA 제공
NICKNAME_ALREADY_EXISTS = 닉네임 중복 안내
TERMS_CONSENT_REQUIRED = 약관 화면으로 복귀
signed_up = 가입 완료 안내 후 운동 설정 시작
network/internal error = 입력값 보존 + 재시도 CTA

State transition:
none -> users.active
none -> auth_identities.active with provider email
none -> user_profiles created
none -> user_onboarding_progress created
users.onboarding_status = signup_done
terms consent draft -> user_terms_consents active/current row

Read tables:
terms_documents
auth_identities
users
user_profiles

Write tables:
users
auth_identities
user_profiles
user_onboarding_progress
user_terms_consents
notification_preferences, marketing consent 기본값 반영

Audit/status log:
status_change_logs = users.onboarding_status signup_done 기록
admin_action_logs = 없음

Idempotency:
필수 권장. Header Idempotency-Key 사용.
같은 key로 같은 payload 재시도 시 동일 user/session 결과 반환.
같은 key로 다른 payload 재시도 시 IDEMPOTENCY_CONFLICT.

Pagination/sort/filter:
없음

Errors:
VALIDATION_FAILED = 400
TERMS_CONSENT_REQUIRED = 400, token 없음/만료/필수 약관 누락
TERMS_CONSENT_ALREADY_USED = 409
EMAIL_ALREADY_EXISTS = 409
NICKNAME_ALREADY_EXISTS = 409
ALREADY_AUTHENTICATED = 409
IDEMPOTENCY_CONFLICT = 409
RATE_LIMITED = 429
INTERNAL_ERROR = 500

Permission/status conflict:
이미 가입된 email identity는 새 user를 만들지 않는다.
deleted 계정의 email 재사용 허용 여부는 구현 전 개인정보 정책에서 최종 확인한다. API v1 draft에서는
기본적으로 EMAIL_ALREADY_EXISTS로 막는다.

Deferred/payment:
관련 없음.

Open questions:
없음.
```

### 7.5 `GET /terms/current`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
현재 active/published 상태의 약관 문서 목록을 반환한다. 회원가입 전 약관 화면과 설정의 약관 화면이 같은
master 데이터를 사용한다.

Screen actions:
01 인증/온보딩 = 회원가입 전 약관 확인 화면 진입
09 설정 = 약관/개인정보 문서 확인

HTTP:
GET /api/v1/sm-new/terms/current

Auth guard:
public

Actor/permission:
guest = 조회 가능
authenticated user = 조회 가능

Request params:
없음

Request query:
scope = signup | settings optional, default signup

Request body:
없음

Response data:
{
  "terms": [
    {
      "id": "uuid",
      "type": "terms_of_service | privacy_policy | marketing",
      "title": "string",
      "version": "string",
      "required": true,
      "contentUrl": "string | null",
      "publishedAt": "datetime"
    }
  ]
}

UI mapping:
loading = 약관 skeleton
empty = 회원가입 CTA disabled, 운영 설정 오류 안내
error = 입력 상태 없음, 재시도 CTA

State transition:
없음. read-only API.

Read tables:
terms_documents

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
없음. current 약관 전체를 한 번에 반환한다.

Errors:
VALIDATION_FAILED = 400, scope 값 오류
INTERNAL_ERROR = 500

Permission/status conflict:
없음. archived/draft 문서는 반환하지 않는다.

Deferred/payment:
관련 없음.

Open questions:
없음.
```

### 7.6 `POST /terms/consents`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
회원가입 전 약관 동의 draft를 생성하고 `termsConsentToken`을 반환한다. 로그인 사용자가 호출하면 현재 사용자
약관 동의 갱신으로 처리할 수 있지만, 회원가입 흐름에서는 guest draft가 기본이다.

Screen actions:
01 인증/온보딩 = 회원가입 전 약관 전체 동의/개별 동의
01 인증/온보딩 = 필수 약관 미동의 CTA disabled
01 인증/온보딩 = 약관 동의 완료 후 회원가입 입력 화면 이동
09 설정 = 약관 동의 갱신 후보

HTTP:
POST /api/v1/sm-new/terms/consents

Auth guard:
optionalAuth

Actor/permission:
guest = signup draft token 생성
authenticated user = 자기 약관 동의 갱신 가능

Request params:
없음

Request query:
mode = signup | update optional, default signup

Request body:
{
  "consents": [
    {
      "termsDocumentId": "uuid",
      "agreed": true
    }
  ],
  "marketingOptIn": false
}

Validation:
모든 required current terms_documents가 agreed true여야 한다.
선택 약관은 false 또는 누락 가능.
archived/draft termsDocumentId는 허용하지 않는다.
unknown fields = rejected.

Response data for guest signup:
{
  "mode": "signup",
  "termsConsentToken": "string",
  "expiresAt": "datetime",
  "requiredComplete": true,
  "marketingOptIn": false,
  "next": {
    "route": "/signup",
    "reason": "terms_draft_created"
  }
}

Response data for authenticated update:
{
  "mode": "update",
  "requiredComplete": true,
  "marketingOptIn": false,
  "updatedConsents": [
    { "termsDocumentId": "uuid", "agreed": true, "consentedAt": "datetime" }
  ]
}

UI mapping:
required missing = CTA disabled reason, submit하지 않는 것이 기본
VALIDATION_FAILED = 누락 약관 row 표시
success guest = 회원가입 입력 화면 이동
success user = 설정 저장 완료 toast
network/internal error = 체크 상태 보존 + 재시도 CTA

State transition:
guest signup:
none -> terms consent draft token created
실제 user_terms_consents row는 signup 성공 시 생성

authenticated update:
user_terms_consents row upsert/update
users.onboarding_status:
not_started -> terms_done 가능
그 외 상태는 낮추지 않는다.

Read tables:
terms_documents
users, authenticated update 시
user_terms_consents, authenticated update 시

Write tables:
guest signup = persistent table 미정. implementation may use signed token, Redis, or short-lived draft store
authenticated update = user_terms_consents, notification_preferences.marketing_opt_in

Audit/status log:
status_change_logs = authenticated user의 onboarding_status가 terms_done으로 바뀌는 경우 기록
admin_action_logs = 없음

Idempotency:
guest draft = optional. 같은 payload 반복 시 새 token 발급 허용
authenticated update = 같은 payload 반복 시 같은 상태로 수렴

Pagination/sort/filter:
없음

Errors:
VALIDATION_FAILED = 400, 필수 약관 누락 또는 document id 오류
UNAUTHENTICATED = 401, mode update인데 user 없음
NOT_FOUND = 404, terms document 없음
STATE_CONFLICT = 409, archived/draft 약관에 동의 시도
INTERNAL_ERROR = 500

Permission/status conflict:
guest는 user_terms_consents에 직접 저장하지 않는다.
blocked/deleted authenticated user는 update 불가.

Deferred/payment:
관련 없음.

Open questions:
없음. 단, draft token 저장 매체는 구현 단계에서 확정한다.
```

### 7.7 `GET /onboarding`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
온보딩 진행 상태, 선택된 종목/실력/지역, 누락 항목, 재개 step을 반환한다.

Screen actions:
01 인증/온보딩 = 온보딩 이어하기
01 인증/온보딩 = 종목/실력/지역/확인 step hydrate
01 인증/온보딩 = 지역 0개 상태 표시

HTTP:
GET /api/v1/sm-new/onboarding

Auth guard:
user

Actor/permission:
authenticated user = 자기 온보딩만 조회

Request params:
없음

Request query:
없음

Request body:
없음

Response data:
{
  "status": "not_started | terms_done | signup_done | sport_done | level_done | region_done | completed | deferred",
  "currentStep": "terms | signup | sport | level | region | confirm | done",
  "canResume": true,
  "sports": [
    { "sportId": "uuid", "sportName": "string", "levelId": "uuid | null", "levelName": "string | null" }
  ],
  "regions": [
    { "regionId": "uuid", "name": "string", "primary": true }
  ],
  "missing": ["terms" | "profile" | "sports" | "levels" | "regions"],
  "regionOptional": true
}

UI mapping:
loading = step skeleton
empty sports = 종목 선택 step
missing levels = 실력 입력 step disabled reason
empty regions = 정상 허용, 확인 화면에 지역 없음 표시
error = 입력 draft 보존 + 재시도 CTA

State transition:
없음. read-only API.

Read tables:
users
user_onboarding_progress
user_sport_preferences
sport_levels
user_regions
regions
user_terms_consents

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
없음

Errors:
UNAUTHENTICATED = 401
NOT_FOUND = 404, user 없음
PERMISSION_DENIED = 403, blocked/deleted 계정
INTERNAL_ERROR = 500

Permission/status conflict:
자기 온보딩만 조회 가능.
completed 사용자가 호출해도 200으로 done 상태를 반환한다.

Deferred/payment:
관련 없음.

Open questions:
없음.
```

### 7.8 `PATCH /onboarding/preferences`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
온보딩 종목/실력/지역 선호를 저장한다. 부분 저장과 step별 저장을 모두 지원한다.

Screen actions:
01 인증/온보딩 = 종목 card 선택
01 인증/온보딩 = 선택 종목별 실력 입력
01 인증/온보딩 = 지역 chip 선택/해제
01 인증/온보딩 = 위치 권한 거부 후 수동 지역 선택
01 인증/온보딩 = 확인 화면에서 항목 수정 후 복귀

HTTP:
PATCH /api/v1/sm-new/onboarding/preferences

Auth guard:
user

Actor/permission:
authenticated user = 자기 preference만 저장

Request params:
없음

Request query:
없음

Request body:
{
  "sports": [
    { "sportId": "uuid", "levelId": "uuid | null" }
  ],
  "regions": [
    { "regionId": "uuid", "primary": true }
  ],
  "currentStep": "sport | level | region | confirm"
}

Validation:
sports = optional array, provided 시 중복 sportId 금지
levelId = sportId에 속한 active sport_level만 허용
regions = optional array, 빈 배열 허용
regions.primary = 최대 1개 true
currentStep = required
현재 위치 permission 값은 저장하지 않는다.

Response data:
{
  "status": "sport_done | level_done | region_done | deferred",
  "currentStep": "sport | level | region | confirm",
  "canContinue": true,
  "missing": ["sports" | "levels" | "regions"],
  "sports": [
    { "sportId": "uuid", "levelId": "uuid | null" }
  ],
  "regions": [
    { "regionId": "uuid", "primary": true }
  ]
}

UI mapping:
sport 0개 = canContinue false, 다음 CTA disabled reason
level 누락 = canContinue false, 누락 종목 row 표시
region 0개 = canContinue true, 지역 없음으로 표시
validation error = 해당 field inline 오류
network error = 입력값 보존 + 재시도 CTA

State transition:
users.onboarding_status:
signup_done -> sport_done when sports length > 0
sport_done -> level_done when selected sports all have levelId
level_done -> region_done when region step 저장. regions empty 가능
region_done -> level_done/sport_done 가능, 사용자가 선택을 제거한 경우

Read tables:
users
sports
sport_levels
regions
user_sport_preferences
user_regions
user_onboarding_progress

Write tables:
user_sport_preferences
user_regions
user_onboarding_progress
users.onboarding_status

Audit/status log:
status_change_logs = onboarding_status 변경 시 기록
admin_action_logs = 없음

Idempotency:
권장. 같은 payload 반복 저장은 같은 결과로 수렴해야 한다.
Header Idempotency-Key optional.

Pagination/sort/filter:
없음

Errors:
VALIDATION_FAILED = 400, sport/level/region 불일치 또는 중복
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403, blocked/deleted 계정
NOT_FOUND = 404, master id 없음
STATE_CONFLICT = 409, inactive sport/level/region 선택
INTERNAL_ERROR = 500

Permission/status conflict:
completed 사용자도 수정 가능하되, 저장 후 completed를 유지할지 재검증할지는 complete API에서 최종 판단한다.
blocked/deleted 계정은 저장 불가.

Deferred/payment:
관련 없음.

Open questions:
없음.
```

### 7.9 `POST /onboarding/complete` / `POST /onboarding/defer`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
온보딩을 완료하거나 나중에 설정으로 넘긴다.

Screen actions:
01 인증/온보딩 = 선택 확인 화면 최종 CTA
01 인증/온보딩 = 홈으로 시작하기
01 인증/온보딩 = 나중에 설정
01 인증/온보딩 = 완료/누락/오류 피드백

HTTP:
POST /api/v1/sm-new/onboarding/complete
POST /api/v1/sm-new/onboarding/defer

Auth guard:
user

Actor/permission:
authenticated user = 자기 온보딩만 완료/defer

Request params:
없음

Request query:
없음

Request body:
complete = {}
defer = { "reason": "skip_now | later | unknown" }

Response data:
{
  "status": "completed | deferred",
  "next": {
    "route": "/home",
    "reason": "string"
  },
  "missing": ["sports" | "levels" | "regions"],
  "limited": true
}

UI mapping:
complete success = 환영 화면 또는 홈 push
complete validation failed = 누락 step으로 이동, CTA disabled reason
defer success = 제한 추천 홈으로 진입
blocked/deleted = hard stop
error = 현재 선택값 보존 + 재시도 CTA

State transition:
complete:
region_done -> completed
level_done -> completed if regions empty and regionOptional true
sport_done -> rejected if any selected sport missing level
signup_done/not_started/terms_done -> rejected

defer:
not_started | terms_done | signup_done | sport_done | level_done | region_done -> deferred
completed -> completed 유지

Read tables:
users
user_onboarding_progress
user_sport_preferences
user_regions

Write tables:
users.onboarding_status
user_onboarding_progress

Audit/status log:
status_change_logs = onboarding_status 변경 시 기록
admin_action_logs = 없음

Idempotency:
권장. complete/defer 반복 호출은 같은 최종 상태로 수렴해야 한다.
Header Idempotency-Key optional.

Pagination/sort/filter:
없음

Errors:
VALIDATION_FAILED = 400, 완료 조건 미충족
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403, blocked/deleted 계정
STATE_CONFLICT = 409, inactive sport/level 등으로 완료 불가
INTERNAL_ERROR = 500

Permission/status conflict:
completed 상태에서 defer 호출은 completed를 유지하고 200으로 현재 상태를 반환한다.
deferred 상태에서 complete 호출은 최신 preference를 재검증한다.

Deferred/payment:
관련 없음.

Open questions:
없음.
```

## 8. Home/Search/Notice

### 8.1 `GET /home`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
홈 첫 화면에 필요한 사용자 요약, 대표 추천, shortcut, 추천 목록, pinned 공지, unread 알림 요약을 한 번에
반환한다. 비로그인과 네트워크 복구 상태에서도 화면 shape를 유지할 수 있게 null/derived 값을 명확히 둔다.

Screen actions:
02 홈 = 앱 홈 진입
02 홈 = 대표 추천 card/detail
02 홈 = quick action 매치/팀매치/팀
02 홈 = 공지 row/전체보기
02 홈 = 네트워크 retry

HTTP:
GET /api/v1/sm-new/home

Auth guard:
optionalAuth

Actor/permission:
guest = public/랜덤 추천과 public notice만 조회
authenticated user = 개인화 추천, 내 요약, unread 알림 요약 포함

Request params:
없음

Request query:
regionId uuid optional
sportId uuid optional

Request body:
없음

Response data:
{
  "viewer": {
    "authenticated": true,
    "displayName": "string | null",
    "onboardingStatus": "completed | deferred | null"
  },
  "summary": {
    "monthlyMatches": "number | null",
    "mannerScore": "number | null",
    "trustState": "verified | estimated | sample | none",
    "pendingLabel": "string | null"
  },
  "featuredMatch": {
    "matchId": "uuid",
    "title": "string",
    "reason": "string",
    "participantCount": number,
    "capacity": number
  } | null,
  "shortcuts": [
    { "key": "matches | team_matches | teams | my_team", "enabled": true, "route": "string | null", "disabledReason": "string | null" }
  ],
  "recommendations": [
    { "matchId": "uuid", "title": "string", "sportName": "string", "regionName": "string | null", "startsAt": "datetime" }
  ],
  "notice": {
    "noticeId": "uuid",
    "title": "string",
    "pinned": true
  } | null,
  "notifications": {
    "unreadCount": number
  }
}

UI mapping:
guest = summary 값 null, 추천은 public/랜덤, 로그인 CTA는 필요한 위치에만 노출
deferred onboarding = 제한 추천 가능
featuredMatch null = 대표 추천 영역 축소 또는 추천 목록 우선
notice null = 공지 영역 compact/hidden
my_team shortcut = route null, enabled false, disabled reason 유지
error = 전체 화면 실패보다 section별 fallback + retry CTA 권장

State transition:
없음. read-only aggregate API.

Read tables:
users, optional
user_profiles, optional
user_sport_preferences, optional
user_regions, optional
user_reputation_summaries, optional
matches
notices
notifications, optional

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
없음. 추천 목록은 홈용 최대 5개로 고정한다.

Errors:
VALIDATION_FAILED = 400, query id 형식 오류
INTERNAL_ERROR = 500

Permission/status conflict:
blocked/deleted 사용자는 개인화 응답 대신 auth hard stop이 우선이다. 클라이언트는 `GET /auth/me` 결과를 먼저 본다.

Deferred/payment:
결제/활동 결제 통계는 v1 홈 summary에서 제외한다.

Open questions:
없음.
```

### 8.2 `GET /home/recommendations`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
홈 추천 매치 목록을 별도로 갱신한다. 추천 결과는 v1에서 저장하지 않고 사용자 선호/지역/공개 매치 기준으로
실시간 계산한 derived response로 제공한다.

Screen actions:
02 홈 = 추천 목록 새로고침
02 홈 = 추천 전체보기
02 홈 = 추천 card tap

HTTP:
GET /api/v1/sm-new/home/recommendations

Auth guard:
optionalAuth

Actor/permission:
guest = public 추천 조회
authenticated user = 선호 기반 추천 조회

Request params:
없음

Request query:
limit number optional, default 5, max 20
sportId uuid optional
regionId uuid optional

Request body:
없음

Response data:
{
  "items": [
    {
      "matchId": "uuid",
      "title": "string",
      "sportName": "string",
      "regionName": "string | null",
      "startsAt": "datetime",
      "participantCount": number,
      "capacity": number,
      "recommendationReason": "string",
      "trustState": "verified | estimated | sample | none"
    }
  ],
  "derived": true
}

UI mapping:
empty = 인기/public match fallback 또는 추천 없음 compact state
error = 기존 추천 유지 + retry CTA
sample/estimated = 실제 신뢰 신호처럼 과장하지 않음

State transition:
없음. read-only derived API.

Read tables:
matches
match_participants
sports
regions
user_sport_preferences, optional
user_regions, optional
user_reputation_summaries, optional

Write tables:
없음. match_recommendations table 사용하지 않음.

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
limit만 지원한다. cursor pagination은 홈 추천 v1에서 사용하지 않는다.

Errors:
VALIDATION_FAILED = 400
INTERNAL_ERROR = 500

Permission/status conflict:
private/cancelled/deleted match는 추천에 포함하지 않는다.

Deferred/payment:
결제 가능 여부는 추천 기준에 포함하지 않는다.

Open questions:
없음.
```

### 8.3 `GET /search`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
홈 검색 overlay/검색 결과 화면에서 개인 매치, 팀 매치, 팀을 한 번에 묶어 보여준다. 검색어 입력 중
이전 요청 결과가 늦게 도착해도 최신 query 기준 결과만 화면에 반영할 수 있도록 query echo와 group 단위 응답을 제공한다.

Screen actions:
02 홈 = search input focus
02 홈 = keyword submit/change
02 홈 = grouped result row tap
02 홈 = group 전체보기
02 홈 = empty/error state

HTTP:
GET /api/v1/sm-new/search

Auth guard:
optionalAuth

Actor/permission:
guest = public 검색 가능 데이터만 조회
authenticated user = public 데이터 + 사용자 선호 기반 ranking 보정

Request params:
없음

Request query:
query string required, min 1, max 50
types string optional, comma separated, allowed match, team_match, team, default all
limitPerType number optional, default 5, max 10
sportId uuid optional
regionId uuid optional

Request body:
없음

Response data:
{
  "query": "string",
  "groups": [
    {
      "type": "match | team_match | team",
      "totalCount": number,
      "items": [
        {
          "id": "uuid",
          "title": "string",
          "subtitle": "string",
          "status": "string",
          "route": "string",
          "trustState": "verified | estimated | sample | none"
        }
      ]
    }
  ],
  "stale": false
}

UI mapping:
empty = 검색 결과 header 유지 + 결과 없음 문구
loading = 입력값 유지 + group skeleton
error = 입력값 유지 + retry toast
stale response = response.query가 현재 input과 다르면 화면 반영하지 않음
group 전체보기 = 각 도메인 목록 API에 query/filter를 넘겨 이동
row tap = route로 이동

State transition:
없음. read-only 검색 API.

Read tables:
matches
team_matches
teams
team_profiles
team_trust_scores
sports
regions
user_sport_preferences, optional
user_regions, optional

Write tables:
없음. v1에서는 최근 검색어를 저장하지 않는다.

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
통합 검색은 cursor 없이 type별 `limitPerType`만 제공한다. 더보기/전체보기는 각 도메인 목록 API가 cursor pagination을 담당한다.

Errors:
VALIDATION_FAILED = 400, query 누락/길이 초과/types 오류/id 형식 오류
INTERNAL_ERROR = 500

Permission/status conflict:
private/deleted/archived/cancelled 항목은 검색 결과에 포함하지 않는다. 권한이 필요한 운영/admin 항목은 admin surface 검색에서만 다룬다.

Deferred/payment:
결제/환불/분쟁 결과는 v1 통합 검색에 포함하지 않는다.

Open questions:
없음.
```

### 8.4 `GET /notices`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
사이트 전체 공지 목록을 제공한다. 공지 읽음 상태는 저장하지 않고, 사용자가 목록/상세를 열어 내용을 확인할 수 있는
수준까지만 v1 범위로 둔다.

Screen actions:
02 홈 = pinned notice tap
02 홈 = 공지 전체보기
04 공지 = 목록 scroll
04 공지 = 공지 row tap
04 공지 = empty/error state

HTTP:
GET /api/v1/sm-new/notices

Auth guard:
optionalAuth

Actor/permission:
guest = public target notice만 조회
authenticated user = public + users target notice 조회
admin target notice는 admin API에서만 조회

Request params:
없음

Request query:
cursor string optional
limit number optional, default 20, max 50
target string optional, allowed public, users
pinned boolean optional

Request body:
없음

Response data:
{
  "items": [
    {
      "noticeId": "uuid",
      "title": "string",
      "summary": "string",
      "target": "public | users",
      "pinned": true,
      "publishedAt": "datetime"
    }
  ],
  "pageInfo": {
    "nextCursor": "string | null",
    "hasNext": true
  }
}

UI mapping:
empty = 공지 없음 compact state
loading = list skeleton
error = retry CTA
pinned = 목록 상단 고정 label

State transition:
없음. read-only 목록 API.

Read tables:
notices

Write tables:
없음. `notice_reads`는 v1에서 만들지 않는다.

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
cursor pagination. sort는 pinned desc, published_at desc, notice_id desc.

Errors:
VALIDATION_FAILED = 400, cursor/limit/target 오류
INTERNAL_ERROR = 500

Permission/status conflict:
draft/archived/deleted notice는 반환하지 않는다. guest가 users target을 요청하면 public 결과만 반환하거나 403 대신 빈 목록으로 정규화한다.

Deferred/payment:
결제 공지 전용 API나 결제 상태 연동은 v1에서 제외한다.

Open questions:
없음.
```

### 8.5 `GET /notices/:noticeId`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
사이트 전체 공지 상세 내용을 반환한다. 상세 진입 자체를 읽음 처리로 저장하지 않고, 사용자가 공지 내용을 확인하는
동작만 지원한다.

Screen actions:
02 홈 = pinned notice detail
04 공지 = notice row detail
04 공지 = back/list return
04 공지 = detail empty/error state

HTTP:
GET /api/v1/sm-new/notices/:noticeId

Auth guard:
optionalAuth

Actor/permission:
guest = public target notice만 상세 조회
authenticated user = public + users target notice 상세 조회
admin target notice는 admin API에서만 상세 조회

Request params:
noticeId uuid required

Request query:
없음

Request body:
없음

Response data:
{
  "noticeId": "uuid",
  "title": "string",
  "body": "string",
  "target": "public | users",
  "pinned": true,
  "publishedAt": "datetime",
  "updatedAt": "datetime"
}

UI mapping:
not found/archived = 공지를 찾을 수 없음
permission denied = 접근할 수 없는 공지
loading = detail skeleton
error = retry CTA

State transition:
없음. read-only 상세 API.

Read tables:
notices

Write tables:
없음. `notice_reads`는 v1에서 만들지 않는다.

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400, noticeId 형식 오류
PERMISSION_DENIED = 403, target 접근 불가
NOT_FOUND_OR_ARCHIVED = 404
INTERNAL_ERROR = 500

Permission/status conflict:
draft/archived/deleted notice는 404로 정규화한다. users target notice를 guest가 직접 조회하면 403 또는 로그인 필요 UI로 매핑한다.

Deferred/payment:
결제/환불/분쟁 상태와 연결하지 않는다.

Open questions:
없음.
```

## 9. Personal Match

### 9.1 Browse/Detail APIs

| API | Done |
|---|---|
| `GET /matches` | [x] |
| `GET /matches/:matchId` | [x] |
| `GET /matches/:matchId/application-eligibility` | [x] |
| `GET /me/matches` | [x] |

각 API는 2장의 Completion Criteria를 모두 채워야 Done으로 바꾼다.

#### 9.1.1 `GET /matches`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
개인 매치 목록, 검색, 필터, 정렬, view mode 전환에 필요한 card/list 데이터를 cursor pagination으로 제공한다.
v1 목록은 결제 가능 여부가 아니라 모집 상태, 정원, 마감, 호스트 승인 필요 여부를 중심으로 보여준다.

Screen actions:
03 개인 매치 목록 = list 진입
03 개인 매치 목록 = search/filter/sort/view mode
03 개인 매치 목록 = sport chip
03 개인 매치 목록 = empty/error retry/filter reset
14 desktop match search = 같은 API를 넓은 layout에서 재사용

HTTP:
GET /api/v1/sm-new/matches

Auth guard:
optionalAuth

Actor/permission:
guest/user = 공개 개인 매치 목록 조회
authenticated user = 내 신청/참가 상태 요약을 item에 포함 가능

Request params:
없음

Request query:
cursor string optional
limit number optional, default 20, max 50
query string optional, max 50
sportId uuid optional
regionId uuid optional
status string optional, allowed recruiting, closed, completed, cancelled, expired, default recruiting
sort string optional, allowed recommended, latest, starts_at, deadline, default recommended
view string optional, allowed card, compact

Request body:
없음

Response data:
{
  "items": [
    {
      "matchId": "uuid",
      "title": "string",
      "descriptionPreview": "string | null",
      "imageUrl": "string | null",
      "sport": { "sportId": "uuid", "name": "string" },
      "region": { "regionId": "uuid", "name": "string" } | null,
      "place": { "name": "string", "addressText": "string | null" },
      "startsAt": "datetime",
      "endsAt": "datetime | null",
      "deadlineAt": "datetime | null",
      "capacity": number,
      "participantCount": number,
      "status": "recruiting | closed | cancelled | completed | expired",
      "displayState": "recruiting | full | deadline_soon | closed | cancelled | completed | expired",
      "approvalRequired": true,
      "paymentRequired": false,
      "viewerState": "none | host | requested | approved | participant | rejected | withdrawn"
    }
  ],
  "pageInfo": { "nextCursor": "string | null", "hasNext": true }
}

UI mapping:
empty = 필터 유지 + 결과 없음 + 필터 초기화 CTA
loading = list skeleton
error = retry CTA, 기존 query/filter 유지
full/deadline_soon = DB status가 아니라 displayState로 표시
paymentRequired false = 디자인의 결제 CTA를 노출하지 않고 신청 CTA로 치환

State transition:
없음. read-only 목록 API.

Read tables:
matches
sports
regions
match_participants
match_applications, optional viewer state

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
cursor pagination. sort는 recommended/latest/starts_at/deadline. recommended는 사용자 선호가 있으면 sport/region 우선, 없으면 recruiting + starts_at 기준으로 계산한다.

Errors:
VALIDATION_FAILED = 400, query/filter/sort/view/cursor 오류
INTERNAL_ERROR = 500

Permission/status conflict:
deleted_at이 있는 match는 일반 목록에서 제외한다. admin 전용 숨김/삭제 항목은 admin API에서만 다룬다.

Deferred/payment:
결제 필드/결제 상태/환불 상태는 응답하지 않는다. `paymentRequired`는 항상 false로 고정한다.

Open questions:
없음.
```

#### 9.1.2 `GET /matches/:matchId`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
개인 매치 상세 화면에 필요한 모집글, 호스트, 참가자 preview, 내 신청/참가 상태, CTA 상태를 반환한다.
참가 CTA는 결제 없이 신청 생성으로 이어지고, 승인 전에는 pending 상태를 명확히 보여준다.

Screen actions:
03 개인 매치 상세 = detail 진입
03 개인 매치 상세 = back/share/bell
03 개인 매치 상세 = participant preview
03 개인 매치 상세 = join sheet open
03 개인 매치 상세 = pending/approved locked CTA
03 My match detail = host manage CTA 노출

HTTP:
GET /api/v1/sm-new/matches/:matchId

Auth guard:
optionalAuth

Actor/permission:
guest = 공개 상세 조회, 신청 CTA는 login required로 매핑
user = 상세 조회 + viewer application/participant state 포함
host = 관리 CTA와 신청자/참가자 관리 route 노출

Request params:
matchId uuid required

Request query:
없음

Request body:
없음

Response data:
{
  "matchId": "uuid",
  "title": "string",
  "description": "string | null",
  "imageUrl": "string | null",
  "sport": { "sportId": "uuid", "name": "string" },
  "region": { "regionId": "uuid", "name": "string" } | null,
  "place": { "name": "string", "addressText": "string | null" },
  "startsAt": "datetime",
  "endsAt": "datetime | null",
  "deadlineAt": "datetime | null",
  "capacity": number,
  "participantCount": number,
  "status": "draft | recruiting | closed | cancelled | completed | expired",
  "displayState": "recruiting | full | deadline_soon | closed | cancelled | completed | expired",
  "rulesText": "string | null",
  "approvalRequired": true,
  "paymentRequired": false,
  "host": {
    "userId": "uuid",
    "displayName": "string",
    "profileImageUrl": "string | null",
    "trustState": "verified | estimated | sample | none"
  },
  "participantsPreview": [
    { "participantId": "uuid", "userId": "uuid", "displayName": "string", "role": "host | participant", "status": "confirmed | checked_in | completed" }
  ],
  "viewer": {
    "state": "guest | none | host | requested | approved | participant | rejected | withdrawn",
    "applicationId": "uuid | null",
    "participantId": "uuid | null",
    "canApply": true,
    "ctaLabel": "string",
    "disabledReason": "string | null",
    "manageRoute": "string | null"
  }
}

UI mapping:
guest = CTA login required
requested = 승인 대기 locked CTA
approved/participant = 참여 확정 상태와 채팅/참가 정보 CTA 후보
host = 신청자/참가자 관리 CTA 노출
full/deadline/cancelled/expired = 신청 CTA disabled reason
not found = 삭제/비공개/없는 매치 공통 not found 화면

State transition:
없음. read-only 상세 API.

Read tables:
matches
sports
regions
user_profiles
user_reputation_summaries
match_participants
match_applications, optional viewer state

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
없음. participantsPreview는 최대 6명으로 제한하고 전체 관리는 host manage API에서 처리한다.

Errors:
VALIDATION_FAILED = 400, matchId 형식 오류
NOT_FOUND_OR_ARCHIVED = 404
INTERNAL_ERROR = 500

Permission/status conflict:
draft/deleted match는 host/admin이 아니면 404로 정규화한다. cancelled/completed/expired는 상세 조회는 가능하되 신청 CTA만 비활성화한다.

Deferred/payment:
결제 없이 신청 흐름만 제공한다. venue FK 없이 manual place fields만 반환한다.

Open questions:
없음.
```

#### 9.1.3 `GET /matches/:matchId/application-eligibility`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
참가 신청 sheet를 열기 전 또는 신청 직전, 현재 사용자가 신청 가능한지 서버 기준으로 확인한다.
상세 응답의 viewer state와 같은 정책을 쓰되, mutation 직전 stale 상태를 줄이는 preflight API다.

Screen actions:
03 개인 매치 상세 = join sheet open
03 개인 매치 상세 = 신청 확인 primary 전 preflight
03 개인 매치 상세 = sold out/deadline/permission/cancelled/stale 예외

HTTP:
GET /api/v1/sm-new/matches/:matchId/application-eligibility

Auth guard:
user

Actor/permission:
authenticated user = 자기 신청 가능 여부 조회
host = 자기 매치 신청 불가, host reason 반환

Request params:
matchId uuid required

Request query:
없음

Request body:
없음

Response data:
{
  "matchId": "uuid",
  "eligible": true,
  "reasonCode": "OK | LOGIN_REQUIRED | HOST_CANNOT_APPLY | ALREADY_REQUESTED | ALREADY_PARTICIPANT | FULL | DEADLINE_PASSED | NOT_RECRUITING | BLOCKED_USER",
  "message": "string",
  "viewerState": "none | host | requested | approved | participant | rejected | withdrawn",
  "applicationId": "uuid | null",
  "participantId": "uuid | null",
  "requiresApproval": true,
  "requiresPayment": false
}

UI mapping:
eligible true = 신청 확인 sheet primary enabled
eligible false = sheet disabled reason 또는 toast
ALREADY_REQUESTED = 승인 대기 상태로 전환
ALREADY_PARTICIPANT = 참여 확정 상태로 전환
FULL/DEADLINE_PASSED/NOT_RECRUITING = stale detail refresh 권장

State transition:
없음. read-only preflight API.

Read tables:
matches
match_applications
match_participants
users

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400, matchId 형식 오류
UNAUTHENTICATED = 401
NOT_FOUND_OR_ARCHIVED = 404
INTERNAL_ERROR = 500

Permission/status conflict:
차단/삭제/정지 사용자는 eligible false 또는 auth hard stop으로 처리한다. host는 자기 매치에 신청할 수 없다.

Deferred/payment:
항상 `requiresPayment = false`, `requiresApproval = true`.

Open questions:
없음.
```

#### 9.1.4 `GET /me/matches`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
마이/프로필의 내가 만든 매치와 내가 신청/참여한 매치 목록을 제공한다. 같은 화면에서 created/joined toggle을
전환할 수 있게 scope query로 구분한다.

Screen actions:
07 마이 = My matches created/joined toggle
07 마이 = created match manage 진입
07 마이 = joined/requested match detail 진입
07 마이 = empty/error state

HTTP:
GET /api/v1/sm-new/me/matches

Auth guard:
user

Actor/permission:
authenticated user = 자기 host/application/participant 관계가 있는 match만 조회

Request params:
없음

Request query:
scope string optional, allowed created, joined, applied, all, default all
status string optional, allowed recruiting, closed, cancelled, completed, expired, requested, approved, rejected, withdrawn
cursor string optional
limit number optional, default 20, max 50

Request body:
없음

Response data:
{
  "items": [
    {
      "matchId": "uuid",
      "title": "string",
      "sportName": "string",
      "startsAt": "datetime",
      "status": "recruiting | closed | cancelled | completed | expired",
      "relation": "host | requested | approved | participant | rejected | withdrawn",
      "applicationId": "uuid | null",
      "participantId": "uuid | null",
      "manageRoute": "string | null",
      "detailRoute": "string"
    }
  ],
  "pageInfo": { "nextCursor": "string | null", "hasNext": true }
}

UI mapping:
created empty = 만든 매치 없음 + 만들기 CTA
joined/applied empty = 신청/참여 내역 없음
host relation = 관리 CTA 노출
requested = 승인 대기 label
rejected/withdrawn = 과거 신청 이력 label, 재신청은 상세/eligibility 정책으로 판단

State transition:
없음. read-only my list API.

Read tables:
matches
match_applications
match_participants
sports
regions

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
cursor pagination. 기본 정렬은 starts_at desc, created_at desc 혼합이 아니라 관계별 최신 활동 시각 desc로 정규화한다.

Errors:
VALIDATION_FAILED = 400, scope/status/cursor 오류
UNAUTHENTICATED = 401
INTERNAL_ERROR = 500

Permission/status conflict:
다른 사용자의 my list 조회는 지원하지 않는다. deleted match는 host/participant 이력 보존이 필요한 경우 제목 최소화 상태로만 반환할 수 있다.

Deferred/payment:
결제/환불 내역은 포함하지 않는다.

Open questions:
없음.
```

### 9.2 Create/Edit APIs

| API | Done |
|---|---|
| `POST /matches` | [x] |
| `GET /matches/:matchId/edit` | [x] |
| `PATCH /matches/:matchId` | [x] |
| `POST /matches/:matchId/cancel` | [x] |

#### 9.2.1 `POST /matches`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
개인 매치 생성 단계의 종목/정보/장소/시간/확인 입력을 서버에 저장하고 즉시 모집 중 상태로 공개한다.
별도 임시저장/게시 API는 v1에서 제공하지 않는다.

Screen actions:
03 개인 매치 생성 = sport step
03 개인 매치 생성 = info step
03 개인 매치 생성 = image upload preview
03 개인 매치 생성 = place/time step
03 개인 매치 생성 = confirm
03 개인 매치 생성 = 매치 만들기 submit

HTTP:
POST /api/v1/sm-new/matches

Auth guard:
user

Actor/permission:
authenticated user = 개인 매치 생성 가능
blocked/suspended/deleted user = 생성 불가

Request params:
없음

Request query:
없음

Request body:
{
  "sportId": "uuid",
  "regionId": "uuid | null",
  "title": "string",
  "description": "string | null",
  "imageUrl": "string | null",
  "startsAt": "datetime",
  "endsAt": "datetime | null",
  "deadlineAt": "datetime | null",
  "capacity": number,
  "manualPlaceName": "string",
  "addressText": "string | null",
  "rulesText": "string | null"
}

Validation:
title required, max 80
description max 2000
imageUrl nullable, v1 대표 이미지 1장
startsAt future required
endsAt nullable, 있으면 startsAt 이후
deadlineAt nullable, 있으면 startsAt 이전
capacity min 2, max 100
manualPlaceName required, max 120
addressText max 200
rulesText max 2000
sportId must be active
regionId nullable. 직접 입력 장소만 있고 지역 선택이 없을 수 있음

Response data:
{
  "matchId": "uuid",
  "status": "recruiting",
  "hostParticipantId": "uuid",
  "detailRoute": "/matches/{matchId}",
  "manageRoute": "/matches/{matchId}/manage"
}

UI mapping:
loading = submit button pending
validation error = 해당 step field error로 매핑
duplicate submit = 같은 Idempotency-Key면 최초 생성 결과 재응답
success = detail 또는 manage 화면으로 이동
failure = 입력값 유지 + retry

State transition:
none -> matches.status recruiting
none -> match_participants.role host, status confirmed

Read tables:
sports
regions, optional
users

Write tables:
matches
match_participants
status_change_logs

Audit/status log:
status_change_logs = match created/recruiting 기록

Idempotency:
필수. `Idempotency-Key` required. 같은 키와 같은 payload는 같은 생성 결과를 반환하고, 같은 키의 다른 payload는 IDEMPOTENCY_CONFLICT.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403, 계정 상태상 생성 불가
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
삭제/정지/차단 사용자는 생성할 수 없다. 비활성 sportId는 VALIDATION_FAILED.

Deferred/payment:
fee/payment/venueId/matchMedia는 받지 않는다. 결제 없이 모집글만 생성한다.

Open questions:
없음.
```

#### 9.2.2 `GET /matches/:matchId/edit`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
호스트가 개인 매치 수정 화면을 열 때 create form과 같은 필드 구조로 prefill 데이터를 제공한다.

Screen actions:
03 개인 매치 수정 = edit 진입
03 개인 매치 수정 = prefill
03 개인 매치 수정 = cancel guard

HTTP:
GET /api/v1/sm-new/matches/:matchId/edit

Auth guard:
user

Actor/permission:
match host = 자기 매치 수정 prefill 조회
admin = admin surface에서 별도 API 사용 후보. 이 API는 일반 host용

Request params:
matchId uuid required

Request query:
없음

Request body:
없음

Response data:
{
  "matchId": "uuid",
  "editable": true,
  "lockedReason": "string | null",
  "form": {
    "sportId": "uuid",
    "regionId": "uuid | null",
    "title": "string",
    "description": "string | null",
    "imageUrl": "string | null",
    "startsAt": "datetime",
    "endsAt": "datetime | null",
    "deadlineAt": "datetime | null",
    "capacity": number,
    "manualPlaceName": "string",
    "addressText": "string | null",
    "rulesText": "string | null"
  },
  "status": "draft | recruiting | closed | cancelled | completed | expired",
  "participantCount": number,
  "version": "string"
}

UI mapping:
editable true = form enabled
editable false = field disabled + locked reason
not host = permission error 화면
not found = 매치를 찾을 수 없음

State transition:
없음. read-only prefill API.

Read tables:
matches
match_participants

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400, matchId 형식 오류
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403, host 아님
NOT_FOUND_OR_ARCHIVED = 404
INTERNAL_ERROR = 500

Permission/status conflict:
host_user_id가 현재 사용자와 다르면 403. cancelled/completed/expired는 editable false로 반환하거나 정책상 409 없이 저장 단계에서 차단한다.

Deferred/payment:
결제/시설/다중 이미지 필드는 prefill하지 않는다.

Open questions:
없음.
```

#### 9.2.3 `PATCH /matches/:matchId`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
호스트가 개인 매치 모집글 내용을 수정한다. 상태 변경은 이 API에서 제한적으로만 허용하고,
취소는 별도 cancel API로 분리한다.

Screen actions:
03 개인 매치 수정 = save
03 개인 매치 수정 = required missing/file error/time invalid/permission/save failure

HTTP:
PATCH /api/v1/sm-new/matches/:matchId

Auth guard:
user

Actor/permission:
match host = 자기 매치 수정

Request params:
matchId uuid required

Request query:
없음

Request body:
{
  "sportId": "uuid",
  "regionId": "uuid | null",
  "title": "string",
  "description": "string | null",
  "imageUrl": "string | null",
  "startsAt": "datetime",
  "endsAt": "datetime | null",
  "deadlineAt": "datetime | null",
  "capacity": number,
  "manualPlaceName": "string",
  "addressText": "string | null",
  "rulesText": "string | null",
  "version": "string"
}

Validation:
create와 동일. capacity는 현재 active participant count보다 작게 줄일 수 없다.
startsAt/deadlineAt 변경은 이미 closed/completed/cancelled/expired 상태면 불가하다.

Response data:
{
  "matchId": "uuid",
  "status": "recruiting | closed",
  "updatedAt": "datetime",
  "detailRoute": "/matches/{matchId}",
  "version": "string"
}

UI mapping:
loading = save button pending
validation error = field error
version conflict = 최신 내용 다시 불러오기 안내
success = detail/manage로 복귀
failure = 입력값 유지

State transition:
recruiting -> recruiting, 내용 수정
closed -> closed, 내용 수정 가능 범위 제한
status 변경 없음. cancel/complete/expire는 별도 API 또는 system/admin 처리.

Read tables:
matches
match_participants
sports
regions, optional

Write tables:
matches

Audit/status log:
상태 변경이 없으면 status_change_logs 없음. 운영상 내용 수정 이력은 v1 필수 아님.

Idempotency:
권장. `Idempotency-Key` supported. 네트워크 재시도 시 같은 저장 결과를 반환한다.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND_OR_ARCHIVED = 404
STATE_CONFLICT = 409, terminal 상태/정원 축소/버전 충돌
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
host가 아니면 403. cancelled/completed/expired는 수정 불가. participant count보다 capacity를 낮추면 409.

Deferred/payment:
payment/venueId/matchMedia 필드는 받지 않는다.

Open questions:
없음.
```

#### 9.2.4 `POST /matches/:matchId/cancel`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
호스트가 개인 매치 모집글을 취소한다. 모집글 취소 시 대기 중 신청과 확정 참가자 상태도 함께 정리한다.

Screen actions:
03 개인 매치 관리 = cancel match
03 개인 매치 수정 = cancel guard
07 내가 만든 매치 = cancel action

HTTP:
POST /api/v1/sm-new/matches/:matchId/cancel

Auth guard:
user

Actor/permission:
match host = 자기 매치 취소
admin = admin status API에서 별도 처리

Request params:
matchId uuid required

Request query:
없음

Request body:
{
  "reason": "string | null"
}

Response data:
{
  "matchId": "uuid",
  "status": "cancelled",
  "cancelledApplications": number,
  "cancelledParticipants": number,
  "detailRoute": "/matches/{matchId}"
}

UI mapping:
loading = confirm button pending
success = cancelled 상태 detail 또는 my list로 이동
already cancelled = 이미 취소됨 안내
completed/expired = 취소 불가 안내
failure = retry CTA

State transition:
matches.status recruiting|closed -> cancelled
match_applications.status requested -> cancelled_by_host
match_participants.status confirmed|checked_in -> cancelled

Read tables:
matches
match_applications
match_participants

Write tables:
matches
match_applications
match_participants
status_change_logs
notifications, optional 후속 알림 생성 후보

Audit/status log:
status_change_logs = match cancelled, affected application/participant 상태 변경

Idempotency:
필수. `Idempotency-Key` required. 이미 같은 요청으로 취소된 경우 최초 결과 재응답.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND_OR_ARCHIVED = 404
ALREADY_PROCESSED = 409, 이미 terminal 상태
STATE_CONFLICT = 409, completed/expired 등 취소 불가 상태
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
host가 아니면 403. cancelled/completed/expired terminal 상태는 재취소하지 않는다.

Deferred/payment:
환불/결제 취소 흐름은 없다. v1은 알림과 상태 정리만 수행한다.

Open questions:
없음.
```

### 9.3 Application/Participant Manage APIs

| API | Done |
|---|---|
| `POST /matches/:matchId/applications` | [x] |
| `POST /match-applications/:applicationId/withdraw` | [x] |
| `GET /matches/:matchId/applications` | [x] |
| `POST /match-applications/:applicationId/approve` | [x] |
| `POST /match-applications/:applicationId/reject` | [x] |
| `POST /match-participants/:participantId/cancel-approval` | [x] |
| `POST /match-participants/:participantId/mark-cancelled` | [x] |

#### 9.3.1 `POST /matches/:matchId/applications`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
사용자가 개인 매치에 참가 신청을 만든다. v1은 자동 확정/결제 없이 항상 `requested`로 시작하고,
호스트 승인 후에만 참가자로 확정된다.

Screen actions:
03 개인 매치 상세 = join sheet 신청 확인 primary
03 개인 매치 상세 = pending locked CTA

HTTP:
POST /api/v1/sm-new/matches/:matchId/applications

Auth guard:
user

Actor/permission:
authenticated user = 모집 중인 타인의 매치에 신청 가능
host = 자기 매치 신청 불가

Request params:
matchId uuid required

Request query:
없음

Request body:
{ "message": "string | null" }

Response data:
{
  "applicationId": "uuid",
  "matchId": "uuid",
  "status": "requested",
  "viewerState": "requested",
  "requiresApproval": true,
  "requiresPayment": false
}

UI mapping:
success = 승인 대기 CTA로 전환
duplicate = 기존 requested/approved 상태로 전환
full/deadline/not recruiting = stale 상태 안내 후 detail refetch

State transition:
none -> match_applications.status requested

Read tables:
matches
match_applications
match_participants

Write tables:
match_applications
status_change_logs
notifications, optional host 신청 알림

Audit/status log:
status_change_logs = application requested

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403, host/blocked user
NOT_FOUND_OR_ARCHIVED = 404
DUPLICATE_REQUEST = 409, active 신청 또는 참가자 존재
STATE_CONFLICT = 409, full/deadline passed/not recruiting
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
match.status가 recruiting이 아니거나 정원이 찼거나 deadline이 지났으면 신청 불가. withdrawn/rejected 과거 신청의 재신청 허용은 service policy로 판단한다.

Deferred/payment:
결제 상태를 만들지 않는다.

Open questions:
없음.
```

#### 9.3.2 `POST /match-applications/:applicationId/withdraw`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
신청자가 아직 승인되지 않은 requested 신청을 철회한다.

Screen actions:
03 개인 매치 상세 = 승인 대기 상태에서 신청 취소
07 마이 신청 내역 = withdraw

HTTP:
POST /api/v1/sm-new/match-applications/:applicationId/withdraw

Auth guard:
user

Actor/permission:
application owner = 자기 requested 신청 철회

Request params:
applicationId uuid required

Request query:
없음

Request body:
{ "reason": "string | null" }

Response data:
{ "applicationId": "uuid", "status": "withdrawn", "viewerState": "withdrawn" }

UI mapping:
success = CTA를 신청 가능 또는 철회됨으로 전환
already processed = 최신 신청 상태 표시

State transition:
match_applications.status requested -> withdrawn

Read tables:
match_applications
matches

Write tables:
match_applications
status_change_logs

Audit/status log:
status_change_logs = application withdrawn

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403, 신청자 아님
NOT_FOUND = 404
ALREADY_PROCESSED = 409, requested가 아닌 신청
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
approved 신청은 withdraw로 되돌릴 수 없다. 승인 후 이탈은 participant cancel 정책에서 다룬다.

Deferred/payment:
환불 없음.

Open questions:
없음.
```

#### 9.3.3 `GET /matches/:matchId/applications`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
호스트가 자기 매치의 신청자 목록을 보고 승인/거절 판단에 필요한 프로필과 신뢰 요약을 확인한다.

Screen actions:
03 개인 매치 관리 = 신청자 tab
03 개인 매치 관리 = 신청자 profile row
03 개인 매치 관리 = approve/reject buttons

HTTP:
GET /api/v1/sm-new/matches/:matchId/applications

Auth guard:
user

Actor/permission:
match host = 자기 매치 신청 목록 조회

Request params:
matchId uuid required

Request query:
status string optional, allowed requested, approved, rejected, withdrawn, cancelled_by_host, expired, default requested
cursor string optional
limit number optional, default 20, max 50

Request body:
없음

Response data:
{
  "items": [
    {
      "applicationId": "uuid",
      "status": "requested | approved | rejected | withdrawn | cancelled_by_host | expired",
      "message": "string | null",
      "createdAt": "datetime",
      "applicant": {
        "userId": "uuid",
        "displayName": "string",
        "profileImageUrl": "string | null",
        "trustState": "verified | estimated | sample | none",
        "mannerScore": "number | null"
      }
    }
  ],
  "pageInfo": { "nextCursor": "string | null", "hasNext": true }
}

UI mapping:
empty = 신청자 없음
requested row = approve/reject enabled
non-requested row = 처리 완료 label
error = retry CTA

State transition:
없음. read-only host manage API.

Read tables:
matches
match_applications
user_profiles
user_reputation_summaries

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
cursor pagination. 기본 정렬 created_at asc.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403, host 아님
NOT_FOUND_OR_ARCHIVED = 404
INTERNAL_ERROR = 500

Permission/status conflict:
host가 아니면 신청자 개인정보를 볼 수 없다.

Deferred/payment:
결제 상태를 표시하지 않는다.

Open questions:
없음.
```

#### 9.3.4 `POST /match-applications/:applicationId/approve`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
호스트가 requested 신청을 승인하고 확정 참가자 row를 생성한다.

Screen actions:
03 개인 매치 관리 = 신청자 승인

HTTP:
POST /api/v1/sm-new/match-applications/:applicationId/approve

Auth guard:
user

Actor/permission:
match host = 자기 매치 신청 승인

Request params:
applicationId uuid required

Request query:
없음

Request body:
{ "note": "string | null" }

Response data:
{
  "applicationId": "uuid",
  "status": "approved",
  "participantId": "uuid",
  "participantStatus": "confirmed",
  "participantCount": number,
  "capacity": number
}

UI mapping:
success = row approved 처리 + 참가자 tab에 추가
full/stale = list refetch 안내
already processed = 처리 완료 label

State transition:
match_applications.status requested -> approved
none -> match_participants.status confirmed, role participant

Read tables:
match_applications
matches
match_participants

Write tables:
match_applications
match_participants
status_change_logs
notifications, optional 승인 알림

Audit/status log:
status_change_logs = application approved, participant confirmed

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403, host 아님
NOT_FOUND = 404
ALREADY_PROCESSED = 409, requested가 아님
STATE_CONFLICT = 409, 정원 초과/매치 상태 불가/이미 participant 존재
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
승인 시점에 정원과 match.status를 다시 검사한다. capacity가 꽉 찼으면 승인 실패.

Deferred/payment:
결제 승인/결제 대기 없음.

Open questions:
없음.
```

#### 9.3.5 `POST /match-applications/:applicationId/reject`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
호스트가 requested 신청을 거절한다.

Screen actions:
03 개인 매치 관리 = 신청자 거절

HTTP:
POST /api/v1/sm-new/match-applications/:applicationId/reject

Auth guard:
user

Actor/permission:
match host = 자기 매치 신청 거절

Request params:
applicationId uuid required

Request query:
없음

Request body:
{ "reason": "string | null" }

Response data:
{ "applicationId": "uuid", "status": "rejected" }

UI mapping:
success = row rejected 처리
already processed = 처리 완료 label

State transition:
match_applications.status requested -> rejected

Read tables:
match_applications
matches

Write tables:
match_applications
status_change_logs
notifications, optional 거절 알림

Audit/status log:
status_change_logs = application rejected

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
ALREADY_PROCESSED = 409
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
requested 상태만 reject 가능하다.

Deferred/payment:
환불 없음.

Open questions:
없음.
```

#### 9.3.6 `POST /match-participants/:participantId/cancel-approval`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
호스트가 승인된 일반 참가자를 참가자 목록에서 제외한다. 신청 이력은 `approved`로 보존하고,
실제 참가 상태만 `match_participants.status = removed`로 변경한다.

Screen actions:
03 개인 매치 관리 = 승인 취소
07 Created match manage = 참가자 제외

HTTP:
POST /api/v1/sm-new/match-participants/:participantId/cancel-approval

Auth guard:
user

Actor/permission:
match host = 자기 매치 일반 참가자 승인 취소

Request params:
participantId uuid required

Request query:
없음

Request body:
{ "reason": "string | null" }

Response data:
{
  "participantId": "uuid",
  "participantStatus": "removed",
  "applicationId": "uuid | null",
  "applicationStatus": "approved"
}

UI mapping:
success = 참가자 목록에서 removed/제외됨 label
host participant = 취소 불가 안내
already terminal = 최신 상태 표시

State transition:
match_participants.status confirmed|checked_in -> removed
match_applications.status approved -> approved 유지

Read tables:
match_participants
match_applications
matches

Write tables:
match_participants
status_change_logs
notifications, optional 제외 알림

Audit/status log:
status_change_logs = participant removed by host

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
ALREADY_PROCESSED = 409
STATE_CONFLICT = 409, host row/terminal participant
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
host participant row는 제거할 수 없다. completed/no_show/cancelled/removed는 처리 불가.

Deferred/payment:
환불 없음.

Open questions:
없음.
```

#### 9.3.7 `POST /match-participants/:participantId/mark-cancelled`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
호스트가 확정 참가자의 참가 취소 상태를 기록한다. 승인 취소가 호스트의 제외 조치라면,
mark-cancelled는 참가자 사정 또는 운영상 취소를 참가 상태로 남기는 API다.

Screen actions:
03 개인 매치 관리 = 참여자 취소 처리

HTTP:
POST /api/v1/sm-new/match-participants/:participantId/mark-cancelled

Auth guard:
user

Actor/permission:
match host = 자기 매치 일반 참가자 취소 처리

Request params:
participantId uuid required

Request query:
없음

Request body:
{ "reason": "string | null" }

Response data:
{ "participantId": "uuid", "participantStatus": "cancelled" }

UI mapping:
success = 참가자 row cancelled label
already terminal = 최신 상태 표시

State transition:
match_participants.status confirmed|checked_in -> cancelled
match_applications.status approved -> approved 유지

Read tables:
match_participants
matches

Write tables:
match_participants
status_change_logs
notifications, optional 취소 알림

Audit/status log:
status_change_logs = participant cancelled

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
ALREADY_PROCESSED = 409
STATE_CONFLICT = 409, terminal participant
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
host가 아니면 403. host participant row 취소는 전체 match cancel API를 사용한다.

Deferred/payment:
환불 없음.

Open questions:
없음.
```

## 10. Team

### 10.1 Browse/Profile APIs

| API | Done |
|---|---|
| `GET /teams` | [x] |
| `GET /teams/:teamId` | [x] |
| `GET /teams/:teamId/join-eligibility` | [x] |
| `GET /me/teams` | [x] |

#### 10.1.1 `GET /teams`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
팀 찾기 목록, 검색, 필터, sort, team card를 cursor pagination으로 제공한다. 팀의 가입 가능성은
open 즉시 가입이 아니라 `approval_required` 또는 `closed` 상태로 표시한다.

Screen actions:
05 팀 목록 = list 진입
05 팀 목록 = search/chip/filter/sort
05 팀 card = 팀 보기
05 팀 card = 마감이면 알림받기 후보
05 팀 목록 = empty/error retry/filter reset

HTTP:
GET /api/v1/sm-new/teams

Auth guard:
optionalAuth

Actor/permission:
guest/user = public/active 팀 목록 조회
authenticated user = 내 membership/join state 요약 포함 가능

Request params:
없음

Request query:
cursor string optional
limit number optional, default 20, max 50
query string optional, max 50
sportId uuid optional
regionId uuid optional
joinPolicy string optional, allowed approval_required, closed
sort string optional, allowed recommended, latest, member_count, trust, default recommended
view string optional, allowed card, compact

Request body:
없음

Response data:
{
  "items": [
    {
      "teamId": "uuid",
      "name": "string",
      "logoUrl": "string | null",
      "coverImageUrl": "string | null",
      "sport": { "sportId": "uuid", "name": "string" },
      "region": { "regionId": "uuid", "name": "string" } | null,
      "introductionPreview": "string | null",
      "joinPolicy": "approval_required | closed",
      "memberCount": number,
      "trustState": "verified | estimated | sample | none",
      "viewerRole": "owner | manager | member | none",
      "viewerJoinState": "none | requested | approved | rejected | withdrawn | member"
    }
  ],
  "pageInfo": { "nextCursor": "string | null", "hasNext": true }
}

UI mapping:
empty = 필터 유지 + 팀 없음 + 필터 초기화 CTA
closed = 가입 마감 label, 신청 CTA 숨김/비활성
approval_required = 승인 요청 가능 label
sample/estimated trust = 실제 신뢰 신호처럼 과장하지 않음
error = retry CTA

State transition:
없음. read-only 목록 API.

Read tables:
teams
team_profiles
team_memberships, optional viewer state/member count
team_join_applications, optional viewer state
team_trust_scores
sports
regions

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
cursor pagination. 기본 정렬은 recommended. public active 팀만 노출하고 hidden/suspended/deleted는 일반 목록에서 제외한다.

Errors:
VALIDATION_FAILED = 400
INTERNAL_ERROR = 500

Permission/status conflict:
private/invite_only 팀은 일반 public 목록에서 제외하거나 제한된 카드만 반환한다. admin-only 상태는 admin API에서 다룬다.

Deferred/payment:
결제/구독/유료 팀 기능 없음.

Open questions:
없음.
```

#### 10.1.2 `GET /teams/:teamId`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
팀 상세 화면에 필요한 기본 정보, 프로필, 대표 멤버, 가입 정책, 내 가입/소속 상태를 반환한다.

Screen actions:
05 팀 상세 = detail 진입
05 팀 상세 = 가입 가능 여부 확인
05 팀 상세 = team info/member preview
05 팀 상세 = 가입 요청/closed sheet
07 마이 팀 = team detail/member manage 진입

HTTP:
GET /api/v1/sm-new/teams/:teamId

Auth guard:
optionalAuth

Actor/permission:
guest = public active team 상세 조회
user = viewer membership/join state 포함
owner/manager/member = 내부 route 후보와 권한 정보 포함

Request params:
teamId uuid required

Request query:
없음

Request body:
없음

Response data:
{
  "teamId": "uuid",
  "name": "string",
  "status": "active | hidden | suspended | deleted",
  "visibility": "public | private | invite_only",
  "sport": { "sportId": "uuid", "name": "string" },
  "region": { "regionId": "uuid", "name": "string" } | null,
  "profile": {
    "logoUrl": "string | null",
    "coverImageUrl": "string | null",
    "introduction": "string | null",
    "activityAreaText": "string | null",
    "skillLevelText": "string | null",
    "joinPolicy": "approval_required | closed",
    "memberGoalCount": number | null
  },
  "owner": { "userId": "uuid", "displayName": "string", "profileImageUrl": "string | null" },
  "membersPreview": [
    { "membershipId": "uuid", "userId": "uuid", "displayName": "string", "role": "owner | manager | member" }
  ],
  "memberCount": number,
  "managerCount": number,
  "trust": { "trustState": "verified | estimated | sample | none", "score": "number | null" },
  "viewer": {
    "role": "owner | manager | member | none",
    "membershipId": "uuid | null",
    "joinState": "none | requested | approved | rejected | withdrawn | member",
    "canRequestJoin": true,
    "disabledReason": "string | null",
    "manageRoute": "string | null"
  }
}

UI mapping:
guest = 가입 CTA login required
approval_required + none = 승인 요청 CTA
closed = 가입 마감 sheet
requested = 승인 대기 locked CTA
member/manager/owner = 팀 내부/관리 CTA
suspended/deleted/not public = 접근 불가 또는 not found

State transition:
없음. read-only 상세 API.

Read tables:
teams
team_profiles
team_memberships
team_join_applications, optional viewer state
team_trust_scores
user_profiles
sports
regions

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
없음. membersPreview는 최대 8명으로 제한하고 전체 목록은 members API에서 조회한다.

Errors:
VALIDATION_FAILED = 400
NOT_FOUND_OR_ARCHIVED = 404
INTERNAL_ERROR = 500

Permission/status conflict:
hidden/suspended/deleted 또는 private 팀은 public/user 권한에 따라 404 또는 제한 응답으로 정규화한다.

Deferred/payment:
팀 유료 기능 없음. 팀 상시 채팅은 v1 deferred.

Open questions:
없음.
```

#### 10.1.3 `GET /teams/:teamId/join-eligibility`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
팀 가입 요청 sheet를 열기 전 또는 요청 직전, 현재 사용자가 가입 신청 가능한지 서버 기준으로 확인한다.
open 즉시 가입은 없고, 가능한 경우에도 신청 생성 후 승인 대기 상태가 된다.

Screen actions:
05 팀 상세 = 가입 가능 여부 확인
05 팀 상세 = 승인 요청 sheet
05 팀 상세 = closed/permission sheet

HTTP:
GET /api/v1/sm-new/teams/:teamId/join-eligibility

Auth guard:
user

Actor/permission:
authenticated user = 자기 가입 가능 여부 조회

Request params:
teamId uuid required

Request query:
없음

Request body:
없음

Response data:
{
  "teamId": "uuid",
  "eligible": true,
  "reasonCode": "OK | ALREADY_MEMBER | ALREADY_REQUESTED | JOIN_CLOSED | TEAM_NOT_ACTIVE | BLOCKED_USER",
  "message": "string",
  "joinPolicy": "approval_required | closed",
  "viewerRole": "owner | manager | member | none",
  "joinState": "none | requested | approved | rejected | withdrawn | member",
  "requiresApproval": true,
  "immediateJoinSupported": false
}

UI mapping:
eligible true = 가입 요청 primary enabled
JOIN_CLOSED = closed sheet
ALREADY_REQUESTED = 승인 대기 상태 표시
ALREADY_MEMBER = 팀 내부 CTA
TEAM_NOT_ACTIVE = 접근 불가/신청 불가

State transition:
없음. read-only preflight API.

Read tables:
teams
team_profiles
team_memberships
team_join_applications

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
NOT_FOUND_OR_ARCHIVED = 404
INTERNAL_ERROR = 500

Permission/status conflict:
closed 팀, inactive 팀, 이미 멤버인 사용자는 eligible false. open 즉시 가입은 어떤 경우에도 true가 되지 않는다.

Deferred/payment:
팀 유료 가입 없음.

Open questions:
없음.
```

#### 10.1.4 `GET /me/teams`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
마이/팀매치 생성/팀 선택 화면에서 현재 사용자가 소속된 팀 목록과 역할을 조회한다.

Screen actions:
07 마이 = My teams
05 내 팀 = role별 팀 목록
06 팀매치 생성 = 내 팀 선택
06 팀매치 신청 = 신청 가능한 내 팀 선택 후보

HTTP:
GET /api/v1/sm-new/me/teams

Auth guard:
user

Actor/permission:
authenticated user = 자기 active membership이 있는 팀 조회

Request params:
없음

Request query:
role string optional, allowed owner, manager, member
permission string optional, allowed manage_team, create_team_match, apply_team_match
cursor string optional
limit number optional, default 20, max 50

Request body:
없음

Response data:
{
  "items": [
    {
      "teamId": "uuid",
      "membershipId": "uuid",
      "name": "string",
      "logoUrl": "string | null",
      "role": "owner | manager | member",
      "status": "active | hidden | suspended | deleted",
      "memberCount": number,
      "permissions": {
        "manageTeam": true,
        "createTeamMatch": true,
        "applyTeamMatch": true
      }
    }
  ],
  "pageInfo": { "nextCursor": "string | null", "hasNext": true }
}

UI mapping:
empty = 소속 팀 없음 + 팀 만들기 CTA
permission filter empty = 권한 있는 팀 없음
owner/manager = 관리/팀매치 생성 가능 표시
member = 일반 소속 표시

State transition:
없음. read-only my teams API.

Read tables:
teams
team_profiles
team_memberships

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
cursor pagination. active membership만 기본 반환한다.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
INTERNAL_ERROR = 500

Permission/status conflict:
suspended/deleted 팀은 팀매치 생성/신청 권한 false로 반환하거나 기본 목록에서 제외한다.

Deferred/payment:
팀 상시 채팅/유료 기능은 포함하지 않는다.

Open questions:
없음.
```

### 10.2 Create/Manage APIs

| API | Done |
|---|---|
| `POST /teams` | [x] |
| `PATCH /teams/:teamId` | [x] |
| `GET /teams/:teamId/members` | [x] |
| `PATCH /team-memberships/:membershipId/role` | [x] |
| `POST /team-memberships/:membershipId/remove` | [x] |

#### 10.2.1 `POST /teams`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
사용자가 서비스 팀을 생성한다. 생성자는 팀장(owner) 1명으로 등록되고, 팀 기본 row와 프로필 row,
owner membership이 한 transaction으로 생성된다.

Screen actions:
05 팀 생성 = 팀 정보 입력
05 팀 생성 = logo/cover preview
05 팀 생성 = join policy 선택
05 팀 생성 = submit

HTTP:
POST /api/v1/sm-new/teams

Auth guard:
user

Actor/permission:
authenticated user = 팀 생성 가능
blocked/suspended/deleted user = 생성 불가

Request params:
없음

Request query:
없음

Request body:
{
  "sportId": "uuid",
  "regionId": "uuid | null",
  "name": "string",
  "logoUrl": "string | null",
  "coverImageUrl": "string | null",
  "introduction": "string | null",
  "activityAreaText": "string | null",
  "skillLevelText": "string | null",
  "joinPolicy": "approval_required | closed",
  "memberGoalCount": number | null
}

Validation:
name required, max 50, unique 아님
sportId active required
regionId nullable
joinPolicy approval_required|closed only
logoUrl/coverImageUrl nullable, 저장된 이미지 URL만 허용
memberGoalCount nullable, min 1

Response data:
{
  "teamId": "uuid",
  "membershipId": "uuid",
  "role": "owner",
  "status": "active",
  "detailRoute": "/teams/{teamId}",
  "manageRoute": "/teams/{teamId}/manage"
}

UI mapping:
validation error = field error
success = team detail/manage로 이동
duplicate submit = 같은 Idempotency-Key면 최초 결과 재응답

State transition:
none -> teams.status active
none -> team_profiles created
none -> team_memberships.role owner, status active

Read tables:
users
sports
regions, optional

Write tables:
teams
team_profiles
team_memberships
status_change_logs

Audit/status log:
status_change_logs = team created, owner membership created

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
계정 상태가 blocked/suspended/deleted이면 생성 불가.

Deferred/payment:
유료 팀 생성/구독 없음.

Open questions:
없음.
```

#### 10.2.2 `PATCH /teams/:teamId`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
팀장 또는 허용된 관리자가 팀 기본 정보와 프로필 정보를 수정한다. owner 변경과 팀 삭제/정지는
이 API가 아니라 별도 고위험/admin 플로우로 분리한다.

Screen actions:
05 팀 수정 = prefilled form save
05 팀 상세/내 팀 관리 = 팀 정보 수정

HTTP:
PATCH /api/v1/sm-new/teams/:teamId

Auth guard:
user

Actor/permission:
owner = 팀 기본/프로필 수정 가능
manager = 팀 프로필성 필드 수정 가능 후보. owner_user_id/status/visibility 변경 불가

Request params:
teamId uuid required

Request query:
없음

Request body:
{
  "sportId": "uuid",
  "regionId": "uuid | null",
  "name": "string",
  "visibility": "public | private | invite_only",
  "logoUrl": "string | null",
  "coverImageUrl": "string | null",
  "introduction": "string | null",
  "activityAreaText": "string | null",
  "skillLevelText": "string | null",
  "joinPolicy": "approval_required | closed",
  "memberGoalCount": number | null,
  "version": "string"
}

Response data:
{
  "teamId": "uuid",
  "updatedAt": "datetime",
  "version": "string",
  "detailRoute": "/teams/{teamId}"
}

UI mapping:
validation error = field error
permission denied = 관리 권한 없음
version conflict = 최신 내용 다시 불러오기
success = detail/manage로 복귀

State transition:
teams active -> active, 내용 수정
team_profiles 내용 수정
joinPolicy 변경 시 approval_required <-> closed

Read tables:
teams
team_memberships
sports
regions, optional

Write tables:
teams
team_profiles
status_change_logs, join_policy/visibility 변경 시

Audit/status log:
join_policy, visibility 변경은 status_change_logs 후보. 일반 소개/이미지 수정 이력은 v1 필수 아님.

Idempotency:
권장. `Idempotency-Key` supported.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND_OR_ARCHIVED = 404
STATE_CONFLICT = 409, version conflict/inactive team
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
suspended/deleted 팀은 일반 수정 불가. owner_user_id는 이 API로 변경하지 않는다.

Deferred/payment:
팀 유료 기능/팀 상시 채팅 설정 없음.

Open questions:
없음.
```

#### 10.2.3 `GET /teams/:teamId/members`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
팀 상세/관리 화면에서 팀 멤버 목록과 역할을 조회한다.

Screen actions:
05 팀 상세 = member preview 전체보기
07 Team members = user info, role change, remove

HTTP:
GET /api/v1/sm-new/teams/:teamId/members

Auth guard:
user

Actor/permission:
active member = 자기 팀 멤버 목록 조회
owner/manager = 관리 액션 가능 여부 포함

Request params:
teamId uuid required

Request query:
role string optional, allowed owner, manager, member
status string optional, allowed active, left, removed, default active
cursor string optional
limit number optional, default 50, max 100

Request body:
없음

Response data:
{
  "items": [
    {
      "membershipId": "uuid",
      "userId": "uuid",
      "displayName": "string",
      "profileImageUrl": "string | null",
      "role": "owner | manager | member",
      "status": "active | left | removed",
      "joinedAt": "datetime",
      "canChangeRole": true,
      "canRemove": true
    }
  ],
  "summary": { "ownerCount": 1, "managerCount": number, "memberCount": number },
  "pageInfo": { "nextCursor": "string | null", "hasNext": true }
}

UI mapping:
empty = 멤버 없음
owner row = role/remove disabled
manager count = 5명 제한 표시 가능
error = retry CTA

State transition:
없음. read-only members API.

Read tables:
teams
team_memberships
user_profiles

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
cursor pagination. 기본 정렬 role owner -> manager -> member, joined_at asc.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403, 팀 멤버 아님
NOT_FOUND_OR_ARCHIVED = 404
INTERNAL_ERROR = 500

Permission/status conflict:
private 팀의 멤버 목록은 active member 이상만 조회한다. public 상세 preview는 detail API만 사용한다.

Deferred/payment:
없음.

Open questions:
없음.
```

#### 10.2.4 `PATCH /team-memberships/:membershipId/role`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
팀장이 일반 멤버를 manager로 승격하거나 manager를 member로 내린다. owner 변경/이관은 v1 일반 role API에서 제외한다.

Screen actions:
07 Team members = role change

HTTP:
PATCH /api/v1/sm-new/team-memberships/:membershipId/role

Auth guard:
user

Actor/permission:
owner = manager/member 사이 역할 변경 가능
manager = v1에서 role 변경 불가

Request params:
membershipId uuid required

Request query:
없음

Request body:
{ "role": "manager | member" }

Response data:
{
  "membershipId": "uuid",
  "teamId": "uuid",
  "role": "manager | member",
  "managerCount": number
}

UI mapping:
success = role badge 갱신
manager limit = 관리자 최대 5명 안내
owner row = 변경 불가
permission denied = 팀장만 가능 안내

State transition:
team_memberships.role member -> manager
team_memberships.role manager -> member
owner role은 이 API로 변경하지 않음

Read tables:
team_memberships
teams

Write tables:
team_memberships
status_change_logs

Audit/status log:
status_change_logs = role changed

Idempotency:
권장. `Idempotency-Key` supported.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
STATE_CONFLICT = 409, owner 변경 시도/manager 5명 초과/inactive membership
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
active membership만 변경 가능. manager 승격은 active manager가 5명 미만일 때만 가능.

Deferred/payment:
없음.

Open questions:
없음.
```

#### 10.2.5 `POST /team-memberships/:membershipId/remove`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
팀장이 팀 멤버를 제거한다. owner는 제거할 수 없고, owner 이관/팀 삭제는 별도 플로우로 분리한다.

Screen actions:
07 Team members = member remove

HTTP:
POST /api/v1/sm-new/team-memberships/:membershipId/remove

Auth guard:
user

Actor/permission:
owner = manager/member 제거 가능
manager = v1에서는 일반 member 제거 후보이나, 보수적으로 owner만 허용

Request params:
membershipId uuid required

Request query:
없음

Request body:
{ "reason": "string | null" }

Response data:
{
  "membershipId": "uuid",
  "teamId": "uuid",
  "status": "removed",
  "removedAt": "datetime"
}

UI mapping:
success = 멤버 목록에서 제거됨 처리
owner row = 제거 불가
already removed/left = 최신 상태 표시

State transition:
team_memberships.status active -> removed

Read tables:
team_memberships
teams

Write tables:
team_memberships
status_change_logs
notifications, optional 제거 알림

Audit/status log:
status_change_logs = membership removed

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
ALREADY_PROCESSED = 409
STATE_CONFLICT = 409, owner 제거 시도/inactive membership
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
owner는 제거할 수 없다. active membership만 removed로 전환 가능.

Deferred/payment:
없음.

Open questions:
없음.
```

### 10.3 Join Application APIs

| API | Done |
|---|---|
| `POST /teams/:teamId/join-applications` | [x] |
| `POST /team-join-applications/:applicationId/withdraw` | [x] |
| `GET /teams/:teamId/join-applications` | [x] |
| `POST /team-join-applications/:applicationId/approve` | [x] |
| `POST /team-join-applications/:applicationId/reject` | [x] |

#### 10.3.1 `POST /teams/:teamId/join-applications`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
사용자가 팀 가입 신청을 만든다. v1은 open 즉시 가입이 없으므로 항상 `requested`로 시작하고
팀장/관리자 승인 후 member membership이 생성 또는 복구된다.

Screen actions:
05 팀 상세 = 승인 요청
05 팀 상세 = 가입 요청 sheet primary

HTTP:
POST /api/v1/sm-new/teams/:teamId/join-applications

Auth guard:
user

Actor/permission:
authenticated user = approval_required 팀에 가입 신청 가능
active member = 신청 불가

Request params:
teamId uuid required

Request query:
없음

Request body:
{ "message": "string | null" }

Response data:
{
  "applicationId": "uuid",
  "teamId": "uuid",
  "status": "requested",
  "joinState": "requested",
  "requiresApproval": true,
  "immediateJoinSupported": false
}

UI mapping:
success = 승인 대기 CTA로 전환
closed = 가입 마감 안내
duplicate = 기존 requested 상태 표시
already member = 팀 내부 CTA

State transition:
none -> team_join_applications.status requested

Read tables:
teams
team_profiles
team_memberships
team_join_applications

Write tables:
team_join_applications
status_change_logs
notifications, optional owner/manager 신청 알림

Audit/status log:
status_change_logs = team join requested

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403, 계정 상태/팀 접근 불가
NOT_FOUND_OR_ARCHIVED = 404
DUPLICATE_REQUEST = 409, requested 신청 존재
STATE_CONFLICT = 409, closed team/already member/team inactive
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
join_policy가 closed이면 신청 불가. open 즉시 가입은 지원하지 않는다.

Deferred/payment:
유료 가입 없음.

Open questions:
없음.
```

#### 10.3.2 `POST /team-join-applications/:applicationId/withdraw`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
신청자가 아직 승인되지 않은 팀 가입 신청을 철회한다.

Screen actions:
05 팀 상세 = 승인 대기 상태에서 신청 취소
07 마이 팀 신청 내역 = withdraw

HTTP:
POST /api/v1/sm-new/team-join-applications/:applicationId/withdraw

Auth guard:
user

Actor/permission:
application owner = 자기 requested 신청 철회

Request params:
applicationId uuid required

Request query:
없음

Request body:
{ "reason": "string | null" }

Response data:
{ "applicationId": "uuid", "status": "withdrawn", "joinState": "withdrawn" }

UI mapping:
success = 철회됨 또는 다시 신청 가능 상태
already processed = 최신 상태 표시

State transition:
team_join_applications.status requested -> withdrawn

Read tables:
team_join_applications

Write tables:
team_join_applications
status_change_logs

Audit/status log:
status_change_logs = team join withdrawn

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
ALREADY_PROCESSED = 409
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
requested 상태만 withdraw 가능하다. approved 후 탈퇴는 membership leave/remove 계열에서 다룬다.

Deferred/payment:
없음.

Open questions:
없음.
```

#### 10.3.3 `GET /teams/:teamId/join-applications`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
팀장/관리자가 팀 가입 신청 목록을 조회하고 승인/거절 판단에 필요한 신청자 정보를 확인한다.

Screen actions:
05 팀장/관리자 가입 신청 관리
07 Team members = join approve/reject

HTTP:
GET /api/v1/sm-new/teams/:teamId/join-applications

Auth guard:
user

Actor/permission:
owner/manager = 자기 팀 가입 신청 목록 조회

Request params:
teamId uuid required

Request query:
status string optional, allowed requested, approved, rejected, withdrawn, cancelled_by_team, expired, default requested
cursor string optional
limit number optional, default 20, max 50

Request body:
없음

Response data:
{
  "items": [
    {
      "applicationId": "uuid",
      "status": "requested | approved | rejected | withdrawn | cancelled_by_team | expired",
      "message": "string | null",
      "createdAt": "datetime",
      "applicant": {
        "userId": "uuid",
        "displayName": "string",
        "profileImageUrl": "string | null",
        "trustState": "verified | estimated | sample | none"
      }
    }
  ],
  "pageInfo": { "nextCursor": "string | null", "hasNext": true }
}

UI mapping:
empty = 가입 신청 없음
requested row = approve/reject enabled
non-requested row = 처리 완료 label
error = retry CTA

State transition:
없음. read-only manage API.

Read tables:
teams
team_memberships
team_join_applications
user_profiles
user_reputation_summaries

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
cursor pagination. 기본 정렬 created_at asc.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403, owner/manager 아님
NOT_FOUND_OR_ARCHIVED = 404
INTERNAL_ERROR = 500

Permission/status conflict:
owner/manager가 아니면 신청자 개인정보를 볼 수 없다.

Deferred/payment:
없음.

Open questions:
없음.
```

#### 10.3.4 `POST /team-join-applications/:applicationId/approve`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
팀장/관리자가 requested 가입 신청을 승인하고 member membership을 생성하거나 기존 left/removed membership을 active로 복구한다.

Screen actions:
05 팀장/관리자 가입 신청 관리 = approve
07 Team members = join approve

HTTP:
POST /api/v1/sm-new/team-join-applications/:applicationId/approve

Auth guard:
user

Actor/permission:
owner/manager = 자기 팀 가입 신청 승인

Request params:
applicationId uuid required

Request query:
없음

Request body:
{ "note": "string | null" }

Response data:
{
  "applicationId": "uuid",
  "status": "approved",
  "membershipId": "uuid",
  "membershipStatus": "active",
  "role": "member"
}

UI mapping:
success = row approved + 멤버 목록 추가
already member = 최신 멤버 상태 표시
already processed = 처리 완료 label

State transition:
team_join_applications.status requested -> approved
none|left|removed membership -> team_memberships.status active, role member

Read tables:
team_join_applications
team_memberships
teams

Write tables:
team_join_applications
team_memberships
status_change_logs
notifications, optional 승인 알림

Audit/status log:
status_change_logs = join approved, membership active

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
ALREADY_PROCESSED = 409
STATE_CONFLICT = 409, team inactive/already active member
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
requested 상태만 approve 가능하다. 팀이 suspended/deleted이면 승인 불가.

Deferred/payment:
없음.

Open questions:
없음.
```

#### 10.3.5 `POST /team-join-applications/:applicationId/reject`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
팀장/관리자가 requested 가입 신청을 거절한다.

Screen actions:
05 팀장/관리자 가입 신청 관리 = reject
07 Team members = join reject

HTTP:
POST /api/v1/sm-new/team-join-applications/:applicationId/reject

Auth guard:
user

Actor/permission:
owner/manager = 자기 팀 가입 신청 거절

Request params:
applicationId uuid required

Request query:
없음

Request body:
{ "reason": "string | null" }

Response data:
{ "applicationId": "uuid", "status": "rejected" }

UI mapping:
success = row rejected 처리
already processed = 처리 완료 label

State transition:
team_join_applications.status requested -> rejected

Read tables:
team_join_applications
team_memberships
teams

Write tables:
team_join_applications
status_change_logs
notifications, optional 거절 알림

Audit/status log:
status_change_logs = join rejected

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
ALREADY_PROCESSED = 409
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
requested 상태만 reject 가능하다.

Deferred/payment:
없음.

Open questions:
없음.
```

## 11. Team Match

### 11.1 Browse/Detail APIs

| API | Done |
|---|---|
| `GET /team-matches` | [x] |
| `GET /team-matches/:teamMatchId` | [x] |
| `GET /team-matches/:teamMatchId/application-eligibility` | [x] |
| `GET /me/team-matches` | [x] |

#### 11.1.1 `GET /team-matches`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
팀매치 목록, 검색, 필터, 정렬, view mode 전환에 필요한 카드/리스트 데이터를 제공한다.
v1은 결제/시설 예약이 아니라 상대 팀 모집과 승인 상태를 중심으로 표시한다.

Screen actions:
06 팀매치 목록 = list 진입
06 팀매치 목록 = search/filter/sort/view mode
06 팀매치 목록 = sport chip
06 팀매치 목록 = empty/error retry/filter reset

HTTP:
GET /api/v1/sm-new/team-matches

Auth guard:
optionalAuth

Actor/permission:
guest/user = 공개 팀매치 목록 조회
authenticated user = 내가 속한 팀의 신청/host 상태 요약 포함 가능

Request params:
없음

Request query:
cursor string optional
limit number optional, default 20, max 50
query string optional, max 50
sportId uuid optional
regionId uuid optional
status string optional, allowed recruiting, matched, closed, cancelled, completed, expired, default recruiting
sort string optional, allowed recommended, latest, starts_at, deadline, default recommended
view string optional, allowed card, compact

Request body:
없음

Response data:
{
  "items": [
    {
      "teamMatchId": "uuid",
      "title": "string",
      "descriptionPreview": "string | null",
      "imageUrl": "string | null",
      "sport": { "sportId": "uuid", "name": "string" },
      "region": { "regionId": "uuid", "name": "string" } | null,
      "place": { "name": "string", "addressText": "string | null" },
      "startsAt": "datetime",
      "deadlineAt": "datetime | null",
      "status": "recruiting | matched | closed | cancelled | completed | expired",
      "displayState": "recruiting | matched | deadline_soon | closed | cancelled | completed | expired",
      "hostTeam": { "teamId": "uuid", "name": "string", "logoUrl": "string | null", "trustState": "verified | estimated | sample | none" },
      "costNote": "string | null",
      "paymentRequired": false,
      "viewerState": "none | host_team | requested | approved | matched_team"
    }
  ],
  "pageInfo": { "nextCursor": "string | null", "hasNext": true }
}

UI mapping:
empty = 필터 유지 + 결과 없음 + 필터 초기화 CTA
matched = 모집 완료 label
deadline_soon = derived display state
paymentRequired false = 결제 CTA 노출하지 않음
error = retry CTA

State transition:
없음. read-only 목록 API.

Read tables:
team_matches
teams
team_profiles
team_trust_scores
team_match_applications, optional viewer state
team_memberships, optional viewer team state
sports
regions

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
cursor pagination. deleted_at이 있는 row와 일반 공개 불가 상태는 제외한다.

Errors:
VALIDATION_FAILED = 400
INTERNAL_ERROR = 500

Permission/status conflict:
host team이 hidden/suspended/deleted이면 일반 목록에서 제외한다.

Deferred/payment:
결제/시설 FK/팀매치 초대 API 제외.

Open questions:
없음.
```

#### 11.1.2 `GET /team-matches/:teamMatchId`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
팀매치 상세 화면에 필요한 모집글, host team 정보, 내 팀별 신청 상태, CTA 상태를 반환한다.

Screen actions:
06 팀매치 상세 = detail 진입
06 팀매치 상세 = back/share/bell
06 팀매치 상세 = team info
06 팀매치 상세 = 신청하기 sheet
06 팀매치 상세 = pending/approved locked CTA
07 My team match = host manage CTA

HTTP:
GET /api/v1/sm-new/team-matches/:teamMatchId

Auth guard:
optionalAuth

Actor/permission:
guest = 공개 상세 조회
user = 내가 owner/manager/member인 팀의 relation 포함
host team owner/manager = 관리 CTA 노출

Request params:
teamMatchId uuid required

Request query:
없음

Request body:
없음

Response data:
{
  "teamMatchId": "uuid",
  "title": "string",
  "description": "string | null",
  "imageUrl": "string | null",
  "sport": { "sportId": "uuid", "name": "string" },
  "region": { "regionId": "uuid", "name": "string" } | null,
  "place": { "name": "string", "addressText": "string | null" },
  "startsAt": "datetime",
  "endsAt": "datetime | null",
  "deadlineAt": "datetime | null",
  "status": "draft | recruiting | matched | closed | cancelled | completed | expired",
  "displayState": "recruiting | matched | deadline_soon | closed | cancelled | completed | expired",
  "costNote": "string | null",
  "rulesText": "string | null",
  "paymentRequired": false,
  "hostTeam": {
    "teamId": "uuid",
    "name": "string",
    "logoUrl": "string | null",
    "trustState": "verified | estimated | sample | none",
    "ownerUserId": "uuid"
  },
  "approvedOpponentTeam": {
    "teamId": "uuid",
    "name": "string",
    "applicationId": "uuid"
  } | null,
  "viewer": {
    "state": "guest | none | host_team | requested | approved | matched_team",
    "manageableHostTeam": true,
    "eligibleTeams": [
      { "teamId": "uuid", "name": "string", "role": "owner | manager", "eligible": true, "reasonCode": "OK" }
    ],
    "manageRoute": "string | null"
  }
}

UI mapping:
guest = CTA login required
no owner/manager team = 신청 가능한 팀 없음
requested = 승인 대기 상태
matched = 모집 완료 상태
host_team = 신청팀 관리 CTA
cancelled/completed/expired = 신청 CTA disabled

State transition:
없음. read-only 상세 API.

Read tables:
team_matches
teams
team_profiles
team_trust_scores
team_match_applications
team_memberships
sports
regions

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
NOT_FOUND_OR_ARCHIVED = 404
INTERNAL_ERROR = 500

Permission/status conflict:
draft/deleted team_match는 host team owner/manager/admin이 아니면 404로 정규화한다.

Deferred/payment:
결제/시설 예약 없음. 팀 내부 상시 채팅도 응답하지 않는다.

Open questions:
없음.
```

#### 11.1.3 `GET /team-matches/:teamMatchId/application-eligibility`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
팀매치 신청 sheet를 열기 전 또는 신청 직전, 사용자가 owner/manager인 각 팀으로 신청 가능한지 서버 기준으로 확인한다.

Screen actions:
06 팀매치 상세 = 신청하기
06 팀매치 상세 = 내 팀 선택
06 팀매치 상세 = 신청 요약 확인

HTTP:
GET /api/v1/sm-new/team-matches/:teamMatchId/application-eligibility

Auth guard:
user

Actor/permission:
authenticated user = 자기 active owner/manager 팀별 신청 가능 여부 조회

Request params:
teamMatchId uuid required

Request query:
teamId uuid optional, 특정 팀만 검사

Request body:
없음

Response data:
{
  "teamMatchId": "uuid",
  "requiresApproval": true,
  "requiresPayment": false,
  "teams": [
    {
      "teamId": "uuid",
      "name": "string",
      "role": "owner | manager",
      "eligible": true,
      "reasonCode": "OK | HOST_TEAM_CANNOT_APPLY | ALREADY_REQUESTED | ALREADY_APPROVED | MATCHED_ALREADY | NOT_RECRUITING | TEAM_NOT_ACTIVE | NO_PERMISSION",
      "applicationId": "uuid | null"
    }
  ]
}

UI mapping:
eligible team 있음 = 팀 선택/신청 primary enabled
eligible team 없음 = 신청 가능한 팀 없음 안내
ALREADY_REQUESTED = 승인 대기 상태
MATCHED_ALREADY = 모집 완료 상태
HOST_TEAM_CANNOT_APPLY = host team 선택 불가

State transition:
없음. read-only preflight API.

Read tables:
team_matches
team_match_applications
team_memberships
teams

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
NOT_FOUND_OR_ARCHIVED = 404
INTERNAL_ERROR = 500

Permission/status conflict:
owner/manager 권한이 없는 팀은 신청 후보에 포함하지 않거나 NO_PERMISSION으로 반환한다. host team은 applicant가 될 수 없다.

Deferred/payment:
항상 requiresPayment false.

Open questions:
없음.
```

#### 11.1.4 `GET /me/team-matches`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
내가 owner/manager/member로 소속된 팀과 관련된 팀매치 목록을 제공한다. host team으로 만든 팀매치와
applicant team으로 신청/매칭된 팀매치를 함께 다룬다.

Screen actions:
07 마이 = My team matches
07 마이 = 신청팀 정보
07 마이 = 팀매치 수정

HTTP:
GET /api/v1/sm-new/me/team-matches

Auth guard:
user

Actor/permission:
authenticated user = 자기 active team memberships 기준 팀매치 조회

Request params:
없음

Request query:
scope string optional, allowed hosted, applied, all, default all
teamId uuid optional
status string optional, allowed recruiting, matched, closed, cancelled, completed, expired, requested, approved, rejected, withdrawn
cursor string optional
limit number optional, default 20, max 50

Request body:
없음

Response data:
{
  "items": [
    {
      "teamMatchId": "uuid",
      "title": "string",
      "sportName": "string",
      "startsAt": "datetime",
      "status": "recruiting | matched | closed | cancelled | completed | expired",
      "relation": "host_team | requested | approved | matched_team | rejected | withdrawn",
      "teamId": "uuid",
      "teamName": "string",
      "applicationId": "uuid | null",
      "manageRoute": "string | null",
      "detailRoute": "string"
    }
  ],
  "pageInfo": { "nextCursor": "string | null", "hasNext": true }
}

UI mapping:
hosted empty = 만든 팀매치 없음
applied empty = 신청한 팀매치 없음
host_team = 관리 CTA
requested = 승인 대기 label
approved/matched_team = 매칭 확정 label

State transition:
없음. read-only my team match API.

Read tables:
team_matches
team_match_applications
team_memberships
teams
sports
regions

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
cursor pagination. active team membership 기준으로 관계를 계산한다.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
INTERNAL_ERROR = 500

Permission/status conflict:
사용자가 더 이상 active member가 아닌 팀의 내부 관리 route는 null로 반환한다.

Deferred/payment:
결제/정산 정보 없음.

Open questions:
없음.
```

### 11.2 Create/Edit APIs

| API | Done |
|---|---|
| `POST /team-matches` | [x] |
| `GET /team-matches/:teamMatchId/edit` | [x] |
| `PATCH /team-matches/:teamMatchId` | [x] |
| `POST /team-matches/:teamMatchId/cancel` | [x] |

#### 11.2.1 `POST /team-matches`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
host team이 상대 팀을 모집하는 팀매치 모집글을 생성하고 즉시 모집 중 상태로 공개한다.
별도 임시저장/게시 API는 v1에서 제공하지 않는다.

Screen actions:
06 팀매치 생성 = 내 팀 선택
06 팀매치 생성 = sport/info/condition/place/time/confirm
06 팀매치 생성 = 팀매치 만들기 submit
06 팀매치 생성 = link copy/share client

HTTP:
POST /api/v1/sm-new/team-matches

Auth guard:
user

Actor/permission:
host team owner/manager = 자기 active 팀으로 팀매치 생성 가능

Request params:
없음

Request query:
없음

Request body:
{
  "hostTeamId": "uuid",
  "sportId": "uuid",
  "regionId": "uuid | null",
  "title": "string",
  "description": "string | null",
  "imageUrl": "string | null",
  "startsAt": "datetime",
  "endsAt": "datetime | null",
  "deadlineAt": "datetime | null",
  "manualPlaceName": "string",
  "addressText": "string | null",
  "costNote": "string | null",
  "rulesText": "string | null"
}

Validation:
hostTeamId active team required, current user must be owner/manager
sportId active required
title required, max 100
startsAt future required
deadlineAt nullable, 있으면 startsAt 이전
manualPlaceName required
costNote nullable text only. payment amount 아님
regionId nullable

Response data:
{
  "teamMatchId": "uuid",
  "status": "recruiting",
  "hostTeamId": "uuid",
  "detailRoute": "/team-matches/{teamMatchId}",
  "manageRoute": "/team-matches/{teamMatchId}/manage"
}

UI mapping:
validation error = field/step error
permission denied = 팀장/관리자 권한 필요
duplicate submit = 같은 Idempotency-Key면 최초 결과 재응답
success = detail/manage로 이동, 공유는 client side link copy

State transition:
none -> team_matches.status recruiting

Read tables:
teams
team_memberships
sports
regions, optional

Write tables:
team_matches
status_change_logs

Audit/status log:
status_change_logs = team match created/recruiting

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
STATE_CONFLICT = 409, inactive team
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
host team이 active가 아니거나 현재 사용자가 owner/manager가 아니면 생성 불가.

Deferred/payment:
venueId, payment amount, opponentCost, style table, invitation API는 받지 않는다.

Open questions:
없음.
```

#### 11.2.2 `GET /team-matches/:teamMatchId/edit`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
host team owner/manager가 팀매치 수정 화면을 열 때 create form과 같은 필드 구조로 prefill 데이터를 제공한다.

Screen actions:
06 팀매치 수정 = prefill
06 팀매치 수정 = cancel guard

HTTP:
GET /api/v1/sm-new/team-matches/:teamMatchId/edit

Auth guard:
user

Actor/permission:
host team owner/manager = 자기 팀매치 수정 prefill 조회

Request params:
teamMatchId uuid required

Request query:
없음

Request body:
없음

Response data:
{
  "teamMatchId": "uuid",
  "editable": true,
  "lockedReason": "string | null",
  "form": {
    "hostTeamId": "uuid",
    "sportId": "uuid",
    "regionId": "uuid | null",
    "title": "string",
    "description": "string | null",
    "imageUrl": "string | null",
    "startsAt": "datetime",
    "endsAt": "datetime | null",
    "deadlineAt": "datetime | null",
    "manualPlaceName": "string",
    "addressText": "string | null",
    "costNote": "string | null",
    "rulesText": "string | null"
  },
  "status": "draft | recruiting | matched | closed | cancelled | completed | expired",
  "version": "string"
}

UI mapping:
editable true = form enabled
matched/cancelled/completed/expired = locked reason
not owner/manager = permission error

State transition:
없음. read-only prefill API.

Read tables:
team_matches
teams
team_memberships

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND_OR_ARCHIVED = 404
INTERNAL_ERROR = 500

Permission/status conflict:
host team owner/manager가 아니면 403. terminal 상태는 editable false.

Deferred/payment:
결제/시설/스타일 정규화 필드는 prefill하지 않는다.

Open questions:
없음.
```

#### 11.2.3 `PATCH /team-matches/:teamMatchId`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
host team owner/manager가 팀매치 모집글 내용을 수정한다. 매칭 확정 이후에는 핵심 모집 조건 수정을 제한한다.

Screen actions:
06 팀매치 수정 = save
06 팀매치 수정 = permission/duplicate/status conflict

HTTP:
PATCH /api/v1/sm-new/team-matches/:teamMatchId

Auth guard:
user

Actor/permission:
host team owner/manager = 자기 팀매치 수정

Request params:
teamMatchId uuid required

Request query:
없음

Request body:
{
  "sportId": "uuid",
  "regionId": "uuid | null",
  "title": "string",
  "description": "string | null",
  "imageUrl": "string | null",
  "startsAt": "datetime",
  "endsAt": "datetime | null",
  "deadlineAt": "datetime | null",
  "manualPlaceName": "string",
  "addressText": "string | null",
  "costNote": "string | null",
  "rulesText": "string | null",
  "version": "string"
}

Response data:
{
  "teamMatchId": "uuid",
  "status": "recruiting | matched | closed",
  "updatedAt": "datetime",
  "version": "string",
  "detailRoute": "/team-matches/{teamMatchId}"
}

UI mapping:
validation error = field/step error
version conflict = 최신 내용 다시 불러오기
matched = 수정 제한 안내
success = detail/manage로 복귀

State transition:
recruiting -> recruiting, 내용 수정
closed -> closed, 제한적 내용 수정
matched -> matched, 핵심 조건 수정 제한

Read tables:
team_matches
team_memberships
sports
regions, optional

Write tables:
team_matches

Audit/status log:
상태 변경이 없으면 status_change_logs 없음. 핵심 조건 변경 이력은 v1 필수 아님.

Idempotency:
권장. `Idempotency-Key` supported.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND_OR_ARCHIVED = 404
STATE_CONFLICT = 409, terminal 상태/버전 충돌/matched 핵심 조건 변경
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
host team owner/manager가 아니면 403. cancelled/completed/expired는 수정 불가.

Deferred/payment:
payment/venue/style table 필드는 받지 않는다.

Open questions:
없음.
```

#### 11.2.4 `POST /team-matches/:teamMatchId/cancel`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
host team owner/manager가 팀매치를 취소한다. 취소 시 대기 중 신청은 `cancelled_by_host`로 정리한다.

Screen actions:
06 팀매치 관리 = cancel
06 팀매치 수정 = cancel guard
07 내 팀매치 = cancel action

HTTP:
POST /api/v1/sm-new/team-matches/:teamMatchId/cancel

Auth guard:
user

Actor/permission:
host team owner/manager = 자기 팀매치 취소
admin = admin status API에서 별도 처리

Request params:
teamMatchId uuid required

Request query:
없음

Request body:
{ "reason": "string | null" }

Response data:
{
  "teamMatchId": "uuid",
  "status": "cancelled",
  "cancelledApplications": number,
  "detailRoute": "/team-matches/{teamMatchId}"
}

UI mapping:
success = cancelled 상태 detail/my list로 이동
already cancelled = 이미 취소됨 안내
matched/completed = 취소 가능 여부에 따라 conflict 안내
failure = retry CTA

State transition:
team_matches.status recruiting|matched|closed -> cancelled
team_match_applications.status requested -> cancelled_by_host
approved application은 approved 이력 유지, team_match cancelled로 전체 취소 표현

Read tables:
team_matches
team_match_applications
team_memberships

Write tables:
team_matches
team_match_applications
status_change_logs
notifications, optional 신청팀 알림

Audit/status log:
status_change_logs = team match cancelled, requested applications cancelled_by_host

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND_OR_ARCHIVED = 404
ALREADY_PROCESSED = 409
STATE_CONFLICT = 409, completed/expired 등 취소 불가 상태
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
host team owner/manager가 아니면 403. terminal 상태는 재취소하지 않는다.

Deferred/payment:
환불/결제 취소 없음.

Open questions:
없음.
```

### 11.3 Application Manage APIs

| API | Done |
|---|---|
| `POST /team-matches/:teamMatchId/applications` | [x] |
| `POST /team-match-applications/:applicationId/withdraw` | [x] |
| `GET /team-matches/:teamMatchId/applications` | [x] |
| `POST /team-match-applications/:applicationId/approve` | [x] |
| `POST /team-match-applications/:applicationId/reject` | [x] |

#### 11.3.1 `POST /team-matches/:teamMatchId/applications`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
applicant team owner/manager가 팀매치에 상대 팀으로 신청한다. v1은 결제 없이 host team 승인 대기 상태로 시작한다.

Screen actions:
06 팀매치 상세 = 신청하기
06 팀매치 상세 = 내 팀 선택
06 팀매치 상세 = 신청 요약 확인

HTTP:
POST /api/v1/sm-new/team-matches/:teamMatchId/applications

Auth guard:
user

Actor/permission:
applicant team owner/manager = 자기 active 팀으로 신청 가능

Request params:
teamMatchId uuid required

Request query:
없음

Request body:
{
  "applicantTeamId": "uuid",
  "message": "string | null"
}

Response data:
{
  "applicationId": "uuid",
  "teamMatchId": "uuid",
  "applicantTeamId": "uuid",
  "status": "requested",
  "requiresApproval": true,
  "requiresPayment": false
}

UI mapping:
success = 승인 대기 상태
duplicate = 기존 신청 상태 표시
matched already = 모집 완료 안내
no permission = 팀장/관리자 권한 필요

State transition:
none -> team_match_applications.status requested

Read tables:
team_matches
team_match_applications
team_memberships
teams

Write tables:
team_match_applications
status_change_logs
notifications, optional host team 신청 알림

Audit/status log:
status_change_logs = team match application requested

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND_OR_ARCHIVED = 404
DUPLICATE_REQUEST = 409
STATE_CONFLICT = 409, host team self apply/matched already/not recruiting/team inactive
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
applicantTeamId는 host_team_id와 같을 수 없다. 현재 사용자가 applicant team owner/manager가 아니면 403.

Deferred/payment:
결제 없음.

Open questions:
없음.
```

#### 11.3.2 `POST /team-match-applications/:applicationId/withdraw`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
applicant team owner/manager가 아직 승인되지 않은 requested 팀매치 신청을 철회한다.

Screen actions:
06 팀매치 상세 = 승인 대기 신청 취소
07 내 팀매치 = 신청 취소

HTTP:
POST /api/v1/sm-new/team-match-applications/:applicationId/withdraw

Auth guard:
user

Actor/permission:
applicant team owner/manager = 자기 팀 requested 신청 철회

Request params:
applicationId uuid required

Request query:
없음

Request body:
{ "reason": "string | null" }

Response data:
{ "applicationId": "uuid", "status": "withdrawn" }

UI mapping:
success = withdrawn 상태 또는 다시 신청 가능 상태
already processed = 최신 상태 표시

State transition:
team_match_applications.status requested -> withdrawn

Read tables:
team_match_applications
team_memberships

Write tables:
team_match_applications
status_change_logs

Audit/status log:
status_change_logs = team match application withdrawn

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
ALREADY_PROCESSED = 409
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
approved 신청은 withdraw할 수 없다. 승인 후 취소는 팀매치 취소 또는 운영 처리로 다룬다.

Deferred/payment:
환불 없음.

Open questions:
없음.
```

#### 11.3.3 `GET /team-matches/:teamMatchId/applications`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
host team owner/manager가 자기 팀매치에 신청한 상대 팀 목록을 조회한다.

Screen actions:
06 host team 신청 팀 관리
07 Applicant team profile = approve/reject

HTTP:
GET /api/v1/sm-new/team-matches/:teamMatchId/applications

Auth guard:
user

Actor/permission:
host team owner/manager = 자기 팀매치 신청팀 목록 조회

Request params:
teamMatchId uuid required

Request query:
status string optional, allowed requested, approved, rejected, withdrawn, cancelled_by_host, expired, default requested
cursor string optional
limit number optional, default 20, max 50

Request body:
없음

Response data:
{
  "items": [
    {
      "applicationId": "uuid",
      "status": "requested | approved | rejected | withdrawn | cancelled_by_host | expired",
      "message": "string | null",
      "createdAt": "datetime",
      "applicantTeam": {
        "teamId": "uuid",
        "name": "string",
        "logoUrl": "string | null",
        "trustState": "verified | estimated | sample | none",
        "memberCount": number
      },
      "requestedBy": { "userId": "uuid", "displayName": "string" }
    }
  ],
  "pageInfo": { "nextCursor": "string | null", "hasNext": true }
}

UI mapping:
empty = 신청팀 없음
requested row = approve/reject enabled
approved row = 매칭 확정 label
matched team_match = 다른 requested row approve disabled

State transition:
없음. read-only manage API.

Read tables:
team_matches
team_match_applications
teams
team_profiles
team_trust_scores
team_memberships
user_profiles

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
cursor pagination. 기본 정렬 created_at asc.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND_OR_ARCHIVED = 404
INTERNAL_ERROR = 500

Permission/status conflict:
host team owner/manager가 아니면 신청팀 정보를 조회할 수 없다.

Deferred/payment:
결제 상태 없음.

Open questions:
없음.
```

#### 11.3.4 `POST /team-match-applications/:applicationId/approve`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
host team owner/manager가 requested 상대팀 신청을 승인하고 팀매치를 `matched`로 전환한다.
한 팀매치에 approved application은 최대 1개만 허용한다.

Screen actions:
06 host team 신청 팀 관리 = approve
07 Applicant team profile = approve

HTTP:
POST /api/v1/sm-new/team-match-applications/:applicationId/approve

Auth guard:
user

Actor/permission:
host team owner/manager = 자기 팀매치 신청 승인

Request params:
applicationId uuid required

Request query:
없음

Request body:
{ "note": "string | null" }

Response data:
{
  "applicationId": "uuid",
  "status": "approved",
  "teamMatchId": "uuid",
  "teamMatchStatus": "matched",
  "approvedOpponentTeamId": "uuid"
}

UI mapping:
success = team match matched + 승인팀 확정
already matched = 이미 상대팀 확정 안내
other requested rows = approve disabled

State transition:
team_match_applications.status requested -> approved
team_matches.status recruiting -> matched
다른 requested 신청은 자동 변경하지 않고, matched 상태 때문에 추가 승인 불가

Read tables:
team_match_applications
team_matches
team_memberships

Write tables:
team_match_applications
team_matches
status_change_logs
notifications, optional 승인/매칭 알림

Audit/status log:
status_change_logs = application approved, team_match matched

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
ALREADY_PROCESSED = 409
STATE_CONFLICT = 409, already matched/approved exists/not recruiting
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
approved application이 이미 있거나 team_match가 recruiting이 아니면 승인 불가.

Deferred/payment:
결제 승인 없음.

Open questions:
없음.
```

#### 11.3.5 `POST /team-match-applications/:applicationId/reject`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
host team owner/manager가 requested 상대팀 신청을 거절한다.

Screen actions:
06 host team 신청 팀 관리 = reject
07 Applicant team profile = reject

HTTP:
POST /api/v1/sm-new/team-match-applications/:applicationId/reject

Auth guard:
user

Actor/permission:
host team owner/manager = 자기 팀매치 신청 거절

Request params:
applicationId uuid required

Request query:
없음

Request body:
{ "reason": "string | null" }

Response data:
{ "applicationId": "uuid", "status": "rejected" }

UI mapping:
success = row rejected 처리
already processed = 처리 완료 label

State transition:
team_match_applications.status requested -> rejected

Read tables:
team_match_applications
team_matches
team_memberships

Write tables:
team_match_applications
status_change_logs
notifications, optional 거절 알림

Audit/status log:
status_change_logs = team match application rejected

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
ALREADY_PROCESSED = 409
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
requested 상태만 reject 가능하다.

Deferred/payment:
환불 없음.

Open questions:
없음.
```

## 12. Chat/Notification

### 12.1 Chat APIs

| API | Done |
|---|---|
| `GET /chat/rooms` | [x] |
| `POST /chat/rooms/resolve` | [x] |
| `GET /chat/rooms/:roomId` | [x] |
| `GET /chat/rooms/:roomId/messages` | [x] |
| `POST /chat/rooms/:roomId/messages` | [x] |
| `PATCH /chat/rooms/:roomId/me` | [x] |
| `POST /chat/rooms/:roomId/leave` | [x] |

#### 12.1.1 `GET /chat/rooms`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
내가 참여 중인 매치/팀매치 연결 채팅방 목록을 최신 메시지 기준으로 제공한다.

Screen actions:
10 채팅 목록 = category chip/list
10 채팅 목록 = row tap
15 global action center = chat entry

HTTP:
GET /api/v1/sm-new/chat/rooms

Auth guard:
user

Actor/permission:
active chat room participant = 자기 채팅방 목록 조회

Request params:
없음

Request query:
roomType string optional, allowed match, team_match
status string optional, allowed active, archived, expired, default active
cursor string optional
limit number optional, default 20, max 50

Request body:
없음

Response data:
{
  "items": [
    {
      "roomId": "uuid",
      "roomType": "match | team_match",
      "title": "string",
      "status": "active | archived | expired",
      "linkedTarget": { "type": "match | team_match", "id": "uuid", "title": "string" },
      "lastMessage": { "messageId": "uuid", "contentPreview": "string", "sentAt": "datetime" } | null,
      "unreadCount": number,
      "pinned": true,
      "muted": false
    }
  ],
  "pageInfo": { "nextCursor": "string | null", "hasNext": true }
}

UI mapping:
empty = 채팅방 없음
loading = room list skeleton
error = retry CTA
pinned = 상단 정렬
muted = 알림 꺼짐 icon

State transition:
없음. read-only list API.

Read tables:
chat_rooms
chat_room_participants
chat_messages
matches, optional linked title
team_matches, optional linked title

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
cursor pagination. pinned desc, last_message_at desc, created_at desc.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
INTERNAL_ERROR = 500

Permission/status conflict:
left/removed participant는 기본 active 목록에서 제외한다.

Deferred/payment:
DM, 팀 상시 채팅, 파일 첨부, 결제 채팅 없음.

Open questions:
없음.
```

#### 12.1.2 `POST /chat/rooms/resolve`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
매치/팀매치 상세에서 채팅 진입 시 연결 채팅방을 조회하거나 없으면 생성한다.

Screen actions:
03 개인 매치 상세 = 채팅 진입
06 팀매치 상세 = 매칭 후 채팅 진입

HTTP:
POST /api/v1/sm-new/chat/rooms/resolve

Auth guard:
user

Actor/permission:
match = confirmed match participant
team_match = matched team_match의 양 팀 owner/manager

Request params:
없음

Request query:
없음

Request body:
{
  "targetType": "match | team_match",
  "targetId": "uuid"
}

Response data:
{
  "roomId": "uuid",
  "roomType": "match | team_match",
  "created": true,
  "route": "/chat/rooms/{roomId}"
}

UI mapping:
success = room route 이동
not eligible = 채팅 이용 권한 없음
not ready = 아직 채팅방을 만들 수 없음

State transition:
none -> chat_rooms.active, 필요한 경우
none -> chat_room_participants.active, 필요한 경우

Read tables:
matches
match_participants
team_matches
team_match_applications
team_memberships
chat_rooms
chat_room_participants

Write tables:
chat_rooms, optional
chat_room_participants, optional
status_change_logs, optional room created

Audit/status log:
채팅방 active 생성은 status_change_logs 후보. 일반 resolve 재조회는 audit 없음.

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
STATE_CONFLICT = 409, 대상이 아직 채팅 가능 상태가 아님
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
개인 매치는 확정 참가자만 가능. 팀매치는 matched 이후 양 팀 owner/manager만 가능.

Deferred/payment:
DM/team always-on chat 생성 불가. 파일방 없음.

Open questions:
없음.
```

#### 12.1.3 `GET /chat/rooms/:roomId`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
채팅방 상세 header와 참여자 상태, linked target 정보를 반환한다.

Screen actions:
10 채팅방 상세 = room enter/header

HTTP:
GET /api/v1/sm-new/chat/rooms/:roomId

Auth guard:
user

Actor/permission:
active room participant = 채팅방 상세 조회

Request params:
roomId uuid required

Request query:
없음

Request body:
없음

Response data:
{
  "roomId": "uuid",
  "roomType": "match | team_match",
  "status": "active | archived | expired",
  "title": "string",
  "linkedTarget": { "type": "match | team_match", "id": "uuid", "title": "string", "route": "string" },
  "me": {
    "participantId": "uuid",
    "status": "active | muted | left | removed",
    "pinned": true,
    "mutedUntil": "datetime | null",
    "lastReadAt": "datetime | null"
  },
  "participants": [
    { "userId": "uuid", "displayName": "string", "role": "owner | participant | viewer" }
  ]
}

UI mapping:
active = message input enabled
archived/expired = input disabled
muted = mute indicator
removed = 접근 불가

State transition:
없음. read-only detail API.

Read tables:
chat_rooms
chat_room_participants
user_profiles
matches
team_matches

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
참여자 preview는 제한된 수만 반환. 메시지는 messages API 사용.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
INTERNAL_ERROR = 500

Permission/status conflict:
left participant의 과거 조회는 v1에서 제한한다. removed는 403.

Deferred/payment:
파일/첨부 정보 없음.

Open questions:
없음.
```

#### 12.1.4 `GET /chat/rooms/:roomId/messages`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
채팅방 메시지를 cursor pagination으로 조회한다. v1 메시지는 텍스트만 지원한다.

Screen actions:
10 채팅방 상세 = message list scroll

HTTP:
GET /api/v1/sm-new/chat/rooms/:roomId/messages

Auth guard:
user

Actor/permission:
active room participant = 메시지 조회

Request params:
roomId uuid required

Request query:
cursor string optional
limit number optional, default 30, max 100
direction string optional, allowed before, after, default before

Request body:
없음

Response data:
{
  "items": [
    {
      "messageId": "uuid",
      "sender": { "userId": "uuid", "displayName": "string", "profileImageUrl": "string | null" },
      "content": "string | null",
      "status": "sent | deleted | hidden",
      "sentAt": "datetime",
      "mine": true
    }
  ],
  "pageInfo": { "nextCursor": "string | null", "hasNext": true }
}

UI mapping:
empty = 메시지 없음
deleted/hidden = 대체 문구
loading = message skeleton
error = retry CTA

State transition:
없음. read-only messages API.

Read tables:
chat_rooms
chat_room_participants
chat_messages
user_profiles

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
cursor pagination. sent_at desc 기반으로 조회하고 클라이언트는 시간순 렌더 가능.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
INTERNAL_ERROR = 500

Permission/status conflict:
removed participant는 조회 불가.

Deferred/payment:
attachments 없음.

Open questions:
없음.
```

#### 12.1.5 `POST /chat/rooms/:roomId/messages`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
채팅방에 텍스트 메시지를 전송한다.

Screen actions:
10 채팅방 상세 = message input/send

HTTP:
POST /api/v1/sm-new/chat/rooms/:roomId/messages

Auth guard:
user

Actor/permission:
active room participant = 메시지 작성

Request params:
roomId uuid required

Request query:
없음

Request body:
{ "content": "string" }

Validation:
content required, trim 후 min 1, max 2000
attachment/file fields forbidden

Response data:
{
  "messageId": "uuid",
  "roomId": "uuid",
  "content": "string",
  "status": "sent",
  "sentAt": "datetime"
}

UI mapping:
optimistic message -> server id로 reconcile
validation error = input error
archived/expired/left = input disabled

State transition:
none -> chat_messages.status sent
chat_rooms.last_message_at updated

Read tables:
chat_rooms
chat_room_participants

Write tables:
chat_messages
chat_rooms
notifications, optional participant 알림

Audit/status log:
일반 메시지 작성은 audit 필수 아님.

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
STATE_CONFLICT = 409, room archived/expired or participant inactive
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
active participant만 작성 가능. muted는 알림/표시 상태이며 작성 금지는 아니다.

Deferred/payment:
파일/이미지 첨부 없음.

Open questions:
없음.
```

#### 12.1.6 `PATCH /chat/rooms/:roomId/me`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
내 채팅방 참여 설정을 갱신한다. 고정/음소거/읽음 위치 갱신을 한 API에서 처리한다.

Screen actions:
10 채팅 목록 = pin/unpin, mute
10 채팅방 상세 = read position update

HTTP:
PATCH /api/v1/sm-new/chat/rooms/:roomId/me

Auth guard:
user

Actor/permission:
room participant = 자기 participant settings 갱신

Request params:
roomId uuid required

Request query:
없음

Request body:
{
  "pinned": true,
  "mutedUntil": "datetime | null",
  "lastReadAt": "datetime | null"
}

Response data:
{
  "roomId": "uuid",
  "pinned": true,
  "mutedUntil": "datetime | null",
  "lastReadAt": "datetime | null",
  "status": "active | muted"
}

UI mapping:
pin success = list reorder
mute success = mute icon
read update = unread count 감소

State transition:
chat_room_participants.active <-> muted, mutedUntil 기준
last_read_at 갱신
pinned flag 갱신

Read tables:
chat_room_participants

Write tables:
chat_room_participants

Audit/status log:
last_read_at/pinned 변경은 audit 없음. muted 상태 전환은 status_change_logs 후보지만 v1 필수 아님.

Idempotency:
권장. `Idempotency-Key` supported.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
STATE_CONFLICT = 409, removed participant
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
removed participant는 갱신 불가.

Deferred/payment:
없음.

Open questions:
없음.
```

#### 12.1.7 `POST /chat/rooms/:roomId/leave`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
사용자가 채팅방에서 나간다. 연결 매치/팀매치 권한 자체를 삭제하지 않고 채팅 참여 상태만 left로 바꾼다.

Screen actions:
10 채팅 목록 = leave swipe action
10 채팅방 상세 = leave confirm

HTTP:
POST /api/v1/sm-new/chat/rooms/:roomId/leave

Auth guard:
user

Actor/permission:
active/muted room participant = 자기 채팅방 나가기

Request params:
roomId uuid required

Request query:
없음

Request body:
{ "reason": "string | null" }

Response data:
{ "roomId": "uuid", "status": "left", "leftAt": "datetime" }

UI mapping:
success = room list에서 제거
already left = 이미 나감 안내
removed = 접근 불가

State transition:
chat_room_participants.status active|muted -> left

Read tables:
chat_room_participants

Write tables:
chat_room_participants
status_change_logs

Audit/status log:
status_change_logs = participant left

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
ALREADY_PROCESSED = 409
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
removed participant는 leave 불가. 재입장은 연결 매치/팀매치 권한 기준으로 resolve에서 판단한다.

Deferred/payment:
없음.

Open questions:
없음.
```

### 12.2 Notification APIs

| API | Done |
|---|---|
| `GET /notifications` | [x] |
| `PATCH /notifications/:notificationId/read` | [x] |
| `POST /notifications/read-all` | [x] |
| `GET /notification-preferences` | [x] |
| `PATCH /notification-preferences` | [x] |

#### 12.2.1 `GET /notifications`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
사용자별 인앱 알림 목록과 unread count를 제공한다. 공지 read와 달리 알림은 user별 row의 `read_at`을 사용한다.

Screen actions:
02 홈 = 알림 요약/unread count
07 마이/알림 목록
10 채팅/알림 진입
15 글로벌 알림 배지/액션 센터

HTTP:
GET /api/v1/sm-new/notifications

Auth guard:
user

Actor/permission:
authenticated user = 자기 알림만 조회

Request params:
없음

Request query:
status string optional, allowed created, read, archived, unread, default created
type string optional
cursor string optional
limit number optional, default 20, max 50

Request body:
없음

Response data:
{
  "items": [
    {
      "notificationId": "uuid",
      "type": "string",
      "title": "string",
      "body": "string | null",
      "target": { "type": "string | null", "id": "uuid | null", "route": "string | null" },
      "status": "created | read | archived",
      "readAt": "datetime | null",
      "createdAt": "datetime"
    }
  ],
  "unreadCount": number,
  "pageInfo": { "nextCursor": "string | null", "hasNext": true }
}

UI mapping:
empty = 알림 없음
unread = 강조 row
target route null = 상세 이동 없이 내용 확인
error = retry CTA

State transition:
없음. read-only list API.

Read tables:
notifications

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
cursor pagination. created_at desc, id desc.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
INTERNAL_ERROR = 500

Permission/status conflict:
다른 사용자 알림은 조회할 수 없다.

Deferred/payment:
push/email delivery event 없음.

Open questions:
없음.
```

#### 12.2.2 `PATCH /notifications/:notificationId/read`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
사용자 알림 1개를 읽음 처리한다.

Screen actions:
10/15 알림 row tap
15 액션 센터 deep link

HTTP:
PATCH /api/v1/sm-new/notifications/:notificationId/read

Auth guard:
user

Actor/permission:
recipient user = 자기 알림 읽음 처리

Request params:
notificationId uuid required

Request query:
없음

Request body:
없음

Response data:
{
  "notificationId": "uuid",
  "status": "read",
  "readAt": "datetime"
}

UI mapping:
success = unread style 제거 후 target route 이동 가능
already read = read 상태 유지
not found = row 제거 또는 stale 안내

State transition:
notifications.status created -> read
notifications.read_at null -> now
read -> read idempotent

Read tables:
notifications

Write tables:
notifications

Audit/status log:
일반 읽음 처리는 audit 없음.

Idempotency:
권장. `Idempotency-Key` supported. 이미 read이면 같은 결과 반환.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
recipient가 아니면 403. archived 알림은 read 처리하지 않는다.

Deferred/payment:
없음.

Open questions:
없음.
```

#### 12.2.3 `POST /notifications/read-all`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
현재 사용자의 읽지 않은 알림을 일괄 읽음 처리한다.

Screen actions:
07 알림 목록 = 모두 읽음
15 액션 센터 = 모두 읽음

HTTP:
POST /api/v1/sm-new/notifications/read-all

Auth guard:
user

Actor/permission:
authenticated user = 자기 알림만 일괄 읽음 처리

Request params:
없음

Request query:
없음

Request body:
{
  "type": "string | null"
}

Response data:
{
  "updatedCount": number,
  "readAt": "datetime",
  "unreadCount": 0
}

UI mapping:
success = unread badge 0 또는 type별 감소
no unread = updatedCount 0
failure = retry CTA

State transition:
notifications.status created -> read
notifications.read_at null -> now

Read tables:
notifications

Write tables:
notifications

Audit/status log:
일반 읽음 처리는 audit 없음.

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
type optional filter. archived는 제외.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
현재 사용자 알림만 대상.

Deferred/payment:
없음.

Open questions:
없음.
```

#### 12.2.4 `GET /notification-preferences`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
사용자 알림 설정 화면에 필요한 카테고리별 인앱 수신 설정을 조회한다.

Screen actions:
07 마이/설정 = 알림 설정 조회

HTTP:
GET /api/v1/sm-new/notification-preferences

Auth guard:
user

Actor/permission:
authenticated user = 자기 알림 설정 조회

Request params:
없음

Request query:
없음

Request body:
없음

Response data:
{
  "matchEnabled": true,
  "teamEnabled": true,
  "teamMatchEnabled": true,
  "chatEnabled": true,
  "noticeEnabled": true,
  "marketingEnabled": false
}

UI mapping:
loading = toggle skeleton
error = retry CTA
missing row = default preferences 생성 또는 기본값 반환

State transition:
없음. read-only settings API.

Read tables:
notification_preferences

Write tables:
없음, 단 missing row 보정 생성은 system upsert 후보

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
없음.

Errors:
UNAUTHENTICATED = 401
INTERNAL_ERROR = 500

Permission/status conflict:
다른 사용자 설정 조회 불가.

Deferred/payment:
push/email/sms 채널 설정 없음.

Open questions:
없음.
```

#### 12.2.5 `PATCH /notification-preferences`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
사용자 알림 설정을 저장한다. v1은 인앱 카테고리 boolean만 수정한다.

Screen actions:
07 마이/설정 = 알림 toggle 저장

HTTP:
PATCH /api/v1/sm-new/notification-preferences

Auth guard:
user

Actor/permission:
authenticated user = 자기 알림 설정 수정

Request params:
없음

Request query:
없음

Request body:
{
  "matchEnabled": true,
  "teamEnabled": true,
  "teamMatchEnabled": true,
  "chatEnabled": true,
  "noticeEnabled": true,
  "marketingEnabled": false
}

Response data:
{
  "matchEnabled": true,
  "teamEnabled": true,
  "teamMatchEnabled": true,
  "chatEnabled": true,
  "noticeEnabled": true,
  "marketingEnabled": false,
  "updatedAt": "datetime"
}

UI mapping:
optimistic toggle 가능
validation error = 이전 값 복구
success = 저장됨 표시

State transition:
notification_preferences boolean fields updated

Read tables:
notification_preferences

Write tables:
notification_preferences
user_terms_consents, optional marketing 동의 정책과 연결 시

Audit/status log:
일반 설정 변경은 audit 없음. marketingEnabled 변경은 약관/마케팅 수신 동의 정책과 연결되면 status_change_logs 후보.

Idempotency:
권장. `Idempotency-Key` supported.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
다른 사용자 설정 수정 불가.

Deferred/payment:
push/email/sms 설정 없음.

Open questions:
없음.
```

## 13. Profile/Settings

| API | Done |
|---|---|
| `GET /me/profile` | [x] |
| `PATCH /me/profile` | [x] |
| `GET /users/:userId/public-profile` | [x] |
| `GET /me/settings` | [x] |
| `PATCH /me/settings` | [x] |
| `POST /auth/logout` | [x] |
| `POST /me/withdrawal-request` | [x] |

### 13.1 `GET /me/profile`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
마이 페이지와 프로필 편집 화면에 필요한 현재 사용자 프로필, 계정 상태, 평판 요약을 조회한다.

Screen actions:
07 마이 = profile header
07 프로필 편집 = prefill
07 Profile/reviews/badges = trust summary

HTTP:
GET /api/v1/sm-new/me/profile

Auth guard:
user

Actor/permission:
authenticated user = 자기 프로필 조회

Request params:
없음

Request query:
없음

Request body:
없음

Response data:
{
  "userId": "uuid",
  "accountStatus": "active | suspended | blocked | withdrawal_pending | deleted",
  "email": "string | null",
  "profile": {
    "displayName": "string",
    "profileImageUrl": "string | null",
    "bio": "string | null",
    "visibilityStatus": "public | members_only | private"
  },
  "reputation": {
    "trustState": "verified | estimated | sample | none",
    "mannerScore": "number | null",
    "activityCount": number,
    "reviewCount": number
  }
}

UI mapping:
loading = profile skeleton
blocked/suspended = account hard stop
sample reputation = sample label 표시
error = retry CTA

State transition:
없음. read-only API.

Read tables:
users
user_profiles
user_reputation_summaries

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
없음.

Errors:
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403, deleted/blocked hard stop 후보
INTERNAL_ERROR = 500

Permission/status conflict:
deleted 사용자는 일반 프로필 조회 불가.

Deferred/payment:
결제/정산 정보 없음.

Open questions:
없음.
```

### 13.2 `PATCH /me/profile`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
현재 사용자의 공개 프로필 정보를 수정한다.

Screen actions:
07 프로필 편집 = save

HTTP:
PATCH /api/v1/sm-new/me/profile

Auth guard:
user

Actor/permission:
authenticated user = 자기 프로필 수정

Request params:
없음

Request query:
없음

Request body:
{
  "displayName": "string",
  "profileImageUrl": "string | null",
  "bio": "string | null",
  "visibilityStatus": "public | members_only | private"
}

Validation:
displayName required, max 40, unique 아님
bio max 500
profileImageUrl nullable

Response data:
{
  "profile": {
    "displayName": "string",
    "profileImageUrl": "string | null",
    "bio": "string | null",
    "visibilityStatus": "public | members_only | private"
  },
  "updatedAt": "datetime"
}

UI mapping:
validation error = field error
success = profile header 갱신
visibility change = 공개 범위 label 갱신

State transition:
user_profiles fields updated
visibilityStatus 변경 시 public <-> members_only <-> private

Read tables:
user_profiles

Write tables:
user_profiles
status_change_logs, visibility_status 변경 시 후보

Audit/status log:
visibility_status 변경은 status_change_logs 후보. 일반 display/bio/image 수정은 v1 audit 필수 아님.

Idempotency:
권장. `Idempotency-Key` supported.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403, 계정 상태상 수정 불가
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
withdrawal_pending/deleted 사용자는 수정 불가.

Deferred/payment:
없음.

Open questions:
없음.
```

### 13.3 `GET /users/:userId/public-profile`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
매치/팀/채팅 등에서 다른 사용자의 공개 프로필을 조회한다.

Screen actions:
10 공개 프로필
03 개인 매치 host/participant profile
05 팀 멤버/가입자 profile

HTTP:
GET /api/v1/sm-new/users/:userId/public-profile

Auth guard:
optionalAuth

Actor/permission:
guest/user = visibility_status에 따라 공개 정보 조회
related user = members_only 정보 제한 조회 후보

Request params:
userId uuid required

Request query:
없음

Request body:
없음

Response data:
{
  "userId": "uuid",
  "displayName": "string",
  "profileImageUrl": "string | null",
  "bio": "string | null",
  "visibilityStatus": "public | members_only | private",
  "reputation": {
    "trustState": "verified | estimated | sample | none",
    "mannerScore": "number | null",
    "activityCount": number,
    "reviewCount": number
  }
}

UI mapping:
private = 제한된 프로필 또는 접근 불가
deleted = 탈퇴한 사용자 표시
sample reputation = sample label
not found = 사용자 없음

State transition:
없음. read-only API.

Read tables:
users
user_profiles
user_reputation_summaries

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
NOT_FOUND = 404
INTERNAL_ERROR = 500

Permission/status conflict:
private profile은 최소 정보만 반환하거나 404/403으로 정규화한다. deleted는 익명화된 display만 반환 가능.

Deferred/payment:
결제/분쟁 지표 없음.

Open questions:
없음.
```

### 13.4 `GET /me/settings`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
설정 화면에 필요한 계정, 프로필 공개 범위, 알림 설정, 약관 링크 요약을 조회한다.

Screen actions:
09 설정 = settings 진입
09 설정 = account/profile/notification/terms sections

HTTP:
GET /api/v1/sm-new/me/settings

Auth guard:
user

Actor/permission:
authenticated user = 자기 설정 조회

Request params:
없음

Request query:
없음

Request body:
없음

Response data:
{
  "account": {
    "email": "string | null",
    "phone": "string | null",
    "accountStatus": "active | suspended | blocked | withdrawal_pending | deleted",
    "providers": ["kakao | naver | email"]
  },
  "profile": {
    "displayName": "string",
    "visibilityStatus": "public | members_only | private"
  },
  "notifications": {
    "matchEnabled": true,
    "teamEnabled": true,
    "teamMatchEnabled": true,
    "chatEnabled": true,
    "noticeEnabled": true,
    "marketingEnabled": false
  }
}

UI mapping:
loading = settings skeleton
withdrawal_pending = 탈퇴 대기 상태 안내
error = retry CTA

State transition:
없음. read-only settings API.

Read tables:
users
auth_identities
user_profiles
notification_preferences

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Pagination/sort/filter:
없음.

Errors:
UNAUTHENTICATED = 401
INTERNAL_ERROR = 500

Permission/status conflict:
deleted 사용자는 설정 조회 불가.

Deferred/payment:
결제 설정 없음.

Open questions:
없음.
```

### 13.5 `PATCH /me/settings`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
설정 화면에서 프로필 공개 범위와 알림 설정을 묶어서 저장한다. 세부 알림만 수정할 때는 notification-preferences API도 사용 가능하다.

Screen actions:
09 설정 = settings save/toggle

HTTP:
PATCH /api/v1/sm-new/me/settings

Auth guard:
user

Actor/permission:
authenticated user = 자기 설정 수정

Request params:
없음

Request query:
없음

Request body:
{
  "visibilityStatus": "public | members_only | private",
  "notifications": {
    "matchEnabled": true,
    "teamEnabled": true,
    "teamMatchEnabled": true,
    "chatEnabled": true,
    "noticeEnabled": true,
    "marketingEnabled": false
  }
}

Response data:
{
  "profile": { "visibilityStatus": "public | members_only | private" },
  "notifications": {
    "matchEnabled": true,
    "teamEnabled": true,
    "teamMatchEnabled": true,
    "chatEnabled": true,
    "noticeEnabled": true,
    "marketingEnabled": false
  },
  "updatedAt": "datetime"
}

UI mapping:
optimistic toggle 가능
validation error = 이전 값 복구
success = 저장됨 표시

State transition:
user_profiles.visibility_status 변경 가능
notification_preferences boolean fields 변경 가능

Read tables:
user_profiles
notification_preferences

Write tables:
user_profiles
notification_preferences
status_change_logs, visibility/marketing 변경 시 후보

Audit/status log:
visibility_status 변경은 status_change_logs 후보. marketing 변경은 약관/마케팅 동의 정책과 연결 시 후보.

Idempotency:
권장. `Idempotency-Key` supported.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403, 계정 상태상 수정 불가
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
withdrawal_pending/deleted 사용자는 수정 불가.

Deferred/payment:
결제 설정 없음.

Open questions:
없음.
```

### 13.6 `POST /auth/logout`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
현재 세션/refresh token을 무효화하고 클라이언트 인증 상태를 종료한다.

Screen actions:
07 마이/설정 = logout

HTTP:
POST /api/v1/sm-new/auth/logout

Auth guard:
user

Actor/permission:
authenticated user = 자기 세션 로그아웃

Request params:
없음

Request query:
없음

Request body:
{
  "refreshTokenId": "string | null",
  "allDevices": false
}

Response data:
{ "loggedOut": true }

UI mapping:
success = login/public route 이동
token already invalid = 성공처럼 처리 가능
failure = 로컬 토큰 제거 후 재로그인 유도 가능

State transition:
session/token store active -> revoked, 구현 저장소가 있을 때

Read tables:
users
session/token store candidate

Write tables:
session/token store candidate

Audit/status log:
일반 로그아웃 audit 없음.

Idempotency:
권장. 같은 토큰 재로그아웃은 성공으로 정규화.

Pagination/sort/filter:
없음.

Errors:
UNAUTHENTICATED = 401
INTERNAL_ERROR = 500

Permission/status conflict:
없음.

Deferred/payment:
없음.

Open questions:
없음.
```

### 13.7 `POST /me/withdrawal-request`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
사용자가 탈퇴를 요청한다. v1 API는 즉시 물리 삭제가 아니라 `withdrawal_pending` 상태로 전환하고,
삭제/익명화는 별도 system/admin 처리 정책으로 이어진다.

Screen actions:
09 설정 = 탈퇴 요청

HTTP:
POST /api/v1/sm-new/me/withdrawal-request

Auth guard:
user

Actor/permission:
authenticated user = 자기 계정 탈퇴 요청

Request params:
없음

Request query:
없음

Request body:
{
  "reason": "string | null",
  "confirm": true
}

Response data:
{
  "accountStatus": "withdrawal_pending",
  "requestedAt": "datetime",
  "effectiveDeletionPolicy": "scheduled_anonymization"
}

UI mapping:
confirm false/missing = validation error
success = 로그아웃 또는 탈퇴 대기 안내
already pending = 현재 상태 안내

State transition:
users.account_status active -> withdrawal_pending
withdrawal_pending -> withdrawal_pending idempotent
추후 system/admin = withdrawal_pending -> deleted, user_profiles 익명화

Read tables:
users

Write tables:
users
status_change_logs
session/token store candidate

Audit/status log:
status_change_logs = withdrawal_pending 전환

Idempotency:
필수. `Idempotency-Key` required.

Pagination/sort/filter:
없음.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
ALREADY_PROCESSED = 409, 이미 deleted 또는 처리 불가 상태
STATE_CONFLICT = 409, blocked/suspended 등 별도 처리 필요 상태
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Permission/status conflict:
blocked/suspended 계정은 사용자 직접 탈퇴 대신 고객지원/관리자 처리 후보. deleted 계정은 요청 불가.

Deferred/payment:
결제/환불 정산 없음. 향후 결제 도입 시 미정산/분쟁 상태가 있으면 탈퇴 처리 gate 필요.

Open questions:
없음.
```

## 14. Admin/Audit

| API | Done |
|---|---|
| `GET /admin/me` | [x] |
| `GET /admin/overview` | [x] |
| `POST /admin/users/:userId/status` | [x] |
| `POST /admin/matches/:matchId/status` | [x] |
| `POST /admin/teams/:teamId/status` | [x] |
| `POST /admin/team-matches/:teamMatchId/status` | [x] |
| `GET /admin/action-logs` | [x] |
| `GET /admin/status-change-logs` | [x] |

### 14.1 `GET /admin/me`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params/query/body 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
관리자 shell 진입 시 현재 사용자의 관리자 권한과 role을 확인한다.

HTTP:
GET /api/v1/sm-new/admin/me

Auth guard:
admin

Actor/permission:
active admin only

Request:
params/query/body 없음

Response data:
{
  "userId": "uuid",
  "adminRole": "owner | ops | support",
  "status": "active",
  "capabilities": ["string"],
  "lastActiveAt": "datetime | null"
}

UI mapping:
active = admin shell 진입
not admin/suspended/revoked = admin 접근 차단

State transition:
없음. last_active_at 갱신은 system 후보이며 이 API 필수 write는 아님.

Read tables:
admin_users
users

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Errors:
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
INTERNAL_ERROR = 500

Deferred/payment:
admin_permissions 세분화 테이블 없음.

Open questions:
없음.
```

### 14.2 `GET /admin/overview`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params/query/body 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
관리자 대시보드에 필요한 사용자/매치/팀/팀매치/알림성 운영 요약을 제공한다.

HTTP:
GET /api/v1/sm-new/admin/overview

Auth guard:
admin

Actor/permission:
owner/ops/support admin = 권한 범위 내 overview 조회

Request query:
from datetime optional
to datetime optional

Response data:
{
  "users": { "active": number, "suspended": number, "blocked": number, "withdrawalPending": number },
  "matches": { "recruiting": number, "cancelled": number, "completed": number },
  "teams": { "active": number, "hidden": number, "suspended": number },
  "teamMatches": { "recruiting": number, "matched": number, "cancelled": number },
  "recentActions": [
    { "actionLogId": "uuid", "actionType": "string", "targetType": "string", "createdAt": "datetime" }
  ]
}

UI mapping:
empty = count 0
error = retry CTA

State transition:
없음. read-only aggregate.

Read tables:
users, matches, teams, team_matches, admin_action_logs

Write tables:
없음

Audit/status log:
없음

Idempotency:
불필요. GET.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
INTERNAL_ERROR = 500

Deferred/payment:
정산/분쟁/operation task queue summary 없음.

Open questions:
없음.
```

### 14.3 `POST /admin/users/:userId/status`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params/query/body 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
관리자가 사용자 계정 상태를 active/suspended/blocked/deleted 계열로 조치한다.

HTTP:
POST /api/v1/sm-new/admin/users/:userId/status

Auth guard:
admin

Actor/permission:
owner/ops admin = 사용자 상태 변경
support admin = 조회 중심, 상태 변경 불가

Request params:
userId uuid required

Request body:
{
  "status": "active | suspended | blocked | deleted",
  "reason": "string"
}

Response data:
{
  "userId": "uuid",
  "previousStatus": "active | suspended | blocked | withdrawal_pending | deleted",
  "status": "active | suspended | blocked | deleted",
  "actionLogId": "uuid",
  "statusChangeLogId": "uuid"
}

UI mapping:
success = admin user detail 상태 갱신
state conflict = 전이 불가 안내

State transition:
users.account_status active <-> suspended
users.account_status active <-> blocked
users.account_status withdrawal_pending -> deleted
deleted terminal

Read tables:
users
admin_users

Write tables:
users
admin_action_logs
status_change_logs
user_profiles, deleted 전환 시 익명화 후보

Audit/status log:
필수. admin_action_logs와 status_change_logs 모두 생성.

Idempotency:
필수. `Idempotency-Key` required.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
STATE_CONFLICT = 409
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Deferred/payment:
결제/분쟁 gate 없음. 추후 결제 도입 시 deleted 전환 gate 필요.

Open questions:
없음.
```

### 14.4 `POST /admin/matches/:matchId/status`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params/query/body 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
관리자가 개인 매치 모집글을 취소/복구/마감/완료 등 운영 조치한다.

HTTP:
POST /api/v1/sm-new/admin/matches/:matchId/status

Auth guard:
admin

Actor/permission:
owner/ops admin = 매치 상태 변경

Request params:
matchId uuid required

Request body:
{
  "status": "recruiting | closed | cancelled | completed | expired",
  "reason": "string"
}

Response data:
{
  "matchId": "uuid",
  "previousStatus": "string",
  "status": "string",
  "actionLogId": "uuid",
  "statusChangeLogId": "uuid"
}

UI mapping:
success = admin match detail 상태 갱신
state conflict = 전이 불가 안내

State transition:
matches.status allowed admin transition. cancelled/completed terminal 복구는 owner admin만 별도 허용 후보.

Read tables:
matches
admin_users

Write tables:
matches
admin_action_logs
status_change_logs
match_applications/match_participants, cancelled 전환 시 후보

Audit/status log:
필수. reason/before/after 포함.

Idempotency:
필수. `Idempotency-Key` required.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
STATE_CONFLICT = 409
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Deferred/payment:
환불/결제 취소 없음.

Open questions:
없음.
```

### 14.5 `POST /admin/teams/:teamId/status`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params/query/body 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
관리자가 팀을 active/hidden/suspended/deleted 상태로 조치한다.

HTTP:
POST /api/v1/sm-new/admin/teams/:teamId/status

Auth guard:
admin

Actor/permission:
owner/ops admin = 팀 상태 변경

Request params:
teamId uuid required

Request body:
{
  "status": "active | hidden | suspended | deleted",
  "reason": "string"
}

Response data:
{
  "teamId": "uuid",
  "previousStatus": "string",
  "status": "string",
  "actionLogId": "uuid",
  "statusChangeLogId": "uuid"
}

State transition:
teams.status active <-> hidden
teams.status active <-> suspended
active|hidden|suspended -> deleted
deleted terminal

Read tables:
teams
admin_users

Write tables:
teams
admin_action_logs
status_change_logs

Audit/status log:
필수.

Idempotency:
필수. `Idempotency-Key` required.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
STATE_CONFLICT = 409
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Deferred/payment:
없음.

Open questions:
없음.
```

### 14.6 `POST /admin/team-matches/:teamMatchId/status`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params/query/body 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
관리자가 팀매치 모집글을 운영 상태로 조치한다.

HTTP:
POST /api/v1/sm-new/admin/team-matches/:teamMatchId/status

Auth guard:
admin

Actor/permission:
owner/ops admin = 팀매치 상태 변경

Request params:
teamMatchId uuid required

Request body:
{
  "status": "recruiting | matched | closed | cancelled | completed | expired",
  "reason": "string"
}

Response data:
{
  "teamMatchId": "uuid",
  "previousStatus": "string",
  "status": "string",
  "actionLogId": "uuid",
  "statusChangeLogId": "uuid"
}

State transition:
team_matches.status allowed admin transition. cancelled/completed/expired terminal 전이는 신중히 제한.

Read tables:
team_matches
admin_users

Write tables:
team_matches
admin_action_logs
status_change_logs
team_match_applications, cancelled 전환 시 후보

Audit/status log:
필수.

Idempotency:
필수. `Idempotency-Key` required.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
NOT_FOUND = 404
STATE_CONFLICT = 409
IDEMPOTENCY_CONFLICT = 409
INTERNAL_ERROR = 500

Deferred/payment:
환불/결제 취소 없음.

Open questions:
없음.
```

### 14.7 `GET /admin/action-logs`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params/query/body 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
관리자 운영 조치 로그를 조회한다.

HTTP:
GET /api/v1/sm-new/admin/action-logs

Auth guard:
admin

Actor/permission:
owner admin = 전체 조회
ops/support admin = 권한 범위 조회 후보

Request query:
adminUserId uuid optional
targetType string optional
targetId uuid optional
actionType string optional
from datetime optional
to datetime optional
cursor string optional
limit number optional, default 20, max 50

Response data:
{
  "items": [
    {
      "actionLogId": "uuid",
      "adminUserId": "uuid",
      "actionType": "string",
      "targetType": "string",
      "targetId": "uuid",
      "reason": "string | null",
      "beforeState": {},
      "afterState": {},
      "createdAt": "datetime"
    }
  ],
  "pageInfo": { "nextCursor": "string | null", "hasNext": true }
}

State transition:
없음. append-only log read.

Read tables:
admin_action_logs
admin_users

Write tables:
없음

Audit/status log:
이 API 자체는 조회이므로 로그 생성 없음.

Idempotency:
불필요. GET.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
INTERNAL_ERROR = 500

Deferred/payment:
operation task queue 없음.

Open questions:
없음.
```

### 14.8 `GET /admin/status-change-logs`

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params/query/body 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Purpose:
도메인 상태 전이 로그를 조회한다.

HTTP:
GET /api/v1/sm-new/admin/status-change-logs

Auth guard:
admin

Actor/permission:
active admin = 권한 범위 내 상태 변경 로그 조회

Request query:
targetType string optional
targetId uuid optional
actorUserId uuid optional
from datetime optional
to datetime optional
cursor string optional
limit number optional, default 20, max 50

Response data:
{
  "items": [
    {
      "statusChangeLogId": "uuid",
      "targetType": "string",
      "targetId": "uuid",
      "fromStatus": "string | null",
      "toStatus": "string",
      "actorUserId": "uuid | null",
      "reason": "string | null",
      "createdAt": "datetime"
    }
  ],
  "pageInfo": { "nextCursor": "string | null", "hasNext": true }
}

State transition:
없음. append-only log read.

Read tables:
status_change_logs
admin_users

Write tables:
없음

Audit/status log:
조회 자체는 로그 생성 없음.

Idempotency:
불필요. GET.

Errors:
VALIDATION_FAILED = 400
UNAUTHENTICATED = 401
PERMISSION_DENIED = 403
INTERNAL_ERROR = 500

Deferred/payment:
없음.

Open questions:
없음.
```

## 15. Deferred Boundaries

### 15.1 Deferred API surfaces

- [x] 화면 action 연결 확정
- [x] HTTP method 확정
- [x] URL path 확정
- [x] auth guard 확정
- [x] actor/permission 확정
- [x] request params 확정
- [x] request query 확정
- [x] request body DTO 확정
- [x] response data DTO 확정
- [x] empty/loading/error UI mapping 확정
- [x] 상태 전이 여부 및 `from -> to` 확정
- [x] read/write table 확정
- [x] audit/status log 필요 여부 확정
- [x] idempotency 필요 여부 확정
- [x] pagination/sort/filter 계약 확정
- [x] error code/status 확정
- [x] 권한 실패/상태 충돌/중복 요청 동작 확정
- [x] deferred/payment 제외 여부 확인
- [x] open question 없음

```text
Deferred in v1:
payments
payment_attempts
refund_requests
disputes
dispute_events
DM
team always-on chat
chat file attachments
venue FK/booking for matches
admin operation task queue

API rule:
Deferred surface는 v1 URL을 만들지 않는다. 디자인에 남은 결제 CTA는 신청 생성으로 치환하고,
환불/분쟁/결제 내역은 v1 core API에서 제외한다.

Endpoint decision:
No `/payments/*`, `/refunds/*`, `/disputes/*`, `/dm/*`, `/team-chat/*`, `/chat/attachments/*`,
`/venues/*/booking`, `/admin/operation-tasks/*` API is included in SM New API v1.

UI mapping:
결제하고 참가하기 = 개인 매치/팀매치 신청 mutation으로 치환
환불/분쟁 = v1 화면/CTA 비노출 또는 deferred 안내
DM/팀 상시 채팅 = v1 화면/CTA 비노출
파일 첨부 = 채팅 입력에서 비노출
시설 예약 = 직접 입력 장소 필드 사용

State transition:
없음. v1 API surface를 만들지 않는 boundary 결정.

Read/Write tables:
없음. deferred table/API를 core flow에서 참조하지 않는다.

Open questions:
없음.
```

## 16. Recommended Work Order

1. Global Contract
2. Auth/Onboarding
3. Home/Search/Notice
4. Personal Match
5. Team
6. Team Match
7. Chat/Notification
8. Profile/Settings
9. Admin/Audit
10. Deferred Boundaries

각 항목은 먼저 URL/요청/응답 후보를 작성하고, 애매한 정책이 있으면 사용자에게 질문한 뒤 체크한다.
