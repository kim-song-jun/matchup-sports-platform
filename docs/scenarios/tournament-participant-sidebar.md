# 참가팀 상세 우측 안내 / 참가 카드

Status: Local Verified — Alpha 배포 대기
Task: [180 후속](../../.github/tasks/180-league-e2e-usability-followups.md)

## 변경 계약
- 대상: `/tournaments/1701404b-317b-4018-a90d-2d160b6af45d`.
- 참가팀의 신청 CTA가 없어도 데스크톱 참가 전 안내를 유지한다.
- 활성 신청의 `우리 팀 참가` 카드는 데스크톱 오른쪽 상단, 모바일/태블릿 제목 아래에 한 번만 표시한다. 종료 화면은 기존 본문 위치를 유지한다.
- 안내 문구, 커스텀 환불 정책 제외 규칙, 팀원 보기/운영진 관리 권한은 유지한다.

## 검증
- 상세 페이지 32/32, CTA 38/38 = 70/70 단위 테스트 PASS. 최초 실행은 오래된 로컬 의존성으로 실패했으며 별도 임시 의존성 경로로 해결했다.
- 1440/768/390 공개 방문자 실제 Alpha API 연결 로컬 페이지: HTTP200, pageerror0, failed HTTP0, 가로 넘침 없음.
- 1440/768/390 참가팀원 브라우저 fixture: 실제 Next 페이지와 공개 데이터에 인증/내 팀/신청/개인 공지 응답만 브라우저에서 대체. 실제 계정 로그인이나 서버 권한 검증을 대신하지 않는다.
- 참가 카드 오른쪽/본문 배치 및 단일 렌더 검증, 가로 넘침 없음. 미대체 설정·알림 API 401은 실제 로그인 세션이 없는 fixture의 제한이며 제품 성공으로 간주하지 않는다.
- before는 현재 Alpha, after는 사용자 요청 로컬 서버. 배포 후 실제 참가 계정 Alpha 검증은 미실행.
- 증거: `docs/screenshots/tournament-sidebar-local/fixture-member/{before,after}/{1440,768,390}.png`, 각 `results.json`.
- 재현 도구: `scripts/qa/capture-tournament-sidebar-local.cjs` (headed Chrome, QA_ORIGIN/QA_PERSONA/QA_PHASE).

## 런타임 / Cleanup
- 사용자 명시 요청으로 로컬 서버 유지: `http://localhost:3013`, API `https://alpha.teameet.co.kr`.
- worktree `_worktrees/fix-fixture-standings-link`; WSL wrapper PID18095, Next PID18147. 로그 `/tmp/teameet-sidebar-next.log`.
- Windows 파일 변경을 감지하도록 WATCHPACK_POLLING=true. 임시 의존성 `/tmp/teameet-sidebar-deps`는 서버가 사용하므로 유지.
- 자동 QA Chrome은 각 실행의 finally에서 종료. 실제 사용자 확인용 브라우저와 서버는 요청에 따라 유지.
- 커밋/push/Alpha 배포 미실행. 이전 fixture 순위 CTA 수정은 같은 worktree에 보존.
## 2026-10-16: 진행 중 리그 보기 버튼 끝선 정렬
- 사용자 후속 제보: 긴 상단 버튼과 오른쪽 참가 영역의 끝선 불일치.
- before: 1024/1440/1920px에서 오른쪽 끝선 -20px; 상단 래퍼의 우측 padding이 원인.
- 수정: 기존 sticky/모바일 gutter를 CSS 클래스로 유지하고, 데스크톱 우측 padding0 및 그리드와 동일한 최대 폭 적용.
- after: 1024/1280/1440/1920px 모두 좌·우 끝선 차이0px. 768/390px도 가로 넘침0, pageerror0. 검증 6/6.
- 증거: docs/screenshots/tournament-sidebar-local/fixture-member/alignment-{before,after}/. 회원 상태는 기존 browser fixture이며 settings/notifications의 미인증401 제한은 동일.
- 현재 로컬 서버에 반영, 기존 사용자 미리보기 유지. Alpha 배포 미실행.
PR 검증: 최신 dev eded915e0 반영, tsc 및 v1 패턴 검사 PASS. 경기 상세37 + 프로필 복귀30 + 대회 상세32 + CTA38 + bracket42 = 179개 PASS. diff --check PASS, touched source 신규 debt marker 없음.
