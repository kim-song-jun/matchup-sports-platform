# Domain Contract — Matches

## Endpoint Matrix

| Method | Path | Auth | 설명 |
|---|---|---|---|
| GET | `/matches` | No | 목록 조회 |
| GET | `/home/recommendations` | No | 신청 가능한 추천 매치 |
| POST | `/matches` | Yes | 생성 |
| GET | `/matches/:id` | No | 상세 |
| PATCH | `/matches/:id` | Yes | 수정 |
| POST | `/matches/:id/cancel` | Yes | 취소 (host) |
| POST | `/matches/:id/close` | Yes | 모집 마감 (host) |
| POST | `/matches/:id/join` | Yes | 참가 |
| DELETE | `/matches/:id/leave` | Yes | 탈퇴 |
| POST | `/matches/:id/teams` | Yes | 팀 자동 배정 (host) |
| POST | `/matches/:id/complete` | Yes | 완료 처리 (host) |
| POST | `/matches/:id/arrive` | Yes | 도착 인증 |

## GET /matches (MatchFilterDto)

- Query

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `query` | string | No | title/description/place 검색 |
| `sportId` | uuid | No | `v1_master_sports.id` |
| `regionId` | uuid | No | district region |
| `levelCodes` | comma string | No | `beginner,novice,intermediate,advanced` 중 다중 선택 |
| `genderRule` | string | No | `성별 무관`, `남`, `여` |
| `status` | recruiting/closed/completed/cancelled/expired | No | 기본 recruiting |
| `sort` | recommended/latest/starts_at/deadline | No | 기본 latest |
| `cursor` | string | No | cursor pagination |
| `limit` | 1~50 | No | 기본 20 |

- Response: `{ items, pageInfo }`
- 기본 목록은 `createdAt DESC, id DESC` 최신 생성순이다. `deadline`/`starts_at`은 경기 시작 임박순이며 `recommended`는 현재 시작 임박순으로 처리한다.
- `status`를 생략한 일반 목록은 경기 시작 전인 raw `recruiting`과 `closed`를 포함한다. 신청 마감이 지났거나 raw `closed`인 항목도 경기 시작 전까지 `displayState=closed`(신청마감)로 노출하고, 경기 시작 시각 이후에는 목록에서 제외한다.
- `sort=recommended` 목록과 `GET /home/recommendations`는 경기 시작 전인 raw `recruiting` 중 신청 마감이 없거나 아직 지나지 않은 항목만 포함한다.
- Each list item includes `host.userId`, `host.displayName`, `host.profileImageUrl`, and `host.trustState`.
  `host.displayName` resolves the creator profile nickname first, then the profile display name, then the semantic `호스트` fallback.
- Level response fields: `levelLabel`, `minLevel`, `maxLevel`

## POST /matches (CreateMatchDto)

- Body

| 필드 | 타입 | 필수 | 기본값 |
|---|---|---|---|
| `sportId` | uuid | Yes | - |
| `regionId` | uuid | Yes | - |
| `title` | string | Yes | - |
| `description` | string | No | - |
| `imageUrl` | string | No | - |
| `startsAt` | ISO datetime | Yes | - |
| `endsAt` | ISO datetime | No | - |
| `deadlineAt` | ISO datetime | No | - |
| `capacity` | int(2~100) | Yes | - |
| `manualPlaceName` | string | Yes | - |
| `addressText` | string | No | - |
| `rulesText` | string | No | 안내/규칙 표시용 |
| `minLevelCode` | level code | No | - |
| `maxLevelCode` | level code | No | - |
| `genderRule` | string | No | 성별 무관 |

- Level codes는 `beginner`, `novice`, `intermediate`, `advanced`만 허용한다.
- `minLevelCode === maxLevelCode`는 단일 레벨 조건으로 유효하다.
- `minLevelCode`가 `maxLevelCode`보다 높은 단계면 `400 VALIDATION_FAILED`.

- 부가 동작
- host는 자동 participant 생성
- host participant `paymentStatus=completed`

## PATCH /matches/:id

- host만 가능
- `cancelled`, `completed`, `in_progress` 상태에서는 수정 불가
- `maxPlayers`를 현재 참가자 수보다 낮게 수정 불가
- `imageUrl`은 `null` 전달로 제거 가능
- `minLevelCode`, `maxLevelCode`는 create와 동일 계약이며 미전달 시 레벨 FK를 비운다.

## POST /matches/:id/join

- recruiting 상태에서만 가능
- 정원 가득 찬 경우 실패
- 중복 참가 실패
- 참가 성공 시 `currentPlayers` 증가 및 상태 `full/recruiting` 갱신

## DELETE /matches/:id/leave

- host는 탈퇴 불가
- `in_progress`, `cancelled`, `completed` 상태 탈퇴 불가

## POST /matches/:id/arrive

- Body

| 필드 | 타입 | 필수 |
|---|---|---|
| `lat` | number | Yes |
| `lng` | number | Yes |
| `photoUrl` | string | Yes |

- 조건
- 참가자만 가능
- 중복 인증 불가
- 시간 창: 시작 30분 전 ~ 종료 30분 후
- venue 좌표가 있으면 200m 이내만 허용

## Idempotency / Duplicate Behavior

- `join`: 이미 참가면 실패
- `arrive`: 이미 도착 인증이면 실패
- `cancel`/`complete`: 이미 종료 상태면 실패

## Task 6 Game source boundary

This document's `/matches` routes are player-match routes and are unchanged by Task 6. The
separate `/api/v1/team-matches` source flow creates one pinned `TEAM_MATCH` Game in the same
transaction; the Team Match module obtains `GamesService` from `GamesModule`, rather than
duplicating Game persistence. Its source must resolve an active immutable competition
configuration, otherwise it returns `409 COMPETITION_CONFIG_REQUIRED` with no orphan Team Match
or Game. See [Games](./games.md#current-task-6-runtime-surface) for the resulting Game routes,
idempotency rules, result DTOs, and the ordinary-team-match result-submit transition to `ENDED`.

Task 6 does not add a generic `/matches` result endpoint and does not turn fixture data into a
verified record. Any sample or fixture result remains explicitly non-verified until the Game
revision flow has produced the applicable persisted result state.

## Frontend Mapping Notes

- `useV1Matches`, `useV1Match`, `useV1CreateMatch`, `useV1UpdateMatch` 사용
- 목록 필터 URL은 `levelCodes`를 canonical source로 사용한다. legacy `levels` query는 읽기 호환만 유지한다.
- `useCancelMatch`는 body optional(`reason`)이며 미전달 가능

## CAUTION

- 프론트 `UpdateMatchInput`에 `location`, `status`가 있으나 backend `UpdateMatchDto`에는 없음
- submit 전에 DTO 필드로 정제하지 않으면 `400` 가능
- 레벨 표시 텍스트는 `rulesText`가 아니라 `minSportLevelId`, `maxSportLevelId` FK에서 계산한 `levelLabel`을 사용한다.

## Source References

- `apps/v1_api/src/matches/matches.controller.ts`
- `apps/v1_api/src/matches/dto/*.ts`
- `apps/v1_api/src/matches/matches.service.ts`
- `apps/v1_api/src/sports/level-range.ts`
- `apps/v1_web/src/hooks/use-v1-api.ts`
- `apps/v1_web/src/types/api.ts`
