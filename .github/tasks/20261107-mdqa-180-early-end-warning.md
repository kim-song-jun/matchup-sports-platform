# MD-QA #180: 결선 동점 조기 종료 경고 위치 수정

Status: Review
**Owner**: frontend-ui-dev
**Created**: 2026-10-23

## Context
결선 경기가 0:0으로 시작하면 `endBlockedReason`가 계산되고, 현재 조기 종료 버튼은 비활성 상태와 사유를 ⋯ 더보기 메뉴 안에서 이미 제공해요. 같은 사유가 전역 경고 배너로도 반복 노출돼 일반 진행 화면에 불필요한 노란 경고가 남아요.

## Goal
조기 종료 제한 이유는 더보기 메뉴의 해당 액션 안에서만 안내하고, 종료 비활성화와 서버 종료 정책은 유지해요.

## Original Conditions (must all be satisfied)
- [x] 진행 화면에서 결선 동점 조기 종료 경고를 전역 배너로 표시하지 않아요.
- [x] 더보기 메뉴를 열면 조기 종료가 비활성화되고 차단 사유가 표시돼요.
- [x] 비활성 액션으로 `end` 명령이 나가지 않아요.
- [x] 비동점과 정규 시간 종료 동작을 유지하고, takeover 거절 보기 전용과 `SUPPORT_READONLY` 역할을 구분해요.
- [x] 다른 경고와 더보기 시트의 접근성 동작을 유지해요.

## User Scenarios
### Scenario 1: 운영자가 결선 동점 경기를 진행해요
진행 화면에는 조기 종료 경고가 보이지 않아요. 운영자가 ⋯ 더보기를 열면 비활성인 경기 종료 액션과 이유를 확인해요. 비활성 액션으로는 종료 요청이 전송되지 않아요.

## Test Scenarios
### Happy path
- [x] 정규 시간 전 결선 동점: 화면에서 사유가 보이지 않고, 메뉴에서 비활성 종료 액션과 사유를 확인해요.
### Edge cases
- [x] 비동점은 차단 이유가 없어요.
- [x] 정규 시간 종료 후 기존 승부차기/경기 종료 흐름이 유지돼요.
- [x] takeover가 거절된 대회 디렉터와 `SUPPORT_READONLY` 모두 더보기 조작을 비활성화해요.
### Error paths
- [x] 비활성 액션을 클릭해도 종료 명령이 전송되지 않아요.
### Mock data updates needed
- [x] API·타입·MSW 계약 변경 없음.

## Parallel Work Breakdown
### Frontend
- [x] 회귀 테스트를 먼저 추가해 실제 전역 경고 노출을 RED로 확인한 뒤, 경고 렌더 위치를 수정해요.
### Sequential
- [x] RED/GREEN을 동일한 좁은 Vitest 테스트 이름 필터로 확인해요.
- [ ] alpha 390/768/1440 화면 검증은 merge 후 별도 완료해요.

## Acceptance Criteria
- [x] 위 사용자 시나리오 및 회귀 조건이 충족돼요.
- [x] 가장 좁은 관련 테스트가 실제 RED 후 GREEN이에요.
- [x] diff 검사와 touched-path 기술부채 검색을 통과해요.
- [x] alpha 화면 검증의 남은 범위를 정확히 기록해요.

## Tech Debt Resolved
- 전역 진행 화면에 중복 노출되던 조기 종료 차단 경고를 제거해요.

## Security Notes
- 서버 정책, 권한 판단, 종료 명령 payload를 변경하지 않아요.

## Risks & Dependencies
- alpha UI 검증은 merge 뒤 수행해야 해요.

## Ambiguity Log
기존 Task 180은 G6–G13 통합 이력이라 MD-QA #180의 작업 문서로 재사용하지 않아요. 이번 변경은 사용자가 요청한 MD-QA 자동 수정 범위에서 이미 더보기 메뉴에 있는 차단 사유의 중복 전역 렌더만 제거해요. 새 화면·새 동작·정보 구조를 설계하는 선택은 만들지 않아요. 별도 제품 디자인 선택이 생기면 구현 전에 A·B·C 제시와 사용자 선택을 적용해요.

## Progress Snapshot
- Worktree: `/Users/sungjun/.codex/worktrees/mdqa-180/matchup-sports-platform`
- Branch/base: `codex/mdqa-180-20261023` / `b3cbb4b63cfaa385d7daea1ea16a0258a311901b`
- RED: focused Vitest filtered by `MD-QA #180` — 1 failed / 3 passed / 103 skipped, actual exit 1. The failure captured the duplicate global `role=status` warning before ⋯ was opened.
- Fix/GREEN: removed only the global warning render. The initial same-command run passed 4/4 selected tests (103 skipped), actual exit 0.
- Independent review correction: the earlier viewer test covered a `TOURNAMENT_DIRECTOR` with denied takeover, not the `SUPPORT_READONLY` role. The test now names that path accurately and a separate `SUPPORT_READONLY` tie case verifies hidden global warning, disabled overflow action, and no command. Follow-up narrow run passed all 5 selected tests (103 skipped), actual exit 0.
- Follow-up test command: `pnpm --filter v1_web exec vitest run src/components/tournament-live/operate/operate-console.test.tsx --testNamePattern='MD-QA #180' --maxWorkers=1 --minWorkers=1` — 5 passed / 103 skipped, actual exit 0.
- Cleanup: temporary root and app `node_modules` symlinks were removed. No Vitest process remained; broad nodeish process count returned to the preflight value of 44.
- Remaining: alpha screenshots and console/network checks at 390/768/1440 after merge; no local server used.
- Prior committed head `821405396706b088a7b87de853eb2ef82d504345`: independent gpt-6-sol review PASS (Critical 0 / Warning 0); CI `39907213962` Gates/API/Web registered and SUCCESS; actual Codex code review completed with no findings. These results apply to that head, not to the later documentation rename.
- Documentation follow-up: renamed this task to a numeric filename per `.github/tasks/README.md`. New-head CI and review remain pending; source/test bytes are unchanged by this documentation-only follow-up.
