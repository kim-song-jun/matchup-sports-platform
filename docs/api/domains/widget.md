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
| GET | `/widget/home` | Bearer 위젯 토큰 | `{ generatedAt, live, pendingCount, pending, schedules }` — 실시간 경기·응답 대기·일정을 한 번에. |
| PUT | `/widget/schedules/:scheduleId/attendance` | Bearer 위젯 토큰 | `{ status: GOING \| MAYBE \| NOT_GOING }` → 앱의 `PUT .../attendance/me` 와 같은 응답. |

- **`live`**: 내 팀 경기 중 진행 중(`LIVE`·`PAUSED`, **시작한 지 12시간 안**)과 **공식 결과가 확정된 지 15분 안**(`ENDED`, 「방금 끝남」 — 종료 시각 컬럼이 없어 결과 리비전의 `createdAt` 으로 잰다. 결과를 정정하면 새 리비전이라 정정도 「방금」으로 다시 나온다). 진행 중이 앞이다. 점수(`score`)는 우리 팀 기준이고 공개 경기 화면과 같은 규칙으로만 준다 — 진행 중은 정책이 `live` 일 때, 끝난 경기는 공식 결과가 있고 운영자가 가리지 않았을 때(`hidden`·`status_only` 제외). **승부차기(`penalties`)는 경기가 끝난 뒤에만 있다** — 서버가 승부차기를 `end` 커맨드로 한꺼번에 받아 진행 중에는 알 수 없다(`apps/v1_web/src/lib/penalty-shootout.ts` 설계 주석).
- **`pending`/`pendingCount`**: 훈련·모임(`TRAINING`·`EVENT`) 중 아직 끝나지 않았고 응답 마감이 안 지났으며 **내가 응답하지 않은** 일정. 마감이 가까운 순(마감 없는 것은 뒤), 최대 3건. 경기 일정은 응답 대상이 아니다.
- **`schedules`**: 앞으로 올 팀 일정 최대 4건(가까운 순). 항목마다 `myResponse`(내 응답 또는 null)와 `canRespond`(훈련·모임이고 마감 전).
- **응답 저장**은 내가 활성 팀원인 팀의 일정만(아니면 404), 그리고 훈련·모임만(`canRespond` 로 내려 주는 종류 — 경기 일정은 400 `WIDGET_SCHEDULE_NOT_RESPONDABLE`, 앱에서 응답). 마감·정원·대기자 같은 규칙은 앱에서 누를 때와 같은 서비스(`ScheduleAttendanceService.setMyAttendance`)를 탄다. 멱등키는 서버가 시도마다 새로 만들고, 앱·연타로 버전이 바뀌어 `VERSION_CONFLICT` 가 나면 한 번 다시 읽어 재시도한다.

**진행 중 점수의 출처 (2026-11-25).** 대회·리그 경기는 경기 이벤트(`V1GameEvent`)의 골을 세고, **친선 팀 매치는 득점을 공유 기록(`V1TeamMatchRecord.goals`)에 두므로 그 골을 센다** — 이벤트만 세면 친선 경기가 항상 0 : 0 으로 나온다(알파에서 한강 로버스·마포 친선으로 확인). `GET /widget/games` 와 `GET /widget/home` 모두 같다.
