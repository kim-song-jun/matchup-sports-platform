---
"v1_api": patch
"v1_web": patch
---

리그 어드민에 대진 취소·재생성·참가팀 조회를 추가합니다. 대진 취소(`POST /admin/league-matches/:leagueId/fixtures/:teamMatchId/cancel`)는 team-matches.service.ts의 호스트 자가취소와 동일한 후처리(신청 반려·일정 cascade)를 감사 로그와 함께 수행하고, 이미 취소된 대진은 멱등하게 처리합니다. 대진 재생성(`POST /admin/league-matches/:leagueId/fixtures/regenerate`)은 기존 대진을 전부 취소하고 같은 팀 로스터로 새 라운드로빈 대진을 만들며, 공식 결과가 확정된 대진이 하나라도 있으면 거부합니다. 참가팀 조회(`GET /admin/league-matches/:leagueId/teams`)를 추가해 재생성 확인 모달에서 참가팀을 보여줍니다. 두 조작 모두 취소·재생성 사유 입력을 강제하는 확인 모달을 거칩니다. 어드민 대진 표에 주소(placeAddress) 입력 컬럼도 추가했어요(DTO에는 이미 있었지만 화면 컬럼이 없었습니다).
