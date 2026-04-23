# Domain Contract - Team Matches

## Endpoint Matrix

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/team-matches` | No | 모집글 목록 |
| GET | `/team-matches/me/applications` | Yes | 내가 신청한 팀매칭 목록 |
| GET | `/team-matches/:id` | No | 모집글 상세 |
| POST | `/team-matches` | Yes | 모집글 생성 |
| PATCH | `/team-matches/:id` | Yes | 모집글 수정 또는 취소 |
| GET | `/team-matches/:id/applications` | Yes | 신청 목록 조회 (호스트 team manager+) |
| POST | `/team-matches/:id/apply` | Yes | 다른 팀이 모집글에 신청 |
| PATCH | `/team-matches/:id/applications/:appId/approve` | Yes | 신청 승인 |
| PATCH | `/team-matches/:id/applications/:appId/reject` | Yes | 신청 거절 |
| POST | `/team-matches/:id/check-in` | Yes | 도착 인증 |
| POST | `/team-matches/:id/result` | Yes | 결과 입력 |
| POST | `/team-matches/:id/evaluate` | Yes | 상대 팀 평가 |
| GET | `/team-matches/:id/referee-schedule` | Yes | 심판 배정 조회 |

## GET /team-matches

Query:

| Field | Type | Required | Notes |
|---|---|---|---|
| `sportType` | enum | No | 종목 필터 |
| `city` | string | No | `hostTeam.city` 기준 |
| `status` | string | No | 단일 status 또는 comma-separated status list |
| `teamId` | uuid | No | host 또는 applicant team 기준 |
| `cursor` | string | No | cursor pagination |
| `limit` | int(1~100) | No | default 20 |

Rules:

- `status`를 생략하면 기본값은 `recruiting`
- `status=scheduled,completed,cancelled`처럼 다중 조회 가능
- `teamId`는 `hostTeamId = teamId` 또는 `applications.some(applicantTeamId = teamId)` 둘 중 하나를 만족하면 포함

## POST /team-matches

Body: `CreateTeamMatchDto`

Required:

- `hostTeamId`
- `sportType`
- `title`
- `matchDate`
- `startTime`
- `endTime`
- `venueName`
- `venueAddress`

Rules:

- `hostTeamId`에 대해 요청자는 `manager+`여야 한다
- 심판이 없는 경우 `quarterCount` 기준 기본 referee schedule을 생성한다

## PATCH /team-matches/:id

Body: `UpdateTeamMatchDto`

Supported behaviors:

### 1. 모집글 수정

- 모집글 성격의 필드만 부분 수정 가능
- 요청자는 host team `manager+`
- match status가 `recruiting`일 때만 수정 가능

대표 수정 필드:

- `title`, `description`
- `matchDate`, `startTime`, `endTime`, `quarterCount`
- `venueName`, `venueAddress`, `venueInfo`
- `totalFee`, `opponentFee`
- `requiredLevel`, `matchStyle`, `allowMercenary`, `hasReferee`
- `skillGrade`, `gameFormat`, `matchType`, `proPlayerCount`, `uniformColor`, `notes`

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

## Source References

- `apps/api/src/team-matches/team-matches.controller.ts`
- `apps/api/src/team-matches/team-matches.service.ts`
- `apps/api/src/team-matches/dto/*.ts`
- `apps/api/test/integration/team-matches.e2e-spec.ts`
- `apps/web/src/hooks/api/use-team-matches.ts`
- `apps/web/src/types/api.ts`
