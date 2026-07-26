# Domain Contract — Users

## 범위와 Source of Truth

이 문서는 v1 `ProfileController`가 실제로 노출하는 프로필·설정·탈퇴 계약을 다룬다.

1. `apps/v1_api/src/profile/profile.controller.ts`
2. `apps/v1_api/src/profile/dto/profile.dto.ts`
3. `apps/v1_api/src/profile/profile.service.ts`
4. `apps/v1_web/src/hooks/use-v1-api.ts`
5. `apps/v1_web/src/types/api.ts`

## Endpoint Matrix

| Method | Path | Auth | DTO | 설명 |
|---|---|---|---|---|
| `GET` | `/api/v1/me/profile` | Required | - | 내 전체 프로필 |
| `GET` | `/api/v1/me/activity-summary` | Required | - | 내 활동 요약 |
| `PATCH` | `/api/v1/me/profile` | Required | `UpdateProfileDto` | 내 프로필 수정 |
| `GET` | `/api/v1/users/:userId/public-profile` | Optional | - | 공개 프로필 |
| `GET` | `/api/v1/me/settings` | Required | - | 계정·알림 설정 |
| `PATCH` | `/api/v1/me/settings` | Required | `UpdateSettingsDto` | 알림 설정 수정 |
| `PATCH` | `/api/v1/me/regions` | Required | `UpdateMyRegionsDto` | 대표 활동 지역 수정 |
| `PATCH` | `/api/v1/me/preferences` | Required | `UpdateMyPreferencesDto` | 종목·지역 선호 전체 동기화 |
| `POST` | `/api/v1/auth/logout` | Controller guard 없음 | - | 세션 로그아웃 응답 |
| `POST` | `/api/v1/me/withdrawal-request` | Required | `WithdrawalRequestDto` | 탈퇴 대기 요청 |

## 프로필 조회·수정

### `GET /me/profile`

현재 사용자의 계정, 프로필, 종목 선호, 지역, 평판 snapshot을 반환한다. deleted 계정은 조회 대상이 아니며, mutable profile API는 active 계정만 허용한다.

### `PATCH /me/profile`

`UpdateProfileDto`:

| 필드 | 타입 | 필수 | 규칙 |
|---|---|---|---|
| `realName` | string or null | No | 최대 40자 |
| `displayName` | string or null | No | rolling-deploy 호환용 deprecated 입력, 최대 40자 |
| `nickname` | string | Yes | 2~40자 |
| `email` | string or null | No | 3~320자; password 계정은 최종 email 필수 |
| `profileImageUrl` | string or null | No | 문자열 |
| `phone` | string or null | No | 숫자 11자리 |
| `birthDate` | string or null | No | 유효한 `YYYYMMDD` 숫자 8자리 |
| `gender` | `male | female` | Yes | 필수 |

- `realName`이 없으면 호환 입력 `displayName`을 사용한다.
- email/phone 변경 시 해당 verified 시각을 비운다.
- 중복 값은 각각 `409 EMAIL_CONFLICT`, `PHONE_CONFLICT`, `NICKNAME_CONFLICT`다.
- 성공 응답은 `{ profile, updatedAt }`이다.

## 활동·공개 프로필

- `GET /me/activity-summary`는 `totals: { activityCount, teamCount, mannerScore }`와 `monthly: { matchCount, mannerScore, winRate }`를 반환한다.
- `GET /users/:userId/public-profile`은 optional auth이며 active/non-deleted 사용자만 반환한다.
- 공개 응답은 `userId`, `displayName`, `nickname`, `profileImageUrl`, `reputation`, `activitySummary`만 포함한다. email, phone, birthDate, gender, realName은 공개하지 않는다.
- 공개 `activitySummary`는 누적 match/team/review 수와 이번 달 match/team join/review 수를 구분한다.

## 설정·선호

### `GET/PATCH /me/settings`

- 조회 응답은 `account`, `profile`, `notifications`를 반환한다.
- `UpdateSettingsDto.notifications`의 선택 boolean 필드: `matchEnabled`, `teamEnabled`, `teamMatchEnabled`, `chatEnabled`, `noticeEnabled`, `marketingEnabled`.
- 수정 응답은 `{ profile, notifications, updatedAt }`이다.

### `PATCH /me/regions`

```json
{
  "regionId": "uuid"
}
```

- active 2단계 지역만 허용한다.
- 기존 대표 지역을 해제한 뒤 요청 지역을 대표로 upsert한다.
- 성공 응답은 `{ region: { regionId, name }, updatedAt }`이다.

### `PATCH /me/preferences`

```json
{
  "sports": [
    { "sportId": "uuid", "levelId": "uuid" }
  ],
  "regions": [
    { "regionId": "uuid", "primary": true }
  ]
}
```

- `sports[].sportId`, `regions[].regionId` 중복은 허용하지 않는다.
- `regions[].primary=true`는 최대 1개다. 하나도 없으면 첫 지역이 대표가 된다.
- 요청 배열은 기존 선호를 대체하는 전체 동기화 계약이다.
- 성공 응답은 정규화된 `sports`, `regions`, `updatedAt`이다.

## 탈퇴 요청과 운영자 불변식

`POST /api/v1/me/withdrawal-request` body:

```json
{
  "reason": "서비스를 더 이상 이용하지 않음"
}
```

- `reason`은 선택 문자열 또는 null, 최대 500자다.
- 현재 `accountStatus=active`인 사용자만 `withdrawal_pending`으로 전이할 수 있다.
- 서비스는 사용자 행을 `FOR UPDATE`로 잠근 뒤 최신 계정 상태와 운영자 상태를 다시 확인하고, 상태 변경과 `V1StatusChangeLog` 기록을 같은 트랜잭션에서 처리한다.
- active 운영자는 이 self-service 경로로 사용자 계정을 비활성화할 수 없다. owner가 먼저 운영자 접근을 revoke해야 하며, 위반하면 `403 ADMIN_WITHDRAWAL_FORBIDDEN`이다.
- 성공 응답은 `{ userId, accountStatus: "withdrawal_pending", requestedAt }`이다.

## Permission / Error Rules

- `/me/*` 프로필·설정·탈퇴 경로는 `V1AuthGuard` 인증이 필요하다.
- public profile은 `OptionalV1AuthGuard`를 사용한다.
- active가 아닌 계정의 mutable 작업은 `403 PERMISSION_DENIED`다.
- active admin 탈퇴 요청은 `403 ADMIN_WITHDRAWAL_FORBIDDEN`이다.
- 없는/비활성/삭제 사용자의 공개 프로필은 `404 NOT_FOUND`다.
- DTO에 없는 필드는 전역 `whitelist + forbidNonWhitelisted` 정책에 따라 거부된다.

## Frontend Mapping Notes

- 프론트의 profile/settings/preferences/withdrawal 호출은 `apps/v1_web/src/hooks/use-v1-api.ts`의 실제 `/me/*` 경로를 기준으로 한다.
- 내 프로필과 공개 프로필은 응답 shape가 다르므로 동일한 완전 타입으로 가정하지 않는다.
- `PATCH /me/preferences`는 partial patch가 아니라 전체 배열 교체이므로 현재 선택 전체를 전송한다.

## Source References

- `apps/v1_api/src/profile/profile.controller.ts`
- `apps/v1_api/src/profile/profile.service.ts`
- `apps/v1_api/src/profile/dto/profile.dto.ts`
- `apps/v1_web/src/hooks/use-v1-api.ts`
- `apps/v1_web/src/types/api.ts`
