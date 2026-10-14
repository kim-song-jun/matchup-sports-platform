# 리그 상세 진입 통일

Status: In Progress
Task: [20261080](../../.github/tasks/20261080-league-list-detail-entry.md)

홈 추천, 홈 진행 리그, 목록, 검색, 내 리그, 팀 상세, 신청 복귀, 내 신청 복귀, 시리즈, 경기·시상 복귀, 운영 후속 CTA, 알림, SEO, 경기·전적 간접 진입의 14개 유형을 점검한다. 공개 상세 목적지는 /tournaments/:id이며 API·경기·시상·admin 경로는 기존 계약을 쓴다.

- 코드 및 consumer 회귀: 14/14 확인. Web tsc PASS, API 단위 81/81 PASS.
- before: 공개 방문자 390/768/1440, 목록 클릭 정상, /league-matches/:id 기존 화면200, /leagues/:id 404.
- after: dev 배포 후 scripts/qa/capture-league-detail-routes.cjs after 실행 예정.
- 보호 화면: 마이·신청·팀 멤버 persona alpha 로그인 실측 미실행. 단위 렌더 검증과 구분한다.
- cleanup: 캡처 도구가 소유 Node/Chrome PID 기록 후 browser.close/server.close.

추가 before 검증: 검색·공개 팀 상세·경기 상위·시상 상위 링크를 390/768/1440에서 12/12 클릭 확인. 모바일 팀 링크는 반응형 숨김 복제 링크를 제외하고 실제 보이는 링크를 선택했다. /search에서는 변경 전부터 React hydration #418이 재현되며 이번 링크 변경으로 새로 발생한 오류와 구분한다. 인증 persona의 내 리그·신청은 아직 alpha 미실측이다.
