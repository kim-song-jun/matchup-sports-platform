# Task 20261137 — 대회 취소 사유 필수
Status: In progress

## Context
사용자: “우리 대회 취소할 수 있는데 그때도 text 필수로 받자”. 기존 취소 확인은 사유 없이 상태를 변경한다.
## Goal
대회 취소 때 공백이 아닌 사유를 입력·저장하고 API 직접 호출도 같은 조건을 강제한다.
## Original Conditions
v1 대회 상태 변경만 대상. 기존 역할, 취소 가능 상태, 500자 제한과 감사 로그 유지. 리그·참가 신청 취소 계약은 변경하지 않는다.
## User Scenarios
운영자가 취소를 선택하고 사유를 작성한 후 확인한다. 빈 사유는 제출할 수 없다. 실패 시 입력과 오류를 유지한다.
## Test Scenarios
초안/접수/마감/진행 상태 각각 누락·빈값·공백 사유 거부와 쓰기 0건, 유효 사유 trim 및 양쪽 감사 로그 저장. UI 필수 입력·실패·닫기 검사.
## Parallel Work Breakdown
단일 에이전트 순차 작업. Owned: 대회 상태 서비스·셸·관련 테스트·계약 문서. 다른 세션 변경 보존.
## Acceptance Criteria
- [x] 서버 취소 사유 검증 및 감사 저장 회귀 작성.
- [x] UI 3안 제시 → 사용자 A 선택 → 공용 사유 필수 모달 적용.
- [x] 관련 검증, dev PR #2470·CI·머지(b6156d248).
- [x] Alpha 배포·입력/실패/닫기 및3너비 구조 실측.
- [ ] 전후 스크린샷 시각 증거(ego capture timeout).
## Tech Debt Resolved
기존 취소를 비가역이라고 설명한 주석은 실제 초안 복구 계약에 맞춘다.
## Security Notes
기존 관리자/디렉터 권한과 트랜잭션 보존. 실제 대회 취소를 QA 목적으로 실행하지 않는다.
## Risks & Dependencies
Alpha 브라우저 캡처는 앞 작업에서 timeout 발생 이력이 있다. 로컬 Node24.15.0은 요구22.23.5와 달라 CI를 정본으로 확인한다.
## Ambiguity Log
취소 대상은 참가 신청이 아닌 대회 자체 상태 변경으로 해석. UI A공용 사유모달/B전용모달/C인라인폼 제시.
## Progress Snapshot
base origin/dev9cf6cfd6f. backend·frontend 범위, 격리 worktree tournament-cancel-reason. API165/165·웹17/17 PASS, API/Web tsc와 surface/pattern PASS. API는 취소 4개 출발 상태에서 누락/빈값/공백을 거부하며 양쪽 감사 로그 trim 저장을 검사했다. UI는 빈 사유 제출 차단·오류 후 입력 유지·돌아가기로 무변경 종료를 확인했다. 공용 모달에 optional cancelLabel을 추가해 취소 실행과 닫기 문구를 구분한다. 의존성은 격리 설치, Prisma만 생성하고 DB/seed는 실행하지 않았다.

## 2026-11-20 dev 반영 checkpoint
- PR [#2470](https://github.com/kim-song-jun/matchup-sports-platform/pull/2470), head dbda083b3f4d6f029f8c6ddd11105ce408f711a5. Gates/API/Web/security 전부 success, unresolved review thread 0·changes-requested 없음 확인 후 dev merge b6156d24833bc6054817880ccda494338a3f272a.
- 실제 PR API CI 로그: PostgreSQL214파일1633 PASS·기존3 SKIP, 단위565파일9425 PASS. 대회 상태 서비스 회귀 실행 확인.
- Alpha 배포 run44756733843은 머지 SHA CI44756733970을 기다린다. success/머지 사실을 실제 서비스 배포 증거로 대체하지 않는다.
- ego-lite space8에서 기존 관리자 로그인으로 테스트 초안 대회1fa13d46-ab8a-4760-9cdf-934fb48bc2aa의 취소 확인 모달을 실제 열고 돌아갔다. 취소 실행 없음. baseline은 사유 입력 없는 기존 UI였으며 screenshot은 허용 재시도1회까지 Page.captureScreenshot timeout이라 파일 증거가 없다.
- 후속 QA 기록은 qa/tournament-cancel-reason-evidence-20261120에 남긴다. 기능 브랜치와 다른 세션 자원은 구분한다.

## 2026-11-21 Alpha checkpoint
- 배포44756733843 success 및 공개 commit b6156d24833bc6054817880ccda494338a3f272a·release1.22.0-alpha.20261120.gb6156d24833b·DB health true 확인.
- 실제 사유 필수·공백 제출 불가·실패 메시지/입력 유지·돌아가기,3/3너비 모달 수용·가로 넘침 없음 확인. 초점 TEXTAREA. 테스트 대회는 draft→draft 보존. 실제 취소 저장 성공은 CI 근거와 구분한다.
- [실행 시나리오와 한계](../../docs/scenarios/tournament-cancel-reason.md). 전후 screenshot은 capture timeout으로 미완료이므로 완전한 시각 PASS는 아니다. QA space9 종료, 기존 사용자 space0·재로그인용 space7 보존.
