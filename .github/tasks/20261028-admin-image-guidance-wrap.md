# Task 20261028: 관리자 이미지 안내 문구 줄바꿈

Status: In Progress
**Owner**: Frontend → root review
**Created**: 2026-10-28

## Context
Alpha의 관리자 대회 정보 화면에서 이미지 영역 상단 안내 문구가 390px에서 한글 어절 중간으로 나뉜다. 기존 PR [#2072](https://github.com/kim-song-jun/matchup-sports-platform/pull/2072)는 다른 두 안내 문구의 줄바꿈을 수정했으며 이 문구는 수정 전부터 남아 있었다.

## Goal
이미지 선택 안내의 한글 어절을 자연스럽게 줄바꿈하고 긴 끊김 없는 문자열의 넘침을 방지한다.

## Original Conditions (must all be satisfied)
- [ ] 기존 안내 문구·업로드·미리보기·저장 동작을 유지한다.
- [ ] 390px에서 이미지 안내 문구의 한글 어절 중간 줄바꿈을 방지한다.
- [ ] 긴 공백 없는 문자열도 화면을 넘치지 않고 줄바꿈될 수 있다.

## User Scenarios
### Scenario 1: 좁은 관리자 이미지 설정
As a 대회 관리자, I want to 이미지 안내를 좁은 화면에서 읽는다 so that 목록과 상세 이미지의 관계를 이해한다.

Steps: 390px 관리자 대회 정보 화면에서 대회 이미지 안내를 확인한다.

Expected result: 어절이 중간에서 끊기지 않고 안내와 기존 이미지 선택 동작이 유지된다.

## Test Scenarios
### Happy path
- [ ] 공유 이미지 선택 컴포넌트의 안내 문구에 한글 어절 단위 줄바꿈이 적용된다.
### Edge cases
- [ ] 공백 없는 긴 문자열도 필요한 경우 줄바꿈된다.
### Error paths
- [ ] 기존 업로드 실패 표시와 저장 이미지 보존 테스트가 통과한다.
### Mock data updates needed
- API·데이터 계약 변경이 없어 공유 mock 변경은 필요하지 않다.

## Parallel Work Breakdown
- 구현자는 공유 이미지 컴포넌트·해당 테스트와 이 문서 및 changeset만 수정한다.
- root는 RED/GREEN 검증, 독립 리뷰, Git·PR 및 배포 후 Alpha 검증을 담당한다.

## Acceptance Criteria
- [ ] 화면의 이미지 안내에 국소적인 줄바꿈 규칙을 적용한다.
- [ ] 해당 소비자 테스트에서 수정 전 실패와 수정 후 통과를 확인한다.
- [ ] 배포 후 Alpha 390·768·1440px에서 시각 증거를 확인한다.

## Tech Debt Resolved
- 이미지 안내의 비자연스러운 한글 어절 분리를 수정한다. 실제 배포 후 검증은 별도다.

## Security Notes
- 기존 업로드 권한·저장 경로를 변경하지 않는다.

## Risks & Dependencies
- 공유 컴포넌트는 팀매치 및 관리자 대회·리그 화면에서 사용되므로 긴 문자열과 기존 업로드 경로를 보존한다.
- jsdom 스타일 테스트는 실제 브라우저에서의 줄바꿈을 입증하지 않으므로 Alpha 화면 검증이 필요하다.

## Ambiguity Log
- 새 화면이나 정보 구조를 설계하지 않는 한 줄 줄바꿈 버그 수정이다. 기존 UI와 문구를 유지한다.

## Progress Snapshot
- 2026-10-28: E2E 관리자 Alpha 서빙 `6727b8abc256289c0d9958f13073e156f3e203aa`의 390×844 화면에서 상단 안내가 `사용 / 하고,`로 갈라지는 현상을 독립 시각 검토로 확인했다. 수정 전 스크린샷: `tmp/qa/mdqa-assigned-monitor/2026-10-28-alpha-6727/image-settings-390.jpg` (원 checkout).
- 기존 사용자의 이미지 설정 범위 및 PR #2072의 후속이며 다른 컴포넌트의 안내 문구는 변경하지 않는다.
- root가 공유 이미지 선택 컴포넌트의 계산된 `word-break` 회귀 테스트 RED(1 실패, 기존 3 통과)를 확인했다. 안내 문구에 `keep-all`과 긴 단어 보호용 `overflow-wrap: anywhere`를 국소 적용했다. GREEN 및 Alpha 배포 후 시각 확인은 아직 남아 있다.
- 2026-10-28: 공유 컴포넌트 테스트 4/4 GREEN; 독립 미커밋 diff 리뷰 FindingsNone. 커밋 후 재검증·immutable head 독립 재리뷰 및 Alpha 시각 확인은 남아 있다.
