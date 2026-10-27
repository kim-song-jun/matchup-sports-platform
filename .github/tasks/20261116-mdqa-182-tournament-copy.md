# Task 20261116: 대회 결과 검토와 시상대 QA (#182)

Status: Review
**Owner**: QA root → frontend implementation
**Created**: 2026-10-28

## Context
리포트 [#182](https://teameet.jmandu.kr/issues/182/)는 역할명, 명단 용어, 공식 결과 확정 뒤 안내, 3위전 없는 시상대의 표시를 제보한다. 태스크 번호와 리포트 번호는 서로 다르다. 현행 v1과 기존 task 168의 시상대 근거를 사용한다.

## Goal
실제 공식 확정 결과와 존재하는 순위를 정확히 안내하고 역할명을 통일하며 명단 용어는 현행 Alpha를 확인한다.

## Original Conditions (must all be satisfied)
- [ ] 결과 검토의 역할 이름과 스태프 배정의 역할 이름을 일치시킨다.
- [ ] 명단의 제보된 용어를 현재 화면과 대조한다.
- [ ] 공식 확정 직후 성공을 알리고 실패 및 잘못된 링크는 구분한다.
- [ ] 3위 결과가 없는 시상대에 빈 3위 단상을 표시하지 않는다.

## User Scenarios
### Scenario 1: 결과 확정과 링크 이동
As a 대회 디렉터, I want to 공식 확정 결과와 현재 선택된 경기를 정확히 확인한다 so that 성공을 오류로 오인하거나 다른 경기를 잘못 처리하지 않는다.

Steps: 결과 검토에서 경기를 공식 확정하고 목록 변화와 뒤로·앞으로 이동을 확인한다.

Expected result: 실제 성공만 성공으로 표시하며 존재하지 않는 링크와 실패는 별도로 안내한다.

### Scenario 2: 공개 시상대와 명단
As a 대회 방문자 또는 팀 관리자, I want to 실제 순위와 일관된 명단 용어를 확인한다 so that 제공되지 않은 순위를 실제 수상으로 오인하지 않는다.

Steps: 3위전이 없는 대회의 공개 시상 화면과 명단 관리 화면을 확인한다.

Expected result: 실제 없는 3위 단상은 숨기고 기존 명단 기능을 유지한다.

## Test Scenarios
### Happy path
- [x] 결과 검토·시상 관련 4개 테스트 파일은 통합 head `d45b870261387b06692a114eb4d34b3b38864885`에서 60/60 통과했다.
- [ ] dev 머지 후 실제 Alpha에서 결과 확정과 공개 시상 화면을 재검증한다.

### Edge cases
- [x] 독립 리뷰가 찾은 딥링크 전환 회귀 두 건의 RED를 확인하고 수정 후 관련 테스트를 실행했다.
- [ ] 실제 3위전이 있는 경우와 공동 우승 화면을 배포 후 확인한다.
- [ ] 현행 Alpha 명단에서 제보된 골레이 용어를 확인한다. 현재 소스에서는 제보 문구가 발견되지 않았다.

### Error paths
- [ ] 실패한 확정, 잘못된 링크 및 재제출을 실제 성공과 혼동하지 않는지 확인한다.

### Mock data updates needed
- 관련 페이지·컴포넌트 테스트 fixture를 사용한다. API·schema·공유 MSW 계약 변경은 이 작업 범위에 없다.

## Tech Debt Resolved
- 확정 직후 stale 딥링크 안내와 데이터가 없는 3위 단상, 역할명 불일치를 수정했다. 명단 용어는 추가 실측이 남아 있다.

## Security Notes
- 실제 mutation 성공 콜백에서만 성공을 표시하고 기존 관리자 권한을 유지한다. 독립 코드 리뷰는 수행했으며 최신 head의 외부 보안 리뷰·CI는 별도 확인한다.


## Target / mode
Frontend v1, CODE. Report: https://teameet.jmandu.kr/issues/182/.

## Background
Four reported scenarios: staff role name mismatch; roster goalkeeper terminology; misleading deep-link message following result confirmation; empty third-place podium without third-place game. Read-only source investigation found inconsistent director role labels, a stale result-review deep link and unconditional empty podium. The reported obsolete goalkeeper wording was not found on current dev; verify before changes. Do not infer joint third place without data.

## Scope and boundaries
Use current v1 behavior and prior task 168 podium guidance. Keep unrelated shared API/types/hooks unchanged; no destructive data changes and no local web server.

## Acceptance Criteria
- [ ] Diagnose all four scenarios, preserve real review failure paths and accurate awards.
- [ ] Narrow regression checks and independent review at exact committed SHA.
- [ ] PR on dev, original tracker progress comment, actual Alpha evidence after deployment.

## Parallel Work Breakdown
- Result-review owner: role label and confirmation/deep-link UI; dedicated tests.
- Awards owner: podium display and tests, independent files.
- Root: contracts, serial validation, git, PR and Alpha QA.

## Risks and Dependencies
The success message must only appear on actual success. Do not invent rank data. Changes to shared contracts require a separate owner.

## Ambiguity Log
Report suggests joint third or hiding an empty position; task 168 says show only existing podium positions. Preserve actual backend ranking and hide absent positions.

## Progress Snapshot
- 2026-10-28: Claimed and confirmed assignee/in-progress. Dedicated worktree starts at origin/dev 392906709c15bf3e31d5b4099d8f203b032f39c5. Source findings await reproduction and tests; no Alpha fix verification.
- Alpha 392906709c15bf3e31d5b4099d8f203b032f39c5, public awards at 390x844, displayed an empty third-place podium for the reported tournament. Captured pre-fix evidence.
- Confirmed consumer RED for absent third-place podium and three result-review cases. Initial fix passed 58 tests; independent review found two query navigation regressions, confirmed RED and corrected, with 34 relevant tests GREEN. Independent diff re-review found no additional concrete defects. Post-deploy Alpha and exact committed-head verification pending.
- Current roster code uses the existing goalkeeper label; the report's obsolete wording was not found in source, and its Alpha scenario remains unverified.
- 2026-10-28: PR https://github.com/kim-song-jun/matchup-sports-platform/pull/2071 is open against dev; tracker comment https://teameet.jmandu.kr/issues/182/#comment-413 includes the pre-fix podium screenshot.
- After merging dev 42ca670d into the feature branch, the four focused files passed 60/60 at d45b870261387b06692a114eb4d34b3b38864885; independent static review reported no findings on that head. CI and external reviews must be checked against any subsequent head.
- The 390px podium capture is pre-fix Alpha evidence. Actual deployed-result, role-account, roster terminology and officialization scenarios remain unverified.
