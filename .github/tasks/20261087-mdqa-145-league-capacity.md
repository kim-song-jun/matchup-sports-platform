# MD-QA #145: 정규 리그의 선택적 참가 정원

Status: In Progress
**Owner**: QA root -> Phase A dedicated backend investigation
**Created**: 2026-10-15

## Context
기존 리포트 https://teameet.jmandu.kr/issues/145/ . 원 리포트의 NEEDS_DECISION은 최신 직접 사용자 선택으로 대체됐다. 현재 김성준 담당·확인 중이며 중복 task/worktree/branch/PR이 없음을 SSOT와 실제 Git ref에서 대조했다.

## Goal
사용자 선택 C: 참가팀 정원과 팀당 선수 정원을 구분한다. 최신 maxPlayers 재사용 지시는 기존 팀당 선수 정원 의미를 보존하여 적용한다. 참가팀 정원을 maxPlayers에 덮어쓰거나 템플릿 팀 수·실제 등록 팀 수를 정원으로 간주하지 않는다.

## Original Conditions
- [x] 최신 승인된 선택 적용; 재질문하지 않는다.
- [x] fetch origin/dev 직후 managed create_worktree ref=origin/dev, base d77f8e3176ffa03ad39a32f0f6a04c19e7a75bcb, 전용 feature branch.
- [ ] 실제 결함/계약을 v1에서 확정하고 최소 수정·실제 RED→GREEN·독립 리뷰·dev PR·기존 리포트 댓글을 완료한다.

## User Scenarios
nullable/미설정 무제한, 신청·확정·대기와 현재 점유 수·동시 접수 계약을 현재 v1 registration-capacity 및 서비스에서 검증한다. 기존 등록보다 낮은 정원 변경은 가짜 성공 없이 기존 정책에 맞게 거부한다. 팀당 선수 제한은 별개 의미로 유지한다.

## Test Scenarios
- 실제 소비자/서비스·권한·동시성·실패 경계의 좁은 회귀. 고정 성공 mock이나 반환값만 일치하는 검증 금지.
- 기존 제출·경기 이력·참가 등록 및 다른 종목 회귀를 보존한다.
- API 계약 변경 시 docs/api·frontend hooks/types/MSW를 같은 변경에서 맞춘다.

## Parallel Work Breakdown
Phase A dedicated read-only v1 discovery: 실제 관련 소스·테스트·기존 fallback/정원 엔진, 기존 구현/머지 중복, 가장 작은 Owned files와 RED 계획을 반환한다. 이 단계 source/Git/tests/browser/SSOT 변경 금지. Phase B 단일 공유 계약 owner가 테스트를 준비하고 root가 실제 RED를 실행한 뒤 최소 수정. Phase C 필요한 UI는 승인된 의미와 DESIGN 토큰을 따른다. root가 task/Changeset/Git/PR/직렬 검증/alpha/댓글을 소유한다. 별도 reviewer가 구현 후 적대적 검증한다. 다른 에이전트의 변경을 되돌리지 않는다.

## Acceptance Criteria
- [ ] 사용자 선택 C: 참가팀 정원과 팀당 선수 정원을 구분한다. 기존 maxPlayers는 팀당 선수 정원으로 재사용하며 의미를 바꾸지 않는다. 참가팀 정원은 별도 nullable 계약으로 조사하고 템플릿 팀 수와 혼동하지 않는다.
- [ ] nullable/미설정 무제한, 신청·확정·대기와 현재 점유 수·동시 접수 계약을 현재 v1 registration-capacity 및 서비스에서 검증한다. 기존 등록보다 낮은 정원 변경은 가짜 성공 없이 기존 정책에 맞게 거부한다. 팀당 선수 제한은 별개 의미로 유지한다.
- [ ] 최소 실제 회귀와 committed tree 검증, 최신 immutable head 독립 C0/W0.
- [ ] base dev PR·실제 CI/필수 규칙·스레드를 대조하고 alpha 배포 SHA에서 실제 검증한다.
- [ ] 실제 alpha를 수행하기 전 테스트/코드 검토를 alpha PASS로 대신하지 않는다.

## Tech Debt Resolved
Phase A 조사 후 범위 내 drift만 기록한다.

## Security Notes
권한·참가 자격·개인정보 경계를 넓히지 않고 실제 선수 개인정보/비밀을 읽거나 출력하지 않는다. main/production 승격과 destructive Git은 금지한다.

## Risks & Dependencies
기존 공유 파일은 단일 owner. root141의 작업트리와 별개이며 브라우저/검증 슬롯은 root만 사용한다. Managed 생성은 성공했으나 chat attachment100 제한으로 등록이 실패하여 동일 checkout만 보존·재등록한다. 중복 checkout을 만들지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-15 | root | 이전 요구사항 미확정 문구 | 최신 사용자 결정이 우선. 미정으로 재분류하지 않음 |

## Progress Snapshot
- 2026-10-15 root: 실제 unit 초기53건에서30 FAIL / 23 PASS(전체229건 중176 skipped),24.218s를 확인했다. 현재 DTO whitelist·정원 helper·신청/확정/설정 저장의 실제 실패이며 컴파일 오류를 RED로 대신하지 않았다. 원 로그 mdqa145-capacity-red.log를 보존한다.
- 2026-10-15 root: 단일 backend owner가 nullable maxTeams(no default/backfill), 실제 reserved 상태 전체·모든 유입 경로의 행 잠금/재검사·점유 이하 축소 금지를 구현 중이다. 기존 maxPlayers 선수 정원은 유지한다. 실제 HTTP/PostgreSQL 경합7건은 준비됐으나 Docker daemon OFF로 NOTRUN이다. schema 생성/테스트는 root 전용 의존성·직렬 슬롯에서만 실행한다.
- 2026-10-15 root: canonical task와 동일 전용 checkout/feature branch를 확정했다. Phase A 조사 중. 구현/RED/GREEN/PR/alpha NOTRUN. 전역 SSOT는 원 checkout tmp/qa/mdqa-assigned-monitor/state.json.


- 2026-10-15 root checkpoint: C1/C2 actual stale cancellation RED6, C3 actual confirm/waitlist cancellation and idempotence RED6, explicit transaction admin client RED6, SQL capacity binding RED1 confirmed. Minimal fixes frozen; latest dev integration and committed validation pending. API PostgreSQL capacity10 plus list-order4 are NOTRUN (Docker OFF); no alpha PASS or PR-ready claim. UI new39 passed, legacy fixture4 corrected awaiting rerun.

- 2026-10-15 root committed gate: source43e3b7e73 + latest dev1b normal merge bc43d807c + fixture/docs88952165d + required consumer fixtures8a47e7018. API initial committed16 specs460 PASS/2 legacy fixture FAIL; corrected same full spec81/81 PASS16.338s, unchanged15 spec blobs reuse. UI8 files167/167 PASS201.25s; changed server-error2/2 PASS5.29s. API tsc PASS; final Web tsc PASS after exact5 missing required response fixtures; canonical v1 pattern PASS; diff-check/debt0, no untracked source imports. Independent backend33/33 + contract docs4/4 C0/W0; frontend cumulative28/28 C0/W0. Actual PostgreSQL capacity10/list-order4 remain NOTRUN locally (Docker OFF), remote CI pending PR; actual alpha and screenshot gallery NOTRUN. Existing IAB authenticated but focus/input timeout is recorded separately; no false alpha PASS.

- 2026-10-15 PR1936 API CI38759845177 failed actual surface gate: raw SQL32/baseline29; new necessary canonical row locks in league admission1 and admin registration3 were not registered. Independently reviewed exact baseline SHA256 bac488fb9e22057d3a667156a0a2edd80e1967334a090701f126eeb1e243226e C0/W0: raw results discarded, kind/auth/status/CAS rechecks preserved; checker/all other baselines unchanged. Register these3 exact locks with why under existing checker contract; actual committed checker and too-low/too-high baseline negative controls run next. Earlier CI failure is not hidden or relabeled PASS; dependent Task9 artifact missing because API stopped before that stage.

- 2026-10-15 root follow-up: baseline a62d committed surface683/raw32/32 PASS, admin2/4 negative controls both rejected. Subsequent real GitHub P2s public/next-round full-cap flag, full draft list rank, saved nonreserving draft resume were confirmed as7FAIL/4controls, corrected d2aea and full3spec106/106PASS36.557s. Future-deadline capacity copy actualRED8/controls4 then full2UI94/94PASS8.95s atc995. API/Web tsc8097 PASS; existing v1 pattern and surface gate PASS after normal dev57c6097 mergeec83fbf7314841c9f964f3cb48c55f94fc18210f. Dev drift affects only6release/docs/package metadata paths; reviewed app source/test blobs unchanged, so prior type/unit evidence reused without another full suite.
- 2026-10-15 root release gate: olda62d Gates38762720013 genuinely failed2/7 final-schema-binding checks because4 release/deploy pins still referenced pre-maxTeams schema. Exact current LF schema d54fe0c8c3415eabd9a363277afc8c5b20ff14a8bbae1c04fc943c1ba50df8b3 is now bound consistently; historical allowlist/M11/checksum/client equality and all7 test methods unchanged. Independentinfra4/4 C0W0. Local immutable5blob LF extraction verified, but Windows Python/GitBash runner had path/temp WinError32 failures; NOTPASS, Linux CI must verify. No gate weakening, history edits, or fake success. Existing SQL baseline reason/count unchanged.
- 2026-10-15 root final source re-review: backend3actualP2s and docsW4 closed, frontend32/32 C0W0, infra4/4 C0W0; latest PR head formal review/CI after push still required. Actual PG capacity10+list-order4 localNOTRUN, alpha390/768/1440 and tracker comment/images blocked by existing IAB input timeout. Full diff75files, diffcheck/newdebt/untracked-app paths0. Existing PR1936 remains same branch; no duplicate PR, no dev merge, no completion/attachment deletion.

- 2026-10-15 root CI follow-up: remote head332fafa API and Web jobs both SUCCESS. Gates38767315128 genuinely failed the expand/contract checker on the new maxTeams positive-or-NULL CHECK; the prior final-schema-binding regression is now actual Linux CI7/7PASS. The failure is preserved separately from the earlier Windows runner limitation.
- 2026-10-15 root exact reviewed migration registration: commit9eb12dc4915c4340a3890f297300621883d40c1e adds one file+exact-statement+reason entry to the existing REVIEWED_NON_ADDITIVE mechanism. SQL, migration history, checker logic, tests and other entries are unchanged. This is an explicit reviewed exception: the new nullable INTEGER column has no DEFAULT/NOT NULL/backfill; old rows and old-app writes retain NULL and pass; NULL stays unlimited, positive values pass, direct SQL zero/negative remain rejected. Independent infra review cumulative5/5 C0/W0.
- 2026-10-15 root committed migration gate: existing self-test passed allowlist integrity, negative controls, base resolution and base failure diagnostics; actual base57c6097da743d48095103be688e3db08993127dc -> head9eb12dc4915c4340a3890f297300621883d40c1e passed. Logs mdqa145-9eb-expand-selftest.log and mdqa145-9eb-expand-green.log are under the own QA evidence directory. Full diff76files. Fresh PR head formal review and CI remain required after push; no merge/alpha PASS or tracker comment success is claimed.
