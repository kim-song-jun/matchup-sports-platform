# 대회 상세 모바일 팀명 넘침 수정

Status: In Progress
Owner: Codex (single agent)

## Context
Alpha `/tournaments/ad120000-0000-4000-8000-000000000001` 모바일 조별 일정 경기 카드의 긴 상대 팀명이 카드 밖으로 나간다. 390px에서 카드 대진 영역316px, 실제 grid scrollWidth396~405px로 재현했다.

## Goal
기존 세 칸 대진과 팀명 말줄임을 유지하면서 카드 내부로 팀명을 제한한다.

## Original Conditions
- API/DB/경기 데이터 변경 없음.
- 기존 ellipsis 의도를 복구하는 gridTemplateColumns 한 줄 기계적 수정. 새 화면·디자인 구조 변경 없음.

## User Scenarios
관전자가 모바일 대회 상세의 조별 일정에서 양쪽 팀명과 vs를 카드 안에서 확인한다.

## Test Scenarios
- [x] Alpha headed before390/768/1440, console/network 기록.
- [x] scoped 경기 카드 기존 회귀 테스트16 PASS, tsc0, pattern PASS.
- [ ] 배포 후 Alpha390/768/1440에서 모든 경기 grid scrollWidth=clientWidth 확인.

## Parallel Work Breakdown
단일 에이전트. Owned: competition-fixture-card.tsx, 이 문서, changeset, scoped capture script. Forbidden: 공유 작업트리의 타 세션 변경, API/DB/스키마.

## Acceptance Criteria
- [ ] 390px에서 두 팀명이 카드 너비를 넘기지 않는다.
- [ ] 데스크톱/태블릿의 기존 정렬과 링크·상태·장소 표시를 유지한다.
- [ ] dev 머지 및 Alpha 배포 후 갤러리 게시.

## Tech Debt Resolved
CSS Grid 1fr의 auto minimum 때문에 nowrap 팀명이 트랙을 늘리는 문제를 minmax(0,1fr)로 복구한다.

## Security Notes
권한·인증·네트워크 계약 변경 없음.

## Risks & Dependencies
공유 CompetitionFixtureCard를 사용하는 리그도 같은 긴 팀명 넘침 방지를 적용받는다.

## Ambiguity Log
기존 단일 줄 말줄임 디자인을 유지한다. 전체 팀명은 기존 group aria-label에 보존된다.

## Progress Snapshot
- 최신 origin/dev5d3015b59에서 격리 worktree 생성.
- Headed before: browserPID30040/parent33168 정상 종료. pageerror0, 로그아웃 auth/me401은 baseline. 문서 전체 너비는390이나 카드 콘텐츠가넘치는 문제임을 실측.
- Alpha DOM 진단(probe, 배포 완료 증거 아님): production source의 수정 grid 값을 실제18카드에 적용,390/768/1440 모두 scrollWidth=clientWidth. PID19480/parent24920 정상 종료.
- 직접 코드 리뷰: one-line minmax는 기존 grid의 가운데52px 및 gap8px와 ellipsis를 유지하며 양쪽 트랙의 auto minimum만 제거한다. 대회·리그16개 기존 테스트 PASS. API·링크·상태 영향 없음. 새 debt marker 없음.
