# 어드민 대진 그림 편집기 PR-2 — 빠른 결과 확정(백엔드)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 플랫폼 어드민(owner·ops)이 `POST /admin/games/:gameId/quick-result` 로 대회·정규 리그 팀매치 경기의 점수만 넣어 한 번에 공식 확정할 수 있게 하고, 득점 기록이 없는 경기의 정정은 승부차기 킥 수 없이도 되게 한다.

**Architecture:** 새 메서드 `TournamentResultReviewService.quickResult` 가 기존 `withResultCommand`(멱등·감사·Serializable·오류 번역)를 그대로 타고, 안에서 DRAFT 리비전 → 참가자 → OFFICIAL 을 한 트랜잭션으로 쓴 뒤 기존 확정 파이프라인(`completeTeamMatchAtResultBoundary` → `projectCanonicalAdvancement` → `GAME_RESULT_OFFICIAL` outbox)을 호출한다. 상태 머신에는 `ADMIN_QUICK` 흐름을 추가해 DRAFT→OFFICIAL 직행을 이 흐름에만 연다. 새 컨트롤러는 어드민 mutation 게이트를 먼저 지나고, 서비스가 `platform_ops` 역할을 한 번 더 확인한다.

**Tech Stack:** NestJS 11 + Prisma 6(스키마 변경 없음) + class-validator, Jest 30(unit: in-memory 더블, integration: supertest + 실제 Postgres, CI 전용).

**Spec:** `.github/tasks/20261057-admin-bracket-canvas.md` (S5·Test Scenarios·Ambiguity Log) · 색인과 공유 계약 `docs/superpowers/plans/2026-10-08-admin-bracket-canvas-index.md`.

## 계약 이탈 (스펙 S5 를 코드에 맞춰 보강한 부분 — 이름·경로·시그니처·코드는 그대로)

1. **무효(VOID) 뒤 재입력은 팀매치 `status='completed'` 도 허용한다.** 스펙은 "팀매치 `status='matched'`, 아니면 `QUICK_RESULT_FIXTURE_CANCELLED`" 인데, 실제 `voidResultRevision` 은 팀매치 상태를 되돌리지 않는다(`tournament-result-review.service.ts:581-695` 어디에도 `matched` 복귀가 없다 — `GameResultVoidProjectionService` 도 상태를 안 건드린다). 스펙 그대로면 D6 의 "결과 무효 → 그 경기는 다시 점수를 넣을 수 있다"가 영구히 `QUICK_RESULT_FIXTURE_CANCELLED` 로 막힌다. 그래서 **최초 입력(SCHEDULED)은 `matched` 만, VOID 재입력(ENDED + 현재 포인터가 VOID)은 `matched` 또는 `completed`** 를 허용한다. 취소(`cancelled`)·보관은 어느 쪽도 거부한다.
2. **"참가자 = 현재 V1GameParticipant 전원"은 최신 라인업 리비전의 참가자만이다.** 명단 동기화(`syncLockedGameSide`)는 매번 새 라인업 리비전과 새 참가자 행을 만들고 옛 행을 지우지 않는다(`games/roster/game-roster-sync.ts:253-279`). `where: { gameId }` 전체를 쓰면 옛 명단이 섞인다. 정본 프로듀서(`GamesService.deriveTournamentRevision`)와 같은 `selectLineupParticipantsWithDraftFallback`(무효화되지 않은 라인업 기준)로 고른다.
3. **친선 경기 `QUICK_RESULT_UNSUPPORTED` 409 는 `withResultCommand` 안에서 낼 수 없다.** 그 경계는 `resolveGameSource === null` 을 404 로 닫는다(:870-873). 컨트롤러가 어드민 게이트(`getMutationAdmin`)를 먼저 통과시킨 뒤 서비스가 트랜잭션 밖 사전 확인(`assertQuickResultSupported`)을 한다 — 권한 없는 사용자는 게임 존재 여부를 알 수 없다.

## Global Constraints

색인(`2026-10-08-admin-bracket-canvas-index.md`)의 Global Constraints 전부가 적용된다. 이 PR 에만 해당하는 것:

- **스키마·마이그레이션 변경 없음** → 스키마 해시 5곳과 `game-schema.fixture.ts` 는 건드리지 않는다. `prisma generate` 는 하지 않는다(어차피 새 모델이 없다).
- `TournamentResultReviewService` 의 **생성자 시그니처를 바꾸지 않는다**(`new TournamentResultReviewService(prisma, staffAccess, auditWriter)` 호출부가 서비스 스펙·통합 스펙·`mock-tournament-seed.service.ts` 등 여러 곳이다). 어드민 게이트는 컨트롤러에서 한다.
- 새 에러 메시지는 해요체 한국어(웹 토스트로 그대로 노출된다). 코드 주석은 이 파일들이 이미 한국어·영어를 섞어 쓰므로 한국어 짧게.
- `quick-result.constants.ts` 는 PR-1a 산출물이다. 이 PR 은 만들지 않고 import 만 한다(Task 2 는 확인 단계). PR-1a 가 base 에 없으면 PR-1a 머지 뒤 `origin/dev` 에서 다시 분기한다.
- 통합 스펙은 `DATABASE_URL` 이 있는 CI 에서만 돈다. 로컬은 타입 확인까지(Task 7a Step 3)이고, 실행 결과는 push 한 브랜치의 PR CI 에서 읽는다(7a Step 8).

## File Structure

| 파일 | 책임 |
|---|---|
| `apps/v1_api/src/games/core/revision-state-machine.ts` (수정) | `RevisionFlow` 에 `'ADMIN_QUICK'` 추가, 이 흐름에만 DRAFT→OFFICIAL 허용 |
| `apps/v1_api/src/games/core/revision-state-machine.spec.ts` (수정) | `ADMIN_QUICK` 전이 단위 테스트 |
| `apps/v1_api/src/tournament-operations/results/quick-result.dto.ts` (생성) | `QuickResultDto`(+점수·승부차기 중첩 DTO) |
| `apps/v1_api/src/tournament-operations/results/quick-result.dto.spec.ts` (생성) | 프로덕션 파이프 옵션으로 DTO 계약 검증 |
| `apps/v1_api/src/tournament-operations/results/tournament-result-review.service.ts` (수정) | `quickResult`·`enterQuickResult`·`assertQuickResultSupported`, `requiredRole` 게이트, 정정 킥 수 면제 |
| `apps/v1_api/src/tournament-operations/results/tournament-result-review.service.spec.ts` (수정) | 하네스에 `v1GameEvent.count` 추가 + 킥 수 면제 테스트 |
| `apps/v1_api/src/tournament-operations/results/tournament-result-review.quick-result.spec.ts` (생성) | `quickResult` 입장 조건·쓰기 내용 단위 테스트 |
| `apps/v1_api/src/tournament-operations/results/admin-quick-result.controller.ts` (생성) | `POST admin/games/:gameId/quick-result` |
| `apps/v1_api/src/tournament-operations/results/admin-quick-result.controller.spec.ts` (생성) | 라우트 경로·게이트 순서 단위 테스트 |
| `apps/v1_api/src/tournaments/tournaments.module.ts` (수정) | 새 컨트롤러 등록 |
| `apps/v1_api/test/tournaments/tournament-quick-result.integration-spec.ts` (생성) | HTTP 통합 18 tests, 세 묶음: 7a 권한·멱등·요청 경계 / 7b 확정·진출·워커 소비·리그·출전자 선정·입장 거부 / 7c 정정 킥 수 면제·재입력(대조군 포함)·다음 경기 롤백 |
| `docs/api/domains/tournament-operations.md` (수정) | 빠른 결과 라우트·오류 코드·정정 킥 수 면제 문서 |
| `.changeset/admin-quick-result.md` (생성, 7a Step 1) | v1_api·v1_web minor — 첫 push 의 변경 게이트가 요구한다 |

---

### Task 1: 상태 머신에 `ADMIN_QUICK` 흐름 추가

**Files:**
- Modify: `apps/v1_api/src/games/core/revision-state-machine.ts:5`(타입), `:71-97`(`assertRevisionTransition`)
- Test: `apps/v1_api/src/games/core/revision-state-machine.spec.ts`(첫 줄 import, 파일 끝에 describe 추가)

**Interfaces:**
- Produces: `export type RevisionFlow = 'STANDARD' | 'CORRECTION' | 'ADMIN_QUICK'` — `assertRevisionTransition({ from, to, flow })` 가 `ADMIN_QUICK` 에서 `DRAFT → OFFICIAL` 만 추가로 허용한다.
- Consumes: 기존 `assertRevisionTransition`, `GameContractError`(`./game-contract`).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`revision-state-machine.spec.ts` 첫 import 줄을 바꾼다.

```ts
import { assertRevisionSupersession, assertRevisionTransition } from './revision-state-machine';
```

파일 맨 끝에 추가한다.

```ts
describe('assertRevisionTransition — ADMIN_QUICK', () => {
  const { DRAFT, OFFICIAL, VOID } = V1GameResultRevisionState;

  it('어드민 빠른 입력 흐름만 초안을 곧바로 확정할 수 있다', () => {
    expect(() => assertRevisionTransition({ from: DRAFT, to: OFFICIAL, flow: 'ADMIN_QUICK' })).not.toThrow();
  });

  it('대조군 — STANDARD 는 초안 직행 확정이 여전히 막혀 있다', () => {
    expect(() => assertRevisionTransition({ from: DRAFT, to: OFFICIAL, flow: 'STANDARD' })).toThrow(
      expect.objectContaining({ code: 'REVISION_MUST_BE_SUPERSEDED' }),
    );
  });

  it('대조군 — CORRECTION 의 기존 허용은 그대로다', () => {
    expect(() => assertRevisionTransition({ from: DRAFT, to: OFFICIAL, flow: 'CORRECTION' })).not.toThrow();
  });

  it('빠른 입력 흐름도 초안 → 무효 직행은 열지 않는다', () => {
    expect(() => assertRevisionTransition({ from: DRAFT, to: VOID, flow: 'ADMIN_QUICK' })).toThrow(
      expect.objectContaining({ code: 'REVISION_MUST_BE_SUPERSEDED' }),
    );
  });

  it('이미 확정된 리비전은 빠른 입력 흐름으로도 고칠 수 없다', () => {
    expect(() => assertRevisionTransition({ from: OFFICIAL, to: DRAFT, flow: 'ADMIN_QUICK' })).toThrow(
      expect.objectContaining({ code: 'REVISION_MUST_BE_SUPERSEDED' }),
    );
    expect(() => assertRevisionTransition({ from: OFFICIAL, to: OFFICIAL, flow: 'ADMIN_QUICK' })).toThrow(
      expect.objectContaining({ code: 'TERMINAL_REVISION_IMMUTABLE' }),
    );
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --maxWorkers=1 src/games/core/revision-state-machine.spec.ts`
Expected: FAIL — ts-jest 가 `Type '"ADMIN_QUICK"' is not assignable to type 'RevisionFlow'` (TS2322)로 스위트 전체를 컴파일 실패시킨다.

- [ ] **Step 3: 최소 구현**

`revision-state-machine.ts:5` 를 바꾼다.

```ts
export type RevisionFlow = 'STANDARD' | 'CORRECTION' | 'ADMIN_QUICK';
```

`assertRevisionTransition` 의 `allowed` 식 끝(`correctionTargets.has(input.to)` 줄 뒤)에 항을 더한다. 기존:

```ts
    (input.flow === 'CORRECTION' &&
      input.from === V1GameResultRevisionState.DRAFT &&
      correctionTargets.has(input.to));
```

바꾼 뒤:

```ts
    (input.flow === 'CORRECTION' &&
      input.from === V1GameResultRevisionState.DRAFT &&
      correctionTargets.has(input.to)) ||
    // 어드민 빠른 입력은 초안을 만든 같은 트랜잭션에서 곧바로 확정한다. 정정은 공식 base 를
    // 전제하므로 CORRECTION 으로 위장하지 않고 별도 흐름으로 둔다.
    (input.flow === 'ADMIN_QUICK' &&
      input.from === V1GameResultRevisionState.DRAFT &&
      input.to === V1GameResultRevisionState.OFFICIAL);
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --maxWorkers=1 src/games/core/revision-state-machine.spec.ts src/games/core/game-contract.spec.ts`
Expected: PASS (두 스위트 모두 — `game-contract.spec.ts` 가 같은 함수의 기존 계약을 고정한다).

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(games): ADMIN_QUICK 리비전 흐름 추가 — 초안 직행 확정은 이 흐름에만 허용" -- apps/v1_api/src/games/core/revision-state-machine.ts apps/v1_api/src/games/core/revision-state-machine.spec.ts
git show --stat HEAD
```
Expected: 파일 2개만.

---

### Task 2: 입력 방법 상수 확인 — `QUICK_RESULT_REASON_MARKER` · `revisionEntryMethod`

이 상수는 PR-1a(어드민 대진 응답의 `entryMethod`)가 만든다(색인 계약표). PR-2 는 새로 만들지 않고 값과 시그니처가 계약과 같은지만 확인한 뒤 Task 5c 에서 import 한다. PR-1a 없이 PR-2 만 먼저 머지하지 않는다.

**Files:** (수정 없음 — 확인만)
- `apps/v1_api/src/tournament-operations/results/quick-result.constants.ts` (PR-1a)

- [ ] **Step 1: PR-1a 산출물이 base 에 있는지 확인한다**

Run: `grep -n "QUICK_RESULT_REASON_MARKER\|export function revisionEntryMethod" apps/v1_api/src/tournament-operations/results/quick-result.constants.ts`
Expected: `QUICK_RESULT_REASON_MARKER = '[quick-result]'` 와 `revisionEntryMethod(rev: { reason: string | null; supersedesId: string | null })` 가 나온다. 파일이 없으면 PR-1a 가 아직 이 브랜치의 base 에 없다는 뜻이다 — 이 PR 을 PR-1a 머지 뒤의 `origin/dev` 에서 다시 분기한다(파일을 여기서 만들지 않는다).

- [ ] **Step 2: 계약과 대조한다**

마커 값이 `'[quick-result]'` 이고 반환 타입이 `'quick' | 'console' | 'correction'` 인지 색인(`2026-10-08-admin-bracket-canvas-index.md`)의 계약표 한 줄과 눈으로 대조한다. 다르면 이 PR 에서 고치지 말고 PR-1a 계획을 먼저 고친다. 커밋할 것은 없다.

---

### Task 3: 득점 기록 0건 경기의 정정은 승부차기 킥 수를 요구하지 않는다

빠른 입력 경기는 이벤트가 없어 킥 수를 대조할 대상이 없다. 지금 정정 경로(`assertPenaltiesForRevision`)는 base 와 다른 승부차기를 새로 쓰면 킥 수를 요구하므로(`tournament-result-review.service.ts:1279`), 빠른 입력 경기의 승부차기 정정이 영구히 422 가 된다.

**Files:**
- Modify: `apps/v1_api/src/tournament-operations/results/tournament-result-review.service.ts:1279-1282`(`requireKickCounts` 계산), `:1305` 앞(`gameHasEvents` 추가)
- Modify: `apps/v1_api/src/tournament-operations/results/tournament-result-review.service.spec.ts`(하네스 `HarnessOptions`·`tx.v1GameEvent`, 파일 끝 describe)

**Interfaces:**
- Consumes: 기존 `assertPenaltyShootoutPersistable(penalties, policy, { requireKickCounts })`(`games/core/penalty-shootout-outcome.ts:121`)
- Produces: `private gameHasEvents(tx, gameId): Promise<boolean>` — `createResultCorrection`·`supersedeAndSubmit` 가 공유하는 `assertPenaltiesForRevision` 이 쓴다.

- [ ] **Step 1: 하네스에 이벤트 수 노브를 추가한다 (동작 변화 없음)**

`HarnessOptions` 의 `awayGoalEvent` 항목 바로 뒤에 추가한다.

```ts
  /**
   * 이 경기의 `v1_game_events` 행 수. 기본은 하네스가 실제로 돌려주는 GOAL 이벤트 수(1, `awayGoalEvent` 면 2)와
   * 같다. `0` 이면 어드민 빠른 입력처럼 득점 기록이 전혀 없는 경기다.
   */
  readonly eventCount?: number;
```

`tx` 객체의 `v1GameEvent: { findMany: ... }` 를 찾아 `findMany` 앞에 `count` 를 추가한다.

```ts
    v1GameEvent: {
      count: async () => options.eventCount ?? (options.awayGoalEvent === true ? 2 : 1),
      findMany: async () => [
```

Run: `cd apps/v1_api && ./node_modules/.bin/jest --maxWorkers=1 src/tournament-operations/results/tournament-result-review.service.spec.ts`
Expected: PASS — 기존 테스트 전부 그대로(기준선).

- [ ] **Step 2: 실패하는 테스트를 쓴다**

같은 파일 끝에 추가한다.

```ts
describe('득점 기록이 없는 경기의 정정 — 승부차기 킥 수 면제', () => {
  const tiedWithPenalties = { score: { home: 1, away: 1, penalties: { home: 5, away: 4 } } };

  it('득점 기록이 없는 결선 경기는 킥 수 없이 승부차기를 정정할 수 있다', async () => {
    const harness = createHarness({ phase: 'semi', hasAdvancementEdge: true, eventCount: 0 });

    await harness.correct(tiedWithPenalties);

    expect(harness.createdRevisions).toHaveLength(1);
    expect(harness.createdRevisions[0].score).toEqual({
      home: 1,
      away: 1,
      penalties: { home: 5, away: 4 },
    });
  });

  it('대조군 — 같은 입력도 득점 기록이 있으면 여전히 킥 수를 요구한다', async () => {
    const harness = createHarness({ phase: 'semi', hasAdvancementEdge: true, eventCount: 3 });

    const error = await captureFailure(() => harness.correct(tiedWithPenalties));

    expectHttp(error, 422, 'TOURNAMENT_PENALTY_KICK_COUNTS_REQUIRED');
    expect(harness.createdRevisions).toHaveLength(0);
  });

  it('면제는 킥 수 필수만 푼다 — 킥 수를 실으면 미결 승부차기는 그대로 거부한다', async () => {
    const harness = createHarness({ phase: 'semi', hasAdvancementEdge: true, eventCount: 0 });

    // 3킥씩 3:2 는 남은 2킥으로 뒤집힐 수 있어 어느 정책에서도 미결이다.
    const error = await captureFailure(() =>
      harness.correct({
        score: { home: 1, away: 1, penalties: { home: 3, away: 2, takenHome: 3, takenAway: 3 } },
      }),
    );

    expectHttp(error, 422, 'TOURNAMENT_PENALTY_UNDECIDED');
    expect(harness.createdRevisions).toHaveLength(0);
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --maxWorkers=1 src/tournament-operations/results/tournament-result-review.service.spec.ts -t '킥 수 면제'`
Expected: FAIL — 첫 테스트가 `TOURNAMENT_PENALTY_KICK_COUNTS_REQUIRED` 422 로 거부된다(`createdRevisions` 길이 0). 나머지 둘은 현재 코드에서도 통과한다.

- [ ] **Step 4: 최소 구현**

`tournament-result-review.service.ts` 의 기존 블록을

```ts
      assertPenaltyShootoutPersistable(carriedOver, policy, {
        requireKickCounts: !inheritedFromBase,
      });
      return applied;
```

아래로 바꾼다.

```ts
      // 기록할 이벤트가 없는 경기(어드민 빠른 입력)는 킥 수를 대조할 대상이 없어 요구하지 않는다.
      const requireKickCounts =
        !inheritedFromBase && !needsPolicy && (await this.gameHasEvents(tx, game.id));
      assertPenaltyShootoutPersistable(carriedOver, policy, { requireKickCounts });
      return applied;
```

`readTeamMatchKnockoutFacts` 정의 바로 위(`/** Canonical tournament bracket facts live on Details, not the legacy fixture. */` 앞)에 메서드를 추가한다.

```ts
  private async gameHasEvents(tx: Transaction, gameId: string): Promise<boolean> {
    return (await tx.v1GameEvent.count({ where: { gameId } })) > 0;
  }
```

- [ ] **Step 5: 통과를 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --maxWorkers=1 src/tournament-operations/results/tournament-result-review.service.spec.ts && ./node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: PASS 전부, tsc 0 에러.

- [ ] **Step 6: 커밋**

```bash
git commit -m "fix(results): 득점 기록 없는 경기의 승부차기 정정은 킥 수를 요구하지 않음" -- apps/v1_api/src/tournament-operations/results/tournament-result-review.service.ts apps/v1_api/src/tournament-operations/results/tournament-result-review.service.spec.ts
git show --stat HEAD
```

---

### Task 4: `QuickResultDto`

본문 계약: `{ clientCommandId: uuid, expectedVersion: int≥0, score: { home: int≥0, away: int≥0, penalties?: { home: int≥0, away: int≥0 } } }`. 승부차기는 점수 두 개만 받는다(킥 수·선축·우회 표식은 이 입력 방법에 없다 — 전역 파이프 `forbidNonWhitelisted` 가 400 으로 막는다).

**Files:**
- Create: `apps/v1_api/src/tournament-operations/results/quick-result.dto.ts`
- Test: `apps/v1_api/src/tournament-operations/results/quick-result.dto.spec.ts`

**Interfaces:**
- Produces: `class QuickResultDto { clientCommandId: string; expectedVersion: number; score: QuickResultScoreDto }`, `class QuickResultScoreDto { home: number; away: number; penalties?: QuickResultPenaltiesDto }`, `class QuickResultPenaltiesDto { home: number; away: number }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`quick-result.dto.spec.ts` (프로덕션 `createGlobalValidationPipe` 와 같은 옵션으로 검증 — `tournament-result-review.dto.spec.ts` 의 방식):

```ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { QuickResultDto } from './quick-result.dto';

const TRANSFORM = { enableImplicitConversion: true } as const;
const VALIDATOR = { whitelist: true, forbidNonWhitelisted: true } as const;
const COMMAND_ID = '5b3f6f2e-0000-4000-8000-00000000c001';

async function failures(plain: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(QuickResultDto, plain, TRANSFORM), VALIDATOR);
  const flatten = (list: readonly ValidationError[], prefix = ''): string[] =>
    list.flatMap((error) => {
      const path = prefix === '' ? error.property : `${prefix}.${error.property}`;
      const nested = error.children === undefined ? [] : flatten(error.children, path);
      return error.constraints === undefined ? nested : [path, ...nested];
    });
  return flatten(errors);
}

const valid = { clientCommandId: COMMAND_ID, expectedVersion: 0, score: { home: 2, away: 1 } };

describe('QuickResultDto', () => {
  it('짝 증거 — 정상 본문과 승부차기 본문은 위반 0건이다', async () => {
    expect(await failures(valid)).toEqual([]);
    expect(
      await failures({ ...valid, score: { home: 1, away: 1, penalties: { home: 5, away: 4 } } }),
    ).toEqual([]);
  });

  it('clientCommandId 는 uuid 여야 한다', async () => {
    expect(await failures({ ...valid, clientCommandId: 'not-a-uuid' })).toContain('clientCommandId');
  });

  it('음수·소수 점수와 음수 expectedVersion 을 거부한다', async () => {
    expect(await failures({ ...valid, score: { home: -1, away: 0 } })).toContain('score.home');
    expect(await failures({ ...valid, score: { home: 1.5, away: 0 } })).toContain('score.home');
    expect(await failures({ ...valid, expectedVersion: -1 })).toContain('expectedVersion');
  });

  it('penalties: null 은 통과하지 않는다 — 저장되면 승격 워커가 POISONED 로 죽는다', async () => {
    const result = await failures({ ...valid, score: { home: 1, away: 1, penalties: null } });
    expect(result.some((path) => path.startsWith('score.penalties'))).toBe(true);
  });

  it('승부차기는 점수 두 개만 받는다 — 킥 수·선축·우회 표식은 여분 키로 거부한다', async () => {
    for (const extra of [{ takenHome: 5 }, { firstKickSideKey: 'HOME' }, { operatorOverride: true }]) {
      const result = await failures({
        ...valid,
        score: { home: 1, away: 1, penalties: { home: 5, away: 4, ...extra } },
      });
      expect(result.some((path) => path.startsWith('score.penalties'))).toBe(true);
    }
  });

  it('최상위 여분 키(예: 참가자 목록)는 거부한다', async () => {
    expect(await failures({ ...valid, actualParticipants: [] })).toContain('actualParticipants');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --maxWorkers=1 src/tournament-operations/results/quick-result.dto.spec.ts`
Expected: FAIL — `Cannot find module './quick-result.dto'`.

- [ ] **Step 3: 구현**

`quick-result.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsUUID, Min, ValidateIf, ValidateNested } from 'class-validator';

/** 승부차기 점수. 킥 수·선축은 받지 않는다 — 득점 기록이 없는 경기라 대조할 대상이 없다. */
export class QuickResultPenaltiesDto {
  @IsInt()
  @Min(0)
  home!: number;

  @IsInt()
  @Min(0)
  away!: number;
}

export class QuickResultScoreDto {
  @IsInt()
  @Min(0)
  home!: number;

  @IsInt()
  @Min(0)
  away!: number;

  /** `@IsOptional()` 은 null 도 건너뛰므로 undefined 만 면제한다(`PenaltyScoreDto` 와 같은 이유). */
  @ValidateIf((score: QuickResultScoreDto) => score.penalties !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => QuickResultPenaltiesDto)
  penalties?: QuickResultPenaltiesDto;
}

/** `POST /admin/games/:gameId/quick-result` 본문. 헤더 `Idempotency-Key` 는 `clientCommandId` 와 같아야 한다. */
export class QuickResultDto {
  @IsUUID()
  clientCommandId!: string;

  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @ValidateNested()
  @Type(() => QuickResultScoreDto)
  score!: QuickResultScoreDto;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --maxWorkers=1 src/tournament-operations/results/quick-result.dto.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(results): 빠른 결과 확정 요청 DTO 추가" -- apps/v1_api/src/tournament-operations/results/quick-result.dto.ts apps/v1_api/src/tournament-operations/results/quick-result.dto.spec.ts
git show --stat HEAD
```

---

### Task 5: `TournamentResultReviewService.quickResult` (5a · 5b · 5c)

입장 조건 → 쓰기 → 후속 호출의 순서와 코드는 스펙 S5 와 위 「계약 이탈」 1~3 을 따른다. 이 태스크의 단위 테스트는 **입력 검증·권한·오류 코드·상태 머신 순서(초안 → 참가자 → 확정)·참가자 선정 규칙**을 고정한다. `completeTeamMatchAtResultBoundary`·`projectCanonicalAdvancement` 는 단위 스펙에서 DB 더블이 없어 스텁으로만 두고 **호출 여부를 단언하지 않는다**(스텁 호출을 검증하는 테스트는 구현을 되읊을 뿐이다). 확정본이 OFFICIAL 인지, 다음 경기 홈·원정 칸이 채워지는지, 팀매치가 completed 가 되는지 같은 **DB 로 관측되는 결과는 Task 7a~7c 통합 스펙이 실제 Postgres 로 증명한다**.

이 태스크는 세 조각으로 나눠 각각 red → green → 커밋한다. 세 조각은 같은 서비스 메서드 `enterQuickResult` 와 같은 스펙 파일을 순서대로 키운다.

| 조각 | 닫는 것 | 새 테스트로 고정되는 계약 |
|---|---|---|
| 5a | 어드민 전용 역할 게이트(`requiredRole`) · 멱등 충돌 409 번역 · 진입점 `quickResult` | 권한·경계 6개 + 멱등 재사용 2개 |
| 5b | 입장 조건 `QUICK_RESULT_*` 5종(NOT_AVAILABLE · FIXTURE_CANCELLED · HAS_LIVE_RECORDS · TEAMS_REQUIRED · ROSTER_SYNCING) | 입장 조건 거부 + 무효 뒤 재입력의 거부 경로 |
| 5c | 승부차기 검증 · DRAFT → 참가자 → OFFICIAL 쓰기 · 확정 파이프라인 연결 | 정상 확정 · 무효 뒤 재입력 쓰기 · 승부차기 |

`enterQuickResult` 는 5a 에서 "입장 가능한 경기가 없다" 로 전부 거부하는 뼈대로 시작해, 5b 가 입장 조건을 그 위에 채우고 5c 가 마지막 거부 줄을 쓰기 흐름으로 바꾼다. 세 조각은 한 PR 로 나가므로 중간 뼈대가 배포되는 일은 없다.

### Task 5a: 어드민 전용 역할 게이트 · 멱등 충돌 409 번역 · `quickResult` 진입점

**Files:**
- Modify: `apps/v1_api/src/tournament-operations/results/tournament-result-review.service.ts`
  - `from '../../games/core'` import(`:50-57` 부근), `ResultCommandBoundaryInput`(`:122-131`), `withResultCommand` 의 `assertAccess` 직후(`const actor` 앞) 와 멱등 판정 호출, `createResultCorrection` 뒤·`// ─── command boundary` 앞에 메서드
- Test: `apps/v1_api/src/tournament-operations/results/tournament-result-review.quick-result.spec.ts`(생성)

**Interfaces:**
- Consumes: `withResultCommand`(:835), `resolveGameSource(tx, game)`, Task 4 의 `QuickResultDto`
- Produces: `quickResult(user: V1AuthUser, gameId: string, dto: QuickResultDto, idempotencyKey: string | undefined): Promise<QuickResultResponse>` where `QuickResultResponse = { gameId: string; revisionId: string; version: number; score: GameScore }`. `ResultCommandBoundaryInput.requiredRole?: 'platform_ops'`. `withResultCommand` 의 멱등 충돌이 `409 IDEMPOTENCY_PAYLOAD_CONFLICT` 로 나간다.

- [ ] **Step 1: 단위 스펙 하네스를 쓴다**

`tournament-result-review.quick-result.spec.ts` 를 만든다. 기존 `tournament-result-review.service.spec.ts` 의 하네스를 복사하지 않고 `quickResult` 가 실제로 부르는 접근자만 가진 작은 더블을 쓴다. 팀매치 결과 경계는 모듈 스텁으로만 대체한다(더블에 그 함수가 쓰는 표가 없어서다 — 호출 여부는 단언하지 않고, 그 함수의 DB 동작은 통합 스펙 7a~7c 가 증명한다).


```ts
import { HttpException } from '@nestjs/common';
import { V1GameResultRevisionState } from '@prisma/client';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import type { OperationAuditWriterService } from '../../common/audit/operation-audit-writer.service';
import { canonicalGameCommandPayloadHash } from '../../games/games.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import { QUICK_RESULT_REASON_MARKER } from './quick-result.constants';
import type { QuickResultDto } from './quick-result.dto';
import { TournamentResultReviewService } from './tournament-result-review.service';

// DB 더블이 없는 후속 호출은 스텁으로만 둔다. 호출 여부는 단언하지 않는다(통합 스펙 7b 가 DB 결과로 증명).
jest.mock('../../games/team-match-result-boundary', () => ({
  completeTeamMatchAtResultBoundary: jest.fn(async () => undefined),
}));

const ids = {
  user: '7c1e0000-0000-4000-8000-000000000001',
  game: '7c1e0000-0000-4000-8000-000000000010',
  fixture: '7c1e0000-0000-4000-8000-000000000011',
  tournament: '7c1e0000-0000-4000-8000-000000000012',
  homeSide: '7c1e0000-0000-4000-8000-000000000020',
  awaySide: '7c1e0000-0000-4000-8000-000000000021',
  homeTeam: '7c1e0000-0000-4000-8000-000000000022',
  awayTeam: '7c1e0000-0000-4000-8000-000000000023',
} as const;
const KEY = '7c1e0000-0000-4000-8000-0000000000aa';
const GAME_VERSION = 4;
const authUser: V1AuthUser = {
  id: ids.user,
  email: 'quick-result@example.test',
  accountStatus: 'active',
  onboardingStatus: 'completed',
};

type StoredRevision = { id: string; revision: number; state: V1GameResultRevisionState; score?: unknown };
type HarnessOptions = {
  readonly source?: 'tournament' | 'league' | 'friendly';
  readonly gameMissing?: boolean;
  readonly gameState?: string;
  readonly revisions?: readonly StoredRevision[];
  readonly pointerId?: string | null;
  readonly teamMatchStatus?: string;
  readonly eventCount?: number;
  readonly sideTeamIds?: readonly [string | null, string | null];
  /** 참가자 행. 기본은 홈의 옛 명단(리비전 1) + 새 명단(리비전 2) + 무효화된 더 새 명단(리비전 3) + 원정 명단이다. */
  readonly participants?: ReadonlyArray<{ id: string; sideId: string; lineupId: string; position: string | null }>;
  readonly pendingResync?: number;
  readonly phase?: 'group' | 'semi';
  readonly hasAdvancementEdge?: boolean;
  readonly role?: 'platform_ops' | 'tournament_director';
  /** 같은 멱등 키로 이미 저장된 응답(재생·충돌 판정용). */
  readonly existingRecord?: { payloadHash: string; responseStatus: number; responseBody: unknown };
};

const defaultParticipants = [
  { id: 'p-home-old', sideId: ids.homeSide, lineupId: 'lineup-home-1', position: 'GK' },
  { id: 'p-home-gk', sideId: ids.homeSide, lineupId: 'lineup-home-2', position: 'GK' },
  { id: 'p-home-fw', sideId: ids.homeSide, lineupId: 'lineup-home-2', position: 'FW' },
  { id: 'p-away-gk', sideId: ids.awaySide, lineupId: 'lineup-away-1', position: 'GK' },
  // 무효화된 리비전(3)의 선수. 무효화를 거르지 않으면 이 리비전이 "최신"이 되어 명단이 통째로 바뀐다.
  { id: 'p-home-stale', sideId: ids.homeSide, lineupId: 'lineup-home-3', position: 'FW' },
];

function createHarness(options: HarnessOptions = {}) {
  const source = options.source ?? 'tournament';
  const revisions = options.revisions ?? [];
  const latest = [...revisions].sort((a, b) => b.revision - a.revision)[0] ?? null;
  const teamIds = options.sideTeamIds ?? [ids.homeTeam, ids.awayTeam];

  const created: Array<Record<string, unknown>> = [];
  const revisionUpdates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  const participantRows: Array<Record<string, unknown>> = [];
  const outbox: Array<Record<string, unknown>> = [];
  const gameUpdates: Array<{ data: Record<string, unknown> }> = [];
  const periodUpdates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  const audits: Array<Record<string, unknown>> = [];
  const staffAccessInputs: Array<Record<string, unknown>> = [];

  const gameRow = options.gameMissing === true
    ? null
    : {
        id: ids.game,
        sourceType: 'TEAM_MATCH',
        teamMatchId: ids.fixture,
        state: options.gameState ?? 'SCHEDULED',
        version: GAME_VERSION,
        currentOfficialRevisionId: options.pointerId ?? null,
        competitionConfigVersionId: 'config-v1',
      };
  const teamMatchRow = {
    id: ids.fixture,
    status: options.teamMatchStatus ?? 'matched',
    fieldId: null,
    tournamentId: source === 'friendly' ? null : ids.tournament,
    leagueId: source === 'league' ? ids.tournament : null,
    tournament: source === 'friendly' ? null : { kind: source === 'league' ? 'regular_league' : 'regular_tournament' },
    tournamentDetails:
      source === 'tournament' ? { teamMatchId: ids.fixture, tournamentId: ids.tournament } : null,
  };

  const tx = {
    $queryRaw: async () => [],
    v1Game: {
      findUnique: async () => gameRow,
      update: async (args: { data: Record<string, unknown> }) => {
        gameUpdates.push(args);
        return { id: ids.game, state: 'ENDED', version: GAME_VERSION + 1 };
      },
    },
    v1TeamMatch: { findUnique: async () => teamMatchRow },
    v1TournamentMatchDetails: {
      findUnique: async () =>
        source === 'tournament'
          ? { group: { phase: options.phase ?? 'semi' }, _count: { advancementSources: options.hasAdvancementEdge === false ? 0 : 1 } }
          : null,
    },
    v1IdempotencyRecord: { findUnique: async () => options.existingRecord ?? null, create: async () => ({}) },
    v1GameResultRevision: {
      findFirst: async () => latest,
      create: async (args: { data: Record<string, unknown> }) => {
        created.push({ ...args.data, id: 'quick-rev-1' });
        return { id: 'quick-rev-1', revision: args.data.revision as number, state: V1GameResultRevisionState.DRAFT };
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        revisionUpdates.push(args);
        return { id: args.where.id, revision: created[0]?.revision as number, state: args.data.state };
      },
    },
    v1GameResultParticipant: {
      createMany: async (args: { data: Array<Record<string, unknown>> }) => {
        participantRows.push(...args.data);
        return { count: args.data.length };
      },
    },
    v1GameSide: {
      findMany: async () => [
        { id: ids.homeSide, teamId: teamIds[0] },
        { id: ids.awaySide, teamId: teamIds[1] },
      ],
    },
    v1GameLineup: {
      findMany: async (args: { where: { invalidatedAt?: null } }) =>
        [
          { id: 'lineup-home-1', sideId: ids.homeSide, revision: 1, state: 'SUBMITTED', invalidatedAt: null },
          { id: 'lineup-home-2', sideId: ids.homeSide, revision: 2, state: 'SUBMITTED', invalidatedAt: null },
          { id: 'lineup-home-3', sideId: ids.homeSide, revision: 3, state: 'SUBMITTED', invalidatedAt: new Date() },
          { id: 'lineup-away-1', sideId: ids.awaySide, revision: 1, state: 'SUBMITTED', invalidatedAt: null },
        ].filter((row) => args.where.invalidatedAt !== null || row.invalidatedAt === null),
    },
    v1GameParticipant: { findMany: async () => options.participants ?? defaultParticipants },
    v1GameEvent: { count: async () => options.eventCount ?? 0 },
    v1OutboxEvent: {
      count: async () => options.pendingResync ?? 0,
      create: async (args: { data: Record<string, unknown> }) => {
        outbox.push(args.data);
        return {};
      },
    },
    v1GamePeriod: {
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        periodUpdates.push(args);
        return { count: 0 };
      },
    },
    v1CompetitionConfigVersion: {
      findUnique: async () => ({
        lineup: { positions: [{ code: 'GK', label: '골키퍼', short: 'GK', goalkeeper: true }, { code: 'FW', label: '공격수', short: 'FW' }] },
        result: {},
      }),
    },
  };

  const prisma = {
    $transaction: async <T>(callback: (client: unknown) => Promise<T>) => callback(tx),
    v1Game: tx.v1Game,
    v1TeamMatch: tx.v1TeamMatch,
  } as unknown as PrismaService;
  const staffAccess = {
    assertAccess: async (input: Record<string, unknown>) => {
      staffAccessInputs.push(input);
      return {
        role: options.role ?? 'platform_ops',
        authorizationSubject: `${options.role ?? 'platform_ops'}:${ids.user}@1`,
        assignmentId: null,
        assignmentVersion: null,
      };
    },
  } as unknown as TournamentStaffAccessService;
  const auditWriter = {
    create: async (_client: unknown, input: Record<string, unknown>) => {
      audits.push(input);
      return {};
    },
  } as unknown as OperationAuditWriterService;

  const service = new TournamentResultReviewService(prisma, staffAccess, auditWriter);
  const dtoFor = (score: QuickResultDto['score'], overrides: Partial<QuickResultDto> = {}): QuickResultDto => ({
    clientCommandId: KEY,
    expectedVersion: GAME_VERSION,
    score,
    ...overrides,
  });
  /** `headerKey` 를 `null` 로 주면 Idempotency-Key 헤더가 없는 요청이다(기본값 인자는 undefined 를 삼키므로 null 을 쓴다). */
  const run = (score: QuickResultDto['score'], overrides: Partial<QuickResultDto> = {}, headerKey: string | null = KEY) =>
    service.quickResult(authUser, ids.game, dtoFor(score, overrides), headerKey ?? undefined);

  return { run, created, revisionUpdates, participantRows, outbox, gameUpdates, periodUpdates, audits, staffAccessInputs };
}
type Harness = ReturnType<typeof createHarness>;

async function captureFailure(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the quick result to be rejected');
}

function expectHttp(error: unknown, status: number, code: string): void {
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getStatus()).toBe(status);
  expect((error as HttpException).getResponse()).toEqual(expect.objectContaining({ code }));
}

/** 거부된 요청은 어떤 행도 쓰지 않아야 한다. */
function expectNoWrites(harness: Harness): void {
  expect(harness.created).toHaveLength(0);
  expect(harness.revisionUpdates).toHaveLength(0);
  expect(harness.participantRows).toHaveLength(0);
  expect(harness.outbox).toHaveLength(0);
  expect(harness.gameUpdates).toHaveLength(0);
  expect(harness.periodUpdates).toHaveLength(0);
}
```

- [ ] **Step 2: 권한·경계와 멱등 재사용 테스트를 이어 쓴다**

같은 파일 끝에 이어 붙인다. 이 둘은 `enterQuickResult` 에 닿기 전에 결판나는 경로라 뼈대만으로 통과한다.

```ts
describe('quickResult — 권한·경계', () => {
  it('platform_ops 가 아닌 주체(대회 디렉터)는 PERMISSION_DENIED 403 이고 아무것도 쓰지 않는다', async () => {
    const harness = createHarness({ role: 'tournament_director' });

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 0 })), 403, 'PERMISSION_DENIED');
    expectNoWrites(harness);
  });

  it('친선(대회·리그 소속 아님) 경기는 권한 검사 전에 QUICK_RESULT_UNSUPPORTED 로 닫힌다', async () => {
    const harness = createHarness({ source: 'friendly' });

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 0 })), 409, 'QUICK_RESULT_UNSUPPORTED');
    expect(harness.staffAccessInputs).toHaveLength(0);
    expectNoWrites(harness);
  });

  it('없는 게임은 404 GAME_NOT_FOUND', async () => {
    const harness = createHarness({ gameMissing: true });

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 0 })), 404, 'GAME_NOT_FOUND');
  });

  it('Idempotency-Key 가 clientCommandId 와 다르면 422 이고 아무것도 쓰지 않는다', async () => {
    const harness = createHarness();

    const error = await captureFailure(() => harness.run({ home: 1, away: 0 }, {}, 'other-key'));

    expectHttp(error, 422, 'COMMAND_IDEMPOTENCY_KEY_MISMATCH');
    expectNoWrites(harness);
  });

  it('Idempotency-Key 헤더가 없으면 같은 422 다', async () => {
    const harness = createHarness();

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 0 }, {}, null)), 422, 'COMMAND_IDEMPOTENCY_KEY_MISMATCH');
    expectNoWrites(harness);
  });

  it('expectedVersion 이 낡았으면 409 VERSION_CONFLICT', async () => {
    const harness = createHarness();

    expectHttp(
      await captureFailure(() => harness.run({ home: 1, away: 0 }, { expectedVersion: GAME_VERSION - 1 })),
      409,
      'VERSION_CONFLICT',
    );
    expectNoWrites(harness);
  });
});


describe('quickResult — 멱등 키 재사용', () => {
  const payload = { clientCommandId: KEY, expectedVersion: GAME_VERSION, score: { home: 2, away: 1 } };
  const stored = {
    gameId: ids.game,
    revisionId: 'old-rev',
    revision: 1,
    revisionState: 'OFFICIAL',
    state: 'ENDED',
    version: GAME_VERSION + 1,
    durableCommandId: KEY,
    replayed: false,
    score: { home: 2, away: 1 },
  };

  it('같은 본문의 재요청은 저장된 응답을 그대로 돌려주고 새 행을 쓰지 않는다', async () => {
    const harness = createHarness({
      existingRecord: { payloadHash: canonicalGameCommandPayloadHash(payload), responseStatus: 200, responseBody: stored },
    });

    const response = await harness.run({ home: 2, away: 1 });

    expect(response).toEqual({ gameId: ids.game, revisionId: 'old-rev', version: GAME_VERSION + 1, score: { home: 2, away: 1 } });
    expectNoWrites(harness);
  });

  it('같은 키에 다른 본문은 409 IDEMPOTENCY_PAYLOAD_CONFLICT 다 — 원시 예외로 새면 500 이 된다', async () => {
    const harness = createHarness({
      existingRecord: {
        payloadHash: canonicalGameCommandPayloadHash({ ...payload, score: { home: 0, away: 3 } }),
        responseStatus: 200,
        responseBody: stored,
      },
    });

    expectHttp(await captureFailure(() => harness.run({ home: 2, away: 1 })), 409, 'IDEMPOTENCY_PAYLOAD_CONFLICT');
    expectNoWrites(harness);
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --maxWorkers=1 src/tournament-operations/results/tournament-result-review.quick-result.spec.ts`
Expected: FAIL — ts-jest 컴파일 오류 `Property 'quickResult' does not exist on type 'TournamentResultReviewService'`.

- [ ] **Step 4: 서비스 구현 — import · 경계 입력 · 역할 게이트**

`from '../../games/core'` import 목록(`assertGameCommandContext, assertRevisionSupersession, ...`)에 `type DurableGameCommandRecord, type GameIdempotencyDecision,` 를 더하고, 아래 한 줄을 import 구역에 추가한다(`./tournament-result-review.dto` type import 옆).

```ts
import type { QuickResultDto } from './quick-result.dto';
```

`ResultCommandBoundaryInput` 에 필드를 더한다.

`ResultCommandBoundaryInput` 안의 다음 한 줄(`grep -n "staffAction: 'result_review' | 'result_officialize';"` 로 한 줄만 나오는지 확인 — 작성 시점 :158)을

old_string:
```ts
  staffAction: 'result_review' | 'result_officialize';
```

new_string:
```ts
  staffAction: 'result_review' | 'result_officialize';
  /** 지정하면 권한 검사가 돌려준 역할이 이것일 때만 통과한다(어드민 전용 명령). */
  requiredRole?: 'platform_ops';
```

로 바꾼다. 다른 필드는 건드리지 않는다.

`withResultCommand` 안, `const principal = await this.staffAccess.assertAccess(...)` 호출이 끝난 직후 `const actor: GameActorScope = {` 바로 위에 삽입한다. (`grep -n "const actor: GameActorScope" ...` 가 한 줄만 나오는지 먼저 확인한다.)

```ts
          if (input.requiredRole !== undefined && principal.role !== input.requiredRole) {
            throw new ForbiddenException({
              code: 'PERMISSION_DENIED',
              message: '플랫폼 운영자만 쓸 수 있는 기능이에요.',
            });
          }
```

같은 메서드의 멱등 판정은 `GameContractError` 를 그대로 던져 HTTP 에서 500 이 된다(`docs/api/domains/tournament-operations.md` 는 409 `IDEMPOTENCY_PAYLOAD_CONFLICT` 라고 적고 있다). 기존 `const decision = resolveGameIdempotency<T>(` 호출을 아래 래퍼 호출로 바꾼다.

```ts
          const decision = this.resolveIdempotency<T>(
            existing === null
              ? null
              : {
                  payloadHash: existing.payloadHash,
                  responseStatus: existing.responseStatus,
                  responseBody: existing.responseBody as unknown as T,
                },
            payloadHash,
          );
```

`assertCommandContext` 메서드 바로 위에 래퍼를 추가하고, `from '../../games/core'` import 에 `type DurableGameCommandRecord, type GameIdempotencyDecision,` 를 더한다.

```ts
  private resolveIdempotency<T>(
    existing: DurableGameCommandRecord<T> | null,
    payloadHash: string,
  ): GameIdempotencyDecision<T> {
    try {
      return resolveGameIdempotency<T>(existing, payloadHash);
    } catch (error) {
      if (error instanceof GameContractError) {
        throw toGameHttpException(error);
      }
      throw error;
    }
  }
```

- [ ] **Step 5: 서비스 구현 — 모듈 상단 타입·헬퍼**

`type ResultCommandBoundaryInput = {...};` 정의 바로 아래에 추가한다.

```ts
type QuickResultMutation = GameRevisionMutationResult & { score: GameScore };
export type QuickResultResponse = { gameId: string; revisionId: string; version: number; score: GameScore };

function quickResultConflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}
```

- [ ] **Step 6: 서비스 구현 — 진입점과 뼈대**

`  // ─── command boundary ───...` 주석 줄 **바로 위**에 아래를 삽입한다(Edit 의 `old_string` 은 그 주석 줄 전체, `new_string` 은 아래 + 그 주석 줄).

```ts
  /**
   * 플랫폼 어드민이 점수만으로 경기를 곧바로 공식 확정한다(대진 편집기의 빠른 입력).
   *
   * 득점 기록이 없는 경기에서만 열린다 — 기록이 있으면 정정 화면의 몫이다. 확정 이후의 모든 후속 처리
   * (진출·순위·전적·알림)는 일반 확정과 같은 `GAME_RESULT_OFFICIAL` 워커가 한다.
   */
  async quickResult(
    user: V1AuthUser,
    gameId: string,
    dto: QuickResultDto,
    idempotencyKey: string | undefined,
  ): Promise<QuickResultResponse> {
    await this.assertQuickResultSupported(gameId);
    const result = await this.withResultCommand<QuickResultMutation>(
      {
        gameId,
        action: 'quick_result',
        staffAction: 'result_officialize',
        requiredRole: 'platform_ops',
        userId: user.id,
        expectedVersion: dto.expectedVersion,
        headerIdempotencyKey: idempotencyKey,
        bodyCommandId: dto.clientCommandId,
        payload: dto,
      },
      (tx, game, context) => this.enterQuickResult(tx, game, context, user.id, dto),
    );
    return { gameId: result.gameId, revisionId: result.revisionId, version: result.version, score: result.score };
  }

  /**
   * 대회·정규 리그 팀매치가 아니면(친선 등) 409 로 닫는다. `withResultCommand` 는 이런 게임을 404 로
   * 닫으므로(`resolveGameSource === null`) 거기서는 이 코드를 낼 수 없다 — 어드민 게이트를 지난
   * 호출자에게만 닿도록 컨트롤러가 이 메서드보다 먼저 `getMutationAdmin` 을 호출한다.
   */
  private async assertQuickResultSupported(gameId: string): Promise<void> {
    const game = await this.prisma.v1Game.findUnique({
      where: { id: gameId },
      select: { sourceType: true, teamMatchId: true },
    });
    if (game === null) {
      throw this.notFound();
    }
    if ((await resolveGameSource(this.prisma, game)) === null) {
      throw quickResultConflict('QUICK_RESULT_UNSUPPORTED', '대회와 정규 리그 경기만 점수를 바로 확정할 수 있어요.');
    }
  }

  private async enterQuickResult(
    tx: Transaction,
    game: LockedTournamentGame,
    context: GameCommandContext,
    userId: string,
    dto: QuickResultDto,
  ): Promise<QuickResultMutation> {
    if (game.teamMatchId === null) {
      throw this.notFound('GAME_NOT_FOUND');
    }
    // 5b 가 입장 조건을, 5c 가 쓰기 흐름을 이 아래에 채운다. 그 전까지는 모든 경기를 거부해 확정본이 쓰이지 않게 한다.
    throw quickResultConflict('QUICK_RESULT_NOT_AVAILABLE', '아직 점수를 바로 확정할 수 없어요.');
  }
```

- [ ] **Step 7: 통과를 확인한다**

Run:
```bash
cd apps/v1_api && ./node_modules/.bin/jest --maxWorkers=1 src/tournament-operations/results/tournament-result-review.quick-result.spec.ts \
  src/tournament-operations/results/tournament-result-review.service.spec.ts && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
```
Expected: 새 스펙 8개 PASS + 기존 서비스 스펙 회귀 없음, tsc 0 에러.

- [ ] **Step 8: 변이로 테스트가 실제 버그를 잡는지 확인한다 (커밋하지 않는다)**

각 변이를 넣어 지정한 테스트가 red 가 되는지 보고 즉시 되돌린다(`git diff` 로 변이가 남지 않았는지 확인).

| 변이 | 기대 red |
|---|---|
| `requiredRole: 'platform_ops'` 삭제 | `platform_ops 가 아닌 주체…` |
| `resolveIdempotency` 가 `resolveGameIdempotency` 를 직접 호출(번역 제거) | `같은 키에 다른 본문은 409 IDEMPOTENCY_PAYLOAD_CONFLICT 다…` |

- [ ] **Step 9: 커밋**

```bash
git commit -m "feat(results): 어드민 전용 역할 게이트와 빠른 결과 진입점 추가, 멱등 충돌을 409 로 번역" -- apps/v1_api/src/tournament-operations/results/tournament-result-review.service.ts apps/v1_api/src/tournament-operations/results/tournament-result-review.quick-result.spec.ts
git show --stat HEAD
```
Expected: 파일 2개만.

---

### Task 5b: `quickResult` 입장 조건 검증

**Files:**
- Modify: `apps/v1_api/src/tournament-operations/results/tournament-result-review.service.ts` (`enterQuickResult` 의 뼈대 위쪽, import)
- Test: `apps/v1_api/src/tournament-operations/results/tournament-result-review.quick-result.spec.ts`(5a 에서 만든 파일에 이어 쓴다)

**Interfaces:**
- Consumes: 5a 의 `enterQuickResult` 뼈대, `selectLineupParticipantsWithDraftFallback(participants, lineups)`(`games/core`), `COMPETITION_ROSTER_RESYNC_TYPE`(`games/roster/roster-resync-events.ts:12`)
- Produces: 거부 코드 `QUICK_RESULT_NOT_AVAILABLE` · `QUICK_RESULT_FIXTURE_CANCELLED` · `QUICK_RESULT_HAS_LIVE_RECORDS` · `QUICK_RESULT_TEAMS_REQUIRED` · `QUICK_RESULT_ROSTER_SYNCING` (전부 409, 거부된 요청은 아무 행도 쓰지 않는다)

- [ ] **Step 1: 입장 조건 테스트를 이어 쓴다**

같은 파일 끝에 이어 붙인다. 뼈대는 모든 경기를 `QUICK_RESULT_NOT_AVAILABLE` 로 거부하므로 그 코드를 기대하는 케이스는 이미 통과하고, 나머지 코드를 기대하는 케이스가 red 다.

```ts
describe('quickResult — 무효(VOID) 뒤 재입력 — 거부 경로', () => {
  const voided: StoredRevision = { id: 'void-rev', revision: 3, state: V1GameResultRevisionState.VOID };
  const reentry = { gameState: 'ENDED', revisions: [voided], pointerId: 'void-rev', teamMatchStatus: 'completed' } as const;

  it('대조군 — 최초 입력(SCHEDULED)은 팀매치가 completed 면 취소된 경기처럼 거부한다', async () => {
    const harness = createHarness({ teamMatchStatus: 'completed' });

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 0 })), 409, 'QUICK_RESULT_FIXTURE_CANCELLED');
    expectNoWrites(harness);
  });

  it('무효 뒤 재입력이어도 취소된 팀매치는 거부한다', async () => {
    const harness = createHarness({ ...reentry, teamMatchStatus: 'cancelled' });

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 0 })), 409, 'QUICK_RESULT_FIXTURE_CANCELLED');
    expectNoWrites(harness);
  });

  it('현재 포인터가 VOID 가 아니면 재입력이 아니다', async () => {
    const harness = createHarness({ ...reentry, pointerId: null });

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 0 })), 409, 'QUICK_RESULT_NOT_AVAILABLE');
    expectNoWrites(harness);
  });

  it('대조군 — 팀매치가 completed 여도 현재 포인터가 확정본(OFFICIAL)이면 재입력이 아니라 QUICK_RESULT_NOT_AVAILABLE', async () => {
    const harness = createHarness({
      gameState: 'ENDED',
      teamMatchStatus: 'completed',
      revisions: [{ id: 'official-rev', revision: 1, state: V1GameResultRevisionState.OFFICIAL }],
      pointerId: 'official-rev',
    });

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 0 })), 409, 'QUICK_RESULT_NOT_AVAILABLE');
    expectNoWrites(harness);
  });

  it('대조군 — VOID 가 마지막 리비전이어도 그 위에 확정본이 포인터면 재입력이 아니다', async () => {
    const harness = createHarness({
      gameState: 'ENDED',
      teamMatchStatus: 'completed',
      revisions: [voided],
      pointerId: 'some-other-official',
    });

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 0 })), 409, 'QUICK_RESULT_NOT_AVAILABLE');
    expectNoWrites(harness);
  });
});

describe('quickResult — 입장 조건 거부(거부된 요청은 아무 행도 쓰지 않는다)', () => {
  const reject = async (options: HarnessOptions, status: number, code: string) => {
    const harness = createHarness(options);
    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 0 })), status, code);
    expectNoWrites(harness);
  };

  it('진행 중이거나 이미 끝난 경기는 QUICK_RESULT_NOT_AVAILABLE', async () => {
    await reject({ gameState: 'LIVE' }, 409, 'QUICK_RESULT_NOT_AVAILABLE');
    // 확정 전 결과(초안·제출)가 있으면 정정·확인 화면의 몫이다.
    await reject({ revisions: [{ id: 'r1', revision: 1, state: V1GameResultRevisionState.DRAFT }] }, 409, 'QUICK_RESULT_NOT_AVAILABLE');
    await reject(
      { gameState: 'ENDED', revisions: [{ id: 'r1', revision: 1, state: V1GameResultRevisionState.SUBMITTED }] },
      409,
      'QUICK_RESULT_NOT_AVAILABLE',
    );
    // 이미 확정된 경기는 정정을 쓴다.
    await reject(
      { gameState: 'ENDED', revisions: [{ id: 'r1', revision: 1, state: V1GameResultRevisionState.OFFICIAL }], pointerId: 'r1' },
      409,
      'QUICK_RESULT_NOT_AVAILABLE',
    );
  });

  it('취소된 팀매치는 게임이 SCHEDULED 여도 QUICK_RESULT_FIXTURE_CANCELLED', async () => {
    await reject({ teamMatchStatus: 'cancelled' }, 409, 'QUICK_RESULT_FIXTURE_CANCELLED');
  });

  it('득점 기록이 하나라도 있으면 QUICK_RESULT_HAS_LIVE_RECORDS', async () => {
    await reject({ eventCount: 1 }, 409, 'QUICK_RESULT_HAS_LIVE_RECORDS');
  });

  it('한쪽 팀이라도 미정이면 QUICK_RESULT_TEAMS_REQUIRED', async () => {
    await reject({ sideTeamIds: [ids.homeTeam, null] }, 409, 'QUICK_RESULT_TEAMS_REQUIRED');
    await reject({ sideTeamIds: [null, null] }, 409, 'QUICK_RESULT_TEAMS_REQUIRED');
  });

  it('한 사이드의 출전자가 0명이면 QUICK_RESULT_ROSTER_SYNCING — 출전자 0명 확정본이 남으면 안 된다', async () => {
    await reject(
      { participants: defaultParticipants.filter((row) => row.sideId !== ids.awaySide) },
      409,
      'QUICK_RESULT_ROSTER_SYNCING',
    );
    await reject({ participants: [] }, 409, 'QUICK_RESULT_ROSTER_SYNCING');
  });

  it('그 경기의 명단 재계산 이벤트가 처리 전이면 QUICK_RESULT_ROSTER_SYNCING', async () => {
    await reject({ pendingResync: 1 }, 409, 'QUICK_RESULT_ROSTER_SYNCING');
  });

  it('입장 조건 순서 — 취소된 경기에서 팀 미정이어도 취소 코드가 먼저 나온다', async () => {
    await reject({ teamMatchStatus: 'cancelled', sideTeamIds: [null, null] }, 409, 'QUICK_RESULT_FIXTURE_CANCELLED');
  });
});

```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --maxWorkers=1 src/tournament-operations/results/tournament-result-review.quick-result.spec.ts`
Expected: FAIL — `QUICK_RESULT_FIXTURE_CANCELLED`·`QUICK_RESULT_HAS_LIVE_RECORDS`·`QUICK_RESULT_TEAMS_REQUIRED`·`QUICK_RESULT_ROSTER_SYNCING` 를 기대한 케이스가 `QUICK_RESULT_NOT_AVAILABLE` 을 받아 실패한다.

- [ ] **Step 3: 서비스 구현 — import**

`tournament-result-review.service.ts` 의 `@prisma/client` import 를 바꾼다.

```ts
import {
  Prisma,
  V1GameEventType,
  V1GameOutcomeReason,
  V1GamePeriodState,
  V1GameResultRevisionState,
  V1GameSourceType,
  V1GameState,
  V1OutboxStatus,
  V1TeamMatchStatus,
} from '@prisma/client';
```

`from '../../games/core'` import 목록에 `selectLineupParticipantsWithDraftFallback,` 를 더하고, 아래 한 줄을 import 구역에 추가한다.

```ts
import { COMPETITION_ROSTER_RESYNC_TYPE } from '../../games/roster/roster-resync-events';
```

- [ ] **Step 4: 서비스 구현 — 입장 조건**

`enterQuickResult` 에서 5a 가 둔 주석 두 줄과 마지막 `throw quickResultConflict('QUICK_RESULT_NOT_AVAILABLE', '아직 …')` 줄을 아래로 바꾼다(Edit 의 `old_string` 은 그 주석 + throw, `new_string` 은 아래 전부).

```ts
    const teamMatchId = game.teamMatchId;

    // 1. 입장: 최초 입력(SCHEDULED + 리비전 없음) 또는 무효 뒤 재입력(ENDED + 현재 포인터가 마지막 VOID 리비전).
    const latest = await tx.v1GameResultRevision.findFirst({
      where: { gameId: game.id },
      orderBy: { revision: 'desc' },
      select: { id: true, revision: true, state: true },
    });
    const isFresh = game.state === V1GameState.SCHEDULED && latest === null;
    const voidBase =
      game.state === V1GameState.ENDED &&
      latest !== null &&
      latest.state === V1GameResultRevisionState.VOID &&
      latest.id === game.currentOfficialRevisionId
        ? latest
        : null;
    if (!isFresh && voidBase === null) {
      throw quickResultConflict(
        'QUICK_RESULT_NOT_AVAILABLE',
        '진행 중이거나 결과가 이미 있는 경기는 점수를 바로 확정할 수 없어요. 확정된 결과는 정정을 써 주세요.',
      );
    }

    // 2. 취소된 경기. 리그 취소는 게임을 건드리지 않아 게임 상태로는 못 거른다. 무효는 팀매치 상태를
    //    되돌리지 않으므로 재입력만 completed 를 허용한다.
    const teamMatch = await tx.v1TeamMatch.findUnique({ where: { id: teamMatchId }, select: { status: true } });
    const playable =
      teamMatch !== null &&
      (teamMatch.status === V1TeamMatchStatus.matched ||
        (voidBase !== null && teamMatch.status === V1TeamMatchStatus.completed));
    if (!playable) {
      throw quickResultConflict('QUICK_RESULT_FIXTURE_CANCELLED', '취소된 경기는 점수를 확정할 수 없어요.');
    }

    // 3. 득점 기록이 있으면 라이브 기록이 정본이다.
    if ((await tx.v1GameEvent.count({ where: { gameId: game.id } })) > 0) {
      throw quickResultConflict(
        'QUICK_RESULT_HAS_LIVE_RECORDS',
        '득점 기록이 있는 경기는 결과 정정 화면에서 고쳐 주세요.',
      );
    }

    // 4. 양 팀 확정.
    const sides = await tx.v1GameSide.findMany({
      where: { gameId: game.id },
      select: { id: true, teamId: true },
    });
    if (sides.length !== 2 || sides.some((side) => side.teamId === null)) {
      throw quickResultConflict('QUICK_RESULT_TEAMS_REQUIRED', '두 팀이 모두 정해진 경기만 점수를 확정할 수 있어요.');
    }

    // 5. 명단: 양 사이드 출전자 1명 이상 + 이 경기의 명단 재계산이 끝나 있을 것. 자리 배정 직후 명단은
    //    비동기로 채워져서, 그 사이에 확정하면 출전자 0명인 불변 확정본이 남는다.
    const [lineups, candidates, pendingResync, config] = await Promise.all([
      tx.v1GameLineup.findMany({
        where: { gameId: game.id, invalidatedAt: null },
        select: { id: true, sideId: true, revision: true, state: true },
      }),
      tx.v1GameParticipant.findMany({
        where: { gameId: game.id },
        orderBy: { id: 'asc' },
        select: { id: true, sideId: true, lineupId: true, position: true },
      }),
      tx.v1OutboxEvent.count({
        where: {
          type: COMPETITION_ROSTER_RESYNC_TYPE,
          aggregateType: 'GAME',
          aggregateId: game.id,
          status: { in: [V1OutboxStatus.PENDING, V1OutboxStatus.PROCESSING, V1OutboxStatus.RETRY] },
        },
      }),
      tx.v1CompetitionConfigVersion.findUnique({
        where: { id: game.competitionConfigVersionId },
        select: { lineup: true },
      }),
    ]);
    const roster = selectLineupParticipantsWithDraftFallback(candidates, lineups);
    if (pendingResync > 0 || !sides.every((side) => roster.some((player) => player.sideId === side.id))) {
      throw quickResultConflict(
        'QUICK_RESULT_ROSTER_SYNCING',
        '명단을 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요.',
      );
    }


    // 5c 가 승부차기 검증과 쓰기 흐름을 이 아래에 채운다. 그 전까지는 입장 조건을 통과한 경기도 거부한다.
    throw quickResultConflict('QUICK_RESULT_NOT_AVAILABLE', '아직 점수를 바로 확정할 수 없어요.');
```

- [ ] **Step 5: 통과를 확인한다**

Run:
```bash
cd apps/v1_api && ./node_modules/.bin/jest --maxWorkers=1 src/tournament-operations/results/tournament-result-review.quick-result.spec.ts && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
```
Expected: 새 스펙 20개 PASS(5a 8 + 5b 12), tsc 0 에러.

- [ ] **Step 6: 변이로 테스트가 실제 버그를 잡는지 확인한다 (커밋하지 않는다)**

| 변이 | 기대 red |
|---|---|
| `pendingResync > 0 ||` 삭제 | `그 경기의 명단 재계산 이벤트가 처리 전이면…` |
| 가드 2번(`playable`)을 항상 true 로 | `취소된 팀매치는 게임이 SCHEDULED 여도 QUICK_RESULT_FIXTURE_CANCELLED` |
| 가드 3번 `count … > 0` 을 `< 0` 으로 | `득점 기록이 하나라도 있으면 QUICK_RESULT_HAS_LIVE_RECORDS` |

- [ ] **Step 7: 커밋**

```bash
git commit -m "feat(results): 빠른 결과 입장 조건 검증 추가" -- apps/v1_api/src/tournament-operations/results/tournament-result-review.service.ts apps/v1_api/src/tournament-operations/results/tournament-result-review.quick-result.spec.ts
git show --stat HEAD
```
Expected: 파일 2개만.

---

### Task 5c: `quickResult` 승부차기 · 리비전 쓰기 · 확정 파이프라인 연결

**Files:**
- Modify: `apps/v1_api/src/tournament-operations/results/tournament-result-review.service.ts` (`enterQuickResult` 의 마지막 거부 줄, import)
- Test: `apps/v1_api/src/tournament-operations/results/tournament-result-review.quick-result.spec.ts`(이어 쓴다)

**Interfaces:**
- Consumes: `assertPenaltiesForRevision`(:1226), `loadOfficialRevisionRow`, `writeOutbox`, `assertTransition`(전부 같은 클래스), `completeTeamMatchAtResultBoundary(tx, teamMatchId, actorUserId, reason)`(`games/team-match-result-boundary.ts`), `projectCanonicalAdvancement(tx, revisionRow, score)`, `parseOfficialScore`, `parseLineupCatalog(lineup)`, Task 1 의 `'ADMIN_QUICK'`, Task 2(PR-1a 산출물)의 `QUICK_RESULT_REASON_MARKER`
- Produces: 입장 조건을 통과한 경기가 `DRAFT → 참가자 → OFFICIAL` 로 쓰이고 `GAME_RESULT_OFFICIAL` outbox 하나만 남는다. 응답은 5a 의 `QuickResultResponse`.

- [ ] **Step 1: 쓰기·승부차기 테스트를 이어 쓴다**

같은 파일 끝에 이어 붙인다. 뼈대의 마지막 줄이 입장 조건을 통과한 경기까지 거부하므로 이 테스트들이 red 다.

```ts
describe('quickResult — 정상 입력은 한 번에 공식 확정된다', () => {
  it('최초 입력: 초안(승계 없음) → 참가자 → 확정 순으로 쓴다', async () => {
    const harness = createHarness();

    const response = await harness.run({ home: 2, away: 1 });

    expect(response).toEqual({ gameId: ids.game, revisionId: 'quick-rev-1', version: GAME_VERSION + 1, score: { home: 2, away: 1 } });
    expect(harness.created).toHaveLength(1);
    expect(harness.created[0]).toMatchObject({
      gameId: ids.game,
      revision: 1,
      reason: QUICK_RESULT_REASON_MARKER,
      goalEvents: [],
      eventsHash: canonicalGameCommandPayloadHash([]),
      missingScorer: false,
      createdByActorType: 'USER',
      createdByUserId: ids.user,
    });
    expect(harness.created[0].score).toEqual({ home: 2, away: 1 });
    // 초안으로 만든 뒤(참가자 insert 트리거가 DRAFT 만 허용한다) 같은 행을 확정으로 올린다.
    expect(harness.created[0]).not.toHaveProperty('state');
    expect(harness.created[0]).not.toHaveProperty('supersedesId');
    expect(harness.revisionUpdates).toHaveLength(1);
    expect(harness.revisionUpdates[0].data).toMatchObject({
      state: V1GameResultRevisionState.OFFICIAL,
      submittedAt: expect.any(Date),
      officialAt: expect.any(Date),
    });
    // 확정 뒤 게임 상태·포인터·팀매치 completed·다음 경기 칸은 DB 로 관측되는 결과라 통합 스펙 7b 가 단언한다.
  });

  it('GAME_RESULT_OFFICIAL 하나만 남기고 검토 알림 대상인 GAME_RESULT_SUBMITTED 는 쓰지 않는다', async () => {
    const harness = createHarness();

    await harness.run({ home: 2, away: 1 });

    expect(harness.outbox).toHaveLength(1);
    expect(harness.outbox[0]).toMatchObject({
      businessKey: `game:${ids.game}:revision:1:officialize`,
      aggregateType: 'GAME',
      aggregateId: ids.game,
      type: 'GAME_RESULT_OFFICIAL',
      revisionId: 'quick-rev-1',
    });
  });

  it('참가자는 사이드별 최신 무효화되지 않은 라인업 리비전의 선수 전원이고 기록은 0 이다 — 옛 명단·무효화된 명단은 섞이지 않는다', async () => {
    const harness = createHarness();

    await harness.run({ home: 2, away: 1 });

    expect(harness.participantRows.map((row) => row.participantId)).toEqual(['p-home-gk', 'p-home-fw', 'p-away-gk']);
    for (const row of harness.participantRows) {
      expect(row).toMatchObject({
        resultRevisionId: 'quick-rev-1',
        started: true,
        goals: 0,
        assists: 0,
        fouls: 0,
        cards: { yellow: 0, red: 0 },
      });
    }
    expect(Object.fromEntries(harness.participantRows.map((row) => [row.participantId, row.goalkeeper]))).toEqual({
      'p-home-gk': true,
      'p-home-fw': false,
      'p-away-gk': true,
    });
  });

  it('권한 검사는 result_officialize 로, 그 경기의 대회를 대상으로 한다', async () => {
    const harness = createHarness();

    await harness.run({ home: 2, away: 1 });

    expect(harness.staffAccessInputs[0]).toMatchObject({ action: 'result_officialize', resource: { tournamentId: ids.tournament } });
  });

  it('정규 리그 경기도 같은 경로로 확정된다', async () => {
    const harness = createHarness({ source: 'league' });

    await harness.run({ home: 0, away: 0 });

    expect(harness.revisionUpdates[0].data).toMatchObject({ state: V1GameResultRevisionState.OFFICIAL });
    expect(harness.outbox.map((row) => row.type)).toEqual(['GAME_RESULT_OFFICIAL']);
  });
});


describe('quickResult — 무효(VOID) 뒤 재입력 — 쓰기', () => {
  const voided: StoredRevision = { id: 'void-rev', revision: 3, state: V1GameResultRevisionState.VOID };
  const reentry = { gameState: 'ENDED', revisions: [voided], pointerId: 'void-rev', teamMatchStatus: 'completed' } as const;

  it('VOID 리비전을 승계하는 새 리비전을 만들고, 번호는 이어서 센다', async () => {
    const harness = createHarness(reentry);

    await harness.run({ home: 0, away: 3 });

    expect(harness.created[0]).toMatchObject({ revision: 4, supersedesId: 'void-rev', reason: QUICK_RESULT_REASON_MARKER });
    expect(harness.revisionUpdates[0].data).toMatchObject({ state: V1GameResultRevisionState.OFFICIAL });
  });
});

describe('quickResult — 승부차기(킥 수는 요구하지 않는다)', () => {
  it('결선 무승부에 승부차기가 없으면 TOURNAMENT_PENALTY_REQUIRED', async () => {
    const harness = createHarness({ phase: 'semi' });

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 1 })), 409, 'TOURNAMENT_PENALTY_REQUIRED');
    expectNoWrites(harness);
  });

  it('결선 무승부 + 점수만 있는 승부차기는 저장된다 — 킥 수·선축 키 없이 정확히 그 값만', async () => {
    const harness = createHarness({ phase: 'semi' });

    const response = await harness.run({ home: 1, away: 1, penalties: { home: 5, away: 4 } });

    expect(harness.created[0].score).toEqual({ home: 1, away: 1, penalties: { home: 5, away: 4 } });
    expect(response.score).toEqual({ home: 1, away: 1, penalties: { home: 5, away: 4 } });
  });

  it('조별 경기의 무승부는 정상이고, 승부차기를 실으면 TOURNAMENT_PENALTY_NOT_ALLOWED', async () => {
    const group = createHarness({ phase: 'group', hasAdvancementEdge: false });
    await group.run({ home: 1, away: 1 });
    expect(group.created).toHaveLength(1);

    const withPenalties = createHarness({ phase: 'group', hasAdvancementEdge: false });
    expectHttp(
      await captureFailure(() => withPenalties.run({ home: 1, away: 1, penalties: { home: 5, away: 4 } })),
      409,
      'TOURNAMENT_PENALTY_NOT_ALLOWED',
    );
    expectNoWrites(withPenalties);
  });

  it('정규시간에 승부가 난 결선 경기에 승부차기를 실으면 TOURNAMENT_PENALTY_NOT_ALLOWED', async () => {
    const harness = createHarness({ phase: 'semi' });

    expectHttp(
      await captureFailure(() => harness.run({ home: 2, away: 1, penalties: { home: 5, away: 4 } })),
      409,
      'TOURNAMENT_PENALTY_NOT_ALLOWED',
    );
    expectNoWrites(harness);
  });

  it('무효 뒤 재입력은 옛 승부차기를 승계하지 않는다 — 결선 무승부는 다시 입력해야 한다', async () => {
    const harness = createHarness({
      phase: 'semi',
      gameState: 'ENDED',
      teamMatchStatus: 'completed',
      pointerId: 'void-rev',
      revisions: [
        {
          id: 'void-rev',
          revision: 2,
          state: V1GameResultRevisionState.VOID,
          score: { home: 1, away: 1, penalties: { home: 5, away: 4 } },
        },
      ],
    });

    expectHttp(await captureFailure(() => harness.run({ home: 1, away: 1 })), 409, 'TOURNAMENT_PENALTY_REQUIRED');
    expectNoWrites(harness);
  });
});

```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --maxWorkers=1 src/tournament-operations/results/tournament-result-review.quick-result.spec.ts`
Expected: FAIL — 정상 입력·승부차기·VOID 재입력 쓰기 케이스가 `QUICK_RESULT_NOT_AVAILABLE` 로 거부된다.

- [ ] **Step 3: 서비스 구현 — import**

`import { parseResultPolicy } from '../../tournaments/competition-config/competition-config.parse';` 를 바꾼다.

```ts
import { parseLineupCatalog, parseResultPolicy } from '../../tournaments/competition-config/competition-config.parse';
```

아래 한 줄을 import 구역에 추가한다.

```ts
import { QUICK_RESULT_REASON_MARKER } from './quick-result.constants';
```

- [ ] **Step 4: 서비스 구현 — 승부차기 · 쓰기 · 후속 호출**

`enterQuickResult` 에서 5b 가 둔 주석 `// 5c 가 승부차기 검증과 쓰기 흐름을 …` 부터 마지막 `throw quickResultConflict('QUICK_RESULT_NOT_AVAILABLE', '아직 …')` 줄까지를 아래로 바꾼다.

```ts
    // 6. 승부차기: 기존 검증 순서·코드 그대로. base 점수는 null 로 넘겨 무효된 옛 승부차기를 승계하지 않고,
    //    이벤트가 0건이라 킥 수는 요구되지 않는다(Task 3).
    const score = await this.assertPenaltiesForRevision(tx, game, null, dto.score);

    if (voidBase !== null) {
      try {
        assertRevisionSupersession({
          baseGameId: game.id,
          successorGameId: game.id,
          baseRevisionId: voidBase.id,
          supersedesRevisionId: voidBase.id,
          baseState: voidBase.state,
          successorState: V1GameResultRevisionState.DRAFT,
          purpose: 'VOID_REENTRY',
        });
      } catch (error) {
        if (error instanceof GameContractError) {
          throw toGameHttpException(error);
        }
        throw error;
      }
    }

    // 7. 쓰기. 참가자 insert 트리거가 DRAFT 리비전만 허용하므로 초안 → 참가자 → 확정 순서다.
    const goalkeeperPositionCode =
      parseLineupCatalog(config?.lineup ?? null).positions.find((position) => position.goalkeeper === true)?.code ??
      'GK';
    const now = new Date();
    const draft = await tx.v1GameResultRevision.create({
      data: {
        gameId: game.id,
        revision: (latest?.revision ?? 0) + 1,
        score: jsonInput(score),
        goalEvents: jsonInput([]),
        eventsHash: canonicalGameCommandPayloadHash([]),
        missingScorer: false,
        reason: QUICK_RESULT_REASON_MARKER,
        createdByActorType: 'USER',
        createdByUserId: userId,
        ...(voidBase === null ? {} : { supersedesId: voidBase.id }),
      },
    });
    await tx.v1GameResultParticipant.createMany({
      data: roster.map((player) => ({
        resultRevisionId: draft.id,
        participantId: player.id,
        sideId: player.sideId,
        started: true,
        goals: 0,
        assists: 0,
        fouls: 0,
        cards: jsonInput({ yellow: 0, red: 0 }),
        goalkeeper: player.position === goalkeeperPositionCode,
      })),
    });
    this.assertTransition({ from: draft.state, to: V1GameResultRevisionState.OFFICIAL, flow: 'ADMIN_QUICK' });
    const officialized = await tx.v1GameResultRevision.update({
      where: { id: draft.id },
      data: { state: V1GameResultRevisionState.OFFICIAL, submittedAt: now, officialAt: now },
    });
    const updated = await tx.v1Game.update({
      where: { id: game.id },
      data: {
        state: V1GameState.ENDED,
        version: { increment: 1 },
        currentOfficialRevisionId: officialized.id,
      },
    });
    await tx.v1GamePeriod.updateMany({
      where: { gameId: game.id, state: { in: [V1GamePeriodState.LIVE, V1GamePeriodState.HALFTIME] } },
      data: { state: V1GamePeriodState.ENDED, endedAt: now },
    });

    // 8. 일반 확정과 같은 후속 호출. 진출은 결과 경계(팀매치 completed)가 먼저 서야 한다.
    await completeTeamMatchAtResultBoundary(tx, teamMatchId, userId, 'admin_quick_result');
    const canonicalRevision = await this.loadOfficialRevisionRow(tx, officialized.id);
    if (canonicalRevision !== null && canonicalRevision.tournamentTeamMatchId !== null) {
      await projectCanonicalAdvancement(tx, canonicalRevision, parseOfficialScore(canonicalRevision.score));
    }
    await this.writeOutbox(
      tx,
      `game:${game.id}:revision:${officialized.revision}:officialize`,
      game.id,
      'GAME_RESULT_OFFICIAL',
      { revisionId: officialized.id },
      officialized.id,
    );
    return {
      gameId: game.id,
      state: updated.state,
      version: updated.version,
      durableCommandId: context.durableCommandId,
      replayed: false,
      revisionId: officialized.id,
      revision: officialized.revision,
      revisionState: officialized.state,
      score,
    };
```

(이 코드 블록은 메서드 본문 끝까지다. 메서드를 닫는 `  }` 는 뼈대의 것을 그대로 쓴다.)

- [ ] **Step 5: 통과를 확인한다**

Run:
```bash
cd apps/v1_api && ./node_modules/.bin/jest --maxWorkers=1 \
  src/tournament-operations/results/tournament-result-review.quick-result.spec.ts \
  src/tournament-operations/results/tournament-result-review.service.spec.ts \
  src/games/core/revision-state-machine.spec.ts && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
```
Expected: PASS 전부(새 스펙 약 24개 + 기존 서비스 스펙 회귀 없음), tsc 0 에러.

- [ ] **Step 6: 변이로 테스트가 실제 버그를 잡는지 확인한다 (커밋하지 않는다)**

| 변이 | 기대 red |
|---|---|
| `selectLineupParticipantsWithDraftFallback(candidates, lineups)` → `candidates` 그대로 | `참가자는 사이드별 최신 무효화되지 않은 라인업…` |
| 라인업 조회 `where` 의 `invalidatedAt: null` 삭제 | 같은 테스트(무효화된 리비전 3 의 `p-home-stale` 이 최신이 되어 명단이 바뀐다) |
| `assertPenaltiesForRevision(tx, game, null, …)` → `latest?.score ?? null` 을 넘김(select 에 `score: true` 추가) | `무효 뒤 재입력은 옛 승부차기를 승계하지 않는다…` |
| `voidBase !== null && teamMatch.status === completed` 항 삭제 | `VOID 리비전을 승계하는 새 리비전을 만들고…` |

- [ ] **Step 7: 커밋**

```bash
git commit -m "feat(results): 어드민 빠른 결과 확정 쓰기와 후속 처리 연결" -- apps/v1_api/src/tournament-operations/results/tournament-result-review.service.ts apps/v1_api/src/tournament-operations/results/tournament-result-review.quick-result.spec.ts
git show --stat HEAD
```
Expected: 파일 2개만.

---

### Task 6: 어드민 컨트롤러와 모듈 배선

**Files:**
- Create: `apps/v1_api/src/tournament-operations/results/admin-quick-result.controller.ts`
- Test: `apps/v1_api/src/tournament-operations/results/admin-quick-result.controller.spec.ts`
- Modify: `apps/v1_api/src/tournaments/tournaments.module.ts:42`(import), `:93`(controllers)

**Interfaces:**
- Consumes: `AdminContextService.getMutationAdmin(userId)`(`common/admin-context.service.ts`, support 403), `TournamentResultReviewService.quickResult`(Task 5c), `QuickResultDto`(Task 4). `AdminContextModule` 은 `TournamentsModule` 이 이미 import 한다(`tournaments.module.ts:71`).
- Produces: `POST /api/v1/admin/games/:gameId/quick-result` (헤더 `Idempotency-Key`), 201 `{ status, data: { gameId, revisionId, version, score }, timestamp }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`admin-quick-result.controller.spec.ts`:

```ts
import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminQuickResultController } from './admin-quick-result.controller';
import type { QuickResultDto } from './quick-result.dto';

const user: V1AuthUser = {
  id: '7c1f0000-0000-4000-8000-000000000001',
  email: 'ops@example.test',
  accountStatus: 'active',
  onboardingStatus: 'completed',
};
const dto: QuickResultDto = {
  clientCommandId: '7c1f0000-0000-4000-8000-0000000000aa',
  expectedVersion: 2,
  score: { home: 3, away: 1 },
};

describe('AdminQuickResultController', () => {
  it('라우트 계약 — POST admin/games/:gameId/quick-result', () => {
    expect(Reflect.getMetadata('path', AdminQuickResultController)).toBe('admin/games');
    expect(Reflect.getMetadata('path', AdminQuickResultController.prototype.quickResult)).toBe(':gameId/quick-result');
    // RequestMethod.POST === 1
    expect(Reflect.getMetadata('method', AdminQuickResultController.prototype.quickResult)).toBe(1);
  });

  it('어드민 mutation 게이트가 거부하면(support 등) 서비스를 부르지 않는다', async () => {
    const quickResult = jest.fn();
    const getMutationAdmin = jest.fn().mockRejectedValue(
      new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Support admins cannot mutate' }),
    );
    const controller = new AdminQuickResultController({ getMutationAdmin } as never, { quickResult } as never);

    await expect(controller.quickResult(user, 'game-1', 'key-1', dto)).rejects.toBeInstanceOf(ForbiddenException);

    expect(getMutationAdmin).toHaveBeenCalledWith(user.id);
    expect(quickResult).not.toHaveBeenCalled();
  });

  it('게이트를 지나면 헤더 키와 본문을 그대로 서비스에 넘기고 응답을 돌려준다', async () => {
    const response = { gameId: 'game-1', revisionId: 'rev-1', version: 3, score: { home: 3, away: 1 } };
    const quickResult = jest.fn().mockResolvedValue(response);
    const controller = new AdminQuickResultController(
      { getMutationAdmin: jest.fn().mockResolvedValue({ adminRole: 'ops' }) } as never,
      { quickResult } as never,
    );

    await expect(controller.quickResult(user, 'game-1', 'key-1', dto)).resolves.toBe(response);

    expect(quickResult).toHaveBeenCalledWith(user, 'game-1', dto, 'key-1');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --maxWorkers=1 src/tournament-operations/results/admin-quick-result.controller.spec.ts`
Expected: FAIL — `Cannot find module './admin-quick-result.controller'`.

- [ ] **Step 3: 구현**

`admin-quick-result.controller.ts`:

```ts
import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { AdminContextService } from '../../common/admin-context.service';
import { QuickResultDto } from './quick-result.dto';
import { TournamentResultReviewService } from './tournament-result-review.service';

/** 대진 그림 편집기의 빠른 결과 입력. 플랫폼 어드민(owner·ops) 전용이다. */
@Controller('admin/games')
@UseGuards(V1AuthGuard)
export class AdminQuickResultController {
  constructor(
    private readonly adminContext: AdminContextService,
    private readonly resultReview: TournamentResultReviewService,
  ) {}

  @Post(':gameId/quick-result')
  async quickResult(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: QuickResultDto,
  ) {
    // support 어드민과 비어드민을 서비스 앞에서 막는다. 서비스는 platform_ops 역할을 한 번 더 확인한다.
    await this.adminContext.getMutationAdmin(user.id);
    return this.resultReview.quickResult(user, gameId, dto, idempotencyKey);
  }
}
```

`tournaments.module.ts` 에 import 한 줄과 controllers 항목을 추가한다.

```ts
import { AdminQuickResultController } from '../tournament-operations/results/admin-quick-result.controller';
```
(기존 `TournamentResultReviewController` import 바로 위.) `controllers` 배열에서 `TournamentResultReviewController,` 바로 위에 `AdminQuickResultController,` 를 넣는다.

- [ ] **Step 4: 통과를 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --maxWorkers=1 src/tournament-operations/results/admin-quick-result.controller.spec.ts && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-surface-check.mjs`
Expected: PASS(3 tests), tsc 0 에러, surface check 통과.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(results): POST /admin/games/:gameId/quick-result 컨트롤러 추가" -- apps/v1_api/src/tournament-operations/results/admin-quick-result.controller.ts apps/v1_api/src/tournament-operations/results/admin-quick-result.controller.spec.ts apps/v1_api/src/tournaments/tournaments.module.ts
git show --stat HEAD
```

---

### Task 7: 통합 스펙 — 실제 Postgres·HTTP 로 증명할 계약 (7a · 7b · 7c)

단위 스펙이 못 보는 것(진출·순위·전적·알림 워커 소비, 실제 트리거·잠금, 권한 가드, 멱등 재생, 롤백)을 CI 에서 증명한다. 로컬에는 `DATABASE_URL` 이 없어 타입 확인까지만 하고, **실제 실행은 push 한 브랜치의 CI 가 한다**(아래 7a Step 5 의 "CI 결과 읽기"). 스펙 파일 하나를 **계약 묶음 세 개**로 나눠 순서대로 키우고, 묶음마다 `쓰기 → 타입 확인 → 커밋 → push → CI 결과 읽기` 한 바퀴를 돈다 — 한 번에 700줄을 쓰고 한 번에 red 를 읽으면 어느 시드 가정이 틀렸는지 가려내기 어렵다.

| 묶음 | 닫는 계약 | 테스트 |
|---|---|---|
| 7a | 뼈대·픽스처·HTTP 헬퍼 · 권한(support·디렉터·일반 403, 비로그인 401) · 멱등 재생 · `IDEMPOTENCY_PAYLOAD_CONFLICT` 409 · version/키 불일치 | 3 |
| 7b | 확정(OFFICIAL·진출·팀매치 completed·outbox·감사) · 결선 무승부 승부차기 · 워커 소비(공식 기록·알림·결승 홈/원정 칸) · 출전자 선정(무효화된 라인업 제외) · 정규 리그(완료 투영·취소·명단 동기화) · 친선 거부 · 기록 있음·팀 미정 거부 | 11 |
| 7c | 정정의 킥 수 면제 · 이미 확정된 경기(대조군: 팀매치 completed 인데 VOID 아님) · 무효 뒤 재입력(completed 허용) · 다음 경기 시작 409 전부 롤백 | 4 |

세 묶음은 같은 파일에 이어 붙이며, 앞 묶음이 CI 에서 green 인 것을 읽은 뒤에 다음 묶음을 시작한다(앞 묶음의 시드 가정이 틀렸으면 거기서 고치고 간다).

**Files:**
- Create: `apps/v1_api/test/tournaments/tournament-quick-result.integration-spec.ts` (7a 가 만들고 7b·7c 가 이어 붙인다)
- Create: `.changeset/admin-quick-result.md` (7a Step 1 — 첫 push 전에 있어야 CI 의 변경 게이트가 통과한다)

**Interfaces:**
- Consumes: `createV1IntegrationApp()`(`test/integration/integration-app.ts`), `seedLeagueOnTournamentAxis`(`test/fixtures/league-on-tournament-axis.fixture.ts`), `drainOutboxWorker(prisma)`(`test/helpers/drain-outbox-worker.ts`), `GamesService.createFromSourceInTransaction`, `TournamentResultReviewService`(정정·무효·확정), `ManagedTermsRuntimeService`(약관 동의 — 동의 없는 사용자는 전 API 가 막힌다)

### Task 7a: 뼈대 · 권한 · 멱등 · `IDEMPOTENCY_PAYLOAD_CONFLICT`

- [ ] **Step 1: changeset 을 먼저 만든다**

`deploy.yml` 의 첫 스텝이 "Verify release changeset" 이라, `apps/v1_api/src` 를 바꾼 이 브랜치를 changeset 없이 push 하면 CI 가 통합 스텝에 닿기 전에 red 가 된다. Task 8 Step 2 의 내용 그대로 `.changeset/admin-quick-result.md` 를 지금 만들고(Task 8 은 내용을 다시 확인만 한다), 아래 Step 7 의 첫 커밋에 포함한다.

- [ ] **Step 2: 뼈대·픽스처·HTTP 헬퍼를 쓴다**

```ts
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import request = require('supertest');
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { TournamentResultReviewService } from '../../src/tournament-operations/results/tournament-result-review.service';
import { seedLeagueOnTournamentAxis } from '../fixtures/league-on-tournament-axis.fixture';
import { drainOutboxWorker } from '../helpers/drain-outbox-worker';
import { createV1IntegrationApp } from '../integration/integration-app';

/**
 * 어드민 빠른 결과 확정(`POST /admin/games/:gameId/quick-result`) 통합 계약.
 * 유닛 스펙은 게이트와 쓰는 행을 고정하고, 여기서는 진출·워커 소비·권한·멱등·롤백을 실제 DB 로 본다.
 */
const suite = randomUUID().slice(0, 8);
const users = {
  ops: randomUUID(),
  support: randomUUID(),
  director: randomUUID(),
  plain: randomUUID(),
  ownerA: randomUUID(),
  ownerB: randomUUID(),
};

let app: INestApplication;
let cleanup: (() => Promise<void>) | undefined;
let prisma: PrismaService;
let games: GamesService;
let resultReview: TournamentResultReviewService;
let configId: string;
let sportId: string;
let regionId: string;
let opsAdminRowId: string;
const teams: Record<'a' | 'b' | 'c' | 'd', string> = { a: randomUUID(), b: randomUUID(), c: randomUUID(), d: randomUUID() };

const authUser = (id: string) => ({
  id,
  email: `${id}@quick-result.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

async function createUser(id: string, adminRole?: 'owner' | 'ops' | 'support'): Promise<string | null> {
  await prisma.v1User.create({
    data: {
      id,
      email: `${id}@quick-result.test`,
      onboardingStatus: 'completed',
      phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
      accountStatus: 'active',
    },
  });
  const terms = app.get(ManagedTermsRuntimeService);
  const signup = await terms.currentSignupTerms();
  await terms.acceptSignupTerms(
    id,
    signup.items.filter((item) => item.requirement === 'required').map((item) => item.documentId),
  );
  if (adminRole === undefined) return null;
  const admin = await prisma.v1AdminUser.create({ data: { userId: id, adminRole, status: 'active' } });
  return admin.id;
}

function sourceContext(payload: unknown, commandId: string): GameCommandContext {
  return {
    actor: { actorType: 'USER', actorUserId: users.ops, role: 'platform_ops' },
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

type FixtureSide = { teamId: string | null; withPlayer: boolean };

/** 팀매치 + 게임(+ 사이드마다 선수 1명, GK). 게임 id 를 돌려준다. */
async function createGameFor(teamMatchId: string, home: FixtureSide, away: FixtureSide): Promise<string> {
  const participants: GameSourceCreationInput['participants'] = [
    ...(home.withPlayer
      ? [{ sourceParticipantId: `${teamMatchId}-home`, sideKey: V1GameSideKey.HOME, displayNameSnapshot: '홈 선수', position: 'GK' }]
      : []),
    ...(away.withPlayer
      ? [{ sourceParticipantId: `${teamMatchId}-away`, sideKey: V1GameSideKey.AWAY, displayNameSnapshot: '원정 선수', position: 'GK' }]
      : []),
  ];
  const input: GameSourceCreationInput = {
    sourceType: V1GameSourceType.TEAM_MATCH,
    sourceId: teamMatchId,
    competitionConfigVersionId: configId,
    sides: [
      { sideKey: V1GameSideKey.HOME, teamId: home.teamId, displayNameSnapshot: home.teamId === null ? 'TBD' : '홈 팀' },
      { sideKey: V1GameSideKey.AWAY, teamId: away.teamId, displayNameSnapshot: away.teamId === null ? 'TBD' : '원정 팀' },
    ],
    participants,
  };
  const created = await prisma.$transaction((tx) =>
    games.createFromSourceInTransaction(tx, input, sourceContext(input, `qr-src-${teamMatchId}`)),
  );
  return created.gameId;
}

type Bracket = {
  tournamentId: string;
  registration: Record<'a' | 'b' | 'c' | 'd', string>;
  semi1: { teamMatchId: string; gameId: string };
  semi2: { teamMatchId: string; gameId: string };
  final: { teamMatchId: string; gameId: string };
};

/** 4강 2경기(A–B, C–D) + 결승(양 팀 미정). 4강 승자가 결승 HOME/AWAY 로 진출한다. */
async function createBracket(): Promise<Bracket> {
  const tournamentId = randomUUID();
  await prisma.v1Tournament.create({
    data: {
      id: tournamentId,
      sportId,
      regionId,
      title: `QR 토너먼트 ${suite} ${tournamentId.slice(0, 4)}`,
      status: 'in_progress',
      kind: 'regular_tournament',
      format: 'knockout',
      competitionConfigVersionId: configId,
    },
  });
  const registration = { a: randomUUID(), b: randomUUID(), c: randomUUID(), d: randomUUID() };
  await prisma.v1TournamentRegistration.createMany({
    data: (['a', 'b', 'c', 'd'] as const).map((key) => ({
      id: registration[key],
      tournamentId,
      teamId: teams[key],
      appliedByUserId: users.ops,
      status: 'confirmed' as const,
    })),
  });
  const semiGroupId = randomUUID();
  const finalGroupId = randomUUID();
  await prisma.v1TournamentGroup.createMany({
    data: [
      { id: semiGroupId, tournamentId, name: '4강', phase: 'semi' },
      { id: finalGroupId, tournamentId, name: '결승', phase: 'final' },
    ],
  });

  const makeFixture = async (
    groupId: string,
    round: string,
    fixtureNumber: number,
    home: 'a' | 'b' | 'c' | 'd' | null,
    away: 'a' | 'b' | 'c' | 'd' | null,
  ) => {
    const teamMatchId = randomUUID();
    await prisma.v1TeamMatch.create({
      data: {
        id: teamMatchId,
        tournamentId,
        sportId,
        title: `QR ${round} ${fixtureNumber}`,
        status: 'matched',
        competitionConfigVersionId: configId,
        hostTeamId: home === null ? null : teams[home],
        approvedApplicantTeamId: away === null ? null : teams[away],
      },
    });
    await prisma.v1TournamentMatchDetails.create({
      data: {
        teamMatchId,
        tournamentId,
        groupId,
        round,
        fixtureNumber,
        homeRegistrationId: home === null ? null : registration[home],
        awayRegistrationId: away === null ? null : registration[away],
      },
    });
    const gameId = await createGameFor(
      teamMatchId,
      { teamId: home === null ? null : teams[home], withPlayer: home !== null },
      { teamId: away === null ? null : teams[away], withPlayer: away !== null },
    );
    return { teamMatchId, gameId };
  };

  const semi1 = await makeFixture(semiGroupId, '4강', 1, 'a', 'b');
  const semi2 = await makeFixture(semiGroupId, '4강', 2, 'c', 'd');
  const final = await makeFixture(finalGroupId, '결승', 3, null, null);
  await prisma.v1TournamentMatchAdvancementEdge.createMany({
    data: [
      { tournamentId, sourceTeamMatchId: semi1.teamMatchId, sourceOutcome: 'WINNER', targetTeamMatchId: final.teamMatchId, targetSide: 'HOME' },
      { tournamentId, sourceTeamMatchId: semi2.teamMatchId, sourceOutcome: 'WINNER', targetTeamMatchId: final.teamMatchId, targetSide: 'AWAY' },
    ],
  });
  return { tournamentId, registration, semi1, semi2, final };
}

type QuickScore = { home: number; away: number; penalties?: { home: number; away: number } };

async function gameVersion(gameId: string): Promise<number> {
  return (await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } })).version;
}

async function quickResult(
  gameId: string,
  userId: string | null,
  score: QuickScore,
  options: { key?: string; headerKey?: string; version?: number } = {},
) {
  const key = options.key ?? randomUUID();
  const version = options.version ?? (await gameVersion(gameId));
  let call = request(app.getHttpServer()).post(`/api/v1/admin/games/${gameId}/quick-result`);
  if (userId !== null) call = call.set('x-v1-user-id', userId);
  return call.set('Idempotency-Key', options.headerKey ?? key).send({ clientCommandId: key, expectedVersion: version, score });
}

const revisionCount = (gameId: string) => prisma.v1GameResultRevision.count({ where: { gameId } });
const outboxCount = (gameId: string, type: string) =>
  prisma.v1OutboxEvent.count({ where: { aggregateType: 'GAME', aggregateId: gameId, type } });
const finalDetails = (teamMatchId: string) =>
  prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId } });

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for the quick-result integration suite');
  }
  ({ app, cleanup } = await createV1IntegrationApp());
  prisma = app.get(PrismaService);
  games = app.get(GamesService);
  resultReview = app.get(TournamentResultReviewService);

  opsAdminRowId = (await createUser(users.ops, 'ops')) as string;
  await createUser(users.support, 'support');
  await createUser(users.director);
  await createUser(users.plain);
  await createUser(users.ownerA);
  await createUser(users.ownerB);

  const config = await prisma.v1CompetitionConfigVersion.findFirst({
    where: { name: 'futsal-v1', status: 'ACTIVE' },
    orderBy: { version: 'desc' },
  });
  if (config === null) throw new Error('futsal-v1 프리셋이 필요하다');
  configId = config.id;
  sportId = (
    await prisma.v1Sport.upsert({ where: { code: 'futsal' }, create: { code: 'futsal', name: '풋살' }, update: {} })
  ).id;
  regionId = (await prisma.v1Region.create({ data: { code: `QR_REGION_${suite}`, name: 'QR 지역', level: 1 } })).id;
  for (const key of ['a', 'b', 'c', 'd'] as const) {
    await prisma.v1Team.create({
      data: { id: teams[key], ownerUserId: users.ops, sportId, regionId, name: `QR-${suite}-${key.toUpperCase()}` },
    });
  }
  // 완료 알림 수신자는 양 팀 owner·manager 활성 멤버십이다.
  await prisma.v1TeamMembership.createMany({
    data: [
      { teamId: teams.a, userId: users.ownerA, role: 'owner', status: 'active' },
      { teamId: teams.b, userId: users.ownerB, role: 'owner', status: 'active' },
    ],
  });
});


/** 대진 경기의 "완료" 알림 수(양 팀 owner 1명씩이면 2). 정정 뒤에도 늘지 않아야 한다. */
function notifiedCount(teamMatchId: string): Promise<number> {
  return prisma.v1Notification.count({ where: { businessKey: { startsWith: `tournament-fixture-completed:${teamMatchId}:` } } });
}

afterAll(async () => cleanup?.());
```

- [ ] **Step 3: 타입 확인 (로컬)**

통합 스펙은 `tsconfig.json` 의 `include` 밖이라 임시 설정으로만 확인한다. 이 시점에는 `it` 이 없어 jest 는 돌리지 않는다.

Run:
```bash
cd apps/v1_api && printf '{ "extends": "./tsconfig.json", "include": ["test/tournaments/tournament-quick-result.integration-spec.ts"] }' > tsconfig.qr-spec.json && ./node_modules/.bin/tsc --noEmit -p tsconfig.qr-spec.json; rm -f tsconfig.qr-spec.json
```
Expected: 에러 0. 임시 파일은 같은 명령에서 지워지며 커밋하지 않는다.

- [ ] **Step 4: 권한 · 요청 경계 · 멱등 테스트를 이어 붙인다**

파일 끝에 이어 붙인다.

```ts
describe('빠른 결과 — 권한', () => {
  it('support 어드민·대회 디렉터·일반 사용자는 403 이고 아무것도 쓰지 않는다 — 비로그인은 401, 플랫폼 어드민은 같은 경기를 확정한다', async () => {
    const bracket = await createBracket();
    const { gameId } = bracket.semi1;
    // 디렉터는 이 대회의 스태프 배정이 있어도 어드민이 아니면 이 경로를 못 쓴다.
    await prisma.v1TournamentStaffAssignment.create({
      data: { tournamentId: bracket.tournamentId, userId: users.director, role: 'TOURNAMENT_DIRECTOR', grantedByUserId: users.ops },
    });

    for (const userId of [users.support, users.director, users.plain]) {
      const response = await quickResult(gameId, userId, { home: 1, away: 0 });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('PERMISSION_DENIED');
    }
    expect((await quickResult(gameId, null, { home: 1, away: 0 })).status).toBe(401);
    expect(await revisionCount(gameId)).toBe(0);
    expect(await outboxCount(gameId, 'GAME_RESULT_OFFICIAL')).toBe(0);

    expect((await quickResult(gameId, users.ops, { home: 1, away: 0 })).status).toBe(201);
  });
});

describe('빠른 결과 — 요청 경계', () => {
  it('expectedVersion 이 낡았으면 409 VERSION_CONFLICT, Idempotency-Key 가 본문과 다르면 422', async () => {
    const bracket = await createBracket();
    const { gameId } = bracket.semi1;
    const version = await gameVersion(gameId);

    const stale = await quickResult(gameId, users.ops, { home: 1, away: 0 }, { version: version + 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');

    const mismatch = await quickResult(gameId, users.ops, { home: 1, away: 0 }, { headerKey: randomUUID() });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.code).toBe('COMMAND_IDEMPOTENCY_KEY_MISMATCH');

    expect(await revisionCount(gameId)).toBe(0);
  });
});

describe('빠른 결과 — 멱등 재생', () => {
  it('같은 키·같은 본문의 재요청은 같은 응답이고 새 행을 만들지 않는다 — 같은 키에 다른 본문은 충돌이다', async () => {
    const bracket = await createBracket();
    const { gameId } = bracket.semi1;
    const key = randomUUID();
    const version = await gameVersion(gameId);

    const first = await quickResult(gameId, users.ops, { home: 2, away: 1 }, { key, version });
    const replay = await quickResult(gameId, users.ops, { home: 2, away: 1 }, { key, version });

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body.data).toEqual(first.body.data);
    expect(await revisionCount(gameId)).toBe(1);
    expect(await outboxCount(gameId, 'GAME_RESULT_OFFICIAL')).toBe(1);

    const conflicting = await quickResult(gameId, users.ops, { home: 3, away: 0 }, { key, version });
    expect(conflicting.status).toBe(409);
    expect(conflicting.body.code).toBe('IDEMPOTENCY_PAYLOAD_CONFLICT');
    expect(await revisionCount(gameId)).toBe(1);
  });
});
```

---

### Task 7b: 확정 · 진출 · 워커 소비 · 정규 리그 · 입장 조건 거부

**Files:**
- Modify: `apps/v1_api/test/tournaments/tournament-quick-result.integration-spec.ts` (7a 의 파일 끝에 이어 붙인다)

**Interfaces:**
- Consumes: 7a 의 `createBracket`·`createGameFor`·`quickResult`·`notifiedCount`·`finalDetails`·`revisionCount`·`outboxCount`, `seedLeagueOnTournamentAxis`
- Produces: **DB 로 관측되는 확정 결과**의 증명 — 확정본이 `OFFICIAL`, 다음 경기 홈·원정 칸이 채워짐, 팀매치 `completed`, 게임 `ENDED`·현재 확정본 포인터, outbox `GAME_RESULT_OFFICIAL` 1건, 감사 1건. 단위 스펙은 이것을 단언하지 않는다(스텁이라서).

- [ ] **Step 1: 대회 경기 — 확정·진출·승부차기·워커 소비·명단 선정 테스트를 이어 붙인다**

7a 의 `afterAll(...)` 줄 **바로 위**에 이어 붙인다(`afterAll` 은 항상 파일 마지막이 되도록, 이후 묶음도 같은 위치에 넣는다).

```ts
describe('빠른 결과 — 대회 경기', () => {
  it('4강을 점수만으로 확정하면 승자가 결승 칸에 들어가고 확정본·감사·outbox 가 일반 확정과 같은 모양이다', async () => {
    const bracket = await createBracket();
    const { gameId, teamMatchId } = bracket.semi1;
    const version = await gameVersion(gameId);

    const response = await quickResult(gameId, users.ops, { home: 2, away: 1 });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({
      gameId,
      revisionId: expect.any(String),
      version: version + 1,
      score: { home: 2, away: 1 },
    });
    const revision = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: response.body.data.revisionId } });
    expect(revision).toMatchObject({
      state: 'OFFICIAL',
      reason: '[quick-result]',
      supersedesId: null,
      eventsHash: canonicalGameCommandPayloadHash([]),
      createdByUserId: users.ops,
    });
    expect(revision.goalEvents).toEqual([]);
    expect(revision.submittedAt).not.toBeNull();
    expect(revision.officialAt).not.toBeNull();
    // 양 팀 선수 1명씩이 출전자로 기록된다(기록은 0).
    const players = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: revision.id } });
    expect(players).toHaveLength(2);
    expect(players.every((player) => player.started && player.goals === 0 && player.assists === 0)).toBe(true);
    expect(await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } })).toMatchObject({
      state: 'ENDED',
      currentOfficialRevisionId: revision.id,
    });
    expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } })).status).toBe('completed');
    // 승자(홈 A)가 결승 HOME 으로 진출했고, 아직 확정 안 된 다른 4강의 몫(AWAY)은 비어 있다.
    const final = await finalDetails(bracket.final.teamMatchId);
    expect(final.homeRegistrationId).toBe(bracket.registration.a);
    expect(final.awayRegistrationId).toBeNull();
    expect(await outboxCount(gameId, 'GAME_RESULT_OFFICIAL')).toBe(1);
    expect(await outboxCount(gameId, 'GAME_RESULT_SUBMITTED')).toBe(0);
    expect(await prisma.v1OperationAudit.count({ where: { resourceId: gameId, action: 'QUICK_RESULT' } })).toBe(1);
  });

  it('결선 무승부는 점수만 있는 승부차기로 확정되고(킥 수 없음), 승부차기 승자가 진출한다', async () => {
    const bracket = await createBracket();

    const missing = await quickResult(bracket.semi1.gameId, users.ops, { home: 1, away: 1 });
    expect(missing.status).toBe(409);
    expect(missing.body.code).toBe('TOURNAMENT_PENALTY_REQUIRED');
    expect(await revisionCount(bracket.semi1.gameId)).toBe(0);

    const response = await quickResult(bracket.semi1.gameId, users.ops, { home: 1, away: 1, penalties: { home: 3, away: 4 } });

    expect(response.status).toBe(201);
    const revision = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: response.body.data.revisionId } });
    expect(revision.score).toEqual({ home: 1, away: 1, penalties: { home: 3, away: 4 } });
    expect((await finalDetails(bracket.final.teamMatchId)).homeRegistrationId).toBe(bracket.registration.b);
  });

  it('워커가 소비하면 공식 기록·완료 알림(양 팀 1건씩)이 생기고, 두 4강이 모두 확정되면 결승의 홈·원정 칸이 둘 다 찬다', async () => {
    const bracket = await createBracket();
    const first = await quickResult(bracket.semi1.gameId, users.ops, { home: 1, away: 1, penalties: { home: 5, away: 4 } });
    expect(first.status).toBe(201);

    await drainOutboxWorker(prisma);

    expect(
      await prisma.v1GameOfficialFact.findUnique({ where: { revisionId: first.body.data.revisionId } }),
    ).toMatchObject({ gameId: bracket.semi1.gameId });
    expect(await notifiedCount(bracket.semi1.teamMatchId)).toBe(2);
    expect(await finalDetails(bracket.final.teamMatchId)).toMatchObject({
      homeRegistrationId: bracket.registration.a,
      awayRegistrationId: null,
    });

    const second = await quickResult(bracket.semi2.gameId, users.ops, { home: 0, away: 2 });
    expect(second.status).toBe(201);
    await drainOutboxWorker(prisma);

    expect(await finalDetails(bracket.final.teamMatchId)).toMatchObject({
      homeRegistrationId: bracket.registration.a,
      awayRegistrationId: bracket.registration.d,
    });
    for (const fixture of [bracket.semi1, bracket.semi2]) {
      expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: fixture.teamMatchId } })).status).toBe('completed');
    }
  });

  it('출전자는 사이드별 최신 무효화되지 않은 라인업 리비전의 선수만이다 — 무효화된 새 리비전의 선수는 섞이지 않는다', async () => {
    const bracket = await createBracket();
    const { gameId } = bracket.semi1;
    const homeSide = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } });
    const current = await prisma.v1GameLineup.findFirstOrThrow({
      where: { gameId, sideId: homeSide.id, invalidatedAt: null },
      orderBy: { revision: 'desc' },
    });
    // 명단 동기화가 남기는 모양: 더 높은 리비전이 있지만 무효화됐다. 이것이 "최신"으로 뽑히면 명단이 통째로 바뀐다.
    const stale = await prisma.v1GameLineup.create({
      data: {
        gameId,
        sideId: homeSide.id,
        revision: current.revision + 1,
        state: 'SUBMITTED',
        submittedAt: new Date(),
        invalidatedAt: new Date(),
        invalidationReason: 'qr-test',
      },
    });
    const strayParticipant = await prisma.v1GameParticipant.create({
      data: { gameId, sideId: homeSide.id, lineupId: stale.id, displayNameSnapshot: '무효 명단 선수', position: 'FW' },
    });

    const response = await quickResult(gameId, users.ops, { home: 1, away: 0 });

    expect(response.status).toBe(201);
    const players = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: response.body.data.revisionId } });
    expect(players).toHaveLength(2);
    expect(players.map((player) => player.participantId)).not.toContain(strayParticipant.id);
  });
});
```

- [ ] **Step 2: 정규 리그 · 친선 · 입장 조건 거부 테스트를 이어 붙인다**

리그 픽스처 헬퍼를 `afterAll` 위에 추가한다.

```ts
type LeagueMatchOptions = { status?: 'matched' | 'cancelled'; homePlayer?: boolean; awayPlayer?: boolean };

/** 정규 리그 대진 하나(Details 없음, TeamMatch.leagueId === tournamentId). 팀 A(홈) vs B(원정). */
async function createLeagueMatch(leagueId: string, options: LeagueMatchOptions = {}) {
  const teamMatchId = randomUUID();
  const status = options.status ?? 'matched';
  await prisma.v1TeamMatch.create({
    data: {
      id: teamMatchId,
      tournamentId: leagueId,
      leagueId,
      sportId,
      regionId,
      title: `QR 리그 대진 ${teamMatchId.slice(0, 4)}`,
      placeName: 'QR 구장',
      startAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      createdByUserId: users.ops,
      hostTeamId: teams.a,
      approvedApplicantTeamId: teams.b,
      competitionConfigVersionId: configId,
      status: 'matched',
    },
  });
  const gameId = await createGameFor(
    teamMatchId,
    { teamId: teams.a, withPlayer: options.homePlayer ?? true },
    { teamId: teams.b, withPlayer: options.awayPlayer ?? true },
  );
  if (status === 'cancelled') {
    // 리그 취소는 팀매치만 취소하고 게임은 SCHEDULED 로 남긴다(게임 상태로는 못 거른다).
    await prisma.v1TeamMatch.update({ where: { id: teamMatchId }, data: { status: 'cancelled', cancelledAt: new Date() } });
  }
  return { teamMatchId, gameId };
}

async function createLeague(): Promise<string> {
  const leagueId = randomUUID();
  await seedLeagueOnTournamentAxis(prisma, {
    id: leagueId,
    title: `QR 리그 ${suite} ${leagueId.slice(0, 4)}`,
    sportId,
    sportCode: 'futsal',
    regionId,
    createdByAdminUserId: opsAdminRowId,
    state: 'active',
  });
  return leagueId;
}
```

테스트를 같은 위치에 이어 붙인다.

```ts
describe('빠른 결과 — 정규 리그 경기', () => {
  it('마지막 대진이 확정되고 워커가 소비하면 리그가 완료된다 — 중간까지는 완료되지 않는다', async () => {
    const leagueId = await createLeague();
    const first = await createLeagueMatch(leagueId);
    const second = await createLeagueMatch(leagueId);
    const statusOf = async () => (await prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId } })).status;

    const one = await quickResult(first.gameId, users.ops, { home: 2, away: 1 });
    expect(one.status).toBe(201);
    await drainOutboxWorker(prisma);
    expect(await statusOf()).not.toBe('completed');
    expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: first.teamMatchId } })).status).toBe('completed');

    // 리그에는 승부차기가 없다 — 무승부는 그대로 확정된다.
    const two = await quickResult(second.gameId, users.ops, { home: 0, away: 0 });
    expect(two.status).toBe(201);
    await drainOutboxWorker(prisma);

    expect(await statusOf()).toBe('completed');
    for (const response of [one, two]) {
      const revision = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: response.body.data.revisionId } });
      expect(revision).toMatchObject({ state: 'OFFICIAL', reason: '[quick-result]' });
      expect(await prisma.v1GameOfficialFact.findUnique({ where: { revisionId: revision.id } })).not.toBeNull();
    }
  });

  it('취소된 리그 대진은 게임이 SCHEDULED 여도 QUICK_RESULT_FIXTURE_CANCELLED — 같은 리그의 정상 대진은 확정된다', async () => {
    const leagueId = await createLeague();
    const cancelled = await createLeagueMatch(leagueId, { status: 'cancelled' });
    const normal = await createLeagueMatch(leagueId);

    const rejected = await quickResult(cancelled.gameId, users.ops, { home: 1, away: 0 });

    expect(rejected.status).toBe(409);
    expect(rejected.body.code).toBe('QUICK_RESULT_FIXTURE_CANCELLED');
    expect(await revisionCount(cancelled.gameId)).toBe(0);
    expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: cancelled.teamMatchId } })).status).toBe('cancelled');
    expect((await quickResult(normal.gameId, users.ops, { home: 1, away: 0 })).status).toBe(201);
  });

  it('출전자가 0명인 사이드가 있으면 QUICK_RESULT_ROSTER_SYNCING — 출전자 0명 확정본을 남기지 않는다', async () => {
    const leagueId = await createLeague();
    const empty = await createLeagueMatch(leagueId, { awayPlayer: false });

    const rejected = await quickResult(empty.gameId, users.ops, { home: 1, away: 0 });

    expect(rejected.status).toBe(409);
    expect(rejected.body.code).toBe('QUICK_RESULT_ROSTER_SYNCING');
    expect(await revisionCount(empty.gameId)).toBe(0);
  });

  it('그 경기의 명단 재계산 이벤트가 처리 전이면 409, 처리가 끝나면 확정된다', async () => {
    const leagueId = await createLeague();
    const match = await createLeagueMatch(leagueId);
    const pending = await prisma.v1OutboxEvent.create({
      data: {
        businessKey: `roster-resync:GAME:${match.gameId}:${randomUUID()}`,
        aggregateType: 'GAME',
        aggregateId: match.gameId,
        type: 'COMPETITION_ROSTER_RESYNC',
        payload: { scope: 'game', gameId: match.gameId },
        status: 'PENDING',
      },
    });

    const blocked = await quickResult(match.gameId, users.ops, { home: 1, away: 0 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('QUICK_RESULT_ROSTER_SYNCING');
    expect(await revisionCount(match.gameId)).toBe(0);

    // 워커가 이 가짜 이벤트를 집어 가서 명단을 바꾸지 않도록 직접 완료 처리한다.
    await prisma.v1OutboxEvent.update({ where: { id: pending.id }, data: { status: 'COMPLETED' } });

    expect((await quickResult(match.gameId, users.ops, { home: 1, away: 0 })).status).toBe(201);
  });
});

describe('빠른 결과 — 대회·리그 소속이 아닌 팀매치', () => {
  it('친선 팀매치는 QUICK_RESULT_UNSUPPORTED 409 이고 아무것도 쓰지 않는다', async () => {
    const teamMatchId = randomUUID();
    await prisma.v1TeamMatch.create({
      data: {
        id: teamMatchId,
        sportId,
        regionId,
        title: 'QR 친선',
        placeName: 'QR 구장',
        startAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        createdByUserId: users.ops,
        hostTeamId: teams.a,
        approvedApplicantTeamId: teams.b,
        competitionConfigVersionId: configId,
        status: 'matched',
      },
    });
    const gameId = await createGameFor(teamMatchId, { teamId: teams.a, withPlayer: true }, { teamId: teams.b, withPlayer: true });

    const response = await quickResult(gameId, users.ops, { home: 1, away: 0 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('QUICK_RESULT_UNSUPPORTED');
    expect(await revisionCount(gameId)).toBe(0);
    expect((await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } })).state).toBe('SCHEDULED');
  });
});

describe('빠른 결과 — 입장 조건 거부(대회)', () => {
  it('득점 기록이 하나라도 있으면 QUICK_RESULT_HAS_LIVE_RECORDS', async () => {
    const bracket = await createBracket();
    const { gameId } = bracket.semi1;
    await prisma.v1GameEvent.create({
      data: {
        gameId,
        sequence: 1,
        clientEventId: `qr-event-${randomUUID()}`,
        payloadHash: canonicalGameCommandPayloadHash(['qr-event']),
        type: 'GOAL',
        period: 1,
        clockMs: 60_000,
        occurredAt: new Date(),
        actorUserId: users.ops,
        payload: {},
      },
    });

    const response = await quickResult(gameId, users.ops, { home: 1, away: 0 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('QUICK_RESULT_HAS_LIVE_RECORDS');
    expect(await revisionCount(gameId)).toBe(0);
  });

  it('팀이 정해지지 않은 결승은 QUICK_RESULT_TEAMS_REQUIRED', async () => {
    const bracket = await createBracket();

    const response = await quickResult(bracket.final.gameId, users.ops, { home: 1, away: 0 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('QUICK_RESULT_TEAMS_REQUIRED');
    expect(await revisionCount(bracket.final.gameId)).toBe(0);
  });
});
```

- [ ] **Step 3: 타입 확인 (로컬)**

7a Step 3 의 명령. Expected: 에러 0.

- [ ] **Step 4: 커밋 · push · CI 결과 읽기**

```bash
git commit -m "test(results): 빠른 결과 확정·진출·워커 소비·정규 리그 통합 스펙" -- apps/v1_api/test/tournaments/tournament-quick-result.integration-spec.ts
git show --stat HEAD
git push origin "$(git branch --show-current)"
```
그 다음 **7a Step 8 의 "CI 결과를 읽는다" 절차 그대로** 읽는다(`headSha` 가 방금 SHA 인지 먼저 확인). Expected: 통합 스텝 success, 이 스펙 파일 이름이 `V1 integration failed:` 어노테이션에 없음(누적 14 tests). red 면 `fullName` 의 테스트만 고쳐 새 커밋으로 올린다 — 흔한 원인은 시드 가정이다(리그 시드의 초기 `status`, 직접 `V1GameLineup` 을 넣는 행이 라인업 트리거에 막히는 경우 — 막히면 그 테스트의 픽스처만 명단 동기화 경로로 바꾼다).

---

### Task 7c: 정정의 킥 수 면제 · 무효 뒤 재입력 · 다음 경기 시작 롤백

**Files:**
- Modify: `apps/v1_api/test/tournaments/tournament-quick-result.integration-spec.ts` (7b 의 파일 끝에 이어 붙인다)

**Interfaces:**
- Consumes: 7a 의 헬퍼, `TournamentResultReviewService.createResultCorrection`·`officializeResultRevision`·`voidResultRevision`(정정·확정·무효를 실제 서비스로 밟는다)
- Produces: **Task 3(정정 킥 수 면제)과 Task 5c(무효 뒤 재입력이 팀매치 `completed` 를 허용)의 DB 증명.** 재입력 허용의 대조군 — 팀매치가 `completed` 이면서 현재 포인터가 VOID 가 아닌 경기는 `QUICK_RESULT_NOT_AVAILABLE` — 을 같은 묶음에 둔다(허용을 넓힌 변경이 "completed 면 무엇이든 통과"로 새지 않는지 잡는다).

- [ ] **Step 1: 정정 · 대조군 · 무효 뒤 재입력 · 롤백 테스트를 이어 붙인다**

`previewHash` 헬퍼를 `afterAll` 위에 추가한다(확정 요청의 미리보기 해시, `tournament-penalty-shootout.integration-spec.ts` 의 같은 이름 함수와 동일).

```ts
function previewHash(revision: { score: unknown; goalEvents: unknown; eventsHash: string; mvpParticipantId: string | null }): string {
  return canonicalGameCommandPayloadHash({
    score: revision.score,
    goalEvents: revision.goalEvents,
    eventsHash: revision.eventsHash,
    mvpParticipantId: revision.mvpParticipantId,
  });
}
```

테스트를 같은 위치에 이어 붙인다.

```ts
describe('빠른 결과 — 정정', () => {
  it('승부차기 승자 정정은 킥 수 없이 통과하고 다음 칸을 다시 채우되 완료 알림은 다시 가지 않는다', async () => {
    const bracket = await createBracket();
    const { gameId, teamMatchId } = bracket.semi1;
    const first = await quickResult(gameId, users.ops, { home: 1, away: 1, penalties: { home: 5, away: 4 } });
    expect(first.status).toBe(201);
    await drainOutboxWorker(prisma);
    expect(await notifiedCount(teamMatchId)).toBe(2);
    expect((await finalDetails(bracket.final.teamMatchId)).homeRegistrationId).toBe(bracket.registration.a);

    // 같은 경기의 승부차기 승자를 바꾼다. 득점 기록이 없어 킥 수를 요구하지 않는다(Task 3).
    const base = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: first.body.data.revisionId } });
    const baseParticipants = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: base.id } });
    const correctionKey = `qr-correction-${randomUUID()}`;
    const draft = await resultReview.createResultCorrection(authUser(users.ops), gameId, correctionKey, {
      expectedVersion: await gameVersion(gameId),
      clientCommandId: correctionKey,
      baseRevisionId: base.id,
      reason: '승부차기 승자 정정',
      changes: {
        score: { home: 1, away: 1, penalties: { home: 4, away: 5 } },
        actualParticipants: baseParticipants.map((row) => ({
          participantId: row.participantId,
          sideId: row.sideId,
          started: true,
          goals: 0,
          cards: { yellow: 0, red: 0 },
          goalkeeper: row.goalkeeper,
        })),
        eventsHash: canonicalGameCommandPayloadHash([]),
      },
    } as never);
    const draftRow = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: draft.revisionId } });
    const officializeKey = `qr-officialize-${randomUUID()}`;
    await resultReview.officializeResultRevision(authUser(users.ops), gameId, draft.revisionId, officializeKey, {
      expectedVersion: draft.version,
      clientCommandId: officializeKey,
      projectionPreviewHash: previewHash(draftRow),
    } as never);
    await drainOutboxWorker(prisma);

    expect((await finalDetails(bracket.final.teamMatchId)).homeRegistrationId).toBe(bracket.registration.b);
    expect(await notifiedCount(teamMatchId)).toBe(2);
  });
});

describe('빠른 결과 — 이미 확정된 경기(재입력 허용의 대조군)', () => {
  it('팀매치가 completed 여도 현재 포인터가 확정본(VOID 아님)이면 QUICK_RESULT_NOT_AVAILABLE 이고 리비전은 늘지 않는다', async () => {
    const bracket = await createBracket();
    const { gameId, teamMatchId } = bracket.semi1;
    const first = await quickResult(gameId, users.ops, { home: 1, away: 0 });
    expect(first.status).toBe(201);
    // 무효 뒤 재입력이 completed 를 허용하는 것과 같은 상태(completed)인데도 VOID 가 아니라서 거부돼야 한다.
    expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } })).status).toBe('completed');
    expect((await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } })).currentOfficialRevisionId).toBe(
      first.body.data.revisionId,
    );

    const again = await quickResult(gameId, users.ops, { home: 3, away: 0 });

    expect(again.status).toBe(409);
    expect(again.body.code).toBe('QUICK_RESULT_NOT_AVAILABLE');
    expect(await revisionCount(gameId)).toBe(1);
    expect((await finalDetails(bracket.final.teamMatchId)).homeRegistrationId).toBe(bracket.registration.a);
  });
});

describe('빠른 결과 — 다음 경기가 이미 시작된 경우', () => {
  it('다음 경기가 이미 시작됐으면 NEXT_FIXTURE_CONFLICT 이고 부분 적용 없이 전부 롤백된다', async () => {
    const bracket = await createBracket();
    const { gameId, teamMatchId } = bracket.semi1;
    await prisma.v1Game.update({ where: { id: bracket.final.gameId }, data: { state: 'LIVE' } });

    const response = await quickResult(gameId, users.ops, { home: 2, away: 0 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('NEXT_FIXTURE_CONFLICT');
    expect(await revisionCount(gameId)).toBe(0);
    expect(await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } })).toMatchObject({
      state: 'SCHEDULED',
      currentOfficialRevisionId: null,
    });
    expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } })).status).toBe('matched');
    expect(await outboxCount(gameId, 'GAME_RESULT_OFFICIAL')).toBe(0);
  });
});

describe('빠른 결과 — 무효 뒤 재입력', () => {
  it('무효 처리한 경기는 다시 점수를 넣을 수 있고, VOID 리비전을 승계하며 진출이 새 승자로 바뀐다', async () => {
    const bracket = await createBracket();
    const { gameId, teamMatchId } = bracket.semi1;
    const first = await quickResult(gameId, users.ops, { home: 2, away: 1 });
    expect(first.status).toBe(201);
    expect((await finalDetails(bracket.final.teamMatchId)).homeRegistrationId).toBe(bracket.registration.a);

    const voidKey = `qr-void-${randomUUID()}`;
    const voided = await resultReview.voidResultRevision(authUser(users.ops), gameId, first.body.data.revisionId, voidKey, {
      expectedVersion: await gameVersion(gameId),
      clientCommandId: voidKey,
      reason: '점수 오입력',
    } as never);
    expect((await finalDetails(bracket.final.teamMatchId)).homeRegistrationId).toBeNull();
    // 무효는 팀매치 상태를 되돌리지 않는다 — 재입력 입장 조건이 completed 를 허용해야 하는 이유다.
    expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } })).status).toBe('completed');

    const reentry = await quickResult(gameId, users.ops, { home: 0, away: 3 });

    expect(reentry.status).toBe(201);
    const revision = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: reentry.body.data.revisionId } });
    expect(revision).toMatchObject({ state: 'OFFICIAL', supersedesId: voided.revisionId, revision: 3, reason: '[quick-result]' });
    expect((await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } })).currentOfficialRevisionId).toBe(revision.id);
    expect((await finalDetails(bracket.final.teamMatchId)).homeRegistrationId).toBe(bracket.registration.b);
    expect(await outboxCount(gameId, 'GAME_RESULT_OFFICIAL')).toBe(2);
  });
});
```

- [ ] **Step 2: 타입 확인 (로컬)**

7a Step 3 의 명령. Expected: 에러 0.

- [ ] **Step 3: 커밋 · push · CI 결과 읽기**

```bash
git commit -m "test(results): 빠른 결과 정정 킥 수 면제·무효 뒤 재입력·롤백 통합 스펙" -- apps/v1_api/test/tournaments/tournament-quick-result.integration-spec.ts
git show --stat HEAD
git push origin "$(git branch --show-current)"
```
그 다음 7a Step 8 의 "CI 결과를 읽는다" 절차 그대로 읽는다. Expected: 통합 스텝 success, 이 스펙 파일이 `V1 integration failed:` 에 없음(누적 18 tests). 이 묶음의 검증 가치는 변이로 확인한다 — CI 에서 아래를 한 번씩 돌려 red 가 나는지 보고(임시 커밋 후 push, 확인 뒤 `git revert` 가 아니라 **같은 브랜치에서 원복 커밋**), 결과를 PR 본문에 한 줄로 남긴다.

| 변이 | 기대 red |
|---|---|
| Task 3 의 킥 수 면제 조건 삭제 | `승부차기 승자 정정은 킥 수 없이 통과하고…` (422 `TOURNAMENT_PENALTY_KICK_COUNTS_REQUIRED`) |
| 5b 입장 조건의 `voidBase !== null && … completed` 항 삭제 | `무효 처리한 경기는 다시 점수를 넣을 수 있고…` |
| 같은 항을 `teamMatch.status === completed` 로 단순화(VOID 조건 제거) | `팀매치가 completed 여도 현재 포인터가 확정본…` |

---

### Task 8: API 문서와 changeset

**Files:**
- Modify: `docs/api/domains/tournament-operations.md`(`## Fixture videos (highlight/broadcast clips)` 바로 위에 새 절)
- Modify: `.changeset/admin-quick-result.md`(7a Step 1 에서 이미 만들었다 — 내용 확인만)

- [ ] **Step 1: API 문서에 새 절을 추가한다**

`## Fixture videos (highlight/broadcast clips)` 줄 바로 위에 아래를 삽입한다(`old_string` 은 그 헤딩 줄 전체, `new_string` 은 아래 + 그 줄).

````markdown
## 어드민 빠른 결과 확정 (Task 20261057)

대진 그림 편집기에서 점수만 넣어 경기를 곧바로 공식 확정하는 경로예요. 테스트·비상용이고, 실제 경기의 득점자는 라이브 콘솔이 정본이에요.

| Method and route | Body | Result | Actor |
|---|---|---|---|
| `POST /api/v1/admin/games/:gameId/quick-result` + 헤더 `Idempotency-Key` | `QuickResultDto {clientCommandId(uuid),expectedVersion,score:{home,away,penalties?:{home,away}}}` | `201 {gameId,revisionId,version,score}` | 플랫폼 어드민 `owner`·`ops` 만. `support`·대회 디렉터·일반 사용자는 `403 PERMISSION_DENIED` |

- 한 Serializable 트랜잭션에서 `DRAFT` 리비전(점수, `goalEvents=[]`, `eventsHash=hash([])`, `reason='[quick-result]'`) → 참가자(최신 라인업 리비전의 선수 전원, `started=true`, 기록 0) → `OFFICIAL`(상태 머신 흐름 `ADMIN_QUICK`)로 쓰고, 게임을 `ENDED` 로 옮긴 뒤 열린 피리어드를 닫고 팀매치를 `completed` 로 만들어요. 대회 경기는 같은 트랜잭션에서 승자를 다음 칸으로 진출시켜요(`409 NEXT_FIXTURE_CONFLICT` — 다음 경기가 이미 시작됐어요).
- outbox 는 `GAME_RESULT_OFFICIAL` 하나뿐이에요(`GAME_RESULT_SUBMITTED` 없음). 순위·전적·개인 기록(출전)·리그 완료·알림은 일반 확정과 같은 워커가 처리해요. 운영 감사 액션은 `QUICK_RESULT` 예요.
- 무효(void) 뒤 재입력이면 VOID 리비전을 `supersedesId` 로 승계해요. 무효는 팀매치 상태를 되돌리지 않으므로 이 경우에만 팀매치 `completed` 도 허용해요.
- 승부차기는 점수 두 개만 받아요. 검증 순서와 코드는 `end` 와 같고(`TOURNAMENT_PENALTY_REQUIRED` / `TOURNAMENT_PENALTY_NOT_ALLOWED` / `TOURNAMENT_PENALTY_INVALID`) 킥 수는 요구하지 않아요. 무효된 옛 승부차기는 승계하지 않아요.
- 득점 기록이 없는 경기의 `POST /games/:gameId/corrections`(와 `supersede-and-submit`)는 승부차기 킥 수(`takenHome`/`takenAway`)를 요구하지 않아요(`TOURNAMENT_PENALTY_KICK_COUNTS_REQUIRED` 면제). 킥 수를 실으면 결판 판정(`TOURNAMENT_PENALTY_UNDECIDED`)은 그대로 해요. 득점 기록이 있는 경기는 지금처럼 요구해요.

### 오류

| HTTP | Code | 언제 |
|---|---|---|
| `403` | `PERMISSION_DENIED` | 플랫폼 운영자(owner·ops)가 아니에요 |
| `409` | `QUICK_RESULT_UNSUPPORTED` | 대회·정규 리그 팀매치가 아니에요(친선 등) |
| `409` | `QUICK_RESULT_NOT_AVAILABLE` | 진행 중이거나 결과가 이미 있어요(확정 전 결과 포함 — 정정·확인을 써요) |
| `409` | `QUICK_RESULT_FIXTURE_CANCELLED` | 팀매치가 취소됐어요 |
| `409` | `QUICK_RESULT_HAS_LIVE_RECORDS` | 득점 기록이 있어요 |
| `409` | `QUICK_RESULT_TEAMS_REQUIRED` | 한쪽이라도 팀이 정해지지 않았어요 |
| `409` | `QUICK_RESULT_ROSTER_SYNCING` | 한 사이드의 출전자가 0명이거나 이 경기의 명단 재계산이 끝나지 않았어요 |
| `409` | `NEXT_FIXTURE_CONFLICT` \| `VERSION_CONFLICT` \| `IDEMPOTENCY_PAYLOAD_CONFLICT` | 다음 경기 시작 / 낡은 `expectedVersion` / 같은 키에 다른 본문 |
| `422` | `COMMAND_IDEMPOTENCY_KEY_MISMATCH` | `Idempotency-Key` 가 `clientCommandId` 와 달라요 |

`withResultCommand` 의 멱등 충돌은 이제 원시 예외 대신 `409 IDEMPOTENCY_PAYLOAD_CONFLICT` 로 번역돼요(위 Task 22 표의 문서와 같은 동작).

````

- [ ] **Step 2: changeset 내용을 확인한다**

`.changeset/admin-quick-result.md` 는 7a Step 1 에서 만들었다(첫 push 의 변경 게이트 때문). 아래와 같은지만 확인하고, 다르면 고친다:

```markdown
---
"v1_api": minor
"v1_web": minor
---

플랫폼 어드민이 대회·정규 리그 경기의 점수만 넣어 바로 공식 확정하는 빠른 결과 API(`POST /admin/games/:gameId/quick-result`)를 추가했어요. 확정 뒤의 진출·순위·전적·알림은 일반 확정과 똑같이 처리돼요. 득점 기록이 없는 경기는 승부차기 킥 수 없이도 정정할 수 있어요.
```

- [ ] **Step 3: 최종 게이트 — 이 PR 이 건드린 단위 스펙·타입을 한 번 돌린다**

Run:
```bash
cd apps/v1_api && ./node_modules/.bin/jest --maxWorkers=1 \
  src/games/core \
  src/tournament-operations/results \
  && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-surface-check.mjs
```
Expected: PASS 전부, tsc 0, surface check 통과. (통합 스펙은 CI.)

- [ ] **Step 4: 커밋**

```bash
git commit -m "docs(results): 어드민 빠른 결과 API 문서" -- docs/api/domains/tournament-operations.md
git show --stat HEAD
```
Expected: 파일 1개만(changeset 을 고쳤다면 2개).

---

### Task 9: 머지 후 확인 (UI 없는 PR — 갤러리 면제)

색인 「머지 후 확인」의 UI 없는 PR 절차다. 화면이 바뀌지 않으므로 390/768/1440 갤러리와 ego-browser 시각 검증은 하지 않는다. 대신 **배포 SHA 확인 → 읽기 전용 API 스모크**까지가 이 PR 의 끝이고, **alpha 에 결과를 쓰는 검증은 사용자 승인 뒤**에만 한다.

- [ ] **Step 1: 머지 직전 base 확인 · 머지 후 로컬 dev 동기화**

```bash
R=kim-song-jun/matchup-sports-platform
gh pr view <7a Step 7 의 URL 에서 읽은 번호> --repo "$R" --json baseRefName,mergeable,mergeStateStatus   # baseRefName === dev
```
머지 방식은 3-way merge 커밋(`--squash` 금지). 머지되면 메인 작업트리의 로컬 `dev` 를 따라잡힌다(`git fetch origin dev -q && git merge --ff-only origin/dev`, 거부되면 CLAUDE.md 의 백업 절차).

- [ ] **Step 2: 배포가 내 머지를 포함하는지 확인한다 (배포 창 중 측정 금지)**

```bash
R=kim-song-jun/matchup-sports-platform
gh run list --workflow deploy-alpha.yml --branch dev --limit 1 --repo "$R" --json headSha,status,conclusion --jq '.[0]'
curl -fsSI https://alpha.teameet.co.kr/landing | grep -i 'x-teameet-\(release\|commit\)'
curl -fsS https://alpha.teameet.co.kr/api/v1/health   # .data.checks.db === true
git merge-base --is-ancestor <내 머지 커밋> <배포 SHA> && echo "포함됨"
```
Expected: `status: completed`·`conclusion: success`, `x-teameet-commit` 이 내 머지 커밋 이후, 헬스 DB true. 직전 run 이 `cancelled` 면 마지막 **성공** 배포의 SHA 를 기준으로 판정한다.

- [ ] **Step 3: 읽기 전용 API 스모크 — 라우트가 배포됐고 가드가 먼저 서는지**

새 라우트가 404 가 아니라 401 로 답하는지만 본다. 비로그인 요청은 `V1AuthGuard` 에서 거부돼 어떤 행도 쓰지 않는다.
```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  https://alpha.teameet.co.kr/api/v1/admin/games/00000000-0000-4000-8000-000000000000/quick-result \
  -H 'content-type: application/json' -H 'Idempotency-Key: 00000000-0000-4000-8000-000000000001' -d '{}'
```
Expected: `401`. `404` 면 컨트롤러가 모듈에 등록되지 않았거나 배포가 옛 SHA 다(Step 2 를 다시 본다).

- [ ] **Step 4: alpha 에 결과를 쓰는 검증은 사용자 승인 뒤에만 한다**

실제 빠른 결과 확정(`POST …/quick-result`)은 alpha 에 결과·알림·진출을 남기고, 대진은 만들면 지울 수 없다(`FIXTURE_NOT_DELETABLE`). **사용자에게 "alpha 에 새 대회를 만들어 4강을 빠른 결과로 확정해 보겠다"고 알리고 명시 승인을 받은 뒤에만** 진행한다. 승인되면 새 대회(시드 대상 아님)에서 7b 첫 테스트의 시나리오를 운영 계정(비밀번호는 저장소 밖 비공개 메모리)으로 밟고, 판정은 공개 API `GET /tournaments/:id/matches/:fixtureId` 로 한다. 승인이 없으면 이 Step 은 건너뛰고 보고에 "alpha 쓰기 검증 미실시"라고 적는다. 웹 UI 는 PR-3 이 붙는다.

---

## Self-Review

스펙 S5 의 항목과 Test Scenarios 줄이 어느 태스크로 닫히는지 대조한다.

| 스펙 항목 | 태스크 |
|---|---|
| S5 상태 머신 `ADMIN_QUICK` 흐름(DRAFT→OFFICIAL 이 이 흐름에만) | Task 1 (단위: 허용·STANDARD 대조·VOID 직행 불가·확정본 불변), Task 5a–5c (`assertTransition` 사용) |
| S5 `quickResult` — `withResultCommand`(멱등·감사·Serializable·오류 번역) 위에서 동작 | Task 5a–5c (`enterQuickResult`), 멱등 충돌 409 번역(기존 문서와 어긋나던 결함)도 같은 태스크 |
| S5 입장 조건 `QUICK_RESULT_NOT_AVAILABLE`(진행 중·확정 전 결과·이미 확정) | Task 5a–5c 단위(4 케이스) · Task 7c 통합(이미 확정 + 팀매치 completed 대조군) · 5b 단위(completed 인데 VOID 아님 → NOT_AVAILABLE) |
| S5 `QUICK_RESULT_FIXTURE_CANCELLED`(리그 취소는 게임이 SCHEDULED) | Task 5a–5c 단위 · Task 7b 통합(취소 리그 대진 + 같은 리그 정상 대진 대조군) |
| S5 `QUICK_RESULT_HAS_LIVE_RECORDS` / `QUICK_RESULT_TEAMS_REQUIRED` | Task 5a–5c 단위 · Task 7b 통합 |
| S5 `QUICK_RESULT_ROSTER_SYNCING`(사이드 0명 · 미처리 재계산) | Task 5a–5c 단위 · Task 7b 통합(0명 사이드, 이벤트 PENDING→COMPLETED 후 201) |
| S5 `QUICK_RESULT_UNSUPPORTED`(친선) | Task 5a–5c 단위(권한 검사 전 거부) · Task 7b 통합 · 「계약 이탈」 3 |
| S5 platform_ops 전용(디렉터·support 403) | Task 5a–5c 단위(역할 게이트) · Task 6(컨트롤러 게이트 순서) · Task 7a 통합(support·디렉터·일반 403, 비로그인 401, 어드민 201 대조) |
| S5 승부차기 검증 순서·코드, 킥 수 비요구(`requireKickCounts:false`) | Task 5a–5c 단위(5 케이스) · Task 7b 통합(결선 무승부 + 점수만 승부차기 201) |
| S5 VOID 재입력 `supersedesId` | Task 5a–5c 단위 · Task 7c 통합(completed 팀매치에서 재입력, 진출 새 승자로 교체) · 「계약 이탈」 1 |
| S5 참가자 = 현재 명단 전원 `started=true` 기록 0 · DRAFT 참가자 insert 순서 | Task 5a–5c 단위(초안→참가자→확정, 옛 명단·무효화된 리비전 제외 대조) · Task 7b 통합(실제 트리거, 확정본 참가자 행, 무효화된 라인업 선수 미포함 — 최신 무효화되지 않은 라인업 리비전 기준) · 「계약 이탈」 2 |
| S5 열린 피리어드 닫기 · `completeTeamMatchAtResultBoundary` · `projectCanonicalAdvancement` | Task 5a–5c 단위는 호출 여부를 단언하지 않는다(스텁) · DB 결과는 Task 7b 통합(확정본 OFFICIAL, 팀매치 completed, 게임 ENDED·포인터, 결승 홈·원정 칸 채움) · Task 7c 통합(다음 경기 시작 시 409 + 전부 롤백) |
| S5 outbox `GAME_RESULT_OFFICIAL`(officialize businessKey), `GAME_RESULT_SUBMITTED` 없음 · reason 마커 · 감사 `QUICK_RESULT` | Task 5a–5c 단위(outbox 키·reason 마커) · Task 7b 통합(outbox·감사 행) |
| S5 컨트롤러 `POST /admin/games/:gameId/quick-result` · `Idempotency-Key == clientCommandId`(422) · DTO | Task 4, Task 6, Task 7a(422·재생·`IDEMPOTENCY_PAYLOAD_CONFLICT` 409) |
| S5 정정 킥 수 면제(득점 기록 0건) + 이벤트 있는 경기 대조군 | Task 3 (단위: 면제·이벤트 있으면 유지·미결은 여전히 거부) · Task 7c 통합(킥 수 없는 승부차기 승자 정정 → 다음 칸 재투영) |
| Test: 빠른 결과(대회) OFFICIAL·진출·outbox 1·SUBMITTED 0·참가자 started | Task 7b Step 1 (첫 테스트) |
| Test: 빠른 결과(리그) OFFICIAL · 리그 완료 투영 · 순위 반영 | Task 7b Step 2 (마지막 대진에서 completed, 중간은 아님, 공식 기록 행) |
| Test: 무효 뒤 재입력 `supersedesId` | Task 7c Step 1 (무효 뒤 재입력) |
| Test: 팀매치 completed 이면서 VOID 가 현재 포인터가 아님 → `QUICK_RESULT_NOT_AVAILABLE` (재입력 허용의 대조군) | 5b 단위(2 케이스) · Task 7c Step 1 (이미 확정된 경기) |
| Test: 참가자 = 사이드별 최신 무효화되지 않은 라인업 리비전 (스펙 S5 갱신분) | 5c 단위(리비전 1·2·무효화된 3) · Task 7b Step 1 (무효화된 라인업 선수 제외) |
| Test: 정정(그림) — corrections → officialize 로 점수 바뀌고 다음 칸 재투영 | Task 7c Step 1 (정정) |
| Test: 빠른 결과 → 워커 소비(순위·전적·개인 기록(출전)·완료 알림 1회), 정정 후 알림 재발송 없음 | Task 7b Step 1 (공식 기록 행 + 알림 2건) · Task 7c Step 1 (정정 뒤에도 2건). 순위표 행 자체는 대회 4강(조 없음)이라 이 스펙이 직접 재지 않고, 리그 순위 입력인 완료 판정까지 7b Step 2 가 잰다 |
| Test: 에러 경로 — 친선·이벤트·팀 미정·진행 중/확정 전/이미 확정·version 불일치·다음 경기 시작·키 불일치 422·재요청 replay | Task 5a–5c 단위 + Task 7a(version 불일치·키 불일치 422·재요청 replay) · 7b(친선·이벤트·팀 미정) · 7c(이미 확정·다음 경기 시작) |
| Test: 결선 무승부 승부차기(킥 수 없음) 201 · 빠른 입력 경기의 그림 정정 성공 | Task 7b Step 1 (승부차기 승자 진출) · Task 7c Step 1 (그림 정정 성공) |
| docs/api + changeset | Task 8 (changeset 은 7a Step 1 에서 먼저 생성 — 첫 push 의 변경 게이트) |
| UI 없는 PR 의 머지 후 확인(배포 SHA·읽기 전용 스모크·alpha 쓰기는 사용자 승인) | Task 9 |

이 PR 에서 일부러 다루지 않는 것(스펙의 다른 PR 몫):
- 정정·무효·확인 화면 연결과 `entryMethod` 직렬화 소비 — PR-3(웹). `revisionEntryMethod` 상수는 PR-1a 가 제공하고 Task 2 가 계약과 같은지 확인한다.
- 어드민 대진 응답의 `game.latestRevision` — PR-1a.
- 자리 배정 직후 명단 동기화 지연 → 화면 안내 문구 — PR-3. 서버 쪽 409 는 Task 5a–5c·7 이 닫는다.
- 득점 기록이 있는 경기의 콘솔 정정 킥 수 요구는 기존 통합 스펙(`test/tournaments/tournament-correction-guards.integration-spec.ts` 의 2-C 우회로)이 계속 고정한다 — 이 PR 에서 바꾸지 않는다.

**미해결:** 없음. 통합 스펙의 일부 단언(리그 시드의 초기 `status`, 시드 팀매치에 대한 게임 생성기 수락 여부, 7b 의 무효화된 라인업을 직접 `create` 하는 행이 라인업 트리거에 막히는지)은 로컬에서 실행해 보지 못하고 CI 에서 처음 돈다 — 첫 CI 실행에서 시드 가정이 틀리면 해당 `it` 의 픽스처만 고친다(서비스 코드는 영향 없음).
