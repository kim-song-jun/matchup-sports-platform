---
'v1_api': minor
---

리그 전용 결과 입력 경로를 지우고 콘솔이 몰수를 지정할 수 있게 한다 (Task 165 BE-3).

- **콘솔 결과 DTO에 `outcome: { reason, note? }`** — 제출·정정이 `NORMAL|FORFEIT|ABANDONED` 표식을 직접 정한다. 미전송이면 기존대로 base 승계. 스코어는 건드리지 않는다(1:0 강제는 몰수 *선언* 서비스의 몫).
- **삭제**: `admin/league-matches/:leagueId/fixtures/:teamMatchId/{participants,result,result/correct}` 3개 엔드포인트와 컨트롤러·DTO. 운영자의 리그 결과 입력은 대회와 같은 콘솔을 지난다.
- `LeagueMatchResultEntryService`는 이의 수락(`correctResult`) 하나 때문에 남는다 — Task 166이 이의와 함께 삭제한다.
