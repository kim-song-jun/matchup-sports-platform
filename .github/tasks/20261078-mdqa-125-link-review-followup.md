# Task 20261078: MD-QA #125 계정 연결 후속 리뷰 결함 수정

Status: In Progress
**Owner**: root integration / backend-data-dev / frontend-ui-dev
**Created**: 2026-10-13

## Context
기존 https://teameet.jmandu.kr/issues/125/ 는 김성준 담당 확인 중이다. 원 PR1835는 dev MERGED지만 최신 원 head의 실제 리뷰 4건이 현재 dev552f에도 남아 있고 PR1837로 해결되지 않았다. 기존 task71/73는 원 수정·네이티브 릴리스 이력이며 본 문서는 그 4건의 후속 커서다. 다른 담당의 Maps/timer/native 릴리스 작업을 변경하지 않는다.

## Goal
가입 계정 연결의 원래 목적지, 약관 복구 auth cache, 업로드 소유권을 보존하고 현재 API 문서를 맞춘 dev PR을 검증·독립 리뷰·기존 리포트 댓글까지 게시한다. 실제 alpha와 dev 머지는 별도 증거로 추적한다.

## Original Conditions (must all be satisfied)
- [ ] required 가입 모드에서 연결 성공 후 안전한 저장 redirect를 소비한다. holder의 미완료 필수 단계는 우회하지 않는다.
- [ ] defer/complete TERMS_REQUIRED 오류 이후 서버가 변경한 auth/me를 갱신해 약관 화면이 signup gate에 되돌아가지 않는다.
- [ ] deferred caller가 보유한 허용된 업로드는 같은 transaction에서 holder로 이관하고 storage/URL/holder 프로필을 보존한다.
- [ ] auth 문서 표·상세 caller 조건과 retained data 이관을 실제 서비스 계약과 맞춘다.

## User Scenarios
1. required 계정이 /teams/new로 가던 중 번호 충돌 → 기존 계정 연결 → 필수 holder 단계 충족 후 /teams/new 이동, 저장 redirect 제거.
2. fresh required cache에서 defer 또는 완료를 요청했으나 서버가 terms_required로 변경 → 400 TERMS_REQUIRED → 현재 auth/me 반영 → 약관 화면 유지.
3. deferred 계정이 avatar 등 허용된 asset 업로드 후 verified holder 연결 → owner 변경·asset 보존·caller 삭제·holder 프로필 보존.

## Test Scenarios
### Happy path
- [ ] 기존 deferred/required 연결과 onboarding gate 검증을 보존한다.
### Edge cases
- [ ] 실제 consumer + QueryClient/MSW로 저장 redirect 소비와 holder 필수 단계 우선순위 검증.
- [ ] actual DB Restrict FK에서 업로드 이관 성공과 rollback 검증(전용 disposable fixture만).
### Error paths
- [ ] defer/complete 두 TERMS_REQUIRED 경로가 실제 auth/me 재조회 후 회복된다.
- [ ] proof/충돌/소유권 권한 게이트를 우회하지 않는다.
### Mock data updates needed
- [ ] 실제 DB fixture와 관련 좁은 unit/MSW 응답을 계약과 맞춘다. shared hooks/types/MSW는 root 사전 소유권 승인 없이 수정하지 않는다.

## Parallel Work Breakdown
### Backend phase B1 — backend-data-dev
Owned: apps/v1_api/src/auth/auth.service.ts, 가장 좁은 auth service/integration test 및 해당 fixture, docs/api/domains/auth.md.
Forbidden: frontend, schema/DTO/shared auth policy, task71/73, secrets, state, git mutations. schema 변경은 필요 없음.
### Frontend phase F1 — frontend-ui-dev
Owned: apps/v1_web/src/components/auth/social-signup-client.tsx, 관련 실제 consumer regression tests. social-link-flow.tsx는 필요시 root와 소유권 확인 후.
Forbidden: shared hooks/types/MSW, API/schema, task71/73, secrets, state, git mutations. 기존 화면/문구/토큰을 유지하는 흐름 결함 수정이며 새 시각 디자인은 없다.
### Sequential — root
Owned: 본 문서, Changeset, test execution/preflight, integration/review, explicit-path commit/push/dev PR, review replies, existing tracker comment, SSOT. workers는 혼자가 아니므로 타인 변경을 원복하지 않는다. 테스트/commit/push는 worker 금지; root가 좁게 직렬 실행한다.

## Acceptance Criteria
- [ ] 위 original conditions 및 의미 있는 RED → GREEN, 범위 lint/typecheck.
- [ ] Critical0 / Warning0 latest exact head independent review.
- [ ] fixture/docs/Changeset sync, no new debt markers, committed-tree scope/import proof.
- [ ] dev PR와 기존 #125 저장 댓글의 실제 표시 확인.
- [ ] 실제 alpha는 serving SHA/persona/viewport/원 시나리오를 증명한 경우에만 PASS, 미검증은 pending.

## Tech Debt Resolved
성공 경로만 invalidation되는 서버 상태 전환 복구, required link redirect 소비 누락, 보존 asset의 Restrict FK 누락, API 문서 상세 drift.

## Security Notes
holder identity/proof/완료된 계정의 필수 단계와 기존 destructive account-link gate를 보존한다. 계정 삭제 시 실제 소유 자산을 orphan하거나 잃지 않는다. 운영 사용자/secret/.env 읽기 금지. 전용 테스트 fixture만 사용한다.

## Risks & Dependencies
원 PR1835 merge2dc2e697b816a87275c7a3383c037a5433f5e373; original head44b0ef369731bb99c9e7475ff9a2819d08102065. 실제 리뷰 thread suffix K ef/eh/ej/ek 및 상세는 root artifact current-active-review-threads.json. DB/runtime 제한은 정확히 기록하며 mock 통과로 FK 검증을 대체하지 않는다. 완료는 첨부 영구 삭제이므로 action-time 인간 확인 전 실행하지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-13 | root independent review | 후속1837/실제 담당이 4건을 해결했는가? | dev552f 기준 4건 모두 남음. Maps/timer/native 진행 근거는 있으나 이 4건의 담당 진행 근거 없음. 후속 범위만 분리. |

## Progress Snapshot
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
