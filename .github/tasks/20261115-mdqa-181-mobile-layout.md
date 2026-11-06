# Task 20261115: 대회 운영 모바일 화면 QA (#181)

Status: Review
**Owner**: QA root → frontend implementation
**Created**: 2026-10-28

## Context
리포트 [#181](https://teameet.jmandu.kr/issues/181/)은 390px 대회 운영·공개 화면 네 곳의 정보 잘림과 정렬 문제를 제보한다. 태스크 번호와 리포트 번호는 서로 다르다. 기존 대회 운영 문서 127과 브래킷 문서 119의 흐름을 유지한다.

## Goal
좁은 화면에서도 두 팀을 구분하고 경기 정보와 기존 작업에 접근하며 공개 점수판과 스태프 필드 안내를 읽을 수 있게 한다.

## Original Conditions (must all be satisfied)
- [ ] 운영 콘솔 파울 줄의 비슷한 팀 이름을 구분할 수 있다.
- [ ] 어드민 전체 경기 일정에서 홈·어웨이와 시각·결과 및 기존 작업에 모바일로 접근할 수 있다.
- [ ] 공개 경기 점수판에서 한글 팀 이름의 어절이 부자연스럽게 나뉘지 않는다.
- [ ] 스태프 경기장 카드의 아이콘·제목·설명이 올바르게 정렬된다.

## User Scenarios
### Scenario 1: 모바일 경기 운영
As a 현장 담당자 또는 관리자, I want to 각 팀의 파울과 경기별 작업을 좁은 화면에서 확인한다 so that 잘못된 팀이나 경기를 처리하지 않는다.

Steps: 390px에서 파울 줄과 대진 관리의 경기 일정 전체보기를 열고 각 팀·결과·작업을 확인한다.

Expected result: 팀 이름을 구별하고 홈·어웨이와 각 경기의 수정·운영·결과 관련 작업에 접근한다.

### Scenario 2: 공개 경기와 스태프 필드
As a 방문자 또는 스태프, I want to 경기 팀 이름과 경기장 안내를 읽는다 so that 경기와 장소를 혼동하지 않는다.

Steps: 공개 경기 상세와 스태프의 경기장 섹션을 390px에서 확인한다.

Expected result: 팀명과 필드 안내가 잘리거나 비정상적으로 들여써지지 않는다.

## Test Scenarios
### Happy path
- [x] 관련 컴포넌트 4개 테스트 파일은 통합 head `d3350b21c6f72c269d1817c02bd483ad9e6e66d4`에서 110/110 통과했다.
- [ ] dev 머지 후 Alpha에서 네 화면을 390·768·1440px로 확인한다.

### Edge cases
- [ ] 긴 공백 없는 이름, 같은 접두사를 가진 팀과 긴 경기장 이름의 실제 화면을 확인한다.
- [ ] 모바일 카드에서 기존 경기 액션, 키보드 포커스 및 데스크톱 표를 확인한다.

### Error paths
- [ ] 권한 또는 작업 실패를 성공으로 표시하지 않고 기존 오류 경로를 유지한다.

### Mock data updates needed
- 관련 컴포넌트 테스트 fixture를 사용한다. API·schema·공유 MSW 계약 변경은 이 작업 범위에 없다.

## Tech Debt Resolved
- 좁은 화면의 말줄임과 전체 일정 표에 대한 모바일 접근성 개선을 구현했다. 실제 배포 화면 검증은 남아 있다.

## Security Notes
- 기존 관리자 권한과 경기 작업 경로를 유지한다. 독립 코드 리뷰는 수행했으며 별도 외부 보안 리뷰·CI는 최신 head 기준 결과를 확인해야 한다.


## Target / mode
Frontend v1, CODE. Report: https://teameet.jmandu.kr/issues/181/.

## Background and current evidence
Four 390px report scenarios: field console foul team names, admin match schedule table, public match scoreboard team-name wrapping, and staff field card alignment. Alpha 392906709c15bf3e31d5b4099d8f203b032f39c5 with authenticated E2E administrator at 390x844 reproduces the schedule table: 1135px table inside 390px horizontal scroll area with no clear hint. Other report scenarios require individual verification. Screenshot: tmp/qa/mdqa-assigned-monitor/2026-10-28-user-login-session/alpha-mdqa181-bracket-before-390.png in the original checkout.

## Scope / boundaries
Smallest v1 UI changes with existing design tokens. No API/types/hooks, unrelated files, local Next server or edits in another worktree. The schedule table may be near #177 work; avoid its owned bracket card/summary files.

## Acceptance Criteria
- [ ] Diagnose all four report scenarios against v1 and preserve real actions and data.
- [ ] Demonstrate narrow regression checks and independent review on exact commit.
- [ ] Verify responsive visual behavior on Alpha after dev merge, record persona/viewport/SHA and screenshots.
- [ ] Post accurate PR and verification status to the original report.

## Parallel Work Breakdown
- Worker: isolated frontend fix and targeted tests for owned paths, no self-commit or high-load checks.
- Root: evidence, serial validation, integration, git and PR.
- Independent reviewer: adversarial review on immutable head.

## Risks & Dependencies
Existing #177 PR modifies bracket card, helpers and tab. Avoid overlapping ownership and preserve actions. Do not label pre-deployment test results as Alpha pass.

## Ambiguity Log
No product policy decision identified; choose clear mobile presentation without hiding functionality.

## Progress Snapshot
- 2026-10-28: Claimed in UI, confirmed assignee and in-progress. Existing PR/task overlap researched; #177 is separate. Dedicated worktree based on current origin/dev 392906709c15bf3e31d5b4099d8f203b032f39c5.
- Actual Alpha 390px schedule table reproduction captured as above; remaining three scenarios not yet verified.
- Focused pre-commit tests: 4 files, 110/110 GREEN. Schedule mobile-card consumer test was RED before implementation. Independent diff review found no additional concrete defects; exact committed-head review still pending.
- The schedule table and scoreboard were observed on Alpha at 390x844; not all four original scenarios have a fresh baseline. No deployed fix or post-merge Alpha PASS is claimed.
- 2026-10-28: PR https://github.com/kim-song-jun/matchup-sports-platform/pull/2070 is open against dev; tracker comment https://teameet.jmandu.kr/issues/181/#comment-412 includes two pre-fix screenshots.
- After merging dev 42ca670d into the feature branch, the four focused files passed 110/110 at d3350b21c6f72c269d1817c02bd483ad9e6e66d4; independent static review reported no findings on that head. CI and external reviews must be checked against any subsequent head.
- The captured 390px schedule and public scoreboard show the pre-fix Alpha state; foul and staff baselines, deployed-fix evidence and responsive Alpha verdicts remain pending.
