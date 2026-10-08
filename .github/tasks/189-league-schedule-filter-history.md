# Task 189: 리그 경기 일정 필터의 URL/history 복원

Status: In Progress (MD-QA #59 scoped fixture-link follow-up)
**Owner**: issue #1533 수정 세션
**Created**: 2026-10-02

## Context
Refs #1533. 실제 alpha에서 완료 리그 `c1f2ff15-9363-4915-9c11-8179e57369cb`의 ‘예정만’ 선택 → 시즌 결산 → 브라우저 Back 후 전체로 초기화됨을 CSS 402/787/1180에서 관측했다. 원본 [6장 및 proof](https://github.com/kim-song-jun/matchup-sports-platform/tree/bf82d30f6d26c0491ffaa9002b6d3e551ddbfdef/docs/qa/2026-10-02-league-filter-reset)는 수정 전의 이동 전/복귀 후 증거이며 수정 after가 아니다.

## Goal
일정 필터를 현재 리그 URL에 보존하여 새 마운트·Back/Forward·시즌 결산의 페이지 돌아가기 후 동일 선택과 목록을 복원한다.

## Original Conditions (must all be satisfied)
- [ ] ‘예정만’ 선택 → 시즌 결산 → Back에서 종료 경기 제외/선택 유지.
- [ ] 페이지 자체 돌아가기 링크에서도 필터와 상위 출처 유지.
- [ ] ‘전체’·직접 진입·query 없는 기본 동작, 다른 query/hash, 주변 목록/결과/순위 계약 유지.
- [ ] 빠른 반복 선택으로 stale query overwrite나 history 항목 증가 없음.
- [ ] 독립 최신 dev 브랜치, 실제 회귀 RED/GREEN, lint/type/aggregate, Ready/dev PR와 exact-head CI.
- [ ] 실제 alpha 배포/원 이슈 전체 수용 조건 재검증 전 이슈 OPEN 유지.

## User Scenarios
1. 완료 리그에서 예정만 선택하면 현재 URL과 선택/빈 목록이 함께 변경된다. 시즌 결산 방문 후 브라우저 Back이나 페이지 ‘리그 상세로’는 그 URL로 복귀한다.
2. 직접 진입/query 없는 URL은 전체, `schedule=upcoming` 딥링크는 예정만이다. 새로고침/재마운트가 같은 URL 상태를 재사용한다.
3. 전체·예정만을 연속 선택해도 마지막 선택만 남고, 다른 출처/filter/hash와 현재 스크롤을 보존한다.

## Test Scenarios
### Happy path
- [x] 실제 LeagueMatchStandingsClient·LeagueAwardsPageClient + jsdom history에서 클릭·unmount·Back/Forward·페이지 링크 복귀.
- [x] URL 유무별 초기 상태와 실제 표시 목록, 전체 보기 CTA.
### Edge cases
- [x] 빠른 반복 선택·다른 query/hash·history 길이, 기존 종료 경기/순위 유지.
- [x] 마운트 유지 Back/Forward 및 delayed router snapshot이 로컬 선택을 덮지 않음.
### Error paths
- [x] invalid URL 필터는 전체 기본, API 오류/로딩은 정상 빈 결과로 숨기지 않음.
### Mock data updates needed
- 실제 API 경계에 인메모리 합성 league/standings/records를 공급한다. 실제 필터/helper/페이지/링크/History는 대체하지 않는다. API/DTO/schema/MSW/저장 fixture 변경 없음.

## Parallel Work Breakdown
- Frontend owned: `apps/v1_web/src/app/league-matches/[leagueId]/league-match-standings-client.tsx`, `awards/league-awards-page-client.tsx`, 전용 `league-schedule-filter-history.test.tsx`, 이 task, `.changeset/league-schedule-filter-history.md`.
- Backend/Infra: 변경 없음. QA 세션의 고정 실제 alpha 증거를 재사용하며 after는 승인된 배포 후 대기.
- Sequential: RED → 최소 URL/history 로직 → 관련 회귀/lint/aggregate → pathspec 커밋·Ready/dev PR·정확한 head CI.
- Forbidden: 다른 worktree/미병합 PR, shared helpers/route shell/API/DTO/schema, 실제 팀/권한/명단/완료 리그 결과/QA179 변경, merge/deploy/main/유료 리뷰 재요청.

## Acceptance Criteria
- [x] 코드·초점 테스트 Original Conditions 충족, SSR 첫 HTML/기존 일정 판정 회귀 통과.
- [x] 한정 diff/type/lint/aggregate/Changeset policy/committed-tree 검사 통과.
- [ ] 독립 리뷰와 exact-head CI 결과는 PR 기록에서 구분.
- [ ] 원본 실제 alpha before 공개 URL, UTC/CSS 폭·직접 관측 한계와 수정 after 미검증 분리.
- [ ] 승인된 alpha 배포 후 모바일→태블릿→데스크톱 실제 흐름/console/network와 원 이슈 전체 조건 통과 후에만 종료 판단.

## Tech Debt Resolved
- 로컬 useState만 사용해 route unmount 시 일정 필터가 유실되는 상태 공백.

## Security Notes
- UI query는 알려진 `schedule=upcoming`만 인정한다. API·권한·fixture 상태·점수/결과/저장 계약을 바꾸지 않는다.
- 원래 from sanitize/chain과 동종 경로 목적지를 유지한다. URL 갱신은 현재 origin/path에서 해당 필터 key만 수정한다.
- 환경/인증 파일·토큰 읽기/출력, 실제 계정/DB/팀/리그 서버 쓰기 없음.

## Risks & Dependencies
- alpha-only 화면 정책과 merge/deploy 금지로 수정 후 화면은 별도 승인된 배포까지 확보할 수 없다. 초점 테스트는 전체 브라우저 QA가 아니다.
- 원본 세 폭은 실제 기기 아닌 Chromium CSS viewport이며 정확한 serving SHA는 미관측이다. 모바일 일부 버튼은 캡처 프레임 밖이고 선택은 proof의 aria 관측으로 입증한다.
- [Next 공식 Native History API 계약](https://nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api) 및 설치된 App Router patch를 확인했다. 내부 `__NA` state를 직접 전달하면 동기화가 생략되므로 기존 저장소 패턴대로 null을 전달하여 Next가 내부 state를 복사하게 한다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-02 | 수정 세션 | history 항목을 추가할 것인가? | 필터 선택은 replace로 현재 항목에 저장한다. 링크 이동과 Back/Forward의 원래 탐색 단계를 유지한다. |
| 2026-10-02 | 수정 세션 | 디자인 선택 필요 여부 | CLAUDE.md는 로직 전용 변경을 A/B/C 대상에서 제외한다. 기존 컨트롤·카피·레이아웃은 그대로 사용한다. |

## Progress Snapshot
- Base fresh origin/dev `9a35d05abd32afd16c1becc1e00a5fd4ced2fc99`; worktree `/tmp/teameet-issue-1533-20261002`; branch `fix/issue-1533-league-schedule-filter-history`.
- 중복 열린 PR 없음. current v1 원인: `showUpcomingOnly` 초기값 false, URL persistence/복원 없음. 시즌 결산 링크/부모 복귀는 기존 useCurrentHref/withFromPath 계약을 사용한다.
- 추가 원인: awards의 withFromPath는 query까지 같아야 source를 접으므로 schedule query를 보존해도 페이지 ‘리그 상세로’는 이를 from 안으로 다시 감싼다. 같은 league pathname의 검증된 source는 전체 query/hash와 함께 복귀해야 한다.
- 실제 컴포넌트 RED: 초기 15개 중 9 FAIL/6 PASS, 2.68s. 수정 후 초기 새 회귀+기존 standings/awards/fixture-meta 4 suite 91 PASS, 8.52s; 실제 page→React Query 첫 HTML 1 PASS, 1.59s. 전체 선택 Back 회귀 추가 후 새 파일 최종 16 PASS, 2.45s. 고유 총 5 suite 93 PASS(16 신규 + 77 기존), 단일 worker 직렬 실행.
- `pnpm --filter v1_web lint`(tsc+pattern) PASS; DB guardrails/production security/compose parity/alpha seed/Android Play/immutable deploy 6 aggregate PASS; Changeset patch policy/diff check/새 tech-debt marker 없음.
- alpha 원본 6장 bytes/SHA256/Git blob 6/6 검증 및 픽셀 확인. CSS 402×606 / 787×505 / 1180×757; UTC 08:33:32–08:37:07. 두 열 모두 수정 전(이동 전 vs browser Back 후)이며 수정 after가 아니다.
- Host preflight load 23.31/19.40/17.08, swap 7770.81/8192MiB; Node/Chrome/Docker 프로세스 확인. 승인된 작업 범위의 최소 단일-worker 검사만 실행. alpha read-only HEAD 200(09:31:07 UTC). DB/실제 로그인/서버 쓰기 및 로컬 web 서버 실행 없음.
- URL `schedule=upcoming`만 읽고 local draft+native replaceState(null)로 선택 저장; 늦은 Next snapshot은 최신 브라우저 query와 맞을 때만 복원. 같은 league source의 awards 복귀 query/hash 유지. 전체 선택·다른 query·hash·history 길이·API 에러/loading·스코어·SSR 회귀 통과.
- 명시 pathspec 커밋·Ready/dev PR와 정확한 head CI/독립 리뷰 기록은 후속 PR에 남긴다. 실제 alpha after와 원 이슈 전체 수용 조건은 별도 승인된 배포까지 PENDING; #1533 OPEN/Refs 유지.

### 2026-10-08 MD-QA #59 scoped continuation
- Original https://teameet.jmandu.kr/issues/59/: regular league ad100000-0000-4000-8000-000000000001 upcoming-only2 fixtures (`schedule=upcoming`) → fixture ad400000-0000-4000-8000-000000000005 top page-back → same league defaults all9/no schedule. Freshly repeated after full league reload, alpha E2E admin CSS1180×757/21:53–21:55, actual serving SHA unexposed. Browser native Back/mobile/scroll defect not claimed; no data changes. Root read full detail/comments0, unfiltered active19/intake2 complete one page. Current open dev PRs1682/1683 (other reports) and1684 infra; no matching task/branch/active owner. Prior task189/PR1536 is actually MERGED2026-10-03 and its original awards/history evidence stays historical; this missing fixture-link context is a separate uncovered consumer. Existing #17 bracket route also differs.
- Root UI claim saved22:10KST: actual 김성준/확인 중. Own0550/report59-initial-detail.txt and report59-claimed-confirmed.txt/png. No Done/attachment deletion/assignee release/hold/Slack.
- Fresh fetch immediately before managed origin/dev creation; absolute workdir C:/Users/kinso/.codex/worktrees/mdqa-59-league-fixture-return/matchup-sports-platform, branch fix/mdqa-59-league-fixture-return, base bfecbd122af2bde295ab054fc3d77136d0d19ddc. Dependency junctions reuse installed existing packages; no install. Canonical existing task189 is extended instead of duplicating a task ticket.
- Phase B Owned frontend owner: league-match-standings-client.tsx, fixtures/[fixtureId]/league-fixture-detail-client.tsx, existing relevant league return/fixture specs or one scoped fixture-return actual consumer regression. Smallest validated from/back context propagation across actual fixture entry links, current source filter/query/hash/upstream chain and safe same-league destination; do not change list/API/fixture payload/result/permission contracts.
- Forbidden shared hooks/types/MSW/shell/route helpers/API/DTO/schema, awards source unless first authorized, other task/state/automation/.env, browser/Git mutations/self-commit/dependency installs. Not alone; preserve all other edits. Root owns task/Changeset/integration/Git/PR/comments; tests SERIAL NO EXEC until explicit root GO (current root committed58/56/57 checks).
- Acceptance: actual unchanged consumer/link/page-back RED → minimal GREEN; upcoming2/all9/queryless/deep-link/upstream query/hash/invalid cross-route source/back actions preserved; existing awards/history/SSR/fixture/profile regressions narrow. Root committed narrow/types/pattern/full independent review, Korean base-dev PR attach and same original report saved comment; alpha AFTER separately after exact SHA deployment. Current investigation/validation/PR/comment pending.
- Root 22:36 fresh-fetch drift observed external PR1684 infra revert then PR1683 actual dev merge8231bebeae5dc7fb77cd159b5c699a4918dc6cef plus release1.3.5. Dedicated #59 branch fast-forwarded to latest origin/dev before own commit; own4 source/test WIP did not overlap incoming paths and stayed preserved. Original task189/PR1536 remains merged history; this #59 branch is fresh and separate.
- Product unchanged RED: first actual consumer run valid5 failures / baseline5 pass plus one claim eligibility/notifications harness omission (excluded from product failures). Harness corrected without product edits, claim-only real RED1 verified. After minimal two-client fix, fixture-return11 + original history16 + standings61 + fixture detail32 + profile30 + SSR2 =152/152, six specs,26.31s,exit0. Raw tmp/qa/mdqa-59/fixture-return-red.txt, fixture-return-claim-red.txt, fixture-return-green.txt and fixture-return-commands.txt preserve both runs and harness distinction.
- Fixture list and record-claim entry links now carry current local-draft source URL; immediate toggle/stale Next query, query/hash/upstream chain retained. Fixture detail top AppBackLink consumes source; same-league body back/standings links fold safe full source query/hash instead of wrapping it. No shared hooks/types/API/permission/result/payload/helper/shell changes. Root committed-tree/types/pattern and full independent exact-head review/PR/comment remain pending. Alpha AFTER remains PENDING; jsdom API/history does not prove actual viewport pixels/scroll.
- Root committed29bbe32b20d82a92536c5b8b8222520c76735a86 vs dev8231bebe: all152/152 six related specs PASS, Web TypeScript noEmit and primary v1 pattern PASS, own0550/report59-followup-committed-result.json/tests/pattern. No dirty-tree-only readiness claim; tracked6 paths, explicit commit scope/diffcheck/debt reviewed. Actual GREEN original product source and committed baseline both logged. Alpha AFTER/served SHA/viewport verdict pending.
- Publication fresh latest devb84a2288cab0449c173fee9ef29fe2d740f86d4e includes already reviewed home58 merge only; own5 non-task blobs and relevant league/API/shared configs unchanged by safe integration. Task-only checkpoint records existing152/types/pattern; final exact-head six-path independent review and base-dev Ready PR publish/attach/originalcomment follow. Actual tracker claim Kim/확인 중 retained, report Done/attachment deletion/auto merge forbidden.
