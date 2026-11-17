# 회원 대진표 조회

Status: Review
Created: 2026-11-12

## Context
회원에게서 보고된 대진표 표시 문제를 관리자 화면에서 조사한다.
## Goal
회원 상세 하단에서 감사 기록과 10분 제한이 있는 조회 전용 대진표를 연다.
## Original Conditions
- [x] 회원 상세 하단에 작은 버튼
- [x] 회원 비밀번호와 로그인 세션을 변경하지 않음
## User Scenarios
관리자가 회원 상세에서 대회 링크와 조사 사유를 입력하고 해당 회원의 팀 강조가 적용된 대진표를 조회한다.
## Test Scenarios
- [x] owner/ops 허용, support/일반 회원 거절
- [x] 다른 관리자/회원/대회 조합 및 10분 만료 거절
- [x] 감사 기록 실패 시 열람 불가
- [x] 기존 일정 렌더러와 모든 cursor 페이지 재사용
- [x] 회원 세션 및 전역 query cache에 영향 없음
## Parallel Work Breakdown
단일 에이전트 순차 구현. Owned: admin preview API/service/tests, admin user detail/preview UI/tests, scoped bracket context, API docs/changeset. Forbidden: 운영 데이터/회원 세션/타 작업.
- [x] Phase 1: 규칙/계약 조사 및 격리 worktree
- [x] Phase 2: 백엔드 및 권한 테스트
- [x] Phase 3: UI 3안 제시 → 선택 → 구현
- [ ] Phase 4: 검증/PR/dev merge/alpha QA
## Acceptance Criteria
- [x] 서버에서 매 요청 관리자 권한 재검증
- [x] 감사 로그가 관리자·회원·대회와 만료를 고정
- [x] 조회 외 권한이 발급되지 않음
- [ ] UI 만료·에러 표시, alpha 390/768/1440 확인
## Tech Debt Resolved
회원 세션 우회 없이 기존 대진표 표시 계약을 재사용한다.
## Security Notes
로그인 토큰 발급 없음. 기존 관리자 세션과 audit ID를 함께 검증. support 제외. 대상 활성 회원만 허용. 캐시 no-store.
## Risks & Dependencies
실제 회원의 기기·브라우저 상태는 재현하지 않는다. 운영 반영은 사용자 main 승격 필요.
## Ambiguity Log
UI A 관리자 안/B 새 탭/C 상세 인라인 제시, 사용자 A 선택. 하단 작은 버튼은 사용자 지정.
## Progress Snapshot
Base origin/dev 4a53b95b1. Backend 16 tests + frontend 29 tests 통과. 패턴 및 표면 게이트 PASS. API 타입 PASS. Web 타입 PASS. 브라우저 node_repl 및 cua 모두 windows sandbox helper_unknown_error: setup refresh had errors로 시작 불가. 수동 Alpha QA 미검증, 운영 변경 없음.

## External review and QA blockers
- Copilot 공식 전용 API POST /pulls/2350/copilot-code-review: 422 ACTOR_INELIGIBLE. 연결 계정에 코드 리뷰 라이선스가 없거나 조직 정책이 차단됨. 기존 reviewer 요청은 HTTP 성공처럼 보였으나 리뷰 이벤트/결과가 없었음. 계정·모델·요금·머지 규칙 변경 없이 중단. 공식 설명: https://docs.github.com/en/rest/pulls/copilot-code-review
- PR #2350은 dev 대상. 필수 Copilot 리뷰가 없어 dev merge/Alpha 배포는 보류. 운영 main은 미변경.
- 브라우저 자동화 두 runtime 모두 sandbox 초기화 실패로 Alpha 390/768/1440 증거 수집 불가.
- MSW 계약은 실제 감사 기록 없는 가짜 열람을 막기 위해 명시적 503으로 sync.
