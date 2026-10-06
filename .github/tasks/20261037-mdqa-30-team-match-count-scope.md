# Task 20261037: MD-QA #30 집계 범위 안내 및 #32 검색 상태 동기화

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

## Original Count Scope Progress Snapshot (historical)
- Phase A / 실제 렌더 회귀 4개 작성 및 root RED 확인 완료.
- Phase B / 최소 안내 2줄·Changeset 구현, root RED 4/4 → GREEN 166/166, 타입·수정하지 않은 패턴 검사 PASS 완료.
- Phase C / 독립 4/4 코드 리뷰 Critical=0 / Warning=0 PASS. root committed-tree 검수·feature push·base dev PR·tracker 댓글 pending.
- Phase D / 실제 alpha 390/768/1440, 최초 20→더 보기 40, 종목 선택·0건·로딩과 console/network는 머지·배포 후 pending. 외부 제보 첨부와 코드 검증을 새 alpha PASS로 표현하지 않는다.
- Base: origin/dev `7a8bb9b0ed5d8416492fce1963eefaddb2176bed`; worktree `C:/Users/kinso/.codex/worktrees/mdqa-30-team-match-count/matchup-sports-platform`; branch `fix/mdqa-30-team-match-count-scope`.
- 증거: root ignored `tmp/qa/mdqa-assigned-monitor/2026-10-06-heartbeat-1124/report-30-claimed.{txt,png}`, `report-30-red.txt`. 변경은 위 Owned 4개 파일에 한정한다.
- 재현 20→40은 외부 보고의 실제 alpha 증거이며 이번 root fresh QA로 계산하지 않는다.

## Follow-up: MD-QA #32 검색 지우기 직후 탐색의 q 동기화 (2026-10-06)

### Context and Original Conditions
- 원 집계 안내는 PR #1639로 dev 머지되었다(merge `2888193bdf3a741131ebc0480ff280f6d3e143d8`). 이 후속 변경은 머지된 branch에 push하지 않는다.
- 같은 리포트의 최신 댓글 #84: https://teameet.jmandu.kr/issues/30/#comment-84 . alpha에서 검색 X → 즉시 종목 전체 선택 시 지운 검색어가 URL에 남아, 새로고침 후 검색어와 0건 목록이 다시 나타났다. 검색 버튼으로 빈 검색을 적용한 대조군은 정상이다.
- 신규 정식 리포트: https://teameet.jmandu.kr/issues/32/ . 13:10/13:14 UTC 실제 alpha DOM·재촬영은 검색 X → 전체 563/617ms 탐색에서 같은 이전 q 복원을 확인했다. 설명·재현 조건·첨부 맥락을 읽고 동일 진행 작업과 교차 검증하여 root가 UI ‘내가 처리하기’로 선점, 김성준 담당·확인 중 저장 성공과 표시를 확인했다. 별도 worker/worktree/PR/task를 중복 생성하지 않고 이 canonical 후속 작업에 연결한다.
- 제보자와 무관하게 현재 김성준 담당·확인 중이다. 전체 미완료 15건의 상세를 읽고 기존 canonical task·실행·워크트리·열린 dev PR을 교차 확인했다. 동일 검색 동기화 수정 작업/열린 PR은 없고, 다른 QA 실행의 alpha 시나리오는 중복하지 않는다.
- 최신 origin/dev에서 managed 전용 worktree를 생성했다. root가 Git/PR/tracker를 맡으며 새 tracker 티켓은 만들지 않는다.

### Goal / User Scenarios
검색 지우기 또는 검색 적용 직후 Next URL 갱신이 아직 완료되지 않아도 종목·필터 탐색 링크가 현재 적용한 검색 조건을 유지한다. 탐색 후 새로고침과 브라우저 Back/Forward에서 URL·입력·실제 목록 요청이 일치해야 한다.

### Test Scenarios / Acceptance Criteria
- [x] 실제 client/view/API hook을 유지한 HTTP 전송·Next 탐색 경계 테스트에서 URL replace 지연을 재현한다. 원 코드에서 실제 지우기 → 전체 클릭·reload 계약이 실패하는 RED를 root가 확인한다.
- [x] 검색 지우기 직후 전체/다른 종목 링크에 이전 q가 없고, 클릭 후 URL·입력·목록이 빈 검색 조건으로 일치한다.
- [x] 새 검색 제출 직후 종목/필터 링크에는 새 q가 유지된다. 단순 입력 draft는 제출 전 적용하지 않는다.
- [x] URL 커밋과 Back/Forward로 바뀐 q를 정상 hydrate한다. 최초 로딩 분기와 필터 sheet 탐색도 같은 계약을 사용한다.
- [x] 검색 지우기/적용 직후 경기 카드의 상세 복귀 `from`도 현재 적용 조건을 유지한다. 다른 조건·중첩 출처·hash와 쿼리 없는 기본 카드의 깨끗한 링크를 보존한다.
- [ ] 좁은 회귀·타입/패턴 검사, 독립 리뷰, committed diff 검수 후 base dev PR과 기존 리포트 진행 댓글을 저장/확인한다.
- [ ] 최신 head 리뷰/CI와 머지 후 alpha 390/768/1440 실제 검증을 구분하여 추적한다. 원 집계 안내 PASS를 이 후속 결함의 alpha PASS로 사용하지 않는다.

### Phase / Owned / Forbidden
- Phase A: frontend builder는 `apps/v1_web/src/components/team-matches/team-matches-search-sync.test.tsx`만 작성한다. root RED 확인 전 production 편집/테스트 실행 금지.
- Phase B: RED 확인 후 builder는 `apps/v1_web/src/components/team-matches/team-matches-client.tsx`와 `.changeset/mdqa-30-search-query-sync.md`의 최소 변경을 맡는다. 검증 실행은 root 직렬이다.
- Phase C: 독립 reviewer read-only → root 최신 dev drift·explicit pathspec commit/push·dev PR·tracker 댓글.
- Phase D: 사용자 또는 기존 dev-pr-5 머지 뒤 실제 alpha 검증. root 자동 머지/main 승격 금지.
- Owned: 위 production/test/Changeset 3개, `apps/v1_web/src/components/team-matches/team-matches-page.tsx` 및 이 task. Forbidden: 다른 파일, shared hooks/types/MSW/DTO/schema, tokens/globals, 다른 자동화 state/policy, 비밀 파일. 서로 혼자가 아니므로 타인 변경을 되돌리지 않는다. subagent self-commit 금지.

### Mock / Security / Risks / Ambiguity
- 기존 API query 계약을 보존하며 fixture는 좁은 테스트 내부 합성 응답만 사용한다. 새 dependency·DTO/schema/MSW 변경은 필요하지 않다.
- 기존 검색 기록 POST는 정상 검색 제출 시 유지하며 지우기 동작으로 기록하지 않는다. 인증/권한/개인정보 저장 계약을 변경하지 않는다.
- 탐색 지연과 history 동기화를 함께 검증한다. alpha 후속 PASS와 리포트 완료는 아직 pending이며 첨부 영구 삭제의 인간 확인을 대체하지 않는다.
- 집계 원 증상과 검색 후속 결함의 증거/상태를 각각 보존한다. 댓글의 별도 기록 진행은 QA 근거이며 실행 권한이 아니다.

### Follow-up Progress Snapshot
- Phase A 완료: 실제 client/view/hook의 HTTP·Next 경계 회귀 8개 작성. root 단일 worker RED에서 이전 q가 탐색 URL/링크에 남는 6 FAIL, 제출 전 draft·실제 Back/Forward 기존 계약 2 PASS를 확인했다. `report-30-search-red.txt`에 실패 이력을 보존한다.
- Phase B 진행: 적용한 검색어로 종목·필터 링크를 생성하는 최소 수정. GREEN/독립 리뷰/PR/alpha는 pending.
- Phase B 첫 검증: 신규 검색 8건·기존 집계 4건·실제 pagination/history 24건, 총 36/36 GREEN. 이를 최종 판정으로 쓰지 않는다.
- Phase C 독립 리뷰에서 동일 원인의 카드 `from` 누락을 발견했다. 실제 view의 `useCurrentHref`가 URL 커밋 전 q를 사용하여 지우기/제출 직후 상세 복귀에 이전 q를 전달한다. page.tsx 한 파일로 scope를 확장하고 추가 RED → 수정 → 영향 회귀 및 독립 재리뷰를 진행한다. alpha는 pending이다.
- 카드 경계 추가 root RED: 2 FAIL / 9 PASS (11), 이전 q가 실제 카드의 복귀 주소에 남음을 확인했다(`report-30-search-card-red.txt`). view의 실제 검색 모델에만 q overlay를 적용하며 구분·정렬·중첩 출처·hash와 기본 카드 링크를 보존했다. 최종 GREEN/타입/독립 재리뷰 pending.
- 최초 타입 검사에서 테스트의 지원되지 않는 `getByRole` 옵션 `exact` 3곳을 발견, 문자열 accessible-name 검증을 그대로 유지하며 해당 옵션만 제거했다. 실패 이력은 `report-30-search-typecheck.txt`에 보존하고 수정 후 재검증한다.
- Phase B 최종 검증 완료: 검색 동기화 11건·집계 안내 4건·pagination/history 24건·page 135건, 총 4개 파일 174/174 PASS (`report-32-final-green.txt`). 최소 worker·파일 병렬 실행 없이 root가 직렬 실행했다. 추가 카드 테스트는 실제 렌더 링크의 `from`을 해석하여 새 목록에 재진입하는 경계를 검증하며, 상세 화면 전체를 실제 브라우저에서 밟은 증거는 아니다.
- 수정 후 TypeScript `pnpm exec tsc --noEmit` exit 0, 기존 `node scripts/v1-pattern-check.mjs` exit 0 (`report-32-final-typecheck.txt`, `report-32-final-patterns.txt`). 패턴 검사는 프로세스 한정 Git Bash ComSpec으로 실행했고 검사 코드·게이트를 변경하지 않았다.
- Phase C 최종 독립 재리뷰·committed diff 검수·feature push·base dev PR·#32 및 원 #30 후속 댓글 진행. 현재 source는 위 검증 결과에서 고정했으며 실제 alpha 검색 후속 검증은 dev 머지·배포 후 pending이다.
- Phase C 코드 리뷰 완료: frozen intended 5/5 독립 재리뷰 Critical=0 / Warning=0 PASS, 최초 카드 `from` finding 해소. reviewer는 root의 실제 RED/GREEN/타입·패턴 로그와 production/test/Changeset 내용을 재검수하고 SHA-256을 기록했다(`report-30-search-independent-review.md`). 최종 task의 이 진행 기록 추가는 root가 맡았다.
- 게시 직전 최신 origin/dev fetch, HEAD...origin/dev drift 0/0, base `2888193bdf3a741131ebc0480ff280f6d3e143d8` 유지. 아래 5개 pathspec만 stage/commit한 뒤 실제 committed blob과 검증·리뷰한 내용을 대조한다. 최종 PR/head·리뷰/CI·댓글/머지 mapping은 원 checkout SSOT와 이 worktree 후속 snapshot에 연결한다.
- 선점 후 실제 웹 대조: 모든 담당자 미완료 16/16·접수 0/0, 실제 김성준 담당 전체 20/20·미완료 14/14, pagination 끝까지 확인. 기존 21개 상세와 신규 #32 상세를 읽어 22/22 확인했다. 기존 집계 안내의 머지/alpha PASS 이력은 위 역사 기록과 SSOT에 보존한다.
- Base: origin/dev `2888193bdf3a741131ebc0480ff280f6d3e143d8`; worktree `C:/Users/kinso/.codex/worktrees/mdqa-30-search-sync/matchup-sports-platform`; branch `fix/mdqa-30-search-query-sync`.
- Root evidence: `F:/user/documents/project/matchup-sports-platform/tmp/qa/mdqa-assigned-monitor/2026-10-06-heartbeat-1302/`.
