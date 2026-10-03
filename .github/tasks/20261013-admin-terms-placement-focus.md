# Task 20261013: 관리자 약관 노출 위치 변경의 키보드 포커스 유지

Status: Review — alpha after pending
**Owner**: Codex bugfix session
**Created**: 2026-10-03

## Context

Refs #1464. 기존 PR #1486이 보이는 라벨과 접근 가능한 이름을 개선했으나 키보드 수용 조건은 남았다. 실제 alpha에서 노출 위치를 회원가입→대회 신청으로 변경하면 activeElement가 SELECT→BODY로 바뀌고 다음 ArrowUp으로 값을 복원하지 못한다. 동의 유형의 required→optional→required는 같은 폭에서 포커스를 유지한다.

공개 증거 SHA `67e0c72e1a18241a4383f274159b778b324d3613`, `docs/qa/2026-10-03-terms-keyboard-residual/`: 35 DOM records와 안전한 crop6개. CSS405/789/1183에서 수집했으며 배포 run8167aaa 이후지만 serving SHA는 미관측이다. 모바일 exposure crop은 복원·재포커스 이후 상태이며 실패 순간 이미지는 아니다. BODY 포커스는 DOM 기록으로 확인한다. `after-proof` 파일명은 이전 라벨 개선 이후 증거를 뜻하며 이 수정의 after가 아니다.

## Goal

노출 위치를 연속 변경해도 같은 입력 노드와 키보드 포커스를 유지하고 기존 동의 유형 초기화·local draft·저장 계약을 보존한다.

## Original Conditions (must all be satisfied)

- [x] 실제 TermsView 변경 계약을 실패하는 회귀 테스트로 재현하고 수정 후 통과시킨다.
- [x] 노출 위치·동의 유형·노출 순서의 기존 보이는 라벨과 접근 가능한 이름을 유지한다.
- [x] 위치 변경 시 footer→display_only, 그 외→required인 기존 local 초기화 계약을 유지한다.
- [x] 선택 변경만으로 약관 생성·저장·발행·동의·문의 상태 mutation을 실행하지 않는다.
- [x] 원 이슈의 전체 키보드·세 폭 수용 조건은 승인된 alpha 배포 뒤 재검증 전까지 미완료로 남긴다.

## User Scenarios

관리자가 새 약관에서 Tab으로 노출 위치에 도달하고 값을 연속 변경한다. 포커스는 해당 select에 남고 다음 Tab은 동의 유형, 다음 Tab은 노출 순서로 이동한다. 새 약관·기존 다중 노출 행 모두 다른 행의 값을 유지하며 선택 변경은 local draft에만 반영된다.

## Test Scenarios

- Happy path: 실제 새 약관의 Tab 진입·연속 위치 변경 후 노드 identity/focus 유지, Tab/ShiftTab 순서.
- Edge cases: signup/tournament_application/footer 순환과 동의 유형 option/reset; 기존 다중 행에서 한 행 변경 시 다른 행 값과 노드 유지.
- Controls: 동의 유형 연속 변경과 숫자 입력의 focus/value 유지, label 이름, local 변경 동안 mutation0.
- Error paths: 값 변경 뒤 Escape로 포커스가 사라지지 않는 DOM 계약. 실제 native popup·Arrow키 선택·scroll·스크린리더 음성은 jsdom 검증으로 대체하지 않는다.
- Mock data: 기존 v1 inline policy fixture를 사용하며 서버/DB/DTO fixture 변경 없음.

## Parallel Work Breakdown

- Root 구현/테스트/커밋/PR: 아래 Owned files만 수정한다.
- Independent reviewer: 공개 증거 및 실제 TermsView·v1 hook 계약을 읽고 원인/회귀 테스트를 독립 검토한다. 편집·commit·브라우저·실제 mutation 금지. 최종 committed diff를 다시 검토한다.
- Owned files: `apps/v1_web/src/app/admin/content/terms-view.tsx`, `apps/v1_web/src/app/admin/content/terms-view.test.tsx`, 이 task 문서, `.changeset/admin-terms-placement-focus.md`.
- Forbidden files: 공유 root tree, API/DTO/schema·가입/동의/약관 게시 계약, 다른 미병합 PR·release#1576, 문의 상세, QA179·완료 QA 결과·실제 운영 데이터.

## Acceptance Criteria

- [x] Root RED→GREEN 초점 검증, lint/typecheck, 필수 QA6개와 Changeset 정책.
- [ ] 명시4path commit·feature push·Ready/dev PR·exact-head CI·독립 정적 리뷰.
- [ ] 원본 증거의 이미지/DOM/viewport/timestamp 및 한계를 PR에 구분해 게시한다.
- [ ] 승인된 alpha 배포 뒤 동일 조건의 실제 after/3폭 Tab·연속 선택·Escape·scroll/focus·console/network를 확인한다.
- UI 형상/배치/스타일/문구 변경 없이 키보드 동작을 복구하는 승인 범위다. CLAUDE.md의 새 UI 3안 선택 절차에 대해 부모가 이 범위를 명시했으며 추가 디자인 선택은 요구하지 않는다.

## Tech Debt Resolved

편집 가능한 노출 위치 값으로 행 identity를 만드는 범위 내 결함을 제거한다. 새로운 fallback·focus 강제 이동·marker는 추가하지 않는다.

## Security Notes

합성 fixture 단위 테스트와 읽기 전용 공개 증거만 사용한다. 실제 약관 저장·발행·동의·문의 답변/상태 변경·merge·deploy0. `.env*`를 읽지 않는다.

## Risks & Dependencies

jsdom은 native select의 Arrow키·팝업을 구현하지 않는다. 테스트는 실제 변경 이벤트 이후 DOM identity/focus 및 Tab 순서를 검증하고 실제 키보드 before와 함께 판단한다. actual after는 별도 승인된 외부 배포가 필요하다. 기존 작성 폼 내부 Enter는 생성/저장을 호출할 수 있으므로 실제 QA에서 실행하지 않는다.

## Ambiguity Log

- 공유 저장소와 기존 작업을 변경하지 않도록 fresh origin/dev `8167aaa86ed3cc787bd82568515ad1f9d21d0ef2`에서 `/tmp/teameet-issue-1464-keyboard-20261003`, `fix/issue-1464-terms-placement-focus`를 만들었다.
- 노출 행은 현행 UI에서 추가·삭제·재정렬되지 않으며 각 slot이 `setPlacement(index, patch)`로 수정된다. mutable context를 포함한 key의 영향을 RED에서 확인한 뒤 최소 identity 수정안을 적용한다.
- #1464는 열린 상태로 유지한다. 새 중복 이슈를 만들지 않으며 이전 PR의 Fixes 표기를 이 후속 PR에 사용하지 않는다.

## Progress Snapshot

- 2026-10-03: 원 이슈/이전 PR 및 열린 PR 중복 확인, fresh worktree 준비. Root는 공개13 Git blobs/12 manifest SHA256·bytes/실제 PNG6개를 확인했다. 별도 readonly reviewer는 raw DOM35개를 직접 읽고3폭 노출 위치 포커스 유실·동의 유형 정상 대조와 metadata 한계를 확인했다. 독립 테스트 실행0.
- Root RED: 새 초점4개 중3FAIL/1PASS, 기존 이름 검사1개 skipped. 실패3개 모두 위치 변경 직후 SELECT→BODY를 검출했다. key를 고정 slot index로 바꾸고 행 추가·삭제·재정렬이 없는 근거를 코드 주석에 남겼다.
- Root GREEN: terms5 + 기존 inquiries12 = 17PASS, 최소 worker1. 첫 lint는 새 테스트의 ByRoleOptions에 없는 exact 옵션을 잡았다. 기본 문자열 name 일치를 사용하도록 고친 뒤 변경한 terms5 재통과, lint/typecheck/v1-pattern PASS. 두 실행을 합산 총수로 표현하지 않는다.
- Root 필수 QA6개 및 patch Changeset 정책 PASS(behavior1개/changed Changeset1개). 실제 native Arrow키·popup·전체 Tab cycle·3폭 after·스크린리더·scroll/console/network는 배포 뒤 검증 범위다. 이전 DOM의 mobile 순서 입력0.425px clip은 별도 관측이며 해결했다고 주장하지 않는다.
- 명시4path commit·feature push·Ready/dev PR·정확한 head CI·최종 committed diff 독립 리뷰는 진행 중이며 외부 PR 기록에 최종 결과를 남긴다.
