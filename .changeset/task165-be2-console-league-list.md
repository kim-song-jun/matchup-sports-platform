---
'v1_api': minor
---

운영 콘솔 목록이 정규 리그를 보여준다 (Task 165 BE-2).

- 콘솔 대진 목록(`GET /tournament-ops/tournaments/:id/operations`)이 거울(`kind='regular_league'`)이면 `V1TeamMatch` 를 읽는다. 이전엔 `V1TournamentFixture` 만 읽어 리그가 **빈 목록**으로 열렸다.
- 정렬·커서는 `(startAt, id)` — `V1TeamMatch` 에 `round`·`fixtureNumber` 컬럼이 없다. 커서에 `kind` 를 담고 한 요청은 한 종류만 낸다.
- "이 리그의 대진은 무엇인가" 술어를 `league-fixture-list-source.ts` 한 곳으로 모았다(세 벌이 서로 달랐고, `id` tie-break 부재는 커서를 붙이는 순간 중복·누락이 된다).
- 리그에서 해제 불가능한 경고(`NO_FIELD_ASSIGNED`·`NO_STAFF_ASSIGNED`)는 내지 않는다.
- 항목의 `homeRegistrationId`/`awayRegistrationId` 는 팀 id 로 되찾아 채운다(페이지당 IN 조회 1회).
