# Task 20261122: MD-QA #189 팀 파울 피리어드 안내

Status: Review
Owner: Codex
Created: 2026-10-30
PR: #2087

## Context
팀 파울이 후반에 0으로 바뀌면 기록이 사라진 것처럼 읽혔다. 2026-10-28 사용자 결정은 집계 규칙을 유지하고 표시만 고치는 것이다.

## Goal
어느 피리어드의 숫자인지와 다음 피리어드에 다시 센다는 안내를 운영 콘솔에서 보여 주고 QA 허브와 연결한다.

## Original Conditions
- [x] 단판은 경기 팀 파울, 전·후반은 전반/후반 팀 파울로 표시한다.
- [x] 다음 피리어드가 있으면 0부터 다시 센다는 안내를 표시한다. 하프타임은 방금 끝난 피리어드 수를 유지한다.
- [x] 집계·리셋 규칙, API·DB와 공개 관전 화면은 바꾸지 않는다.

## User Scenarios
운영자가 전반 파울을 기록하고 전반 종료 → 하프타임 → 후반 시작을 진행한다. 전반·하프타임은 전반 숫자와 후반 안내, 후반은 새 후반 숫자를 확인한다. 단판과 마지막 피리어드에는 다음 피리어드 안내가 없다.

## Test Scenarios
- 코드 근거: `team-foul-counter-bar.test.tsx`, `operate-console-core.test.tsx`의 전반·하프타임·후반·단판 회귀.
- 실제 alpha: [OPS-FOUL-189](../../docs/scenarios/19-game-operations-result-correction.md#ops-foul-189-팀-파울-피리어드-안내). 변경 후 실행 0/4·viewport 0/3이다.

## Parallel Work Breakdown
순차 작업이다. 제품 구현은 기존 #2087을 유지하고, 이번 후속의 Owned files는 이 task, 경기 운영 시나리오, scenario index다. 집계 소스·API·DB·다른 PR 제품 코드는 Forbidden이다.

## Acceptance Criteria
- [x] PR·수정 이유·실제 테스트 파일과 QA 시나리오를 연결한다.
- [ ] Alpha 4개 흐름과 390/768/1440 screenshot·console/network 증거를 기록한다.

## Tech Debt Resolved
PR 본문과 changeset에만 있던 MD-QA #189의 후속 검증 경로를 문서 허브에서 찾을 수 있게 한다.

## Security Notes
권한·인증·운영 명령 변경 없음. QA는 기존 운영 권한과 실제 콘솔 흐름을 사용한다.

## Risks & Dependencies
변경은 아직 미병합이다. 과거 정정 화면의 브라우저 증거를 #2087의 alpha 완료 증거로 사용하지 않는다.

## Ambiguity Log
| Date | Question | Resolution |
|---|---|---|
| 2026-10-28 | 집계 규칙도 바꾸는가 | 사용자 선택: 피리어드마다 새로 세는 규칙 유지, 표시만 수정 |

## Progress Snapshot
2026-10-30: PR·제품 소스·회귀 테스트 대조와 문서 연결 완료. 현재 PR head의 API/Web/Gates 성공은 리뷰에서 확인했으나 이번 문서 후속의 CI·alpha 실행 증거는 아직 없다.
