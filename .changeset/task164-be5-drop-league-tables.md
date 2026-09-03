---
'v1_api': major
---

`v1_leagues`·`v1_league_teams` 테이블과 `V1LeagueState` enum 을 제거한다 (Task 164 BE-5 contract).

리그는 통합 축(`V1Tournament(kind='regular_league')` + `V1TournamentRegistration`)이 정본이다 —
재배선(#1005)이 읽기를, 이 릴리스가 dual-write 쓰기와 alpha QA 시드를 옮겼다.

`V1TeamMatch.league` 와 `V1LeaguePromotion.fromLeague` 의 FK 가 `V1Tournament` 를 가리키게
바뀐다(두 축의 id 가 같아 컬럼 값은 그대로, 백필 없음). 마이그레이션이 그 전제를 스스로 검사해
대응 행 없는 참조가 하나라도 있으면 `TASK164_BE5_ORPHAN` 으로 아무것도 바꾸지 않고 실패한다.

응답의 `state`(draft·active·completed) 어휘는 그대로다 — Prisma enum 대신 손으로 쓴
유니온(`league-state.ts`)이 되고, 저장은 `V1TournamentStatus` 다.

alpha 데이터를 되돌릴 수 없게 바꾸므로 사용자 직접 승인 뒤에만 머지한다.
