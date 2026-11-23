# 캘린더 구독 contract

폰 기본 캘린더(아이폰 캘린더·구글 캘린더)에 내 Teameet 일정을 **구독**으로 넣는다. 한 번 연결하면 일정이 바뀌거나 취소될 때 캘린더가 알아서 따라간다(아이폰은 수 시간, 구글은 최대 하루 지연). 읽기 전용이다.

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/me/calendar-feed` | 로그인 | `{ connected, feedUrl, webcalUrl, createdAt }`. 아직 연결 안 했으면 `connected:false`, 주소는 null. |
| POST | `/me/calendar-feed` | 로그인 | 연결한다. 이미 있으면 같은 주소를 그대로 돌려준다(몇 번이든 다시 복사 가능). |
| POST | `/me/calendar-feed/regenerate` | 로그인 | 옛 주소를 즉시 폐기하고 새 주소를 만든다. |
| GET | `/calendar/feed/<토큰>.ics` | **토큰만**(쿠키 없음) | 구독 본문(`text/calendar`). 폰 캘린더가 부른다. 토큰이 틀리거나 폐기됐으면 404. |
| GET | `/teams/:teamId/schedules/:scheduleId/calendar.ics` | 팀원 | 일정 한 건 파일 내려받기("캘린더에 추가"). 팀원이 아니면 404. |

## 무엇이 들어가나
- 내 팀(활성 팀원인 팀)의 일정: 팀 훈련·모임, 팀 매치, 리그 경기, 대회 진출 경기(모두 팀 일정 테이블에 있다). 지난 2주 ~ 앞으로 6개월, 최대 1,000건.
- 내가 **참가 확정**한 개인 매치(`participant` 가 `active`·`completed`).
- **불참(NOT_GOING)을 누른 일정은 뺀다.** 응답이 없거나 대기·미정이면 넣는다. 대회·리그 경기는 참석 응답이 없어 전부 들어간다.
- 취소된 일정은 빼지 않고 `STATUS:CANCELLED` 로 남긴다(이미 캘린더에 들어간 일정이 취소로 바뀐다).
- 시각이 아직 없는 대회 경기는 일정 행이 없어 나오지 않는다. 시간이 정해지면 나타난다.
- 팀이 둘 이상이면 제목 앞에 `[팀 이름]` 을 붙인다.

## 토큰
- 형식 `<V1AccessToken.id>.<HMAC-SHA256(V1_SESSION_SECRET, "access-token:calendar_feed:"+id)>`. DB 에는 행(`v1_access_tokens`: 사용자 id·종류·만든/폐기/마지막 사용 시각)만 두고 토큰 문자열은 두지 않는다 — 서버가 다시 만들 수 있어 "주소 복사"가 된다.
- 주소를 아는 사람은 그 사용자의 캘린더를 읽을 수 있다. 그래서 `regenerate` 로 즉시 폐기할 수 있다. 종류(`calendar_feed`/`widget`)가 서명에 들어가 서로 바꿔 쓸 수 없다.
- 위젯 토큰(`widget`)도 같은 테이블·방식을 쓴다(아직 발급하는 곳은 없다).
- `V1_SESSION_SECRET` 이 32자 미만이면 503 `CALENDAR_FEED_NOT_CONFIGURED`.
- **`V1_SESSION_SECRET` 을 바꾸면 이미 나눠 준 구독 주소가 전부 404 가 된다**(토큰이 이 비밀에서 파생된다). 캘린더 앱에는 "구독 실패"로만 보이므로, 시크릿 교체 절차를 밟을 때 사용자에게 「주소 다시 만들기」 안내가 필요하다.
- **로그:** 토큰이 경로에 있어 요청 로그에서 가린다 — pino 요청 로그와 오류 필터의 경로는 `/calendar/feed/[redacted].ics` 로 찍고(`common/logging/mask-calendar-feed-token.ts`), nginx 는 이 경로(`/api/v1/calendar/feed/<토큰>`)의 `access_log` 를 끈다.
- 연결(`POST /me/calendar-feed`)과 다시 만들기는 사용자별 advisory lock 으로 직렬화한다 — 두 탭에서 동시에 눌러도 활성 주소는 하나다.
- 개인 매치의 `SEQUENCE` 는 수정 시각(초), 팀 일정은 일정 버전이다. 둘 다 바뀔 때마다 커진다.
