---
"v1_api": minor
---

공개 경기 상세(`GET /tournaments/:tournamentId/matches/:fixtureId`)의 골/카드 이벤트에 `participantName`(참가자 표시명)과 `jerseyNumber`(등번호)를 추가했다. 지금까지는 이벤트가 `participantId`만 내려줘서, 프론트가 득점자 이름을 그리려면 같은 응답의 `lineup`을 역참조해야 했는데 `lineup`은 라인업 공개 시각(킥오프 60분 전) 이전에는 `null`이라 그 전에는 이름을 그릴 방법이 없었다. 라인업 비공개 게이트는 "경기 전 선발 명단 노출"을 막는 규칙이고 골/카드는 경기 중에만 발생하므로 득점자 이름 노출은 이 게이트와 무관하게 항상 적용한다 — 대신 기존 동의(consent) 게이트는 `participantId`와 정확히 동일하게 적용해, 동의하지 않았거나 자격이 없는 참가자는 `participantName`/`jerseyNumber`도 함께 `null`로 내려간다.
