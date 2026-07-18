# Domain Contract — Admin & Ops

## 범위

운영자 전용 surface를 다룬다.

- `/admin/*` (관리자 대시보드 및 운영 CRUD)
- `/admin/disputes/*` (분쟁 운영)
- `/admin/settlements/*` (정산 운영)

이 문서는 **운영자 전용 계약**이다. 사용자 self-service 흐름으로 해석하면 안 된다.

기준 우선순위:

1. `apps/api/src/admin/admin.controller.ts` + `admin.service.ts`
2. `apps/api/src/disputes/disputes.controller.ts` + `disputes.service.ts`
3. `apps/api/src/settlements/settlements.controller.ts` + `settlements.service.ts`
4. `apps/api/src/admin/dto/*.ts`
5. `apps/web/src/hooks/use-api.ts` (관리자 호출부)

> v1 공지·팝업 관리 계약은 위 legacy 목록이 아니라 `apps/v1_api/src/admin/admin.controller.ts`, `apps/v1_api/src/admin/admin.service.ts`, `apps/v1_api/src/admin/dto/admin.dto.ts`, `apps/v1_web/src/hooks/use-v1-api.ts`를 기준으로 한다.

## 공통 인증/권한

- 기본적으로 `JwtAuthGuard + AdminGuard`가 함께 걸린다.
- `/admin/*`, `/admin/disputes/*`, `/admin/settlements/*`는 일반 사용자 토큰으로 접근 불가.
- 프론트는 관리자 shell 안에서만 진입 링크를 노출해야 한다.

## Endpoint Matrix

### A. `/admin`

| Method | Path | 용도 |
|---|---|---|
| `GET` | `/api/v1/admin/stats` | 대시보드 통계 |
| `GET` | `/api/v1/admin/statistics` | 통계 개요(추세/분포) |
| `GET` | `/api/v1/admin/users` | 사용자 목록(cursored) |
| `GET` | `/api/v1/admin/users/:id` | 사용자 상세 + 탈퇴 요청 메시지 + 팀 역할 요약 |
| `POST` | `/api/v1/admin/users/:id/warn` | 사용자 경고 |
| `PATCH` | `/api/v1/admin/users/:id/status` | 사용자 상태 변경 |
| `DELETE` | `/api/v1/admin/users/:id` | 사용자 삭제 처리 |
| `GET` | `/api/v1/admin/matches` | 매치 목록(cursored) |
| `PATCH` | `/api/v1/admin/matches/:id/status` | 매치 상태 변경 |
| `GET` | `/api/v1/admin/reviews` | 리뷰 목록 |
| `GET` | `/api/v1/admin/mercenary` | 용병 모집글 목록 |
| `DELETE` | `/api/v1/admin/mercenary/:id` | 용병 모집글 삭제 |
| `GET` | `/api/v1/admin/lessons` | 강좌 목록 |
| `POST` | `/api/v1/admin/lessons` | 강좌 생성 |
| `PATCH` | `/api/v1/admin/lessons/:id/status` | 강좌 상태 변경 |
| `GET` | `/api/v1/admin/teams` | 팀 목록 |
| `GET` | `/api/v1/admin/teams/:id` | 팀 상세 |
| `POST` | `/api/v1/admin/teams` | 팀 생성 |
| `GET` | `/api/v1/admin/venues` | 시설 목록 |
| `GET` | `/api/v1/admin/venues/:id` | 시설 상세 |
| `POST` | `/api/v1/admin/venues` | 시설 생성 |
| `PATCH` | `/api/v1/admin/venues/:id` | 시설 수정 |
| `DELETE` | `/api/v1/admin/venues/:id` | 시설 삭제 |
| `GET` | `/api/v1/admin/payments` | 결제 목록 |
| GET | /api/v1/admin/notices | 일반 공지 목록 |
| GET | /api/v1/admin/notices/:noticeId | 일반 공지 상세 |
| POST | /api/v1/admin/notices | 일반 공지 생성 |
| PATCH | /api/v1/admin/notices/:noticeId | 일반 공지 수정 |
| DELETE | /api/v1/admin/notices/:noticeId | 일반 공지 삭제 및 notice.delete 감사 로그 |
| GET | /api/v1/admin/popups | 팝업 목록 |
| GET | /api/v1/admin/popups/:popupId | 팝업 상세 |
| POST | /api/v1/admin/popups | 팝업 생성 |
| PATCH | /api/v1/admin/popups/:popupId | 팝업 수정 및 노출 화면·링크·기간 변경 |
| DELETE | /api/v1/admin/popups/:popupId | 팝업 삭제 및 popup.delete 감사 로그 |
### B. `/admin/disputes`

| Method | Path | 용도 |
|---|---|---|
| `GET` | `/api/v1/admin/disputes` | 분쟁 목록 |
| `GET` | `/api/v1/admin/disputes/:id` | 분쟁 상세 |
| `POST` | `/api/v1/admin/disputes` | 분쟁 생성 |
| `PATCH` | `/api/v1/admin/disputes/:id/status` | 분쟁 상태 업데이트 |

### C. `/admin/settlements`

| Method | Path | 용도 |
|---|---|---|
| `GET` | `/api/v1/admin/settlements` | 정산 목록 |
| `GET` | `/api/v1/admin/settlements/summary` | 정산 요약 |
| `PATCH` | `/api/v1/admin/settlements/:id/process` | 정산 처리 |

## 요청/응답 핵심 계약

### 사용자 운영

- `POST /admin/users/:id/warn`
  - Body: `WarnUserAdminDto`
  - `note` optional (max 500)
- `PATCH /admin/users/:id/status`
  - Body: `UpdateUserStatusAdminDto`
  - `status`: `active | suspended`
  - `status=suspended`일 때 `note` 사실상 필수 (없으면 400)
- `DELETE /admin/users/:id`
  - Body: `{ reason: string }`
  - v1에서는 `accountStatus=deleted`, `deletedAt` 기록, 이메일/전화번호/프로필 마스킹, auth identity unlink, provider key 마스킹, 감사 로그 기록으로 처리한다.
  - 이메일 계정과 카카오 계정 모두 원본 unique key를 비우므로 같은 이메일/카카오 계정으로 재가입할 수 있다.
  - `GET /admin/users/:id`는 `withdrawalRequest.reason`으로 사용자가 탈퇴 대기 요청 때 작성한 메시지를 노출한다.
  - 팀 정보는 생성/소유 팀, 팀장/운영진/멤버 역할 카운트, active 소속팀 목록을 분리해 제공한다.

예시:

```json
{
  "status": "suspended",
  "note": "반복 신고로 인한 임시 정지"
}
```

### 매치/강좌 상태 변경

- `PATCH /admin/matches/:id/status`: `status`는 `MatchStatus` enum만 허용
- `PATCH /admin/lessons/:id/status`: `status`는 `LessonStatus` enum만 허용

### 시설 삭제

- `DELETE /admin/venues/:id`
- 연결된 `match` 또는 `lesson`이 있으면 삭제 거부(`400`)

### 분쟁 상태 변경

- `PATCH /admin/disputes/:id/status`
- body는 DTO가 아닌 raw object
  - `status`: `pending | investigating | resolved | dismissed`
  - `resolution?`, `note?`, `actor?`

### 정산 처리

- `PATCH /admin/settlements/:id/process`
- body는 DTO가 아닌 raw object
  - `action=approve` -> `completed`
  - `action=reject` -> `failed`
  - 그 외 값 -> `processing`

## 프론트 연동 메모

- 관리자 쿼리는 대부분 `items + nextCursor` 또는 리스트 배열을 반환한다.
  - 프론트 훅은 `extractCollection`으로 배열/`items` 모두 수용하고 있음.
- 사용자 상태 변경, 매치 상태 변경, 강좌 상태 변경은 mutation 후 관련 목록/상세 query invalidation이 필요하다.
- 분쟁/정산 mutation payload는 현재 `Record<string, unknown>`로 전달된다. 폼 검증은 프론트에서 선행해야 한다.
- /admin/popups는 독립 /admin/popups API와 v1_popups 테이블만 사용한다. /admin/notices 또는 category=고정 필터를 재사용하지 않는다.
- /admin/notices는 안내/업데이트 공지만 관리하며 pinned와 display window를 전송하지 않는다.
- 관리자 회원 목록과 상세 응답은 gender: male | female | null을 포함한다. 공개 프로필에는 노출하지 않는다.
- 팝업 운영 라벨은 published=공개, archived=비공개, draft=초안이다.
- 팝업 생성/수정은 targetScreens를 최소 1개 받아야 하며, 선택적으로 linkUrl, linkLabel, displayStartAt, displayEndAt을 받는다.
- targetScreens는 home, matches, team_matches, teams, tournaments, lessons, marketplace, mercenary, venues, community, chat, notifications, profile, my 중 하나 이상이다.
- linkUrl은 /로 시작하는 내부 경로 또는 https:// URL만 허용한다. linkLabel만 단독으로 보내면 400 INVALID_POPUP_LINK다.
- 노출 종료는 시작보다 늦어야 하며 위반 시 400 INVALID_DISPLAY_WINDOW다.
- GET /popups/active?screen=...은 requested screen + published + public + active-window 조건을 만족하는 최신 팝업 하나를 반환한다.
- 홈 응답의 popup은 호환성을 위해 home target에 같은 선택 규칙을 적용하며, notices와는 별도 응답 필드다.
## 엣지 케이스 / 안티패턴

- 운영 API를 사용자 페이지 CTA와 직접 연결하지 않는다(권한 실패 + UX 혼선).
- `status` enum은 UI label과 분리해서 관리한다(라벨 문자열 전송 금지).
- `/admin/venues/:id` 삭제는 optimistic 제거를 바로 적용하지 않는다. 400 실패 가능성이 높다.

## CAUTION

- `DisputesService`는 현재 DB 영속이 아닌 메모리 배열 기반 구현이다.
  - 서버 재시작 시 상태가 유지되지 않는다.
  - 운영 화면에서는 실운영 영속 데이터로 오해될 수 있으므로 표시 copy를 분리한다.
- `/admin/disputes`와 `/admin/settlements/:id/process`는 raw-body surface다.
  - Swagger 스키마/프론트 타입만 신뢰하지 말고 실제 서비스 로직(status/action 매핑)을 기준으로 검증한다.
- 문서상 "관리자 용병 모집글 삭제", "시설 CRUD"는 운영자 도구다. venue self-service(운영자 아닌 owner 전용 콘솔)와 동일시하면 안 된다.

## Source References

- `apps/api/src/admin/admin.controller.ts`
- `apps/api/src/admin/admin.service.ts`
- `apps/api/src/admin/dto/*.ts`
- `apps/api/src/disputes/disputes.controller.ts`
- `apps/api/src/disputes/disputes.service.ts`
- `apps/api/src/settlements/settlements.controller.ts`
- `apps/api/src/settlements/settlements.service.ts`
- `apps/web/src/hooks/use-api.ts` (`useAdmin*`, `useUpdateDisputeStatus`, `useProcessSettlement`)
