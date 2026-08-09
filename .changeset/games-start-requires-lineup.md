---
"v1_api": patch
---

경기 시작(`start`) 커맨드가 라인업 없이도 API를 직접 호출하면 통과되던 구멍을 막았다. `GamesService.executeCommand`의 `start` 분기는 상태 전이(`assertLifecycle`)만 검사하고 어느 사이드에도 제출된 라인업이 있는지 확인하지 않아, 클라이언트 게이트(PR #316)를 우회해 API를 직접 호출하면 여전히 라인업 없이 경기가 LIVE로 시작될 수 있었다. 이제 모든 `V1GameSide`가 SUBMITTED 또는 LOCKED 상태의 라인업을 최소 하나 가지고 있어야 `start`가 허용되며, 그렇지 않으면 `409 LINEUP_NOT_SUBMITTED`(한국어 메시지 포함)로 거부한다.
