---
'v1_web': minor
---

리그 결과 입력 모달을 지우고 콘솔 딥링크로 보낸다 (Task 165 BE-3 FE).

- 어드민 리그 대진 표의 "결과 입력·정정" 버튼 → `/admin/live/:leagueId/result-review?fixtureId=:teamMatchId` 링크.
- `LeagueResultEntryModal`과 그 테스트, 전용 훅 3개·타입 5개 삭제(전부 이 모달만 쓰던 것).
