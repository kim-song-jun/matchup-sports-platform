# Domain Contract — Admin & Ops

## 범위와 Source of Truth

이 문서는 v1 `AdminController`가 실제로 노출하는 `/api/v1/admin/*` 운영 API만 다룬다.

1. `apps/v1_api/src/admin/admin.controller.ts`
2. `apps/v1_api/src/admin/dto/admin.dto.ts`
3. `apps/v1_api/src/admin/admin.service.ts`
4. `apps/v1_web/src/hooks/use-v1-api.ts`

## 공통 인증/권한

- 모든 경로는 `V1AuthGuard`를 통과해야 한다.
- 서비스는 `V1AdminUser.status=active`뿐 아니라 연결된 `V1User.accountStatus=active`도 함께 확인한다. 둘 중 하나라도 active가 아니면 `403 PERMISSION_DENIED`다.
- 조회는 active owner/ops/support가 사용할 수 있다.
- 상태 변경, 팝업·공지·문의 mutation은 owner 또는 ops만 가능하다. support는 `403 PERMISSION_DENIED`다.
- 운영자 목록·부여·변경은 owner 전용이다.

## Endpoint Matrix

| Method | Path | DTO / Query | 권한 | 용도 |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/me` | - | active admin | 내 운영자 역할·capability |
| `GET` | `/api/v1/admin/overview` | `AdminOverviewQueryDto` | active admin | 운영 현황 요약 |
| `GET` | `/api/v1/admin/action-logs` | `AdminLogsQueryDto` | active admin | 관리자 액션 로그 |
| `GET` | `/api/v1/admin/status-change-logs` | `AdminLogsQueryDto` | active admin | 상태 변경 로그 |
| `GET` | `/api/v1/admin/users` | `AdminUserListQueryDto` | active admin | 사용자 목록 |
| `GET` | `/api/v1/admin/users/:userId` | - | active admin | 사용자 상세·탈퇴 사유·팀 역할 요약 |
| `POST` | `/api/v1/admin/users/:userId/status` | `ChangeUserStatusDto` | owner/ops | 사용자 상태 변경 |
| `DELETE` | `/api/v1/admin/users/:userId` | `DeleteAdminUserDto` | owner/ops | 사용자 삭제 처리 |
| `GET` | `/api/v1/admin/matches` | `AdminMatchListQueryDto` | active admin | 매치 목록 |
| `GET` | `/api/v1/admin/matches/:matchId` | - | active admin | 매치 상세 |
| `POST` | `/api/v1/admin/matches/:matchId/status` | `ChangeMatchStatusDto` | owner/ops | 매치 상태 변경 |
| `GET` | `/api/v1/admin/teams` | `AdminTeamListQueryDto` | active admin | 팀 목록 |
| `GET` | `/api/v1/admin/teams/:teamId` | - | active admin | 팀 상세 |
| `POST` | `/api/v1/admin/teams/:teamId/status` | `ChangeTeamStatusDto` | owner/ops | 팀 상태 변경 |
| `GET` | `/api/v1/admin/team-matches` | `AdminTeamMatchListQueryDto` | active admin | 팀 매치 목록 |
| `POST` | `/api/v1/admin/team-matches/:teamMatchId/status` | `ChangeTeamMatchStatusDto` | owner/ops | 팀 매치 상태 변경 |
| `GET` | `/api/v1/admin/popups` | `AdminPopupListQueryDto` | active admin | 팝업 목록 |
| `GET` | `/api/v1/admin/popups/:popupId` | - | active admin | 팝업 상세 |
| `POST` | `/api/v1/admin/popups` | `CreateAdminPopupDto` | owner/ops | 팝업 생성 |
| `PATCH` | `/api/v1/admin/popups/:popupId` | `UpdateAdminPopupDto` | owner/ops | 팝업 전체 필드 수정 |
| `DELETE` | `/api/v1/admin/popups/:popupId` | - | owner/ops | 팝업 삭제 |
| `GET` | `/api/v1/admin/notices` | `AdminNoticeListQueryDto` | active admin | 공지 목록 |
| `GET` | `/api/v1/admin/notices/:noticeId` | - | active admin | 공지 상세 |
| `POST` | `/api/v1/admin/notices` | `CreateAdminNoticeDto` | owner/ops | 공지 생성 |
| `PATCH` | `/api/v1/admin/notices/:noticeId` | `UpdateAdminNoticeDto` | owner/ops | 공지 전체 필드 수정 |
| `DELETE` | `/api/v1/admin/notices/:noticeId` | - | owner/ops | 공지 삭제 |
| `GET` | `/api/v1/admin/inquiries` | `AdminInquiryListQueryDto` | active admin | 문의 목록 |
| `GET` | `/api/v1/admin/inquiries/pending-count` | - | active admin | `received/reviewing` 문의 수 |
| `GET` | `/api/v1/admin/inquiries/:inquiryId` | - | active admin | 문의 및 답변 상세 |
| `POST` | `/api/v1/admin/inquiries/:inquiryId/replies` | `ReplyInquiryDto` | owner/ops | 답변 작성 |
| `PATCH` | `/api/v1/admin/inquiries/:inquiryId/replies/:replyId` | `ReplyInquiryDto` | owner/ops | 답변 수정 |
| `POST` | `/api/v1/admin/inquiries/:inquiryId/status` | `ChangeInquiryStatusDto` | owner/ops | 문의 상태 변경 |
| `GET` | `/api/v1/admin/admins` | `AdminListQueryDto` | owner | 운영자 목록 |
| `POST` | `/api/v1/admin/admins` | `GrantAdminDto` | owner | 운영자 권한 부여·재부여 |
| `PATCH` | `/api/v1/admin/admins/:userId` | `UpdateAdminDto` | owner | 운영자 역할·상태 변경 |

## 목록 Query 계약

- 사용자: `status=active|suspended|blocked|withdrawal_pending|deleted`, `q`, `cursor`, `limit`(1~50).
- 매치: `status=recruiting|closed|cancelled|completed|archived`, `sportId`, `q`, `cursor`, `limit`(1~50).
- 팀: `status=active|suspended|archived`, `q`, `cursor`, `limit`(1~50).
- 팀 매치: `status=recruiting|closed|matched|cancelled|completed|archived`, `cursor`, `limit`(1~50).
- 팝업: `status=draft|published|archived`, `q`, `cursor`, `limit`(1~50).
- 공지: `status=draft|published|archived`, `audience=public|users|admins`, `category=업데이트|안내`, `q`, `cursor`, `limit`(1~50).
- 문의: `status=received|reviewing|answered|closed`, `category=account|match|team|tournament|payment_refund|report|other`, `q`, `cursor`, `limit`(1~50).
- 운영자: `status=active|suspended|revoked`, `cursor`, `limit`(1~50).
- 목록 응답은 `items`와 `pageInfo: { nextCursor, hasNext }`를 사용한다.

## v1 관리자 목록 집계 계약

감사 로그를 제외한 v1 관리자 목록 화면의 필터 숫자는 현재 페이지의 `items.length`가 아니라 서버가 반환하는 전체 검색 결과 집계를 사용한다. 아래 목록 응답은 기존 `items`, `pageInfo`와 함께 다음 `summary`를 반환한다.

```ts
type AdminListSummary = {
  total: number;
  byStatus: Record<string, number>;
  byCategory?: Record<string, number>;
  byAudience?: Record<string, number>;
};
```

적용 엔드포인트는 `GET /api/v1/admin/users`, `matches`, `teams`, `team-matches`, `tournaments`, `inquiries`, `notices`, `popups`, `admins`다. `summary`는 cursor와 limit의 영향을 받지 않으므로 첫 페이지와 추가 로드 응답에서 같은 필터 조건이면 동일하다. 검색어나 종목 같은 비상태 조건은 집계에 반영하지만, `byStatus`는 현재 선택한 status를 제외하고 계산하여 모든 상태 칩의 전환 가능 건수를 유지한다.

문의 `byCategory`는 현재 category를 제외하고 검색어와 status를 반영한다. 공지 `byAudience`는 현재 audience를 제외하고 검색어, status, category를 반영한다. 따라서 보조 필터의 `전체` 숫자는 해당 facet map 값의 합으로 계산한다. 알려진 상태·분류·대상 키는 결과가 없어도 `0`을 반환한다.

## 요청/응답 핵심 계약

### 사용자 운영 (REST 엔드포인트 레벨)

- `POST /admin/users/:id/warn`
  - Body: `WarnUserAdminDto`
  - `note` optional (max 500)
- `PATCH /admin/users/:id/status`
  - Body: `UpdateUserStatusAdminDto`
  - `status`: `active | suspended`
  - `status=suspended`일 때 `note` 사실상 필수 (없으면 400)
- `DELETE /admin/users/:id`
  - Body: `{ reason: string }`
  - v1에서는 `accountStatus=deleted`, `deletedAt` 기록, 이메일/전화번호/프로필 마스킹, auth identity unlink, provider key 마스킹, 감사 로그 기록으로 처리한다. 이미 연결된 실시간 소켓도 강제 종료한다.
  - 이메일 계정과 카카오 계정 모두 원본 unique key를 비우므로 같은 이메일/카카오 계정으로 재가입할 수 있다.
  - `GET /admin/users/:id`는 `withdrawalRequest.reason`으로 사용자가 탈퇴 대기 요청 때 작성한 메시지를 노출한다.
  - 팀 정보는 생성/소유 팀, 팀장/운영진/멤버 역할 카운트, active 소속팀 목록을 분리해 제공한다.

아래 "사용자·운영자 접근 불변식" 절은 같은 사용자 상태 변경/삭제 계약을 DTO 레벨(`ChangeUserStatusDto`/`DeleteAdminUserDto`)에서 상세히 다룬다.

## 사용자·운영자 접근 불변식

### 사용자 상태와 삭제

`ChangeUserStatusDto`:

```json
{
  "status": "suspended",
  "reason": "반복 신고로 인한 임시 정지"
}
```

- `status`: `active | suspended | blocked | deleted`
- `reason`: 필수 문자열, 최대 500자
- `DeleteAdminUserDto`도 `reason` 필수, 최대 500자다.
- 삭제는 `accountStatus=deleted`, `deletedAt`, 이메일·전화번호·프로필 마스킹, auth identity unlink/provider key 마스킹, 감사 로그를 하나의 처리로 수행한다.
- active 운영자가 자기 사용자 계정을 비활성화하거나 삭제하면 `409 SELF_LOCKOUT`이다.
- 다른 active 운영자 계정을 비활성화하거나 삭제하려면 owner여야 하며, 먼저 `PATCH /admin/admins/:userId`에서 운영자 상태를 `revoked`로 바꿔야 한다. revoke 전에는 `409 ADMIN_ACCESS_ACTIVE`다.
- 따라서 사용자 계정을 `active`로 되돌려도 revoked 운영자 권한이 자동으로 복구되지 않는다.

### 운영자 부여·변경

`GrantAdminDto`:

```json
{
  "userId": "uuid",
  "adminRole": "ops",
  "reason": "운영 담당자 지정"
}
```

- `adminRole`: `ops | support`. 신규 owner 부여는 이 endpoint의 계약이 아니다.
- 신규 부여와 revoked/suspended 운영자 재활성화는 연결된 사용자 계정이 active일 때만 가능하다. 아니면 `409 ADMIN_ACCOUNT_INACTIVE`다.
- 이미 active인 운영자에게 다시 부여하면 `409 ALREADY_ADMIN`이다.

`UpdateAdminDto`:

```json
{
  "adminRole": "support",
  "status": "active",
  "reason": "담당 업무 변경"
}
```

- `adminRole?`: `owner | ops | support`
- `status?`: `active | revoked`
- `reason`: 필수 문자열, 최대 500자
- 자기 운영자 레코드 변경은 `409 SELF_MODIFICATION`이다.
- active owner를 demote 또는 revoke할 때는 연결된 사용자 계정까지 active인 다른 owner가 최소 1명 남아야 한다. 위반하면 `409 LAST_OWNER`다.
- 구현은 active owner 행을 정렬된 순서로 `FOR UPDATE` 잠금한 뒤 트랜잭션 안에서 남은 owner를 계산한다. 동시 demote/revoke가 owner 0명 상태를 만들 수 없다.

### 배포 마이그레이션 remediation

`apps/v1_api/prisma/migrations/20260719043000_v1_admin_active_account_invariant/migration.sql`은 기존 데이터 중 연결된 `V1User.accountStatus`가 active가 아닌데 `V1AdminUser.status=active`인 행을 `revoked`로 바꾼다. 기존 `revoked_at`은 보존하고, 없으면 마이그레이션 시각을 기록하며 `updated_at`을 갱신한다. 런타임과 같은 owner-first 순서로 행을 잠그고, 각 변경에는 `actorType=system`, `reason=linked_user_account_inactive` 상태 감사 로그를 같은 SQL 문에서 남긴다.

이 remediation 이후 런타임도 운영자 행과 연결 사용자 계정이 모두 active인 경우에만 접근을 허용한다.

## 상태 변경 DTO

- 매치 `ChangeMatchStatusDto`: `status=recruiting|closed|cancelled|completed|archived`, `reason` 필수(max 500).
- 팀 `ChangeTeamStatusDto`: `status=active|suspended|archived`, `reason` 필수(max 500).
- 팀 매치 `ChangeTeamMatchStatusDto`: `status=recruiting|closed|matched|cancelled|completed|archived`, `reason` 필수(max 500).
- 성공 시 대상 ID, 이전/신규 상태, action/status-change log ID를 반환한다.

## 팝업 계약

- 생성·수정 body: `audience=public|users|admins`, `title`(max 120), `body`(max 5000), `targetScreens`(1개 이상), `status=draft|published|archived`, 선택 `linkUrl`, `linkLabel`, `displayStartAt`, `displayEndAt`.
- `targetScreens`: `home`, `matches`, `team_matches`, `teams`, `tournaments`, `lessons`, `marketplace`, `mercenary`, `venues`, `community`, `chat`, `notifications`, `profile`, `my`.
- `linkUrl`은 `/`로 시작하는 내부 경로 또는 `https://` URL만 허용한다. `linkLabel`만 보내면 `400 INVALID_POPUP_LINK`다.
- 노출 종료 시각은 시작 시각보다 늦어야 한다. 위반하면 `400 INVALID_DISPLAY_WINDOW`다.
- 팝업은 공지의 고정 category가 아니라 독립 `v1_popups` 계약이다.
- 생성·수정·삭제는 각각 `popup.create`, `popup.update`, `popup.delete` 감사 로그를 남긴다.

## 공지 계약

- 생성·수정 body: `audience=public|users|admins`, `category=업데이트|안내`, `title`(max 120), `body`(max 5000), `status=draft|published|archived`.
- `UpdateAdminNoticeDto`는 partial DTO가 아니므로 모든 필드를 보낸다.
- 공지에는 팝업의 `targetScreens`, 링크, 노출 기간 필드를 보내지 않는다.
- 생성·수정·삭제는 각각 `notice.create`, `notice.update`, `notice.delete` 감사 로그를 남긴다.

## 문의 계약

- `ReplyInquiryDto`: `body` 필수(max 2000). trim 후 비어 있으면 `400 INVALID_INQUIRY_REPLY`다.
- 답변 작성은 문의 상태를 `answered`로 바꾸고 `closedAt`을 비운다.
- 답변 수정은 path의 `inquiryId`와 실제 답변 소속이 일치해야 한다.
- `ChangeInquiryStatusDto`: `status=received|reviewing|answered|closed`, 선택 `reason`(max 500).
- `closed` 전환 시 `closedAt`을 기록하고 다른 상태로 전환하면 비운다.

## 주요 오류

| HTTP | Code | 조건 |
|---|---|---|
| `400` | `INVALID_POPUP_LINK` | 팝업 링크 조합/형식 오류 |
| `400` | `INVALID_DISPLAY_WINDOW` | 팝업 노출 기간 오류 |
| `400` | `INVALID_INQUIRY_REPLY` | 공백 답변 |
| `403` | `PERMISSION_DENIED` | inactive 계정/운영자, 역할 부족, support mutation |
| `404` | `NOT_FOUND` | 대상 사용자·운영자·콘텐츠 없음 |
| `409` | `SELF_LOCKOUT` | active 운영자의 자기 사용자 계정 비활성화/삭제 |
| `409` | `ADMIN_ACCESS_ACTIVE` | revoke 전 active 운영자 사용자 계정 비활성화/삭제 |
| `409` | `LAST_OWNER` | 마지막 active-linked owner 접근 제거 |
| `409` | `ADMIN_ACCOUNT_INACTIVE` | inactive 사용자에게 운영자 접근 부여/재활성화 |
| `409` | `SELF_MODIFICATION` | 자기 운영자 레코드 변경 |
| `409` | `ALREADY_ADMIN` | 이미 active인 운영자 재부여 |

## Managed terms administration

- `GET /api/v1/admin/terms` and `GET /api/v1/admin/terms/:policyId` allow active owner, ops, and support admins to read policies, placements, every immutable document version, and per-version consent-event counts.
- `POST /api/v1/admin/terms`, `PATCH /api/v1/admin/terms/:policyId`, `POST /api/v1/admin/terms/:policyId/documents`, `PATCH /api/v1/admin/terms/:policyId/documents/:documentId`, and `POST /api/v1/admin/terms/:policyId/documents/:documentId/status` require owner or ops. Support receives `403 PERMISSION_DENIED` and no write occurs.
- Policy codes are stable and unique. A policy has at most one placement per context. Footer placements must be `display_only`; signup and tournament placements must be `required` or `optional`.
- New documents always start as `draft`. Published and archived documents are immutable; editing requires creating a new version. An immediately effective publication archives the currently effective version; a future-effective publication keeps that version active and replaces only another future schedule, so the runtime never loses a current document before `effectiveAt`.
- `subtitle` is normal list/detail supporting copy. `changeSummary` is version-change copy shown when that version requires user action; the fields are independently editable and returned by admin/current APIs.
- Each document version stores `requiresReconsent` (default `true`) and optional `enforcementAt`. When re-consent is required, existing users must accept that exact published document at or after the enforcement time. When it is disabled, an earlier accepted version of the same policy remains sufficient.
- Publication and archive require a non-empty reason and write admin action/status audit records. There is no delete endpoint for policies, documents, consent events, or historical versions.
- `/admin/terms` exposes context filtering, search, placement activation/order, version history, consent counts, draft editing, re-consent scheduling, publication/archive controls, and a preview rendered from the actual stored document body.

## Notice and popup rich content

- POST /api/v1/admin/content-assets uploads one JPEG, PNG, or WebP image up to 5MB for owner/ops and returns a temporary managed asset.
- DELETE /api/v1/admin/content-assets/:assetId deletes an unused temporary asset owned by the uploader; an owner may delete any temporary asset.
- Notice and popup content is restricted Tiptap JSON; body is the server-derived plain-text projection for search, summaries, and legacy clients.
- Tiptap's default textAlign=null attribute is accepted at the API boundary and omitted from canonical stored JSON. Explicit alignment remains restricted to left, center, or right.
- Tiptap Image's default title/width/height=null attributes are likewise omitted before validation and persistence. Non-null dimensions and arbitrary image attributes are not accepted.
- Empty Tiptap paragraph/heading nodes may omit content and are canonicalized to content=[]. Default Link presentation attrs are stripped; custom target/rel/class/title attrs are not part of the stored contract.
- Only managed /uploads URLs may be used for content images. External URLs, base64 images, raw HTML, unsafe links, and unknown nodes or attributes are rejected.
- Saving a notice or popup claims referenced temporary assets. Removing an unreferenced image deletes its managed asset record and stored file.
- The Web editor deletes its current session's unused temporary assets after save and all session temporary assets on explicit cancel or editor switch.
- The API performs an immediate startup scan and then hourly scans for unattached temporary assets older than 24 hours. It conditionally deletes the still-temporary database row before removing the file, so a concurrently attached asset is preserved.

## Source References

- `apps/v1_api/src/admin/admin.controller.ts`
- `apps/v1_api/src/admin/admin.service.ts`
- `apps/v1_api/src/admin/dto/admin.dto.ts`
- `apps/v1_api/src/admin/admin-terms.controller.ts`
- `apps/v1_api/src/admin/admin-terms.service.ts`
- `apps/v1_api/src/admin/dto/admin-terms.dto.ts`
- `apps/v1_api/prisma/migrations/20260719043000_v1_admin_active_account_invariant/migration.sql`
- `apps/v1_web/src/hooks/use-v1-api.ts`
