# Domain Contract — Supporting Domains

## 범위

낮은 호출 빈도지만 프론트 통합 시 누락되기 쉬운 지원 도메인 계약을 정리한다.

- `reviews`
- `reports`
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
| `badges` | `/api/v1/badges`, `/api/v1/badges/team/:teamId` |
| `users/blocks` | `/api/v1/users/blocks`, `/api/v1/users/blocks/:blockedId` |
| `tournaments` | `/api/v1/tournaments`, `/api/v1/tournaments/:id` |
| `health` | `/api/v1/health` |
| `venue reviews` | `/api/v1/venues/:id/reviews` |

## 1) Reviews (`/reviews`)

### 엔드포인트

| Method | Path | Auth | 용도 |
|---|---|---|---|
| `POST` | `/api/v1/reviews` | Required | 동료 평가 작성 |
| `GET` | `/api/v1/reviews/pending` | Required | 미작성 평가 목록 |

### 계약 포인트

- `POST /reviews` body는 DTO가 아니라 `Record<string, unknown>`로 받는다.
- 서비스에서 기대하는 필드:
  - `matchId`, `targetId`, `skillRating`, `mannerRating`, `comment?`
- 생성 후 대상 사용자 `mannerScore` 재계산과 ELO 업데이트(side effect)가 발생한다.

### CAUTION

- weakly typed surface다. 프론트는 payload 스키마를 로컬에서 강하게 검증해야 한다.

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

## 3) Badges (`/badges`)

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
| `GET` | `/api/v1/tournaments` | Optional | 대회 목록(cursor) |
| `GET` | `/api/v1/tournaments/:id` | Optional | 대회 상세 |
| `POST` | `/api/v1/tournaments` | Required | 대회 생성 |

### 쿼리/DTO 계약

- `TournamentQueryDto`
  - `sportType?`, `status?`, `teamId?`, `venueId?`, `cursor?`, `limit?(1~100)`
- 기본 상태 필터:
  - status 미지정 시 `recruiting | full | ongoing`만 노출

- `CreateTournamentDto`
  - 필수: `sportType`, `title`, `startDate`, `endDate`
  - 선택: `description`, `entryFee`, `maxParticipants`, `teamId`, `venueId`

### 권한/상태 게이트

- `teamId` 지정 시 팀 `manager` 이상 권한 필요
- `venueId` 지정 시 `admin` 또는 해당 venue `ownerId`만 가능
- `teamId`와 `venueId` 동시 지정 불가 (`400`)
- `endDate < startDate` 불가 (`400`)

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

1. DTO 없는 endpoint(`reviews`, `badges/team`, `venues/:id/reviews`)는 요청 타입을 프론트 내부에서 강제한다.
2. `message`는 문자열/배열 혼합 가능성이 있으므로 UI 에러 변환기를 공통 사용한다.
3. admin 경로(`/admin/reports`)는 일반 사용자 shell에서 라우팅하지 않는다.
4. tournament 쿼리의 `limit`은 숫자 문자열로 전달해도 되지만, 프론트는 명시적으로 숫자 범위를 통제한다.

## Source References

- `apps/api/src/reviews/reviews.controller.ts`, `reviews.service.ts`
- `apps/api/src/reports/reports.controller.ts`, `reports.service.ts`, `reports/dto/report.dto.ts`
- `apps/api/src/badges/badges.controller.ts`, `badges.service.ts`
- `apps/api/src/user-blocks/user-blocks.controller.ts`, `user-blocks.service.ts`, `user-blocks/dto/user-block.dto.ts`
- `apps/api/src/tournaments/tournaments.controller.ts`, `tournaments.service.ts`, `tournaments/dto/*.ts`
- `apps/api/src/health/health.controller.ts`
- `apps/api/src/venues/venues.controller.ts`
- `apps/web/src/hooks/use-api.ts`
