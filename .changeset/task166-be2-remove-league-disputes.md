---
'v1_api': major
'v1_web': major
---

리그 결과 이의 경로를 제거한다 (Task 166 BE-2).

정본 §4: 결과는 "종료 → 결과 보내기 → 어드민 확인" 한 단계이고 팀의 이의 제기 경로는 없다.
팀이 문제를 발견하면 운영자에게 연락하고, 운영자가 콘솔에서 정정·무효한다.

**제거되는 공개 API**: `POST /league-matches/:leagueId/fixtures/:teamMatchId/dispute`,
`GET|POST /admin/league-match-disputes/*`. 팀매치 상세 응답의 `league.disputeDeadline`·
`disputeBlockedReason`·`openDisputeExists` 세 필드와 이의 알림 5종도 함께 사라진다.

테이블·enum drop 은 사용자 승인이 필요한 별도 contract PR.
