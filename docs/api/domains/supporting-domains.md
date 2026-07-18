# Domain Contract — Supporting Domains

## 범위

낮은 호출 빈도지만 프론트 통합 시 누락되기 쉬운 지원 도메인 계약을 정리한다.

- `reviews`
- `reports`
- `inquiries`
- `badges`
- `users/blocks`
- `tournaments`
- `health`
- (보조) `venues/:id/reviews` raw-body 특성

## Endpoint Matrix

| Surface | Paths |
|---|---|
| `reviews` | `/api/v1/reviews`, `/api/v1/reviews/pending` |
| `reports` | `/api/v1/reports`, `/api/v1/reports/me`, `/api/v1/admin/reports`, `/api/v1/admin/reports/:id` |
| `inquiries` | `/api/v1/inquiries`, `/api/v1/inquiries/:id`, `/api/v1/admin/inquiries`, `/api/v1/admin/inquiries/:id`, `/api/v1/admin/inquiries/:id/replies`, `/api/v1/admin/inquiries/:id/status` |
| `badges` | `/api/v1/badges`, `/api/v1/badges/team/:teamId` |
| `users/blocks` | `/api/v1/users/blocks`, `/api/v1/users/blocks/:blockedId` |
| `tournaments` | `/api/v1/tournaments`, `/api/v1/tournaments/:id`, `/api/v1/tournaments/campaigns/:slug`, `/api/v1/tournaments/:tournamentId/registrations`, `/api/v1/admin/tournaments/:tournamentId/campaign`, `/api/v1/admin/tournaments/:tournamentId/sponsors`, `/api/v1/admin/tournaments/:tournamentId/popups`, `/api/v1/admin/tournaments/:tournamentId/publish-bracket`, `/api/v1/admin/tournaments/:tournamentId/bracket`, `/api/v1/admin/fixtures/:fixtureId/result` |
| `health` | `/api/v1/health` |
| `venue reviews` | `/api/v1/venues/:id/reviews` |

## 1) Reviews (`/reviews`)

### 엔드포인트

| Method | Path | Auth | 용도 |
|---|---|---|---|
| `GET` | `/api/v1/reviews?tab=pending\|written` | Required | 작성할 리뷰/작성 완료 리뷰 목록 |
| `GET` | `/api/v1/reviews/received` | Required | 내가 받은 리뷰 목록 |
| `GET` | `/api/v1/reviews/sources/:sourceType/:sourceId` | Required | 리뷰 작성 대상 조회 |
| `POST` | `/api/v1/reviews` | Required | 경기 후 리뷰 제출 |

### 계약 포인트

- `sourceType`: `match | team_match | tournament_fixture`
  - `match`: 완료된 개인 매치 참가자가 상대 참가자(`targetType=user`)를 평가한다.
  - `team_match`: 완료된 팀매치의 팀장/운영진이 상대 팀(`targetType=team`)을 평가한다.
  - `tournament_fixture`: 완료되고 결과가 기록된 대회 경기의 팀장/운영진이 상대 팀(`targetType=team`)을 평가한다.
    - `sourceId`는 작성 화면으로 진입한 fixture ID다.
    - 중복 방지는 내부 `sourceGroupId=tournamentId` 기준이다. 같은 대회에서 같은 두 팀이 리그전/토너먼트로 두 번 만나도, 같은 리뷰 작성 팀은 같은 상대 팀을 한 번만 평가한다.
- `POST /reviews` body:
  - 공통: `sourceType`, `sourceId`, `targetType`, `rating(1~5)`, `tagCodes(1~8)`
  - `targetUserId`는 `sourceType=match`에서만 사용한다.
  - `targetTeamId`는 `sourceType=team_match | tournament_fixture`에서만 사용한다.
- 중복 제출은 기존 리뷰를 반환하는 idempotent 응답으로 처리된다.
- 팀 대상 리뷰 제출 후 `v1_team_trust_scores`가 재계산된다. 대회 fixture 리뷰는 `sourceLabel='완료 팀매치·대회 경기 리뷰 기반'`으로 반영한다.

### CAUTION

- `sourceType=tournament_fixture`는 대회 fixture가 `completed`이고 `result`가 존재해야 작성 가능하다.
- `sourceType=tournament_fixture`의 팀 리뷰는 팀장/운영진만 작성한다. 같은 사용자가 양 팀을 모두 관리하는 fixture는 작성 팀을 확정할 수 없으므로 차단한다.
- 대회 fixture 리뷰는 현재 팀 단위 매너 평가다. “칭찬할 선수/비매너 선수 선택” 같은 선수 단위 평가는 별도 target/model 계약이 필요하므로 이 sourceType으로 가장하지 않는다.

## 2) Reports (`/reports`, `/admin/reports`)

### 엔드포인트

| Method | Path | Auth | 용도 |
|---|---|---|---|
| `POST` | `/api/v1/reports` | Required | 신고 생성 |
| `GET` | `/api/v1/reports/me` | Required | 내 신고 목록 |
| `GET` | `/api/v1/admin/reports` | Required + Admin | 전체 신고 목록 |
| `PATCH` | `/api/v1/admin/reports/:id` | Required + Admin | 신고 상태 변경 |

### DTO 계약

- `CreateReportDto`
  - `targetType`: `user | message | listing | review`
  - `targetId`: string
  - `reason`: string (max 200)
  - `description?`: string (max 1000)
- `UpdateReportStatusDto`
  - `status`: `pending | reviewed | resolved | dismissed`

### 엣지 케이스

- `createReport`는 target 존재 여부를 서버에서 검증한다.
- 존재하지 않는 target은 `404 REPORT_TARGET_NOT_FOUND`.

## 3) Inquiries (`/inquiries`)

### Endpoint Matrix

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/inquiries` | Required | Current user's inquiry list |
| `POST` | `/api/v1/inquiries` | Required | Create an inquiry |
| `GET` | `/api/v1/inquiries/:id` | Required | Current user's inquiry detail |
| `GET` | `/api/v1/admin/inquiries` | Required + Admin | Admin inquiry list |
| `GET` | `/api/v1/admin/inquiries/:id` | Required + Admin | Admin inquiry detail |
| `POST` | `/api/v1/admin/inquiries/:id/replies` | Required + Admin ops/owner | Register an answer |
| `POST` | `/api/v1/admin/inquiries/:id/status` | Required + Admin ops/owner | Change inquiry status |

### DTO Contract

- `CreateInquiryDto`
  - `category`: `account | match | team | tournament | payment_refund | report | other`
  - `title`: string, max 80
  - `body`: string, max 2000
  - `contact?`: string, max 120
  - `relatedType?`: `match | team | team_match | tournament | registration | payment | user`
  - `relatedId?`: string, max 80
- If `relatedType` is provided, `relatedId` is required. If `relatedId` is provided, `relatedType` is required.

### Response Contract

- Inquiry item fields: `inquiryId`, `category`, `title`, `body`, `contact`, `relatedType`, `relatedId`, `status`, `createdAt`, `updatedAt`, `closedAt`.
- `contact` may be `null`; logged-in user identity is the primary contact context.
- `status`: `received | reviewing | answered | closed`.
- List response is cursor-shaped: `{ items, pageInfo: { nextCursor, hasNext } }`.
- Detail response may include `replies`: `{ replyId, adminName, adminRole, body, createdAt, updatedAt }[]`.
- Admin list item fields: `inquiryId`, `userId`, `requesterName`, `requesterEmail`, `category`, `title`, `status`, `relatedType`, `relatedId`, `replyCount`, `createdAt`, `updatedAt`, `closedAt`.
- `ReplyInquiryDto`: `body` string, max 2000.
- `ChangeInquiryStatusDto`: `status` plus optional `reason` string, max 500.

### Permission Gate

- `JwtAuthGuard` is required for every endpoint.
- Users can only list and read their own inquiries.
- Cross-user detail access returns `403 PERMISSION_DENIED`; missing inquiry returns `404 NOT_FOUND`.
- Admin `support` can read only; reply and status mutation require `ops` or `owner`.
- Creating a reply automatically sets the inquiry status to `answered` and records admin action/status logs.

## 4) Badges (`/badges`)

### 엔드포인트

| Method | Path | Auth | 용도 |
|---|---|---|---|
| `GET` | `/api/v1/badges` | Optional | 배지 타입 목록 |
| `GET` | `/api/v1/badges/team/:teamId` | Optional | 팀 배지 조회 |
| `POST` | `/api/v1/badges/team/:teamId` | Optional(현재 코드) | 팀 배지 부여 |

### 계약 포인트

- `POST /badges/team/:teamId` body는 raw object:
  - `type`, `name`, `description?`
- 컨트롤러 레벨 auth/guard가 없다. 현재 코드 기준으로는 공개 접근 가능하다.

### CAUTION

- API summary에는 "관리자"라고 적혀 있지만 guard가 없다. 프론트에서 공개 액션으로 노출하면 안 된다.

## 4) User Blocks (`/users/blocks`)

### 엔드포인트

| Method | Path | Auth | 용도 |
|---|---|---|---|
| `POST` | `/api/v1/users/blocks` | Required | 사용자 차단 |
| `DELETE` | `/api/v1/users/blocks/:blockedId` | Required | 차단 해제 |
| `GET` | `/api/v1/users/blocks` | Required | 차단 목록 |

### DTO 계약

- `CreateUserBlockDto`
  - `blockedId`: string
  - `reason?`: string (max 200)

### 엣지 케이스

- 자기 자신 차단: `400 CANNOT_BLOCK_SELF`
- 중복 차단: `409 ALREADY_BLOCKED`
- 존재하지 않는 차단 해제: `404 BLOCK_NOT_FOUND`

## 5) Tournaments (`/tournaments`)

### 엔드포인트

| Method | Path | Auth | 용도 |
|---|---|---|---|
| `GET` | `/api/v1/tournaments` | Public | 대회 목록(cursor) |
| `GET` | `/api/v1/tournaments/:id` | Public | 대회 상세 |
| `GET` | `/api/v1/tournaments/campaigns/:slug` | Public | 공개 캠페인과 safe 대회 정보 |
| `POST` | `/api/v1/tournaments/:tournamentId/registrations` | Required | 팀 단위 신청 draft 생성 |
| `GET` | `/api/v1/tournaments/:tournamentId/registrations/my-registration` | Required | 내 신청 조회 |
| `GET` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId` | Required | 신청 상세 조회 |
| `POST` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/submit` | Required | 신청 제출 + 결제 대기 전환 |
| `POST` | `/api/v1/tournaments/:tournamentId/registrations/:registrationId/cancel-request` | Required | 신청 취소 요청 |
| `GET` | `/api/v1/admin/tournaments/:tournamentId/campaign` | Required + Active Admin | 캠페인 상태 무관 조회 |
| `POST` | `/api/v1/admin/tournaments/:tournamentId/campaign` | Required + Owner/Ops | 영구 캠페인 draft 생성 |
| `PATCH` | `/api/v1/admin/tournaments/:tournamentId/campaign` | Required + Owner/Ops | slug/content 수정 |
| `POST` | `/api/v1/admin/tournaments/:tournamentId/campaign/status` | Required + Owner/Ops | 캠페인 상태 전환 |
| `GET` | `/api/v1/admin/tournaments/:tournamentId/sponsors` | Required + Admin | 대회 협찬/이벤트 목록 |
| `POST` | `/api/v1/admin/tournaments/:tournamentId/sponsors` | Required + Admin | 대회 협찬/이벤트 생성 |
| `PATCH` | `/api/v1/admin/tournaments/:tournamentId/sponsors/:sponsorId` | Required + Admin | 대회 협찬/이벤트 수정 |
| `POST` | `/api/v1/admin/tournaments/:tournamentId/sponsors/:sponsorId/deactivate` | Required + Admin | 대회 협찬/이벤트 비공개 전환 |
| `GET` | `/api/v1/admin/tournaments/:tournamentId/popups` | Required + Active Admin | 대회 팝업 전체 목록 |
| `POST` | `/api/v1/admin/tournaments/:tournamentId/popups` | Required + Owner/Ops | 대회 팝업 생성 |
| `PATCH` | `/api/v1/admin/tournaments/:tournamentId/popups/:popupId` | Required + Owner/Ops | 대회 팝업 전체 필드 수정 |
| `DELETE` | `/api/v1/admin/tournaments/:tournamentId/popups/:popupId` | Required + Owner/Ops | 대회 팝업 삭제 |
| `POST` | `/api/v1/admin/tournaments/:tournamentId/publish-bracket` | Required + Owner/Ops | 공개 상세에 대진표 일괄 공개 |
| `GET` | `/api/v1/admin/tournaments/:tournamentId/bracket` | Required + Active Admin | 조/경기/순위 운영 데이터 조회 |
| `POST` | `/api/v1/admin/fixtures/:fixtureId/result` | Required + Owner/Ops | 경기 결과와 득점자/영상 기록 |

### 쿼리/DTO 계약

- `TournamentListQueryDto`
  - `status?`: `open | closed | in_progress | completed`
  - `sportId?`: UUID
  - `cursor?`: string
  - `limit?`: number, `1~50`
- 기본 상태 필터:
  - status 미지정 시 `open | closed | in_progress | completed`만 노출
  - `draft | cancelled` 대회는 public read에서 404/목록 제외
- public list/detail의 `campaignSlug`는 연결된 캠페인이 `published`일 때만 문자열이며, 그 외에는 `null`이다.
- 캠페인 content version `1`은 `hero`, `intro`, `highlights(max 8)`, `faq(max 12)`만 허용한다. nested unknown field, missing nested object, whitespace-only text, raw HTML/CSS/JavaScript marker는 strict DTO validation으로 거절한다. 이미지는 canonical `/uploads/...` 또는 public HTTPS URL만 허용한다.
- 캠페인 slug는 전역 unique lowercase kebab-case(`3~80`)다. 최초 publish 뒤에는 draft/archived 상태에서도 변경할 수 없고, archived slug를 유지하며 delete/backfill 경로는 없다.
- 캠페인 상태 전이는 `draft -> published|archived`, `published -> draft|archived`, `archived -> draft`다. publish는 non-deleted `open|closed|in_progress|completed` 대회만 가능하다. archive 진입은 `archivedAt`을 설정하고 draft 복귀는 이를 지우며, 모든 상태 변경에는 audit reason이 필수다.
- public campaign 응답은 규정/환불/active sponsors/confirmed count/confirmed·waitlisted team summary를 기존 tournament SSOT에서 투영한다. bank/선수 연락처/admin identity는 포함하지 않는다.
- update/status는 serializable compare-and-swap과 같은 transaction의 admin audit log를 사용한다. empty/no-op patch는 400, stale concurrent mutation은 409다.
- `CreateRegistrationDto`
  - `teamId`: UUID
- `SubmitRegistrationDto`
  - `paymentMethod`: `pg | bank_transfer`
  - `depositorName?`: 계좌이체 선택 시 서비스 계층에서 필수
  - `agreedRules`, `agreedPrivacy`, `agreedRefund`: 필수 boolean
  - `agreedMediaConsent?`: optional boolean
- `CreateTournamentSponsorDto`
  - `name`: string, max 120
  - `description?`: string, max 500
  - `logoUrl?`, `websiteUrl?`, `instagramUrl?`: protocol 포함 URL
  - `benefitText?`, `boothText?`: string, max 1000
  - `eventTitle?`: string, max 200
  - `eventDescription?`, `eventResultText?`: string, max 2000
  - `sortOrder?`: number, `0~9999`
  - `isActive?`: boolean, 기본값 `true`
- `UpdateTournamentSponsorDto`
  - `CreateTournamentSponsorDto`와 같은 필드를 optional로 받는다.
  - 필드 미전송은 기존 값을 유지한다.
  - optional text 필드에 빈 문자열을 보내면 해당 값을 `null`로 정리한다.
  - `isActive=false` 또는 deactivate endpoint는 public detail의 `sponsors` 노출에서 제외한다.
- Admin sponsor mutation은 `getMutationAdmin` 권한 게이트를 사용하고, `tournament_sponsor.create|update|deactivate` admin action log를 남긴다.

### 대회 팝업 계약

- `CreateTournamentPopupDto`와 `UpdateTournamentPopupDto`는 같은 전체 입력 계약을 사용한다. `PATCH`도 partial patch가 아니므로 아래 필드를 모두 보내야 한다.
  - `title`: trim 후 비어 있지 않은 문자열, max 120
  - `body`: trim 후 비어 있지 않은 문자열, max 5000
  - `imageUrl?`: protocol이 있는 URL, max 1000. 빈 문자열 또는 미전송은 `null`로 저장한다.
  - `status`: `draft | published | archived`
  - `displayStartAt?`, `displayEndAt?`: ISO date string 또는 `null`
- 시작/종료가 모두 있으면 종료 시각이 시작 시각보다 늦어야 한다. 그렇지 않으면 `400 INVALID_DISPLAY_WINDOW`다.
- admin 목록 응답은 `{ items }`이며 최신 생성순이다. 생성/수정 item 필드는 `id`, `tournamentId`, `title`, `body`, `imageUrl`, `status`, `displayStartAt`, `displayEndAt`, `createdAt`, `updatedAt`이다. 삭제 응답은 `{ popupId, deleted: true }`다.
- 다른 대회에 속하거나 존재하지 않는 popup ID는 `404 TOURNAMENT_POPUP_NOT_FOUND`, 존재하지 않는 대회는 `404 TOURNAMENT_NOT_FOUND`다. 생성/수정/삭제는 삭제되지 않은 대회만 허용하고 admin action log를 같은 transaction에서 남긴다.
- 공개 `GET /api/v1/tournaments/:id` 응답에는 `popup`이 추가된다. 현재 시각에 `status=published`, `displayStartAt <= now`(또는 null), `displayEndAt > now`(또는 null)를 모두 만족하는 최신 생성 popup 1건만 `{ popupId, title, body, imageUrl }`로 반환하며, 없으면 `null`이다. admin용 상태·기간·timestamp는 공개 popup 응답에 포함하지 않는다.

### 대진표 공개와 경기 결과 계약

- `POST /api/v1/admin/tournaments/:tournamentId/publish-bracket` 응답은 `{ tournamentId, bracketPublishedAt, alreadyPublished }`다. 최초 성공은 `alreadyPublished=false`이며 `tournament.bracket_publish` audit log를 같은 transaction에서 한 번만 남긴다.
- 접수 마감 전 공개도 서버에서 허용하며, 공개 뒤 되돌리는 endpoint는 없다. 마감 전 공개 확인은 admin UI가 담당한다.
- 이미 공개된 대회에 대한 재요청은 기존 `bracketPublishedAt`을 유지하고 `alreadyPublished=true`를 반환한다. 동시 최초 공개 요청도 `bracketPublishedAt IS NULL` 조건부 갱신으로 직렬화되어 한 요청만 상태와 audit log를 만들고, 나머지는 같은 공개 시각의 멱등 성공으로 수렴한다. 조건부 갱신 후에도 공개 시각을 확인할 수 없는 비정상 충돌만 `409 TOURNAMENT_BRACKET_PUBLISH_CONFLICT`다.
- 공개 상세는 `bracketPublishedAt=null`인 동안 DB에 조/경기/순위가 있어도 `groups=[]`, `fixtures=[]`로 반환한다. 공개 뒤에는 `groups`에 group teams와 standings, `fixtures`에 팀명·결과·득점자·영상을 포함한다. 공지, 참가팀, 스폰서, 리뷰, 수상 등 다른 상세 필드는 이 공개 게이트와 무관하다. admin `GET /admin/tournaments/:tournamentId/bracket`은 공개 여부와 무관하게 운영 데이터를 조회한다.
- `POST /api/v1/admin/fixtures/:fixtureId/result`의 `goals`는 최대 50개이며 각 항목은 `team: home | away`, trim 후 비어 있지 않은 `playerName`(max 60), optional `playerId` UUID, optional `minute` 정수(`0~200`)를 받는다.
- `playerName`이 공백뿐이면 DTO validation에서 거절하고, 서비스 계층에도 `400 GOAL_PLAYER_NAME_REQUIRED` 방어가 있다. `playerId`를 보낸 경우 해당 선수가 goal의 `team`과 일치하는 홈/원정 registration 명단에 있어야 하며, 없거나 상대 팀 선수이면 `400 GOAL_PLAYER_NOT_IN_TEAM`이다. 명단 밖 비회원/대타는 `playerId` 없이 이름만 기록할 수 있다.
- `goals`를 생략하면 기존 득점 기록을 유지한다. 배열을 보내면 빈 배열을 포함해 replace-all로 처리한다. 결과 upsert, 기존 goal 삭제와 새 goal 생성, fixture의 `completed` 전환, audit log는 하나의 transaction이므로 일부 득점자만 교체되는 상태를 남기지 않는다. 득점자 이름/명단 검증은 기존 goal 삭제 전에 끝난다.
- admin bracket과 공개 fixture result의 `goals` 항목은 `id`, `team`, `playerId`, `playerName`, `minute`을 반환한다.

### 공개 상세 응답 계약

- `GET /api/v1/tournaments`와 `GET /api/v1/tournaments/:id`는 로그인 없이 접근 가능한 공개 탐색 API다. 신청, 내 신청, 로스터, 관리자 조작은 별도 guarded endpoint에서만 처리한다.
- `GET /api/v1/tournaments/:id`는 대회 기본 정보, `bracketPublishedAt`, `groups`, `fixtures`, `announcements`, `confirmedCount`, `popup`을 반환한다.
- `announcements`는 public detail에서 `publishedAt != null`인 공지만 포함한다.
  - 필드: `id`, `title`, `body`, `category`, `audience`, `publishedAt`, `createdAt`
  - `category`: `general | venue | sponsor | media | results | review`
  - 프론트는 `venue` 공지를 장소·주차·경기 준비 안내 앵커로, `sponsor | media | results | review` 공지를 후속 허브 CTA 앵커로 사용한다. 이 공지는 실제 스폰서 로고, 영상 업로드, 구조화 순위표를 대체하지 않으며 운영진이 공개한 안내 콘텐츠로만 취급한다.
  - 완료된 fixture 결과가 있으면 후속 허브의 리뷰 CTA는 `/my/reviews`로 연결된다. 실제 작성 대상은 `/reviews` 목록/`/reviews/sources/tournament_fixture/:fixtureId`가 서버에서 참가 팀 권한과 제출 여부를 검증한다.
- `sponsors`는 대회 한정 협찬/이벤트 구조화 목록이다.
  - public detail에는 `isActive=true`인 row만 포함한다.
  - 정렬: `sortOrder ASC`, `createdAt ASC`
  - 필드: `id`, `name`, `description`, `logoUrl`, `websiteUrl`, `instagramUrl`, `benefitText`, `boothText`, `eventTitle`, `eventDescription`, `eventResultText`, `sortOrder`
  - 프론트는 `sponsors.length > 0`일 때 `#tournament-sponsors` 섹션을 렌더하고, 후속 허브의 협찬 CTA도 이 앵커를 우선 사용한다. `announcements.category=sponsor`는 구조화 sponsor row가 없을 때 운영진 공지 fallback으로만 사용한다.
- `participantTeams`는 공개 가능한 참가팀 목록이다.
  - 포함 상태: `confirmed`, `waitlisted`
  - 제외 상태: `draft`, `awaiting_payment`, `payment_checking`, `paid`, `cancel_requested`, `cancelled`
  - 필드: `registrationId`, `teamId`, `teamName`, `status`, `confirmedAt`
  - 확정 팀이 대기 팀보다 먼저 렌더링될 수 있도록 API가 `confirmed` 우선 순서로 직렬화한다.
- 계좌이체 신청 화면에서 안내가 필요하므로 상세 응답에는 `bankName`, `bankAccount`, `bankHolder`가 포함된다.

### 신청/결제 응답 계약

- `GET /api/v1/tournaments/:tournamentId/registrations/my-registration`, `GET /api/v1/tournaments/:tournamentId/registrations/:registrationId`, `POST /submit`, admin registration 목록/처리 응답의 `payment`에는 `paymentDueAt`이 포함된다.
  - `paymentDueAt`은 현재 v1 계약에서 계좌 안내가 노출되는 payment 생성 시각(`payment.createdAt`) 기준 2시간 뒤 ISO timestamp다.
  - 프론트는 `paymentDueAt`을 안내 표시용으로만 사용하고, 기한 경과에 따른 최종 상태는 서버가 반환하는 `registration.status`와 `payment.status`를 신뢰한다.

### 권한/상태 게이트

- 신청 생성은 로그인 사용자만 가능하며, 신청 팀의 `owner | manager` 권한이 필요하다.
- 신청 제출은 draft 신청만 가능하며, 제출 후 `awaiting_payment`로 전이한다.
- `awaiting_payment` + `payment.ready` 상태가 `paymentDueAt`을 지나 조회되거나 운영자 입금 확인 대상이 되면 서버가 registration과 payment를 `cancelled`로 확정한다.
  - registration `cancelReason`: `입금 안내 후 2시간 내 입금 확인이 없어 자동 취소됐어요.`
  - 운영자가 기한 경과 후 입금 확인을 시도하면 `PAYMENT_DEADLINE_EXPIRED` conflict를 반환한다.
- 선수 명단은 등록 범위(`minPlayers~maxPlayers`)와 로스터 잠금 상태를 서버에서 검증한다.
- 운영자 결제 확인/확정/대기/취소/로스터 잠금은 `/api/v1/admin/...` tournament registration endpoints에서 처리한다.
- 운영자 협찬/이벤트 생성은 mutation admin만 가능하다. support admin은 `/admin/tournaments/:tournamentId/sponsors` 읽기만 가능하고, 생성 시 `PERMISSION_DENIED`를 받는다.
- 캠페인도 support admin은 조회만 가능하고 owner/ops만 생성·수정·상태 전환할 수 있다. 모든 mutation은 `tournament_campaign.*` admin action log와 같은 transaction에서 저장된다.

## 6) Health (`/health`)

### 엔드포인트

| Method | Path | Auth | 용도 |
|---|---|---|---|
| `GET` | `/api/v1/health` | Optional | 런타임 상태 확인 |

응답 데이터는 `{ status, checks: { db, redis }, timestamp }` 형태다.

### 프론트 메모

- 운영자/개발자 도구에서 상태 표시용으로만 사용한다.
- 사용자 여정의 정상 동작 판정(비즈니스 readiness)을 health 하나로 대체하지 않는다.

## 7) 보조 Surface — Venue Reviews (`/venues/:id/reviews`)

`venues` 도메인 문서와 별개로 raw-body 주의점을 명시한다.

- `POST /api/v1/venues/:id/reviews`는 인증 필요.
- body가 `Record<string, unknown>`이므로 DTO 강제 검증이 없다.
- 프론트는 rating/세부 평점 범위와 optional 필드를 폼 레벨에서 엄격히 검증해야 한다.

## 프론트 통합 체크리스트

1. DTO 없는 endpoint(`badges/team`, `venues/:id/reviews`)는 요청 타입을 프론트 내부에서 강제한다.
2. `message`는 문자열/배열 혼합 가능성이 있으므로 UI 에러 변환기를 공통 사용한다.
3. admin 경로(`/admin/reports`)는 일반 사용자 shell에서 라우팅하지 않는다.
4. tournament 쿼리의 `limit`은 숫자 문자열로 전달해도 되지만, 프론트는 명시적으로 숫자 범위를 통제한다.
5. tournament detail의 `participantTeams`는 공개 참가팀 표시 전용이다. 신청 상태 확인, 입금 대기, 로스터 편집은 registration endpoints를 별도로 조회한다.

## Source References

- `apps/v1_api/src/reviews/reviews.controller.ts`, `reviews.service.ts`, `tournament-fixture-reviews.service.ts`
- `apps/v1_api/src/tournaments/tournaments-read.controller.ts`, `tournaments-read.service.ts`, `dto/tournament-read.dto.ts`
- `apps/v1_api/src/tournaments/tournament-campaigns.controller.ts`, `tournament-campaign-read.service.ts`, `tournament-campaign-admin.service.ts`, `dto/tournament-campaign.dto.ts`
- `apps/v1_api/src/tournaments/tournament-sponsors.controller.ts`, `tournament-sponsors.service.ts`, `dto/tournament-sponsor.dto.ts`
- `apps/v1_api/src/tournaments/tournament-popup.controller.ts`, `tournament-popup.service.ts`, `dto/tournament-popup.dto.ts`
- `apps/v1_api/src/tournaments/tournaments-admin.controller.ts`, `tournaments-admin.service.ts`
- `apps/v1_api/src/tournaments/tournament-bracket.controller.ts`, `tournament-bracket.service.ts`, `dto/admin-bracket.dto.ts`
- `apps/v1_api/src/tournaments/tournament-detail.presenter.ts`, `tournaments-read.query.ts`
- `apps/v1_api/src/tournaments/tournament-registrations.controller.ts`, `tournament-registrations.service.ts`, `dto/tournament-registration.dto.ts`
- `apps/v1_api/src/tournaments/tournament-players.controller.ts`, `tournament-players.service.ts`
- `apps/v1_api/src/health/health.controller.ts`
- `apps/v1_web/src/hooks/use-v1-api.ts`, `apps/v1_web/src/types/api.ts`
