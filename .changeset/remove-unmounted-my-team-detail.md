---
'v1_web': patch
---

어느 라우트에도 마운트되지 않는 마이 팀 상세 경로를 정리한다 — MyTeamDetailPageClient/
MyTeamDetailPageView, useV1MyTeamMatches, toMyTeamMatch, V1MyTeamMatch 타입,
MyMatch.league 필드와 리그전 배지 렌더·테스트 제거. /my/teams/[id]는 공개 팀 페이지로
redirect되는 현행 동작을 유지하고, 리그전 배지는 팀매치 목록·상세·어드민 표면으로 갈음한다
(사용자 결정 B, 2026-08-20).
