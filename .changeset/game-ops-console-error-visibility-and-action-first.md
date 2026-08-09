---
"v1_api": minor
"v1_web": minor
---

경기 운영 콘솔의 실측 실패 사고(6건 기록 시도 중 2건 "이벤트를 기록하지 못했어요" 실패, 원인 불명)를 후속 조치한다.

- 실시간 게이트웨이(`RealtimeGateway`)의 모든 이벤트 커맨드 거부 경로가 이제 PinoLogger로 남는다(코드/게임/해시된 행위자 — 원문 userId 없이). 지금까지는 실패가 클라이언트 배너에만 보이고 서버 어디에도 흔적을 남기지 않았다.
- 서버가 던질 수 있었는데 콘솔이 매핑하지 않았던 9개 에러 코드(`TERMINAL_GAME_IMMUTABLE`, `EVENT_INVALID`, `PARTICIPANT_SIDE_MISMATCH`, `SCORER_REQUIRED`, `COMMAND_IDEMPOTENCY_KEY_MISMATCH`, `IDEMPOTENCY_PAYLOAD_CONFLICT`, `INVALID_ACTOR_SCOPE`, `COMMAND_CONCURRENCY_CONFLICT`, `INTERNAL_ERROR`)에 전용 안내 문구를 추가하고, 재시도로 풀리지 않는 코드에서는 "전송 상태" 패널의 "다시 시도" 버튼을 숨긴다.
- 전송 큐의 재시도가 서버의 기존 리베이스 경로(`game.event.retry`)로 나가도록 고쳤다 — 이전에는 재시도가 원래의 낡은 `expectedVersion`으로 `game.event.append`를 다시 보내 항상 같은 이유로 다시 실패했다.
- 경기 운영 콘솔의 기록 흐름을 "선수 먼저 → 액션"에서 "액션(골/카드/파울) 먼저 → 대상 선수"로 뒤집는다. 기록 시각은 액션을 탭한 순간에 고정되고(선수를 고르는 동안 밀리지 않는다), 대상 선택 화면은 양 팀 라인업을 그대로 보여줘 팀 혼동을 막는다. 파울은 선수 지정 없이 팀 단위로도 기록할 수 있다.
- 진행 중 경기의 경과 시간을 헤더에 크게 표시하고(초 단위, 서버-기기 시각차 보정), 기록된 이벤트 목록의 시각 표시를 분 단위(`10'`)에서 초 단위(`10:06`)로 바꿔 같은 분에 기록된 이벤트를 구분할 수 있게 한다. 재개/일시중지/종료 명령의 처리 소요 시간을 ms 단위로 헤더에 표시한다.
