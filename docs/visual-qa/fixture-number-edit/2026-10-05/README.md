# 대진 번호 수정 — Alpha 실측

2026-10-05, 사용자 직접 로그인한 운영자 계정, 기존 결과 확정 12강 2번 경기의 수정 창. 기존 대회 데이터에 대한 API mutation은 0건이다.

Before: `04654d2974599c9da53656193ca001f18ab0797e`. After: PR #1619 dev merge `b734052aa51c861e6043d51edebbfa841087de87`, Alpha deploy [37313213711](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37313213711) SUCCESS. document의 x-teameet-commit도 동일 SHA.

| Viewport | Before | After | Verdict |
| --- | --- | --- | --- |
| 1440×900 | [before](1440/before.png) | [after](1440/after.png) | 번호 입력·팀 결과잠금 정상 |
| 768×900 | [before](768/before.png) | [after](768/after.png) | 모달·입력 폭 정상 |
| 390×844 | [before](390/before.png) | [after](390/after.png) | 기존 팀명 잘림 해결, 팀 입력 세로 배치 |

[0 입력 오류 화면](390/after-invalid.png): 실제 저장 버튼을 눌러 정수 범위 오류 toast와 모달 보존을 확인했다. 클라이언트가 요청 전 차단했다. 임시7 입력 후 취소·재열기에서 원래2 유지, Tab으로 번호 focus 및 Escape 닫기 PASS. 유효한 변경을 alpha에 저장하지 않았으며 저장·중복 rollback·연결/결과·일정·옛 번호 재생성은 실제 Postgres CI 통합 테스트로 검증했다.

[Before 측정 JSON](before-evidence.json), [After 측정 JSON](after-evidence.json). 각 측정 구간 console/runtime/http 오류0. 전체 장시간 QA 세션 로그에는 로그인 전 auth401 및 alpha 재배포 중 socket.io500/503, client-error503, pending-count503이 있었으며 after 측정에서는 재현되지 않았다.

전용 headed Chromium PID12180 / Node parent33892만 종료. Inspector PID19860(before),34764(after)는 CDP detach 후 종료. 인증정보·쿠키·storageState 읽기/저장 없음.

재현 도구는 [session](../../../../scripts/qa/round12-flow-session.cjs), [inspection](../../../../scripts/qa/fixture-number-live-inspection.cjs)이다. 세션을 headed로 실행하고 직접 로그인한 후 해당 소유 Playwright server 포트와 `before` 또는 `after`를 inspector 인자로 전달한다. Inspector는 원래 로그인 페이지에 attach하며 대회 데이터를 저장하지 않는다.

Copilot 자동 리뷰는 monthly quota HTTP402로 실패했다. 직접 정적 검토 및 CI 성공 증거를 별도로 기록했다.
