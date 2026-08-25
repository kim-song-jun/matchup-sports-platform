---
"v1_api": minor
"v1_web": minor
---

"내 기록 연결(claim)"을 리그 경기로 확장합니다. 서버는 `GET /league-matches/:leagueId/fixtures/:teamMatchId/claimable-participants` 를 추가해 리그 대진의 미연결 참가자 목록을 돌려주고(인가는 대회와 같은 participant_identity 스코프 — 두 참가팀 활성 멤버), 신청·승인은 기존 game 경로를 그대로 씁니다. 프론트는 리그 경기 상세의 기록 본문 아래에 대회와 동일한 "이 경기에 뛰었는데 내 기록이 없나요?" 배너를 싣습니다.
