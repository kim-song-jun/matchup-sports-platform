# Task 20261004: 관리자 명단 검토의 초기 focus

Status: Review
**Owner**: Codex bug-fix session
**Created**: 2026-10-03

## Context
Refs #1564. 실제 alpha 리그·대회 CSS405/789/1183에서 명단 검토를 열어도 focus가 배경에 남는다. 공용 SimpleModal은 trigger 저장·닫기 복귀와 내부 경계 순환을 구현하지만 초기 내부 focus를 하지 않는다. 최신 base는 origin/dev `dbb6468d81809649026e6a9c193d5a982f8a57b6`이며 열린 PR에서 동일 수정은 없다.

## Goal
명단 검토를 열면 즉시 내부 focus가 생기고 기존 Tab 순환·닫기·복귀 계약을 유지한다. alpha 수정 후 검증 전에는 이슈를 종료하지 않는다.

## Original Conditions (must all be satisfied)
- [ ] 리그·대회 명단 검토를 처음 열면 focus가 내부로 이동한다.
- [ ] 수동 focus 없이 Tab·Shift+Tab으로 내부를 탐색한다.
- [ ] 기존 Escape/X 닫기와 정확한 trigger 복귀를 유지한다.
- [ ] 배포 후 CSS405/789/1183 실제 alpha 재검증·안전한 DOM·사진을 남긴다.

## User Scenarios
관리자가 명단 검토 버튼을 누른 뒤 바로 키보드로 내부 내용을 탐색하고 Escape/X/본문 닫기/Back으로 같은 버튼에 돌아온다. 재개방이나 조회 상태 갱신은 이미 입력 중인 focus를 빼앗지 않는다.

## Test Scenarios
- 수정 전 실제 SimpleModal/RosterModal을 trigger 클릭으로 열어 초기 focus 실패를 확인한다.
- Tab/Shift+Tab 반복, Escape/X/본문/배경/Back, 실제 trigger 변경·재개방, StrictMode 조건부 마운트.
- 실제 RosterModal의 정상/로딩/오류/빈 명단 및 읽기 전용 상태; 입력 중 rerender, pending 잠금과 body scroll/history 유지.
- API 훅 경계만 mock하며 제품 모달·focus·history는 mock하지 않는다. 실제 데이터 쓰기는 없다.

## Parallel Work Breakdown
- Frontend: root가 공용 모달과 두 테스트 파일만 수정한다. 초기 focus 로직만 변경하여 UI 3안 선택 대상인 레이아웃/시각 재설계는 없다(CLAUDE의 로직 전용 예외).
- Review: 독립 에이전트는 정확한 committed head를 읽기 전용으로 검토한다. self-commit 금지.
- Sequential: 초점 테스트 → frontend lint/typecheck → 필수 guardrail/Changeset → 명시 pathspec commit/push → Ready/dev PR → 정확한 head CI. alpha after는 별도 승인된 배포 대기.

## Acceptance Criteria
- [x] 초점 RED→GREEN, lint/typecheck, aggregate checks 통과
- [ ] 커밋/PR scope 확인과 독립 리뷰 완료
- [ ] Ready for review / base dev / 정확한 head CI 확인
- [ ] 실제 alpha 수정 after 및 원 수용 조건 전체 완료(현재 미완료)

## Tech Debt Resolved
초기 진입을 검증하지 못하던 모달 테스트를 실제 trigger→focus 회귀로 보강한다. 첫 focus와 기존 경계 trap이 같은 공용 FOCUSABLE_SELECTOR를 사용해 disabled 입력을 Tab 후보로 세지 않는다. no-control pending 모달도 내부 panel에 focus를 유지한다. 닫기 cleanup은 조건부 마운트에도 trigger를 돌려준다.

## Security Notes
API/DTO/권한/명단·상태 저장을 변경하지 않는다. QA179 명단과 완료 QA 결과 및 다른 세션의 작업에 쓰기하지 않는다. 병합·자동병합·배포·유료 리뷰 재요청은 금지한다.

## Risks & Dependencies
SimpleModal 직접 사용8곳에 초기 focus가 적용된다. 기존 trap/history/Escape/body-lock을 유지하고 공용 훅 전체 이관이나 다른 모달 설계로 확대하지 않는다. 대회 경기 수정의 같은 관찰은 공용 원인 영향 검토만 하며 별도 공개 before는 없다.

## Ambiguity Log
| Date | Question | Resolution |
| --- | --- | --- |
| 2026-10-03 | 이미지로 focus/전체 레이아웃을 입증할 수 있는가 | 3장은 리그 헤더 crop뿐이다. focus는 리그·대회 각3폭 비식별 DOM 타임라인 근거. screenshot UTC는 null이며 DOM UTC로 대체하지 않는다. |
| 2026-10-03 | task 번호 drift | README의 현재 최대 정수 번호20261003 다음20261004 사용. 번호는 생성일이 아니다. |

## Evidence / Progress Snapshot
- 고정 증거: `d8b6e25c275201af3ff8bab3d336b3be9af585b1/docs/qa/2026-10-03-admin-roster-focus/`. 공개7파일 HTTP200·Git blob·bytes, manifest6항목 SHA256/bytes 및3이미지 실제 픽셀 확인.
- CSS405×606/789×505/1183×758; 헤더 raster373×77/481×77/480×77. 정확한 focus DOM UTC는 이슈 #1564 정본이며 이미지 촬영UTC/페이지 serving SHA는 미관측.
- before는 실제 alpha이며 수정 after, console/network, 실물 기기/스크린리더 검증은 아직 없다.
- 2026-10-03: 전용 worktree `/tmp/teameet-issue-1564-20261003`, branch `fix/issue-1564-admin-modal-initial-focus`, origin/dev에서 준비.
- 수정 전2 suites: **15 FAIL / 11 PASS**, 모두 실제 초기 focus 조건에서 실패. 첫 pnpm 옵션 오류는 테스트 실행이 아니므로 RED 증거에서 제외한다.
- 수정 후2 suites: **26/26 PASS**(공용11 + 실제 RosterModal15), Vitest 최소 worker1 직렬. 제품 focus/history/모달은 mock하지 않았다. 기존 명단 훅의 합성 테스트만 사용하며 실제 alpha mutation0.
- frontend lint/typecheck·v1 patterns, 필수 aggregate6/6, Changeset policy, diff check·touched debt grep PASS. 신규 debt marker나 untracked 제품 dependency가 없다.
- committed-head 독립 리뷰/CI 진행 중. alpha after는 승인된 배포 대기. 테스트·lint 프로세스 종료; 소유 dependency symlink2개만 target 일치를 확인하고 커밋 전 제거한다.
- 독립5/5 committed-tree 리뷰에서 `d9daad2f720616da3115a4f0232de6614b759595`의 pending 해제 후 panel→Shift+Tab 배경 이탈 P2를 발견했다. 실제 조수정 caller의 실패 후 모달 유지 경로와 교차검증했다. 추가 초점1case RED(배경 경기별 명단 focus)→경계 수정 후2 suites **26/26 PASS**. panel을 양방향 Tab 시작 경계로만 처리하며 이후 lint·정확한 새 head CI·독립 재리뷰로 이전 head와 구분한다.

## Owned / Forbidden Files
Owned: 이 task, `.changeset/admin-modal-initial-focus.md`, `tournament-detail-shared.tsx`, `tournament-detail-shared.test.tsx`, `tournament-roster-modal.test.tsx`(모두 apps/v1_web의 해당 admin/tournaments/[id]).
Forbidden: shared root WIP, 다른 이슈 worktree/미병합 코드, API/DTO/schema/실제 QA 데이터, 다른 화면 디자인.
