# Task 20261008: 관리자 개인 어워드 입력 행 모바일 넘침 (#1571)

Status: Review (alpha after pending)
**Owner**: Codex issue fixer
**Created**: 2026-10-03

## Context
[원 이슈 #1571](https://github.com/kim-song-jun/matchup-sports-platform/issues/1571): 실제 alpha CSS405×606에서 빈 로컬 항목 추가 뒤 문서 폭405→434, 삭제 버튼44px 중15.4px만 보인다. Tab으로 focus 가능하지만 잘림은 유지된다. 태블릿789/데스크톱1183은 정상 대조군이다. 수상명 flex-1 input이 최소 폭을 해제하지 않으며 삭제 버튼은44px/shrink-0이다. 원자료에 computed min-width는 없어 flex 최소 크기는 코드에 근거한 원인 후보다.

## Goal
기존 가로 행에서 수상명 입력만 줄어들 수 있게 해 삭제 버튼과 포커스 경계를 표시한다. 서버 저장·권한·수상자·picker 계약을 바꾸지 않는다.

## Original Conditions (must all be satisfied)
- [ ] CSS405에서 빈 행 추가 후 문서 가로 넘침 없음, 삭제44px 전체·Tab focus 표시.
- [ ] 태블릿789/데스크톱1183 기존 배치와 버튼 크기 유지.
- [ ] 별도 승인된 alpha 배포 뒤 동일 조건 실제 after/DOM/UTC/폭 기록. 이슈 OPEN/Refs 유지.

## User Scenarios
1. 합성 빈 조회 → 항목 추가 → 수상명 연속 입력 → Tab/Shift+Tab으로 제목/삭제 탐색.
2. Enter로 지정한 로컬 초안 행만 제거, 나머지 초안 유지. 추가/입력/제거만으로 서버 mutation0.
3. 조회 전용이면 기존 항목 표시, 입력/추가/삭제/저장 노출0.
4. 화면을 나갔다 재진입하면 저장하지 않은 로컬 초안이 사라진다.

## Test Scenarios
### Happy path
- [x] 실제 AwardsTab/AwardRow에서 빈 시작·추가·입력·Tab/Enter 로컬 제거 계약.
### Edge cases
- [x] 두 행 중 지정 행 제거, 연속 입력, 다시 추가, remount 초안 폐기, 조회 권한.
### Error paths
- [x] 기존 필수 수상자 검증/추천 후보 회귀. 저장 계약 변경 없음.
### Mock data updates needed
기존 합성 award fixture를 빈 조회로 전환하는 test holder만 추가한다. 실제 AwardsTab/AwardRow/EntityPicker를 유지하고 API hook만 mock한다. jsdom은 실제 flex 폭을 계산하지 않으므로 class/가짜 geometry를 모바일 RED→GREEN 증거로 쓰지 않는다.

## Parallel Work Breakdown
- Root owned: awards-tab.tsx 제목 input의 min-w-0 한 줄, 기존 awards-tab.test.tsx의 로컬 상호작용 회귀, task, Changeset.
- Child read-only 원인/후속 committed-tree 리뷰. 편집/커밋/브라우저/데이터 변경0.
- Forbidden: API/DTO/schema, 저장/수상자/permission gate, picker·다른 행 layout, 다른 미병합 PR, 실제 팀/QA179/완료 결과.
- CLAUDE UI 착수 규칙의 1줄 기계적 수정 예외: 기존 flex shrink 계약 복구이며 새 배치/정보 구조/디자인을 선택하지 않는다. 줄바꿈·버튼 재배치는 하지 않는다.

## Acceptance Criteria
- [x] 초점 상호작용 회귀·기존 award/picker/icon 테스트 PASS. 시각 RED→GREEN은 alpha after까지 미완료로 분리.
- [x] lint/typecheck·필수6aggregate gate·Changeset·diff/debt PASS. 명시4경로 커밋/clean tree는 커밋 후 PR 기록에서 확인한다.
- [ ] Ready/base dev PR·정확한 head CI·독립 정적 리뷰 결과 PR 기록.
- [ ] 실제 alpha 원 수용 조건은 승인 배포 뒤 별도 검증.

## Tech Debt Resolved
고정44px 삭제 컨트롤 옆 input의 flex 최소 폭 계약 복구. 기존 placeholder-only label 관찰은 이슈에서 별도 triage되지 않아 범위에 섞지 않는다.

## Security Notes
테스트 내 합성 local state와 mock mutation만 실행. 실제 Save/Delete 활성화0, 실제 사용자/권한/점수/QA179/완료 결과 변경0. 병합·자동병합·배포·유료 리뷰 재요청0.

## Risks & Dependencies
CSS intrinsic sizing·focus ring·페이지 overflow는 jsdom으로 증명하지 못한다. 실제 alpha after3폭은 별도 승인된 배포 대기다. 실제 입력과 버튼 크기·간격은 유지하며 긴 제목은 input 내부에서 탐색한다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-03 | 공개 증거 | initial image와 repeat DOM은 같은 instant인가? | 04:12:35 capture는04:19:07 DOM과 구분. focus image만04:19:07.599 DOM과 연결한다. |
| 2026-10-03 | source review | 코드로 원인이 확정됐는가? | flex minimum 원인 후보. 실제 computed값과 수정 after는 미관측이다. |

## Progress Snapshot
- 최신 dev에서 독립 `/tmp/teameet-issue-1571-20261003`, `fix/issue-1571-admin-awards-mobile-overflow` 생성. PR1570/1572 코드는 포함하지 않는다.
- 고정 증거SHA `124d731effba624e32b95a12bccd36a5c92a007e`, docs/qa/2026-10-03-award-overflow/:9/9 HTTP/Gitblob/byte, manifest8/8 SHA256, 실제4PNG pixels/raster/hash, DOM5/5 visible width/overflow 검산 PASS. 별도 browser 재실행0.
- 실제alpha mobile image04:12:35.771–.787 UTC, tablet DOM04:16:36.054/capture.061–.136, desktop DOM04:17:44.630/capture.635–.713, mobile repeat zero04:19:07.166→row.516→Tab.599/capture.606–.623. source serving SHA 미관측.
- CSS405×606/789×505/1183×758. PNG405×606/724×275/670×428이며 tablet/desktop crop를 viewport로 대체하지 않는다. 원 QA Save/Delete0·수상자선택0, 별도 picker 로컬 팀 선택만 있었고 저장0. after 승인 배포 대기.
- 제품 변경은 제목 input min-w-0 한 줄. 실제 AwardsTab/AwardRow local draft 신규3+기존6=9, EntityPicker2, award-icon2 총13PASS. API hook 경계 mock이며 새 CSS/geometry/class assertion 없음. 테스트 내 Enter 제거는 로컬 state이고 실제 alpha Delete 실행0과 구분한다.
- lint(typecheck+v1 patterns), 필수6gate, Changeset PASS. touched debt marker0/diff check PASS. 정확한 원격 head CI와 정적 리뷰는 PR 기록에 이어서 남긴다.
