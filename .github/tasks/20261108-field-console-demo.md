# 필드 담당자 운영콘솔 체험과 화면 안내

Status: Review — local validation passed; alpha visual QA pending

## Context
사용자 대회 운영 상단의 체험 링크가 대회 관리 화면으로 연결된다.
## Goal
실제 현장 운영콘솔을 재사용한 샘플 경기와 영역별 오버레이 안내를 제공한다.
## Original Conditions
- [x] 필드 담당자의 실제 콘솔 UI로 체험한다.
- [x] 회색 반투명 덮개, 강조 영역, 화살표와 설명으로 먼저 안내한다.
- [x] 다음/이전/건너뛰기/다시 보기와 종료 후 직접 체험을 제공한다.
## User Scenarios
대회 운영의 체험 버튼 → 화면별 안내 → 경기 시작 → 골/카드/교체 → 종료.
## Test Scenarios
진행 전환, 이벤트와 취소, API 격리, 안내 키보드 및 링크 계약을 검증한다.
## Parallel Work Breakdown
단일 에이전트, 순차 구현. 기존 공유 작업 트리는 보존하고 최신 dev의 격리 worktree를 사용한다.
## Owned / Forbidden
Owned: 체험 진입, 신규 field-console-demo 경로/데이터/안내, 공용 콘솔의 데이터 주입과 안내 anchor.
Forbidden: 실제 API/권한/DB와 기존 작업 트리 WIP.
## Acceptance Criteria
- [x] 실제 기록에 영향을 주지 않고 샘플 경기의 상태/점수/명단/기록이 연동된다.
- [ ] 안내 중 배경 조작을 막고 모바일/태블릿/데스크톱에서 대상과 설명이 보인다.
- [x] 좁은 테스트와 타입 검사, alpha 화면 검증의 수행 여부를 기록한다.
## Tech Debt Resolved
콘솔의 주기적 상세 갱신도 subtree 데이터 소스를 사용해 체험이 실제 API로 빠지지 않게 한다.
## Security Notes
인증/실시간 소켓을 호출하지 않으며 샘플 전용 메모리/QueryClient로 격리한다.
## Risks & Dependencies
alpha 화면 검증은 배포가 필요하다. 새로고침하면 샘플 기록은 초기화된다.
## Ambiguity Log
사용자가 기존 콘솔 위의 반투명 회색 오버레이와 화살표 안내를 명시적으로 선택했다.
기존 대회 관리 체험은 유지하고 상단 체험 버튼만 현장 콘솔로 연결한다.
## Progress Snapshot
- 최신 dev(546add158) 기반 `feat/field-console-demo`, `_worktrees/field-console-demo`에 구현했다. 원래 작업 트리 WIP는 변경하지 않았다.
- 상단 운영 콘솔 체험은 `/field-console-demo`, 주요 기능 보기는 기존 `/tournament-ops-demo#demo-guide`로 연결한다. 기존 대회 관리 체험과 기능 안내를 유지한다.
- 안내: 팀/점수/시간 → 시작 → 이벤트 → 기록 확인 → 전후반/종료, 5단계. 실제 컴포넌트의 sample preview와 별도 QueryClient를 사용하며 안내 재진입이 연습 기록을 변경하지 않는다.
- 롤링 종목은 현행 계약상 교체 기록 버튼이 없으므로 5인제 축구·제한 교체 3회 샘플로 명시했다.
- 신규 6 tests PASS: 안내 다음/이전/종료, Escape, 시작 전 상태, 득점/옐로카드/교체 실제 선택, 중지/재개/전후반/종료, 샘플 API 호출 0, 기록 보존, 잘못된 상태 거절.
- 영향 검증 5 files / 119 tests PASS(JSON success=true). 이후 샘플 교체 정책·추가 클릭 시나리오 변경은 신규 2 files / 6 tests 재검증 PASS. 기존 core 테스트에는 act/key warning이 있으나 실패는 없다.
- 최종 `pnpm.cmd --filter v1_web exec tsc --noEmit` PASS. 패턴 gate PASS. Windows cmd의 POSIX find/grep 미지원으로 기본 lint의 pattern 단계는 실패했으나, 동일 스크립트의 child_process shell만 Git Bash로 지정해 검사했고 규칙을 변경하거나 건너뛰지 않았다.
- `git diff --check` PASS. touched-path TODO/FIXME/HACK/XXX 신규/기존 marker 없음. 새 route/import 파일은 현재 untracked이며 아래 owned 범위로 함께 전달해야 한다.
- 미커밋/미배포. alpha after viewport 0/3(390/768/1440), console/network 및 화살표 실제 위치 0/3으로 미검증. 테스트를 시각 QA 완료로 취급하지 않는다.
- 설치는 격리 worktree의 frozen lockfile + ignore-scripts로 실행했다. 로컬 web 서버/브라우저/실제 경기/DB는 시작·수정하지 않았다.

## Follow-up — 주요 기능 링크 복구
- 사용자 지시: 주요 기능 보기는 기존 대회 관리 체험 안내를 유지한다. PR #2269에서 두 버튼이 필드 콘솔로 연결된 회귀를 수정한다.
- Owned: demo-entry.tsx, field-console-demo.test.tsx, 이 작업 문서와 docs/scenarios/field-console-demo.md.
- 검증: 운영 콘솔 체험과 주요 기능 안내의 서로 다른 href를 기존 렌더 테스트에서 검증한다.
- PR #2269의 Copilot 생략 승인은 해당 PR에만 적용됐으며 후속 PR에 확대하지 않는다.
- 후속 검증 결과: 기존 href 상태에서 1개 회귀 테스트 실패(RED), 복구 후 동일 테스트 1 PASS / 무관한 2개 제외(GREEN). 기존 `/tournament-ops-demo`와 `demo-guide` anchor를 코드로 확인했다. `git diff --check` PASS. 전체 빌드/타입 검사 및 alpha 브라우저 검증은 미수행이며 PR CI/머지 후 검증으로 남긴다.

## Follow-up — 모바일 같은 탭 이동과 복귀 (2026-11-09)
- 사용자 승인: 두 링크를 같은 탭으로 통일하고 체험 종료/복귀 동선을 명확히 한다.
- UI 선택: 직전 제안의 같은 탭 이동을 사용자가 선택. 별도 패널 신설 없이 기존 헤더 링크 스타일을 재사용한다.
- Owned: demo-entry, demo-return-link, 두 체험 헤더 및 관련 테스트/changeset/이 문서.
- 두 버튼의 서로 다른 목적지와 가이드 anchor를 유지하고 새 탭 속성·안내를 제거한다.
- 진입 화면은 허용된 운영 경로 3개만 탭별로 저장한다. 직접 공유 진입/저장 불가는 /tournament-management로 복귀한다.
- 대회 관리 체험의 샘플 이동 제한이 명시적 복귀 링크를 막지 않도록 한다.
- 검증: 관련 2 files / 28 tests PASS, tsc --noEmit PASS, v1 패턴 gate PASS, diff --check PASS, touched-path debt marker 0. 기존 공유 의존성 누락은 격리 worktree의 frozen-lockfile 설치로 해결했다.
- Alpha before: headed Chromium(PID 2936/PPID 2918, 종료 완료), 공개 콘솔·가이드 각 390/768/1440 = 6/6 캡처. 가로 overflow 0, pageerror/HTTP 오류 0, 기존 복귀 링크 0. after/PR 상태는 진행 중.
