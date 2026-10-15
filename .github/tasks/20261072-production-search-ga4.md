# Task 20261072: 운영 검색 노출 및 홈 GA4 계측 정정

Status: Oct 16 local-discovery release deployed and verified; generic-search and AI visibility monitoring continues
**Owner**: Codex main; explicit Luna implementation and Sol independent review
**Created**: 2026-10-12

## Current Cursor — 2026-10-16 00:55 KST

User-authorized existing-page locality guidance and the Alpha CI repair are deployed. Source PR #1934 merged as `434f1a91faac9ad39116df78b4d47d351fe90082`. Scoped main PR #1935 merged as `63d02c11a5a963e30b763682bd86b16a9d59ad42`; production run `38758889378` completed API/Web/Gates, immutable images and Deploy successfully. Actual production headers at 00:45 KST reported that main SHA and runtime **1.9.3**. Fixed package manifests are 1.9.2 under the existing resolver; runtime was measured, not inferred. Main CodeQL `38758889943` passed all three languages.

Luna implemented visible guidance, descriptive existing-route links and teams/type metadata. Independent `gpt-6-sol` review found all-kind copy, unfiltered-link labels and shared-layer/public-API defects; all were corrected and focused re-review passed with zero blockers. Shared public API now lives in `src/shared/ui/local-discovery-guidance/index.tsx`. No new product routes, DB/auth/privacy/key/store changes or hidden keyword text. Focused rendered-copy/metadata tests passed 7/7 across two files. Exact source CI `38749948065` and main-candidate CI `38750035818` passed API/Web/Gates. Source PostgreSQL integration ran 165 suites with 1,203 passing tests and three existing skips; API unit ran 417 suites with 6,208 passing tests. Touched-path debt-marker grep found zero markers.

The demonstrated Alpha problem was a blocked deployment gate: the takeover fixture's expired lease exactly canceled the first retry delay. Timestamp rounding could leave the reclaimed operation briefly ineligible. The fixture now uses millisecond-floor time minus the actual retry delay plus 1ms; production retry/worker logic and meaningful CAS/takeover assertions are unchanged. A newer unrelated dev push superseded the first merged-dev CI by design; it was not rerun. Latest matching dev CI `38752764073` and Alpha deploy `38752764090` succeeded at `1b9619995425a3862ebc9115f29fccc32b25d1ca`, which contains the same owned source paths. Alpha served that SHA and release `1.9.2-alpha.20261015.g1b9619995425`.

Live evidence under `/Users/sungjun/.cache/teameet-seo-release/evidence/`: `local-alpha-final-verdict-20261016.json`, settled `local-alpha-browser-recheck-20261016.json`, and separate valid desktop-footer receipt `local-alpha-desktop-footer-20261016.json`. Four guest first-HTML routes, canonical/links/health and Alpha noindex boundaries passed; Alpha sitemap/llms-full remain actual 404 plus noindex. Twelve 390/768/1440 list views and category/link/filter interactions passed. Mobile/tablet use `main.tm-scroll-area`; desktop uses the document scroller after async heights settle. Initial invalid scroller probes and one transient notifications 503 remain recorded, not counted as clean evidence; direct endpoint recheck and complete settled recheck had no failures. Existing authenticated Alpha role plus guest HTTP were tested, not every role.

Production `local-production-http-20261016.json` verifies four guest HTML routes, visible guidance, canonical/indexability, links and DB health. `local-production-browser-20261016.json` has twelve views without overflow, runtime/console errors or failed resources and three representative actual-footer checks. Actual production before (58a2/runtime1.9.2) and after (63d0/runtime1.9.3) screenshots are retained; the loaded mobile all-list pair was visually compared.

Search evidence is separate from deployment: GSC `/teams` is actually indexed; one updated-content request was acknowledged at `2026-10-15T15:49:58.713Z` (`local-google-updated-teams-request-20261016.json`). This does not prove new copy indexed or ranking. Existing five priority URLs were indexed in the prior release. Naver report data dated Oct 14 showed one indexed page and zero crawl restrictions/exclusions/SEO errors; no post-release Naver gain is claimed. Fresh explicit Luna measurement found no exact Teameet-domain organic result in six inspected Google queries (9/8/9/10/9/9 cards). Three completed **AI Mode** answers for 풋살 대회 / 동네 풋살대회 / 수원 풋살 대회 contained neither Teameet, the expected competition titles nor owned-domain citations (`local-postrelease-ai-mode-20261016.json`). Separate AI Overview observations are not substituted for AI Mode. Signed-in profile, ko/KR, 1440×1000; personalization remains unknown even with pws=0. Generic ranking/AI inclusion remains an observed gap, not a release-success claim.

Known separate limitation: dynamic GitHub AI security scans `38749955069` / `38750043141` failed before analysis because configured `claude-opus-5` is unavailable. They are not counted as security passes; provider/configuration was not changed. CodeQL and independent review passed separately.

Owned Ego TaskSpace 34 was finished with `keep: []`: p1/p2/p3 closed, closedSpace true, zero unmanaged tabs preserved. Luna CLI processes exited; other-session TaskSpace 42 and shared-root bracket WIP were untouched. Daily `teameet-ai-luna` remains ACTIVE at 09:00 KST. Active source implementation is cleared; future runs compare actual search evidence and make only justified existing-page improvements. Release-artifact main→dev synchronization consumes only this release's Changeset, preserves unrelated Changesets and adds this completed task record; it has no runtime-source delta.

Exit proof:
- [x] Region/futsal guidance and real existing-route links appear in initial HTML and visible UI without unsupported filter claims.
- [x] Exact-head API/Web/Gates pass with meaningful deterministic expired-lease coverage.
- [x] Independent Sol review has zero unresolved blockers.
- [x] Latest matching Alpha SHA, twelve viewport cases, links/filtering and actual bottom content verified.
- [x] Alpha noindex and sitemap/AI-publication exclusions preserved.
- [x] Scoped main deployed and actual production SHA/HTML/health/browser behavior verified.
- [x] Search/indexing/AI outcomes recorded separately; monitor cursor updated and owned browser/processes closed.

## Historical Cursor — 2026-10-15 23:16 KST

User explicitly requested immediate existing-page enrichment for 동네 풋살 / 풋살 대회 and AI retrieval, Alpha repair, Alpha verification and scoped main deployment. No new product route, geographic landing page, operating-data mutation, auth/privacy/key/store change or unrelated dev promotion is authorized by this follow-up.

Resume sources: `/Users/sungjun/.cache/teameet-seo-release/STATUS.md`, `MONITOR.md` and evidence directory. Previous main PR #1927 deployed `58a2f6663480cfff97a38b53723bd93ad286f117`, release 1.9.2; five priority Google URLs actually indexed. This proves neither generic ranking nor AI citation. Daily monitor `teameet-ai-luna` is active. Its initial four Google organic queries returned 8–9 inspected results with no Teameet match; two completed AI answers had no Teameet mention/citation. New source work is active, so monitoring must not duplicate the release.

Owned reusable checkout fast-forwarded cleanly from `94f4fc48f` to dev `d77f8e3176ffa03ad39a32f0f6a04c19e7a75bcb`; only pre-existing untracked node_modules symlinks. Shared-root bracket WIP and release-files.txt remain untouched. No branch switch/new worktree.

Bounded design: add compact, visible, server-prerendered locality guidance inside existing team and competition lists, with descriptive links to existing team/daily-match/tournament/league routes. Use actual sport/activity-area/venue/date/eligibility facts, preserve multi-sport support and filter-row geometry. No hidden keyword list, fabricated neighborhood functionality, fake venue address or AI-placement promise.

Parallel ownership:
- Luna web implementation: teams metadata and list-view insertion; tournament type copy and list insertion; reusable local-discovery guidance and narrow rendered contract tests. Root owns this task, Changeset and release.
- Luna deployment-gate repair: only `apps/v1_api/test/games/game-projection.integration-spec.ts` expired-lease setup. Runtime worker/service/schema changes require renewed analysis, not automatic scope expansion.
- Sol independent review: final diff and actual lease/backoff contract; implementation claims are not accepted as proof.

Implementation: compact shared public API `src/shared/ui/local-discovery-guidance/index.tsx` is rendered inside existing team and competition list views; all/tournament/league have distinct factual guidance, generic labels link to unfiltered existing destinations. No new routes/fetches/JSON-LD/data. Root preserved the complete removed old-module cleanup. Sol first review found all-kind guidance, unfiltered labels and shared public API gaps; corrections are under focused re-review. New/updated rendered-copy and metadata tests pass 7/7 across two files. Earlier web typecheck and pattern checks passed; final exact-head CI must compile the moved import paths. Alpha before screenshots captured settled three routes at 390/768/1440; no overflow or alert. Six sampled Alpha/prod HTTP paths and DB health are normal; production SHA unchanged.

Deployment-gate fix: the fixture now floors current time to milliseconds and backdates the lease by the existing first retry delay plus 1ms. Production retry/worker semantics and all CAS/takeover assertions are unchanged. `git diff --check` passed; local PostgreSQL contract run is unavailable without a test DB connection and is explicitly deferred to exact-head CI. No other project containers or data were touched.

Alpha diagnosis: all six sampled Alpha/prod HTTP paths are 200 and DB health true. Alpha serves `c4f477c31ff453cce371033381ad2065d355f635`, behind dev. Matching dev CI `38744066123` failed one PostgreSQL takeover-lease assertion (1 failed / 1202 passed); Alpha `38744066281` stopped waiting for CI. Equality at the retry available-at timestamp is under investigation. Browser home/tournaments hydrate normally; user-reported runtime symptom is not yet independently reproduced. Asked for affected route while continuing diagnosis.

Exit proof:
- [ ] Region/futsal guidance and real existing-route links are present in initial HTML and ordinary visible UI, without unsupported claims or filter regressions.
- [ ] Expired-lease CI contract remains meaningful and deterministic; exact-head API/Web/Gates pass.
- [ ] Independent Sol review has no unresolved blocking findings.
- [ ] Latest matching Alpha deployment serves the tested SHA; 390/768/1440 views, links, filtering and bottom content pass actual browser/error/network checks.
- [ ] Alpha noindex boundary and sitemap/AI-publication exclusions remain intact.
- [ ] Only approved source/release paths are promoted; production serves the exact successful main SHA and public pages/health/metadata pass.
- [ ] Public search/AI observations are reported separately from code deployment and indexing; monitor cursor is updated and owned processes/space are closed.

## Historical Cursor — earlier 2026-10-15
- User authorized existing routes only, Alpha verification then scoped main deployment. No further deployment permission is needed.
- Oct 13 PRs #1902/#1903 and production run 38393464125 completed. Later releases advanced production to `37e314f212717027e478916c56e6ca1e8e08585c`; historical receipts are not current ranking evidence.
- Actual Korean Google first results/AI area for 풋살 대회 and 풋살 리그 contained no Teameet source link. Site-restricted 풋살 search does show the mixed Teameet cup, friendly matches and teams. The league query also has official FK-league intent. A review snippet contained app-install copy.
- Search Console AI report: 18 impressions for Sep 25–Oct 12, before the Oct 13 release. Do not report this as post-release performance.
- Existing owned checkout retained docs commit `223643788` and merged latest dev `105afaf31` before coding. Root detached WIP is untouched. PR #1926 is being extended to the final follow-up scope; its initial documentation-only description/CI is superseded.
- Owned: existing kind-list metadata/canonical/ItemList/h1, factual sport/type detail titles, app-promo data-nosnippet, public review SSR and empty-review noindex/follow, aligned sitemap/deduplication and evidence. No new routes, DB, auth, public visibility, Kakao or native/store changes.
- RED: 7 failed/15 passed reproduced metadata/HTML/snippet defects; a separate sitemap regression reproduced. GREEN: 112 focused tests across nine files (including four real React Query seed isolation checks for page, size and search). Test expectations corrected to the existing brand suffix and team-first author display. Intentional upstream 404/503 logs are expected failure-isolation scenarios. Initial runner option placement and guessed read paths were corrected; they are not product failures. Docker is unavailable and not required for these frontend checks.
- Main implemented and directly verified; no new coding subagent. Independent GitHub review and exact revised-head CI remain pending. The heartbeat's explicit gpt-6-luna store lookup is separate from SEO implementation/review.

Follow-up acceptance:
- Final main review found that the backend's default tournament-only inventory omitted league reviews and uncached serial detail reads increased sitemap load. The follow-up explicitly requests kind=all, shares existing 300-second cached details with two bounded workers, preserves input order and excludes league-only invalid tournament subroutes. Real HTTP-boundary tests reproduce both defects (RED: 3 failures), then the 15 affected sitemap/discovery/AI tests pass. Aggregate focused coverage is 137 unique tests across 12 files. A new test's narrower RequestInit annotation failed typecheck; it was corrected to the actual Next.js RequestInit contract and typecheck/pattern lint now pass. Fresh no-store public inventory prevents cached detail from publishing a hidden competition; review-count hints may lag up to 300 seconds. PR #1926 is merged to dev d682b2506 with matching CI/Alpha/browser QA passed. Main #1927 is draft again until this follow-up passes exact-head CI, independent review and Alpha. Root shared WIP remains untouched.
- Exact-head Web CI `38712854015` ran 9,078 tests: 9,077 passed and one existing tournament-page metadata test still expected the pre-change title/canonical. Corrected this owned contract drift and strengthened the real server-page test to compare metadata, rendered h1 and ItemList URL/name. Product behavior was not reverted. The affected 15-test file passes; aggregate focused coverage is 135 tests across 11 files. The source and main candidates need fresh CI before any merge. Oct 15 baseline: 317/317 sitemap URLs pass; 278 public entity URLs have zero sitemap/AI omissions. Mixed-cup Google inspection confirms indexed/self-canonical, last crawled Oct 13 18:34:48 (precedes the Oct 13 SEO release); cached Event warnings are optional performer/validFrom, not a new-code live validation. Current venueAddress is null and no address was invented.
- Additional Codex review found UTC server/Korean-client review-date hydration drift. Explicit Asia/Seoul formatting now preserves the same date on both; the real first-HTML test reproduced Oct 1 instead of Oct 2 under `TZ=UTC`, then passed with the correction. Draft scoped main PR #1927 is prepared but must stay unmerged until Alpha validation passes. Its first candidate is superseded by this timezone correction. Local release policy uses actual Git-tree manifest data and changed paths; the large changelog extraction exceeded output limits and was omitted from that metadata-only proof (full source is checked by PR CI).
- Review correction: Copilot identified duplicate cached/uncached detail reads during sitemap generation. Shared public-detail collection now supplies both fixture and review decisions with one no-store read per eligible entity; the AI fixture consumer retains its existing cache/public-boundary behavior. RED reproduced two reads, then all 13 affected sitemap/AI collection tests passed. Aggregate coverage is 120 unique tests across ten files. Revised type/pattern checks pass. Optional AI scan `38711816129` failed before analysis because `claude-opus-5` is unavailable; this is not a security pass. Google seven-day report was recovered with keyboard input: Oct 6–12, 12 impressions, still pre-release.
- [x] Existing all/tournament/league pages have truthful distinct metadata/canonical; arbitrary filters remain consolidated.
- [x] App promotion remains usable but its actual section is excluded from snippets.
- [x] Actual public reviews render in first HTML; empty reviews use noindex/follow and are absent from sitemap.
- [ ] Exact-head CI and independent review pass.
- [ ] Deployed Alpha checks pass, followed by scoped production deployment.
- [ ] Production and Google statuses recorded without claiming guaranteed ranking or AI inclusion.

## Context
2026-10-13 최종 범위: 새 페이지를 만들지 않고 기존 팀·대회·리그·개인 매치·팀 매치·리그 경기의 공개 검색 정보를 정리한다. 사용자 승인: Alpha 검증 후 이번 SEO 변경만 main에 배포하고 실제 Google 색인 상태까지 확인한다. 월별·지역별 새 라우트 제안은 폐기됐다.

Owned extension: sitemap/llms publication, existing detail metadata, structured-data builders and focused tests, this task and SEO measurement report. Forbidden: DB/public visibility mutations, auth/Kakao/store configuration, new routes, unrelated dev changes, shared-root WIP.

Acceptance criteria:
- [x] Sitemap·canonical·AI links agree on final existing league-fixture routes; no arbitrary public inventory truncation.
- [x] Recruitment facts match actual deadline/capacity checks; dates include year; venue names are not fabricated postal addresses.
- [x] Focused RED → GREEN and exact-head CI pass; Alpha guest routes, errors and noindex exclusion verified.
- [x] Scoped production deployment verified by commit/release headers and public inventory audit.
- [ ] Google actual indexed/pending statuses recorded separately from indexing requests and AI inclusion expectations.

Historical implementation cursor — 2026-10-13: task-owned existing checkout `mdqa-127-kakao-talk-login`, base `9e3d596629ca350e5a12ac38a06ab42fff14713f`; shared-root files excluded. RED 2026-10-13 19:38: 8 failed / 34 passed, reproducing canonical, truncation, registration and false-address defects. Further RED confirmed year/state descriptions, missing tournament fixture links, and closed-public-match separation. GREEN: 87 focused tests across seven files; frontend typecheck/pattern lint passed. Host load 27.43/24.35/30.56 (12 cores), free memory 36%, swap 16.1GB, Node/browser signatures 439; narrow tests run serially by user-authorized policy. Docker unavailable, not used. Test harness corrections: beforeEach returned mock was interpreted as teardown; tournament list fixture needed real pageInfo contract. Both corrected and affected sitemap tests passed. Missing-path read attempts were corrected; no product code was affected. No newly spawned coding agents (project delegation restriction); main performed implementation and direct checks, CI review pending.

PR #1902 first SHA `166053d70` CI `38386019964`: Web/API/Gates passed. Codex connector and Copilot independent reviews identified valid per-tournament failure isolation, history-query coverage and full-state mapping; corrected with RED → GREEN evidence. Cached detail reads now reuse 300-second publication data while the current public tournament inventory is fetched no-store. Failure IDs are explicit in AI output. Shared cursor validation replaces duplicate pagination loops. Target main still supports team-match `on_hold`, so label compatibility is preserved without importing unrelated dev type changes. Focused aggregate: 91 tests pass; frontend typecheck/pattern lint pass. Exact revised-head CI/Alpha still pending. Optional AI scan `38386026815` failed before analysis because external model `claude-opus-5` is unavailable; it is not a code-check pass.

Release cursor 2026-10-13: exact revised-head CI `38389279534`, merged-dev CI `38390817079`, Alpha deployment `38390817062` and scoped main PR CI `38390729123` passed. Dev PR #1902 merged at `79d1744c899725b5530b684983380caaaf48ab50`; its deployed Alpha passed seven unauthenticated HTTP route/metadata checks, final league-fixture canonical, year/state description, noindex and publication 404 exclusion. The existing authenticated Alpha UI session traversed the same seven domain/detail routes with no runtime exceptions; 390/768/1440px screens were inspected with no horizontal overflow. Guest HTTP access and authenticated browser evidence are distinct. A tablet QA timeout was isolated to an offscreen lazy image at y=2750; viewport-aware image waiting and settled screenshot capture passed. Missing release-helper read path was corrected to `scripts/release/changeset-contract.mjs`. No product failure was counted as a pass.

Main PR #1903 independently reviewed with zero open findings and merged at `3dd537d4eb74a0d2c74f1a28e6da3962611130b9`. Its 18-path patch excludes unrelated dev behavior and DB/auth/visibility/store changes; fixed app versions/changelogs/consumed SEO Changeset passed release policy. Actual production CI/image/deploy workflow `38393464125` is running; runtime production remains the baseline until its commit header changes. Root shared detached checkout/WIP was preserved, and the task-owned checkout fast-forwarded to merged dev.

Production apply completed: workflow `38393464125` succeeded after user-authorized production environment approval. Live commit `3dd537d4eb74a0d2c74f1a28e6da3962611130b9`, release `1.8.3`, API health 200, `/home` HTTP noindex preserved. Full 347/347 sitemap URL HTTP/canonical/indexable/JSON syntax checks passed. All 308 public entity/fixture URLs are in both sitemap and AI publication; missing inventory, redirects, Alpha leakage and upstream warnings are zero. Evidence `/tmp/teameet-production-discovery-audit.json`. Main build/activation and the independent CodeQL `Push on main` run were distinguished; the unneeded CodeQL watcher was intentionally terminated, not treated as a product failure.

Production baseline audit: 285 sitemap URLs checked; actual public detail inventory 308 (104 teams, five tournaments, one public league, three personal matches, 148 friendly/league matches, 47 tournament fixtures). Sitemap missed 86 final detail URLs, AI publication missed 182, and 24 sitemap entries redirected; no Alpha host leak. Google Search Console `/tournaments` is actually indexed; representative team is discovered/not indexed, league/final league fixture unknown. Existing sitemap report is successful, last read 2026-10-12 with 271 discoveries. Replacement ego space 3 (Default/성준) was explicitly user-authorized after space 418 disappeared. Latest optional AI scan `38390735217` again failed before analysis because model `claude-opus-5` is unavailable; CodeQL and product checks passed separately.

사용자가 Google 검색에서 `/home`의 제목 대신 URL과 “이 페이지에 대한 정보가 없습니다”가 나오는 화면을 제공했다. Google·네이버에서는 운영만 노출하고 alpha는 제외하며, 로그인된 ego 프로필로 GA4의 메인 페이지 분석과 계측 결함 수정을 요청했다.

## Goal
운영 공개 소개 페이지의 검색 신호를 정리하고, 수집 차단 때문에 읽히지 않는 noindex를 정정하며, 실제 GA4 속성 및 홈 이벤트의 수집 계약을 확인한다.

## Original Conditions
- [ ] Google·네이버의 운영 검색 노출 개선
- [ ] alpha 검색 제외
- [ ] GA4 기존 운영 속성의 메인 페이지 데이터·설정 확인 및 계측 수정

## User Scenarios
- 검색 로봇이 운영 `/landing`의 제목·설명·canonical을 읽는다.
- 검색 로봇이 앱 홈 `/home`의 noindex를 읽어 오래된 URL-only 검색 결과를 제거할 수 있다.
- 운영자가 `/landing` CTA와 `/home` 탐색 행동을 GA4에서 구분한다.

## Test Scenarios
- 운영 robots 수집 정책과 `/home` noindex 헤더를 함께 검증한다.
- alpha 검색 봇이 noindex를 읽을 수 있고 AI 학습 봇은 차단되는지 검증한다.
- GA 초기화·내부 트래픽·홈 클릭 이벤트를 좁은 단위 테스트로 확인한다.
- GA4 실제 속성/스트림과 브라우저 수집 결과를 확인한다. 배포되지 않은 코드는 live 완료로 표시하지 않는다.

## Parallel Work Breakdown
병렬 에이전트 사용 없음. 순서: 진단 → 코드 수정 → 좁은 검증 → 외부 설정/측정 → 보고.
Owned: robots 및 해당 테스트, landing metadata, analytics 및 홈 계측, alpha 크롤러 설정, 본 task 및 운영 측정 문서.
Forbidden: DB/인증 동작/제품 시각 디자인/다른 세션 파일. 2026-10-12 사용자가 이 작업의 dev 반영·검증과 main 배포를 명시적으로 승인했다.

## Acceptance Criteria
- [ ] 공개 소개는 indexable, 앱 홈은 crawlable + noindex, 개인·관리 API 보호 유지
- [ ] alpha noindex 유지, alpha 데이터를 운영 sitemap으로 광고하지 않음
- [x] 홈 클릭은 목적지만 분류하며 사용자 이름·이메일·전화번호·쿼리 문자열을 보내지 않음(코드 및 동작 테스트)
- [x] 검증 결과와 배포/검색 재수집 대기를 구분

## Tech Debt Resolved
robots Disallow와 noindex 충돌 및 홈 계측 누락은 정정·운영 배포 완료됐다. 현재 후속 작업은 상단 Current Cursor를 따른다.

## Security Notes
환경 파일 및 인증 토큰을 읽거나 출력하지 않는다. 브라우저 기존 프로필만 사용하고 개인정보를 GA 이벤트 파라미터에 추가하지 않는다.

## Risks & Dependencies
검색 결과 갱신은 배포 후 검색엔진 재수집에 의존한다. 이번 작업의 프로덕션 승격은 사용자의 명시 승인 범위다. 기존 GA4·Search Console·네이버 계정 권한을 확인했다.

## Ambiguity Log
- “main”은 운영 도메인 teameet.co.kr을 뜻한다. 코드 기준으로 브랜드 검색 정본은 `/landing`, `/home`은 앱 대시보드다. 인증 진입 동작은 변경하지 않는다.
- 2026-10-12 사용자 확인: Google 계정 메뉴가 아닌 ego 브라우저 프로필 전환을 사용한다.

## Historical Progress Snapshot — 2026-10-12
- 시작 checkout: detached HEAD `082d90b1b`, clean. 브랜치 전환 없이 작업. origin/dev fetch 후 소스 차이 없음.
- 운영 실측: release `1.6.8`, commit `461d03081d4186abdb42436e936383ffb36493e4`; `/home` robots Disallow + HTTP noindex. `/landing` index/follow, canonical, 소유확인 메타 존재. 운영 sitemap 271개, alpha URL 없음.
- alpha 실측: release `1.6.8-alpha.20261011.g082d90b1b9e2`; 모든 페이지 HTTP noindex, robots Disallow `/`. sitemap은 alpha 엔티티를 운영 URL로 출력(566개).
- 운영 GA ID `G-LCZ6BNMMHV`, alpha `G-4CQ2SD20TE`: 현재 별도 스트림 ID.
- ego space 233은 잘못된 기본 프로필로 생성되어 사용자 요청 프로필로 전환하면서 finish 완료.
- ego 235(Sungjun)은 요청한 계정이 아니어서 finish 완료. 236(Default/성준)에서 kinsongjun13 계정 확인. Google 관리/운영 실측을 같은 task space의 p1/p2/p3으로 진행한다.
- 코드 반영: 운영 `/home` crawlable+noindex, 브랜드 landing metadata, alpha 검색 봇 noindex 수신 및 sitemap/RSS 404, 개인정보 없는 홈 링크 클릭 수집/리스너 cleanup.
- 검증: robots 9개·기존 analytics 24개 통과. 새 홈 동작 5개 통과(동기 navigation/unmount와 cleanup 포함). landing metadata 회귀 1개 통과. landing 전체 15개 중 기존 시각 동작 14개는 첫 실행에서 통과했고, 변경된 설명의 한글 브랜드 계약 실패를 고친 뒤 해당 1개만 재실행했다. 기존 motion 테스트의 act 경고는 별도 제품 변경 없이 기록한다. 새 테스트의 오래된 analytics 리스너 누수와 spy 타입 오류를 수정했고 최종 typecheck는 exit 0.
- owned 검증 PID 89571, 91198, 97511, 7722, 7822는 종료 확인. 로컬 nginx/Docker runtime이 없어 nginx 실행 검증과 alpha 배포 검증은 미실행.
- Search Console에서 운영 소유권 HTML 확인 완료. `/landing` indexed, `/home` indexed-but-robots-blocked 확인. sitemap 제출 완료. Google 실시간 검사(10/12 05:20:42)는 크롤링 허용/가져오기 성공, 사이트맵 보고서의 읽기 실패 상태 처리 완료는 미확인.
- GA4 맞춤 측정기준 cta/destination/destination_type 저장 완료. 운영 전용 비교(저장 ID 16108135445) 생성/적용 완료. 기존 자동 pageview 설정 정상 및 실제 CTA/SPA 요청 관찰. 수치·정의는 `docs/ops/seo-measurement-baseline.md`에 기록.
- 사용자 네이버 로그인 후 기존 운영 사이트(등록일 9/27, 소유 미확인)를 확인했다. HTML 인증 태그가 운영에 이미 일치하며 사용자 보안문자 입력 후 소유확인이 완료됐다. 사이트맵(10/12 05:32:17), 공지 RSS(05:34:13), `/landing` 수집 요청(05:34:32) 등록 목록을 확인했다. 시각은 네이버 UI 표시 기준이다. RSS 보안문자는 사용자가 에이전트 입력을 승인했으나 이후 직접 처리 선호를 명시했다. 후속 보안문자는 사용자에게 넘긴다.
- 운영 GA 태그의 카카오 인증 도메인 2개 추천 제외 규칙은 이미 존재해 변경하지 않았다. 과거 28일 referral 127세션만으로 현재 설정 실패를 단정하지 않는다.
- ego CDP 연결 및 일부 UI 반응이 지연됐다. 같은 space에서 연결이 복구됐고, 네이버 HTML 태그 radio의 pointer intercept는 label 클릭으로 해결했다. 새 홈 이벤트 live 수집은 배포 전이므로 미검증. main 승격·push·commit은 실행하지 않았다.
- 공유 checkout의 HEAD가 작업 중 다른 세션에 의해 `32325e990`으로 이동했다. 이 작업의 소스·nginx·robots·analytics 의존 경로에는 시작 HEAD 대비 변경이 없고 내 변경 12개만 dirty 상태로 유지된다. HEAD 이동이나 원격 동기화는 이 세션이 실행하지 않았다.

## Historical Resume Notes — superseded by Current Cursor
0.4. Main release PR #1847 at version commit `4700b9110` exposed four valid regressions in already-merged chat work: a non-participating host loses existing-room access after guests leave; an unrelated send failure disappears on detail refresh; reconnect omits room detail/composer; cancelled-approved legacy participants lose history when visibleFromAt is null. Main merge is held for these release-review fixes. Added owned scope: chat entitlement/service + unit/integration tests, community send-error handling/test, realtime reconnect/test, chat API docs and a patch Changeset. No schema/data migration or unrelated UI redesign. Shared checkout was clean before edits; no concurrent dirty files were present.
0.5. Release-review regression evidence: old owner predicates and reconnect detail exclusion failed the new assertions; a real TanStack send mutation with HTTP 502 lost its visible error after a detail refresh (confirmed after flushing its scheduled notification). Fixed all three and added PostgreSQL API scenarios for non-participating owners plus approval-time history with before-approval exclusion. Frontend focused verification: 9 passed. Backend first verification: 81 passed; one older fixture expected owner access to disappear, contrary to the clarified existing-room contract, so its expectation was corrected while withdrawn guests remain denied. PostgreSQL scenarios run in CI; local Docker is unavailable. Main PR is draft while the fixes are verified.
0. SEO PR #1842 merged to dev at `8deac7bc16382b85615f70d98c1a91cd5ae858a7`; exact CI `38174051752` and Alpha `38174051733` succeeded. Live alpha verified: home/landing noindex, new robots, sitemap/RSS 404, health DB true. Actual home → teams click emitted one `home_navigation_click` and one SPA `page_view`, both GA HTTP 204, no runtime exception. Production remains `461d03081d4186abdb42436e936383ffb36493e4` pending promotion.
0.1. User requested latest-dev deployment optimization while parallel PRs #1839/#1840 advanced dev to `381749db22135d39800c4b0b124d7e033ca32a01`. Promote run `38175387865` safely refused mismatched alpha/dev and changed nothing. Added scope: CI/workflow freshness helper/tests, deployment policy docs, Changeset. Dev CI cancels superseded runs; Alpha checks SHA before runtime env sync and again immediately before SSM. Already-started SSM remains serialized and completes; manual Stage B keeps its pinned contract. Image preparation remains serialized in the existing workflow. No new subagents, local servers or DB changes.
0.2. GA4 Internal Traffic filter is Testing. Saved non-destructive comparison `운영 · 내부 트래픽 제외` (ID `16108290729`): production stream plus exclusion of `testDataFilterName=Internal Traffic`; applied to realtime and events. Did not activate permanent data deletion. Current browser task space 250 must be finished after release verification.
0.3. Pipeline PR #1845 review found that rerunning an old dev SHA could cancel the tip CI. Dev reruns and workflow_dispatch now use isolated run groups; only fresh dev pushes cancel previous push CI. Six actual concurrency-expression contexts and eight helper execution cases pass. Production/Stage B protection is unchanged. CI must be checked again on the corrected commit.
1. 사용자 후속 승인: “dev 반영하고 검증한 다음 main 배포까지 진행해줘. 구글 사이트맵 오류도 확인해서 해결해주고.” 내 경로만 로컬 커밋 → dev PR/CI → alpha 실측 → 버전 승격/CI → main 배포 → 운영 실측 순서로 진행한다. 별도 승인 재요청은 필요하지 않다.
2. 배포 후 운영 robots/메타 및 alpha robots/noindex/sitemap 404, 새 홈 이동 이벤트의 live 수집을 확인한다.
3. Google 사이트맵 보고서는 10/12 05:41 재확인에서 성공, 읽은 날짜 10/12, 발견 URL 271로 처리 완료됐다. 일시적인 읽기 실패 상태는 해소됐고 재제출은 하지 않았다. `google-sitemap-success.png`로 실제 보고서 증거를 저장했다.
4. 검색 결과 재측정은 실제 운영 배포일 +14일/+30일 기준으로 한다. 자동 예약은 만들지 않았다.

## Evidence
- ego space 236은 `finish({ keep: [] })` 성공으로 모든 작업 페이지를 닫았다. 로컬 서버를 띄우지 않았고 테스트 PID는 모두 종료 확인했다.
- 로컬 증거 폴더: `/tmp/teameet-seo-ga4-20261012/`.
- `naver-sitemap-submitted.png`, `naver-rss-submitted.png`, `naver-landing-crawl-requested.png`: 각 등록 목록.
- `sitemap-live-fetch-success.png`: Google 실제 URL 테스트의 페이지 가져오기 성공.
- `google-sitemap-success.png`: 후속 사이트맵 보고서 성공 및 271 URL 발견. 웹 패턴 검사도 통과했다.
- `ga4-dimensions.png`, `ga4-landing-cta.png`, `ga4-existing-kakao-referral-rules.png`: 맞춤 정의·실제 운영 보고서·기존 추천 제외 규칙.
