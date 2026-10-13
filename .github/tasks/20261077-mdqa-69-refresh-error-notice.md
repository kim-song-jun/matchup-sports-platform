# Task 20261077: MD-QA #69 팀 상세 재조회 실패 안내

Status: In Progress
**Owner**: root → frontend-ui-dev
**Created**: 2026-10-13

## Context
[기존 리포트 #69](https://teameet.jmandu.kr/issues/69/)의 탭 복귀 갱신은 PR1758로 dev 머지됐다. 현재 리포트는 타 실행의 실제 두 탭 alpha 검증으로 완료 표시되며 첨부는 이미 삭제됐다. 이번 독립 소스 리뷰에서 성공 캐시가 있는 재조회 실패를 `query.isError && !query.data`가 숨기는 후속 결함을 확인했다. 원 증상 수정과 실제 alpha 성공 이력을 보존하고 이 실패 경로만 고친다.

## Goal
팀 상세 재조회 실패 때 기존 내용과 실패 안내를 함께 표시하고 실제 GET 재시도로 회복한다.

## Original Conditions (must all be satisfied)
- [ ] 성공 캐시는 유지하며 실패를 최신 정보처럼 표시하지 않는다.
- [ ] 실제 API 오류를 기존 공유 오류 컴포넌트로 안내한다.
- [ ] 명시적 재시도는 실제 팀 GET을 실행하고 성공하면 최신 내용으로 교체한다.
- [ ] 편집 화면의 미저장 초안·버전과 기본 포커스 정책은 유지한다.

## User Scenarios
1. 팀 상세 GET 성공 후 다른 탭에서 소개가 바뀌고 복귀 GET이 503으로 실패한다.
2. 기존 소개와 최신 정보를 불러오지 못했다는 안내를 읽는다.
3. 다시 시도를 누르면 실제 GET 성공 뒤 새로운 소개가 보이고 안내가 사라진다.

## Test Scenarios
### Happy path
- [ ] 기존 fresh/stale/visibility/focus 실제 소비자 회귀 검증을 유지한다.
### Edge cases
- [ ] 진행 중 재조회에 중복 재시도 GET을 만들지 않는다.
### Error paths
- [ ] HTTP 실패 처리가 끝난 뒤 캐시 유지 + 오류 안내를 확인하는 RED → GREEN 검증.
- [ ] 재시도 HTTP 성공 뒤 신규 내용 표시 + 오류 안내 제거 검증.
### Mock data updates needed
- MSW 공유 계약 변경 없이 테스트 내부 HTTP 경계 응답을 사용한다.

## Parallel Work Breakdown
- Frontend worker Phase RED: 실제 소비자 회귀 테스트를 먼저 추가하고 root 검증을 기다린다.
- Frontend worker Phase GREEN: 최소 오류 안내·재시도 수정, 자체 task/Changeset 업데이트.
- Owned: `apps/v1_web/src/components/teams/teams-client.tsx`, `teams-client.focus-refresh.test.tsx`, 이 문서, 전용 Changeset.
- Forbidden: 공유 hooks/types/MSW, API/DTO/schema, 다른 화면, 정책, state.json, .env, 다른 작업자 변경, Git commit/push/merge.
- Root sequential: preflight → 좁은 RED/GREEN → 독립 리뷰 → 명시 pathspec 커밋 → 최신 dev drift 검증 → dev PR → 기존 리포트 댓글.
- [ ] dev 머지·alpha 실패/회복 경로 실측은 코드 검증과 분리한다.

## Acceptance Criteria
- [x] A·B·C 오류 UI 비교 제시 → 사용자 직접 선택 확인; RED 확인 전 운영 JSX는 그대로 유지한다.
- [ ] 원 조건과 오류/회복 회귀 테스트 통과.
- [ ] Critical=0 / Warning=0 독립 리뷰.
- [ ] committed-tree 기준 diff/check/import/debt marker 검증.
- [ ] dev PR 및 같은 리포트의 정확한 상태 댓글 저장 확인.
- [ ] alpha 실제 persona·viewport·serving SHA·console/network 근거 또는 구체적 blocker 기록.

## Tech Debt Resolved
- 요청 횟수만으로 실패를 검증하던 테스트를 실제 실패 완료/안내/회복 계약으로 보완한다.

## Security Notes
- 인증/권한 API 실패를 성공으로 바꾸지 않는다. 실제 오류 코드를 유지하고 기존 공유 컴포넌트를 사용한다.

## Risks & Dependencies
- 실제 alpha 로그인은 별도 확인이 필요하다. 단위 테스트/리뷰/CI/머지는 alpha PASS가 아니다.
- 원 PR1758은 이미 머지됐으므로 그 feature branch에는 push하지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-13 | independent review | 캐시 보존 시 재조회 실패 안내 누락 | 기존 오류 컴포넌트로 최소 수정, 원 완료 상태/첨부 삭제를 다시 조작하지 않음 |

## Progress Snapshot
- Latest root checkpoint 2026-10-13: same OPEN dev PR1886 review findings at head6526521b53b54ed3f988f531049afc636ceef47a are being repaired. Latest upstream29fd7fef7ca0f233838be08668f9e4ecbcada071 safely merged, preserving unrelated native startup changes and all owned UI WIP. Historical snapshots below remain evidence.
- Actual Codex P2 r4254499224: retry unmount loses keyboard focus/progress. The opt-in shared ErrorState keeps the same button, uses aria-disabled plus guarded click while pending, and shows 조회 중.... Existing default error/back/retry behavior is preserved.
- Actual Codex P2 r4254499230: full empty-state padding outside constrained layout. Only cached errors use compact token-based cards inside active desktop main/mobile article or dissolved-team wrapper. First-load and access failures keep the full error contract.
- RED: actual pending keyboard retry and active layout/primitive cases4FAIL/1PASS, separate dissolved cached503 case1FAIL. GREEN: existing teams-client98 + actual focus/error consumer13 + shared primitive5 =116/116 PASS. Evidence mdqa69-review-red.log, mdqa69-dissolved-review-red.log, mdqa69-review-green.log in root ignored run directory.
- Web CI failure at6526521 was one outdated test expecting the list error title; the expectation now asserts the actual team-detail title. No production fallback or validation gate changed. Latest scope lint and committed-head independent review are root next gates; alpha failure/recovery/auth/persona/viewport remains NOTRUN while login is pending.
- Base: `552f5b6fb98d8546daf5e26f7de7a8ac413251f2` (`origin/dev` 직전 fetch).
- Worktree: `C:/Users/kinso/.codex/worktrees/mdqa-69-team-detail-refresh/matchup-sports-platform` (기존 적합한 checkout 재사용).
- Branch: `fix/mdqa-69-refresh-error-notice`.
- Original PR1758 head `05f58ee2db3a96ffdcc4f925ce2d38c4d0da5560`, merge `8cbab01073e862b00adf6e08ef2befaf727623a5`.
- Current phase: GREEN implementation prepared in owned `teams-client.tsx` and dedicated Changeset; root serial GREEN pending. Independent review/review fixes/commit/PR/alpha remain pending.
- UI choice: A 기존 ErrorState와 캐시 유지 / B 전체 오류 화면 / C AlertBanner와 재시도. 2026-10-13 사용자가 직접 **"A·추천: 기존 내용 + 공유 오류·재시도 카드"**를 선택했고 root가 전달했다. 인증/권한/삭제(401/403/404) 오류는 캐시와 운영 액션을 숨기는 필수 가드를 적용한다. 운영 JSX 구현은 root의 실제 계약 RED 결과 뒤에 시작한다.
- RED execution blockers (root 확인): 최초 `pnpm ... test ... --maxWorkers=1`는 runner 옵션 전달 오류(`Unknown option: maxWorkers`), `pnpm --filter v1_web exec vitest ...`는 이 checkout에 `node_modules`가 없어 runner 탐색 실패했다. 둘 다 계약 RED/PASS가 아니다. Root가 기존 matching dependencies 연결을 확인 중이며 운영 코드는 그대로다.
- Root scoped frozen-lock install 뒤 실제 RED: 9 tests 중 4 PASS / 5 FAIL. 503 캐시 재조회 및 첫 로드 테스트는 실제 오류 안내 누락으로 실패했다. 401/403/404는 Given 링크의 accessible name에 설명 카피가 붙어 exact match가 실패한 테스트 준비 오류였다. 실제 사용자 링크 이름의 시작(`/^팀 정보 수정/`)을 기준으로 수정했고 root가 해당 3건을 좁게 재실행한 뒤 GREEN을 시작한다. 운영 코드는 아직 그대로다.
- Corrected contract RED (root): 401/403/404 3건 모두 실제 GET 오류 완료(`status=error`, `fetchStatus=idle`) 뒤 오류 안내 누락으로 FAIL. 보관 팀 403 단건도 실제 GET 완료 뒤 안내 누락으로 FAIL(1 failed / 9 skipped). 테스트 준비 실패와 분리해 유효 RED를 확정한 뒤 root가 GREEN을 승인했다.
- Implementation: 공유 `ErrorState`와 실제 API 메시지 사용; 첫 로드도 목록용 오류 뷰 대신 팀 상세 오류를 표시. 일시적 실패는 캐시 유지, 401/403/404는 캐시·해체 복구 입구·운영 관련 조회/채팅 자동 연결을 차단. `refetch({ cancelRefetch: false })`와 요청 중 재시도 입구 숨김으로 중복 GET을 방지한다. 공유 hooks/types/MSW 및 편집 캐시 정책은 변경하지 않았다.

### Root GREEN / precommit receipt — 2026-10-13
- Actual consumer/QueryClient/MSW narrow regression10/10 PASS after valid RED. Evidence original checkout tmp/qa/mdqa-assigned-monitor/2026-10-13-heartbeat-0244/mdqa69-green.log.
- Scoped v1_web tsc --noEmit PASS in lint; pattern phase initially failed because Windows find.exe received GNU find arguments (not a source failure). Root reran ONLY pattern phase with Git GNU find on child PATH; PASS all existing pattern gates. No source/policy bypass.
- Independent frontend review of source diff: Critical0/Warning0, caching/retry/access boundaries and actual tests examined. Committed exact head review follows root commit and latest-dev safe integration.
- Latest upstream d1086112 includes unrelated league shared hook/types changes. Root merges after scoped commit, repeats only affected consumer regression; actual alpha failure/refresh/permission UI remains PENDING. Original completed report/attachment state unchanged.
