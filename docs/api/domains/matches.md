# Domain Contract — Matches

## Endpoint Matrix

| Method | Path | Auth | 설명 |
|---|---|---|---|
| GET | `/matches` | No | 목록 조회 |
| GET | `/matches/recommended` | Yes | 추천 매치 |
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
| `q` | string | No | title/description/venue 검색 |
| `sportType` | enum | No | 소문자 sport type |
| `city`, `district` | string | No | venue relation 필터 |
| `date` | YYYY-MM-DD | No | matchDate |
| `levelMin`, `levelMax` | int | No | transform(parseInt) |
| `maxFee` | int | No | `fee <= maxFee` |
| `freeOnly` | boolean | No | `fee = 0` |
| `availableOnly` | boolean | No | recruiting만 |
| `beginnerFriendly` | boolean | No | `levelMax <= 2` |
| `sort` | upcoming/latest/deadline | No | 기본 upcoming |
| `cursor` | string | No | cursor pagination |
| `limit` | 1~50 | No | 기본 20 |

- Response: `{ items, nextCursor }`

## POST /matches (CreateMatchDto)

- Body

| 필드 | 타입 | 필수 | 기본값 |
|---|---|---|---|
| `title` | string | Yes | - |
| `description` | string | No | - |
| `imageUrl` | string | No | - |
| `sportType` | enum | Yes | - |
| `venueId` | string | Yes | - |
| `matchDate` | date string | Yes | - |
| `startTime`, `endTime` | HH:mm | Yes | - |
| `maxPlayers` | int(2~30) | Yes | - |
| `fee` | int >= 0 | No | 0 |
| `levelMin` | int(1~5) | No | 1 |
| `levelMax` | int(1~5) | No | 5 |
| `gender` | any/male/female | No | any |
| `teamConfig` | object | No | - |

- 부가 동작
- host는 자동 participant 생성
- host participant `paymentStatus=completed`

## PATCH /matches/:id

- host만 가능
- `cancelled`, `completed`, `in_progress` 상태에서는 수정 불가
- `maxPlayers`를 현재 참가자 수보다 낮게 수정 불가
- `imageUrl`은 `null` 전달로 제거 가능

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

## Frontend Mapping Notes

- `useMatches`, `useMatch`, `useRecommendedMatches`, `useUpdateMatch`, `useCancelMatch`, `useCloseMatch`, `useArriveMatch` 사용
- `useCancelMatch`는 body optional(`reason`)이며 미전달 가능

## CAUTION

- 프론트 `UpdateMatchInput`에 `location`, `status`가 있으나 backend `UpdateMatchDto`에는 없음
- submit 전에 DTO 필드로 정제하지 않으면 `400` 가능

## Source References

- `apps/api/src/matches/matches.controller.ts`
- `apps/api/src/matches/dto/match.dto.ts`
- `apps/api/src/matches/matches.service.ts`
- `apps/api/test/integration/matches.e2e-spec.ts`
- `apps/api/src/matches/matches.service.spec.ts`
- `apps/web/src/hooks/use-api.ts`
- `apps/web/src/types/api.ts`
