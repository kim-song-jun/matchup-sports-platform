---
"v1_web": patch
"v1_api": patch
---

대회 운영 콘솔(`/tournament-ops/.../operate`)에서 골을 기록해도 상단 스코어가 실시간으로 갱신되지
않던 버그를 고쳤다.

**근본 원인**: `RealtimeGateway.acknowledgeGameEvent`가 자기 자신에게 쏘는
`game.event.committed` 브로드캐스트에 서버가 실제로 저장한 이벤트 행이 아니라 클라이언트가 보낸
원본 요청 payload를 그대로 실어 보냈다. 그 payload에는 서버가 나중에 채우는 `id`/
`reversesEventId`가 없어 `undefined`로 들어왔고, 콘솔의 `scoreBySideId`가 "되돌려진 이벤트" 집합을
`reversesEventId !== null`로만 걸러 그 `undefined`가 집합에 섞여 들어갔다 — 그러면 `id`도
`undefined`인 방금 그 이벤트 자신이 "이미 되돌려짐"으로 오판되어 점수 집계에서 조용히 빠졌다(새로고침
전까지). 같은 패턴이 피치 위 선수 파생(`on-pitch-state.ts`)에도 있어 함께 방어적으로 고쳤다. 골
취소(reverseEvent)는 애초에 실시간 브로드캐스트 경로 자체가 없어 되돌려도 점수가 즉시 반영되지
않았다.

**수정**:
- `GamesService.appendEvent`/`retryEvent`가 실제 저장된 이벤트 행을 돌려주고, 게이트웨이는 이제
  그 값을 방송한다.
- `scoreBySideId`/`on-pitch-state.ts`가 `reversesEventId`/`id`의 `undefined`도 `null`과 동일하게
  취급하도록 방어적으로 강화했다.
- 골 취소(`reverseEvent`) 성공 시 서버 이력 전체를 강제로 재동기화해 새로고침 없이도 스코어가 즉시
  되돌아간다.
- 결과 확정("결과를 확정할까요?") 확인 모달이 react-query 캐시(전역 `staleTime: 30s`)에 의존하지
  않고 확정 직전 강제로 최신 점수를 다시 불러오도록 고쳤다 — 되돌릴 수 없는 확정 액션이 stale한
  숫자를 보여주던 문제.
