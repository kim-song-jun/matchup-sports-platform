# 리그 상세 진입 통일

Status: Done
Task: [20261080 후속](../../.github/tasks/20261080-league-list-detail-entry.md)
PR: [#1918](https://github.com/kim-song-jun/matchup-sports-platform/pull/1918)

홈 추천, 홈 진행 리그, 목록, 검색, 내 리그, 팀 상세, 신청 복귀, 내 신청 복귀, 시리즈, 경기·시상 복귀, 운영 후속 CTA, 알림, SEO, 경기·전적 간접 진입의 14개 유형을 점검했다. 공개 상세 목적지는 /tournaments/:id이며 API·경기·시상·admin 경로는 기존 계약을 유지한다.

- 코드 및 consumer 회귀: 14/14 완료. 양 앱 tsc, 영향받은 테스트 및 전체 PR/dev CI PASS.
- 배포: merge948948dcf328, dev CI38509055778, alpha38509055803 모두 성공. 실제 응답 헤더와 API db=true 확인.
- 리뷰: Copilot 3회 미응답. 사용자 명시 승인에 따라 CI 전체 통과 후 이번 PR의 리뷰 미응답 예외 적용.
- before: /league-matches/:id는 이전 화면200, /leagues/:id는404. 검색·팀·경기·시상12/12 클릭 기준선 확보.
- after: 공개 방문자390/768/1440, 홈·목록·검색·팀·경기·시상18/18 클릭, 기존 주소 리다이렉트6/6. 총24/24 PASS. 쿼리 보존 및 상세 가로 넘침 없음. 21개 after 캡처 시각 확인.
- console/network: 홈·목록·상세 오류 없음. /search React hydration #418은 before/after 동일한 기존 문제. 비로그인 auth/me·record-consent401 외 HTTP 실패 없음.
- 보호 화면: 마이·신청·팀 멤버 persona alpha 로그인 실측 미실행. 단위 consumer 및 CI 검증과 구분한다.
- cleanup: 최종 node41616/chrome21788, node38712/chrome40216 및 parent PID를 기록하고 finally 종료. 테스트 데이터 변경 없음.

증거는 [before](../screenshots/league-detail-routes/before/evidence.json), [after](../screenshots/league-detail-routes/after/evidence.json), [추가 경로 before](../screenshots/league-detail-routes/before/related-evidence.json), [추가 경로 after](../screenshots/league-detail-routes/after/related-evidence.json)에 있다. 재현 도구는 scripts/qa/capture-league-detail-routes.cjs와 scripts/qa/verify-league-detail-related.cjs이며 after 인자로 실행한다.
