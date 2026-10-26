# Task 20261109: MD-QA #135 staff subscription subject

Status: Review
**Owner**: Codex backend Wave A; root owns integration and subsequent frontend Wave B
**Created**: 2026-10-27

## Context
MD-QA #135 identifies a mismatch between the tournament-wide assignment version sent by the frontend Socket.IO client and the specific assignment version selected by the server for a game. The authenticated `GET /games/:gameId` response already authorizes the active game, but does not return the realtime subject version needed by the client. Existing socket handshake equality and current server access checks are security boundaries and must remain strict.

## Goal
Return the server-selected realtime authorization version with the authorized game detail and make the shared API contract/documentation/test expectations accurately represent it, so the frontend can wait for that exact game's authorization before connecting.

## Original Conditions (must all be satisfied)
- [ ] The existing authenticated game detail GET returns a discriminated realtime authorization state selected from current server authorization.
- [ ] Staff subject version is selected by the same canonical staff-access service used by the realtime gateway, with deterministic selection when multiple assignments qualify.
- [ ] Platform operations, ordinary unscoped/team actors, and actors with no realtime authorization are explicit; authorization lookup errors never silently become version 0.
- [ ] Gateway exact version equality, revocation, expiry, game binding, and lease checks remain strict.
- [ ] Existing read access and write roles are preserved. The response field does not grant a new permission.
- [ ] Types, real API response expectations, MSW handlers, API domain docs, and Changeset are synchronized.
- [ ] Real API GET/authorization contract tests prove repeated assignment ordering selects the same subject that the gateway accepts; revoked, expired, and wrong-game actors remain denied.
- [ ] A frontend consumer actual-hook/socket regression can use this contract in the next wave.

## User Scenarios
### Scenario 1: Assigned game operator
As a tournament operator, I want the game detail response to identify the current server-selected realtime version so that my game subscription uses the same authority the server checks.

Steps:
1. Request the existing authenticated game detail route for an assigned fixture.
2. Read its realtime authorization discriminant and subject version.
3. Connect with that value and subscribe to the same game.

Expected result: The current assignment is accepted; the server still rechecks current fixture/field scope and expiry when the socket subscribes.

### Scenario 2: Ordinary team reader or unsupported realtime actor
As an actor who can read a game through an existing non-staff path, I want the response to state that it has no realtime staff subject.

Steps:
1. Request a game detail the actor is already allowed to read.
2. Receive `unscoped` or `unavailable` as appropriate.

Expected result: Read access remains unchanged and no new socket or write authority is granted.

## Test Scenarios
### Happy path
- [ ] GET response selects the same stable eligible staff principal as the gateway when at least two valid assignments cover the fixture.
- [ ] Platform operations gets explicit bypass state; ordinary team actor gets explicit unscoped state.
### Edge cases
- [ ] Reverse DB return order and prove selected principal/version remains stable.
- [ ] Game-specific fixture/field mismatch does not select another game's assignment.
- [ ] Read actor without supported realtime scope receives explicit unavailable state.
### Error paths
- [ ] Revoked, expired, and wrong-game staff assignment cannot produce a usable staff subject or pass gateway subscription.
- [ ] Existing gateway stale subject/version denial remains.
- [ ] Staff authorization lookup failure propagates as an actual error, not version 0 or a successful unscoped response.
### Mock data updates needed
- [ ] Update real GET response fixtures and integration expected objects.
- [ ] Update frontend V1Game/API types and MSW game detail responses.
- [ ] Keep test assertions about response and authorization outcome, not mock call counts.

## Parallel Work Breakdown
### Backend Wave A (current)
- [ ] RED first: add a focused real GET/service response contract regression that fails because `realtimeAuthorization` is missing.
- [ ] Add discriminated response contract to existing authorized `GET /games/:gameId`, sourcing staff subject through `TournamentStaffAccessService.assertAccess(read, game scope)`.
- [ ] Stabilize staff assignment selection order and align `GamesService.resolveActor(read)` where it otherwise selects a different actor role.
- [ ] Keep existing Gateway strict source unchanged; add only tests to `realtime.gateway.spec.ts` covering agreement / denial.
- [ ] Add CI-only real database integration cases for return-order stability, principal agreement, revoked/expired/wrong-game boundaries.
- [ ] Update direct `GamesService` test constructors to provide the required real service dependency; do not add optional constructor fallback.
- [ ] Sync types, MSW, API docs, response fixtures and Changeset.
- [ ] Send root the completed full API contract before frontend Wave B.

### Frontend / integration (root coordinates after Wave A)
- [ ] Frontend hook, singleton and operate-console consumer updates are reserved for Wave B.
- [ ] Root coordinates the actual hook/socket RED→GREEN and integration with this API contract.
- [ ] Root coordinates final lint/build/review/PR and Alpha runtime verification.

## Acceptance Criteria
- [ ] Original conditions and both user scenarios are satisfied.
- [ ] Narrow backend RED→GREEN evidence is recorded.
- [ ] CI-only DB contract tests cover assignment order, Gateway agreement, revoke, expiry, wrong-game.
- [ ] API docs/types/MSW/fixtures/Changeset are synchronized.
- [ ] No Gateway policy weakening, optional dependency fallback, test fake, or unrelated scope.
- [ ] Owned changed-file list and diff checks are recorded; no commit/push by Wave A.
- [ ] Code review: Critical=0, Warning=0.

## Tech Debt Resolved
- Remove the global-max assignment-version source as authority for the game realtime handshake once frontend consumes this server-authored game detail field.
- Make multiple eligible staff-row selection deterministic and aligned across REST and Socket.IO authorization.

## Security Notes
- Do not expose or parse the internal authorization subject string.
- The staff version is a hint for the next handshake only. The Gateway must continue to re-authorize the current game, check exact subject version, and enforce expiry/revocation/lease/game binding.
- Unknown or failed authorization lookup must be an explicit error path.
- Existing read actors retain only their current read access.

## Risks & Dependencies
- The selected staff principal must match the Gateway's selection exactly; shared service and stable ordering are required.
- `GamesService` has many direct test constructors. Add the dependency explicitly to affected constructors rather than making it optional.
- Local integration DB/build/full lint are not part of this wave; database contract cases are added for CI.
- Frontend consumers are blocked until the complete API response/type/docs contract is ready.
- User policy ambiguity: none identified. Mechanical implementation choices should follow current API and realtime authorization contracts.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-27 | Root / Sol source review | Should clients independently choose among multiple assignment versions? | No. The API returns the server-selected subject version using the canonical access service and deterministic row ordering. |
| 2026-10-27 | Wave A | How to represent existing read actors lacking realtime authority? | Use explicit `unscoped` or `unavailable` discriminants; never use an absent field or silently map lookup failure to 0. |

## Progress Snapshot
- 2026-10-27: Wave A assigned on fresh dev base `88671d084b354125ae55033e64552d04c501bbdf`, branch `codex/mdqa-135-staff-subject-20261027`. Source contract review completed by Sol; no user policy choice required.
- 2026-10-27: Added required server-authored `realtimeAuthorization` to the existing game detail response, with staff assignment selection delegated to `TournamentStaffAccessService`; both actor and staff assignment queries use stable `createdAt,id` ordering. The gateway source is unchanged.
- 2026-10-27: Shared API contract is frozen for Wave B: `GameDetail.realtimeAuthorization` and detail-only `V1Game.realtimeAuthorization` use `GameRealtimeAuthorization` from `apps/v1_web/src/types/game-operations.ts`; MSW game-detail responses use explicit `unscoped` state. API domain docs and Changeset are synchronized.
- 2026-10-27: Valid narrow RED→GREEN evidence is in `/Users/sungjun/.cache/mdqa-loop/ticks/20261027-0551-source135-wavea/evidence.json` with raw logs alongside it. RED reached the real GET response assertion and failed only because the field was missing; GREEN passed 1 suite / 1 test. Prior compile/setup attempts are excluded from RED evidence.
- 2026-10-27: Root's DI agent updated all 75 other owned constructor-call files (81 calls); combined with this wave's actual GET spec, AST inventory confirms 82/82 constructor calls have the required dependency. The DI agent's changes are preserved and not edited here.
- 2026-10-27: Added CI-only integration coverage to the existing actor matrix for multiple qualifying assignments, asserting GET's server-selected version matches the canonical access principal; added explicit platform-ops/unscoped response controls and GET denial controls for revoked, expired, and cross-fixture assignments. Integration DB tests were not run locally.
- 2026-10-27: Final Wave A cleanup removed unrelated relation fields from the game-detail select/type, corrected the constructor comment to show the staff-access service is required, and localized the new denial-path comment. The focused GET unit now covers the staff assignment, platform-ops state, authorized team reader without realtime staff authority, and explicit unscoped state. Final serial run passed 4/4; run/PID evidence is in the Wave A tick folder. No API/Web lint/typecheck or DB integration run was performed; root owns final coordinated checks.


## Progress Snapshot — 2026-10-27 / tick 0551

- 서버 상세 응답 계약과 결정적 배정 선택을 구현했고 실제 GET RED 후 최종 단위 테스트 4/4가 통과했어요.
- 프론트 hook/socket 소비자 RED 후 7/7, 직접 영향 테스트 18파일·64건이 직렬 통과했어요.
- 필수 staff 서비스의 직접 생성 호출 82/82를 명시적으로 맞췄고, 기존 75개 spec/fixture 파일의 변경은 의존성 주입과 import에 한정했어요.
- 공유 생성 타입이 오래된 환경 문제는 이 작업트리의 격리된 client 출력으로 해결했고 공유 client 지문은 유지됐어요. 초기 compile/fixture/setup 실패는 유효 RED로 세지 않아요.
- [x] 최종 API/Web 타입·패턴 검사와 독립 Sol 리뷰
- [ ] 게시된 현재 head의 CI·DB 통합 검증 및 정식 리뷰
- [ ] dev 머지·Alpha 포함 확인과 실제 승인 스태프의 버전·연결 경로 QA

실제 런타임·DB 통합은 아직 검증하지 않았어요. UI 배치·새 사용자 정책은 바꾸지 않고 기존 권한 경계를 유지해요.

### 독립 리뷰 R1과 보완

- 독립 Sol R1은 Critical 0·Warning 2였어요. 연결 중 이전 auth를 캡처한 소켓의 버전 갱신과 오래된 전역 최대 버전 문서가 지적됐어요.
- 지연 연결 RED를 확인하고 활성 연결 시도를 최신 버전으로 다시 열도록 고쳤어요. 비활성 소켓은 연결하지 않아요. 보완 후 auth 소비자 9/9, 기간 만료 회귀 13/13이 통과했어요.
- API 타입·표면 검사는 통과했어요. Web 타입 검사에서 발견한 누락 fixture와 중복 타입 비교도 보완했고 최종 검사를 다시 진행해요.
- 실제 Gateway/DB 통합 CI와 Alpha의 스태프 버전 흐름은 계속 미검증이에요.

### 최종 로컬 검수

독립 Sol R2는 Critical 0·Warning 0이고, 검토한 111개 파일의 해시는 검토 전후 일치했어요. API 타입·표면 검사와 보완 후 Web 타입·패턴 검사도 실제 exit 0이에요. 이 상태 기록만 root가 마지막으로 갱신했고 제품 소스는 검토 뒤 바꾸지 않았어요. 현재 head의 CI·DB 통합과 Alpha 실제 스태프 경로는 게시 뒤 확인해야 해요.


## Progress Snapshot — 2026-10-27 / tick 0711

- 게시된 head2f38의 API CI에서 6묶음·51테스트가 실패했어요. 직접 생성 호출만 확인한 이전 인벤토리가 Nest 테스트 모듈의 필수 서비스 등록을 놓쳤고, 4개 spec과 공유 fixture1개의 실제 provider를 보완했어요. 같은6묶음 RED를 확인한 뒤 직렬 GREEN55/55를 확인했어요. 운영 서비스·Gateway 권한은 바꾸지 않았어요.
- 새 CODE P2 지적은 유효했어요. 경기A의 snapshot·events를 받은 뒤 경기B의 인증이 pending/error/unavailable일 때 이전 정보를 지우지 못하는3개 실제 소비자 RED를 확인했어요. 경기전환 초기화 효과를 인증 준비 조건과 분리했고 기존9대조군을 포함한12/12가 통과했어요. 준비 전 연결·구독·takeover를 허용하지 않아요.
- 현재 보완분의 별도 Sol 소스 검토와 root 최종 타입·패턴 검사, 새 커밋 게시 후 CI·DB통합·CODE/Copilot 리뷰는 아직 진행 전이에요. 이전 head의 local READY·Web 성공을 새 head 증거로 대신하지 않아요.
- Alpha135와 승인된 실제 스태프의 연결·구독은 계속 미검증이에요. 다른 이슈의 PARTIAL 선택과 업무 데이터 쓰기 금지를 유지해요.
