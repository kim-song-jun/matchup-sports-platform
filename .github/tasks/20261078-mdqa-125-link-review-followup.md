# Task 20261078: MD-QA #125·#133 계정 증명과 인증 복귀 후속 수정

Status: In Progress
**Owner**: root integration / backend-data-dev / frontend-ui-dev
**Created**: 2026-10-13

## Context
기존 [#125](https://teameet.jmandu.kr/issues/125/)·[#133](https://teameet.jmandu.kr/issues/133/)는 김성준 담당 확인 중이다. #125 기존 PR1888의 실제 후속 finding을 이어 처리한다. #133에서 현재 휴대폰 소유만으로 다른 계정에 연결하거나 비밀번호를 변경하는 실제 결함을 확인했으므로 같은 계정 증명 API·선택된 A 복구 UI를 PR1888에 통합한다. 별도 중복 #133 PR은 만들지 않는다. 원인 조사용 #133 전용 task·워크트리·기존 증거는 보존한다.

## Goal
현재 번호 소유를 기존 계정 소유로 인정하는 경로를 차단하고 이메일 증명 복구·기존 계정 로그인 안내를 제공한다. 안전한 최초 목적지와 필수 약관·온보딩 우선순위, 실패 후 실제 auth cache 복구를 보존한다. 같은 열린 dev PR의 최신 head 리뷰·기존 두 리포트 댓글·배포 후 실제 alpha 검증을 이어간다.

## Original Conditions (must all be satisfied)
- [ ] 휴대폰 전용 preview/link는409 SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF로 거부하고 기존 계정·소유 자산·권한·프로필·세션을 변경하지 않는다.
- [ ] SMS password_reset 증명만으로 비밀번호를 바꾸지 않고409 ACCOUNT_RECOVERY_REQUIRES_EMAIL로 안내한다. 실제 이메일 OTP 복구와 기존 인증·토큰 purpose를 유지한다.
- [ ] 카카오 제공자 이메일 verified flags만으로 서비스 미검증 이메일 소유자에 연결하지 않는다. 이미 확립된 provider identity 로그인은 보존한다.
- [ ] 번호 충돌에서 실제 기존 계정 로그인·이메일 복구 출구를 제공하고 로그아웃 실패를 성공으로 숨기지 않는다. 오래된 이메일·휴대폰 응답이 다른 입력·모드의 인증 상태를 덮어쓰지 않는다.
- [ ] 실제 정상 로그인·가입 완료 뒤 안전한 원 목적지를 필수 약관·온보딩 완료까지 보존하고 최종 성공에서만 소비한다. 중간 next와 부분 동의·실패는 최종 목적지를 덮어쓰지 않는다.
- [ ] defer/complete TERMS_REQUIRED 오류 뒤 실제 auth/me를 갱신하고 가입 게이트로 되돌아가는 결함을 막는다.
- [ ] API 문서·DTO 호환 payload·타입·shared MSW·회귀 fixture·Changeset이 같은 실제 계약을 설명한다.

## User Scenarios
1. 재할당된 번호가 기존 계정과 충돌하면 기존 로그인 또는 이메일 복구로 이동한다. 번호만으로 기존 계정을 합치거나 자산을 이전하지 않는다.
2. 이메일 OTP 복구 중 주소·모드를 바꾸면 이전 응답과 비밀번호 재설정 결과는 현재 화면에 반영되지 않는다. 정상 현재 주소 복구는 계속 사용할 수 있다.
3. 정상 로그인·가입 완료 후 약관·온보딩을 마치면 최초 안전한 nested query/hash 목적지로 한 번 이동한다.
4. 약관 상태 전환 실패는 실제 재조회와 재시도를 통해 복구하며 실패를 성공으로 표시하지 않는다.

## Test Scenarios
### Happy path
- [ ] 정상 이메일 OTP 복구·기존 provider identity·현재 인증 continuation의 실제 API/HTTP/UI 소비자 계약을 유지한다.
### Edge cases
- [ ] 실제 QueryClient60초 캐시와 MSW HTTP에서 최초 URL·저장 목적지 우선순위 및 필수 단계 우선순위를 검증한다.
- [ ] 실 disposable PostgreSQL HTTP에서 거부 전후 관련 테이블·세션·쿠키·passwordHash와 정상 이메일 복구를 검증한다.
### Error paths
- [ ] SMS proof·카카오 미검증 서비스 이메일·잘못된 token purpose는 권한을 얻거나 데이터를 변경하지 않는다.
- [ ] 지연 응답·모드/주소 ABA·403/409/429/503 및 로그아웃 실패가 실제 오류로 표시되고 재시도를 보존한다.
### Mock data updates needed
- [ ] shared MSW의 오래된 phone-only200 연결·SMS 재설정 성공을 제거하고 실제409·purpose-bound 이메일 복구 계약으로 맞춘다.

## Parallel Work Breakdown
- Backend 단일 소유자:125의 auth.service.ts·account-recovery.service.ts 및 좁은 unit/actual HTTP fixture. backend-api child는 exact auth.module.ts의 미사용 Notifications DI 두 줄과 복구 controller 주석만 소유한다. schema/migration/Web/다른 task·정책·secret·Git·runtime 실행은 금지한다.
- Frontend 단일 소유자:125 auth social signup·email login·account recovery UI와 직접 회귀 fixture, 해당 목적의 shared hooks/types/MSW만 root exact 범위 승인에 따라 수정한다.133에서 입증한 복구 구현을 최소 통합하되125 F4/F5 continuation·action lock을 보존한다. API/schema/다른 워크트리/source/정책/Git/runtime은 금지한다.
- root:현재 문서·Changeset·docs/api/auth 계약·SSOT·좁은 직렬 검증·최신 committed head 독립 리뷰·explicit pathspec Git·동일PR push·리뷰 답변·기존 리포트 댓글·실제 alpha 증거. 작업자는 혼자가 아니며 타인 변경을 원복하지 않는다.

## Acceptance Criteria
- [ ] 위 조건과 실제 RED→GREEN, 필요한 committed-tree 타입·패턴/표면 검사.
- [ ] 최신 정확한 head 독립 Critical0/Warning0, 실제 외부 finding 해소·재리뷰·CI.
- [ ] 의도한 커밋·PR diff/import 범위 확인, fixture/docs/Changeset sync.
- [ ] 기존 PR1888와 #125·#133 한국어 진행 댓글 저장·실제 표시 확인.
- [ ] 실제 dev MERGED와 배포 SHA·로그인 persona·시나리오·viewport가 일치하는 alpha 증거는 별도 PASS로 기록한다. 미배포·미검증은 pending.

## Tech Debt Resolved
미사용 알림 DI, 도달 불가능한 전화번호 전용 연결 UI·200 fixture, 불일치한 복구 mock과 원 목적지·필수 단계의 우선순위 drift를 같은 변경에서 정리한다.

## Security Notes
전화번호만으로 기존 계정·password·소유 자산·세션을 변경하지 않는다. 기존 계정 소유 증명·role/purpose 경계는 유지한다. 운영 계정 자격증명이나 .env는 읽지 않고 실제 DB 검증은 root 소유 disposable fixture만 사용한다.

## Risks & Dependencies
PR1888 기존 head2bb4 및 원 PR1835·1837 이력은 아래 Progress Snapshot에 보존한다. 옛 업로드 이전 성공은 현재 안전 계약의 PASS가 아니다. 현재 거부 경로의 실제 무변경 검증을 기준으로 삼는다. PostgreSQL schema push+정본 chat CHECK 적용 증거는 full migration replay의 PASS와 구분한다. 리포트 완료는 첨부 영구 삭제이므로 구체적 action-time 인간 확인 전 실행하지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-13 | root |125/133 같은 계정 증명 API의 중복 PR 및 부분409 UI | 기존 PR1888에 전체 계정 증명+A 복구 UI를 통합,133 조사 task/증거는 보존 |
| 2026-10-13 | 사용자 |133 복구 화면 | A:기존 로그인·이메일 복구 폼 재사용, 번호 충돌은 기존 로그인으로 안내 |

## Progress Snapshot
- 2026-10-13T10:33Z latest-dev audit: remote and clean actual dev are9e3d596629ca350e5a12ac38a06ab42fff14713f. Current auth/recovery/continuation defects remain in that dev; no duplicate merged fix found. Local d25 is26 upstream commits behind and shares hooks/types with upstream team-match changes. Own candidate checkpoint precedes safe dev integration; upstream cache/status hunks must be preserved and committed-tree validation/review refreshed before same PR1888 push. Auth recovery documentation now matches phone409/email-only password reset. #133 remains consolidated, no separate PR.
- 2026-10-13T10:18:41.354Z: #125/#133 consolidated current source API4files187 PASS, Web13files188 PASS, isolated PostgreSQL/HTTP4files26 PASS. Initial HTTP run16 PASS/10 failed beforeAll60000ms (bodies not executed), same timeout warm single-file retry10 PASS; both logs preserved. Committed-tree type/lint, exact-head independent review, same PR1888 push/external review/CI and actual alpha remain pending; no separate133 PR.
- 2026-10-13 09:38Z: root 실제 recovery unit18은 SMS2 FAIL/이메일16 PASS RED. 실제 social signup+로그인 continuation27은 신규 충돌7 FAIL·필수 단계 priority1 FAIL·정상19 PASS RED (`mdqa125-recovery-unit-actual-red.log`, `mdqa125-proof-continuation-ui-actual-red.log`). Backend 최소 GREEN source 준비, Frontend 전체 A 통합 구현 중이다. worker 정적 리뷰는 실행 PASS나 최신 immutable head OK가 아니다.
- 아래 이전 전화번호 연결·asset 이전 성공 기록은 역사이며 현재 차단 계약으로 대체됐다. 최종 current unit/실PG/committed gate/최신 head 리뷰/동일PR push/두 리포트 댓글·dev머지·alpha 검증은 남아 있다.
- 2026-10-13 06:13Z F4: PR1888 head2bb4 actual Codex P2 r4255058030 and Copilot r4255054209 were checked against three real consumers. Six stacked mandatory-step cases actually failed; an additional partial-consent case skipped onboarding after the second required-document consent (1 FAIL /16 skipped). A shared continuation helper preserves safe ultimate destination separately from intermediate renewal/onboarding URLs and consumes only at final success. The exact three-file run passed67 (existing storage35 + new helper15 + actual consumer17), evidence `mdqa125-f4-helper-consumers-green.log`. Tests used unchanged wire fixtures and actual auth gate. Latest immutable review/CI remains pending. #133 proved a separate current-number-only account-proof vulnerability; this PR must not merge until that security contract and upload integration expectations are reconciled. Alpha account-link PASS remains NOTRUN. Actual report comment322 save/reload image was uploaded to PR1888 comment6139157908; it proves tracker persistence only, not alpha resolution.
- 2026-10-13 05:16Z F3: latest3c6 independent frontend review found invalid `in_progress`/unverified-holder fixtures and unchecked test assertions (Critical1/Warning1). Production behavior was consistent. Corrected the real consumer fixture to verified active holder + signup_done/sport_done/level_done/region_done and completed/done or deferred/confirm GET/PATCH contracts; strict unknown payload guard and explicit route switch replace casts/assertions. Dedicated test helper stays under250 pure LOC. Same11 real consumer cases PASS (`mdqa125-f3-contract-green.log`); previous87 test run is historical and does not override this review finding. Latest immutable independent re-review, same PR push/CI and actual alpha link scenarios remain pending.
- Latest root checkpoint 2026-10-13 04:58Z: PR1888 cfb3ca1989 실제 Codex P1 r4254784648을 실제 가입→온보딩 sport/level/region/confirm 및 renewal consumer로 재현했다(9사례 중7FAIL). 최종 성공에서 안전한 URL 목적지 우선·저장 목적지 fallback을 소비하고, 중간 저장/추가 필수 next에서는 보존하도록 onboarding/terms 두 source를 수정했다. 안전 URL 우선2건 포함11/11 GREEN. 기존 link fixture의 없는 /onboarding/sports·terms social 경로는 실제 /onboarding/sport·renewal로 맞췄다. 최신 committed-tree 영향 검증·독립 리뷰·동일 PR push가 다음 단계다.
- PR1888 cfb CI API integration1FAIL의 실제 원인은 새 rollback chat fixture의 target 전부 null→migration-only v1_chat_rooms_exactly_one_target_check(PG23514) 위반이었다. own sport/region/OTHER 소유 team을 만들고 room.teamId만 지정했다. caller ChatMessage sender Restrict와 실제409/proof/asset/identity/inquiry/audit rollback 단언은 보존했다. 새로운 root 소유 disposable postgres mdqa125-postgres-20261013-strict에서 현재 schema와 정본20260821000000 migration의 exact CHECK를 적용·pg_constraint 확인 후 실제HTTP3/3 PASS. 이는 full migration replay PASS가 아니며 이전P3018 실패는 역사로 유지한다. 최신CI의 full migration/integration 결과는 아직 대기다.
- origin/dev2c9cee4b4e(독립league PR1885 머지)를 localfd6cb62056으로 안전 통합했다. source/fixture/shared contract에 upstream overlap 없음. alpha 로그인은 E2E관리자 완료로 실제 확인했으며 이 계정은 완료된 계정이다. pending/deferred 연결 fixture·OTP·약관 최종동의 실제alpha 시나리오는 미검증이며 alpha PASS나 리포트 전체완료로 표현하지 않는다.
- Root latest review-fix checkpoint: frontend independent a2a804074 Warning1 verified with actual delayed auth/me responses after mutation had ended. Four new RED cases failed (missing pending feedback/action lock). Explicit shared terms-recovery pending now guards both actions and uses existing Button loading/disabled until success/final failure. All link28 + terms8 =36/36 GREEN. Backend exact a2a804074 review OK/FindingsNone and committed actual FK/HTTP3/3 PASS; backend unchanged by this UI review fix.
- Upstream PR1884 dev merge be354345a7c8344f6d498de190c411caa1fbbcd0 safely integrated without owned path overlap. Actual alpha login was completed by the user and E2E관리자 authenticated UI verified; pending/deferred account-link fixture scenarios and deployment of this change are still required, so no alpha PASS.
- Latest root checkpoint 2026-10-13: `origin/dev`29fd7fef7ca0f233838be08668f9e4ecbcada071 safely fast-forwarded with all 10 owned paths preserved; no overlap with upstream native startup changes. Code GREEN complete; immutable commit/review/PR publication next. Earlier records below are history.
- Frontend link28/28 and terms-recovery4/4 PASS. The first 30/32 result was a final-error observation timeout: the actual auth query retains initial request plus 3 retries. Regression tests preserve those 4 requests and only use zero retry delay, then assert final error/idle, unchanged required cache, one mutation and no terms navigation. Production retry behavior is unchanged.
- Real Postgres HTTP integration3/3 PASS: restrictive FK positive control, permitted asset transfer with metadata/holder profile preservation, and forbidden activity rollback including proof/identity/inquiries/assets. Narrow service unit46/46 PASS against latest dev. No mock substitutes for the FK evidence.
- Latest scoped Web lint/type/pattern PASS. API tsc PASS; Windows find.exe caused only the surface-check phase to fail, which passed on a child PATH with Git GNU find. Existing policy/baselines were preserved. Evidence: root run directory mdqa125-web-terms-green.log, mdqa125-api-green.log, mdqa125-api-unit-green.log, mdqa125-web-lint.log, mdqa125-api-lint.log and mdqa125-api-surface-gnu.log.
- Actual alpha login remains required. Migration replay failure below remains FAIL; the dedicated current-schema test DB is a separately recorded validation path. Disposable container cleanup follows committed-tree integration verification.
- Worktree C:/Users/kinso/.codex/worktrees/mdqa-125-link-followup/matchup-sports-platform; managed operation e50e0279-7779-4ba6-8589-8204096f9b10 completed/attached.
- Branch fix/mdqa-125-link-review-followup; base origin/dev552f5b6fb98d8546daf5e26f7de7a8ac413251f2 immediately fetched before creation.
- Phase: root 실제 RED 완료 후 GREEN 수정 중. 웹 초기31사례6FAIL 및 추가 URL-only1FAIL; 후자는 /teams/new로 이동해 필수 /onboarding/sports를 우회했다. 실제 Postgres3사례에서 FK positive control/금지 활동 rollback2PASS, 허용 uploader 연결200기대→409 SOCIAL_LINK_ACCOUNT_NOT_EMPTY1FAIL.
- DB evidence: root 소유 mdqa125-postgres-20261013 컨테이너(127.0.0.1:55432, public fixture 전용). blank migration replay는 20260831090000_android_privacy_policy_v12에서 P3018/23514 FAIL이며 통과로 표현하지 않는다. 별도 빈 ulw_v1_integration_mdqa125_schema에 현재 v1 schema db push PASS 후 기존 isolated-integration-environment가 만든 per-file clone에서 실제 HTTP/FK 검증.
- Runner evidence: Windows .codex rootDir glob 혼합 경로로0test 발견 및 최초 cold bootstrap15초timeout은 RED로 인정하지 않았다. root CLI 상대 integration glob과 bootstrap60초 제한으로 실제3사례를 실행했으며 repo Jest gate/ignore 목록은 수정하지 않았다.
- 첫 웹 GREEN32중30PASS/2FAIL은 authMe503 최종 오류의 미관측 실패로 보존하고 조사 중이다.
- Actual alpha session is expired, existing QA login question pending. No new PR/commit/dev merge/alpha PASS yet.

- 2026-10-13 11:28Z root: 최신 dev06a를 정상 merge한023266의 F6 독립 리뷰에서 URL에만 있는 복귀 주소가 약관 복구 refetch 전에 사라지는 실제 결함을 확인했다. 앞선2회 handler순서/CTA 테스트 준비 실패는 제품RED에서 제외하고 보존했다. 실제 TermsClient·프로필·sport/level/region/confirm을 모두 거친 회귀에서 최종/chat 기대→/home 실제1FAIL/8skip의 유효RED를 확인했다 (mdqa125-f6-full-consumer-destination-red1.log). 기존 bounded helper를 refetch 전에 사용하는 최소수정 뒤 기존8+신규1=9/9GREEN이었다 (mdqa125-f6-full-consumer-terms-recovery-green9.log). backend 미사용maskEmail import1행도 제거했다. 타입·새committedhead 독립 리뷰·PR1888 push·외부리뷰/CI·alpha·tracker 완료는 남아 있다.

- 2026-10-13 11:33Z root: committed93df272의 Web lint는 account-proof fixture의 displayName:null과 실제 AuthService/V1AuthMe의 필수 string 계약 불일치(TS2322)로 FAIL이었다. 닉네임과 같은 displayName 문자열로 fixture1행만 맞췄고 실제 계정증명 소비자16/16 GREEN (mdqa125-account-proof-api-profile-contract-green16.log). API/types를 넓히지 않았다. 이 실제 타입 실패와 새커밋/재검증을 별도로 추적한다.

- 2026-10-13T11:51Z root checkpoint: F6 실제 전체 약관→필수 온보딩 consumer에서 원래 목적지 /chat 대신 /home 도착 RED1을 확인하고 9/9 GREEN으로 수정했다. account-proof API 표시명 fixture 계약은 16/16 PASS다. committed bd3fb59의 API/Web tsc 각각 PASS, 동일 정본 GNU pattern/surface gate 각각 PASS(677 API paths)다. Windows find.exe wrapper 실패와 이전 93 타입 실패는 로그로 보존하며 원 명령 전체 PASS로 치환하지 않는다.
- API 13/13·frontend 28/28 immutable bd3fb59 독립 보안/적대적 소스 리뷰 C0/W0. 최신 dev79d1744c8의 SEO15 paths를 normal merge f5b9a492f9897cd047f46ef3c1ab7672d576fa98로 보존했다. auth 소유 소스와 검증 blob은 bd3와 동일하며 새 최종 commit identity 독립 검수·PR1888 push/current-head 외부 리뷰·CI·dev 머지·실제 alpha는 계속 남아 있다. 실제 Android/iOS/alpha PASS나 리포트 종료를 주장하지 않는다.
