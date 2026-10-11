# Task 20261072: 운영 검색 노출 및 홈 GA4 계측 정정

Status: SEO deployed and verified on alpha; latest-dev pipeline improvement and authorized main release in progress
**Owner**: Codex main (단일 에이전트)
**Created**: 2026-10-12

## Context
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
코드에서 robots Disallow와 noindex의 충돌, 홈 조회 이외 탐색 계측 누락을 정정했다. 실서비스 반영은 배포 대기다.

## Security Notes
환경 파일 및 인증 토큰을 읽거나 출력하지 않는다. 브라우저 기존 프로필만 사용하고 개인정보를 GA 이벤트 파라미터에 추가하지 않는다.

## Risks & Dependencies
검색 결과 갱신은 배포 후 검색엔진 재수집에 의존한다. 이번 작업의 프로덕션 승격은 사용자의 명시 승인 범위다. 기존 GA4·Search Console·네이버 계정 권한을 확인했다.

## Ambiguity Log
- “main”은 운영 도메인 teameet.co.kr을 뜻한다. 코드 기준으로 브랜드 검색 정본은 `/landing`, `/home`은 앱 대시보드다. 인증 진입 동작은 변경하지 않는다.
- 2026-10-12 사용자 확인: Google 계정 메뉴가 아닌 ego 브라우저 프로필 전환을 사용한다.

## Progress Snapshot
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

## Resume Cursor
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
