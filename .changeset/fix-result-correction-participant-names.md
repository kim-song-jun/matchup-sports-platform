---
"v1_web": patch
---

결과 정정/재제출 모달(`ResultEditModal`)의 참가자별 기록 입력 폼이 선수 이름 대신 "홈 · 참가자 dc52c8" 처럼 참가자 id 뒷자리만 보여주던 문제를 고쳤다. 같은 경기의 운영 콘솔(`/tournament-ops/.../operate`)은 라인업 스냅샷으로 이미 실명을 표시하고 있었는데, 이 모달만 그 데이터를 받지 않아 운영자가 누구의 득점·카드인지 구분할 수 없었다. 이제 정정 패널(`GameResultCorrectionPanel`)과 재제출 패널(`GameResultReviewPanel`)이 `GET /games/:gameId/lineups`(`useV1GameLineups`)로 라인업을 함께 불러와 `ResultEditModal`에 `lineups` prop으로 내려주고, 모달은 참가자 id → "#등번호 이름"을 매핑해 렌더한다(라인업 응답의 참가자 `id`는 결과 기록의 `participantId`와 같은 `V1GameParticipant.id`를 가리킨다). 라인업에 없는 참가자는 이름을 지어내지 않고 기존 폴백(사이드 + id 뒷자리)에 "(라인업에 없음)"을 덧붙여 폴백임을 드러낸다.
