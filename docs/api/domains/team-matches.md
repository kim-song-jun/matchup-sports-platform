# Domain Contract - Team Matches

## Competition field place display (Task 20261082)

Public team-match list/detail include the assigned field's name. For league/tournament matches, `place.name` uses that field name while address/coordinates remain the match's saved snapshot. Ordinary friendly matches retain their existing place contract. Historical DB names are not overwritten by this display normalization; fixture setting writes use the shared competition registry in [tournament operations](./tournament-operations.md#place-registry-integration-2026-10-14-task-20261082).

## 플랫폼 주관 공동 운영 (Task 149, 2026-09-30)

- 기존 `GET/POST /team-matches/:id/record` 계약에 `operator: boolean`을 추가한다. `participant`는 유효 명단의 참가자와 기존 팀장 권한을 뜻하며, 미제출 친선은 아래 MD-QA #146의 기본 명단을 사용한다. 운영자 권한만 있는 계정은 참가자로 추가하지 않는다.
- 독립 플랫폼 주관 경기(`platformManaged=true`, league/tournament 없음)의 active·미회수 owner/ops는 라인업 등록 없이 득점/서브매치를 공동 편집할 수 있다. 연결 계정도 active여야 한다. 일반 팀매치·support·회수/정지 계정에는 이 권한을 주지 않는다.
- 참가자가 아닌 운영자는 `confirm/reopen` 불가(403 `TEAM_CONFIRMATION_REQUIRED`). 운영자가 실제 선수이면 기존 선수 권한을 유지한다.
- 경기 시작, 양 팀 명단 준비, 공식 결과 잠금, `expectedVersion` 충돌, `commandId` 재실행 규칙은 기존과 같다. 운영자의 수정도 양 팀의 이전 확인을 초기화한다.
- 기록 이력에는 `Teameet 운영`과 실제 actorUserId를 저장하고, 운영자 감사 로그를 같은 트랜잭션에 기록한다. 참가자에게 실제 운영자 계정을 리뷰 대상으로 추가하지 않는다.
- 관리자 진입은 `/admin/team-matches/:id/record`. 완료 후 운영 리뷰는 `/admin/team-matches/:id/reviews`; 일반 사용자 shell로 이동하지 않는다.

## V1 친선 팀매치 공동 경기 기록 (Task 172)

이 절은 `apps/v1_api/src/team-matches/team-match-record.controller.ts` / service / DTO와
`apps/v1_web/src/hooks/use-team-match-record.ts` 기준의 신규 계약이다. 기존 리그·대회 운영 경로와
이미 결과 revision이 있는 친선 경기의 기존 제출·승인 경로는 보존한다.

| Method | Path | 권한 | 동작 |
|---|---|---|---|
| GET | `/api/v1/team-matches/:id/record` | OptionalV1AuthGuard | 공동 기록·서버 시각·편집 가능 여부 조회 |
| POST | `/api/v1/team-matches/:id/record` | V1AuthGuard + 유효 명단 참가자·기존 팀장/운영자 권한 | 득점 추가/수정/삭제/복구, 종료 확인/취소 |

- 응답은 공통 `{ status, data, timestamp }`. `phase`: scheduled/live/official/cancelled/legacy/managed.
- `phase=legacy`는 공동 기록 편집 대상이 아닌 기존 v1 경기 상태다. 조회는 `currentOfficialRevision.state=OFFICIAL`인 현재 리비전의 실제 점수를 flat/nested JSON 형태 모두에서 읽으며, 최신 초안이나 오래된 공동 기록으로 대체하지 않는다. 현재 공식 결과가 없거나 점수 JSON이 유효하지 않으면 점수는 `null`이며 0:0을 만들지 않는다. `legacy`의 쓰기는 계속 409 `RECORD_NOT_EDITABLE`이다.
- GET은 일반 사용자에게 점수·팀·확정 여부와 아래의 최소 공식 득점 요약만 반환한다. 선수 명단·편집용 득점 원본·이력·확인자 이름은 참가자에게만 반환한다.
- 공식 확정(`phase=official`) 결과에서 점수가 공개되는 조회자는 `goalEvents[]`도 받는다. 각 항목은
  `sideId`(점수를 얻은 팀), 공개 정책을 적용한 nullable `participantName`, nullable `minute`,
  `ownGoal`, nullable `subMatchId`만 포함한다. 편집용 participant id와 변경 이력은 계속 공개하지 않는다.
  `STATUS_ONLY`처럼 점수가 가려진 응답과 공식 확정 전 응답에서는 빈 배열이다. 선수 이름은 대회
  경기결과와 같은 이름 공개 게이트 및 닉네임/실명 선택 정책을 사용한다.
- 공개 득점의 `period?: number | null`은 읽기 전용 추가 필드다. 현재 공식 JSON이나 실제 경기 이벤트에서 알려진 양의 정수 period만 숫자로 제공한다. `minute`는 해당 period 안의 경과 분 그대로이며 전·후반 길이를 추정해 누적 분으로 바꾸지 않는다. JSON의 null·누락 period, period를 기록하지 않은 공동 기록, `GOAL_BACKFILL_V1`의 임시 period 값은 필드를 생략한다. 소비자는 null·누락을 모두 모름으로 처리하고 알려진 period와 minute 순으로 표시하며 같은 시각에는 원본 순서를 유지한다.
- 기존 v1 공식 친선 결과(`phase=legacy`)도 공개 정책이 점수를 허용하면 같은 `goalEvents[]` 투영을 받는다. 공식 리비전의 JSON 득점을 우선하며, JSON이 `null`인 이벤트 기반 결과만 현재 경기의 취소되지 않은 GOAL/OWN_GOAL을 읽는다. 명시적 빈 JSON과 잘못된 JSON을 과거 이벤트로 대체하지 않는다. `OFFICIAL_ONLY`와 `PUBLIC_LIVE=off`는 공식 결과를 공개하고 `STATUS_ONLY`는 점수·득점을 가리며 `HIDDEN`은 공개 조회에 404다. 기존 참가자 private read 예외와 신원·이름 공개 정책은 유지한다. `legacy`의 `goals`·`subMatches`는 빈 배열로 두어 오래된 공동 기록을 공식 결과 앞에 표시하지 않는다.
- 편집자는 유효 명단의 `userId` 또는 검증된 현재 identity link로 판정한다. 실제 제출/잠금 명단이 있으면 그 명단을 사용하고, 미제출 친선은 아래 기본 명단 계약을 적용한다. 양쪽 명단에 동시에 있는 계정은 확인자로 인정하지 않는다.
- **명단 밖 팀장·매니저(Task 180 H5)**: 친선 경기에서 라인업에 없는 사용자가 한쪽 참가팀의 active owner/manager 이면 그 팀 쪽으로 기록·종료 확인을 할 수 있다. 응답에 `teamAuthority: true`, 이력·확인자 이름은 `"<닉네임> · 팀장 권한"`. 양 팀을 모두 관리하면 권한을 주지 않는다. **대회·리그 경기(`phase=managed`)에는 적용하지 않는다** — 참가팀은 결과를 만들거나 확인하지 않으므로 기존처럼 403 `RECORD_PARTICIPANT_REQUIRED`(정본 §4).
- 참가자 응답의 `participants[].guest` 는 계정·연결이 없는 출전자다(개인 기록에 남지 않는다).
- `commandId` UUID와 `expectedVersion` 정수 필수. `action`: add/edit/delete/undo/confirm/reopen.
- add/edit: `sideId`는 점수를 얻는 팀. `participantId`는 선택(null=미상), `ownGoal` 기본 false,
  `minute` 선택(null 또는 0..999 정수). 자책골 선수는 점수를 얻는 팀의 상대편 라인업에서 고른다.
- edit/delete는 `goalId`, undo는 `changeId`. undo는 대상 변경 이후 해당 골이 다시 바뀌었으면 409로 거부한다.
- 공동 기록 점수는 현재 득점 기록 개수로만 계산한다. `legacy` 조회 점수는 현재 공식 리비전의 점수다. 이력에는 주체·시각·전후 값이 영속되며 GET은 최근 100건을 반환한다.
- 같은 commandId/사용자/payload 재전송은 재실행 없이 최신 상태를 반환한다. 다른 payload/사용자의 키 재사용은 409.
- Game row lock + record version으로 동시 수정 유실을 방지한다. stale version은 409 `VERSION_CONFLICT`.
- 득점 변경/복구/reopen은 기존 양 팀 확인을 초기화한다. 같은 팀의 중복 confirm은 409.
- 두 팀의 서로 다른 유효 명단 참가자 또는 기존 팀장 권한자가 확인하면 같은 트랜잭션에서 Game 결과 DRAFT→SUBMITTED→OFFICIAL,
  result participants/goalEvents/decisions, TeamMatch 완료·팀 일정 cascade, `GAME_RESULT_OFFICIAL` outbox를 기록한다.
- 확정 후 참가자·팀장 편집은 409 `RECORD_NOT_EDITABLE`.
- **확정 후 어드민 정정(2026-10-01 사용자 결정 "어드민은 언제든 수정")**: active 플랫폼 어드민(`owner`·`ops`)은
  플랫폼 주관 여부와 무관하게 확정된 친선(`phase=official`)에서 같은 POST 로 add/edit/delete/undo·서브매치 조작을 할 수 있다
  (GET 응답 `canEdit: true`, `operator: true`). 서버는 공동 기록을 갱신하고 **현재 공식 리비전을 덮어쓰지 않고**
  `supersedesId` 로 잇는 새 리비전(DRAFT→OFFICIAL, CORRECTION flow, `reason="운영자 결과 정정"`)을 만들어 공식 포인터를 옮긴 뒤
  `GAME_RESULT_OFFICIAL` outbox(`game:<id>:revision:<n>:correction_officialize`)로 전적·개인 기록·공개 캐시를 다시 투영한다.
  양 팀 종료 확인·`officialAt` 은 그대로이고, 이력(`V1TeamMatchRecordChange`)과 `V1AdminActionLog`(`team_match.record_correction`,
  전후 revisionId)가 남는다. 경기 완료 알림은 팀매치·수신자당 한 번이라 다시 나가지 않는다. confirm/reopen 은 여전히 403
  `TEAM_CONFIRMATION_REQUIRED`, support·revoked 어드민은 403 이다. 대회·리그 경기는 `/games/:gameId/corrections` 레인을 쓴다.
  GET/POST 응답의 `officialCorrected: boolean` 은 `phase=official` 이고 현재 공식 리비전이 정정 리비전(`supersedesId` 있음)일 때만
  `true` 다(관전자 응답 포함). 화면은 이 값으로 점수판 머리말을 "운영팀이 정정한 최종 결과"로 바꾼다.
  `periodCount: number | null` 은 경기 설정 스냅샷의 정규 피리어드 수(연장 제외)다. `1`(단판)이면 화면이 득점 시각 앞에 "전반"을 붙이지 않는다.
  자세한 산출 규칙은 `docs/api/domains/public-records.md` 의 `periodCount`.
- 공동 기록이 생성된 경기에서 이전 host-only 결과/event/진행 command를 호출하면 `SHARED_RECORD_REQUIRED`.
- 주요 오류: 403 RECORD_PARTICIPANT_REQUIRED; 404 TEAM_MATCH_NOT_FOUND;
  409 RECORD_NOT_EDITABLE/VERSION_CONFLICT/COMMAND_REUSED/ALREADY_CONFIRMED/GOAL_NOT_FOUND;
  422 PARTICIPANT_INVALID. DTO 이외 필드는 ValidationPipe에서 거부한다.
- 상대 확정 + 시작 시각 경과는 조회 시 서버 시각으로 판단한다. API 목록/상세 `isLive`는 표시용 파생값이며
  DB status `matched`의 신청/권한 의미는 바꾸지 않는다. 종료 예정 시각만으로 결과를 확정하지 않는다.
- 기본/추천 목록은 진행 중인 matched 경기까지 유지한다. 명시적 recruiting 필터는 기존 모집 조건을 유지한다.
- 단, 일반 팀매치(리그 대진 제외)는 공개 목록(`GET /team-matches`의 모든 정렬·필터와 건수)에서 두 가지를 뺀다. ① 경기 기록(`V1Game`)이 `CANCELLED`인 매치. 게임만 취소하는 `POST /games/:gameId/cancel`은 팀매치 상태를 바꾸지 않는다. ② `matched`인데 끝날 시각(`endAt`, 없으면 `startAt`)이 지나도록 게임이 `SCHEDULED`(또는 게임 없음)인 매치. 기록을 하나라도 남기면 게임이 `LIVE`가 되므로, 진행 중·일시중지·종료(결과 대기) 경기와 완료 7일 노출은 그대로다. 상세 주소는 계속 열린다.
- UI는 진행 중 2초, 경기 전 15초 polling 및 창 focus 시 재조회. 자동 저장 성공을 시뮬레이션하지 않는다.
- 참가자는 상세 진입 시 `/team-matches/:id/record`로 이동. `?view=detail`로 장소/라인업 상세 복귀.
  기존 `/result`, `/result/approval`도 신규 친선 경기에서는 공동 기록을 연다.
- 신규 테이블: `V1TeamMatchRecord`, `V1TeamMatchRecordChange`; migration `20260921160000_v1_team_match_shared_record`.

### 진행 중 참석명단 수정

- **Task 179**: 대회·리그 경기(`leagueId` 또는 `tournamentId` 가 있는 팀매치)는 `PUT .../lineup`·`POST .../lineup/submit`·`POST .../lineup/change-request` 가 모두 `409 ROSTER_MANAGED_BY_ADJUSTMENTS` 다(진행 중 포함). 경기 명단은 참가 명단에서 계산되고 빠지는 선수는 경기 명단 조정 API 로 뺀다. 아래 규칙은 친선에만 적용된다.
- `GET /team-matches/:id/lineup`은 서버가 계산한 `editable`과 `lockReason`(`terminal`, `records_exist`, `active_lineups_complete`, `null`)을 반환한다. `gameState`와 `hasRecordedEvents`는 구버전 Web 호환 필드다.
- 예정 시작 시각은 수정 마감이 아니다. Game이 `SCHEDULED`이면 `startAt`이 지나도 현장 지연 복구를 위해 저장·제출·정정 요청을 허용한다.
- Game이 `LIVE`/`PAUSED`일 때는 양 팀 중 한쪽 최신 revision이 아직 미제출인 동안만 복구할 수 있다. 양 팀 최신 revision이 모두 `SUBMITTED`/`LOCKED`가 되면 즉시 잠긴다.
- 일반 경기 이벤트, 공동 기록, 결과 revision 중 하나라도 생기면 참석명단 수정은 `409 LINEUP_LOCKED_FOR_DIRECT_EDIT`로 거절된다. 구버전의 `confirmRecordedDataRisk` 값으로 우회할 수 없다.
- 명단 mutation과 공동 기록/Game command는 같은 Game 행을 잠근 뒤 상태를 다시 읽어 동시 요청에서 참가자 ID가 기록 뒤에 바뀌지 않게 한다.
- **제출 뒤 저장 (Task 180 R-2)**: 우리 최신 revision 이 `SUBMITTED`/`LOCKED` 이면 `PUT .../lineup` 은 초안으로 내리지 않고 새 revision 을 곧바로 `SUBMITTED`(`submittedAt` = 저장 시각)로 만든다 — 응답 `state: "SUBMITTED"`. `POST .../submit` 과 같은 부수효과가 같은 트랜잭션에서 난다: 공개 시각(`V1GameVisibilityPolicy.lineupAt`)이 비어 있으면 킥오프 1시간 전으로 박고(이미 있으면 그대로), 새 제출본의 참석명단 포함 알림 outbox(`team-match-lineup-included:{lineupId}`)를 넣는다(이미 받은 사람은 워커가 거른다). 그래서 다시 제출은 요청 한 번이다. `POST .../submit` 은 멱등이다 — 최신 revision 이 이미 `SUBMITTED`/`LOCKED` 이고 `expectedVersion` 이 그 revision 이면 아무것도 바꾸지 않고(새 revision·알림·공개 시각 없음) 지금 상태(`lineupId`·`revision`·`state`·`publicLineupAt`)로 성공한다. `expectedVersion` 이 다르면 그대로 409 `VERSION_CONFLICT` 다. 그래서 "저장 → 제출" 순서로 부르는 클라이언트도 오류 없이 끝난다(예전 409 `LINEUP_ALREADY_SUBMITTED` 는 없어졌다). 제출 전(초안) 명단의 저장은 그대로 `DRAFT` 이고, 잠금(`LINEUP_LOCKED_FOR_DIRECT_EDIT`)·버전(`VERSION_CONFLICT`) 판정은 바뀌지 않는다.

### 첫 기록 뒤 "추가만" · 상대 참석명단 · 응답 칩 (Task 180 H5)

| Method | Path | 권한 | 동작 |
|---|---|---|---|
| POST | `/team-matches/:id/lineup/late-additions` | V1AuthGuard + 참가팀 owner/manager, `Idempotency-Key` 필수 | 늦게 온 선수 한 명을 현재 제출본 또는 검증된 고정 기본 명단에 붙인다 |
| GET | `/team-matches/:id/lineup/opponent` | V1AuthGuard + 참가팀 owner/manager | 공개 뒤 상대 참석명단(번호·이름만) |

- **추가만**: 화면은 `GET .../lineup` 의 `lateAdditionAllowed` 를 단일 액션 gate로 사용한다. 서버는 기존 참가팀 owner/manager 권한과 terminal 상태를 확인하고 Game 행 잠금 뒤 현재 최신 명단을 다시 읽는다. 잠금 사유가 `records_exist`/`active_lineups_complete` 이고 결과 revision 이 없으며, 우리 최신 명단이 `SUBMITTED`/`LOCKED` **또는 시스템 감사로 고정 출처가 검증된 친선 `DRAFT`**일 때만 허용한다. body `{ userId? | displayName?, jerseyNumber?, goalkeeper? }`(userId 는 현재 활성 팀원, 없으면 게스트 이름). 새 리비전을 만들지 않고 **그 최신 명단에 행만 추가**해 기존 참가자 id(득점이 매달린 곳)를 지킨다. 고정 `DRAFT`를 사람의 `SUBMITTED`로 바꾸지 않는다. 빼기·번호 변경은 계속 `PUT .../lineup` 의 409 `LINEUP_LOCKED_FOR_DIRECT_EDIT` 다.
- 추가 시각은 운영 감사(`LINEUP_LATE_ADDITION`)와, 공동 기록이 있으면 그 변경 이력(`action: participant_add`, `after: { participantId, sideId, name, jerseyNumber }`)에 남는다. 이력이 생기면 기록 `version` 이 오르고 양 팀 종료 확인이 초기화된다.
- 오류: 409 `LINEUP_NOT_LOCKED`(첫 기록 전 — 참석명단에서 바로 고친다) · `LINEUP_LATE_ADDITION_CLOSED`(결과 revision 존재·제출본 또는 검증된 고정 명단 없음) · `LINEUP_MATCH_TERMINAL` · `ROSTER_MANAGED_BY_ADJUSTMENTS`(대회·리그); 422 `LINEUP_DUPLICATE_PARTICIPANT`/`LINEUP_DUPLICATE_JERSEY_NUMBER`/`LINEUP_PARTICIPANT_INELIGIBLE`; 403 `PERMISSION_DENIED`.
- **상대 참석명단**: 공개 시각은 `V1GameVisibilityPolicy.lineupAt`, 없으면 킥오프 1시간 전. `GET .../lineup` 의 `opponent: { teamName, submitted, published, participantCount }` — 공개 전에는 제출 여부만, `participantCount` 는 공개 뒤에만 숫자. `GET .../lineup/opponent` 는 공개 뒤 `{ teamMatchId, teamName, publicLineupAt, participants: [{ jerseyNumber, displayName }] }`(번호순, 번호 없는 사람은 뒤)만 준다 — 공개 전 403 `OPPONENT_LINEUP_NOT_PUBLIC`(`details.publicLineupAt`), 미제출 404 `OPPONENT_LINEUP_NOT_SUBMITTED`, 대회·리그 409.
- **응답 칩**: `eligibleMembers[].rsvpStatus` 는 이 경기 팀 일정(취소 제외)의 응답(`GOING`/`MAYBE`/`NOT_GOING`/`WAITLISTED`, 답이 없으면 `NO_RESPONSE`)이고 연결된 일정이 없으면 null. 읽기 전용 — 저장·추가 자격에 쓰지 않는다.
- `GET .../lineup` 에 `ownTeamName` 도 싣는다.
- **상대 팀에도 소속 (Task 180 W4-V4)**: `eligibleMembers[].alsoOpponentMember` 는 그 팀원이 **상대 팀의 활성 멤버**인지다(상대가 정해지지 않았으면 전원 false). 상대 참석명단은 읽지 않고 팀 멤버십만 본다 — 공개 전 명단 내용이 새지 않는다. 상대 팀이 멤버 목록을 비공개로 둬도 싣는다(우리 팀원 본인의 소속). 안내용이라 저장·제출·늦은 추가는 이 값으로 막지 않는다 — 화면은 칩을 달고 "모두 넣기"에서 기본으로 뺀다.



## Task 168 Phase 3 canonical source addendum (candidate)

- A TeamMatch owns the canonical Game identity for tournament, regular-league, and friendly flows. Existing fixture-shaped URLs and `fixtureId` response fields continue to carry the same TeamMatch UUID for compatibility.
- Result correction and public record projections follow the Game current official revision; a correction does not change the TeamMatch start time or create a second appearance.
- This is a contract candidate pending the selected API overlay review; it does not claim Alpha migration completion.

## Endpoint Matrix

`team-matches.controller.ts`에는 `check-in`, `result`, `evaluate`, `referee-schedule` 라우트가 없다
— 이 문서의 옛 판은 v0 시절 계약을 그대로 옮겨 실제로 존재하지 않는 라우트를 설명하고 있었다.
아래는 컨트롤러를 기준으로 다시 확인한 목록이다.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/team-matches` | Optional | 모집글 목록 |
| POST | `/team-matches` | Yes(host team owner/manager) | 모집글 생성 |
| GET | `/team-matches/:teamMatchId/edit` | Yes(host team owner/manager) | 수정 폼 프리필 |
| GET | `/team-matches/:teamMatchId` | Optional | 모집글 상세 |
| GET | `/team-matches/:teamMatchId/application-eligibility` | Yes | `teamId?` 기준 신청 가능 여부(팀마다 `logoUrl` — 등록·기본 제공 엠블럼, 없으면 null — 포함) |
| PATCH | `/team-matches/:teamMatchId` | Yes(host team owner/manager) | 모집글 수정 |
| POST | `/team-matches/:teamMatchId/close` | Yes(host team owner/manager) | 모집 마감(대기 신청 `expired`) |
| POST | `/team-matches/:teamMatchId/reopen` | Yes(host team owner/manager) | 마감 취소(시작 전만) |
| POST | `/team-matches/:teamMatchId/cancel` | Yes(host team owner/manager) | 취소(`{ reason? }` ≤500자, 공백만이면 없음으로 취급 — 사유가 있으면 확정 상대팀 알림 본문에 `사유: …`로 담긴다) |
| POST | `/team-matches/:teamMatchId/applications` | Yes(신청 팀 owner/manager) | 신청(`{ applicantTeamId, message? }`) |
| GET | `/team-matches/:teamMatchId/applications` | Yes(host team owner/manager) | 신청 목록 |
| POST | `/team-match-applications/:applicationId/withdraw` | Yes(신청 팀 owner/manager) | 신청 철회 |
| POST | `/team-match-applications/:applicationId/approve` | Yes(host team owner/manager) | 신청 승인(경기 확정) |
| POST | `/team-match-applications/:applicationId/reject` | Yes(host team owner/manager) | 신청 거절 |
| GET | `/me/team-matches` | Yes | 내 팀매치 워크리스트(`scope=hosted|applied|created|all`, `teamId?`, `status?`) |
| GET | `/team-matches/:teamMatchId/lineup` | Yes | 참석명단 조회 |
| PUT | `/team-matches/:teamMatchId/lineup` | Yes | 참석명단 저장 — 제출 전이면 초안, 이미 낸 명단이면 곧바로 새 제출본(Task 180 R-2) |
| POST | `/team-matches/:teamMatchId/lineup/submit` | Yes | 참석명단 제출 — 이미 낸 같은 revision 이면 그대로 성공(멱등, Task 180 R-2) |
| POST | `/team-matches/:teamMatchId/lineup/change-request` | Yes | 상대측 라인업 변경 요청 |
| GET | `/teams/:teamId/recent-venues` | Yes | 최근 사용 장소(생성 폼 자동완성) |
| POST | `/admin/team-matches` | Admin owner/ops | 플랫폼 팀매치 모집 생성 |
| POST | `/admin/team-matches/:id/applications/:applicationId/approve` | Admin owner/ops | 신청 팀을 한 팀씩 승인하고 두 번째 승인에서 경기 확정 |
| POST | `/admin/team-matches/:id/applications/:applicationId/reject` | Admin owner/ops | 대기 신청을 사유와 함께 거절 |
| PATCH | `/admin/team-matches/:id` | Admin owner/ops | 모집 중/마감된 플랫폼 단발 팀매치 수정 |

## Ordinary team-match period rules (MD-QA #141)

일반 호스트의 기존 `POST /team-matches`, `PATCH /team-matches/:teamMatchId`에 선택적 `periods: [{ durationMinutes: number }]`를 추가한다. 관리형 대회·리그 경기의 관리자 전용 설정 API를 일반 호스트에게 열지 않는다. 생성 시 생략하면 기존 기본 config를 사용하고 수정 시 생략하면 현재 immutable pin을 유지한다. 명시적으로 보낸 경우 1개(단판) 또는 2개(전후반)이며 각각 숫자 정수 `1..2147483647`이어야 한다. 문자열·boolean·null·중첩 배열·추가 필드와 범위 초과는 전역 DTO 검증의 `400 VALIDATION_ERROR`, direct-service의 잘못된 기간은 `422 TEAM_MATCH_PERIODS_INVALID`다. 상한은 실제 PostgreSQL 피리어드 trigger의 int4 범위와 일치한다.

- `GET /api/v1/teams/:teamId/team-match-rule-options`: V1AuthGuard와 active 계정·호스트 owner/manager를 확인한다. `{hostTeamId,sportId,competitionConfigVersionId,periods,twoPeriodDefaults}`를 반환한다. `periods`는 현재 ACTIVE `${sportCode}-v1` 기본값 그대로다. `twoPeriodDefaults`는 같은 종목·global 계열 ACTIVE 이력에서 얻은 실제 FIRST_HALF/SECOND_HALF 두 값 또는 `null`이며, 단판 기본값을 가짜 전후반 값으로 바꾸지 않는다. 이력이 여러 페이지여도 끝까지 확인한다. 현재 지원 가능한 단판·전후반 구성이 없으면 `409 COMPETITION_CONFIG_REQUIRED` 또는 `COMPETITION_PERIODS_UNAVAILABLE`이다.
- 사용자 기간은 `${sportCode}-team-match-rules-v1` 별도 계열에 발행하여 global default를 변경하지 않는다. 같은 종목·ACTIVE·실제 canonical JSON이 같으면 전역 unique contentHash의 기존 버전을 이름 계열과 관계없이 재사용한다. 종목/상태/실제 내용이 다르면 `409 COMPETITION_CONFIG_CONTENT_HASH_COLLISION`이다. 대회 period writer도 같은 판정을 사용하고 기존 pending fixture 적용·동일 값 복구·감사를 유지한다. 동시 발행으로 결과를 찾지 못하면 명시적 `TEAM_MATCH_RULES_RETRYABLE` 충돌을 반환한다.
- `PATCH`는 기존 호스트 권한·버전·미래 일정 gate에 추가해 Game 다음 TeamMatch 순서로 잠그고 다시 검증한다. 제출/잠금 명단, 시작·종료·pause 이력, 이벤트·결과 또는 LIVE/PAUSED/ENDED면 `409 TEAM_MATCH_RULES_LOCKED`다. 실제 source가 만든 revision1 DRAFT 명단과 선수 identity는 유지하고 두 pin 및 미시작 period 구성을 같은 트랜잭션에서 바꾼다. 과거 null pin/periods에 임의 규칙을 합성하지 않는다.
- 생성·수정 응답과 상세·edit·Game 조회는 같은 저장값을 사용한다. 상세 `periods`는 단판·불균등 전후반을 그대로 읽고, 운영 콘솔은 기존 `periodDurations`/pinned config를 사용한다. 생성 `/team-matches/new/rules`, 수정 `/team-matches/:id/edit/rules`는 중간 저장 없이 마지막 기존 POST/PATCH 한 번으로 반영한다. 수정 초안은 entity/version 범위로 기기에 보존하고 서버 버전이 다르면 섞지 않는다.
- frontend `useV1TeamMatchRuleOptions`, API types 및 `src/test/msw/team-match-rules-*`는 같은 계약이다. MSW는 actual current defaults/nullable half history, int4 상한, auth/상태/버전 및 시작·종료·마감 날짜 검증을 보존한다. 날짜 오류는 `400 VALIDATION_FAILED`와 field 정보이며, 수정 시 기존의 동일한 경과 마감일만 예외로 유지한다. mock 성공은 실제 PostgreSQL/alpha 증거가 아니다.

## GET /me/team-matches

마이페이지에서 사용하는 로그인 사용자 기준 팀매치 목록이다.

- `scope=applied`: 사용자의 현재 active 소속 팀이 신청한 팀매치. 개인 출전 확정이 아니라 `우리 팀 신청/확정` 관계다.
- `scope=hosted`: 사용자의 현재 active 소속 팀이 호스트인 팀매치.
- `scope=created`: 현재 팀 소속 여부와 관계없이 `V1TeamMatch.createdByUserId`가 로그인 사용자와 같은 팀매치. 마이페이지 `생성한 매치`의 팀매치 소스다.
- 플랫폼 모집(`platformManaged=true`)도 생성 이력에 포함한다. 첫 팀 승인 전 독립 플랫폼 모집의 호스트 팀이 없어도 시작 시간이 있으면 정상 조회하며, 생성자 항목의 `teamId`·`teamName`은 `null`이다. `scope=applied`는 같은 상태에서도 신청 팀의 정보를 유지한다. 시작 시간 누락, 비플랫폼 모집의 호스트 누락, 호스트 관계 불일치는 `409 TEAM_MATCH_OPERATIONAL_DATA_INVALID`로 유지하며, 플랫폼 생성 이력만으로 관리 권한을 부여하지 않는다.
- `scope=all` 또는 생략: 현재 소속 팀 기준 hosted + applied 워크리스트. `created` 이력까지 합치는 의미는 아니다.

응답의 `relation`은 `host_team`, `created_by_me`, `requested`, `approved`, `rejected`, `withdrawn` 중 하나다. `manageRoute`는 현재 호스트팀의 active owner/manager에게만 내려가며 실제 v1 팀매치 상세(`/team-matches/:id`)로 연결된다. 과거 생성자이지만 현재 관리 권한이 없으면 생성 이력은 보이되 `manageRoute=null`이다.

## POST /admin/team-matches

플랫폼 운영자가 팀을 미리 지정하지 않고 공개 모집을 여는 별도 생성 경로다. 일반 팀 owner/manager 생성과 주최/확정 방식은 다르지만 경기 조건과 날짜 검증은 동일하다.

Required body:

- `clientCommandId` (UUID, 재시도 멱등 키)
- `sportId` (활성 종목)
- `regionId` (활성 시·군·구)
- `title`, `startsAt`, `manualPlaceName`
  - `title` 은 앞뒤 공백을 지우고 저장해요. 비었거나 공백뿐이면 `400 VALIDATION_ERROR`(`field=title`). 수정도 같은 규칙이에요.

Optional body: `description`, `imageUrl`, `listImageUrl`, `endsAt`, `deadlineAt`, `addressText`, `placeLatitude`, `placeLongitude`, `placeProvider`, `placeProviderId`, `costNote`, `rulesText`, `minLevelCode`, `maxLevelCode`, `genderRule`, `matchFormat`, `matchStyle`, `uniformColor`.

장소 4필드(`placeLatitude`/`placeLongitude`/`placeProvider`/`placeProviderId`)는 모두 있거나 모두 없어야 해요(일부만 오면 400 `PLACE_SNAPSHOT_INCOMPLETE`). 수정 때 `manualPlaceName` 을 보내면 장소 전체를 교체해요. 응답의 `place` 는 `{ name, address, latitude, longitude, provider, providerPlaceId } | null` 이고 `recent-venues` 항목에도 좌표·provider 가 실려요(어드민 모집글도 같은 필드).

Rules:

- active `owner` 또는 `ops` admin만 생성할 수 있으며 `support`는 `403 PERMISSION_DENIED`다.
- 생성된 행은 `hostTeamId=null`, `platformManaged=true`, `status=recruiting`인 독립 플랫폼 모집이다. `platformManaged`는 홈팀 유무로 계산하지 않고 `v1_team_matches.platform_managed`에 영구 저장한다.
- 조건 필드는 일반 팀매치 모집과 같은 검증·저장 계약을 사용한다. web은 총 비용/상대팀 비용을 일반 생성 화면과 같은 `총 {금액}원 · 상대팀 {금액}원` 형식의 `costNote`로 보낸다. 상대팀 금액이 총비용보다 크면 `400 VALIDATION_FAILED`다(위 `POST /team-matches` Rules의 `costNote` 항목과 같은 규칙).
- `deadlineAt`은 일반 모집처럼 선택 사항이며 입력한 경우 현재보다 이후이고 `startsAt`보다 빨라야 한다.
- 생성 시 Game, team schedule, application을 만들지 않는다.
- 첫 승인 전 공개 목록/상세 응답은 `platformManaged=true`, `hostTeam=null`을 반환하며 같은 종목의 관리 팀이 `POST /team-matches/:id/applications`로 신청할 수 있다. 첫 승인 뒤에는 모집 상태를 유지하면서 `hostTeam`에 예약된 HOME 팀을 반환한다.
- 같은 `clientCommandId`와 같은 payload 재시도는 기존 결과를 반환한다. 같은 키의 다른 payload는 `409 IDEMPOTENCY_CONFLICT`다.
- 성공 응답은 `teamMatchId`, `status=recruiting`, `detailRoute`(관리자 상세), `replayed`를 포함한다.

## POST /admin/team-matches/:id/applications/:applicationId/approve

플랫폼 모집에 접수된 신청을 한 팀씩 승인한다. 첫 승인 팀은 HOME으로 예약되고, 두 번째 승인 팀은 AWAY로 배정되면서 경기가 확정된다.

Required body:

- `clientCommandId` (UUID, 재시도 멱등 키)

Rules:

- 대상은 리그·토너먼트에 속하지 않은 `recruiting` 플랫폼 모집이어야 한다.
- 선택 신청은 `requested` 상태여야 하고 신청 팀은 활성 상태이며 모집 종목과 같아야 한다.
- 첫 번째 승인에서는 해당 신청을 `approved`로 바꾸고 그 팀을 HOME(`hostTeamId`)으로 예약하되 팀매치는 `recruiting`을 유지한다. 동시에 일반 팀매치 모집과 같은 HOME + teamId 없는 AWAY placeholder Game과 HOME 팀 schedule을 만든다. 공개 목록/상세는 즉시 `승인된 HOME 팀 vs 모집 중`으로 표시하며, 승인된 팀 owner/manager는 두 번째 팀을 기다리지 않고 참석명단을 저장·제출할 수 있다.
- 두 번째 승인에서는 기존 Game의 AWAY placeholder와 revision-1 명단 스냅샷을 새 승인 팀으로 채우고 `approvedApplicantTeamId`를 연결한 뒤 팀매치를 `matched`로 바꾼다. Game을 새로 만들거나 HOME schedule을 중복 생성하지 않는다.

## POST /admin/team-matches/:id/applications/:applicationId/reject

- body는 UUID `clientCommandId`와 1~500자의 `reason`을 받는다.
- 플랫폼이 운영하는 단발 `recruiting` 팀매치의 `requested` 신청만 거절한다. 승인·철회된 신청은 변경하지 않는다.
- 신청을 `rejected`로 바꾸고 검토 관리자/시각, 거절 사유가 포함된 관리자 감사 로그를 기록한 뒤 신청 팀 owner/manager에게 알린다. Game이나 팀 일정은 만들지 않는다.

## PATCH /admin/team-matches/:id

- 생성 DTO의 모집 필드와 상세 조회에서 받은 `version`을 전송한다. 현재 구현에서는 종목을 바꿀 수 없다.
- 플랫폼이 운영하는 단발 `recruiting/closed` 팀매치를 수정할 수 있다. 마감 상태에서 일정·조건을 수정해도 `closed`를 유지하며, 모집 재개는 별도 상태 변경으로 한다. 연결된 SCHEDULED 팀 일정도 같은 트랜잭션에서 동기화한다. 응답 `status`는 저장된 `recruiting/closed`다. `version`이 최신 `updatedAt`과 다르면 `VERSION_CONFLICT`로 거절한다.
- 제목, 소개, 이미지, 지역, 장소/주소, 시작·종료·마감, 비용·규칙, 등급, 성별, 경기 형식·성격, 유니폼을 갱신하고 관리자 감사 로그를 남긴다.
- 배정 뒤에도 저장된 `platformManaged=true`는 유지된다. 공개 목록/상세는 실제 홈·원정 팀과 `플랫폼 주관` 출처를 함께 노출한다.
- 플랫폼 모집의 HOME/AWAY는 경기 사이드 식별자다. HOME 팀 owner/manager도 참석명단·채팅·경기 기록에는 참여하지만 모집 수정·마감·취소, 신청 승인/거절 권한은 얻지 않으며 이 운영 권한은 관리자에게 남는다. 따라서 공개 목록/상세의 `viewerState`/`viewer.state`도 플랫폼 HOME 팀에 `host_team`을 부여하지 않고 `viewer.manageRoute`는 `null`이다. `viewer.manageableHostTeam`은 HOME 사이드의 참가 기능 판정일 뿐 모집 관리 권한이 아니다.
- 두 번째 승인 때 나머지 `requested` 신청을 `rejected`로 전환한다.
- 첫 승인과 HOME Game side/placeholder AWAY side/HOME schedule, 두 번째 승인과 AWAY side hydration/AWAY schedule/application·team-match 상태 로그/admin action log는 각각의 승인 트랜잭션 안에서 원자적으로 기록한다.
- 성공 응답은 `applicationId`, `applicantTeamId`, `applicationStatus`, `teamMatchId`, `teamMatchStatus`, `approvedCount`, nullable `gameId`/`homeTeamId`/`awayTeamId`, `detailRoute`, `replayed`를 포함한다.

## GET /team-matches (TeamMatchesQueryDto)

Public discovery history (Task 178): when `status` is omitted, the list keeps `completed` team matches visible for a rolling seven days from `completedAt` (`gte now - 7 days`). A legacy completed row without `completedAt` falls back to `startAt`. An explicit `status=completed` query remains an unrestricted history query, while `sort=recommended` continues to exclude completed matches and only recommends recruiting or live matched games. Completed cards must render as `경기 종료`, not `신청 마감`.

Query:

| Field | Type | Required | Notes |
|---|---|---|---|
| `sportId` | uuid | No | `v1_master_sports.id` |
| `query` | string | No | title/description/place/team 검색 |
| `genderRule` | string | No | `성별 무관`, `남`, `여`, `무관`만 받는다(그 외 400, `무관`은 `성별 무관`과 같은 필터). 작성·수정 본문은 `무관` 없이 정본 세 값만 받는다. 응답은 옛 별칭(`any`·`무관`)을 `성별 무관`으로 접고, 정본이 아닌 저장값은 `null`이다. 목록 필터 `genderRule=성별 무관`(또는 `무관`)은 별칭으로 저장된 행도 포함한다 |
| `levelCodes` | comma string | No | `beginner,novice,intermediate,advanced` 중 다중 선택 |
| `regionId` | uuid | No | — |
| `status` | recruiting/closed/matched/cancelled/completed/expired | No | 기본 recruiting |
| `teamId` | uuid | No | host 또는 applicant team 기준 |
| `sort` | recommended/latest/starts_at/deadline | No | 생략 시 경기일 순 |
| `view` | card/compact | No | — |
| `cursor` | string | No | cursor pagination |
| `limit` | int(1~50) | No | default 20 |
| `today` | boolean(`true`/`false`) | No | `true` 이면 오늘(KST) 시작하는 경기만 |
| `recruitingOnly` | boolean(`true`/`false`) | No | `true` 이면 지금 신청할 수 있는 글만(모집 중·시작 전·신청 마감 전) |
| `includeFacets` | boolean(`true`/`false`) | No | `true` 이고 커서가 없을 때만 `pageInfo.totalCount`·`facets` 를 계산해 싣는다. 생략·`false` 면 집계 쿼리를 돌리지 않는다 |

응답: `{ items, pageInfo, facets? }`

**첫 페이지 건수 (`totalCount` · `facets`)**: **`includeFacets=true` 를 보낸 첫 페이지(커서 없음, 깨진 커서를 첫 페이지로 읽은 경우 포함)** 응답에만 `pageInfo.totalCount` 와 최상위 `facets` 가 실린다. 요청하지 않았거나 다음 페이지(`cursor` 있음)면 둘 다 싣지 않고 집계 쿼리도 돌리지 않는다. 클라이언트는 화면의 주 목록 쿼리에서 첫 페이지에 한 번만 보내 값을 보관하고, 폴링·`allQuery`/`filteredQuery`/`countQuery` 같은 부가 조회에는 보내지 않는다.

- `pageInfo.totalCount`: 목록과 **같은 where**(공개·삭제·호스트 팀 상태 규칙 포함)로 센 전체 건수. `limit` 과 무관하다.
- `facets.sports`: `{ sportId, count }[]`(건수 내림차순, 0건 종목 생략). 종목 필터만 뺀 나머지 필터로 센다 — 종목을 하나 골라도 다른 종목 칩 건수가 그대로 남는다.
- `facets.today` / `facets.recruiting`: 나머지 필터는 그대로 두고 해당 토글을 켠 건수. 토글이 꺼져 있어도 "켜면 몇 건"을 알려 준다.
- 쿼리는 요청한 첫 페이지에 `groupBy` 1회와 `count` 2회(총 3회)이며 `status`·`startAt`·`sportId` 인덱스를 탄다.

Rules:

- `status`를 생략한 일반 탐색은 경기 시작 전인 `recruiting`, `closed`, `matched`를 포함한다.
- 기본 목록(그리고 `recommended`/`deadline`/`starts_at`)은 경기일 순이다: 시작 전 경기를 `startAt ASC` 로 먼저, 이미 시작한 경기를 `startAt DESC` 로 그 뒤에, 일정 미정(`startAt` null)을 `createdAt DESC` 로 맨 뒤에 잇는다(동률은 `createdAt DESC, id DESC`). `latest` 만 `createdAt DESC, id DESC` 등록 최신순이다.
- `pageInfo.nextCursor` 는 `"<구간>:<id>@<기준 시각 epoch ms>"`(`upcoming:`/`past:`/`unscheduled:`, 최신순은 시각 없는 `latest:<id>`) 형태다 — 기준 시각 규칙(구간 분할에만 사용, 공개 범위는 요청 시각 판정, 미래 값은 요청 시각으로 내림, 깨진 값은 첫 페이지부터, 시각 없는 구형 커서는 요청 시각 기준)은 개인매치 목록과 같다. 커서 행이 그사이 목록 조건을 벗어나도 다음 경기를 건너뛰지 않는 것도 같다.
- 일반 목록은 신청 마감 시각에 도달한 일반 미매칭 모집도 `closed` 상태로 경기 시작 전까지 노출한다. 신청 마감이 없더라도 시작 시각이 지난 미매칭 모집은 `closed`다. 기본 탐색에서는 기존 시작 후 제외 규칙을 따른다. 취소·보관된 팀매치는 명시적인 status 필터에서도 노출하지 않으며 건수/facets에도 포함하지 않는다.
- `status=closed`는 저장된 `closed`와 마감 시각이 지난 일반 미매칭 `recruiting`을 포함하며, `status=recruiting`은 마감이 남았거나 마감 시각이 없는 모집만 포함한다. 검색 결과도 같은 필터를 적용한다.
- `sort=recommended`는 경기 시작 전인 raw `recruiting` 중 신청 마감이 없거나 아직 지나지 않은 항목만 포함한다. 신청 가능 목록과 `facets.recruiting`도 마감 시각과 같아지는 순간부터 제외한다.
- `teamId`는 `hostTeamId = teamId` 또는 `applications.some(applicantTeamId = teamId)` 둘 중 하나를 만족하면 포함
- `platformManaged`는 생성 출처를 뜻하며 팀 배정 후에도 `true`다. `hostTeam`/`approvedOpponentTeam`은 현재 배정된 실제 양 팀을 별도로 반환한다.
- Level response fields: `levelLabel`, `minLevel`, `maxLevel`
- List and detail responses include `hostTeam.mannerScore` and `hostTeam.wins`.
  - `mannerScore` is the live aggregate of publicly revealed team-match reviews and is `null` when no score is publishable.
  - `wins` counts only the team's current official result facts whose result is `WON`; draft and superseded revisions are excluded.
- Detail team identity cards additionally use `hostTeam` / `approvedOpponentTeam` fields `sportName`, `levelLabel`, `ratingScore`, `ratingCount`, and `wins`.
  - `sportName` and `levelLabel` come from the team's own sport/profile settings, not the team-match recruitment conditions.
  - `ratingScore` is the general team review rating shown on the public team detail: every publicly revealed team-target review source is eligible, and ratings are folded by sport × reviewer team before averaging. With no publishable review it is `null`, not `0`.
  - `ratingCount` is the number of folded sport × reviewer-team opinions, and `wins` keeps the official-current-result rule above.
  - `platformManaged`, league membership, and match sport/level remain match-level fields and must not be presented as attributes of either team.
- `GET /team-matches/:teamMatchId/applications` returns the same team-card fields (`sportName`, `levelLabel`, `ratingScore`, `ratingCount`, `wins`) for each applicant. Legacy `score`/`matchCount` remain response-compatible but are not the detail card's team-rating/win source.

## GET /team-matches/:teamMatchId — 취소 리그 경기 공개

공개 일정에 남는 취소 리그 경기(`leagueId`가 있는 `cancelled` 경기)는 상세도 `200`으로 제공하며 `status=cancelled`를 유지한다. 일반 친선 모집 취소와 보관 경기, 비공개 리그, 삭제 경기, 미배정 대진은 기존 `404` 차단을 유지한다. 이 예외는 상세 조회에만 적용하며 신청 자격·신청 및 참석명단·경기 기록의 취소 차단을 완화하지 않는다. 리그 상세의 `lifecycle.canEdit`·`canDelete`는 `false`다.

공개 일정과 공개 경기 기록의 상태는 대진 취소를 게임의 `SCHEDULED`·`LIVE`·`ENDED`보다 우선해 `cancelled`로 반환한다. 취소 이외 상태의 게임 우선 매핑은 유지한다.

## POST /team-matches

Body: `CreateTeamMatchDto`

Required:

- `hostTeamId`
- `sportId`
- `regionId`
  - Required non-empty string; accepts stable catalog slugs such as `region-seoul-jongno`.
- `title`
  - Required, ≤100자. 앞뒤 공백을 지우고 저장하며, 비었거나 공백뿐이면 `400 VALIDATION_ERROR`(`field=title`). `PATCH` 도 같은 규칙.
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
- `imageUrl`(상세용 가로형)과 `listImageUrl`(목록용 정사각형)은 모두 선택 사항이다. 일반·관리자 생성/수정은 `/uploads`가 반환한 루트 상대 URL을 저장하고, 미선택 상태를 `null`로 보낸다. `V1TeamMatch.listImageUrl`은 nullable `v1_team_matches.list_image_url`에 저장된다.
- 목록·상세·일반 수정 form·관리자 상세 응답은 두 이미지 값을 반환한다. 각 화면은 자기 이미지 → 다른 화면 이미지 → 종목 기본 이미지 순서로 표시한다. 기존 `imageUrl` 한 장만 있는 row는 양쪽 화면에서 계속 사용하므로 기존 사진의 일괄 복사/변경이 필요 없다.
- 수정 요청의 `listImageUrl` 생략은 기존 목록 이미지를 유지하고, 명시적 `null`/빈 문자열은 목록 이미지를 제거한다. 기존 `imageUrl` 쓰기 계약은 유지한다. 기본 이미지는 화면에서만 선택하며 DB에 업로드 사진처럼 저장하지 않는다.
- `costNote`가 `총 {금액}원 · 상대팀 {금액}원` 형식이고 상대팀 금액이 총비용보다 크면 `400 VALIDATION_FAILED`(`details.field=costNote`, "상대팀 부담금은 총비용보다 클 수 없어요.")다. 일반·관리자 생성과 수정 모두 같다. 이 형식이 아닌 자유 서술 `costNote`는 검사하지 않는다. 같은 `clientCommandId`로 이미 만들어진 모집을 다시 보내는 재시도는 이 검사 전에 저장된 결과를 돌려준다.
- `deadlineAt`은 선택 사항이며 새로 설정할 때 현재보다 이후이고 `startsAt`보다 빨라야 한다. 수정 시에는 저장된 기존 마감 시각을 그대로 유지할 수 있다. `v1_team_matches.deadline_at`에 저장되고 목록·상세·수정 응답에 동일하게 반환된다.

## PATCH /team-matches/:teamMatchId (UpdateTeamMatchDto)

- 요청자는 host team `manager+`(owner/manager), `version: string` 필수
- `title`, `description`, `imageUrl`, `listImageUrl`, `startsAt`, `endsAt`, `deadlineAt`, `manualPlaceName`,
  `addressText`, `costNote`, `rulesText`, `genderRule`, `minLevelCode`, `maxLevelCode` 등 모집글
  필드를 부분 수정한다.
- `403`: host team 권한 없음 / `404`: team-match 없음 / `409`: 현재 상태에서 수정 불가(버전 충돌 포함)

## POST /team-matches/:teamMatchId/close · /reopen

- host team owner/manager 전용, body `{ reason?: string | null }`
- `close`는 팀매치를 `closed`로 바꾸고 새 신청을 거절하며 대기 중이던 신청을 `expired`로 정리한다.
- `reopen`은 현재 시각이 `startAt`보다 이른 `closed` 팀매치만 되돌린다. `startAt`과 같은 순간부터는 재개할 수 없고, 상세 `canReopenRecruitment`도 같은 경계를 사용한다. 만료된 신청은 자동 복구되지 않는다.

## POST /team-matches/:teamMatchId/applications

Body: `{ applicantTeamId: uuid; message?: string | null }`

Rules:

- 신청 팀은 사용자가 아니라 팀이며, 요청자는 신청 팀의 `manager+`여야 한다.
- host team은 자기 자신에게 신청할 수 없다.
- `deadlineAt`과 같거나 지난 시각부터 새 신청 가능 여부 응답은 `NOT_RECRUITING`이다. 이미 접수된 `requested` 신청은 기록과 검토 대상에 남으며, 매치 시작 전까지 일반 승인과 관리자 개별 승인이 가능하다.
- `409`: 같은 팀이 같은 모집글에 중복 신청

## Approve / Reject / Withdraw

### POST /team-match-applications/:applicationId/approve

- host team owner/manager 전용
- 팀매치 행을 잠그고 다시 읽은 뒤 아직 `requested`인 신청만 조건부로 `approved`로, 팀매치를
  `matched`로 바꾼다 — 동시 승인 요청이 두 팀을 승인하는 일은 없다.
- 남은 `requested` 신청은 같은 트랜잭션에서 자동 `rejected`로 전환되고 각각 상태변경 로그와
  신청 팀 관리자 알림이 남는다.
- `matched`는 매치 단위 상태일 뿐, 조회하는 팀이 승인됐다는 증명이 아니다. 채팅 진입은
  `viewer.canChat`의 서버 판정을 따른다. 신청서를 제출한 개인의 `viewer.state`로 판단하지 않는다.
- 상세 `viewer.canChat`은 배정된 HOME/AWAY의 활성 owner/manager 또는 해당 플랫폼 모집을
  만든 활성 owner/ops 운영자를 허용한다. 플랫폼 모집은 생성부터 운영자 채팅방을 만들고,
  첫 팀·두 번째 팀 승인마다 해당 팀 운영진을 추가한다. 일반 팀매치는 양 팀 확정 후 허용한다.
  취소·만료·삭제 또는 운영 권한 회수 뒤에는 차단한다. 다른 관리자에게 채팅 접근을 일괄
  허용하지 않는다. 상세 계약은 `chat.md`를 참조한다.

### POST /team-match-applications/:applicationId/reject

- host team owner/manager 전용, 해당 신청만 `rejected`로 전환한다.

### POST /team-match-applications/:applicationId/withdraw

- 신청 팀 owner/manager 전용, `requested` 신청만 철회할 수 있다.
- withdraw/reject/재신청은 모두 기대 상태 기반 전이를 쓰므로 동시에 끝난 종료 상태를 덮어쓰거나
  이중 성공으로 잘못 보고하지 않는다.

## 완료(complete) — Task 16에서 제거됨

이 도메인에는 독립된 "완료" mutation이 없다. `matched` 팀매치는 host team owner/manager가 검증된
결과 revision을 제출하는 부수효과로만 `completed`가 된다 — [Games](./games.md)의
`POST /api/v1/games/:gameId/result-revisions/:revisionId/submit` 참조. 그 라우트가 같은 트랜잭션
안에서 `completedAt`을 설정하고 Game을 종료하며 후기 화면을 연다. 상대 팀은
`.../decision`으로 제출된 결과를 승인하거나 정정을 요청한다.

`GET /team-matches/:teamMatchId`는 `gameId`(1:1 `V1Game.id`)를 포함한다 — 클라이언트가
`/games/:gameId/result-revisions*`를 호출하는 데 필요한 유일한 경로다. `GET
/team-matches/:teamMatchId/lineup`의 참가자 항목은 저장된 명단 또는 첫 기록에 사용할 기본 명단의 참가자 UUID를 포함해 호스트가
결과 초안에서 자기 팀 로스터의 특정 참가자에게 득점/카드를 귀속시킬 수 있다.

체크인·쿼터별 점수 입력·상대 평가·심판 배정 API는 이 도메인에 존재하지 않는다 — 예전 v0 계약의
잔재였다. 경기 결과·평가는 [Games](./games.md)와 리뷰 도메인의 result-revision/decision 흐름을
따른다.

## Team-match lineup

- `GET /team-matches/:teamMatchId/lineup` reads the viewer's team lineup.
- `PUT /team-matches/:teamMatchId/lineup` saves through `TeamMatchLineupService`: a draft stays `DRAFT`, but once the latest revision is `SUBMITTED`/`LOCKED` the save creates a new `SUBMITTED` revision directly (Task 180 R-2, see "제출 뒤 저장" above).
- Host team owners/managers may read and save the HOME lineup while the match is still recruiting and no opponent has been approved. The Game's AWAY side remains a teamless placeholder until approval.
- Team owners/managers select active team members directly for the attendance roster. Team-schedule RSVP (`GOING`, declined, or no response) does not gate lineup eligibility; active membership is the server-enforced requirement. The RSVP is echoed read-only as `eligibleMembers[].rsvpStatus` (Task 180 H5). A member who is also an active member of the opponent team is flagged `eligibleMembers[].alsoOpponentMember` (Task 180 W4-V4) — informational only; saving that member on both sides is not rejected.
- Opponent-side lineup access and change requests require an approved opponent team. The opponent's numbers and names are readable only after the public lineup time (`GET .../lineup/opponent`, see "첫 기록 뒤 추가만" above).
- Scheduled games remain editable regardless of wall-clock kickoff. LIVE/PAUSED games remain editable only while either side's latest lineup is incomplete and no event/shared-record/result revision exists. The GET response's `editable`/`lockReason` is the client source of truth.
- Goalkeeper is an independent per-participant designation: multiple participants or no participant may be marked as goalkeeper.

### 미제출 친선의 기본 참석명단 (MD-QA #146)

`leagueId`와 `tournamentId`가 모두 없는 친선에 적용한다. 현재 참가팀의 활성 멤버십, 활성·미삭제 팀과 활성·미탈퇴 계정만 기본 출전자로 계산한다. 생성 당시 스냅샷이나 RSVP 응답으로 자격을 대신하지 않는다. 양 팀은 각자의 최신 명단과 제출 이력으로 독립적으로 판정한다.

자기 팀 `GET /team-matches/:teamMatchId/lineup` 응답은 기존 `state`, `revision`, `version`, `editable`, `lockReason`과 함께 다음 필드를 반환한다. `version`은 계속 명단 계보의 `revision`이며 `expectedVersion`에 그대로 보낸다.

| 필드 | 값 | 의미 |
|---|---|---|
| `effectiveRosterSource` | `MANUAL` | 최신 유효 명단이 실제 `SUBMITTED`/`LOCKED`. 제출된 선수만 기록에 사용한다. |
| `effectiveRosterSource` | `DEFAULT_PREVIEW` | 실제 제출 이력·정정 요청이 없는 최신 유효 `DRAFT`. 기록에는 현재 자격을 만족하는 전체 팀원을 사용한다. |
| `effectiveRosterSource` | `DEFAULT_FROZEN` | 첫 기록 저장 때 고정된 기본 명단. 행의 상태는 `DRAFT`이며 이후 팀원 변화로 다시 계산하지 않는다. |
| `effectiveRosterSource` | `BLOCKED` | 명단 없음·무효화·과거 제출 뒤 다시 열린 초안·정정 검토 등으로 기본 명단을 사용할 수 없다. 과거 제출 이력을 기본 명단으로 우회하지 않는다. |
| `hasSavedDraft` | `boolean` | `DEFAULT_PREVIEW`에 사람이 저장한 편집 초안이 있는지. `true`이면 자기 명단 GET은 저장된 선택·게스트·배치를 보존하고, 실제 제출 전 경기 기록은 계속 현재 기본 명단을 사용한다. |

공유 프론트 타입 `V1TeamMatchLineup`의 두 필드는 대회·상대·구버전 응답과의 호환을 위해 optional이다. 현재 친선 자기 명단 GET은 두 값을 함께 반환하며, `state=DRAFT`만으로 실제 기록 명단이나 준비 여부를 추정하지 않는다. 공동 기록 GET의 `lineupReady`·`missingSides`, 명단 GET의 `editable`·`lockReason`은 서로 다른 계약이다.

- **조회**: 자기 명단·공동 기록·Game 라인업 GET은 기본 명단을 계산만 한다. 조회로 명단 revision, 참가자, identity/consent, 감사 행을 생성하거나 `SUBMITTED`로 바꾸지 않는다. 기본 참가자 `id`는 Game·side·기준 명단·계정 범위의 안정적인 UUID이며, 같은 기본 명단의 첫 기록 저장에 그대로 사용한다. 저장 전 자격이 바뀌면 다시 조회해야 한다.
- **저장과 실제 제출**: `PUT .../lineup`은 미제출 편집 초안을 `DRAFT`로 보존한다. 저장 초안 없이 `POST .../lineup/submit`하면 그 순간의 자격을 만족하는 기본 명단을 후속 `SUBMITTED` revision으로 제출하며 조회에서 받은 UUID·도착 확인을 유지한다. 저장 초안이 있으면 그 선택만 재검증해 제출하고 전체 기본 명단으로 덮지 않는다. 포함된 계정이 현재 자격을 잃었으면 `422 LINEUP_PARTICIPANT_INELIGIBLE`이다. 실제 제출은 기존 공개 시각·포함 알림을 처리하며 상대 팀 명단을 제출하거나 고정하지 않는다. 이미 제출한 뒤의 저장·멱등 재제출은 위 Task 180 R-2를 따른다.
- **첫 기록**: 양 팀 모두 유효한 기본 명단 또는 실제 제출 명단이 있고 한 명 이상이어야 기록할 수 있다. 권한·상태·버전·참가자 검증을 통과한 첫 기록 mutation만 기존 Game 행 잠금과 같은 트랜잭션에서 기본 명단의 후속 `DRAFT`와 참가자를 append한다. 참가자 UUID와 도착 확인을 유지하고 source identity link·기존 공개 제외 동의를 승계하며 `SYSTEM`의 `FRIENDLY_DEFAULT_ROSTER_FROZEN` 감사를 남긴다. 사람의 제출 시각·제출 사실을 만들지 않고, 기존 초안·참가자·identity/consent 이력을 수정하거나 삭제하지 않는다. 실패한 요청은 고정도 롤백된다. 기록 이후 일반 저장·제출은 기존 `LINEUP_LOCKED_FOR_DIRECT_EDIT` gate를 따른다.
- **오류·멱등성**: 양 팀 준비가 안 되면 기록은 `409 ROSTER_INCOMPLETE`, 선택한 참가자가 현재 유효 명단에 없으면 `422 PARTICIPANT_INVALID`다. 명단 저장·제출·정정 요청은 기존 `Idempotency-Key`와 `expectedVersion`을 사용한다. 키 누락은 `422 IDEMPOTENCY_KEY_REQUIRED`, 다른 payload로 재사용하면 `409 IDEMPOTENCY_PAYLOAD_CONFLICT`, revision 충돌은 `409 VERSION_CONFLICT`다. 공동 기록은 별도의 body `commandId`·`expectedVersion`과 위 재실행 규칙을 유지한다. 이 명단 조회에는 pagination이 없다.
- **공개·상대 명단**: 기본 명단을 계산해도 상대 제출 상태는 바꾸지 않는다. `opponent.submitted`와 `GET .../lineup/opponent`는 계속 실제 제출본과 공개 시각을 기준으로 하며, 기본 명단만 있으면 상대 조회는 `404 OPPONENT_LINEUP_NOT_SUBMITTED`다. 공동 기록의 일반 공개 응답은 참가자 배열을 비우고, 권한 있는 기록 조회도 공개 시각 전에는 상대의 기본 preview/frozen 참가자를 숨긴다. 기본 명단으로 실명·전화번호·동의 없는 공개 개인 기록을 추가하지 않는다. Game 조회·도착 확인의 범위는 [Games](./games.md#미제출-친선-명단-조회기록도착-확인-md-qa-146)을 따른다.

`late-additions`는 `DEFAULT_FROZEN`의 최신 `DRAFT`도 허용한다. 서버는 `GAME` 범위의 `SYSTEM` 감사에서 action·systemActor가 모두 `FRIENDLY_DEFAULT_ROSTER_FROZEN`이고 `requestId`가 정확히 `${gameId}:${ownLatestLineupId}`인 경우만 고정 출처로 인정한다. 화면은 상태를 직접 조합하지 않고 `lateAdditionAllowed`를 사용한다. 현재 권한·최신 명단·기록 단계·결과 revision 없음 조건을 계속 확인하며, 추가한 뒤에도 명단은 `DRAFT`이고 사람의 제출 이력을 만들지 않는다.

대회·리그는 참가 등록·경기 조정·결장·출전정지 계산을 계속 사용한다. 이 친선 기본 명단으로 대회 참가 등록을 전체 팀원으로 대체하지 않는다.

## Frontend Mapping Notes

- `V1TeamMatchStatus`는 `recruiting`, `closed`, `matched`, `cancelled`, `completed`, `archived`뿐이다 — `scheduled`/`checking_in`/`in_progress`는 v0 계약의 잔재이며 이 컬럼에 존재하지 않는다.
- `/my/team-matches`, `/teams/:id/matches`는 history 조회 시 다중 `status` query를 명시적으로 넘겨야 한다
- 수정 UI는 `PATCH /team-matches/:teamMatchId`, 취소는 `POST /team-matches/:teamMatchId/cancel`을 사용한다
- 목록 필터 URL은 `levelCodes`를 canonical source로 사용한다. legacy `levels` query는 읽기 호환만 유지한다.
- 레벨 표시 텍스트는 `formatNote`가 아니라 `minSportLevelId`, `maxSportLevelId` FK에서 계산한 `levelLabel`을 사용한다.

## Source References

- `apps/v1_api/src/team-matches/team-matches.controller.ts`
- `apps/v1_api/src/team-matches/team-matches.service.ts`
- `apps/v1_api/src/team-matches/team-match-lineup.service.ts`
- `apps/v1_api/src/team-matches/team-match-record.service.ts`
- `apps/v1_api/src/games/roster/friendly-team-match-default-roster.ts`
- `apps/v1_api/src/team-matches/dto/*.ts`
- `apps/v1_api/src/sports/level-range.ts`
- `apps/v1_web/src/hooks/use-v1-api.ts`
- `apps/v1_web/src/types/api.ts`

Task 172 공개 기록은 기존 가시성 정책과 `PUBLIC_LIVE` 플래그를 적용한다. 비참가자의 `sides[].score`는 비공개 시 `null`이며, `HIDDEN`은 404다. `STATUS_ONLY`는 점수를 숨기고, `OFFICIAL_ONLY` 및 플래그가 꺼진 `LIVE`는 최종 확정 후에만 점수를 반환한다. 라인업·이력·팀별 확인 정보는 참가자에게만 반환한다.

### 일반/관리자 날짜·확정 공통 계약 (Task 149)

- 두 생성 API는 `validateTeamMatchDates`를 공유한다. 시작은 미래, 종료는 시작 이후, 새 마감은 현재 이후·시작 이전이어야 한다. 잘못된 종료값을 `null`로 바꾸어 성공시키지 않는다.
- 일반 생성/수정 폼도 종료 날짜를 지정할 수 있다. 비워두면 시작 날짜를 사용하며, 명시한 종료 날짜에는 종료 시간이 필요하다. 로컬 날짜·시간을 ISO로 변환하고 수정 시 같은 로컬 날짜로 복원한다.
- 일반/관리자 스타일 입력은 프리셋과 직접 입력을 함께 지원하며 최대 3개다.
- 신청 마감은 **새 신청 접수**를 닫고, 일반 미매칭 모집은 API에서 `closed`로 표시한다. 기존 `requested` 신청은 저장 상태가 `recruiting`이고 시작 전이면 일반 승인과 관리자 개별 승인이 가능하다. 신청 마감 시각이 지났다는 이유만으로 기존 신청을 만료하거나 승인을 막지 않는다. 수동 마감(`closed`), 취소, 상대팀 확정, 경기 시작 이후는 승인 불가다. 일반 신청 목록의 `canApprove`도 이 조건과 같다.
- `platform_managed` migration과 후속 `20260921141000_v1_platform_recruitment_host_constraint`가 필요하다. 후자는 기존 CHECK를 트랜잭션 안에서 확장해 플랫폼 모집만 host 없이 허용하고 생성자·지역·장소·시작 필수값은 유지한다. 일반 모집은 여전히 host가 필요하다.

MSW 기본 명단 픽스처는 `DRAFT`·`DEFAULT_PREVIEW`·`hasSavedDraft=false`를 구분한다. 공동 기록 mock의 권한·상태·오류 gate를 실제 API 성공의 근거로 쓰지 않는다. 실제 공동 편집·기본 명단 고정 검증은 API 통합 픽스처와 headed 브라우저 흐름을 사용한다. 테스트 성공을 흉내내는 mock 확정 처리는 제공하지 않는다.

## 공동 경기 기록 서브매치 (Task 173)

`GET /team-matches/:id/record`는 `subMatches[]`를 순서대로 반환한다. 각 항목은 `id`, `title`, `order`, 양 팀의 `scores[]`를 포함한다. 최상단 `sides[].score`는 모든 득점의 합이며 서브매치 점수의 합과 같다.

권한 있는 기록 조회의 `participants[]`에는 유효 명단의 `id`, `sideId`, `name`, `jerseyNumber`, `profileImageUrl`이 포함된다. 미제출 친선의 기본 명단과 공개 시각 전 상대 명단 제한은 MD-QA #146 절을 따른다. 직접 연결된 `userId`와 현재 identity link를 모두 해석하며, 공개 응답은 기존처럼 빈 배열이다.

`POST /team-matches/:id/record`의 기존 버전 CAS와 `commandId` 멱등 계약을 그대로 사용한다.

- `submatch_add`: `title`을 받는다. 첫 서브매치를 만들 때 기존 직접 득점은 새 서브매치에 귀속되어 합계가 유지된다.
- `submatch_edit`: `subMatchId`, `title`을 받는다.
- `submatch_delete`: `subMatchId`를 받는다. 득점이 있으면 `SUBMATCH_HAS_GOALS` 409를 반환한다.
- `add` / `edit`: 서브매치가 있으면 유효한 `subMatchId`가 필수다.

서브매치 또는 득점 변경은 기존 종료 확인을 취소한다. 양 팀 라인업 참가자가 같은 버전을 확인하면 `score.home`, `score.away`, 선택적인 `score.subMatches[]`를 가진 공식 결과 revision 하나를 만든다. 팀 전적과 참가자 출전·득점은 팀매치 전체에서 한 번만 집계한다.


## 팀매치 마감·취소 및 주최팀 삭제 계약 (Task 181, 2026-10-13 개정)

취소·보관·삭제된 매치의 참석명단/상대 명단 및 일반 사용자 경기 기록 조회도 404로 처리한다. 취소·보관된 원본 경기 기록은 활성 관리자(현재 계정도 active)에게만 기존 조회를 허용하고, 데이터를 삭제하지 않는다. 취소된 기록이 수정 가능 상태가 되지는 않는다.

- 일반 미매칭 `recruiting/closed`는 신청 마감 시각(`deadlineAt`) 또는 경기 시작 시각(`startAt`)이 지나면 `closed`로 표시한다. 팀매치 API는 `on_hold`를 반환하지 않는다. 리그·대회·상대팀 확정 모집의 기존 `displayState` 마감 규칙은 유지한다. `requested` 신청은 확정 상대팀이 아니다. terminal/matched 상태는 이 계산으로 덮어쓰지 않는다.
- 마감된 매치는 아래 자동 취소 전까지 일정 변경 후 다시 모집하거나 취소할 수 있다. 상대팀 없는 팀매치를 그대로 진행하는 액션은 제공하지 않는다.
- `GET /team-matches/:id`의 `lifecycle`은 `canEdit/canDelete/canCloseRecruitment/canReopenRecruitment/onHoldReason=null`을 제공한다. 기존 owner/manager 권한 검증을 유지한다. 경기 시작 시각이 지난 raw `recruiting` 글은 수동 마감할 수 없고 대기 신청 종료·알림을 보내지 않는다. 신청 마감 시각과 같거나 지난 raw `closed` 글은 일반 주최팀 재개 API에서 마감 시각을 수정한 뒤 다시 재개해야 한다.
- `PATCH /team-matches/:id`는 recruiting/closed + 상대팀 미확정에서 허용. 미래 일정 및 stale version 검증 후 recruiting으로 저장하고 연동 팀 일정을 동기화한다. 이미 matched인 매치는 계속 수정 제한.
- `POST /team-matches/:id/cancel`은 마감에서도 허용. 신청 이력, 감사 로그, 확정 상대팀 알림 및 연결 팀 일정 취소를 유지한다. 취소 후 사용자 목록·내 팀매치에서 제외하고 상세/관리/신청 자격은 404로 처리한다. 취소된 팀매치와 연결된 팀 일정·내 일정도 숨긴다. 어드민 목록·상세와 감사 이력은 유지한다.
- `DELETE /team-matches/:id`: 인증 + 주최팀 기존 관리 권한. 사용자에게 보이는 recruiting/closed이고 확정 상대팀과 **모든 신청 이력**이 없을 때만 archived/deletedAt soft delete 및 감사 로그. 연결 팀 일정은 취소한다. 신청 이력이 있으면 409 STATE_CONFLICT로 취소를 안내한다. 취소된 매치는 이미 사용자 조회에서 제외된다.
- 신청/승인/수정/취소/삭제는 team-match row lock 아래 상태를 재검사한다. 수정 stale version은 409 VERSION_CONFLICT.
- 별도 DB enum/backfill 없이 조회 시 `closed`를 계산한다. 공개 목록과 내 팀매치 목록의 `closed` query는 저장된 closed와 마감/시작 시각이 지난 일반 미매칭 recruiting을 함께 반환한다. `recruiting` query는 마감 전 모집만 반환한다. 취소·보관된 행은 모든 사용자 status query에서 제외된다. 기존 expired query 호환 계약은 유지.
- **상대 없이 끝난 일반 팀매치 자동 취소(2026-10-21)**: 워커가 5분마다 `TEAM_MATCH_NO_OPPONENT_SCAN`(outbox 자기 예약 스캔, `team-match-no-opponent-cancel.service.ts`)으로 리그·대회 대진이 아닌 `recruiting`/`closed`·상대 미확정 매치를 찾아 `cancelled`로 바꾼다.
  - 신청 마감 시각이 지났고 대기(`requested`) 신청이 없으면 그때, 대기 신청이 있으면 팀장이 승인할 수 있게 기다렸다가 경기 시작 시각에 취소한다. 마감 시각이 없으면 시작 시각에 취소한다.
  - 행은 지우지 않는다. 대기 신청은 `expired`, 연결된 SCHEDULED Game·팀 일정은 취소, 상태 이력은 `actorType=system`·`reason=no_opponent_auto_cancelled`.
  - 1팀(일반 매치의 주최팀, 플랫폼 매치의 먼저 승인된 팀)이면 그 팀과 대기 신청 팀 owner·manager에게 `team_match_cancelled` 알림(딥링크 `/team-matches`, businessKey `team-match-no-opponent:{teamMatchId}:{userId}`, 야간에는 알림함만). 0팀이면 알림이 없다.
  - 경기 시작이 지났고 끝난 지 24시간이 지난 매치(배포 전에 쌓인 것)는 알림 없이 취소만 한다. 경기 전인 매치는 마감이 오래전이어도 알린다.
  - 자동 취소되면 일정 변경(`PATCH`)으로 다시 모집하는 길도 닫힌다 — 다시 모집하려면 새로 만든다.

- 일정·장소 변경 시 기존 requested 신청은 expired로 전환하고 `team_match_updated` 알림으로 재신청을 안내한다. 과거 신청 이력은 보존한다.
- 취소·삭제 시 연결된 SCHEDULED Game도 CANCELLED로 전환하여 팀 일정/경기 상태가 어긋나지 않게 한다.

## Managed record handoff ownership (2026-10-03)

`GET/POST /team-matches/:id/record` responses add `leagueId: string | null` and `tournamentId: string | null`. The response remains under the existing envelope and GET optional-auth / POST authorization and version gates are unchanged.

On the public `/team-matches/:id/record` screen, `phase=managed` hands off to `/league-matches/:leagueId/fixtures/:id` when `leagueId` exists, otherwise `/tournaments/:tournamentId/matches/:id`. League ownership wins when both IDs exist. The sanitized `from` parameter is preserved. `phase=legacy` displays the current official friendly result in the same read-only record screen; the admin record screen stays in its admin shell. Neither an existing official result nor a managed response grants shared record mutation permissions.
