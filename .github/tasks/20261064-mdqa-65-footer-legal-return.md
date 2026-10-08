# Task 20261064: QA #65 앱 푸터 약관 문서 복귀 경로

Status: In Progress
Owner: root / scoped frontend worker
Created: 2026-10-09

## Context
[기존 리포트 #65](https://teameet.jmandu.kr/issues/65/)의 설정 약관 목록 `/my/settings/legal`에서 푸터 개인정보처리방침을 열면 `/terms?document=privacy`로 이동하고 상단 뒤로가기 `/login`이 인증된 사용자를 홈으로 보낸다. 본문 개인정보 카드의 `from` 포함 경로는 정상 복귀한다. root는 미배정·접수·댓글0과 실제 대응 task/branch/WT/열린 PR 부재를 확인하고 UI 내가 처리하기로 김성준·확인 중을 저장·확인했다. 과거 #15 완료 범위와 미수정 푸터 추가 제보를 구분하며 #15를 재오픈하지 않는다.

## Goal
앱 푸터에서 약관 문서를 열 때 현재 경로를 안전하게 전달하여 실제 상단 복귀 소비자가 원래 화면을 복원한다.

## Original Conditions
- [ ] 설정 목록 → 푸터 개인정보 문서 → 상단 뒤로가기가 설정 목록으로 돌아온다.
- [ ] 앱 푸터의 같은 경로를 쓰는 5개 약관 문서는 query/hash 및 기존 중첩 from 계약을 유지한다.
- [ ] 실제 소비자/HTTP RED→GREEN, 독립 리뷰, 커밋 검증, base-dev PR, 기존 리포트 댓글까지 진행한다.
- [ ] dev 머지·배포 후 실제 alpha AFTER를 별도 기록한다.

## User Scenarios
1. 인증된 사용자가 설정 약관 목록의 푸터 개인정보 문서를 읽은 뒤 원래 목록으로 복귀한다.
2. 다른 앱 경로의 query/hash와 복귀 chain이 보존되고 수정 클릭/새 탭에도 실제 href가 유효하다.
3. 직접 공개 약관 URL과 로그인/가입/갱신 동의 경로의 기존 fallback·권한·에러 표시가 유지된다.

## Test Scenarios
- [x] unchanged product 실제 footer entry → TermsClient/AppBackLink/HTTP 소비자 실패 RED.
- [x] 5개 문서 entry, 정상 query/hash/chain, 상단 복귀 소비자 GREEN.
- [x] sanitation/modified-click/prefetch 및 SSR/Suspense/static not-found 경계와 기존 영향 테스트.
- [x] 문서 GET 실패·재시도 계약 보존 및 fixture/process cleanup.
- 공유 fixture/MSW/API/DTO/schema 변경 없음; own test-only fixture/inline typed data 사용.

## Parallel Work Breakdown
- Phase2 worker: root가 승인한 직렬 최소 worker1 RED→최소 구현→narrow GREEN 및 task/Changeset.
- Phase3 root: drift, types/original pattern, 독립 리뷰, explicit pathspec Git/커밋 검증, PR/외부 리뷰/CI/tracker/SSOT.
- Owned: `apps/v1_web/src/components/v1-ui/shell.tsx`; new `shell-legal-return.test.tsx` and own fixture if necessary; this task; `.changeset/mdqa-65-footer-legal-return.md`.
- Forbidden: shared hooks/types/MSW, use-current-href/session-storage/app-back-link helpers, TermsClient/auth/routes/API/DTO/schema, styles/tokens, 다른 task/policy/state, Git mutation/자기 커밋/browser/server/install/fullsuite/build/tsc.
- 혼자가 아니며 타인 변경을 되돌리지 않는다. root만 Git/통합한다. peer PR1705 38경로에는 shell.tsx 없음을 실제 확인했다.

## Acceptance Criteria
- [ ] 실제 footer/back 계약 RED→GREEN 및 커밋 기준 좁은 검증.
- [ ] 기존 sanitizeRedirectPath/withFromPath 사용, 외부 URL·로그인 복귀 우회·open redirect 없음.
- [ ] 404/static RSC 소비자를 위해 useSearchParams 구독에 기존 Suspense 경계를 적용하며 전체 shell을 bailout하지 않는다.
- [ ] markup/layout/tokens/prefetch/공지사항·동의 흐름 보존, 새 의존성 없음.
- [ ] 최신 head 독립 Critical0/Warning0, 한국어 dev PR 및 #65 댓글 저장/표시.

## Tech Debt Resolved
푸터 5개 링크의 누락된 복귀 문맥을 기존 useCurrentHref/withFromPath로 보완했다. URL 구독은 footer-only Suspense에 두고 정적 fallback도 같은 footer markup/prefetch를 사용한다. touched debt marker/trailing whitespace와 diff check를 확인했다. 다른 helper·문서·권한·동의 흐름은 수정하지 않았다.

## Security Notes
읽기 전용 약관 GET과 복귀 주소만 수정한다. 법적 동의/가입/권한/인증은 변경하지 않는다. 외부 URL은 기존 sanitizer 계약을 유지한다. alpha 문서 보기 외 데이터 쓰기나 동의 실행 없음.

## Risks & Dependencies
shared AppChrome은 서버 not-found 소비자도 있으므로 unsuspended searchParams 금지. 테스트가 링크 mock만으로 실제 상단 복귀를 숨기지 않도록 actual TermsClient/AppBackLink 소비자를 확인한다. 코드 PASS는 실제 alpha AFTER가 아니다.

## Ambiguity Log
2026-10-09 root: 기존 TermsClient의 from 없는 /login fallback은 직접 공개 문서 계약으로 유지한다. 제품의 필요한 변경은 앱 푸터 entry이며 레이아웃·스타일 변경 없는 로직 예외로 새 디자인 승인은 필요 없다. mobile/logout 등 미검증 범위는 별도 명시한다.

## Progress Snapshot
- Root claim 김성준·확인 중 실제 표시05:26KST, run1913/report65-claim-confirmed.txt/png; original 설명/3첨부 실제 픽셀 검수. alpha1180×757 인증된 계정에서 body card 정상/footer 재현2회, 직접 serving SHA unknown/AFTER pending.
- managed creation855c8d9f-7d19-4199-885f-2f50c83404f8: fresh fetch origin/dev78ee에서 생성, root branch fix/mdqa-65-footer-legal-return. 착수 전 #41 PR1703 실제 dev merge ffada44c7960ef137bdd113ff8c205fcc9724db2를 root fetch/clean FF로 안전 통합, 작업 base ffada44c7. 실제 dev도 dev/clean/up-to-date 확인했다.
- own WT C:/Users/kinso/.codex/worktrees/mdqa-65-footer-legal-return/matchup-sports-platform, ignored evidence tmp/qa/mdqa-65; dependency junction만 기존 dev-pr-1654-review 런타임을 재사용, 설치 없음.
- root 변경 .github/tasks 1개 외 제품 착수 전 clean. Phase2 worker dispatch/실제 RED부터 시작; root 다른 PR/웹/SSOT 후속은 owned shell 경로와 분리한다. root merge/Done/delete0.

- Phase2 worker base `ffada44c7960ef137bdd113ff8c205fcc9724db2`에서 완료. source는 `shell.tsx` 1개(18 insert/8 delete), 새 actual consumer spec 1개와 이 task/Changeset만 수정했다. 법적 문서 GET·TermsClient/AuthFrame/AppBackLink/AppShellFrame·설정 본문 page·공유 history/query는 실제 구현이며 Next navigation/Link 경계만 fixture다.
- 실제 unchanged-product RED: 설정 privacy footer → footer context GET/본문 확인 → 상단 Back의 도착 `/login`, 기대 `/my/settings/legal`; 같은 본문 card baseline 정상. `footer-return-red.txt`: 실행2건, 1 FAIL/1 PASS/이름 필터15건, 5.23초. 실패는 실제 복귀 URL assertion이며 HTTP/fixture 오류가 없었다.
- 최소 구현: 5개 footer legal href만 안전한 현재 URL을 붙인다. 구독은 Suspense 안의 footer component이며 fallback은 정적 동일 markup이다. notice/prefetch/layout/tokens/direct TermsClient `/login` fallback과 가입·갱신 동의는 그대로다.
- 첫 좁은 실행 `footer-return-green.txt`: 기존 TermsClient21 + shell15 + frame5 모두 PASS, 새 consumer15 PASS/2 harness FAIL (404 검색 observer가 icon 링크를 선택했고, 경로 없는 frame fixture는 의도대로 Chrome을 생략). 두 harness 실패는 제품 RED에서 제외했다. 관찰자를 실제404 본문 CTA로 좁히고 standalone Chrome fixture로 바로잡았다. 제품 코드 추가 변경 없음.
- 수정한 새 consumer `footer-return-green-corrected.txt`: 17/17 PASS, 4.70초, runner exit0/경고 없음. 기존41/41과 합쳐 영향 범위58건 PASS를 두 실행으로 확인했으며 단일58-pass 실행을 주장하지 않는다. 최종 소스 교차 확인에서 사용되지 않은 social-consent guard fixture URL을 실제 `/auth/social-terms`로 한 줄 정렬했다. root committed gate는 이 최종 spec blob을 검증한다.
- `tmp/qa/mdqa-65/preflight.json`: CPU0%, free14382MB, Node194/Edge10, Docker daemon unavailable, 3013/8121 listener 없음. HTTP/MSW 검증은 DB/서버가 필요 없다. 최소 worker1/file parallel off, 내 Vitest runner 종료·cache/server/history/session fixture cleanup 완료, 다른 프로세스 종료 없음. serial slot은 root에 반환했다.
- 원본 증거는 own ignored `tmp/qa/mdqa-65/`에 보존했다. worker는 Git mutation/타입/빌드/lint/브라우저/서버/설치를 하지 않았다. 최신 dev 통합·최종 blob 검증·독립 리뷰·PR·댓글·alpha AFTER는 root 후속이며 아직 완료하지 않았다.


- Root Phase3 final-source integration/gates20:44UTC: freshfetch origin/dev39c53f06dec6624d88a3ca6f862a7bd3750256a7, incoming42paths (peer16강+리뷰)와 owned4 overlap0. feature branch에서 안전 FF, 모든 ownedSHA256 보존 및 foreignWIP0 확인. integration receipt tmp/qa/mdqa-65/root-safe-integration.json. 최종 unused fixture path 보완 포함 TypeScript exit0 / 원본pattern exit0, source hash 전후595985B17416A2E3990EB9027237A9E909BDECDAE5780E777E758398470D7BB4 동일. root-gates-result.json20:43:22~20:44:03와 preflight/logs 보존; sole serialprocess자연exit. 새 source변경 없음. 기존58건은 worker분리검증이며 root는 exactcommitted58 및 독립최신head 검수로 PR gate를 완료한다. 실제 NextSSRbuild/browser/alpha AFTER는 코드단위증거와 구분해 pending.

- Independent /root/review_mdqa_42 dirty intended4/4 Critical0/Warning0 Good3/Suggestion0 OK/FindingsNone. Actual TermsClient/AuthFrame/AppBackLink/history·sanitize/depth4·footer-only Suspense/404·5문서/query/hash/from·modifiedclick/prefetch·직접loginfallback·503 재GET 보존 검수. shell SHA256B19AD965EAC745BEE428FF1DEE0D3D54B742C388F2F741AA15736B588841D388/specFC93CE97A31595E6E868D00E92B244A19636A4833150E35832391CD91A480B69. 실제 Next build/alpha는 별도 pending. Root커밋/최신head 검수가 다음 gate.

- Root clean committed f56ee59f077b2c0d51aa6f882edaf9e73427e907의 지정 경로 4/4를 검수한 뒤, 실제 푸터 소비자17 + 기존 shell15/frame5/TermsClient21 = 58/58 PASS(exit0), 20:45:17.9835121~20:45:29.1071393UTC. committed-result.json/committed-footer-impact.txt/preflight를 보존했다. 실행 전후 clean 및 diff check PASS, 최종 social guard fixture 경로를 포함했다. MSW/query/session/history cleanup과 runner 자연 종료, 타인 프로세스 종료0. 코드 단위 계약·타입·원본 pattern 통과와 실제 Next SSR build/alpha AFTER 대기는 구분한다. 문서 체크포인트 뒤 최신 head 독립 검수, 한국어 base-dev PR, 기존 #65 댓글, 외부 리뷰·CI를 이어간다.
