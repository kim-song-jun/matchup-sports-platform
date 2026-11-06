# PR #2164 alpha 검증 — 2026-11-06

- 대상: 공개 `/tournaments`, 익명 사용자, headed Windows Chromium. 실제 alpha만 접근했다.
- Before: `0b7720cb7d068b05735039e3445ef4b374642ed7`.
- After: `408b665a685eba127fda127167954a04b418085e` (#2164 dev merge).
- 390×844 / 768×1024 / 1440×1024 모두 모집·진행 두 줄 표시, 반대 줄 선택 해제, 다른 줄의 전체 선택 보존, 결과 보기의 실제 URL 반영, 대회 탭 준비 중 제외를 클릭 검증했다. 6/6 PASS, 가로 overflow 없음.
- 일반 클릭 진입: console/pageerror 0, 실패 HTTP 0. before/after report의 cleanup=true와 browser PID/parent PID로 소유 브라우저 종료를 기록했다.
- 공개 API 실측: 목록의 nextCursor는 `["v2", group, sortAt, id]`; 다음 페이지 첫 항목은 이전 페이지와 다르고, 버전 없는 옛 커서는 빈 items를 반환했다.
- 직접 URL 진입 잔여 오류: `/tournaments?kind=tournament&filter=1` 최초 진입은 React #419 3/3 발생 후 client render로 복구했다. 오류를 숨기지 않고 `after-direct-entry-report.json`에 보존했다. 변경 전부터 존재하는 `use-modal-a11y.ts`의 렌더 중 `document.activeElement` 접근(188~189행, 이 PR 수정 없음)이 원인으로 보인다. 이번 두 PR의 배포 범위와 분리해 후속 수정이 필요하다. 일반 클릭 경로의 PASS가 직접 URL 진입의 PASS를 의미하지 않는다.
- #2162: 문서 충돌 해결 후 최신 head `38e1b1df2` CI(API/Web/Gates) 통과, dev merge `20b87af4`. 참가 신청 차단은 인증·실데이터 쓰기 없이 이번 공개 화면 QA에서 재현하지 않았다.
- Copilot 예외: CLI와 공식 API 요청이 실행/리뷰를 생성하지 않아 사용자가 이 두 PR에 한정해 코드 리뷰+CI 기준 머지와 alpha 배포 진행을 승인했다. Copilot clean으로 표시하지 않는다.
