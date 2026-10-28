# PR #2083 alpha 배포 검증

- 대상: 대회 `93a11ead-52ca-4262-bede-66802587c3d8`의 `/bracket` 기본 경기 일정 탭.
- Persona: 비로그인 관전자.
- Viewports: 390/768/1440 × 1000.
- Before: 조별리그·결선 상위 필터가 있으나 조별/결선 단계 하위 필터 없음. 3폭 console/network 오류 0, 문서 가로 넘침 없음.
- 실행: `node scripts/qa/pr2083-alpha-capture.cjs before` (Windows 설치 Chrome headed).
- 소유 프로세스: browser PID 58804, parent PID 38820. context/browser/server 종료 후 해당 프로세스 없음 확인.
- PR head: `267ef3c07977f7ff7eb870166f4cd5f66786a770`.
- PR CI: https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/40650020613 (진행 중).
- Copilot: https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/40650026246 — `Model "claude-opus-5" is not available`. 리뷰 생성 없음, clean 아님. 이번 PR의 리뷰 예외 승인 확인 대기.
- After: 아직 배포하지 않았으므로 미실행. CI 통과 및 리뷰 예외 승인 후 dev 머지 → alpha 배포 확인 → 동일 스크립트 `after` 실행 → 3폭 갤러리 게시 예정.

`before-observations.json`의 PASS는 기존 화면의 오류/넘침 확인 결과이며 새 하위 필터의 기능 검증 결과가 아니다.
