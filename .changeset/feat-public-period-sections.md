---
"v1_api": minor
"v1_web": minor
---

공개 경기 기록에서 전반/후반을 구간으로 나눠 보여주고, 하프타임·정규시간 종료를 배지로
구분한다(#433).

관전자가 경기 진행을 따라갈 수 없던 두 가지를 고친다.

- **전반/후반이 섞여 시간이 역전돼 보이던 문제** — `PublicMatchEvent.period`는 서버가 이미
  내려주고 있었는데 이벤트 목록이 그걸 무시하고 평평한 리스트로 그려, 전반 10′ 다음에
  후반 5′이 오는 순서가 됐다. 이제 피리어드 단위로 구간을 나눠 렌더한다.
- **하프타임에도 배지가 그냥 "LIVE"이던 문제** — `clock === null`이 킥오프 전·하프타임·
  정규시간 종료 세 상황에서 모두 null이라 화면이 셋을 구분할 수 없었다. 백엔드에
  `resolvePeriodBreak(periods)` 순수 함수를 두어 `'halftime' | 'regulation_ended' | null`을
  파생하고, `PublicMatchDetail`·`PublicScheduleEntry`에 `periodBreak` 필드로 실어 보낸다.
  판정 우선순위는 LIVE 피리어드가 있으면 `null`(진행 시계가 상태를 이미 말해 준다),
  HALFTIME이 있으면 `halftime`, 전부 ENDED면 `regulation_ended`다.
