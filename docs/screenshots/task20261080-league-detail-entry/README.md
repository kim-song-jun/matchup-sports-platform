# 리그 목록 상세 연결 — PR1908 Alpha 증거

코드: [PR1908](https://github.com/kim-song-jun/matchup-sports-platform/pull/1908). 최종 alpha 서빙 SHA: `e6cecf51fb95425955eafe942e8b44b719ccf556`.

비로그인 공개 방문자가 실제 리그 카드를 클릭하고 화면의 뒤로가기 링크로 목록에 복귀했다. 390×900, 768×900, 1440×900 모두 PASS다. before는 SHA614b4f440의 `/league-matches/:id`, after는 SHAe6cecf51f의 복구된 `/tournaments/:id`다.

`before/after-results.json`에는 원본 URL, from, 서빙 SHA, 가로 넘침과 console/network 결과를 기록했다. 문의 영역의 비로그인 `GET /api/v1/auth/me` 401 `UNAUTHENTICATED` 및 해당 native console 항목은 제품의 정상 guest probe 계약으로 별도 기록하며 숨기지 않는다. 예상하지 못한 console/page/API 실패는 0이다.

각 폭의 `before/after-list-*.png`, `before/after-detail-*.png`가 실제 alpha 화면이다. 최종 after는 전환 바·폰트·보이는 이미지 로딩 완료 후 캡처했다. `before/after-processes.txt`는 시작 당시 owned PID/PPID이며 QA 종료 후 해당 브라우저는 닫았다.

재실행: 의존성과 headed Chromium을 준비한 저장소에서 `node scripts/qa/verify-league-list-original-detail.cjs after <실제 서빙 SHA 40자리>`를 실행한다. Linux `ps`가 필요하다. 검증은 alpha에만 수행하며 로컬 Next 서버·인증 주입·DB mutation을 사용하지 않는다.
