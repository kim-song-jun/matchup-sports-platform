# Domain Contract - Team Matches


## Task 168 Phase 3 canonical source addendum (candidate)

- A TeamMatch owns the canonical Game identity for tournament, regular-league, and friendly flows. Existing fixture-shaped URLs and `fixtureId` response fields continue to carry the same TeamMatch UUID for compatibility.
- Result correction and public record projections follow the Game current official revision; a correction does not change the TeamMatch start time or create a second appearance.
- This is a contract candidate pending the selected API overlay review; it does not claim Alpha migration completion.

## Endpoint Matrix

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/team-matches` | No | 모집글 목록 |
| GET | `/team-matches/me/applications` | Yes | 내가 신청한 팀매칭 목록 |
| GET | `/team-matches/:id` | No | 모집글 상세 |
| POST | `/team-matches` | Yes | 모집글 생성 |
| PATCH | `/team-matches/:id` | Yes | 모집글 수정 또는 취소 |
| GET | `/team-matches/:id/applications` | Yes | 신청 목록 조회 (호스트 team manager+) |
| POST | `/team-matches/:id/applications` | Yes | 다른 팀이 모집글에 신청 |
| PATCH | `/team-matches/:id/applications/:appId/approve` | Yes | 신청 승인 |
| PATCH | `/team-matches/:id/applications/:appId/reject` | Yes | 신청 거절 |
| POST | `/team-matches/:id/check-in` | Yes | 도착 인증 |
| POST | `/team-matches/:id/result` | Yes | 결과 입력 |
| POST | `/team-matches/:id/evaluate` | Yes | 상대 팀 평가 |
| GET | `/team-matches/:id/referee-schedule` | Yes | 심판 배정 조회 |
| POST | `/admin/team-matches` | Admin owner/ops | 플랫폼 팀매치 모집 생성 |
| POST | `/admin/team-matches/:id/assign` | Admin owner/ops | 신청한 두 팀을 홈·원정으로 확정 |

## POST /admin/team-matches

플랫폼 운영자가 팀을 미리 지정하지 않고 공개 모집을 여는 별도 생성 경로다. 일반 팀 owner/manager의 `POST /team-matches` 계약과 기존 신청 API는 변경하지 않는다.

Required body:

- `clientCommandId` (UUID, 재시도 멱등 키)
- `sportId` (활성 종목)
- `regionId` (활성 시·군·구)
- `title`, `startsAt`, `manualPlaceName`

Optional body: `description`, `imageUrl`, `endsAt`, `deadlineAt`, `addressText`, `costNote`, `rulesText`, `minLevelCode`, `maxLevelCode`, `genderRule`, `matchFormat`, `matchStyle`, `uniformColor`.

Rules:

- active `owner` 또는 `ops` admin만 생성할 수 있으며 `support`는 `403 PERMISSION_DENIED`다.
- 생성된 행은 `hostTeamId=null`, `status=recruiting`인 독립 플랫폼 모집이다.
- 조건 필드는 일반 팀매치 모집과 같은 검증·저장 계약을 사용한다. web은 총 비용/상대팀 비용을 일반 생성 화면과 같은 `총 {금액}원 · 상대팀 {금액}원` 형식의 `costNote`로 보낸다.
- `deadlineAt`은 일반 모집처럼 선택 사항이며 입력한 경우 현재보다 이후이고 `startsAt`보다 빨라야 한다.
- 생성 시 Game, team schedule, application을 만들지 않는다.
- 공개 목록/상세 응답은 `platformManaged=true`, `hostTeam=null`을 반환하며 같은 종목의 관리 팀이 `POST /team-matches/:id/applications`로 신청할 수 있다.
- 같은 `clientCommandId`와 같은 payload 재시도는 기존 결과를 반환한다. 같은 키의 다른 payload는 `409 IDEMPOTENCY_CONFLICT`다.
- 성공 응답은 `teamMatchId`, `status=recruiting`, `detailRoute`(관리자 상세), `replayed`를 포함한다.

## POST /admin/team-matches/:id/assign

플랫폼 모집에 접수된 신청 중 두 개를 홈·원정으로 선택해 경기를 확정한다.

Required body:

- `clientCommandId` (UUID, 재시도 멱등 키)
- `homeApplicationId`, `awayApplicationId` (서로 다른 `requested` 신청)

Rules:

- 대상은 `hostTeamId=null`, 리그·토너먼트에 속하지 않은 `recruiting` 플랫폼 모집이어야 한다.
- 두 신청 팀은 활성 상태이고 모집 종목과 같아야 하며 서로 달라야 한다.
- 성공 시 홈 팀을 `hostTeamId`, 원정 팀을 `approvedApplicantTeamId`로 연결하고 팀매치를 `matched`로 바꾼다.
- 선택한 두 신청은 `approved`, 나머지 `requested` 신청은 `rejected`로 전환한다.
- Game HOME/AWAY side, 양 팀 schedule, application/team-match 상태 로그, admin action log를 한 트랜잭션에서 생성한다.
- 성공 응답은 `teamMatchId`, `gameId`, `homeTeamId`, `awayTeamId`, `detailRoute`, `replayed`를 포함한다.

## GET /team-matches

Query:

| Field | Type | Required | Notes |
|---|---|---|---|
| `sportId` | uuid | No | `v1_master_sports.id` |
| `query` | string | No | title/description/place/team 검색 |
| `genderRule` | string | No | `성별 무관`, `남`, `여` |
| `levelCodes` | comma string | No | `beginner,novice,intermediate,advanced` 중 다중 선택 |
| `status` | recruiting/closed/matched/cancelled/completed/expired | No | 기본 recruiting |
| `teamId` | uuid | No | host 또는 applicant team 기준 |
| `sort` | recommended/latest/starts_at/deadline | No | 기본 latest |
| `cursor` | string | No | cursor pagination |
| `limit` | int(1~50) | No | default 20 |

Rules:

- `status`를 생략한 일반 탐색은 경기 시작 전인 `recruiting`, `closed`, `matched`를 포함한다.
- 기본 목록은 `createdAt DESC, id DESC` 최신 생성순이다. 명시적인 `recommended`/`deadline`/`starts_at`은 경기 시작 임박순으로 처리한다.
- 일반 목록에서는 신청 마감이 지났거나 raw status가 `closed`/`matched`인 항목도 경기 시작 전까지 신청마감으로 노출하고, 경기 시작 시각 이후에는 제외한다.
- `sort=recommended`는 경기 시작 전인 raw `recruiting` 중 신청 마감이 없거나 아직 지나지 않은 항목만 포함한다.
- `teamId`는 `hostTeamId = teamId` 또는 `applications.some(applicantTeamId = teamId)` 둘 중 하나를 만족하면 포함
- Level response fields: `levelLabel`, `minLevel`, `maxLevel`
- List and detail responses include `hostTeam.mannerScore` and `hostTeam.wins`.
  - `mannerScore` is the live aggregate of publicly revealed team-match reviews and is `null` when no score is publishable.
  - `wins` counts only the team's current official result facts whose result is `WON`; draft and superseded revisions are excluded.

## POST /team-matches

Body: `CreateTeamMatchDto`

Required:

- `hostTeamId`
- `sportId`
- `regionId`
  - Required non-empty string; accepts stable catalog slugs such as `region-seoul-jongno`.
- `title`
- `startsAt`
- `manualPlaceName`

Optional level fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| `minLevelCode` | level code | No | `beginner`, `novice`, `intermediate`, `advanced` |
| `maxLevelCode` | level code | No | same |

- `minLevelCode === maxLevelCode`는 단일 레벨 조건으로 유효하다.
- `minLevelCode`가 `maxLevelCode`보다 높은 단계면 `400 VALIDATION_FAILED`.

Rules:

- `hostTeamId`에 대해 요청자는 `manager+`여야 한다
- 생성자는 `realName`, `phone`, `gender`가 모두 있는 creator profile을 가져야 한다.
- `sportId`는 host team의 단일 `sportId`와 같아야 하며, 다르면 `400 VALIDATION_FAILED`를 반환한다.
- `imageUrl`은 선택 사항이다. web create/edit는 `/uploads`가 반환한 루트 상대 URL만 저장하고, 미선택 상태를 `null`로 보낸다.
- `deadlineAt`은 선택 사항이며 `startsAt`보다 빨라야 한다. `v1_team_matches.deadline_at`에 저장되고 목록·상세·수정 응답에 동일하게 반환된다.

## PATCH /team-matches/:id

Body: `UpdateTeamMatchDto`

Supported behaviors:

### 1. 모집글 수정

- 모집글 성격의 필드만 부분 수정 가능
- 요청자는 host team `manager+`
- match status가 `recruiting`일 때만 수정 가능

대표 수정 필드:

- `title`, `description`
- `imageUrl` (업로드 URL 또는 제거 시 `null`)
- `startsAt`, `endsAt`, `deadlineAt`
- `manualPlaceName`, `addressText`
- `costNote`, `rulesText`, `genderRule`
- `minLevelCode`, `maxLevelCode`

### 2. 모집글 취소

- body는 `{ "status": "cancelled" }`
- 요청자는 host team `manager+`
- `recruiting`, `scheduled` 상태에서만 취소 가능
- `checking_in`, `in_progress`, `completed` 이후는 취소 불가

Errors:

- `403`: host team 권한 없음
- `404`: team-match 없음
- `409`: 현재 상태에서는 수정/취소 불가

## POST /team-matches/:id/apply

Body: `ApplyTeamMatchDto`

| Field | Type | Required |
|---|---|---|
| `applicantTeamId` | uuid | Yes |
| `message` | string | No |
| `confirmedInfo` | boolean | No |
| `confirmedLevel` | boolean | No |
| `proPlayerCheck` | boolean | No |
| `mercenaryCheck` | boolean | No |

Rules:

- match status가 `recruiting`이어야 한다
- applicant team에 대해 요청자는 `manager+`

Errors:

- `409`: 같은 팀이 같은 모집글에 중복 신청

## Approve / Reject

### PATCH /team-matches/:id/applications/:appId/approve

- host team `manager+`만 가능
- match status가 `recruiting`이어야 한다
- 승인 시
  - 해당 신청은 `approved`
  - match status는 `scheduled`
  - `guestTeamId` 확정
  - 나머지 pending 신청은 자동 `rejected`
  - team-match chat room 생성

### PATCH /team-matches/:id/applications/:appId/reject

- host team `manager+`만 가능
- 해당 신청만 `rejected`

## POST /team-matches/:id/check-in

Body:

| Field | Type | Required |
|---|---|---|
| `teamId` | uuid | Yes |
| `lat` | number | No |
| `lng` | number | No |
| `photoUrl` | string | No |

Rules:

- status는 `scheduled`, `checking_in`, `in_progress` 중 하나
- host 또는 guest team만 가능
- 해당 team `member+`
- 같은 team 중복 check-in 불가
- venue 좌표가 있으면 200m geo-fence 검사

## POST /team-matches/:id/result

- 참가 team `manager+`만 가능
- status는 `scheduled`, `checking_in`, `in_progress` 중 하나
- `guestTeamId`가 확정된 경기만 가능

Body:

| Field | Type | Required |
|---|---|---|
| `scoreHome` | object (`Q1..Qn`) | Yes |
| `scoreAway` | object (`Q1..Qn`) | Yes |
| `resultHome` | `win/draw/lose` | Yes |
| `resultAway` | `win/draw/lose` | Yes |

Validation:

- quarter 수와 점수 map 길이 일치
- 점수와 승/무/패 결과 일치

Success:

- match status -> `completed`
- badge 지급 트리거

## POST /team-matches/:id/evaluate

- match status가 `completed`일 때만 가능
- evaluator team `member+`
- evaluator / evaluated가 같은 team이면 불가
- evaluator team 기준 중복 평가 불가

## Frontend Mapping Notes

- user-facing status vocabulary는 `recruiting`, `scheduled`, `checking_in`, `in_progress`, `completed`, `cancelled` 기준으로 맞춘다
- `/my/team-matches`, `/teams/:id/matches`는 history 조회 시 다중 `status` query를 명시적으로 넘겨야 한다
- edit/cancel UI는 `PATCH /team-matches/:id`를 사용한다
- 목록 필터 URL은 `levelCodes`를 canonical source로 사용한다. legacy `levels` query는 읽기 호환만 유지한다.
- 레벨 표시 텍스트는 `formatNote`가 아니라 `minSportLevelId`, `maxSportLevelId` FK에서 계산한 `levelLabel`을 사용한다.

## Source References

- `apps/v1_api/src/team-matches/team-matches.controller.ts`
- `apps/v1_api/src/team-matches/team-matches.service.ts`
- `apps/v1_api/src/team-matches/dto/*.ts`
- `apps/v1_api/src/sports/level-range.ts`
- `apps/v1_web/src/hooks/use-v1-api.ts`
- `apps/v1_web/src/types/api.ts`
