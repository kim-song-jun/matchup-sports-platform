# PR #2351 alpha 순위표 규정 문구 제거 검증

- 배포 전 SHA: `12722135fea65b36860b4a2bfd461a7e1117a78f`
- 배포 후 SHA: `c339f1ee9901b6393c3aaa9d026d30ac4fe1043d`
- 배포 버전: `1.18.0-alpha.20261113.gc339f1ee9901`
- Alpha 배포: https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/43246621387 (success)
- Merge CI: https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/43246621638 (API / Web / Gates success)
- 경로: `/tournaments/32c29b24-dabf-442c-870f-29441226cc32/bracket`, 순위 · 대진표 탭
- 페르소나: 비로그인 공개 대회 방문자, 읽기 전용 검증
- 브라우저: headed Chromium, 390 / 768 / 1440 × 1000

| 검증 | 390 | 768 | 1440 |
| --- | --- | --- | --- |
| 규정 문구 | 1 → 0 | 1 → 0 | 1 → 0 |
| 순위·전적·승점·득실 배포 전과 동일 | PASS | PASS | PASS |
| 팀 경기 펼침 | PASS | PASS | PASS |
| 페이지·콘솔 오류 / HTTP 4xx·5xx | 0 / 0 | 0 / 0 | 0 / 0 |
| document 가로 넘침 | 0px | 0px | 0px |
| 육안 레이아웃: 문구 삭제 후 빈 영역·고아 구분선 없음 | PASS | PASS | PASS |

`before` / `after`의 `*-card.png`는 같은 순위표 카드와 첫 팀 경기 펼침 상태 비교이고, 숫자 이름 PNG는 해당 viewport 캡처다. JSON은 관측값이다. 앱 데이터 변경 없이 공개 UI 클릭만 수행했다.

브라우저 수명주기: 배포 전 owner PID 17644 → Chromium 17661, 배포 후 owner PID 19846 (PPID 19836) → Chromium 19859. 각 스크립트 `finally`의 browser.close()로 생성한 브라우저 트리를 정리했다. 초기 libnspr4 누락은 기존 임시 라이브러리 경로를 사용해 해결했고 시스템 패키지는 바꾸지 않았다.

Copilot CLI·REST 요청은 접수 이벤트·리뷰를 만들지 못했다. 사용자가 이번 PR에 한해 리뷰 예외 머지와 alpha 배포를 명시 승인했다. Copilot clean으로 판정한 것은 아니다. 프로덕션 배포는 수행하지 않았다.
