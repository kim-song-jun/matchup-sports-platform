---
"v1_api": minor
"v1_web": minor
---

경기 이벤트에 도움(assist) 기록과 파울(FOUL) 이벤트 타입을 추가한다: GOAL 이벤트에 같은 팀·다른 선수를 도움으로 지정할 수 있고(자기 자신·상대팀 지정은 422 ASSIST_INVALID로 거부), FOUL은 더 이상 CORRECTION 이벤트로 위장되지 않는 정식 이벤트 타입이다. 경기 결과 집계와 공개 개인 기록(`GET /users/:id/records`) 요약에 도움/파울 합계가 함께 노출된다.
