# Domain Contract - Team Matches

## V1 친선 팀매치 공동 경기 기록 (Task 172)

이 절은 `apps/v1_api/src/team-matches/team-match-record.controller.ts` / service / DTO와
`apps/v1_web/src/hooks/use-team-match-record.ts` 기준의 신규 계약이다. 기존 리그·대회 운영 경로와
이미 결과 revision이 있는 친선 경기의 기존 제출·승인 경로는 보존한다.

| Method | Path | 권한 | 동작 |
|---|---|---|---|
| GET | `/api/v1/team-matches/:id/record` | OptionalV1AuthGuard | 공동 기록·서버 시각·편집 가능 여부 조회 |
| POST | `/api/v1/team-matches/:id/record` | V1AuthGuard + 최신 유효 제출 라인업 참가자 | 득점 추가/수정/삭제/복구, 종료 확인/취소 |

- 응답은 공통 `{ status, data, timestamp }`. `phase`: scheduled/live/official/cancelled/legacy/managed.
- GET은 일반 사용자에게 점수·팀·확정 여부만 반환한다. 선수 명단·득점 상세·이력·확인자 이름은 참가자에게만 반환한다.
- 편집자는 최신 제출/잠금 라인업의 `userId` 또는 검증된 현재 identity link로 판정한다. 팀 owner/manager 역할만으로 권한을 부여하지 않는다. 양쪽 라인업에 동시에 있는 계정은 확인자로 인정하지 않는다.
- `commandId` UUID와 `expectedVersion` 정수 필수. `action`: add/edit/delete/undo/confirm/reopen.
- add/edit: `sideId`는 점수를 얻는 팀. `participantId`는 선택(null=미상), `ownGoal` 기본 false,
  `minute` 선택(null 또는 0..999 정수). 자책골 선수는 점수를 얻는 팀의 상대편 라인업에서 고른다.
- edit/delete는 `goalId`, undo는 `changeId`. undo는 대상 변경 이후 해당 골이 다시 바뀌었으면 409로 거부한다.
- 점수는 현재 득점 기록 개수로만 계산한다. 이력에는 주체·시각·전후 값이 영속되며 GET은 최근 100건을 반환한다.
- 같은 commandId/사용자/payload 재전송은 재실행 없이 최신 상태를 반환한다. 다른 payload/사용자의 키 재사용은 409.
- Game row lock + record version으로 동시 수정 유실을 방지한다. stale version은 409 `VERSION_CONFLICT`.
- 득점 변경/복구/reopen은 기존 양 팀 확인을 초기화한다. 같은 팀의 중복 confirm은 409.
- 두 팀의 서로 다른 라인업 참가자가 확인하면 같은 트랜잭션에서 Game 결과 DRAFT→SUBMITTED→OFFICIAL,
  result participants/goalEvents/decisions, TeamMatch 완료·팀 일정 cascade, `GAME_RESULT_OFFICIAL` outbox를 기록한다.
- 확정 후 일반 편집은 409. 기존 관리자 정정으로 새로운 결과 revision이 생기면 기존 결과 화면을 사용한다.
- 공동 기록이 생성된 경기에서 이전 host-only 결과/event/진행 command를 호출하면 `SHARED_RECORD_REQUIRED`.
- 주요 오류: 403 RECORD_PARTICIPANT_REQUIRED; 404 TEAM_MATCH_NOT_FOUND;
  409 RECORD_NOT_EDITABLE/VERSION_CONFLICT/COMMAND_REUSED/ALREADY_CONFIRMED/GOAL_NOT_FOUND;
  422 PARTICIPANT_INVALID. DTO 이외 필드는 ValidationPipe에서 거부한다.
- 상대 확정 + 시작 시각 경과는 조회 시 서버 시각으로 판단한다. API 목록/상세 `isLive`는 표시용 파생값이며
  DB status `matched`의 신청/권한 의미는 바꾸지 않는다. 종료 예정 시각만으로 결과를 확정하지 않는다.
- 기본/추천 목록은 진행 중인 matched 경기까지 유지한다. 명시적 recruiting 필터는 기존 모집 조건을 유지한다.
- UI는 진행 중 2초, 경기 전 15초 polling 및 창 focus 시 재조회. 자동 저장 성공을 시뮬레이션하지 않는다.
- 참가자는 상세 진입 시 `/team-matches/:id/record`로 이동. `?view=detail`로 장소/라인업 상세 복귀.
  기존 `/result`, `/result/approval`도 신규 친선 경기에서는 공동 기록을 연다.
- 신규 테이블: `V1TeamMatchRecord`, `V1TeamMatchRecordChange`; migration `20260921160000_v1_team_match_shared_record`.



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

플랫폼 운영자가 팀을 미리 지정하지 않고 공개 모집을 여는 별도 생성 경로다. 일반 팀 owner/manager 생성과 주최/확정 방식은 다르지만 경기 조건과 날짜 검증은 동일하다.

Required body:

- `clientCommandId` (UUID, 재시도 멱등 키)
- `sportId` (활성 종목)
- `regionId` (활성 시·군·구)
- `title`, `startsAt`, `manualPlaceName`

Optional body: `description`, `imageUrl`, `endsAt`, `deadlineAt`, `addressText`, `costNote`, `rulesText`, `minLevelCode`, `maxLevelCode`, `genderRule`, `matchFormat`, `matchStyle`, `uniformColor`.

Rules:

- active `owner` 또는 `ops` admin만 생성할 수 있으며 `support`는 `403 PERMISSION_DENIED`다.
- 생성된 행은 `hostTeamId=null`, `platformManaged=true`, `status=recruiting`인 독립 플랫폼 모집이다. `platformManaged`는 홈팀 유무로 계산하지 않고 `v1_team_matches.platform_managed`에 영구 저장한다.
- 조건 필드는 일반 팀매치 모집과 같은 검증·저장 계약을 사용한다. web은 총 비용/상대팀 비용을 일반 생성 화면과 같은 `총 {금액}원 · 상대팀 {금액}원` 형식의 `costNote`로 보낸다.
- `deadlineAt`은 일반 모집처럼 선택 사항이며 입력한 경우 현재보다 이후이고 `startsAt`보다 빨라야 한다.
- 생성 시 Game, team schedule, application을 만들지 않는다.
- 배정 전 공개 목록/상세 응답은 `platformManaged=true`, `hostTeam=null`을 반환하며 같은 종목의 관리 팀이 `POST /team-matches/:id/applications`로 신청할 수 있다.
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
- 배정 뒤에도 저장된 `platformManaged=true`는 유지된다. 공개 목록/상세는 실제 홈·원정 팀과 `플랫폼 주관` 출처를 함께 노출한다.
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
- `platformManaged`는 생성 출처를 뜻하며 팀 배정 후에도 `true`다. `hostTeam`/`approvedOpponentTeam`은 현재 배정된 실제 양 팀을 별도로 반환한다.
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
- `deadlineAt`은 선택 사항이며 새로 설정할 때 현재보다 이후이고 `startsAt`보다 빨라야 한다. 수정 시에는 저장된 기존 마감 시각을 그대로 유지할 수 있다. `v1_team_matches.deadline_at`에 저장되고 목록·상세·수정 응답에 동일하게 반환된다.

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

Task 172 공개 기록은 기존 가시성 정책과 `PUBLIC_LIVE` 플래그를 적용한다. 비참가자의 `sides[].score`는 비공개 시 `null`이며, `HIDDEN`은 404다. `STATUS_ONLY`는 점수를 숨기고, `OFFICIAL_ONLY` 및 플래그가 꺼진 `LIVE`는 최종 확정 후에만 점수를 반환한다. 라인업·이력·팀별 확인 정보는 참가자에게만 반환한다.

### 일반/관리자 날짜·확정 공통 계약 (Task 149)

- 두 생성 API는 `validateTeamMatchDates`를 공유한다. 시작은 미래, 종료는 시작 이후, 새 마감은 현재 이후·시작 이전이어야 한다. 잘못된 종료값을 `null`로 바꾸어 성공시키지 않는다.
- 일반 생성/수정 폼도 종료 날짜를 지정할 수 있다. 비워두면 시작 날짜를 사용하며, 명시한 종료 날짜에는 종료 시간이 필요하다. 로컬 날짜·시간을 ISO로 변환하고 수정 시 같은 로컬 날짜로 복원한다.
- 일반/관리자 스타일 입력은 프리셋과 직접 입력을 함께 지원하며 최대 3개다.
- 신청 마감은 **새 신청 접수**를 닫는다. 기존 `requested` 신청은 raw status가 `recruiting`이고 시작 전이면 일반 승인과 관리자 두 팀 확정 모두 가능하다. `closed`/`cancelled`/`matched` 상태나 시작 이후는 확정 불가다. 일반 신청 목록의 `canApprove`도 이 조건과 같다.
- `platform_managed` migration과 후속 `20260921141000_v1_platform_recruitment_host_constraint`가 필요하다. 후자는 기존 CHECK를 트랜잭션 안에서 확장해 플랫폼 모집만 host 없이 허용하고 생성자·지역·장소·시작 필수값은 유지한다. 일반 모집은 여전히 host가 필요하다.

MSW 기본 픽스처의 라인업은 DRAFT이므로 공동 기록 조회는 편집 불가 상태이며 POST는 403을 반환한다. 실제 공동 편집 검증은 API 통합 픽스처와 headed 브라우저 흐름을 사용한다. 테스트 성공을 흉내내는 mock 확정 처리는 제공하지 않는다.
