# 위젯 contract

바탕화면·잠금화면 위젯과 실시간 표시(다이내믹 아일랜드·고정 알림)가 읽는 **내 팀 경기** 목록. 웹뷰의 로그인 쿠키를 위젯이 읽을 수 없어서, 앱이 받아 둔 **위젯 토큰**으로 부른다(캘린더 구독과 같은 `v1_access_tokens` 테이블, 종류 `widget`).

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| POST | `/me/widget-token` | 로그인 쿠키 | `{ token }` — 기기(앱 설치)마다 하나 받는다. 활성 토큰은 사용자당 10개까지이고, 넘으면 가장 오래된 것부터 폐기한다. |
| DELETE | `/me/widget-token` | 로그인 쿠키 | `{ revoked }` — 내 위젯 토큰을 **전부** 폐기한다(폰을 잃어버렸을 때처럼 그 기기에서 지울 수 없을 때). |
| GET | `/widget/games?limit=` | `Authorization: Bearer <위젯 토큰>` | 내 팀 경기 `{ items: WidgetGame[] }`. `limit` 1~10, 기본 3. |
| DELETE | `/widget/token` | `Authorization: Bearer <위젯 토큰>` | 이 기기의 토큰을 폐기한다(앱 로그아웃 때). |

**앱은 토큰을 한 번 받아 저장해 쓰고, 401 일 때만 다시 받는다.** 실행할 때마다 새로 받으면 한 기기가 토큰을 계속 쌓다가 10개 상한에서 다른 기기의 토큰을 밀어낸다.

토큰이 틀리거나 폐기됐거나 계정이 비활성이면 401 `WIDGET_TOKEN_INVALID`. 캘린더 토큰으로는 열리지 않는다(종류가 서명에 들어간다). `V1_SESSION_SECRET` 이 32자 미만이면 503 `WIDGET_NOT_CONFIGURED`.

## WidgetGame
`{ gameId, teamId, teamName, title, opponentName, scheduledAt, placeName, competitionKind, state, score }`

- `competitionKind`: `TOURNAMENT | LEAGUE | FRIENDLY`. `state`: `SCHEDULED | LIVE | PAUSED`.
- **정렬**: 진행 중(`LIVE`·`PAUSED`)이 앞, 그다음 다가오는 경기를 시각순(시각 미정은 뒤).
- **범위**: 내가 활성 팀원인 팀의 경기. 시작한 지 3시간 안의 경기까지 "다가오는" 목록에 남기고(홈 「다음 경기」와 같은 규칙), 3시간을 넘겨 길어지는 진행 중 경기는 따로 찾아 넣는다. 끝난(`ENDED`)·취소된 경기와 삭제된 경기·삭제된 대회·보류된 리그의 경기는 나오지 않는다(진행 중 경로에도 같은 조건을 건다). 삭제된 대회의 "다가오는" 경기 제외는 수집 경로(`LineupTodoService`)가 따르는 규칙이라 #2507 이 먼저 머지돼 있어야 한다.
- **`score`**: `{ mine, opponent }`(우리 팀 기준) — **진행 중이고 공개 경기 화면과 같은 규칙(`effectivePublicVisibilityMode`)이 `live` 일 때만**. 운영자가 가린 경기, `PUBLIC_LIVE` 킬스위치가 꺼진 환경, 시작 전 경기는 `null`. 취소(reverse)된 골은 세지 않는다(`tallyLiveScore`).

## 위젯 홈과 응답 저장 (2026-11-25)

위젯 토큰은 읽기만 하던 것에서 **읽기 + 내 참석 응답 저장**으로 넓어졌다. 응답 저장 외에는 쓸 수 있는 것이 없다.

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/widget/home` | Bearer 위젯 토큰 | `{ generatedAt, live, lastResult, pendingCount, pending, schedules }` — 실시간 경기·지난 경기·응답 대기·일정을 한 번에. |
| PUT | `/widget/schedules/:scheduleId/attendance` | Bearer 위젯 토큰 | `{ status: GOING \| MAYBE \| NOT_GOING }` → 앱의 `PUT .../attendance/me` 와 같은 응답. |

- **`live`**: 내 팀 경기 중 진행 중(`LIVE`·`PAUSED`, **시작한 지 12시간 안**)과 **공식 결과가 확정된 지 15분 안**(`ENDED`, 「방금 끝남」 — 종료 시각 컬럼이 없어 결과 리비전의 `createdAt` 으로 잰다. 결과를 정정하면 새 리비전이라 정정도 「방금」으로 다시 나온다). 진행 중이 앞이다. 점수(`score`)는 우리 팀 기준이고 공개 경기 화면과 같은 규칙으로만 준다 — 진행 중은 정책이 `live` 일 때, 끝난 경기는 공식 결과가 있고 운영자가 가리지 않았을 때(`hidden`·`status_only` 제외). **승부차기(`penalties`)는 경기가 끝난 뒤에만 있다** — 서버가 승부차기를 `end` 커맨드로 한꺼번에 받아 진행 중에는 알 수 없다(`apps/v1_web/src/lib/penalty-shootout.ts` 설계 주석).
- **`pending`/`pendingCount`**: 훈련·모임(`TRAINING`·`EVENT`) 중 아직 끝나지 않았고 응답 마감이 안 지났으며 **내가 응답하지 않은** 일정. 마감이 가까운 순(마감 없는 것은 뒤), 최대 3건. 경기 일정은 응답 대상이 아니다.
- **`schedules`**: 앞으로 올 팀 일정 최대 4건(가까운 순). 항목마다 `myResponse`(내 응답 또는 null)와 `canRespond`(훈련·모임이고 마감 전).
- **응답 저장**은 내가 활성 팀원인 팀의 일정만(아니면 404), 그리고 훈련·모임만(`canRespond` 로 내려 주는 종류 — 경기 일정은 400 `WIDGET_SCHEDULE_NOT_RESPONDABLE`, 앱에서 응답). 마감·정원·대기자 같은 규칙은 앱에서 누를 때와 같은 서비스(`ScheduleAttendanceService.setMyAttendance`)를 탄다. 멱등키는 서버가 시도마다 새로 만들고, 앱·연타로 버전이 바뀌어 `VERSION_CONFLICT` 가 나면 한 번 다시 읽어 재시도한다.

**진행 중 점수의 출처 (2026-11-25).** 대회·리그 경기는 경기 이벤트(`V1GameEvent`)의 골을 세고, **친선 팀 매치는 득점을 공유 기록(`V1TeamMatchRecord.goals`)에 두므로 그 골을 센다** — 이벤트만 세면 친선 경기가 항상 0 : 0 으로 나온다(알파에서 한강 로버스·마포 친선으로 확인). `GET /widget/games` 와 `GET /widget/home` 모두 같다.

**친선 팀 매치의 시작 (2026-11-26).** 친선 팀 매치는 첫 득점을 기록해야 경기 상태가 진행 중(`LIVE`)이 된다. 그래서 킥오프가 지났는데 아직 득점이 없는 친선 경기(상태 `SCHEDULED`, 대회·리그가 아니고 팀 매치 상태가 `matched`)도 **킥오프 후 3시간 동안은 `live` 에 진행 중(`LIVE`) 0 : 0 으로** 싣는다 — 공개 경기 목록의 「진행 중」 기준과 같다. 대회·리그 경기는 운영자가 시작해야 진행 중이 된다.

**위젯 v2 표시 정보 (2026-11-27).** 확정한 위젯·실시간 카드 디자인에 필요한 값을 `GET /widget/home` 에 더했다. 값은 모두 기존 데이터에서 읽고, 기존 필드는 그대로다.

- **팀 마크** — `live[]` 의 `teamLogoUrl`·`opponentLogoUrl`, `schedules[]`·`pending[]` 의 `teamLogoUrl`·`opponentLogoUrl`, `lastResult` 의 같은 이름. 팀 페이지와 **같은 마크**다: 저장된 로고(`V1TeamProfile.logoUrl`), 비어 있으면 팀 id 로 고른 기본 마크 10개 중 하나(`team-logo-presets.ts` — 웹 `resolveTeamLogoUrl` 과 같은 알고리즘, 값이 어긋나지 않도록 단위 테스트가 같은 기대값을 건다). 사이트 기준 경로(`/images/team-logos/…`)나 업로드 주소 **그대로** 내려 주므로 받는 쪽이 자기 도메인(알파·운영)을 앞에 붙인다.
- **리그·장소** — `competitionName`(리그·대회 이름, 친선은 null), `venueName`(경기 장소), 일정은 `placeName`.
- **현재 구간** — `live[].period`: `{ number, phase: RUNNING|HALFTIME|PAUSED, startedAt, pausedMs, pausedAt, restStartedAt }`. 위젯이 「후반 12'」를 스스로 센다 — 경과 = (지금 − `startedAt`) − `pausedMs` − (`pausedAt` 이 있으면 지금 − `pausedAt`), 하프타임은 `restStartedAt` 부터 쉬는 시간. **하프타임은 경기 상태가 아니라 다음 구간이 `HALFTIME` 인 것**이라 `state` 는 `LIVE` 그대로다. 구간 기록이 없는 경기(친선 팀 매치)와 끝난 경기는 null.
- **일정 상대·참석 인원** — 경기 일정의 `opponentName`(호스트·승인 신청 팀 중 내 팀이 아닌 쪽), `goingCount`(참석 확정 수), `capacity`(일정 정원, 없으면 활동 중인 팀원 수). 훈련·모임은 `opponentName` 이 null.
- **지난 경기** — `lastResult`: 내 팀의 가장 최근 **공식** 결과(`score`·`penalties` 는 우리 팀 기준, `result: WIN|DRAW|LOSE` — 동점이면 승부차기로 가리고 그것도 같으면 무). 일정이 있어도 항상 내려 주고(비었을 때 채울지는 받는 쪽이 정한다), 최근 5경기 안에서 공개 규칙이 가린 경기(`hidden`·`status_only`)를 건너뛴 첫 경기이며, 없으면 null.

**득점자 (2026-11-27).** `live[].scorers` — 한 골씩 시간순(분을 모르는 골은 맨 뒤): `{ side: MINE|OPPONENT, name, minute, ownGoal }`. `side` 는 우리 팀 기준이고 `minute` 는 웹 경기 화면과 같은 환산(`ceil(clockMs / 60000)`)이다. 취소된 골(`reversesEventId`)은 빠지고 정정한 시각은 반영한다(공개 일정 카드와 같은 읽기 순서).
- **이름 규칙은 공개 경기 화면과 같다**(`participant-name-gating`): 대회·리그 경기는 동의 규칙이 켜져 있으면 동의한 참가자만, 이름은 닉네임 기본 + 프로필의 실명 공개 설정. 이름을 보여 줄 수 없으면 `name: null` — 받는 쪽은 「득점」만 보여 준다.
- **친선 팀 매치**는 공개 화면이 진행 중에 득점자를 보여 주지 않으므로(점수만) 위젯은 **우리 팀 골만** 이름을 붙이고 상대 골은 `name: null` 로 준다.
- 점수를 가린 경기(`status_only`·`hidden`)는 골 요약도 가려 빈 배열이다. 옛 기록을 옮긴 경기는 공식 결과의 골 목록을 쓴다.

## 실시간 푸시와 실시간 카드 토큰 (2026-11-28)

경기 상태가 바뀌면(득점·구간 시작/끝·일시정지·종료) 서버가 위젯과 실시간 카드에 알린다.

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| PUT | `/widget/live-activity-token` | Bearer 위젯 토큰 | `{ gameId, pushToken }` → `{ registered: true }`. 아이폰 실시간 카드(Live Activity)가 받은 푸시 토큰(소문자 16진수)을 등록한다. 기기(위젯 토큰)·경기마다 한 줄이라 토큰이 바뀌면(회전) 같은 줄을 덮어쓴다. 내가 활성 팀원인 팀의 경기가 아니면 404 `NOT_FOUND_OR_ARCHIVED`. 기기당 5개까지(넘치면 오래된 것부터 지운다). |
| DELETE | `/widget/live-activity-token` | Bearer 위젯 토큰 | 본문 `{ gameId, pushToken }` → `{ removed }`. **토큰까지 같은 줄만** 지운다 — 늦게 도착한 옛 취소가 새로 받은 토큰의 등록을 지우지 않게. |

- 위젯 토큰을 폐기(`DELETE /widget/token`, `DELETE /me/widget-token`)하면 그 토큰의 카드 등록도 함께 지운다.
- **`live[].endedAt`** (끝난 경기만, 아니면 `null`): 공식 결과가 확정된 시각(ISO). 「방금 끝남」 15분과 실시간 카드 정리 시각의 기준이다.
- **아이폰 실시간 카드**: 등록된 카드에 APNs `liveactivity` 푸시를 보낸다. 내용(`content-state`)은 `live` 항목에서 득점자 목록을 뺀 것(`gameId, teamName, teamLogoUrl, opponentName, opponentLogoUrl, competitionName, venueName, state, score, penalties, period, updatedAt(ms), endedAt(ms|null)`)이다. 득점·구간·일시정지가 바뀌면 `event: update`, 경기가 끝나면 `event: end` + `dismissal-date`(= 종료 시각 + 15분, 초). 끝난 카드와 Apple이 거절한 토큰의 등록은 지운다.
- **안드로이드 위젯**: 내 팀 경기가 바뀌면 위젯 토큰이 있는 사용자의 안드로이드 기기에 데이터 전용 FCM(`type=widget_refresh`)을 보내 위젯이 다시 불러오게 한다.
- **동작 방식**: 경기 기록·친선 공유 기록·시계 만료·관리자 정정 등 상태가 바뀌는 길이 여러 곳이라 각 길에 끼우지 않고, 위젯 홈이 보여 주는 값(`WidgetHomeService.liveFor`)을 10초마다 다시 계산해 지난번과 다르면 보낸다. **`V1_WIDGET_PUSH_ENABLED=true` 일 때만 돈다**(꺼져 있으면 아무것도 보내지 않는다). 마지막으로 보낸 값은 프로세스 메모리에만 있어 재시작하면 진행 중 경기에 한 번씩 더 나가고(무해), API 가 여러 대가 되면 같은 변화가 대수만큼 나간다.
