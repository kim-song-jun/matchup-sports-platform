# Domain Contract — Matches

개인 친선매치의 생성, 신청 승인, 참가 상태, 경기 완료 계약이다. 정규 리그 및 팀 친선매치는 이 문서 범위가 아니다.

## Endpoint Matrix

| Method | Path | Auth | 설명 |
|---|---|---|---|
| GET | `/matches` | Optional | 개인매치 목록 |
| POST | `/matches` | User + creator profile | 개인매치 생성 |
| GET | `/matches/me/recent-venues` | User | 최근 입력 장소 |
| GET | `/matches/:matchId` | Optional | 상세 및 viewer 상태 |
| GET | `/matches/:matchId/edit` | Host | 수정 폼 데이터 |
| PATCH | `/matches/:matchId` | Host | 수정 |
| GET | `/matches/:matchId/application-eligibility` | User | 신청 가능 여부 |
| POST | `/matches/:matchId/applications` | User | 참가 신청 |
| GET | `/matches/:matchId/applications` | Host | 신청·참가·처리 내역 |
| POST | `/match-applications/:applicationId/withdraw` | Applicant | 신청 철회 |
| POST | `/match-applications/:applicationId/approve` | Host | 신청 승인 |
| POST | `/match-applications/:applicationId/reject` | Host | 신청 거절 |
| POST | `/matches/:matchId/close` | Host | 모집 마감 |
| POST | `/matches/:matchId/reopen` | Host | 모집 재개 |
| POST | `/matches/:matchId/cancel` | Host | 매치 취소 |
| POST | `/matches/:matchId/complete` | Host | 참여 여부 확정 및 경기 완료 |

`/matches/:id/join`, `/leave`, `/teams`, `/arrive`는 현재 v1 개인매치 계약에 존재하지 않는다.

## 생성·수정

- 필수: `sportId`, `regionId`, `title`, `startsAt`, `capacity`, `manualPlaceName`
- 선택: `description`, `imageUrl`, `endsAt`, `deadlineAt`, `addressText`, `rulesText`, `minLevelCode`, `maxLevelCode`, `genderRule`
- 수정에는 optimistic concurrency용 `version`이 추가로 필요하다.
- 생성 시 호스트 참가자(`role=host`, `status=active`)를 함께 만든다.
- 완료·취소 상태와 시작 시각이 지난 매치는 수정할 수 없다.

## 참가 신청

- `POST /matches/:matchId/applications`: body `{ message?: string | null }`, 최대 500자
- `GET /matches/:matchId/applications`: status 생략 시 요청·승인·거절·철회·마감 내역 전체
- 허용 status: `requested`, `approved`, `rejected`, `withdrawn`, `cancelled_by_host`, `expired`
- 목록 항목에는 `participantId`, `participantStatus`, `participantCompletedAt`이 포함된다.
- 승인하면 `role=participant`, `status=active` 참가자가 생기고 신청은 `approved`가 된다.
- 마지막 자리를 승인하면 남은 대기 신청은 `expired`로 정리되고 알림을 보낸다.
- 승인 전에는 채팅할 수 없고 승인된 호스트·참가자는 같은 매치 채팅방을 연다.
- 완료된 참가자도 채팅 entitlement를 유지한다.

## 모집·취소

- `close`: `recruiting -> closed`; 대기 신청은 `expired`
- `reopen`: 시작 전 `closed -> recruiting`; 필요하면 새 `deadlineAt`
- `cancel`: 호스트만 실행하며 신청·참가 상태와 알림을 정리
- 중복 요청은 `ALREADY_PROCESSED`, 허용되지 않는 전이는 `STATE_CONFLICT`

## 경기 완료와 개인 참여 기록

`POST /matches/:matchId/complete`

- body: `{ participants: [{ participantId, status: 'completed' | 'no_show' }], reason? }`
- 호스트만, 경기 시작 이후, raw `recruiting` 또는 `closed`에서 실행한다.
- 모든 active 일반 참가자를 정확히 한 번씩 지정해야 한다.
- 점수·승패·개인 성적은 저장하지 않고 “참여 완료/불참”만 남긴다.
- 호스트와 매치는 `completed`; 매치에는 `completedAt`이 남는다.
- 오래된 데이터에 호스트 참가자 행이 없으면 완료 트랜잭션 안에서 복구한다.
- 대기 신청은 `expired`, 참가자 변경은 status log, 완료·마감 대상은 notification으로 남긴다.
- 완료 참가자는 상세·내 매치에서 “참여 완료”를 보고 리뷰에 진입한다.
- `no_show` 참가자는 “불참 기록”을 보고 리뷰 CTA가 없다.

## 목록과 관리자 경계

- `status=expired`는 raw `recruiting`이면서 시작 시각이 지난 매치만 반환한다.
- raw `closed`는 시작 이후에도 expired 필터에 섞지 않는다.
- `viewer.state`와 `viewer.participantStatus`로 승인/참여/불참을 표시한다.
- 완료 참가자도 표시 인원수에 포함한다.
- 관리자는 목록·상세를 볼 수 있지만 개인매치 완료를 직접 만들 수 없다(`MATCH_COMPLETION_ADMIN_FORBIDDEN`). 참여 여부의 source of truth는 현장 호스트다.

## Frontend Mapping

- 목록/상세: `useV1Matches`, `useV1Match`
- 신청: `useV1ApplyMatch`, `useV1MatchApplicationEligibility`
- 신청 관리: `useV1MatchApplicationsInfinite`, approve/reject hooks
- 완료: `useV1CompleteMatch`
- 채팅방은 상세 진입 때 선생성하지 않고 채팅 버튼을 누를 때 resolve한다.

## Source References

- `apps/v1_api/src/matches/matches.controller.ts`
- `apps/v1_api/src/matches/match-applications.controller.ts`
- `apps/v1_api/src/matches/dto/*.ts`
- `apps/v1_api/src/matches/matches.service.ts`
- `apps/v1_web/src/hooks/use-v1-api.ts`
- `apps/v1_web/src/types/api.ts`
