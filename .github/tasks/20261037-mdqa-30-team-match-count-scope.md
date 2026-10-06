# Task 20261037: MD-QA #30 팀매치 건수 집계 범위 안내

Status: In Progress
**Owner**: root → frontend builder → independent reviewer
**Created**: 2026-10-06

## Context
- 기존 리포트: https://teameet.jmandu.kr/issues/30/
- 최초 20개와 더 보기 후 40개의 카드·전체·종목·요약 숫자는 일치하지만 화면에서 로딩 범위를 설명하지 않는다.
- PR #1414와 #1402의 계약은 커서로 불러온 항목 기준 요약이다. 서버 전체 합계나 중복 오류는 확인되지 않았다.
- 미배정 접수·댓글 0, 기존 task/worktree/PR/활성 실행 중복 없음 확인 후 UI ‘내가 처리하기’로 김성준·확인 중 저장 및 실제 표시 확인.

## Goal
전체·종목 배지와 요약 각각의 실제 로딩 집계 범위를 화면에서 설명하고 기존 계산·필터·페이지네이션을 보존한 dev PR을 게시한다.

## Original Conditions (must all be satisfied)
- [x] 제보 원문과 현재 v1 계약을 대조한다.
- [x] 수치 자체 오류를 주장하거나 미확인 서버 전체 합계를 구현하지 않는다.
- [x] 실제 렌더와 더 보기 전후 설명·수치 보존 회귀를 RED→GREEN으로 검증한다.
- [ ] 독립 리뷰 후 dev PR 및 같은 리포트 진행 댓글을 저장·확인한다.
- [ ] 머지 후 alpha 검증은 코드 검증과 구분한다.

## User Scenarios
기본 목록 최초 진입→전체/종목 건수·요약 읽기→더 보기→누적 수와 집계 범위 설명 확인. 종목 선택 시 배지의 비교용 로딩 목록과 선택한 목록 요약의 범위를 구분한다.

## Test Scenarios
### Happy path
- [x] 실제 client/view의 최초·더 보기 상태에서 안내가 보이고 누적 집계는 유지된다.
### Edge cases
- [x] 종목 선택/검색·필터 및 0건·로딩 상태를 설명과 모순 없이 보존한다.
### Error paths
- [x] 기존 오류·재시도·더 보기 disabled 계약을 유지한다.
### Mock data updates needed
- API/DTO/schema/MSW 변경 없음. 기존 실제 hook의 HTTP 경계 합성 fixture로 렌더 회귀 검증.

## Parallel Work Breakdown
- Phase A: builder는 아래 Owned 파일에 회귀 테스트만 작성, root RED 전 production 편집 금지.
- Phase B: root RED 확인 후 최소 UI 안내, Changeset 및 task 갱신. 테스트 실행은 root 직렬.
- Phase C: 독립 read-only 리뷰, root committed-tree 검수·dev drift·명시 pathspec commit/push·PR·tracker 댓글.
- Phase D: dev 머지/배포 후 alpha 390/768/1440 실측 QA pending.
- Owned: `apps/v1_web/src/components/team-matches/team-matches-page.tsx`, 같은 폴더 `team-matches-count-scope.test.tsx`, `.changeset/mdqa-30-team-match-count-scope.md`, 이 task.
- Forbidden: shared hooks/types/MSW/DTO/schema, globals/tokens, 다른 앱·automation 상태, 다른 버그 파일. 실제 필요 발견 시 root에게 근거 먼저 전달.

## Acceptance Criteria
- [x] 로딩 범위를 사용자가 읽을 수 있고 전체 서버 합계로 오해시키지 않는다.
- [x] 최신 origin/dev 기반 최소 변경·RED/GREEN·관련 좁은 검증 PASS.
- [x] 기존 DESIGN 토큰/컴포넌트 사용, 새 dependency·부채 marker 0.
- [ ] Code review Critical=0 / Warning=0, intended/committed diff 범위 일치.
- [ ] 최신 PR head 리뷰 finding 해소, CI 및 실제 alpha QA는 정확한 상태로 추적.

## Tech Debt Resolved
집계 의미가 화면에서 드러나지 않는 안내 부채만 수정한다. API 전체 집계/전면 리팩토링은 범위 밖.

## Implementation & Validation Evidence
- 종목 배지 아래 기존 `tm-text-caption`으로 `전체·종목별 건수는 불러온 목록 기준이에요`를 표시한다.
- 요약의 기존 caption 안에 `현재 목록 기준`을 별도 줄로 표시한다. 긴 안내를 기존 수치 한 줄에 이어 붙이지 않으며 새 CSS·토큰·dependency를 추가하지 않는다.
- 종목 배지는 선택 종목을 제외한 불러온 비교 목록(`countItems`), 요약은 현재 선택 조건의 누적 목록(`visibleItems`)을 각각 사용한다. 계산·필터·페이지네이션은 그대로 유지한다.
- 실제 client/view/API hook을 유지하고 Next 탐색과 HTTP 전송 경계만 합성화한 회귀 4개: 최초 20→더 보기 40과 추가 더 보기 유지, 종목 선택 후 배지 20·요약 12, 검색 0건, 최초 로딩. 제보처럼 40건 이후에도 다음 페이지가 있는 60건 합성 fixture를 사용한다.
- RED: root가 단일 worker로 실행해 4/4가 안내 문구 부재로 실패한 것을 확인했다. 실제 카드·건수·종목 탐색·빈 상태·스켈레톤 선행 assertion은 통과했다. root ignored 증거: `tmp/qa/mdqa-assigned-monitor/2026-10-06-heartbeat-1124/report-30-red.txt`.
- GREEN: root 단일 worker·직렬 실행, count-scope/page/pagination-history/empty-state 4개 파일 166/166 PASS. `report-30-green.txt`에 실제 결과를 보존했다.
- TypeScript: `pnpm --filter v1_web lint`의 `tsc --noEmit` 단계 PASS. 뒤따른 기존 패턴 검사는 Windows 기본 셸의 Unix `find` 해석 때문에 실행 실패했으며 `report-30-lint.txt`를 실패 이력으로 보존했다. 프로세스 한정 `ComSpec=C:/Program Files/Git/bin/bash.exe`에서 수정하지 않은 `node scripts/v1-pattern-check.mjs`를 재실행해 전체 패턴 PASS (`report-30-pattern-gitbash.txt`). 검사 약화·툴 설치·소스 변경 없음.
- 독립 frontend-review: 의도한 4/4 파일 검수, Critical=0 / Warning=0 PASS. `report-30-independent-review.md`에 production/test/Changeset blob hash와 한계를 보존했다. builder/reviewer는 stage/commit/push를 실행하지 않았다.
- 게시 직전 fetch에서 HEAD와 origin/dev `7a8bb9b0ed5d8416492fce1963eefaddb2176bed` drift 0/0. 본인 4개 파일만 explicit pathspec으로 commit하고 committed diff를 검수한다. alpha 화면·console/network 및 390/768/1440 결과는 dev 머지·배포 후 pending이다.

## Security Notes
새 입력·권한·API/인증·개인정보·외부 전송 경로 없음. 첨부는 기존 QA 범위 확인에만 사용.

## Risks & Dependencies
alpha 실측은 dev 머지·배포 후 수행. root는 자동 머지나 main 승격을 실행하지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-06 | report/root | 수치 오류 또는 로딩 범위 혼동인가? | 실제 20→40은 일치. #1414 현재 집계 계약을 유지하고 범위를 명시한다. |
| 2026-10-06 | root | UI 옵션 선택 재요청? | 최신 사용자의 즉시 선점·최소 수정·PR 루프 권한에 따른 기존 스타일의 설명 보완. 신규 화면·디자인 방향 변경 없음. |

## Progress Snapshot
- Phase A / 실제 렌더 회귀 4개 작성 및 root RED 확인 완료.
- Phase B / 최소 안내 2줄·Changeset 구현, root RED 4/4 → GREEN 166/166, 타입·수정하지 않은 패턴 검사 PASS 완료.
- Phase C / 독립 4/4 코드 리뷰 Critical=0 / Warning=0 PASS. root committed-tree 검수·feature push·base dev PR·tracker 댓글 pending.
- Phase D / 실제 alpha 390/768/1440, 최초 20→더 보기 40, 종목 선택·0건·로딩과 console/network는 머지·배포 후 pending. 외부 제보 첨부와 코드 검증을 새 alpha PASS로 표현하지 않는다.
- Base: origin/dev `7a8bb9b0ed5d8416492fce1963eefaddb2176bed`; worktree `C:/Users/kinso/.codex/worktrees/mdqa-30-team-match-count/matchup-sports-platform`; branch `fix/mdqa-30-team-match-count-scope`.
- 증거: root ignored `tmp/qa/mdqa-assigned-monitor/2026-10-06-heartbeat-1124/report-30-claimed.{txt,png}`, `report-30-red.txt`. 변경은 위 Owned 4개 파일에 한정한다.
- 재현 20→40은 외부 보고의 실제 alpha 증거이며 이번 root fresh QA로 계산하지 않는다.
