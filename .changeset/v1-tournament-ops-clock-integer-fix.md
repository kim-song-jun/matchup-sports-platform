---
"v1_api": patch
"v1_web": patch
---

**[CRITICAL] alpha 라이브 실패(옐로카드/파울 기록이 원인 불명의 `VALIDATION_ERROR`로 거부) 근본 원인을 고쳤다.** `medianOffsetMs()`(클록 오프셋 추정)가 소수(`.5`)를 반환할 수 있었다 — 서버 처리 시간이 홀수 ms거나, 표본이 짝수 개라 중앙값을 평균 내는 경우다. 그 소수가 `serverAlignedNowMs` → `elapsedMatchMs` → `freezeCapture()`의 `clockMs`까지 그대로 전파됐고, 서버 `RealtimeGateway`의 `parseGameEvent`는 `clockMs`가 `Number.isSafeInteger`이길 요구해 거부했다(간헐적 — 네트워크 지연의 홀짝에 좌우됐다). 큐에 이미 저장된 소수 `clockMs`는 재시도해도 그대로 재전송되어 매번 같은 이유로 다시 실패했다 — 오너가 지적한 "다시 시도"가 무의미했던 이유다.

- `medianOffsetMs()`가 반환 직전 정수로 반올림한다 — 이 함수의 반환값이 `clockOffsetMs`로 앱 전체에 나가는 유일한 지점이라, 여기 하나로 경계를 몰았다(`freezeCapture`/`ElapsedMatchClock` 양쪽이 각자 반올림하면 표시값과 저장값이 갈라진다).
- 이 픽스 이전에 이미 큐에 저장된 소수 `clockMs` 항목도 구제한다: `retryFailedEvent`가 재시도 시점에 정수로 보정하고(이벤트가 실제로 벌어진 시각 `occurredAt`은 절대 바꾸지 않는다, 1ms 미만 반올림만), 서버가 `payloadHash`를 event 내용으로 재계산해 대조하므로(`GamesService.retryEvent`) 그에 맞춰 해시도 함께 다시 계산한다. `VALIDATION_ERROR`를 재시도 불가능 코드로 분류하지 않는다 — 이 보정 덕에 재시도가 실제로 복구 경로이기 때문이다.
- 소켓 게이트웨이(`RealtimeGateway`)가 `VALIDATION_ERROR`를 던질 때 "어느 필드가 왜"(`missingKeys`/`unknownKeys`/`invalidFields`, 필드 이름만 — 값은 절대 포함 안 함) 로그·클라이언트 응답에 남긴다 — 이번처럼 원인 불명 상태로 오래 방치되지 않도록 `game.event.append`/`game.event.retry`/`game.time.ping` 세 경로에 추가했다.
- `VALIDATION_ERROR`가 `gameOperationsErrorMessage`에 매핑돼 있지 않아 default 문구("이벤트를 기록하지 못했어요")로 뭉개지던 것도 고유 문구로 고쳤다.

**함께 고친 별도 결함(같은 파일, 같은 조사 과정에서 발견):** 이벤트 전송이 소켓 `ack` 콜백을 못 받으면(연결이 응답 없이 끊기는 경우 등) `'sending'` 상태에서 영원히 고착됐다 — 새로고침 전까지 재시도 버튼도 없이 "전송 중"만 보여, 골을 기록했는지조차 알 수 없는 상태가 됐다. `SEND_ACK_TIMEOUT_MS`(10초) 안에 ack가 없으면 자동으로 `'failed'`로 전환해 기존 재시도 경로에 합류시킨다 — 늦게 도착하는 ack도 여전히 유효하게 처리된다.
