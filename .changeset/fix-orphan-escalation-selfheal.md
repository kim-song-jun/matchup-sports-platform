---
"v1_api": patch
---

승계된 결과 리비전에 유령 에스컬레이션이 생기는 레이스를 막고, 이미 생긴 유령을 자가치유로 닫는다.

PR #394가 추가한 `ASSIST_SYNC`(제출된 결과에 어시스트를 붙이면 새 리비전으로 승계)는 선행
리비전의 `state`를 의도적으로 `SUBMITTED` 그대로 남긴다 — 어떤 `V1GameResultRevisionState` 값도
"리뷰어 결정 없이 자동 승계됨"을 정확히 표현하지 못해서다. 그런데
`GameResultSubmittedEscalationService`의 아웃박스 핸들러 3개(`handler`/`reminderHandler`/
`escalationHandler`)는 오직 `state === 'SUBMITTED' && submittedAt !== null`로만 게이트했다 —
승계 여부는 보지 않았다. 동기화가 워커가 선행 리비전의 최초 제출 이벤트를 처리하기 전에
실행되면, 워커가 이미 승계된 선행 id로 PENDING 에스컬레이션을 새로 만들고 아무도 그것을
닫지 않는 유령이 생겼다(저자 스스로 "Known residual gap"으로 남긴 갭).

- `GameResultSubmittedEscalationService`에 `isRevisionSuperseded`(다른 리비전의
  `supersedesId`가 이 리비전을 가리키는지 판별 — `TournamentResultReviewService
  .officializeResultRevision`의 STANDARD-flow stale 가드와 동일한 판별을 재사용)를 추가했다.
- 핸들러 3개 모두 이 체크를 통과하면 조용히 종료(성공 처리)하고 새 에스컬레이션·알림을 만들지
  않는다 — 실패로 처리해 재시도 루프에 빠지지 않는다.
- `createQueue`/`scheduleDueDeliveries`(에스컬레이션·아웃박스 INSERT가 실제로 일어나는 지점)
  에도 같은 체크를 넣어, 승계된 리비전에 매달린 PENDING 행을 발견 즉시 CLOSED로 자가치유한다
  — 핸들러 레벨 체크와 중복이지만, 향후 다른 호출 경로가 생겨도 팬텀을 다시 만들 수 없도록 하는
  의도적인 이중 방어다.
- 자가치유 SQL(2개의 UPDATE 문)은 `GamesService.closeAssistSyncPredecessorSla` /
  `TournamentResultReviewService.closeReviewSla`와 같은 문장을 세 번째로 복제했다 —
  두 기존 구현이 이미 서로 다른 소유 레인이라는 동일한 이유로 서로 복제돼 있고,
  `GameResultEscalationTerminalService.close`는 이 워커 레벨 자가치유가 조립할 이유가 없는
  훨씬 무거운 `OfficialRevisionRow` 타입에 묶여 있어 재사용이 오히려 더 큰 결합을 만든다.

승계되지 않은 정상 SUBMITTED 리비전의 리마인더·에스컬레이션 생성/알림은 그대로 동작한다.
