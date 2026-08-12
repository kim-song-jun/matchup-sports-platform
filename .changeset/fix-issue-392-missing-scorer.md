---
"v1_api": patch
---

되돌린 골이 "득점자 미기재" 경고에 잘못 남는 문제를 고친다 (#392).

`GamesService.deriveTournamentRevision` 이 대회 경기의 결과 리비전을 만들 때 계산하는
`missingScorer`(운영 보드 "득점자 미기재" 경고)는 `events.some(...)` 으로 이벤트 전체를
훑으면서 `reversesEventId` 필터가 아예 없었다 — 같은 함수 안의 형제 계산(`scoreFromEvents`,
`resultInvariantInput`)과 참가자별 골/카드/파울/어시스트 집계(`aggregateGameParticipantStats`,
#376 에서 이미 이 필터를 붙였다)는 모두 되돌린 이벤트를 제외하는데 `missingScorer` 만 빠져
있었다. 득점자 없이 기록한 골을 나중에 되돌려도(오심 취소 등) 경고가 영원히 남아 있었다.

`missingScorer` 계산을 `aggregateGameParticipantStats` 안으로 옮겨 그 함수가 이미 만드는
`reversedIds` 를 그대로 재사용하도록 고쳤다 — 같은 파일에 세 번째 되돌림-판정 방식을 새로
만들지 않는다. `deriveTournamentRevision` 은 이제 `v1GameResultRevision.create` 호출 전에
`aggregateGameParticipantStats` 를 먼저 실행해 그 결과의 `missingScorer` 를 그대로 쓴다.

`deriveTournamentRevision` 전체를 다시 훑어 이벤트를 순회하는 다른 지점(`scoreFromEvents`,
`eventsHash` 해시 계산)도 확인했다 — `eventsHash` 는 감사용으로 전체 이벤트 스트림을 그대로
해시하는 게 의도된 동작이라 되돌림 필터가 필요 없고, 나머지는 이미 올바르게 필터링돼 있었다.
