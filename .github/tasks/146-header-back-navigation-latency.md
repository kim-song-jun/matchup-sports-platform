# Task 146 — 상단 뒤로가기 대기 개선

## Context / Goal
- 사용자: 상단 ← 클릭 시 현재 화면이 다시 로딩되는 것처럼 보인 뒤 복귀. 다른 배포 완료 후 이번 수정을 배포하도록 승인.
- 범위: v1 frontend navigation logic, tests, changeset, 본 문서. Backend/다른 세션 WIP/production main 승격 제외.
- 최신 dev `d5eedf5df`의 공통 Link는 부모 경로를 push한다. full prefetch로 동적 복귀 화면을 미리 준비한다.
- PageTransitionController의 150ms timeout은 새 화면이 준비되지 않아도 old → old 전환을 재생할 수 있다. timeout은 skipTransition 후 pending callback을 해제하도록 수정한다.
- 처음 확인한 공유 트리 `992dba62f`는 오래된 코드였다. 배포용 SSOT는 최신 dev에서 만든 `/tmp/teameet-header-back`이다. 기존 공통 navigation intent/tab/search 정책을 보존한다.

## Original Conditions / Acceptance Criteria
- [x] 상단 복귀 목적지 full prefetch, 알림 복귀 URL과 data-nav-back 유지.
- [x] 새 화면이 150ms 안에 commit되지 않으면 snapshot 애니메이션을 건너뛴다.
- [x] 정상 commit은 애니메이션 허용. superseding navigation/unmount에서 timer/promise 정리.
- [x] query-only 상단 복귀도 progress 종료. 기존 tab/search는 진행바 시작 안 함.
- [x] 관련 회귀 27/27 및 tsc 통과.
- [ ] 먼저 진행 중인 alpha 배포 종료 확인 후 dev 머지/alpha 배포 확인.
- [ ] 사용자 기기에서 실제 체감 확인.

## Responsibilities / Interface / Errors
- AppBackLink: 기존 Link 계약 유지, prefetch=true만 추가.
- PageTransitionController: pending transition 객체 하나 소유. timeout/연타/unmount에 skip 및 resolve. 늦게 호출된 이전 callback은 새 transition의 timer를 소유하지 못한다.
- RouteProgressBar: 내부 Suspense에서 pathname + query 완료 감지. useNavigationIntent 유지.
- 새로운 API/권한/입력/fixture 없음. 서버 에러를 성공으로 바꾸지 않는다.

## User / Test Scenarios
- 느린 대진표 → 상단 상세 복귀: 현재 화면에 old-to-old 전환을 재생하지 않는다.
- 빠른 destination commit: 기존 전환 유지.
- 연타로 query 이동: 이전 snapshot과 timeout 정리.
- unmount: pending snapshot/timer 정리.
- query-only 상단 복귀: 8초 timeout 전에 진행 표시 종료.
- modified 클릭 및 기존 tab/search 분류 회귀 없음.
- prefetch와 실제 지연 수치는 production 브라우저에서 별도 검증해야 한다. timer 단위 테스트로 기기 성능 개선을 입증했다고 주장하지 않는다.

## Work Breakdown / Owned Files
단일 에이전트. `app-back-link.tsx`, `page-transition-controller.tsx`와 테스트, `route-progress.tsx`와 테스트, `.changeset/quick-header-return.md`, 본 문서.

## Tech Debt / Security / Risks
- timeout의 old-to-old 재생, superseded callback/unmount 수명주기 정리.
- full prefetch는 보이는 복귀 목적지의 요청을 앞당기며 API 데이터 전부를 캐싱하지 않는다.
- 새로운 dependency/secret/외부 redirect 없음.
- Next 계약: https://nextjs.org/docs/app/api-reference/components/link#prefetch

## Ambiguity Log
- 상단 ← 확정. 구체적 route/기종/앱 여부 미확인. 실제 기기 원인/개선 시간 단정 금지.
- alpha 배포 승인으로 해석. main 승격은 저장소 정책상 사용자 전용.

## Progress Snapshot
- 격리 branch: `fix/header-back-navigation-latency`, base `d5eedf5df`.
- 대기 대상 alpha run `34130468413` 및 후속 `34130892256`(다른 작업 PR #1113).
- preflight: load 0.52 / 24 cores, swap 0, available 14.8GB.
- local web/API 접속 불가, Docker WSL socket 오류, headed Playwright MCP 없음. 실기기/viewport 0/3 검증 대기. owned server/browser 없음.
- 변경은 CSS/마크업 레이아웃이 아닌 navigation logic. live UX verdict는 배포 후에도 실기기 확인 필요.

- Validation: navigation intent + transition 19/19, route-progress 8/8 PASS; tsc PASS. 초기 tsc는 공유 폴더의 오래된 의존성 때문에 실패했으며 격리 폴더에 frozen-lockfile 설치 후 통과.
