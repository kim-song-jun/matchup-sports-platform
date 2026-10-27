# Task 20261117: 관리자 이미지 안내 모바일 줄바꿈

Status: Review
**Owner**: QA root → frontend implementation
**Created**: 2026-10-28

## Context
기존 이미지 계약 PR [#2045](https://github.com/kim-song-jun/matchup-sports-platform/pull/2045)의 [Alpha QA 증거](https://github.com/kim-song-jun/matchup-sports-platform/pull/2045#issuecomment-6446632242)에서 390px 안내 문구 두 곳의 한글 어절이 중간에 끊겼다. 이는 해당 이미지 계약의 후속 작업이다.

## Goal
상세 이미지 스위치와 공개 설정의 안내를 좁은 화면에서 읽기 쉽게 표시하고 기존 입력·접근성 동작을 유지한다.

## Original Conditions (must all be satisfied)
- [ ] 390px 상세 이미지 표시 안내가 한글 어절 중간에서 불필요하게 끊기지 않는다.
- [ ] 390px 공개 설정 안내가 한글 어절 중간에서 불필요하게 끊기지 않는다.
- [ ] 긴 공백 없는 문자열과 스위치의 켬·끔 상태 및 접근성 설명 연결을 유지한다.
- [ ] 수정 후 Alpha에서 390·768·1440px 실제 화면을 확인한다.

## User Scenarios
### Scenario 1: 관리자 이미지 설정
As a 대회 관리자, I want to 이미지 표시와 공개 설정 안내를 모바일에서 읽는다 so that 저장할 설정을 이해한다.

Steps: 관리자 대회 정보 화면에서 상세 이미지 표시 설정을 켜고 끄며 안내와 공개 설정 문구를 확인한다.

Expected result: 안내가 자연스럽게 줄바꿈되고 스위치와 설명 연결이 유지된다.

## Test Scenarios
### Happy path
- [x] 두 관련 컴포넌트 테스트 파일은 통합 head `faf441bdba0e96be58c2df1e5c2c8bed0582c12a`에서 2/2 통과했다.
- [ ] dev 머지 후 Alpha에서 390·768·1440px의 실제 줄바꿈을 확인한다.

### Edge cases
- [x] 실제 스위치 설명을 대상으로 수정 전 테스트의 RED를 확인했다.
- [ ] 긴 연속 문자열, 스위치 켬·끔과 공유 공개 설정 소비자를 실제 화면에서 확인한다.

### Error paths
- [ ] 기존 이미지 저장 실패와 권한 오류가 가려지지 않는지 확인한다.

### Mock data updates needed
- 전용 컴포넌트 테스트를 사용한다. API·schema·공유 MSW 계약 변경은 이 작업 범위에 없다.

## Tech Debt Resolved
- 관리자 이미지와 공개 설정 안내의 국소 줄바꿈 처리를 추가했다. 실제 배포 화면 판정은 남아 있다.

## Security Notes
- 기존 관리자 권한과 저장 흐름을 변경하지 않는다. 독립 코드 리뷰는 수행했으며 최신 head의 외부 보안 리뷰·CI는 별도 확인한다.


## Scope
Frontend v1, CODE. Follow-up to .github/tasks/20261102-tournament-two-images.md and merged PR https://github.com/kim-song-jun/matchup-sports-platform/pull/2045. Independent Alpha evidence: https://github.com/kim-song-jun/matchup-sports-platform/pull/2045#issuecomment-6446632242.

## Findings
At 390x844, two Korean help strings in the admin image and visibility area break inside words. At 768 and 1440 screenshots no matching wrap was observed. Proposed fix must remain local, handle long unbroken text, and respect shared consumers.

## Acceptance Criteria
- [ ] Confirm current component contract, apply smallest safe correction with regression coverage.
- [ ] Independent immutable-head review and narrow tests; dev PR.
- [ ] After dev merge verify actual Alpha at 390, 768, and 1440 and record screenshots.

## Parallel Work Breakdown
- Frontend worker owns affected components and tests, no commit/push.
- Root verifies, reviews, and coordinates Git/PR.

## Risks and Dependencies
Shared components are also used in team matches and competition visibility. Avoid global token changes.

## Ambiguity Log
No new UX pattern requested; preserve existing layout and make Korean wrapping readable.

## Progress Snapshot
- 2026-10-28: Actual Alpha screenshots at 390/768/1440 captured, independently visually reviewed; 390 needs correction. Dedicated worktree created from origin/dev 392906709c15bf3e31d5b4099d8f203b032f39c5. Admin image persistence checks are partial and tracked in PR 2045 comment.
- Two focused style-contract tests failed before the fix and both component files now pass, 5/5 tests total. These jsdom tests do not prove actual browser layout; post-merge 390/768/1440 Alpha QA remains necessary.
- Independent review identified the first targeted text was not the actual screenshot source. The worker removed that unrelated change and added a RED consumer test for the actual tournament image switch description. The corrected two component tests now pass 2/2; diff re-review found no additional concrete defects. Visual Alpha confirmation is pending.
- 2026-10-28: Follow-up PR https://github.com/kim-song-jun/matchup-sports-platform/pull/2072 is open against dev and links the pre-fix 390px screenshot from the existing PR 2045 QA evidence.
- After merging dev 42ca670d into the feature branch, the two focused files passed 2/2 at faf441bdba0e96be58c2df1e5c2c8bed0582c12a; independent static review reported no findings on that head. CI and external reviews must be checked against any subsequent head.
- The admin image save/restore QA is partial as recorded on PR 2045. Actual post-deployment 390/768/1440 visual verification remains pending.
