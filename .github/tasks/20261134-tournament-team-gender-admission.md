# Task 20261134: 대회 신청 팀 성별 제한 단순화

Status: In Progress
**Owner**: Codex
**Created**: 2026-11-13

## Context
팀원 프로필 성별 또는 팀 성별 일치 조건이 혼성팀의 신청을 막고, 반대 성별 팀원이 있으면 팀 설정을 우회했다.

## Goal
팀 설정 기준으로 반대 성별 단일팀과 성별 미설정 팀만 제한한다.

## Original Conditions
- [x] 남성부에는 여성팀 신청 차단.
- [x] 여성부에는 남성팀 신청 차단.
- [x] 팀 성별 미설정은 모든 부문 신청 차단.
- [x] 나머지 성별 조합 허용. 사용자는 종목·기간·정원·권한 등 기본 조건 유지 확인.

## User Scenarios
팀장/매니저가 혼성(성별 무관)팀으로 남성부·여성부·혼성부에 신청하고 제출한다. 미설정 팀은 팀 설정 안내를 받는다.

## Test Scenarios
- [x] 4개 대회 부문 × 8개 팀 설정 조합 및 프로필 행 없음.
- [x] 실제 서비스 신청 생성·제출·운영자 확정·리그 직접 추가 단위 회귀 검증: 4 suites, 334/334 PASS.
- [ ] API 타입 검사 및 alpha 검증.

## Parallel Work Breakdown
단일 에이전트 순차 작업. Owned: 공통 team-gender-eligibility, 관련 API specs, 대회/리그 계약 문서, changeset. Forbidden: DB schema, roster/player 성별 규칙, UI 레이아웃, 운영 승격.

## Acceptance Criteria
- [x] 팀원 성별로 팀 설정을 우회하지 않는다.
- [x] 신청·제출·확정·공통 리그 추가 판정 일치.
- [x] 관련 단위 테스트 통과. PostgreSQL 통합 실행은 Docker 미설치로 CI에서 검증.
- [ ] dev PR 머지 및 alpha 검증.

## Tech Debt Resolved
팀원 수 기반 신청 자격을 팀 프로필 기준으로 통일하고 API 계약 문서 동기화.

## Security Notes
인증·팀장/매니저 권한·운영자 권한·개별 선수 자격 검증 유지. 개인정보 추가 조회 없음.

## Risks & Dependencies
새 WSL 환경에 의존성·GitHub CLI·Docker가 없었다. API 의존성 설치 완료. 배포·alpha 검증은 접근 수단 확인 필요.

## Ambiguity Log
2026-11-13 사용자 답변: 성별 제한만 변경하고 기본 운영 조건 유지. 혼성은 현행 정본 `성별 무관` 저장값이며 새 enum/저장값을 만들지 않는다.

## Progress Snapshot
Base origin/dev 0f1f93621. Branch fix/tournament-team-gender-20261113. Worktree /tmp/teameet-tournament-team-gender-20261113. 구현 및 계약 동기화 완료. 단위 334/334 PASS, API tsc PASS, surface gate PASS. 통합 fixture 성별 설정 명시. Docker가 없어 DB 통합은 로컬 미실행. dev PR/alpha 대기.

## CI fix round 1
PR #2354 API CI: 205/206 DB integration suites passed. Two capacity race scenarios used shared `makeTeam` directly without a gender setting, so new admission correctly rejected them before the capacity race. Moved explicit gender setup into shared league-slot-harness team creation, covering applicants, seeded waitlist teams and direct additions. Real gender restriction remains unchanged.

## Scoped main hotfix (user-authorized 2026-11-13)
User explicitly requested dev merge followed by only this change on main. Dev PR #2354 passed Gates/API/Web, including the DB integration rerun, and was merged. Main hotfix is based on origin/main 6d12d118e (1.17.0), cherry-picks only the three task commits, and consumes only its own changeset into API/Web 1.17.1. No other dev features are included. Production environment approval remains enforced.
