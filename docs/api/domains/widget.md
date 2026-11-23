# 위젯 contract

바탕화면·잠금화면 위젯과 실시간 표시(다이내믹 아일랜드·고정 알림)가 읽는 **내 팀 경기** 목록. 웹뷰의 로그인 쿠키를 위젯이 읽을 수 없어서, 앱이 받아 둔 **읽기 전용 위젯 토큰**으로 부른다(캘린더 구독과 같은 `v1_access_tokens` 테이블, 종류 `widget`).

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
