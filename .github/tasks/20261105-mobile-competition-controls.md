# Task 20261105: 대회 모바일 필터·정렬 B안

Status: Deployed (alpha)
Created: 2026-10-22
Owner: Codex (단일 세션)

## Context
사용자가 대회 목록의 세 줄 조작 영역과 중복 접수 요약이 넓고 붕 떠 보인다고 피드백했다. A/B/C 예시를 비교한 뒤 B(한 줄 압축)를 선택했다.
## Goal
모바일 목록 조작을 건수·필터·정렬 한 줄로 묶는다.
## Original Conditions
- [x] 사용자 선택 B: 외부 접수 토글·요약·초기화를 제거하고 필터 시트 안에서 사용한다.
- [x] PC 기존 구성과 공통 BottomSheet는 유지한다.
- [x] 기존 모바일 정렬 중복 손잡이 제거도 유지한다.
## User Scenarios
목록에서 총 건수·필터 개수·정렬을 한 번에 본다. 필터를 열어 접수 상태를 적용하거나 초기화한다. 정렬 선택 후 URL·첫 페이지가 갱신된다.
## Test Scenarios
- [x] 기존 코드에서 모바일 한 줄 계약 실패(RED).
- [x] 모바일 요약 중복 제거, 필터 page 보존/적용/초기화, 마감 정렬 안내·접수 조건, PC 회귀 테스트.
- [x] 목록 paging·return 회귀, Web 타입/패턴 검사.
## Parallel Work Breakdown
순차: 사용자 B안 선택 → 좁은 구현 → 검증 → 기존 PR #2036 갱신. 병렬 에이전트 없음.
Owned: competition-discovery-controls component/CSS/spec, 기존 Web changeset, 이 task.
Forbidden: API·DB·공통 BottomSheet·PC 디자인·무관 WIP.
## Acceptance Criteria
- [x] 모바일 바깥쪽은 한 줄, 44px 터치 목표와 정렬·필터 동작 유지.
- [x] 관련 테스트·타입 검사 및 PR 파일 범위 확인.
## Tech Debt Resolved
중복 표시·행별 반복 여백 제거. 기본 정렬의 문자 화살표를 기존 아이콘으로 정리해 줄바꿈 방지.
## Security Notes
표시 구조만 변경하며 서버 필터·권한 및 URL 계약은 유지한다.
## Risks & Dependencies
alpha 미배포·브라우저 연결 없음. 수동 화면 확인은 별도이며 실제 앱 서버를 검증용으로 띄우지 않는다.
## Ambiguity Log
사용자가 B안을 선택했다. 최초 피드백에서 PC는 정상이라고 했으므로 모바일만 압축한다.
## Progress Snapshot
- 사용자 B안 승인에 따라 모바일 한 줄 건수·필터·정렬 구현. 외부 접수 토글·요약·초기화는 PC에서만 유지한다.
- 필터 시트는 기존 접수 선택·draft 초기화·적용·페이지 복원 계약을 재사용한다. 모바일 마감순의 접수 조건 설명은 정렬 시트 내부에 제공한다.
- 검증: controls11 PASS, kind27/paging18/return18/page-seed19 =82 PASS, 합계93개 고유 테스트 PASS.
- Web 전체 타입 검사 PASS. 최초 테스트의 getByRole exact 옵션 타입 오류는 anchored name 정규식으로 수정 후 타입 검사·controls 재통과.
- Web 패턴 검사 PASS(미정의 CSS 토큰0·간격 격자 이탈0). Windows에서는 검사기 execSync만 Git Bash를 쓰도록 임시 bootstrap해 실행했고 저장소 검사기는 변경하지 않았다.
- 기존 return 테스트의 league-matches MSW handler 경고는 기존 경고이며 테스트18개는 통과했다.
- common BottomSheet origin/dev 대비 diff0, touched-path debt marker0 및 git diff --check PASS.
- alpha 미배포로 실제 320/390/768 화면·콘솔·네트워크는 미검증. 프리뷰 이미지는 선택용 예시이며 실제 앱 검증으로 계산하지 않는다.
- 기존 PR #2036의 범위를 B안 모바일 정리와 중복 손잡이 제거로 갱신한다. 머지·배포는 수행하지 않는다.


## Alpha deployment — 2026-10-22
- 사용자 배포 승인 및 Copilot 외부 모델 오류 예외 승인 후 #2035·#2036 dev 머지. Copilot clean으로 기록하지 않는다.
- 최종 배포 SHA: `0b0ac9a39333cc90d4556d437ab923575f34eaa4`. 각 머지 직후 Windows 로컬 dev `--ff-only` 동기화 완료.
- dev CI Gates/API/Web PASS: [39751993655](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/39751993655).
- alpha 배포 SUCCESS: [39751993510](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/39751993510). 실제 응답 commit 일치, API success / db true.
- 공개 비로그인 persona로 headed Chromium: 대회 목록 320/390/768/1440 한 줄 배치·44px·가로 overflow 없음, 모바일/태블릿 정렬→마감순 접수조건→필터→초기화→적용→Escape, PC 정렬 PASS.
- 기존 확정 경기(승제21, fixture 5c824264-af8c-5b49-8623-3461357fd781)의 자책골이 홈 득점 영역으로 이동한 것을 390/768/1440에서 before/after 확인. 3:1 점수 및 선수명·OG 유지. 공개 API 두 자책골 사례의 방향 변경 및 점수·이름 보존 PASS.
- pageerror 0. 비로그인 auth/me 401 및 탐색·prefetch·analytics 요청 ERR_ABORTED를 원본 증거에 별도 기록. 로그인·운영자 수정/저장 흐름은 범위 밖으로 미실행.
- 증거: `docs/visual-qa/pr2035-2036/README.md` (별도 evidence branch). 실행한 브라우저 트리 종료 확인. 앱·DB 데이터 변경 없음.
