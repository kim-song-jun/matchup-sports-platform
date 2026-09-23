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
| POST | `/matches/:id/reopen` | Yes | 모집 재개 (host) |
| POST | `/matches/:id/applications` | Yes | 참가 신청 |
| GET | `/matches/:id/applications` | Yes | 호스트 신청자 목록 |
| POST | `/match-applications/:id/approve` | Yes | 신청 승인 (host) |
| POST | `/match-applications/:id/reject` | Yes | 신청 거절 (host) |
| POST | `/match-applications/:id/withdraw` | Yes | 본인 신청/참가 취소 |
| POST | `/match-participants/:id/cancel-approval` | Yes | 시작 전 승인 취소 (host) |
| POST | `/match-participants/:id/mark-cancelled` | Yes | 시작 후 불참 처리 (host) |
| POST | `/matches/:id/complete` | Yes | 경기 종료 뒤 참여 이력 확정 (host) |

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
- 참가비: `costNote?: string | null` (목록·상세·수정 폼 응답 공통, 최대 200자). 호스트가 입력하지
  않았으면 `null`이며, 프론트는 `null`이면 참가비 행 자체를 숨긴다(0원으로 단정하지 않는다).

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
| `costNote` | string(≤200) | No | 참가비 자유 입력(예: "10,000원/1인", "무료") — team-matches의 costNote와 같은 계약 |

- Level codes는 `beginner`, `novice`, `intermediate`, `advanced`만 허용한다.
- `minLevelCode === maxLevelCode`는 단일 레벨 조건으로 유효하다.
- `minLevelCode`가 `maxLevelCode`보다 높은 단계면 `400 VALIDATION_FAILED`.

- 부가 동작
- host는 자동 participant 생성
- 호스트는 active 참가자로 정원에 포함된다. 개인 모집 매치의 결제·도착 인증·팀 자동 배정 API는 없다.

## PATCH /matches/:id

- host만 가능
- `cancelled`, `completed`, `expired` 상태에서는 수정 불가
- `capacity`를 현재 참가자 수보다 낮게 수정 불가. `version` 필수.
- 수정은 매치 행 잠금 후 최신 상태·버전·참가 인원을 재확인한다. 같은 버전의 동시 수정은
  하나만 저장되며 나머지는 `409 VERSION_CONFLICT`. 승인과 정원 축소가 겹쳐도 정원 초과를 허용하지 않는다.
- 시작된 매치는 raw status가 `closed`여도 edit 응답 `editable=false`, 저장은 409다.
- `imageUrl`은 `null` 전달로 제거 가능
- `minLevelCode`, `maxLevelCode`는 create와 동일 계약이며 미전달 시 레벨 FK를 비운다.
- `costNote`도 create와 동일 계약(선택, ≤200자, 미전달/빈 문자열은 `null`로 저장).

## Host participant actions

- `/match-participants/:id/cancel-approval`: 시작 전 active 참가자를 `removed`로 전환한다.
- `/match-participants/:id/mark-cancelled`: 시작 이후 완료 확정 전 active 참가자를 `no_show`로 전환한다.
- 호스트만 가능하며 호스트 자신·완료된 참가 이력은 변경하지 않는다. 매치는 recruiting/closed여야 한다.
- 두 액션 모두 `{ reason: string }` 필수(앞뒤 공백 제거 후 1~500자). 입력 오류 400,
  비호스트 403, 참가자 없음 404, 시점/상태 위반·재처리 409. 실패를 성공으로 처리하지 않는다.
- 매치 행 잠금 안에서 참가자·신청(`cancelled_by_host`)·두 상태 변경 로그를 함께 저장한다.
  로그에 처리자와 사유를 남기며 정원·채팅·완료 활동·후기 자격에서 해당 참가자를 제외한다.
- 신청 목록은 `participantId`, `participantStatus`, `canCancelApproval`, `canMarkCancelled`를 반환한다.
  화면은 확정 명단의 참가자 관리 메뉴에서 사유와 확인 모달을 거쳐 실제 participantId로 요청한다.
  성공하면 v1 query를 무효화하고, 실패하면 오류와 입력 사유를 유지한다.

## POST /matches/:id/close · /matches/:id/reopen (host)

팀매치 `close`/`reopen` 과 같은 계약이다. **취소와 다르다** — 매치와 확정 참가자는 그대로 두고
"새 신청을 더 받는 것"만 닫으므로 되돌릴 수 있다.

- `close` (body `{ reason? }`): `recruiting` + 시작 전에만. `status='closed'` 로 바꾸고 대기 중
  (`requested`)이던 신청서를 `expired` 로 정리한 뒤 그 신청자에게 `match_closed` 알림을 보낸다.
  이미 `closed` 면 `409 ALREADY_PROCESSED`.
- `reopen` (body `{ reason?, deadlineAt? }`): 시작 전에만. **닫힌 두 갈래를 모두 되돌린다** —
  호스트가 닫은 `status='closed'` 와, 마감 시각이 지나 `displayState` 만 `closed` 인 `recruiting`
  (화면에는 둘 다 "신청 마감"으로 보인다). 지난 마감 시각은 지운다(= 경기 시작 전까지 받는다) —
  남겨두면 `getDisplayState` 가 곧바로 다시 `closed` 를 돌려줘 눌러도 아무 변화가 없다.
  `deadlineAt` 을 주면 그 값으로 갱신하며 지금 이후 · 시작 이전이어야 한다(`400 VALIDATION_FAILED`).
  이미 모집 중이면 `409 ALREADY_PROCESSED`, 시작 시각이 지났으면 `409 STATE_CONFLICT`.
- 재개도 매치 행을 잠근 뒤 최신 상태·시작·마감 시각을 검사한다. 최초 조회 이후 취소/완료된
  매치를 되살리지 않으며 동시 재개 중 하나만 성공한다. 상태 로그도 잠금 후 상태를 기록한다.

## POST /matches/:id/complete (host)

- `recruiting` 또는 `closed` 개인 매치를 `endsAt` 이후(종료 시각이 없으면 `startsAt` 이후)에만
  완료할 수 있다. 호스트가 아닌 사용자는 `403 PERMISSION_DENIED`, 너무 이른 완료는
  `409 MATCH_NOT_ENDED`다.
- 완료 트랜잭션은 매치 행을 잠근 뒤 매치 `status/completedAt`과 현재 `active` 참가자(호스트 포함)의
  `status/completedAt`을 함께 갱신하고, 남은 `requested` 신청은 `expired`로 닫는다. 따라서 프로필의
  개인 매치 활동 횟수와 후기 자격은 같은 저장 상태를 사용한다.
- 완료 재시도와 동시 요청은 성공으로 수렴하되 이미 `completed`인 참가자를 다시 집계하지 않는다.
  완료된 매치는 다시 모집/취소 상태로 되돌릴 수 없고 관리자 완료도 같은 참가자 전환을 사용한다.
- 이 완료는 참여 이력만 확정한다. 득점·도움·승패 같은 공식 경기 기록은 별도 Game/결과 리비전이
  없는 개인 모집 매치에서 생성하지 않는다.

## Application management and withdrawal

- `GET /matches/:id/applications`는 호스트 전용이며 `status=requested|approved|rejected|withdrawn|cancelled_by_host|expired`
  필터와 cursor pagination을 지원한다. 프론트의 승인 대기·확정 명단·전체 이력 탭은 각각 이 실제
  필터를 사용하며 확정 명단에는 호스트도 별도로 표시한다.
- 신청자는 `requested` 신청을 철회할 수 있다. `approved` 신청도 매치 시작 전에는 철회할 수 있으며,
  같은 트랜잭션에서 연결 참가자를 `cancelled`로 바꿔 정원, 채팅 권한, 완료 집계에서 즉시 제외한다.
  시작 이후 또는 완료/취소 상태에서는 승인 참가 철회를 `409 STATE_CONFLICT`로 거절한다.
- `GET /me/matches`는 `mode=joined|created`, `cursor`, `limit`을 지원한다. 화면은 `pageInfo`를 따라
  다음 페이지를 누적하며 50건 이후 이력도 조회한다.

## Idempotency / Duplicate Behavior

- `applications`: 활성 신청 중복은 실패; 취소 후 재신청은 기존 신청/참가자를 재사용한다.
- `cancel`: 이미 종료 상태면 실패. `complete`: 동일 완료 요청은 성공으로 수렴하며 중복 집계하지 않음
- `close`: 이미 마감이면 `409 ALREADY_PROCESSED` / `reopen`: 이미 모집 중이면 `409 ALREADY_PROCESSED`

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
- `rulesText`(상세 화면의 "규칙" 카드)는 `levelNote` 원문만 담는다. `genderRule`·`costNote`는 이미
  각각 별도 구조화 필드로 내려가므로 `rulesText`에 합쳐 보내지 않는다 — 합치면 상세 화면에
  성별·참가비가 규칙 카드에 한 번 더 찍힌다(2026-09-22 리뷰에서 실제로 발견된 회귀).

## Source References

- `apps/v1_api/src/matches/matches.controller.ts`
- `apps/v1_api/src/matches/dto/*.ts`
- `apps/v1_api/src/matches/matches.service.ts`
- `apps/v1_api/src/sports/level-range.ts`
- `apps/v1_web/src/hooks/use-v1-api.ts`
- `apps/v1_web/src/types/api.ts`
