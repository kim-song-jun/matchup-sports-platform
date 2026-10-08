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
응답에는 로그인 방식 메타데이터도 포함된다: `authProvider`, `authProviders`, `hasPassword`. 클라이언트는
`hasPassword`로 이메일/비밀번호 계정 컨트롤 노출 여부를 판단해야 한다(카카오 전용 계정은 비밀번호가 없다).

## Creator Profile Gate

`POST /matches`, `POST /teams`, `POST /team-matches`는 프로필에 비어있지 않은 `realName`, 저장된
`phone`, `male`/`female` `gender`가 모두 있어야 한다. 하나라도 없으면 `422
PROFILE_COMPLETION_REQUIRED`와 `details.missingFields`, `details.next.route = "/my/profile/edit"`를
반환한다. 신청·초대·채팅·리뷰·문의·프로필 수정·기존 엔티티 관리 엔드포인트는 이 게이트를 쓰지 않는다.

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
  `monthly.matchCount`(이번 KST 달에 끝난 개인 매치 참가 + 현재 공식 리비전의 팀매치 출전)는 홈 `GET /home` 의
  `summary.monthlyMatches` 와 같은 함수(`profile/activity-counts.ts` `countMonthlyGames`)로 센다 — 두 화면의 "이번 달 경기"가
  갈리지 않게 한다(Task 180 F85). 홈의 신청 대기는 숫자에 더하지 않고 `summary.pendingLabel`("대기 중인 신청 N건")로 싣는다.
- `GET /users/:userId/public-profile`은 optional auth이며 active/non-deleted 사용자만 반환한다.
- 공개 응답은 `userId`, `displayName`, `nickname`, `profileImageUrl`, `bio`, 공개 명단의 `teams`, `recentActivity`, `playerCard`, `reputation`, `activitySummary`를 포함한다. email, phone, birthDate, gender, realName은 공개하지 않는다. `displayName`은 공개 닉네임에서만 파생되며 `realName`에서 파생되지 않는다.
- `playerCard`는 카드 숨김을 켜면 `null`이다. 카드가 있으면 `stats[].value`와 `overall`은 1~99 능력치 점수이며 실제 골·도움 개수가 아니다. `records: { appearances, goals, assists } | null`은 카드와 동일한 공식 결과/신원 연결/공개 동의 게이트를 통과한 원본 집계다. 공개 동의가 없으면 `records=null`이며, 1~2경기로 골·도움 능력치가 잠겨 있어도 동의한 원본 집계는 반환한다. `appearances`는 gameId 기준 중복 제거 수다. 본인/타인 모두 같은 카드 계약을 쓰며, 본인 기록 목록의 동의 우회를 카드 원본 집계에 적용하지 않는다. 구 API에 `records` 필드가 없으면 클라이언트는 원본 수치를 추정하거나 0으로 표시하지 않는다.
- `reputation`은 `mannerScore`, `reviewCount`, `trustState`에 더해 `highlight`(`tagCode`, `label`, `rate`
  0-1, `reviewCount`)를 포함한다. `highlight`는 `mannerScore`와 같은 리뷰 중 가장 많이 공개된 태그이며,
  서로 다른 리뷰어 3명 미만이면 `null`이다(2명 이하 평가로 비율을 단정하지 않기 위함). `GET
  /teams/:teamId/reviews`도 팀에 대해 같은 `highlight`를 반환한다.
- 공개 `activitySummary`는 누적 match/team/review 수와 이번 달 match/team join/review 수를 구분한다.
- 사용자가 선택하는 프로필 공개 범위 설정은 v1 계약에 없다 — 클라이언트는 공개 프로필 데이터를
  "필드 단위로 공개 안전"하다고 취급해야지, 사용자가 고른 공개 상태로 취급하면 안 된다.

## 설정·선호

### `GET/PATCH /me/settings`

- 조회 응답은 `account`, `profile`, `notifications`를 반환한다.
- `UpdateSettingsDto.notifications`의 선택 boolean 필드: `activityEnabled`, `matchEnabled`, `teamEnabled`, `teamMatchEnabled`, `chatEnabled`, `noticeEnabled`, `marketingEnabled`.
- 사용자 화면의 경기·대회 스위치는 `matchEnabled`, `teamMatchEnabled`, `activityEnabled`를 함께 갱신한다.
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
- 서비스는 사용자 행을 `FOR UPDATE`로 잠근 뒤 최신 계정 상태와 운영자 상태를 다시 확인하고, 상태 변경·활성 멤버십/로스터 정리·웹 Push 구독 삭제·네이티브 Push 기기 revoke·`V1StatusChangeLog` 기록을 같은 트랜잭션에서 처리한다.
- active 운영자는 이 self-service 경로로 사용자 계정을 비활성화할 수 없다. owner가 먼저 운영자 접근을 revoke해야 하며, 위반하면 `403 ADMIN_WITHDRAWAL_FORBIDDEN`이다.
- 성공 응답은 `{ userId, accountStatus: "withdrawal_pending", requestedAt }`이다.
- 탈퇴 요청이 성공하면 응답과 함께 `teameet_v1_session` 쿠키를 만료한다. 요청이 거부되거나 실패하면 세션 쿠키는 유지된다.
- 서버 트랜잭션이 성공한 뒤 해당 사용자의 모든 실시간 user-room 연결을 끊는다. 탈퇴 대기 계정의 새 연결은 handshake에서 거부한다. 트랜잭션이 실패하면 기존 연결을 유지한다.
- DB commit 이후 연결 해제가 실패하면 원인을 오류 로그에 남기고 이미 확정된 탈퇴 상태와 성공 응답은 보존한다. 연결 인증 중 탈퇴가 진행되는 경우를 막기 위해 user-room 합류 직후에도 최신 계정 상태를 확인한다.
- 웹 클라이언트는 성공 즉시 세션 힌트·사용자 캐시·소켓을 정리하고 기기의 Push 구독 해제를 시작한다. 서버 트랜잭션이 웹 Push 행을 이미 삭제했으므로 브라우저는 추가 삭제 API를 호출하지 않는다. 구독 해제가 끝나면 `/login` 문서를 새로 열며, 응답이 멈추면 1.5초 타이머가 이동을 실행한다. 이동까지 재요청 버튼은 잠기고, 요청 중 화면을 떠나도 성공 정리는 이어진다. 로컬 정리 실패는 경고로 기록하며 서버의 성공 결과를 탈퇴 실패로 바꾸지 않는다. 로그인 진입 시 만료된 세션을 정리하다 저장소 오류가 발생해도 경고를 기록한 뒤 로그인 폼을 표시한다.
- 탈퇴 응답이 유실되거나5xx이면1.5초 제한의 실제 세션 확인을 수행한다. 재시도가 계정 이용 제한403 `PERMISSION_DENIED`로 거부되어도 같은 확인을 수행하여, 첫 확인 이후 늦게 commit된 탈퇴를 처리한다. 유효 세션이면 기존 계정 정보와 오류·재시도 동선을 유지한다. 미인증401 또는 계정 이용 제한403 `PERMISSION_DENIED`가 확인되면 제한 시간 안에 로그아웃을 시도하고 브라우저를 게스트 상태로 정리한다. 이 경로는 탈퇴 상태를 확인했다고 표시하지 않는다. 결과를 확인하지 못하면 경고를 기록하고 기존 세션을 보존한다. 로그인 화면은 해당 계정 제한 코드에서도 폼을 표시하되 가입 미완료·약관 재동의 등 다른403 상태는 구분한다.
- 관리자 최종 삭제는 FCM/APNs 토큰과 웹 Push endpoint를 영구 제거하고, 프로필의 실명·생년월일·성별·표시 지역 및 활동 지역·선호 종목·검색 기록·인증 토큰을 삭제 또는 비식별화한다. 완료 경기·결제·분쟁·감사 기록처럼 별도 보관 근거가 있는 데이터는 해당 정책을 따른다.

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

Public activity summary integration (2026-08-20):

- The totals response distinguishes match, tournament, team, and review
  counts. The monthly response distinguishes match, tournament, team join,
  and review counts.
- `matchCount` counts distinct games and `tournamentCount` counts distinct
  tournaments, both derived from the same single pass over the viewed user's
  current official tournament participant results. A user who played five
  games in one tournament therefore reads as five games and one tournament.
- Both counts follow the identity link (`V1ParticipantIdentityLinkCurrent`)
  only. Unlike `GET /users/:id/records`, they are aggregate counts and are
  **not** filtered by the per-user record consent gate; keep that in mind
  before treating either number as consent-scoped.

- `apps/v1_api/src/profile/profile.controller.ts`
- `apps/v1_api/src/profile/profile.service.ts`
- `apps/v1_api/src/profile/dto/profile.dto.ts`
- `apps/v1_web/src/hooks/use-v1-api.ts`
- `apps/v1_web/src/types/api.ts`
