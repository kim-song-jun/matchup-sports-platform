# Task 22 — 대회 결과 검토·officialization·정정·void (구현 검증 보고서)

> **문서 성격 정정 (2026-08-04).** 이 문서는 원래 "Task 22 기술 설계서"로 착수했으나, 착수
> 직후 실측에서 **Task 22 백엔드가 이미 완전히 구현·머지·테스트되어 있음**이 확인되어 용도를
> **설계서 → 검증(대조) 보고서**로 전환했다. 새 설계·재구현 계획은 담지 않는다. 이 문서가
> 답하는 질문은 "무엇을 새로 만들지"가 아니라 **"이미 있는 것이 스펙을 충족하는가, 안 하면
> 정확히 무엇이 빠졌는가"**다.

---

## Context

- 상위 태스크: `.github/tasks/127-v1-team-tournament-operations-game-record.md` (27개 서브태스크로 구성된 v1 팀·대회 운영 기능).
- 원문 스펙: `.omo/plans/teameet-team-tournament-operations-v1.md` 545–551행 (`- [ ] 22. Implement tournament result review, officialization, corrections, and next-fixture safety`). **메인 체크아웃에만 존재하며 worktree엔 `.omo/`가 없다.**
- 워크트리: `.claude/worktrees/task-27`, 브랜치 `codex/teameet-task27-release-gates`.

### 착수 전제와 실측의 불일치

착수 시 전달받은 전제는 "Task 22·23 미구현, F3 QA 게이트 7번째 여정(E2E-CORR-01)이 그 부재로 막혀 있음"이었다. **코드 실측 결과 이 전제는 거짓이다.**

| 실측 대상 | 결과 |
|---|---|
| `apps/v1_api/src/tournament-operations/results/tournament-result-review.controller.ts` | 존재 (84줄). 스펙이 요구한 엔드포인트 **5개 전부** 선언 |
| `.../tournament-result-review.service.ts` | 존재 (1072줄). 5개 커맨드 + 공통 커맨드 경계(`withResultCommand`) 구현 |
| `.../tournament-result-review.dto.ts` | 존재 (165줄). 5개 DTO + 중첩 `changes` DTO |
| `apps/v1_api/src/tournaments/tournaments.module.ts` | 41–42행 import, 88행 `controllers`, 110행 `providers` 등록 완료 |
| `apps/v1_api/test/tournaments/tournament-officialize.integration-spec.ts` | 존재 (629줄, 9 테스트). 격리 DB(`ulw_v1_integration_task27`)에서 **9/9 통과** (오케스트레이터 실측) |
| 구현 커밋 | `8f9b2ee7` (feat) + 후속 fix 3건(`87687a73`, `2172bb91`, `67c1647f`). 전부 HEAD의 조상 (`git merge-base --is-ancestor 8f9b2ee7 HEAD` → YES) |
| 원격 브랜치 | `origin/codex/teameet-task22-result-review` |
| 계약 문서 | `docs/api/domains/tournament-operations.md` 217–261행에 5개 라우트·에러코드 표 완비 |

**결론: `.omo/plans/…v1.md`의 `[ ] 22.` 체크박스는 문서 드리프트다.** 코드는 있는데 OMO
게이트 영수증(V22)이 발급되지 않아 체크박스만 미갱신 상태로 남았다. F3의 E2E-CORR-01 차단
사유를 "기능 미구현"으로 적은 태스크 127 문서(1119–1142행)의 결론도 같은 드리프트에 근거한
오판이며, **정정 대상**이다 — 실제 차단 요인은 기능 부재가 아니라 `DIRECTOR_OFFICIALIZE`
전환에 필요한 게이트 증거 번들(V7/V22/V23 영수증) 부재다.

> **Task 23(프론트엔드)**: `apps/v1_web/src/app/tournament-ops/tournaments/[id]/result-review/`,
> `.../records/corrections/`, `apps/v1_web/src/components/tournament-result-review/*`(8 파일),
> `apps/v1_web/src/hooks/use-tournament-result-review.ts`가 **유사하게 이미 존재하는 것으로
> 보이나 별도 검증 중**이다. 작업 중복 방지를 위해 이 보고서에서는 더 파고들지 않는다.

---

## Goal

원문 스펙의 **Acceptance Criteria 9항목**과 **QA scenarios 21항목**을 실제 코드/테스트와
1:1 대조하여, ① 충족 지점(파일:행)을 박제하고 ② 진짜로 빠진 조각을 gap으로 확정한다.

---

## Original Conditions (스펙 원문 체크박스)

스펙 "What to do" 문장이 요구한 구현 요소:

- [x] literal reject / request-supplement 엔드포인트
- [x] officialize 엔드포인트
- [x] correction 엔드포인트
- [x] official-void 엔드포인트
- [x] expected version / idempotency
- [x] actor audit
- [x] SLA cleanup
- [~] **visibility cleanup** — 명시적 `V1GameVisibilityPolicy` 조작 없음. void 시 공개 캐시 은닉은 async 워커(`GameResultVoidProjectionService.hidePublicCache`)가 수행. → Ambiguity A-2
- [x] transactional outbox
- [x] **next-fixture** conflict detection (`NEXT_FIXTURE_CONFLICT`)
- [N/A] **ranking(standings) conflict detection** — 코드 부재였으나, 2026-08-05 조사로 **구현 대상 자체가 없음 확정**(G-1). `STANDINGS_CONFLICT`/`TIE_BREAK_CONFLICT`/`RANKING_CONFLICT` 어느 식별자도 여전히 0건이며 앞으로도 추가하지 않는다 — 그룹 순위를 하류에서 소비하는 코드 경로가 존재하지 않아 막을 대상이 없다
- [x] projection preview (`projectionPreviewHash`)
- [x] initial officialize/void scope = `platform_ops`, 감사된 플래그가 `tournament_director`를 개방
- [x] 모든 result action이 idempotent + append-only

---

## User Scenarios (구현된 실제 흐름)

1. **정상 대회 경기 종료** — 운영자가 `POST /games/:gameId/commands/end` → `GamesService.deriveTournamentRevision()`이 이벤트 스트림에서 점수를 파생해 revision 1을 **DRAFT를 거치지 않고 곧바로 SUBMITTED**로 만든다. 대회 게임에 대한 수동 draft 생성 경로(`POST :gameId/result-revisions`)는 `409 TOURNAMENT_RESULT_DERIVED_ONLY`로 차단된다.
2. **반려/보완요청** — 검토자가 `POST .../review-decision` (`decision: reject | request_supplement`) → 리비전이 터미널 상태로 고정되고, 해당 리비전의 review SLA(리마인더/에스컬레이션)가 같은 트랜잭션에서 CLOSED 처리된다.
3. **재제출** — `POST .../supersede-and-submit` → REJECTED/SUPPLEMENT_REQUESTED 베이스를 supersede하는 후속 리비전이 **생성+제출이 원자적으로** 이뤄지고, 새 24h/48h SLA가 시작된다.
4. **공식화** — `POST .../officialize` (`projectionPreviewHash` 확인 필수) → 리비전 OFFICIAL, `V1Game.currentOfficialRevisionId` 스왑, fixture `status=completed`, `GAME_RESULT_OFFICIAL` 아웃박스 발행이 **전부 한 트랜잭션**.
5. **정정** — `POST /games/:gameId/corrections` → 현재 official을 supersede하는 DRAFT 생성(**포인터는 그대로**). 이후 별도 officialize 호출로 포인터가 원자 스왑된다.
6. **무효화** — `POST .../void` → 불변 VOID 리비전을 append하고 포인터를 그쪽으로 옮긴다. 하류 브래킷 fixture가 `scheduled`를 벗어났으면 포인터 스왑 **전에** `409 NEXT_FIXTURE_CONFLICT`.

---

## Acceptance Criteria 대조표 (9항목)

| # | 스펙 원문 Acceptance Criterion | 판정 | 충족 지점 (파일:행) |
|---|---|---|---|
| AC-1 | normal tournament `end` derives and submits **without any generic draft path** | ✅ 충족 | 파생·제출: `apps/v1_api/src/games/games.service.ts:617-618` (`end` → `deriveTournamentRevision`), `:2854-2937` (revision 1 생성 → participants → `SUBMITTED` 전이 → `GAME_RESULT_SUBMITTED` 아웃박스). generic draft 차단: `:1204-1210` (`createResultRevision`이 `TOURNAMENT_FIXTURE`면 `409 TOURNAMENT_RESULT_DERIVED_ONLY`), `:1304-1309` (`submitResultRevision` 동일), `apps/v1_api/src/tournaments/tournament-bracket.service.ts:641-647` (`recordResult` 동일), `:536-543` (`deleteFixtureResult` 동일) |
| AC-2 | correction creation leaves the **prior official pointer authoritative** | ✅ 충족 | `tournament-result-review.service.ts:630-659` — `createResultCorrection`이 DRAFT를 만들고 `v1Game.update`에서 **`version` 증가만** 수행, `currentOfficialRevisionId`는 건드리지 않음. 테스트: `tournament-officialize.integration-spec.ts:468-469` |
| AC-3 | correction officialization **atomically swaps** a same-game current official revision **and writes outbox** | ✅ 충족 | `tournament-result-review.service.ts:422-454` — 리비전 `OFFICIAL` 전이 → `v1Game.update({currentOfficialRevisionId})` → fixture `completed` → `writeOutbox('GAME_RESULT_OFFICIAL')`이 단일 `$transaction` 내부(`:689-800`, `isolationLevel: Serializable`). same-game 강제는 DB 레벨: 복합 FK `v1_games_current_revision_fk (id, current_official_revision_id) → (game_id, id)` + `@@unique([id, currentOfficialRevisionId])` (`prisma/schema.prisma` `V1Game`) |
| AC-4 | **failure rolls back both** | ✅ 충족(설계) / ⚠️ 미테스트 | 단일 `$transaction` + `Serializable` (`:689`, `:799`)이므로 mutate 콜백 내 어떤 예외든 리비전 전이·포인터 스왑·아웃박스를 함께 롤백. `P2034`/`P2002`는 `409 COMMAND_CONCURRENCY_CONFLICT`로 매핑(`:801-812`). "zero new rows" 롤백은 wrong-base 케이스만 테스트됨(`spec:317,329`, `:502,517`, `:564,573`) — **성공 경로 도중 실패 주입 테스트는 없음** → Gap G-2 |
| AC-5 | correction **retains prior revision** through a **same-game supersedes constraint** | ✅ 충족 | DB 레벨 복합 FK: `V1GameResultRevision.supersedes @relation(fields:[gameId, supersedesId], references:[gameId, id], onDelete: Restrict)` + `@@unique([gameId, id])` (`prisma/schema.prisma`) — cross-game supersedes는 FK 위반으로 물리적으로 불가, `Restrict`가 선행 리비전 삭제를 차단. 서비스 레벨 중복 방어: `assertRevisionSupersession(purpose:'CORRECTION')` (`service.ts:613-628` → `games/core/revision-state-machine.ts:101-121`, `baseGameId !== successorGameId`면 throw) |
| AC-6 | **every terminal revision is immutable** | ✅ 충족 | 3중 방어. ① DB 트리거 `v1_block_terminal_revision_mutation` (`prisma/migrations/20260729000100_v1_game_operations/migration.sql`) — `CHANGE_REQUESTED/SUPPLEMENT_REQUESTED/REJECTED/OFFICIAL/VOID` 행의 UPDATE·DELETE를 `ERRCODE 55000`으로 거부. ② 서비스 상태머신 `assertRevisionTransition` (`games/core/revision-state-machine.ts:50-78`) → `TERMINAL_REVISION_IMMUTABLE`. ③ 참가자 행 트리거 `v1_guard_result_participant_mutation` — DRAFT 리비전에만 participants 삽입 허용(그래서 `service.ts:304-338`·`:630-655`가 **DRAFT로 생성 → participants → SUBMITTED 전이** 순서를 지킴). 테스트: `spec:346-354`(reject 재시도), `:439-446`(중복 officialize) |
| AC-7 | **standings**/next-fixture conflict blocks with **actionable code** | ✅ **next-fixture 충족 / standings는 조사로 N/A 확정** | next-fixture: ✅ `service.ts:992-` `assertNoLockedDownstreamFixture` — advancement edge의 타깃 fixture를 전부 `FOR UPDATE` 잠근 뒤 `status !== 'scheduled'`면 `409 NEXT_FIXTURE_CONFLICT`. void 경로에서 포인터 스왑 **전에** 호출(`:526-528`). 테스트: `spec:549-576`. **standings/ranking**: 2026-08-05 조사(G-1)로 **구현 대상 자체가 없음 확정** — 그룹 순위(`V1TournamentStanding.position`)를 넉아웃 fixture 시딩·advancement edge 어디에서도 소비하지 않아 "이미 하류에 소비된 순위"라는 전제가 성립하지 않는다(근거: G-1 gap 행). 원문 AC의 "standings conflict" 절반은 **N/A로 재분류**, 신규 차단 코드 없음 |
| AC-8 | **director flag is auditable** | ⚠️ **부분 충족** | 게이팅: `service.ts:722-724`, `:833-844` — `result_officialize` + `role === 'tournament_director'`일 때 매 호출마다 `v1_game_operation_flags`를 **라이브 조회**, `!== 'on'`이면 `403 DIRECTOR_OFFICIALIZE_DISABLED`. 성공 시 감사: `:780-796` `auditWriter.create(...)`가 `actor.role='tournament_director'`, `authorizationSubject`, `tournamentId`, `fixtureId`를 기록. 플래그 **전환 자체**의 감사는 Task 5 소유(`config/game-operation-flags.ts`). **미충족 부분**: 감사 레코드가 결정 시점의 **플래그 값/버전을 담지 않으며**, 거부(403) 경로는 커맨드 경계보다 앞서 throw되어 **감사 레코드를 남기지 않는다** → Gap G-3 |
| AC-9 | (스펙 "What to do") **초기 scope = `platform_ops`**, 감사된 플래그가 `tournament_director` 개방 | ✅ 충족 | `tournaments/staff/tournament-staff-policy.ts:19-20`이 `result_review`/`result_officialize`를 액션 어휘에 추가, `:307-312` `allowsRoleAction`이 `platform_ops`/`tournament_director`만 허용. 그 위에 `result_officialize`는 director일 때만 플래그 게이트를 추가로 통과해야 함 → 기본값 `off`(`config/game-operation-flags.ts:35`)에서 실효 scope는 `platform_ops` 전용. 타 대회 director는 플래그 무관 `403 STAFF_SCOPE_DENIED`(테스트 `spec:616-626`) |

**집계: 9항목 중 6항목 완전 충족(AC-1,2,3,5,6,9), 2항목 부분 충족(AC-7 절반·AC-8 부분), 1항목 설계상 충족·테스트 미비(AC-4).**

---

## Test Scenarios — 스펙 QA scenario 21항목 대조

기존 커버리지: `apps/v1_api/test/tournaments/tournament-officialize.integration-spec.ts` (9 테스트, 9/9 통과).

### 커버됨 (12/21)

| # | 스펙 QA scenario | 커버 위치 |
|---|---|---|
| Q-01 | rejected supersede-and-submit success | `spec:359-401` |
| Q-03 | wrong-base rejection with **zero new rows** | `spec:312-329` (`RESULT_RESUBMISSION_NOT_ALLOWED` + `revisionCount` 불변) |
| Q-05 | fresh SLA | `spec:386-400` (아웃박스 존재 + drain 후 escalation 2건) |
| Q-06 | reject terminal mutation rejection | `spec:346-354` (`TERMINAL_REVISION_IMMUTABLE`) |
| Q-09 | official terminal mutation rejection | `spec:439-446` (중복 officialize → `TERMINAL_REVISION_IMMUTABLE`) |
| Q-10 | void terminal mutation rejection (void 포인터 재-void) | `spec:531-538` (`REVISION_MUST_BE_SUPERSEDED`) |
| Q-12 | duplicate officialize | `spec:439-446` |
| Q-14 | correction (생성 → 포인터 유지 → officialize → 스왑) | `spec:449-488` |
| Q-15 | platform_ops void | `spec:520-547` |
| Q-18 | denial again after flag rollback | `spec:602-614` |
| Q-19 | void pointer / next-fixture compensation | `spec:520-547` (포인터·캐시 `is_current=false`·타깃 fixture 슬롯 NULL 복구) |
| Q-21 | unauthorized director | `spec:616-626` (`STAFF_SCOPE_DENIED`) |

추가 보너스 커버(스펙 목록 밖이지만 실제 결함을 잡는 테스트): stale projection preview hash 거부(`spec:403-415`, `PROJECTION_PREVIEW_MISMATCH`), stale correction base 거부(`spec:490-518`, `REVISION_MUST_BE_SUPERSEDED` + zero new rows).

### 미커버 (9/21) — 테스트 gap

| # | 스펙 QA scenario | 상태 | 제안 |
|---|---|---|---|
| Q-02 | **supplement-requested** supersede-and-submit success | ❌ | `reviewDecision(decision:'request_supplement')` → `SUPPLEMENT_REQUESTED` 베이스에서 supersede-and-submit 성공까지. 구현은 이미 두 상태를 모두 허용(`service.ts:263-271`)하나 **`request_supplement` 경로 자체가 어떤 테스트에서도 실행되지 않음** |
| Q-04 | **atomic successor rollback** | ❌ | 후속 리비전 생성 성공 후 같은 트랜잭션 뒷단(예: 아웃박스 `businessKey` 유니크 충돌)에서 실패 주입 → revision·participants·게임 version 전부 롤백 확인 |
| Q-07 | **supplement** terminal mutation rejection | ❌ | `SUPPLEMENT_REQUESTED` 행에 `reviewDecision`/`officialize` 재시도 → `TERMINAL_REVISION_IMMUTABLE` |
| Q-08 | **change-request** terminal mutation rejection | ❌ | `CHANGE_REQUESTED`는 팀매치 축(`GamesService.decideResultRevision`)에서만 생성되므로 대회 게임에서는 DB 직접 시드로만 재현 가능. 상태머신(`revision-state-machine.ts:8-16`)엔 이미 터미널로 포함 |
| Q-11 | **cross-game current/supersedes corruption** | ❌ | 타 게임 리비전 id로 `currentOfficialRevisionId`/`supersedesId` 강제 세팅 시도 → 복합 FK 위반 확인(음성 대조군). AC-5/AC-3의 DB 불변식이 **실제로 발화하는지**를 증명하는 유일한 테스트 |
| Q-13 | **projection failure** | ❌ | 워커 핸들러 실패 시 아웃박스 `RETRY` + 부분 상태 미커밋 확인. `v1-game-operations-worker.service.ts` 재시도 경로 재사용 |
| Q-16 | **director void denial while flag off** | ❌ | `void`도 `staffAction:'result_officialize'`(`service.ts:494`)라 게이트가 적용되지만 **테스트는 officialize만 검증**. void 축은 미검증 |
| Q-17 | **audited director void success while flag on** | ❌ | 플래그 on + director로 void 성공 → `V1OperationAudit` 행의 actor role·`authorizationSubject` 검증 |
| Q-20 | **tie-break conflict** | ❌ | **구현 자체가 없다** (Gap G-1). 테스트 이전에 동작 정의가 선행돼야 함 |

**제안 파일 경로**: 기존 스펙에 이어붙이지 말고 별도 파일로 분리 —
`apps/v1_api/test/tournaments/tournament-officialize-edge.integration-spec.ts`
(기존 629줄 스펙은 순차 의존 상태머신 시나리오 한 줄기라, 실패 주입·DB 시드형 음성 테스트를
섞으면 격리가 깨진다). `jest.config.ts`의 `<rootDir>/test/tournaments/**/*.integration-spec.ts`
글롭에 자동 포함되므로 설정 변경 불필요.

### Mock data strategy

- 이 태스크는 **inline mock을 쓰지 않는다.** 모든 테스트가 실 Postgres(`DATABASE_URL` 필수, `spec:186-188`)에 직접 시드하는 통합 테스트다.
- 시드는 스펙 파일 내부 `beforeAll`(`spec:185-306`)에 인라인. `apps/v1_api/test/fixtures/`의 공용 팩토리(`competition-config.fixture.ts` 등)는 사용하지 않고, 대회 축 전용 id 네임스페이스(`85000000-…`)로 cross-suite 충돌을 회피한다.
- **신규 테스트도 같은 규율을 따를 것**: 새 id 네임스페이스(예: `86000000-…`) + 공유 `V1Sport`/`V1CompetitionConfigVersion`(`football-v1`)만 `upsert`로 재사용.
- 프론트엔드 MSW 핸들러는 Task 23 범위 — 이 문서에서 다루지 않음.

---

## Parallel Work Breakdown (남은 gap 한정)

| 트랙 | 내용 | 의존 | 병렬성 |
|---|---|---|---|
| **T-A (설계 선행, 차단)** | G-1 standings/tie-break 충돌의 **동작 정의 확정** (아래 Ambiguity A-1). 사용자/스펙 소유자 결정 필요 | — | 단독. T-B·T-C와 무관 |
| **T-B (백엔드 테스트)** | Q-02·Q-04·Q-07·Q-08·Q-11·Q-13·Q-16·Q-17 8개 통합 테스트 추가 | 없음 (구현 이미 존재) | **T-C와 완전 병렬** |
| **T-C (백엔드 감사 보강)** | G-3: 감사 레코드에 플래그 값/버전 스냅샷 추가 + 403 거부 경로 감사 | 없음 | **T-B와 완전 병렬** |
| **T-D (문서 정정)** | `.omo/plans/…v1.md` 22번 체크박스, 태스크 127 문서 1119–1142행 "미구현" 결론 정정 | T-A/T-B/T-C 무관 | 즉시 병렬 |
| **T-E (구현, 조건부)** | G-1 실제 구현 | **T-A 완료 후에만** | T-A에 순차 종속 |

- **`apps/v1_api/prisma/**` 변경 불필요.** 대조 결과 기존 스키마·트리거·복합 FK가 same-game supersedes / current-official 포인터 / 터미널 불변성 / 캐시 단일 current를 전부 강제한다. **마이그레이션 신규 작성 사유 없음.**
- **절대 수정 금지 유지**: `apps/v1_api/src/config/game-operation-flags.ts` (Task 5 소유 — 읽기 전용으로만 참조), `apps/v1_api/prisma/**`.

---

## Tech Debt Resolved / 잔여

### 이 태스크 구현 과정에서 이미 해소된 것 (커밋 이력 실측)

| 항목 | 커밋 | 내용 |
|---|---|---|
| `V1TournamentFixture.status`가 아무도 안 쓰는 죽은 컬럼 | `2172bb91` | `GameResultBracketProjectionService.project`가 source fixture `status='completed'`를 요구하는데 **아무 writer도 없어 브래킷 승격이 영원히 발화 불가**였다. officialize가 같은 트랜잭션에서 `completed`를 쓰도록 수정 (`service.ts:441-446`) |
| `GameResultVoidProjectionService.hidePublicCache`의 항상-실패 INSERT | 위와 연쇄 | VOID 리비전 id로 캐시 행을 INSERT하려 해 `v1_guard_game_official_result_cache` 트리거를 **항상** 위반, 핸들러 트랜잭션 전체가 롤백되며 올바른 UPDATE까지 되돌렸다. 브래킷 승격이 막혀 있어 관측되지 않던 잠복 결함. UPDATE-only로 수정 |
| DRAFT 아닌 리비전에 participants 부착 | `87687a73` | `v1_guard_result_participant_mutation` 트리거 위반. DRAFT 생성 → participants → SUBMITTED 전이 순서로 수정 |
| 대회 invariant 입력에 `sourceType` 누락 | `67c1647f` | 하드코딩 대신 잠근 게임의 실제 값 전달 (`service.ts:1038`) |
| stale correction base 허용 | (후속) | `base.state === OFFICIAL`만 보면 이미 superseded된 리비전으로 correction draft 생성 가능. `game.currentOfficialRevisionId === base.id` 검사 추가 (`service.ts:607-612`) |

**주목**: 위 5건 모두 "Postgres 트리거·불변식을 우회하지 않고 그 안에서 동작하도록" 고친
사례다. 잔여 gap 처리 시에도 같은 규율을 유지한다.

### 잔여 기술부채 (gap)

| ID | 내용 | 심각도 | 후속 트리거 |
|---|---|---|---|
| **G-1** | ~~standings/ranking(tie-break) 충돌 감지 미구현~~ | ~~High~~ | **조사 완료·구현 안 함으로 확정 (2026-08-05)**. T-A 조사 결과: 그룹 순위(`V1TournamentStanding.position`)를 넉아웃 fixture 시딩에 자동 소비하는 코드 경로가 저장소에 **전혀 없다**. 근거: ① `V1TournamentFixtureAdvancementEdge`(`prisma/schema.prisma:2170-2188`)는 `sourceFixtureId`/`sourceOutcome(WINNER\|LOSER)`/`targetFixtureId`/`targetSide`만 가지며 `groupId`·`position`·`V1TournamentStanding` 참조가 전무 — 단일 fixture의 승/패만 다음 fixture로 전달. ② `GameResultBracketProjectionService.project()`(`apps/v1_api/src/game-operations/game-result-bracket-projection.service.ts:22-82`)와 대칭 로직 `GameResultVoidProjectionService.reverseBracketAdvancement()`(`.../game-result-void-projection.service.ts:145-199`) 둘 다 source fixture 자신의 score로 winner/loser를 정해 target 슬롯을 채울 뿐, standings를 읽지 않는다. ③ `TournamentBracketService.createFixture()`(`tournament-bracket.service.ts:227-274`)의 넉아웃 fixture `homeRegistrationId`/`awayRegistrationId`는 admin이 DTO로 **직접 지정**하는 값이고 `confirmed` registration 여부만 검증 — 그룹 순위·position을 기록/참조하지 않아 "이 슬롯이 어느 그룹 몇 위에서 왔는지" 시스템이 원천적으로 모른다. ④ `recalculateStandings()`/`getBracket()`(`:648-730`, `:758-826`)이 `V1TournamentStanding.position`을 쓰고 읽는 유일한 두 지점이나 서로 조인 없이 순수 집계·읽기전용 표시일 뿐. **결론**: "이미 하류에 소비된 그룹 순위"라는 전제 자체가 구조적으로 성립하지 않는다. 브리핑이 제시한 축소 대안("같은 그룹 내 completed fixture의 순위표 표시에만 영향 시 차단")도 검토했으나 그룹 내 2경기만 끝나도 거의 모든 정정에서 발동하는 근거 없는 과차단이 되어 R-2를 재현하므로 채택하지 않음. CLAUDE.md 원칙 5(존재하지 않는 위험을 추측으로 막지 않음)에 따라 **구현 착수하지 않고 스킵**. AC-7의 "standings conflict" 절반과 QA Q-20은 이 근거로 **N/A**로 재분류. |
| **G-2** | ~~AC-4 "failure rolls back both"의 성공 경로 실패 주입 테스트 없음~~ | ~~Medium~~ | **해소됨 (2026-08-04, 커밋 `b53c4385`, Q-04)**. `supersedeAndSubmit` 트랜잭션 마지막 statement에 실제 실패(outbox `business_key` 유니크 충돌)를 주입해 revision·participant·game version이 전부 롤백됨을 실측 — 트랜잭션 형태 검사가 아니라 실제 실패로 증명 |
| **G-3** | ~~director 플래그 거부(403) 경로가 감사 레코드를 남기지 않고, 성공 감사도 결정 시점 플래그 값/버전을 담지 않음~~ | ~~Medium~~ | **해소됨 (2026-08-04, 커밋 `a4f35c68`)**. `readDirectorOfficializeFlagSnapshot()`이 `{value, version}`을 반환하도록 조회를 넓혔고, 거부 감사는 트랜잭션 롤백 이후 `catch` 블록에서 `this.prisma`로 별도 insert(인터랙티브 트랜잭션이 throw하면 콜백 내부에서 쓴 감사 행도 함께 롤백되는 버그를 구현 중 발견·수정). 신규 격리 테스트 2건(`tournament-officialize-edge.integration-spec.ts`, id 네임스페이스 `86000000-`)으로 거부/성공 양쪽 감사 행 검증. 기존 9개 회귀 없음. 오케스트레이터가 별도 격리 DB에서 11/11 통과 + tsc clean 독립 재검증 완료 |
| **G-4** | ~~8개 QA scenario 미커버~~ | ~~Medium~~ | **완전 해소 (2026-08-04, 커밋 `b53c4385`)**. Q-16/17은 G-3에서, 나머지 Q-02/04/07/08/11/13은 T-B에서 전부 커버. 테스트 작성 중 진짜 버그 3건 발견·수정(다른 describe 블록의 `V1Sport.upsert` id 재사용 오류, Q-04가 심은 충돌 outbox 행이 Q-13 워커 drain에 오염되던 문제, Q-13의 `availableAt` 타임스탬프 레이스 — 전부 테스트 코드 자체의 결함이었고 프로덕션 코드는 무관). Q-11은 Postgres 복합 FK(`v1_games_current_revision_fk`, `v1_result_revisions_supersedes_fk`)가 실제로 위반을 던지는 것을 증명(우회 없음). 오케스트레이터가 별도 격리 DB 2곳에서 8/8(신규 edge 전체) + 9/9(회귀) 독립 재검증, tsc clean, CI(수동 발동) 결과 대기 중 |
| **G-5** | `service.ts:70-94`의 `jsonInput`/`canonicalize`/`jsonObject`가 `games.service.ts`의 비-export 헬퍼를 **의도적으로 복제**. 소유권 경계 때문에 불가피하며 `:62-68` 주석에 사유가 명시됨 | Low — **이연 정당** | `games.service.ts`가 이 헬퍼들을 export하는 별도 변경이 생기면 그 커밋에서 통합 |
| **G-6** | `.omo/plans/…v1.md` 22번 체크박스 및 태스크 127 1119–1142행이 "미구현"으로 기록 → **이 세션에서 4번째 유사 오판을 유발한 원인** | **High (프로세스)** | T-D에서 즉시 정정 |

---

## Security Notes

### Threat model / mitigations (실측 기준)

| 위협 | 완화 | 위치 |
|---|---|---|
| 권한 없는 액터가 대회 결과를 공식화 | `TournamentStaffAccessService.assertAccess`가 매 커맨드마다 게임 → fixture → tournament를 실제 조회해 scope 판정. `allowsRoleAction`이 `result_review`/`result_officialize`를 `platform_ops`/`tournament_director`로만 제한 | `service.ts:714-721`, `tournament-staff-policy.ts:19-20,307-312` |
| 타 대회 director의 횡단 접근 | scope 판정이 `resource.tournamentId`/`fixtureId` 기준 → `403 STAFF_SCOPE_DENIED` | 테스트 `spec:616-626` |
| 플래그 롤백 후에도 director가 계속 공식화 | 캐싱 없이 **매 호출 라이브 DB 조회**. off→on→off 전 구간 테스트됨 | `service.ts:833-844`, 테스트 `spec:578-628` |
| 팀매치 게임을 대회 라우트로 조작 | `sourceType !== TOURNAMENT_FIXTURE` 또는 `tournamentFixtureId === null`이면 즉시 `404 GAME_NOT_FOUND` (정보 노출 회피용 404, 403 아님) | `service.ts:704-706` |
| 재생/중복 커맨드로 상태 이중 전이 | `Idempotency-Key === body.clientCommandId` 강제(`assertGameCommandContext`) + `V1IdempotencyRecord` 유니크 키(actor·action·resource·key)로 replay 판정. payload hash 불일치는 `409 IDEMPOTENCY_PAYLOAD_CONFLICT` | `service.ts:734-765`, `games/core/game-contract.ts:166-220` |
| 동시 커맨드 경합으로 포인터 손상 | `SELECT … FOR UPDATE` 행 잠금 + `Serializable` 격리 + `expectedVersion` CAS. 직렬화 실패(`P2034`)/유니크 충돌(`P2002`)은 `409 COMMAND_CONCURRENCY_CONFLICT` | `service.ts:691`, `:799`, `:801-812` |
| 조작된/구식 내용을 공식화 | `projectionPreviewHash`가 `{score, eventsHash, mvpParticipantId}`의 SHA-256과 일치해야 함. 불일치 시 **상태를 건드리기 전에** `409 PROJECTION_PREVIEW_MISMATCH` | `service.ts:400-406`, `:873-883`, 테스트 `spec:403-415` |
| 하류 브래킷이 진행된 뒤 무효화로 유령 대진 발생 | 타깃 fixture 전부 `FOR UPDATE` 잠금 후 `status` 검사 → `409 NEXT_FIXTURE_CONFLICT` (경합 차단) | `service.ts:924-946` |
| 터미널 리비전 사후 변조 | DB 트리거(`ERRCODE 55000`) — 애플리케이션 우회 불가 | `20260729000100_v1_game_operations/migration.sql` |
| 감사 회피 | 성공 경로는 `OperationAuditWriterService.create`가 같은 트랜잭션에서 actor·`authorizationSubject`·before/after·tournamentId·fixtureId 기록 | `service.ts:780-796` |

### 잔존 보안 gap

- **G-3 (거부 경로 감사 부재)**: director가 플래그 off 상태에서 반복 공식화를 시도해도 `V1OperationAudit`에 흔적이 남지 않는다. 권한 상승 정찰(probing) 탐지 불가. → T-C.
- **G-1 (standings 충돌 미검사)**: 그룹 순위가 이미 하류에 소비된 뒤의 정정/무효화가 **차단 없이 통과**한다. 데이터 무결성 위협이며 보안이라기보단 정합성 이슈지만, 대회 결과 신뢰도에 직결. → T-A/T-E.

---

## Risks & Dependencies

| ID | 리스크 | 영향 | 대응 |
|---|---|---|---|
| R-1 | **문서 드리프트가 반복 오판을 만든다** — 이 세션에서만 유사 오판 4건 발생, 본 태스크가 5건째 | 높음. 이미 있는 기능을 재구현할 뻔했다 | T-D 즉시. 판단 근거를 체크박스가 아니라 **코드 실측**으로 고정 |
| R-2 | ~~G-1의 동작 정의가 스펙에 없음~~ | ~~높음~~ | **해소됨 (2026-08-05)**. 조사 결과 하류 소비 경로 부재로 구현 자체를 스킵 — 추측 구현으로 인한 과차단 리스크가 원천 제거됨 |
| R-3 | 통합 테스트가 실 Postgres 의존 | 중간. `DATABASE_URL` 없으면 즉시 throw | 격리 DB 절차(`ulw_v1_integration_task27` + `prisma migrate deploy`)가 이미 검증됨 |
| R-4 | 기존 629줄 스펙이 순차 의존 상태머신 한 줄기 | 중간. 중간에 테스트를 끼우면 뒤 테스트의 `expectedVersion`이 전부 어긋난다 | 신규 테스트는 **별도 파일 + 별도 id 네임스페이스**로 분리 |
| R-5 | E2E-CORR-01 통과는 `DIRECTOR_OFFICIALIZE` 게이트 번들(V7/V22/V23 영수증)에 종속 | 중간 | 기능 구현과 무관한 **게이트 운영 이슈**. 플래그를 DB로 직접 켜는 우회는 금지(게이트 무력화) |
| D-1 | Task 7 (staff authorization) | 충족됨 — `result_review`/`result_officialize` 액션 등록 완료 |
| D-2 | Task 9 (outbox worker) | 충족됨 — `GAME_RESULT_VOIDED` 핸들러 + `GAME_RESULT_REJECTED`/`_SUPPLEMENT_REQUESTED` durable-audit 등록 (`v1-game-operations-worker.service.ts:71,81,82`) |
| D-3 | Task 11 / 18 / 20 | 스펙상 blocked-by. 현재 HEAD 기준 전부 머지됨 |
| D-4 | Task 23 (프론트엔드) | 이미 존재하는 것으로 보이나 **별도 검증 중** |

---

## Ambiguity Log

> 아래는 **추측하지 않고 남긴** 항목이다. 확정은 사용자/구현 단계 리뷰에서 한다.

| ID | 모호점 | 스펙이 말하는 전부 | 제안(확정 아님) |
|---|---|---|---|
| **A-1** | ~~"standings conflict" / "tie-break conflict"의 정확한 동작~~ | AC: "standings/next-fixture conflict blocks with **actionable code**". QA: "**tie-break conflict**". 그 이상 정의 없음. `calculateCompetitionStandings`(`competition-config/competition-standings.ts`)는 `seededDraw: 'sha256-v1'` 최종 타이브레이커가 있어 **순위가 미결정으로 남는 경우는 구조적으로 없다** → "해결 불가능한 동률"이라는 해석은 성립하지 않는다 | **해소됨 (2026-08-05)**. 선행 확인 항목("그룹 순위 → 넉아웃 시드를 잇는 코드 경로가 존재하는지")을 조사한 결과 **존재하지 않음**을 확정(근거는 G-1 행 참조). advancement edge는 fixture-to-fixture(승/패)만 연결하며 그룹 순위(`V1TournamentStanding.position`)는 어떤 하류 코드에서도 소비되지 않는다. 따라서 "이미 하류에 소비된 그룹 순위를 뒤집는 경우 차단"이라는 유력 해석의 전제 자체가 성립하지 않아 **구현하지 않기로 확정**. 이 태스크에서 새 실패 시나리오/차단 코드를 만들지 않는다 |
| **A-2** | **"visibility cleanup"의 대상** | "visibility/SLA cleanup". SLA는 명확(`closeReviewSla`)하나 visibility가 `V1GameVisibilityPolicy.mode`인지 `V1GameOfficialResultCache.is_current`인지 미지정 | 현재 구현은 후자(async 워커의 `hidePublicCache`)만 수행한다. 제안: **후자로 충족된 것으로 간주**. `V1GameVisibilityPolicy`는 라이브 중계 노출 정책이라 결과 리비전 생명주기와 축이 다르고, 정정/무효화가 그 정책을 바꿔야 할 근거가 스펙에 없다. 다르게 읽어야 한다면 확정 필요 |
| **A-3** | **`request_supplement`의 재제출 기한/SLA 값** | 스펙에 시간값 없음. 현행은 `GameResultSubmittedEscalationService`의 24h 리마인더 / 48h 에스컬레이션을 재제출 시 그대로 새로 시작 | 제안: **현행 24h/48h 유지**. 대회 운영 특성상 별도 값이 필요하면 `V1CompetitionConfigVersion`에 두는 것이 일관되나, 스펙 근거 없이 추가하지 않는다 |
| **A-4** | **correction `reason` 길이 제한** | 없음. 현행 DTO는 `@IsString() @IsNotEmpty()`만(`dto.ts:158-160`), 상한 없음 | 제안: `@MaxLength(1000)` — `game-operation-flags.ts:877-884`의 `assertReason`이 이미 1–1000자를 쓰므로 그 상수와 정합. **단 현행 무제한이 실제 문제를 일으킨 증거는 없어, 단독으로 바꿀 사유가 약하다** |
| **A-5** | **`change-request` 터미널 거부(Q-08)를 대회 축에서 어떻게 재현하나** | QA 목록에 있으나 `CHANGE_REQUESTED`는 팀매치 축(`GamesService.decideResultRevision`)에서만 생성된다 | 제안: 통합 테스트에서 DB 직접 시드로 `CHANGE_REQUESTED` 리비전을 만들어 대회 라우트가 거부하는지 확인. "실제 경로로는 도달 불가"라고 판정하고 스킵하는 것도 선택지이나, 상태머신이 이미 터미널로 포함하므로 **음성 대조군 가치가 있다** |
| **A-6** | **"projection failure"(Q-13)의 관측 지점** | "projection failure" 한 단어 | 제안: 워커(`V1GameOperationsWorkerService.processOne`) 핸들러가 throw할 때 아웃박스 행이 `RETRY`로 남고 `attempts`가 증가하며 **동기 커맨드 결과는 이미 커밋된 채 영향받지 않음**을 확인. 즉 "동기 경계와 비동기 투영의 실패 격리" 검증 |

### Escalation

- ~~A-1은 T-E(구현)의 차단 요인이다.~~ **해소됨 (2026-08-05)**: 조사 결과 하류 소비 경로 자체가 없어 T-E(구현)는 착수하지 않고 종료. CLAUDE.md 원칙 5 적용 사례로 기록.
- A-2/A-3/A-4/A-5/A-6은 제안값으로 진행 가능하되, 리뷰에서 명시적으로 승인/기각을 받는다.

---

## Verification 요약

| 구분 | 수치 |
|---|---|
| Acceptance Criteria | **9항목 중 6 완전 충족 / AC-8 부분 충족 / AC-4 설계충족·테스트미비 / AC-7은 next-fixture 절반만 유효 목표 — standings 절반은 조사로 N/A 확정(G-1)** |
| QA scenarios | **21항목 중 12 커버 / 9 미커버(Q-20은 구현 대상 자체가 없음이 확정되어 N/A로 재분류)** |
| 구현 gap (기능) | **0건 (G-1: 조사 결과 하류 소비 경로 부재로 구현 대상 아님, 2026-08-05 확정)** |
| 구현 gap (감사) | **1건 (G-3: 거부 경로 감사·플래그 스냅샷)** |
| 테스트 gap | **8건 (Q-02/04/07/08/11/13/16/17)** |
| 스키마 마이그레이션 필요 | **없음** |
| 문서 정정 필요 | **2곳** (`.omo/plans/…v1.md` 22번 체크박스, 태스크 127 1119–1142행) |
