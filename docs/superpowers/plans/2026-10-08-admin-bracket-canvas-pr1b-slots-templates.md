# 어드민 대진 그림 편집기 PR-1b — 자리 서비스와 대진 템플릿

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대회(`regular_tournament`)의 대진 뼈대를 템플릿 한 번으로 만들고(토너먼트 4/8/12강·리그 방식 대회), 자리(slot)에 확정 등록을 넣고 빼면 그 자리를 쓰는 경기 전부에 팀·조 편성·부전승이 한 트랜잭션으로 반영되게 한다. 등록이 확정을 벗어나면 자리가 비워진다.

**Architecture:** 순수 함수 `planBracketTemplate` 가 그룹·자리·경기·연결선 계획을 만들고, `BracketTemplateService.apply` 가 한 트랜잭션에서 PR-1a 의 `…InTx` 헬퍼로 실행한다. `TournamentSlotService` 의 `assignSlotInTx` 는 "자리를 쓰는 경기"(비삭제·비취소)를 id 순으로 잠그고 PR-1a 의 `assignTournamentFixtureSideInTx` 로 사이드를 채운 뒤, 조별 조(`phase=group`)의 `GroupTeam` 생성·해제와 12강 부전승 전환을 같은 트랜잭션에서 처리한다.

**Tech Stack:** NestJS 11 + Prisma 6 + PostgreSQL 16, class-validator, Jest 30 (unit `src/**/*.spec.ts`, integration `test/**/*.integration-spec.ts`).

**Spec:** `.github/tasks/20261057-admin-bracket-canvas.md` (S1~S3·Test Scenarios) · 색인과 공유 계약 `docs/superpowers/plans/2026-10-08-admin-bracket-canvas-index.md`. 선행 PR-1a(`2026-10-08-admin-bracket-canvas-pr1a-schema-tx.md`)가 머지된 브랜치 위에서 실행한다.

## 계약 이탈

색인의 이름·경로·시그니처·라우트·에러 코드를 그대로 쓴다. 원본 색인(2026-10-08)에 없던 이름은 아래에 **빠짐없이** 적는다. "보충표"는 색인의 「계획 작성 뒤 확정한 보충 계약(2026-10-09)」에 올라 있다는 뜻이고, 없으면 이 PR 안에서만 쓰는 내부 심볼이다.

| 이름 | 파일 | 보충표 | 비고 |
|---|---|---|---|
| `releaseUnusedGroupTeamsInTx(tx, admin, tournamentId, groupId, registrationIds)` | `tournaments/tournament-bracket-tx.ts` (PR-1a 파일에 **추가**) | O | 이 PR 의 새 로직(Task 9). 조 하나 단위 시그니처 — 여러 조는 서비스의 `releaseGroupTeams` 가 조별로 나눠 부른다 |
| `assertLeagueFixtureGenerationAllowedInTx(tx, leagueId)` | `league-matches/league-fixture-generation-guard.ts` | O | 리그 서비스 private 메서드를 추출(Task 1) |
| `lockCompetitionForSlotReleaseInTx(tx, competition)` | `tournaments/slots/competition-bracket-lock.ts` | O | 보류 리그도 해제는 허용하는 잠금 전용판(Task 1) |
| `SlotMutationContext`, `assignSlotsBatchInTx(tx, ctx, changes)` | `tournaments/slots/tournament-slot.service.ts` | O | Task 7·11 |
| `ROUND12_BYE_SORT_ORDERS = [0, 3, 4, 7]` | `tournaments/templates/bracket-template-plan.ts` | O (보충표는 `slots/…` 로 적음 — 이 계획은 플래너와 같은 파일에 둔다) | Task 2 |
| `TournamentSlotService.releaseForRegistrationInTx(tx, admin, registrationId)` | `tournaments/slots/tournament-slot.service.ts` | O | Task 12 |
| `lockCompetitionForBracketMutationInTx` 의 `competition.kind` 타입이 `V1CompetitionKind \| null` | `competition-bracket-lock.ts` | — | 색인 표는 `V1CompetitionKind`. R1 이전 행(kind null)도 대회 레인이라 null 을 받는다 |
| `LEAGUE_SLOT_FIXTURES_USE_TEMPLATE` 를 **이 PR 이 처음 던진다** | `league-fixture-generator.service.ts` | — | 색인 에러 코드 표에는 있지만 PR 담당이 적혀 있지 않다. 자리로 만든 리그 방식 **대회** 조의 재생성 차단에 쓴다(Task 14). 정규 리그 쪽 차단은 PR-5a |
| 내부 보조: `orderFixturesForTeardown`(`templates/bracket-teardown-order.ts`) · `ApplyBracketTemplateDto`·`toBracketTemplateInput`(`templates/dto/`) · `AssignSlotDto`(`slots/dto/`) · `loadSlotUsingFixtures`·`assertSlotFixturesNotStarted`·`isSlotFixtureStarted`·`sidesUsingSlot`(`slots/slot-fixtures.ts`) · `syncByeSlotInTx`(`slots/bye-slot-sync.ts`) · `pickRandomAssignments`(`slots/random-assignment.ts`) · `GroupTeamRelease`·`releaseGroupTeams`(서비스 안) | 위 경로 | — | 이 PR 안에서만 소비한다. 다른 PR 이 가져다 쓰지 않는다 |

PR-1a 가 이미 만든 것은 **다시 만들지 않고 import 만 한다**: `ensureGroupPhaseTeamsInTx`·`recalculateStandingsInTx`·`updateTournamentFixtureInTx`·`assertSidesNotSlotLinked`·`createGroupInTx`(전체 행 반환)·`writeAdminActionLog`·`serializeAdminBracketSlot`·`adminBracketSlotInclude`. 따라서 `tournaments/slots/group-phase-teams.ts` 는 만들지 않고, 이 PR 은 `tournament-bracket.service.ts` 를 수정하지 않는다(Task 0 이 PR-1a 심볼의 존재와 사본 부재를 확인한다).

## Global Constraints

색인 `Global Constraints` 전부가 적용된다(공유 worktree·pathspec 커밋·`prisma generate` 금지·테스트 명령·주석 비율·해요체 등). 이 PR 에만 해당하는 제약:

- **새 Prisma enum 을 런타임 값으로 import 하지 않는다.** 로컬 공유 client 에는 `V1TournamentSlotKind` 가 없다(생성은 CI). 타입은 `import type { V1TournamentSlotKind }`, 값은 문자열 리터럴(`'ENTRY'`·`'BYE'`·`'GROUP_RANK'`)로 쓴다 — 그래야 순수 플래너 단위 테스트가 로컬에서 돈다. 새 모델 접근자(`tx.v1TournamentSlot`)와 컬럼(`homeSlotId`)의 타입은 색인의 격리 생성 `tsc` 로 확인한다.
- 대회 단건 조회는 `findTournamentOnSurface`(`tournaments/tournament-surface-lookup.ts:100`)만 쓴다(`lint:surface` 래칫).
- 이 PR 에는 정규 리그 자리가 **존재하지 않는다**(리그 템플릿은 PR-5a). 리그 종류 자리 반영이 필요해지는 지점은 `assignLeagueFixtureSideInTx`(PR-5a) 대신 409 `SLOT_LEAGUE_NOT_SUPPORTED_YET` 를 던진다 — PR-5a 가 이 한 곳을 교체한다(Task 7).
- `group_knockout` 템플릿은 PR-4 범위다. 이 PR 의 플래너는 422 `BRACKET_TEMPLATE_UNSUPPORTED` 로 거부한다(Task 2).
- **격리 하네스로 돌린다.** 이 PR 은 PR-1a 가 만든 `V1TournamentSlot`·`homeSlotId` 를 쓰는 서비스·스펙이 대부분이라, 공유 `node_modules` 의 옛 Prisma client(생성 금지)로는 ts-jest 진단이 깨진다. 이 문서의 모든 `jest`/`tsc` 명령은 PR-1a Task 2 가 만든 `$ISO/jest.iso.config.cjs`·`$ISO/tsconfig.isocheck.json` 을 쓴다. PR 시작 시 한 번 확인한다: `export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas ISO=/Users/sungjun/.cache/bracket-canvas-iso; ls "$ISO/jest.iso.config.cjs" "$ISO/tsconfig.isocheck.json" "$ISO/prisma-client/client.d.ts"` — 없으면 PR-1a Task 2 Step 10 의 생성 절차를 그대로 다시 실행한다. PR-1a 이후 스키마가 바뀌지 않았으므로 재생성 결과는 같다. `ISO` 경로의 정의는 index 한 곳이며 여기서 바꾸지 않는다.
- 통합 스펙(`test/**/*.integration-spec.ts`)은 `DATABASE_URL` 이 있는 환경에서만 돈다. 이 문서의 "통합" 명령은 하네스 설정에 통합 환경(`isolated-integration-environment.cjs`)과 `--testMatch` 를 얹은 형태이며 로컬 준비(`migrate deploy` → `competition-config-backfill.cli`)는 색인 Global Constraints 를 따른다. 로컬 DB 가 없으면 푸시 후 CI 결과(생성된 client 사용)로 red/green 을 확인한다.
- **surface 게이트 baseline 은 같은 커밋에서 갱신한다.** `scripts/v1-surface-check.mjs` 는 허용치 초과뿐 아니라 실측보다 큰 baseline 도 실패시킨다(래칫). 이 PR 이 늘리는 곳: raw SQL `v1_tournaments` 1곳(`competition-bracket-lock.ts`, Task 1 → `tournament-raw-sql-baseline.json`), `ALL_COMPETITION_KINDS` 호출부 `tournament-slot.service.ts` 2곳(Task 7) → 3곳(Task 12) (→ `tournament-league-allowed-baseline.json`). 해당 Task 의 커밋 pathspec 에 JSON 을 포함한다.
- 커밋 메시지 끝의 attribution 줄은 실행 세션의 지침을 따른다(이 계획의 예시엔 생략).

## File Structure

경로 접두 `apps/v1_api/` 생략. **Create** / *Modify*.

| 파일 | 책임 |
|---|---|
| **`src/league-matches/league-fixture-generation-guard.ts`** | 리그 보류 중 대진 생성·변경 거부 판정(서비스 private 메서드에서 추출) |
| *`src/league-matches/league-match-admin.service.ts`* | private `assertFixtureGenerationAllowedInTx` 삭제, 추출 함수 호출 |
| **`src/tournaments/slots/competition-bracket-lock.ts`** | 레인별 잠금(대회 advisory / 리그 행 `FOR UPDATE`) 헬퍼 2종 |
| **`src/tournaments/slots/competition-bracket-lock.spec.ts`** | 레인별 잠금 SQL 계약 단위 테스트 |
| **`src/tournaments/templates/bracket-template-plan.ts`** | 순수 플래너(knockout 4/8/12·league), 타입, 상수 |
| **`src/tournaments/templates/bracket-template-plan.spec.ts`** | 개수 계약·12강 배선·불변식 단위 테스트 |
| **`src/tournaments/templates/bracket-teardown-order.ts`** | 교체 시 경기 삭제 순서(하류 먼저) 순수 함수 |
| **`src/tournaments/templates/bracket-teardown-order.spec.ts`** | 삭제 순서 단위 테스트 |
| **`src/tournaments/templates/dto/bracket-template.dto.ts`** | `ApplyBracketTemplateDto`, `toBracketTemplateInput` |
| **`src/tournaments/templates/dto/bracket-template.dto.spec.ts`** | DTO 검증·입력 변환 단위 테스트 |
| **`src/tournaments/templates/bracket-template.service.ts`** | `BracketTemplateService.apply` 실행기(잠금·교체·생성) |
| **`src/tournaments/templates/bracket-template.controller.ts`** | `POST admin/tournaments/:tournamentId/bracket/template` |
| **`src/tournaments/slots/slot-fixtures.ts`** | "자리를 쓰는 경기" 조회·시작 전 판정 |
| **`src/tournaments/slots/bye-slot-sync.ts`** | BYE 자리 ↔ `ByeSlot`/`GroupTeam(isBye)` 전환 |
| **`src/tournaments/slots/random-assignment.ts`** | 무작위 채우기 짝짓기 순수 함수 |
| **`src/tournaments/slots/tournament-slot.service.ts`** | `assignSlotInTx`·`assignSlotsBatchInTx`·`releaseSlotsForRegistrationInTx`·`releaseGroupTeams`·`TournamentSlotService` (응답 직렬화는 PR-1a `serializeAdminBracketSlot` import) |
| **`src/tournaments/slots/tournament-slot.controller.ts`** | `PUT admin/tournament-slots/:slotId/assignment`, `POST admin/tournaments/:id/slots/random-fill` |
| **`src/tournaments/slots/dto/tournament-slot.dto.ts`** | `AssignSlotDto` |
| **`src/tournaments/slots/tournament-slot.service.spec.ts`** · **`tournament-slot.controller.spec.ts`** · **`dto/tournament-slot.dto.spec.ts`** · **`random-assignment.spec.ts`** | 권한·404, 라우트 계약, DTO 검증, 무작위 짝짓기 단위 테스트 |
| **`src/tournaments/templates/bracket-template.controller.spec.ts`** | 템플릿 라우트 계약 |
| *`src/tournaments/tournament-bracket-tx.ts`* (PR-1a 산출물) | `releaseUnusedGroupTeamsInTx` **한 함수만 추가**. 나머지는 import 만 하고 이 PR 은 `tournament-bracket.service.ts` 를 수정하지 않는다 |
| *`src/tournaments/league-fixture-generator.service.ts`* | 자리 연결 경기가 있는 조의 `replaceExisting` 거부 |
| *`src/tournaments/admin-registrations.service.ts`* | `cancel` 이 해제 헬퍼를 호출 |
| *`src/tournaments/admin-registrations.service.spec.ts`* | 주입 대체 + 호출 순서 단위 테스트 |
| *`src/tournaments/tournaments.module.ts`* | 서비스·컨트롤러 등록 |
| **`test/helpers/bracket-canvas-fixture.ts`** | 통합 스펙용 대회·팀·확정 등록 생성 헬퍼 |
| **`test/tournaments/bracket-template.integration-spec.ts`** | 템플릿 실행기 DB 통합 스펙 |
| **`test/tournaments/tournament-slots.integration-spec.ts`** | 자리 배정·조 편성·부전승·해제·동시성 DB 통합 스펙 |
| *`/docs/api/domains/tournaments.md`* | 템플릿·자리 엔드포인트 계약 |
| **`/.changeset/admin-bracket-canvas-slots-templates.md`** | 릴리스 노트 |

---

### Task 0: PR-1a 심볼 확인 (코드 변경 없음, 커밋 없음)

이 PR 은 PR-1a 가 만든 함수를 import 만 한다. 하나라도 없으면 직접 만들지 말고 **BLOCKED** 로 멈춘다(두 벌 구현 금지 — 색인 보충 계약).

- [ ] **Step 1: 심볼 존재와 단일 정의 확인**

```bash
cd $WT/apps/v1_api
grep -nE "^export (async )?function (createGroupInTx|createEmptyTournamentFixtureInTx|assignTournamentFixtureSideInTx|softDeleteTournamentFixtureInTx|deleteTournamentGroupInTx|ensureGroupPhaseTeamsInTx|recalculateStandingsInTx|updateTournamentFixtureInTx|assertSidesNotSlotLinked)\b" src/tournaments/tournament-bracket-tx.ts
grep -nE "^export (async )?function writeAdminActionLog\b" src/common/admin-context.service.ts
grep -nE "^export (const adminBracketSlotInclude|function serializeAdminBracketSlot)\b" src/tournaments/slots/admin-bracket-view.ts
grep -n "assertSidesNotSlotLinked" src/tournaments/tournament-bracket.service.ts
grep -rn "ensureGroupPhaseTeams(\|private .*recalculateStandingsInTx\|recalculateTournamentStandingsInTx" src; test ! -e src/tournaments/slots/group-phase-teams.ts && echo "group-phase-teams.ts 없음(정상)"
```
Expected: 첫 grep 9줄, 둘째 grep 1줄, 셋째 grep 2줄, 넷째 1줄 이상(`updateFixture` 가 PR-1a 의 `SLOT_LINKED` 가드를 부르는 곳), 다섯째 grep 출력 없음 + `group-phase-teams.ts 없음(정상)`. 어긋나면 BLOCKED: 어느 심볼이 없는지 오케스트레이터에 보고하고 PR-1a 로 돌려보낸다.

- [ ] **Step 2: `ensureGroupPhaseTeamsInTx` 시그니처 메모** — `(tx, admin, tournamentId, groupId, groupPhase, registrationIds)` 이다(`deps` 객체가 아니라 `admin`). `assignTournamentFixtureSideInTx` 가 이미 이 함수를 불러 `phase = group` 조의 편성을 만든다 — 자리 서비스(Task 7·9)는 편성 생성을 **따로 호출하지 않는다**.

---

### Task 1: 리그 보류 판정 추출 + 레인별 잠금 헬퍼

**Files:**
- Create: `apps/v1_api/src/league-matches/league-fixture-generation-guard.ts`
- Modify: `apps/v1_api/src/league-matches/league-match-admin.service.ts` — 호출부 `:586`·`:1076`, private 메서드 정의 `:1754-1767`
- Create: `apps/v1_api/src/tournaments/slots/competition-bracket-lock.ts`
- Test: `apps/v1_api/src/tournaments/slots/competition-bracket-lock.spec.ts`
- Modify: `apps/v1_api/scripts/tournament-raw-sql-baseline.json` — 새 파일 1곳 허용

**Interfaces:**
- Consumes: `findTournamentOnSurface(db, kinds, args)` (`tournaments/tournament-surface-lookup.ts:100`)
- Produces:
  - `assertLeagueFixtureGenerationAllowedInTx(tx: Prisma.TransactionClient, leagueId: string): Promise<void>`
  - `lockCompetitionForBracketMutationInTx(tx, competition: { id: string; kind: V1CompetitionKind | null }): Promise<void>` (계약)
  - `lockCompetitionForSlotReleaseInTx(tx, competition: { id: string; kind: V1CompetitionKind | null }): Promise<void>` (보충)

- [ ] **Step 1: 실패하는 테스트 작성** — `apps/v1_api/src/tournaments/slots/competition-bracket-lock.spec.ts`

```ts
import type { Prisma } from '@prisma/client';
import {
  lockCompetitionForBracketMutationInTx,
  lockCompetitionForSlotReleaseInTx,
} from './competition-bracket-lock';

// 두 레인의 잠금은 서로 직렬화되지 않는다(스펙 S2). 레인을 바꿔 잡으면 동시성 보호가 조용히 사라지므로
// 실제로 나가는 SQL 로 레인을 고정한다.
function fakeTx(leagueStatus: string = 'active') {
  const executed: Array<{ sql: string; values: unknown[] }> = [];
  const queried: Array<{ sql: string; values: unknown[] }> = [];
  const findFirst = jest.fn(async () => ({ status: leagueStatus }));
  const tx = {
    $executeRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      executed.push({ sql: strings.join('?'), values });
      return 1;
    }),
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      queried.push({ sql: strings.join('?'), values });
      return [];
    }),
    v1Tournament: { findFirst },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, executed, queried, findFirst };
}

describe('lockCompetitionForBracketMutationInTx', () => {
  it('대회 레인은 league-fixture-generation advisory lock 만 잡고 대회 행은 잠그지 않는다', async () => {
    const { tx, executed, queried, findFirst } = fakeTx();
    await lockCompetitionForBracketMutationInTx(tx, { id: 't-1', kind: 'regular_tournament' });
    expect(executed).toHaveLength(1);
    expect(executed[0].sql).toContain('pg_advisory_xact_lock');
    expect(executed[0].values).toEqual(['league-fixture-generation:t-1']);
    expect(queried).toHaveLength(0);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('kind 가 null 인 R1 이전 행도 대회 레인이다', async () => {
    const { tx, executed, queried } = fakeTx();
    await lockCompetitionForBracketMutationInTx(tx, { id: 't-2', kind: null });
    expect(executed).toHaveLength(1);
    expect(queried).toHaveLength(0);
  });

  it('정규 리그 레인은 v1_tournaments 행 FOR UPDATE 를 잡고 advisory lock 은 쓰지 않는다', async () => {
    const { tx, executed, queried } = fakeTx('active');
    await lockCompetitionForBracketMutationInTx(tx, { id: 'l-1', kind: 'regular_league' });
    expect(queried).toHaveLength(1);
    expect(queried[0].sql).toContain('v1_tournaments');
    expect(queried[0].sql).toContain('FOR UPDATE');
    expect(queried[0].values).toEqual(['l-1']);
    expect(executed).toHaveLength(0);
  });

  it('보류(on_hold) 리그는 행 잠금 뒤 LEAGUE_ON_HOLD 409 로 거부한다', async () => {
    const { tx, queried } = fakeTx('on_hold');
    await expect(
      lockCompetitionForBracketMutationInTx(tx, { id: 'l-1', kind: 'regular_league' }),
    ).rejects.toMatchObject({ response: { code: 'LEAGUE_ON_HOLD' } });
    expect(queried).toHaveLength(1); // 판정은 잠금 뒤 최신 상태로 한다
  });
});

describe('lockCompetitionForSlotReleaseInTx', () => {
  it('보류 리그에서도 잠금만 잡고 거부하지 않는다 — 팀이 빠지면 자리는 비워져야 한다', async () => {
    const { tx, queried, findFirst } = fakeTx('on_hold');
    await expect(
      lockCompetitionForSlotReleaseInTx(tx, { id: 'l-1', kind: 'regular_league' }),
    ).resolves.toBeUndefined();
    expect(queried).toHaveLength(1);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots/competition-bracket-lock.spec.ts`
Expected: FAIL — `Cannot find module './competition-bracket-lock'`.

- [ ] **Step 3: 판정 함수 추출** — `apps/v1_api/src/league-matches/league-fixture-generation-guard.ts`

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { findTournamentOnSurface } from '../tournaments/tournament-surface-lookup';

/** 정본 행 잠금 뒤의 최신 상태로 판정한다 — 계획 계산 뒤 보류가 커밋될 수 있다. */
export async function assertLeagueFixtureGenerationAllowedInTx(
  tx: Prisma.TransactionClient,
  leagueId: string,
): Promise<void> {
  const league = await findTournamentOnSurface(tx, ['regular_league'], {
    where: { id: leagueId, deletedAt: null },
    select: { status: true },
  });
  if (league === null) {
    throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
  }
  if (league.status === 'on_hold') {
    throw new ConflictException({ code: 'LEAGUE_ON_HOLD', message: '보류 중에는 대진을 만들거나 다시 만들 수 없어요. 먼저 보류를 해제해 주세요.' });
  }
}
```

`apps/v1_api/src/league-matches/league-match-admin.service.ts` 수정(동작 보존):
1. 상단 import 묶음(`:64` `findTournamentOnSurface` import 옆)에 `import { assertLeagueFixtureGenerationAllowedInTx } from './league-fixture-generation-guard';` 추가.
2. `:586` 과 `:1076` 의 `await this.assertFixtureGenerationAllowedInTx(tx, leagueId);` 를 `await assertLeagueFixtureGenerationAllowedInTx(tx, leagueId);` 로 바꾼다.
3. `:1754-1767` private 메서드 `assertFixtureGenerationAllowedInTx` 정의 전체를 삭제한다(호출부가 0 이 됐다).
4. `findTournamentOnSurface`·`ConflictException`·`NotFoundException` import 가 파일 다른 곳에서 계속 쓰이는지 `grep -n "findTournamentOnSurface\|NotFoundException" src/league-matches/league-match-admin.service.ts` 로 확인하고, 쓰이지 않게 된 import 만 지운다.

- [ ] **Step 4: 잠금 헬퍼 작성** — `apps/v1_api/src/tournaments/slots/competition-bracket-lock.ts`

```ts
import type { Prisma, V1CompetitionKind } from '@prisma/client';
import { assertLeagueFixtureGenerationAllowedInTx } from '../../league-matches/league-fixture-generation-guard';

export type LockableCompetition = { id: string; kind: V1CompetitionKind | null };

/**
 * 잠금만 잡는다. 대회는 `createFixture`·`deleteFixture`·조별 생성과 같은 advisory lock,
 * 정규 리그는 기존 리그 서비스와 같은 대회 행 `FOR UPDATE` — 두 잠금은 서로 직렬화되지 않으므로
 * 레인을 섞어 쓰지 않는다. 등록 이탈로 자리를 비우는 경로는 보류 리그에서도 막히면 안 되어 이 변형을 쓴다.
 */
export async function lockCompetitionForSlotReleaseInTx(
  tx: Prisma.TransactionClient,
  competition: LockableCompetition,
): Promise<void> {
  if (competition.kind === 'regular_league') {
    await tx.$queryRaw`SELECT id FROM "v1_tournaments" WHERE id = ${competition.id} FOR UPDATE`;
    return;
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${competition.id}`}, 0))`;
}

/** 대진·자리를 바꾸는 모든 변경이 먼저 부른다. 리그는 잠금 뒤 보류 여부까지 판정한다. */
export async function lockCompetitionForBracketMutationInTx(
  tx: Prisma.TransactionClient,
  competition: LockableCompetition,
): Promise<void> {
  await lockCompetitionForSlotReleaseInTx(tx, competition);
  if (competition.kind === 'regular_league') {
    await assertLeagueFixtureGenerationAllowedInTx(tx, competition.id);
  }
}
```

- [ ] **Step 4b: raw SQL baseline 갱신** — `apps/v1_api/scripts/tournament-raw-sql-baseline.json`

`competition-bracket-lock.ts` 의 `FOR UPDATE` 문이 `v1_tournaments` 를 raw SQL 로 만진다(코드 1곳; 설명 주석에는 테이블명을 쓰지 않는다 — 주석은 세지 않지만 혼동을 피한다). 기존 항목 뒤에 추가한다:

```json
  "src/tournaments/slots/competition-bracket-lock.ts": {
    "allowed": 1,
    "why": "정규 리그 레인의 대회 행 FOR UPDATE — 기존 리그 서비스와 같은 잠금을 쓰기 위한 것이다. 잠금만 잡고 데이터를 돌려주지 않으며, 보류 판정은 잠금 뒤 findTournamentOnSurface(['regular_league']) 로 한다."
  },
```

실행: `cd apps/v1_api && node scripts/v1-surface-check.mjs` → 통과. (`허용 N` 이 실측과 다르면 `[baseline 갱신 필요]` 로 실패한다 — 그 숫자를 그대로 맞춘다.)

- [ ] **Step 5: 실행 — 통과 확인 + 기존 리그 서비스 회귀 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots/competition-bracket-lock.spec.ts src/league-matches/league-match-admin.service.spec.ts`
Expected: PASS (신규 5건 + 기존 리그 어드민 스펙 전부 — 추출은 동작 보존).

- [ ] **Step 6: 타입 확인**

Run: `cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json"`
Expected: 오류 0(새 PR-1a 심볼 미해결 오류는 이 Task 에 없음).

- [ ] **Step 7: 커밋**

```bash
git add apps/v1_api/src/league-matches/league-fixture-generation-guard.ts apps/v1_api/src/tournaments/slots/competition-bracket-lock.ts apps/v1_api/src/tournaments/slots/competition-bracket-lock.spec.ts
git commit -m "refactor(bracket): 리그 보류 판정 추출과 레인별 대진 잠금 헬퍼" -- apps/v1_api/src/league-matches/league-fixture-generation-guard.ts apps/v1_api/src/league-matches/league-match-admin.service.ts apps/v1_api/src/tournaments/slots/competition-bracket-lock.ts apps/v1_api/src/tournaments/slots/competition-bracket-lock.spec.ts apps/v1_api/scripts/tournament-raw-sql-baseline.json
git show --stat HEAD
```
Expected: 위 5개 파일만.

---

### Task 2: 순수 플래너 `planBracketTemplate` (knockout 4/8/12 · league)

**Files:**
- Create: `apps/v1_api/src/tournaments/templates/bracket-template-plan.ts`
- Test: `apps/v1_api/src/tournaments/templates/bracket-template-plan.spec.ts`

**Interfaces:**
- Consumes: `buildLeagueFixtureRows(input)` (`tournaments/league-fixture-generator.service.ts:261`) — 슬롯 키를 `registrationIds` 자리에 넣어 'league_r{n}' 라운드로빈을 얻는다.
- Produces: 색인 `BracketTemplatePlan` 계약의 타입 전부(`BracketTemplateInput`·`PlanGroup`·`PlanSlot`·`PlanFixture`·`PlanEdge`·`PlanByeSlot`·`BracketTemplatePlan`)와 `BRACKET_TEMPLATE_MAX_FIXTURES = 240`, `ROUND12_BYE_SORT_ORDERS`, `planBracketTemplate(input, ctx: { fixtureNumberOffset: number }): BracketTemplatePlan`.

- [ ] **Step 1: 실패하는 테스트 작성** — `apps/v1_api/src/tournaments/templates/bracket-template-plan.spec.ts`

```ts
import {
  BRACKET_TEMPLATE_MAX_FIXTURES,
  ROUND12_BYE_SORT_ORDERS,
  planBracketTemplate,
  type BracketTemplateInput,
  type BracketTemplatePlan,
} from './bracket-template-plan';

const plan = (input: BracketTemplateInput, offset = 0) =>
  planBracketTemplate(input, { fixtureNumberOffset: offset });

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return (error as { response?: { code?: string } }).response?.code;
  }
  return undefined;
}

const sizes = (p: BracketTemplatePlan) => ({
  groups: p.groups.length,
  fixtures: p.fixtures.length,
  edges: p.edges.length,
  entry: p.slots.filter((s) => s.kind === 'ENTRY').length,
  bye: p.slots.filter((s) => s.kind === 'BYE').length,
  byeSlots: p.byeSlots.length,
});

describe('planBracketTemplate — 개수 계약(스펙 Test Scenarios)', () => {
  it('knockout 8 + 3·4위전 = 경기 8 · 연결 8 · ENTRY 8, 조 4개', () => {
    const p = plan({ kind: 'knockout', size: 8, thirdPlace: true });
    expect(sizes(p)).toEqual({ groups: 4, fixtures: 8, edges: 8, entry: 8, bye: 0, byeSlots: 0 });
    expect(p.groups.map((g) => [g.name, g.phase])).toEqual([
      ['8강', 'quarter'], ['4강', 'semi'], ['결승', 'final'], ['3위 결정전', 'third_place'],
    ]);
    expect(p.fixtures.map((f) => f.round)).toEqual(['8강', '8강', '8강', '8강', '4강', '4강', '결승', '3·4위전']);
  });

  it('knockout 4 (3·4위전 없음) = 경기 3 · 연결 2 · ENTRY 4', () => {
    const p = plan({ kind: 'knockout', size: 4, thirdPlace: false });
    expect(sizes(p)).toEqual({ groups: 2, fixtures: 3, edges: 2, entry: 4, bye: 0, byeSlots: 0 });
    expect(p.groups.map((g) => g.name)).toEqual(['4강', '결승']);
  });

  it('knockout 12 + 3·4위전 = 경기 12(4+4+2+1+1) · 연결 12 · ENTRY 8 · BYE 4 · ByeSlot 4', () => {
    const p = plan({ kind: 'knockout', size: 12, thirdPlace: true });
    expect(sizes(p)).toEqual({ groups: 5, fixtures: 12, edges: 12, entry: 8, bye: 4, byeSlots: 4 });
    const perRound = new Map<string, number>();
    for (const f of p.fixtures) perRound.set(f.round, (perRound.get(f.round) ?? 0) + 1);
    expect([...perRound]).toEqual([['12강', 4], ['8강', 4], ['4강', 2], ['결승', 1], ['3·4위전', 1]]);
  });

  it('league 6팀 2회전 = 30경기, 같은 쌍이 정확히 두 번이고 홈/원정이 교대한다', () => {
    const p = plan({ kind: 'league', teamCount: 6, legs: 2 });
    expect(p.fixtures).toHaveLength(30);
    expect(p.groups).toEqual([{ key: 'league', name: '리그', phase: 'group', sortOrder: 0, advanceCount: null }]);
    expect(p.slots.map((s) => [s.key, s.kind, s.position, s.groupKey])).toEqual(
      [1, 2, 3, 4, 5, 6].map((n) => [`entry-${n}`, 'ENTRY', n, 'league']),
    );
    const meetings = new Map<string, string[]>();
    for (const f of p.fixtures) {
      const pair = [f.homeSlotKey!, f.awaySlotKey!].sort().join('|');
      meetings.set(pair, [...(meetings.get(pair) ?? []), `${f.legNumber}:${f.homeSlotKey}`]);
    }
    expect(meetings.size).toBe(15);
    for (const list of meetings.values()) {
      expect(list).toHaveLength(2);
      expect(list[0].split(':')[1]).not.toBe(list[1].split(':')[1]); // 2회전은 홈이 뒤집힌다
    }
    expect(p.fixtures[0].round).toBe('league_r1');
  });
});

describe('planBracketTemplate — 12강 배선(스펙 S2)', () => {
  const p = plan({ kind: 'knockout', size: 12, thirdPlace: true });
  const fixture = (key: string) => p.fixtures.find((f) => f.key === key)!;

  it('BYE 자리 position 1~4 는 ByeSlot sortOrder 0,3,4,7 에 대응한다', () => {
    expect(ROUND12_BYE_SORT_ORDERS).toEqual([0, 3, 4, 7]);
    expect(p.byeSlots).toEqual([0, 3, 4, 7].map((sortOrder) => ({ groupKey: 'round12', sortOrder })));
    expect(p.slots.filter((s) => s.kind === 'BYE').map((s) => [s.position, s.groupKey])).toEqual(
      [1, 2, 3, 4].map((n) => [n, 'round12']),
    );
  });

  it('8강 i번 경기: 홈 = BYE 자리 i, 어웨이 = 12강 i번 경기 WINNER 연결', () => {
    for (const i of [1, 2, 3, 4]) {
      const quarter = fixture(`quarter-${i}`);
      expect(quarter.homeSlotKey).toBe(`bye-${i}`);
      expect(quarter.awaySlotKey).toBeNull();
      expect(p.edges).toContainEqual({
        sourceFixtureKey: `round12-${i}`, outcome: 'WINNER', targetFixtureKey: `quarter-${i}`, targetSide: 'AWAY',
      });
      expect(fixture(`round12-${i}`).homeSlotKey).toBe(`entry-${2 * i - 1}`);
      expect(fixture(`round12-${i}`).awaySlotKey).toBe(`entry-${2 * i}`);
    }
  });

  it('LOSER 연결은 4강 → 3·4위전에만 있다', () => {
    const losers = p.edges.filter((e) => e.outcome === 'LOSER');
    expect(losers).toEqual([
      { sourceFixtureKey: 'semi-1', outcome: 'LOSER', targetFixtureKey: 'third_place-1', targetSide: 'HOME' },
      { sourceFixtureKey: 'semi-2', outcome: 'LOSER', targetFixtureKey: 'third_place-1', targetSide: 'AWAY' },
    ]);
  });
});

describe('planBracketTemplate — 모든 템플릿이 지켜야 할 DB 불변식', () => {
  const inputs: BracketTemplateInput[] = [
    { kind: 'knockout', size: 4, thirdPlace: false },
    { kind: 'knockout', size: 4, thirdPlace: true },
    { kind: 'knockout', size: 8, thirdPlace: false },
    { kind: 'knockout', size: 8, thirdPlace: true },
    { kind: 'knockout', size: 12, thirdPlace: false },
    { kind: 'knockout', size: 12, thirdPlace: true },
    { kind: 'league', teamCount: 3, legs: 1 },
    { kind: 'league', teamCount: 7, legs: 2 },
  ];

  it.each(inputs.map((input) => [JSON.stringify(input), input] as const))('%s', (_label, input) => {
    const p = plan(input, 10);
    const slotKeys = new Set(p.slots.map((s) => s.key));
    const fixtureKeys = new Set(p.fixtures.map((f) => f.key));
    const groupKeys = new Set(p.groups.map((g) => g.key));
    expect(slotKeys.size).toBe(p.slots.length);
    expect(fixtureKeys.size).toBe(p.fixtures.length);

    // 참조 무결성
    for (const s of p.slots) if (s.groupKey !== null) expect(groupKeys.has(s.groupKey)).toBe(true);
    for (const f of p.fixtures) {
      expect(groupKeys.has(f.groupKey)).toBe(true);
      for (const key of [f.homeSlotKey, f.awaySlotKey]) if (key !== null) expect(slotKeys.has(key)).toBe(true);
    }
    for (const e of p.edges) {
      expect(fixtureKeys.has(e.sourceFixtureKey)).toBe(true);
      expect(fixtureKeys.has(e.targetFixtureKey)).toBe(true);
    }

    // v1_tournament_match_advancement_edges 유일 제약 2개
    const bySource = p.edges.map((e) => `${e.sourceFixtureKey}|${e.outcome}`);
    const byTarget = p.edges.map((e) => `${e.targetFixtureKey}|${e.targetSide}`);
    expect(new Set(bySource).size).toBe(bySource.length);
    expect(new Set(byTarget).size).toBe(byTarget.length);

    // 한 사이드를 자리와 연결선이 동시에 채우지 않는다(자리 연결 사이드는 PATCH 불가, 연결선 사이드는 승자가 채움)
    for (const f of p.fixtures) {
      if (f.homeSlotKey !== null) expect(byTarget).not.toContain(`${f.key}|HOME`);
      if (f.awaySlotKey !== null) expect(byTarget).not.toContain(`${f.key}|AWAY`);
    }

    // 번호는 offset 다음부터 연속, (round, fixtureNumber, legNumber) 유일
    const numbers = p.fixtures.map((f) => f.fixtureNumber).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: p.fixtures.length }, (_, i) => 11 + i));
    const coords = p.fixtures.map((f) => `${f.round}|${f.fixtureNumber}|${f.legNumber}`);
    expect(new Set(coords).size).toBe(coords.length);
  });

  it('knockout 은 ENTRY/BYE 자리마다 정확히 한 경기 사이드에서 쓰인다', () => {
    for (const input of inputs.filter((i) => i.kind === 'knockout')) {
      const p = plan(input);
      const used = p.fixtures.flatMap((f) => [f.homeSlotKey, f.awaySlotKey]).filter((k): k is string => k !== null);
      expect([...used].sort()).toEqual(p.slots.map((s) => s.key).sort());
    }
  });
});

describe('planBracketTemplate — 거부', () => {
  it('상한 240 경기: 16팀 2회전(=240)은 통과하고 17팀 2회전(=272)은 BRACKET_TEMPLATE_TOO_LARGE', () => {
    expect(BRACKET_TEMPLATE_MAX_FIXTURES).toBe(240);
    expect(plan({ kind: 'league', teamCount: 16, legs: 2 }).fixtures).toHaveLength(240);
    expect(codeOf(() => plan({ kind: 'league', teamCount: 17, legs: 2 }))).toBe('BRACKET_TEMPLATE_TOO_LARGE');
  });

  it.each([
    [{ kind: 'knockout', size: 5, thirdPlace: false }],
    [{ kind: 'knockout', size: 16, thirdPlace: true }],
    [{ kind: 'league', teamCount: 2, legs: 1 }],
    [{ kind: 'league', teamCount: 21, legs: 1 }],
    [{ kind: 'league', teamCount: 4, legs: 3 }],
    [{ kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: false }],
  ] as unknown as Array<[BracketTemplateInput]>)('범위 밖·미지원 입력 %j → BRACKET_TEMPLATE_UNSUPPORTED', (input) => {
    expect(codeOf(() => plan(input))).toBe('BRACKET_TEMPLATE_UNSUPPORTED');
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/templates/bracket-template-plan.spec.ts`
Expected: FAIL — `Cannot find module './bracket-template-plan'`.

- [ ] **Step 3: 플래너 구현** — `apps/v1_api/src/tournaments/templates/bracket-template-plan.ts`

```ts
import { UnprocessableEntityException } from '@nestjs/common';
import type { V1TournamentGroupPhase, V1TournamentSlotKind } from '@prisma/client';
import { buildLeagueFixtureRows } from '../league-fixture-generator.service';

export type BracketTemplateInput =
  | { kind: 'knockout'; size: 4 | 8 | 12; thirdPlace: boolean }
  | { kind: 'group_knockout'; groupCount: number; teamsPerGroup: number; advancePerGroup: 1 | 2; legs: 1 | 2; thirdPlace: boolean }
  | { kind: 'league'; teamCount: number; legs: 1 | 2 };
export type PlanGroup = { key: string; name: string; phase: V1TournamentGroupPhase; sortOrder: number; advanceCount: number | null };
export type PlanSlot = { key: string; kind: V1TournamentSlotKind; groupKey: string | null; position: number; sourceGroupKey: string | null };
export type PlanFixture = { key: string; groupKey: string; round: string; fixtureNumber: number; legNumber: number; homeSlotKey: string | null; awaySlotKey: string | null };
export type PlanEdge = { sourceFixtureKey: string; outcome: 'WINNER' | 'LOSER'; targetFixtureKey: string; targetSide: 'HOME' | 'AWAY' };
export type PlanByeSlot = { groupKey: string; sortOrder: number };
export type BracketTemplatePlan = { groups: PlanGroup[]; slots: PlanSlot[]; fixtures: PlanFixture[]; edges: PlanEdge[]; byeSlots: PlanByeSlot[] };

export const BRACKET_TEMPLATE_MAX_FIXTURES = 240;

/** BYE 자리 position(1부터) → 12강 그룹 `V1TournamentByeSlot.sortOrder`. 공개 그래프의 12강 기본 부전승 위치와 같다. */
export const ROUND12_BYE_SORT_ORDERS = [0, 3, 4, 7] as const;

type KnockoutPhase = Exclude<V1TournamentGroupPhase, 'group'>;

// 조 이름은 웹 `templateFor`, 라운드 문자열은 `tournament-round-label.ts` 의 결선 라벨과 같다.
const GROUP_NAME: Record<KnockoutPhase, string> = {
  round12: '12강', quarter: '8강', semi: '4강', final: '결승', third_place: '3위 결정전',
};
const ROUND_LABEL: Record<KnockoutPhase, string> = {
  round12: '12강', quarter: '8강', semi: '4강', final: '결승', third_place: '3·4위전',
};
const FIXTURES_IN_PHASE: Record<KnockoutPhase, number> = { round12: 4, quarter: 4, semi: 2, final: 1, third_place: 1 };

function unsupported(message: string): never {
  throw new UnprocessableEntityException({ code: 'BRACKET_TEMPLATE_UNSUPPORTED', message });
}

const range = (count: number): number[] => Array.from({ length: count }, (_, index) => index + 1);

function entrySlot(groupKey: string, position: number): PlanSlot {
  return { key: `entry-${position}`, kind: 'ENTRY', groupKey, position, sourceGroupKey: null };
}

function planKnockout(input: Extract<BracketTemplateInput, { kind: 'knockout' }>, offset: number): BracketTemplatePlan {
  const phases: KnockoutPhase[] = [];
  if (input.size === 12) phases.push('round12');
  if (input.size >= 8) phases.push('quarter');
  phases.push('semi', 'final');
  if (input.thirdPlace) phases.push('third_place');

  const groups: PlanGroup[] = phases.map((phase, index) => (
    { key: phase, name: GROUP_NAME[phase], phase, sortOrder: index, advanceCount: null }
  ));
  let fixtureNumber = offset;
  const fixtures: PlanFixture[] = phases.flatMap((phase) => range(FIXTURES_IN_PHASE[phase]).map((n) => ({
    key: `${phase}-${n}`, groupKey: phase, round: ROUND_LABEL[phase],
    fixtureNumber: ++fixtureNumber, legNumber: 1, homeSlotKey: null, awaySlotKey: null,
  })));
  const fixtureOf = (key: string): PlanFixture => {
    const found = fixtures.find((fixture) => fixture.key === key);
    if (found === undefined) throw new Error(`template plan has no fixture ${key}`);
    return found;
  };

  const slots: PlanSlot[] = [];
  const firstPhase = phases[0];
  fixtures.filter((fixture) => fixture.groupKey === firstPhase).forEach((fixture, index) => {
    const home = entrySlot(firstPhase, index * 2 + 1);
    const away = entrySlot(firstPhase, index * 2 + 2);
    slots.push(home, away);
    fixture.homeSlotKey = home.key;
    fixture.awaySlotKey = away.key;
  });

  const byeSlots: PlanByeSlot[] = [];
  if (input.size === 12) {
    for (const n of range(4)) {
      slots.push({ key: `bye-${n}`, kind: 'BYE', groupKey: 'round12', position: n, sourceGroupKey: null });
      byeSlots.push({ groupKey: 'round12', sortOrder: ROUND12_BYE_SORT_ORDERS[n - 1] });
      fixtureOf(`quarter-${n}`).homeSlotKey = `bye-${n}`;
    }
  }

  const edges: PlanEdge[] = [];
  const link = (source: string, outcome: 'WINNER' | 'LOSER', target: string, targetSide: 'HOME' | 'AWAY') => {
    edges.push({ sourceFixtureKey: source, outcome, targetFixtureKey: target, targetSide });
  };
  if (input.size === 12) for (const n of range(4)) link(`round12-${n}`, 'WINNER', `quarter-${n}`, 'AWAY');
  if (input.size >= 8) {
    for (const j of range(2)) {
      link(`quarter-${2 * j - 1}`, 'WINNER', `semi-${j}`, 'HOME');
      link(`quarter-${2 * j}`, 'WINNER', `semi-${j}`, 'AWAY');
    }
  }
  link('semi-1', 'WINNER', 'final-1', 'HOME');
  link('semi-2', 'WINNER', 'final-1', 'AWAY');
  if (input.thirdPlace) {
    link('semi-1', 'LOSER', 'third_place-1', 'HOME');
    link('semi-2', 'LOSER', 'third_place-1', 'AWAY');
  }
  return { groups, slots, fixtures, edges, byeSlots };
}

function planLeague(input: Extract<BracketTemplateInput, { kind: 'league' }>, offset: number): BracketTemplatePlan {
  const groupKey = 'league';
  const slots = range(input.teamCount).map((position) => entrySlot(groupKey, position));
  // 기존 생성기의 페어링·라운드 이름('league_r{n}')을 그대로 쓰되 등록 id 자리에 슬롯 키를 넣는다.
  const rows = buildLeagueFixtureRows({
    groupId: groupKey, registrationIds: slots.map((slot) => slot.key), legs: input.legs,
    balanceHome: true, schedule: null, fixtureNumberOffset: offset,
  });
  return {
    groups: [{ key: groupKey, name: '리그', phase: 'group', sortOrder: 0, advanceCount: null }],
    slots,
    fixtures: rows.map((row) => ({
      key: `league-${row.fixtureNumber - offset}`, groupKey, round: row.round,
      fixtureNumber: row.fixtureNumber, legNumber: row.legNumber,
      homeSlotKey: row.homeRegistrationId, awaySlotKey: row.awayRegistrationId,
    })),
    edges: [],
    byeSlots: [],
  };
}

function build(input: BracketTemplateInput, offset: number): BracketTemplatePlan {
  switch (input.kind) {
    case 'knockout':
      if (!([4, 8, 12] as readonly number[]).includes(input.size)) unsupported('토너먼트는 4강·8강·12강으로만 만들 수 있어요.');
      return planKnockout(input, offset);
    case 'league':
      if (!Number.isInteger(input.teamCount) || input.teamCount < 3 || input.teamCount > 20) unsupported('리그는 3~20팀으로 만들 수 있어요.');
      if (input.legs !== 1 && input.legs !== 2) unsupported('회전 수는 1 또는 2예요.');
      return planLeague(input, offset);
    case 'group_knockout':
      return unsupported('조별+결선 템플릿은 아직 지원하지 않아요.');
  }
}

export function planBracketTemplate(input: BracketTemplateInput, ctx: { fixtureNumberOffset: number }): BracketTemplatePlan {
  const plan = build(input, ctx.fixtureNumberOffset);
  if (plan.fixtures.length > BRACKET_TEMPLATE_MAX_FIXTURES) {
    throw new UnprocessableEntityException({
      code: 'BRACKET_TEMPLATE_TOO_LARGE',
      message: `한 번에 만들 수 있는 경기는 최대 ${BRACKET_TEMPLATE_MAX_FIXTURES}개예요. 팀 수나 회전 수를 줄여 주세요.`,
    });
  }
  return plan;
}
```

- [ ] **Step 4: 실행 — 통과 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/templates/bracket-template-plan.spec.ts`
Expected: PASS (전체).

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_api/src/tournaments/templates/bracket-template-plan.ts apps/v1_api/src/tournaments/templates/bracket-template-plan.spec.ts
git commit -m "feat(bracket): 대진 템플릿 순수 플래너(토너먼트 4/8/12·리그)" -- apps/v1_api/src/tournaments/templates/bracket-template-plan.ts apps/v1_api/src/tournaments/templates/bracket-template-plan.spec.ts
git show --stat HEAD
```
Expected: 위 2개 파일만.

---

### Task 3: 교체 시 경기 삭제 순서 `orderFixturesForTeardown`

`replaceExisting` 는 기존 경기를 `softDeleteTournamentFixtureInTx`(PR-1a, 기존 `deleteFixture` 본문)로 지운다. 그 본문은 **지우는 경기의 진출 대상 경기에 팀이 배정돼 있으면** 409 `FIXTURE_DOWNSTREAM_ASSIGNED`(`tournament-bracket.service.ts:1026`)를 던진다. 하류(결승·3·4위전)부터 지우면 상류를 지울 때 연결 대상이 이미 없어 걸리지 않는다 — 그 순서를 보장하는 순수 함수다.

**Files:**
- Create: `apps/v1_api/src/tournaments/templates/bracket-teardown-order.ts`
- Test: `apps/v1_api/src/tournaments/templates/bracket-teardown-order.spec.ts`

**Interfaces:**
- Produces: `orderFixturesForTeardown(fixtureIds: readonly string[], edges: ReadonlyArray<{ sourceTeamMatchId: string; targetTeamMatchId: string }>): string[]` — 연결 대상이 모두 앞에 나온 순서, 같은 단계는 id 오름차순.

- [ ] **Step 1: 실패하는 테스트 작성** — `apps/v1_api/src/tournaments/templates/bracket-teardown-order.spec.ts`

```ts
import { orderFixturesForTeardown } from './bracket-teardown-order';

const edge = (sourceTeamMatchId: string, targetTeamMatchId: string) => ({ sourceTeamMatchId, targetTeamMatchId });

describe('orderFixturesForTeardown', () => {
  it('8강 대진: 결승·3·4위전 → 4강 → 8강 순서로, 연결 대상이 항상 먼저 지워진다', () => {
    const ids = ['q1', 'q2', 'q3', 'q4', 's1', 's2', 'final', 'third'];
    const edges = [
      edge('q1', 's1'), edge('q2', 's1'), edge('q3', 's2'), edge('q4', 's2'),
      edge('s1', 'final'), edge('s2', 'final'), edge('s1', 'third'), edge('s2', 'third'),
    ];
    const order = orderFixturesForTeardown(ids, edges);
    expect(order).toHaveLength(8);
    for (const { sourceTeamMatchId, targetTeamMatchId } of edges) {
      expect(order.indexOf(targetTeamMatchId)).toBeLessThan(order.indexOf(sourceTeamMatchId));
    }
  });

  it('연결이 없는 경기(리그)는 id 오름차순이다', () => {
    expect(orderFixturesForTeardown(['c', 'a', 'b'], [])).toEqual(['a', 'b', 'c']);
  });

  it('입력 순서가 달라도 결과가 같다', () => {
    const edges = [edge('a', 'b'), edge('b', 'c')];
    expect(orderFixturesForTeardown(['a', 'b', 'c'], edges)).toEqual(orderFixturesForTeardown(['c', 'a', 'b'], edges));
    expect(orderFixturesForTeardown(['a', 'b', 'c'], edges)).toEqual(['c', 'b', 'a']);
  });

  it('지우는 집합 밖의 경기로 가는 연결은 순서를 막지 않는다(대조군)', () => {
    expect(orderFixturesForTeardown(['a', 'b'], [edge('a', 'outside'), edge('outside', 'b')])).toEqual(['a', 'b']);
  });

  it('연결에 순환이 있으면 조용히 넘기지 않고 던진다', () => {
    expect(() => orderFixturesForTeardown(['a', 'b'], [edge('a', 'b'), edge('b', 'a')])).toThrow('cycle');
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/templates/bracket-teardown-order.spec.ts`
Expected: FAIL — `Cannot find module './bracket-teardown-order'`.

- [ ] **Step 3: 구현** — `apps/v1_api/src/tournaments/templates/bracket-teardown-order.ts`

```ts
export type TeardownEdge = { sourceTeamMatchId: string; targetTeamMatchId: string };

/**
 * 하류(연결 대상)를 먼저 지우는 순서. 대상이 모두 지워진 경기가 "준비됨"이고, 준비된 경기는 id 순으로 낸다.
 * 연결 그래프는 인접 단계끼리만 이어져 DAG 다 — 순환은 데이터 손상이므로 삼키지 않고 던진다.
 */
export function orderFixturesForTeardown(
  fixtureIds: readonly string[],
  edges: readonly TeardownEdge[],
): string[] {
  const ids = new Set(fixtureIds);
  const pendingTargets = new Map<string, Set<string>>();
  const dependents = new Map<string, string[]>();
  for (const id of ids) pendingTargets.set(id, new Set());
  for (const { sourceTeamMatchId: source, targetTeamMatchId: target } of edges) {
    if (!ids.has(source) || !ids.has(target)) continue;
    (pendingTargets.get(source) as Set<string>).add(target);
    dependents.set(target, [...(dependents.get(target) ?? []), source]);
  }

  const ready = [...ids].filter((id) => (pendingTargets.get(id) as Set<string>).size === 0).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift() as string;
    order.push(id);
    for (const source of dependents.get(id) ?? []) {
      const pending = pendingTargets.get(source) as Set<string>;
      pending.delete(id);
      if (pending.size === 0) {
        ready.push(source);
        ready.sort();
      }
    }
  }
  if (order.length !== ids.size) throw new Error('advancement edges contain a cycle');
  return order;
}
```

- [ ] **Step 4: 실행 — 통과 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/templates/bracket-teardown-order.spec.ts`
Expected: PASS (5건).

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_api/src/tournaments/templates/bracket-teardown-order.ts apps/v1_api/src/tournaments/templates/bracket-teardown-order.spec.ts
git commit -m "feat(bracket): 템플릿 교체용 경기 삭제 순서(하류 먼저)" -- apps/v1_api/src/tournaments/templates/bracket-teardown-order.ts apps/v1_api/src/tournaments/templates/bracket-teardown-order.spec.ts
git show --stat HEAD
```

---

### Task 4: 템플릿 DTO `ApplyBracketTemplateDto` 와 입력 변환

**Files:**
- Create: `apps/v1_api/src/tournaments/templates/dto/bracket-template.dto.ts`
- Test: `apps/v1_api/src/tournaments/templates/dto/bracket-template.dto.spec.ts`

**Interfaces:**
- Consumes: `BracketTemplateInput` (Task 2)
- Produces: `class ApplyBracketTemplateDto`, `toBracketTemplateInput(dto: ApplyBracketTemplateDto): BracketTemplateInput`

DTO 는 타입만 검증하고(`@IsInt`·`@IsBoolean`, 터무니없는 값만 `@Max(1000)` 으로 400) **범위·kind 별 필수 필드는 422 `BRACKET_TEMPLATE_UNSUPPORTED`** 로 서비스가 판정한다(색인 에러 코드표).

- [ ] **Step 1: 실패하는 테스트 작성** — `apps/v1_api/src/tournaments/templates/dto/bracket-template.dto.spec.ts`

```ts
import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ApplyBracketTemplateDto, toBracketTemplateInput } from './bracket-template.dto';

// main.ts 전역 파이프와 같은 옵션.
const pipe = new ValidationPipe({
  whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true },
});
const run = (body: Record<string, unknown>) => pipe.transform(body, { type: 'body', metatype: ApplyBracketTemplateDto });
const codeOf = (fn: () => unknown) => {
  try { fn(); } catch (e) { return (e as { response?: { code?: string } }).response?.code; }
  return undefined;
};

describe('ApplyBracketTemplateDto', () => {
  it('토너먼트 본문을 입력으로 바꾼다 — thirdPlace 생략은 false', async () => {
    expect(toBracketTemplateInput(await run({ kind: 'knockout', size: 8, thirdPlace: true }))).toEqual({ kind: 'knockout', size: 8, thirdPlace: true });
    expect(toBracketTemplateInput(await run({ kind: 'knockout', size: 4 }))).toEqual({ kind: 'knockout', size: 4, thirdPlace: false });
  });

  it('리그·조별+결선 본문을 입력으로 바꾼다', async () => {
    expect(toBracketTemplateInput(await run({ kind: 'league', teamCount: 6, legs: 2 }))).toEqual({ kind: 'league', teamCount: 6, legs: 2 });
    expect(
      toBracketTemplateInput(await run({ kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: true })),
    ).toEqual({ kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: true });
  });

  it('replaceExisting 은 입력(계획)이 아니라 DTO 에만 남는다', async () => {
    const dto = await run({ kind: 'league', teamCount: 4, legs: 1, replaceExisting: true });
    expect(dto.replaceExisting).toBe(true);
    expect(toBracketTemplateInput(dto)).not.toHaveProperty('replaceExisting');
  });

  it.each([
    ['알 수 없는 필드', { kind: 'knockout', size: 8, extra: 1 }],
    ['알 수 없는 kind', { kind: 'round_robin' }],
    ['숫자가 아닌 size', { kind: 'knockout', size: 'abc' }],
    ['kind 누락', { size: 8 }],
  ])('400 으로 거부한다 — %s', async (_label, body) => {
    await expect(run(body)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['토너먼트 size 누락', { kind: 'knockout' }],
    ['리그 teamCount 누락', { kind: 'league', legs: 1 }],
    ['리그 legs 누락', { kind: 'league', teamCount: 4 }],
    ['조별+결선 advancePerGroup 누락', { kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, legs: 1 }],
  ])('kind 별 필수 필드 누락은 422 BRACKET_TEMPLATE_UNSUPPORTED — %s', async (_label, body) => {
    const dto = await run(body);
    expect(codeOf(() => toBracketTemplateInput(dto))).toBe('BRACKET_TEMPLATE_UNSUPPORTED');
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/templates/dto/bracket-template.dto.spec.ts`
Expected: FAIL — `Cannot find module './bracket-template.dto'`.

- [ ] **Step 3: 구현** — `apps/v1_api/src/tournaments/templates/dto/bracket-template.dto.ts`

```ts
import { UnprocessableEntityException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { BracketTemplateInput } from '../bracket-template-plan';

export const BRACKET_TEMPLATE_KINDS = ['knockout', 'group_knockout', 'league'] as const;
export type BracketTemplateKind = (typeof BRACKET_TEMPLATE_KINDS)[number];

export class ApplyBracketTemplateDto {
  @IsIn(BRACKET_TEMPLATE_KINDS)
  kind!: BracketTemplateKind;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  size?: number;

  @IsOptional() @IsBoolean()
  thirdPlace?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  groupCount?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  teamsPerGroup?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  advancePerGroup?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  legs?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  teamCount?: number;

  @IsOptional() @IsBoolean()
  replaceExisting?: boolean;
}

function required(value: number | undefined, field: string): number {
  if (value === undefined) {
    throw new UnprocessableEntityException({ code: 'BRACKET_TEMPLATE_UNSUPPORTED', message: `${field} 값을 입력해 주세요.` });
  }
  return value;
}

/** 필수 필드 존재만 확인한다. 값의 범위(4/8/12강, 3~20팀 …)는 플래너가 같은 코드로 거부한다. */
export function toBracketTemplateInput(dto: ApplyBracketTemplateDto): BracketTemplateInput {
  switch (dto.kind) {
    case 'knockout':
      return { kind: 'knockout', size: required(dto.size, 'size') as 4 | 8 | 12, thirdPlace: dto.thirdPlace ?? false };
    case 'league':
      return { kind: 'league', teamCount: required(dto.teamCount, 'teamCount'), legs: required(dto.legs, 'legs') as 1 | 2 };
    case 'group_knockout':
      return {
        kind: 'group_knockout',
        groupCount: required(dto.groupCount, 'groupCount'),
        teamsPerGroup: required(dto.teamsPerGroup, 'teamsPerGroup'),
        advancePerGroup: required(dto.advancePerGroup, 'advancePerGroup') as 1 | 2,
        legs: required(dto.legs, 'legs') as 1 | 2,
        thirdPlace: dto.thirdPlace ?? false,
      };
  }
}
```

- [ ] **Step 4: 실행 — 통과 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/templates/dto/bracket-template.dto.spec.ts`
Expected: PASS (11건).

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_api/src/tournaments/templates/dto/bracket-template.dto.ts apps/v1_api/src/tournaments/templates/dto/bracket-template.dto.spec.ts
git commit -m "feat(bracket): 템플릿 요청 DTO와 입력 변환" -- apps/v1_api/src/tournaments/templates/dto/bracket-template.dto.ts apps/v1_api/src/tournaments/templates/dto/bracket-template.dto.spec.ts
git show --stat HEAD
```

---

### Task 5: 템플릿 실행기 `BracketTemplateService.apply` (빈 대진에 생성) + 컨트롤러 + 모듈

**Files:**
- Create: `apps/v1_api/test/helpers/bracket-canvas-fixture.ts`
- Create: `apps/v1_api/src/tournaments/templates/bracket-template.service.ts`
- Create: `apps/v1_api/src/tournaments/templates/bracket-template.controller.ts`
- Test: `apps/v1_api/test/tournaments/bracket-template.integration-spec.ts`
- Test: `apps/v1_api/src/tournaments/templates/bracket-template.controller.spec.ts`
- Modify: `apps/v1_api/src/tournaments/tournaments.module.ts` — `controllers`(`:79-96`)·`providers`(`:97-121`)에 등록

**Interfaces:**
- Consumes (PR-1a, `tournaments/tournament-bracket-tx.ts`): `createGroupInTx(tx, admin, tournamentId, { name; phase; sortOrder; advanceCount })`, `createEmptyTournamentFixtureInTx(tx, { games }, admin, { tournament: { id; sportId; regionId; venue; competitionConfigVersionId; title }; groupId; round; fixtureNumber; legNumber; homeSlotId; awaySlotId }): Promise<{ id: string }>`
- Consumes (기존): `createTournamentMatchAdvancementEdgeInTx(tx, input)` (`tournament-match-creation.ts:284`), `findTournamentOnSurface`, `lockCompetitionForBracketMutationInTx` (Task 1), `planBracketTemplate`·`toBracketTemplateInput` (Task 2·4)
- Produces: `BracketTemplateService.apply(user: V1AuthUser, tournamentId: string, dto: ApplyBracketTemplateDto): Promise<{ groups: number; slots: number; fixtures: number; edges: number }>`

- [ ] **Step 0: PR-1a 전제 확인** (코드를 쓰기 전에 한 번)

Run: `grep -n "export async function createEmptyTournamentFixtureInTx" -A60 apps/v1_api/src/tournaments/tournament-bracket-tx.ts | grep -n "nextFixtureCreationCommandId"`
Expected: 1줄 이상. `createEmptyTournamentFixtureInTx` 가 `createFixture` 와 같은 키(`tournament-fixture:{tournamentId}:{round}:{fixtureNumber}:{legNumber}`)에 `nextFixtureCreationCommandId`(소프트 삭제 이력 수 반영)를 쓰는지 확인하는 것이다. 없으면 PR-1a 계약 위반이므로 이 PR 에서 시그니처를 바꾸지 말고 PR-1a 에 돌려보낸다(Task 6 의 "두 번 교체" 테스트가 이 전제를 실제로 검증한다).

- [ ] **Step 1: 통합 스펙용 시드 헬퍼 작성** — `apps/v1_api/test/helpers/bracket-canvas-fixture.ts`

```ts
import { PrismaService } from '../../src/prisma/prisma.service';
import { competitionConfigFixture as ids } from '../fixtures/competition-config.fixture';

const CONFIG_VERSION_ID = '11111111-1111-4111-8111-111111111111';

export type SeededBracketTournament = { tournamentId: string; teamIds: string[]; registrationIds: string[] };

/**
 * `seedCompetitionConfigFixture` 가 만든 관리자·종목·지역 위에 새 대회와 확정 등록 N개를 만든다.
 * 대회마다 라벨이 달라 한 스펙 안에서 서로 간섭하지 않는다. status 기본은 draft(대진 삭제·교체가 허용되는 상태).
 */
export async function seedBracketTournament(
  prisma: PrismaService,
  input: {
    label: string;
    format: 'knockout' | 'group_knockout' | 'league';
    teamCount: number;
    status?: 'draft' | 'open' | 'closed' | 'in_progress';
    withConfig?: boolean;
  },
): Promise<SeededBracketTournament> {
  const tournament = await prisma.v1Tournament.create({
    data: {
      sportId: ids.soccerSportId,
      title: `${input.label} 대회`,
      status: input.status ?? 'draft',
      format: input.format,
      ...(input.withConfig === false ? {} : { competitionConfigVersionId: CONFIG_VERSION_ID }),
    },
  });
  const teamIds: string[] = [];
  const registrationIds: string[] = [];
  for (let index = 1; index <= input.teamCount; index += 1) {
    const team = await prisma.v1Team.create({
      data: { ownerUserId: ids.adminUserId, sportId: ids.soccerSportId, regionId: ids.regionId, name: `${input.label} 팀${index}` },
    });
    const registration = await prisma.v1TournamentRegistration.create({
      data: { tournamentId: tournament.id, teamId: team.id, appliedByUserId: ids.adminUserId, status: 'confirmed' },
    });
    teamIds.push(team.id);
    registrationIds.push(registration.id);
  }
  return { tournamentId: tournament.id, teamIds, registrationIds };
}

/** 쓰기 권한이 없는 support 어드민 계정. */
export async function seedSupportAdmin(prisma: PrismaService, label: string) {
  const user = await prisma.v1User.create({
    data: { email: `${label}@example.test`, accountStatus: 'active', onboardingStatus: 'completed' },
  });
  await prisma.v1AdminUser.create({ data: { userId: user.id, adminRole: 'support', status: 'active' } });
  return { id: user.id, email: user.email, accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
}
```

- [ ] **Step 2: 실패하는 통합 스펙 작성** — `apps/v1_api/test/tournaments/bracket-template.integration-spec.ts`

```ts
import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament, seedSupportAdmin } from '../helpers/bracket-canvas-fixture';

const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'bracket-template@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const templates = new BracketTemplateService(prisma, new AdminContextService(prisma), games);

const liveFixtures = (tournamentId: string) => prisma.v1TournamentMatchDetails.findMany({
  where: { tournamentId, teamMatch: { deletedAt: null } },
  include: { teamMatch: { include: { homeSlot: true, awaySlot: true } } },
  orderBy: { fixtureNumber: 'asc' },
});
const counts = async (tournamentId: string) => ({
  fixtures: (await liveFixtures(tournamentId)).length,
  groups: await prisma.v1TournamentGroup.count({ where: { tournamentId } }),
  slots: await prisma.v1TournamentSlot.count({ where: { tournamentId } }),
  edges: await prisma.v1TournamentMatchAdvancementEdge.count({ where: { tournamentId } }),
});

describe('대진 템플릿 실행기 (PostgreSQL)', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, user);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('토너먼트 8강 + 3·4위전: 조 4 · 자리 8 · 경기 8(번호 1~8, 팀 미정) · 연결 8', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'ko8', format: 'knockout', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true }))
      .resolves.toEqual({ groups: 4, slots: 8, fixtures: 8, edges: 8 });

    const fixtures = await liveFixtures(tournamentId);
    expect(fixtures.map((f) => f.fixtureNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(fixtures.map((f) => f.round)).toEqual(['8강', '8강', '8강', '8강', '4강', '4강', '결승', '3·4위전']);
    expect(await counts(tournamentId)).toEqual({ fixtures: 8, groups: 4, slots: 8, edges: 8 });
    for (const f of fixtures) {
      expect(f.teamMatch.hostTeamId).toBeNull();
      expect(f.teamMatch.approvedApplicantTeamId).toBeNull();
    }
    expect(await prisma.v1Game.count({ where: { teamMatchId: { in: fixtures.map((f) => f.teamMatchId) } } })).toBe(8);
    const quarter1 = fixtures[0].teamMatch;
    expect([quarter1.homeSlot?.kind, quarter1.homeSlot?.position, quarter1.awaySlot?.position]).toEqual(['ENTRY', 1, 2]);
  });

  it('토너먼트 12강 + 3·4위전: BYE 자리 4 ↔ ByeSlot sortOrder 0,3,4,7, 8강 i번 홈 = BYE i · 어웨이 = 12강 i번 WINNER', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'ko12', format: 'knockout', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 12, thirdPlace: true }))
      .resolves.toEqual({ groups: 5, slots: 12, fixtures: 12, edges: 12 });

    const byes = await prisma.v1TournamentByeSlot.findMany({ where: { group: { tournamentId } }, include: { group: true }, orderBy: { sortOrder: 'asc' } });
    expect(byes.map((b) => [b.group.phase, b.sortOrder])).toEqual([['round12', 0], ['round12', 3], ['round12', 4], ['round12', 7]]);

    const fixtures = await liveFixtures(tournamentId);
    const round12 = fixtures.filter((f) => f.round === '12강');
    const quarters = fixtures.filter((f) => f.round === '8강');
    expect(round12).toHaveLength(4);
    for (const [index, quarter] of quarters.entries()) {
      expect([quarter.teamMatch.homeSlot?.kind, quarter.teamMatch.homeSlot?.position]).toEqual(['BYE', index + 1]);
      expect(quarter.teamMatch.awaySlotId).toBeNull();
      const incoming = await prisma.v1TournamentMatchAdvancementEdge.findMany({ where: { targetTeamMatchId: quarter.teamMatchId } });
      expect(incoming).toHaveLength(1);
      expect(incoming[0]).toMatchObject({ sourceTeamMatchId: round12[index].teamMatchId, sourceOutcome: 'WINNER', targetSide: 'AWAY' });
    }
  });

  it('리그 방식 대회 6팀 2회전: 조 "리그" 1 · 자리 6 · 경기 30, 자리마다 10개 사이드에서 쓰인다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'lg6', format: 'league', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, { kind: 'league', teamCount: 6, legs: 2 }))
      .resolves.toEqual({ groups: 1, slots: 6, fixtures: 30, edges: 0 });
    const group = await prisma.v1TournamentGroup.findFirstOrThrow({ where: { tournamentId } });
    expect([group.name, group.phase, group.advanceCount]).toEqual(['리그', 'group', null]);
    const fixtures = await liveFixtures(tournamentId);
    const usage = new Map<string, number>();
    for (const f of fixtures) for (const slotId of [f.teamMatch.homeSlotId, f.teamMatch.awaySlotId]) {
      usage.set(slotId as string, (usage.get(slotId as string) ?? 0) + 1);
    }
    expect([...usage.values()]).toEqual([10, 10, 10, 10, 10, 10]);
  });

  it('대회 format 과 다른 템플릿은 422 이고 아무것도 만들지 않는다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'mismatch', format: 'league', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: false }))
      .rejects.toMatchObject({ response: { code: 'BRACKET_TEMPLATE_FORMAT_MISMATCH' } });
    expect(await counts(tournamentId)).toEqual({ fixtures: 0, groups: 0, slots: 0, edges: 0 });
  });

  it('조별+결선 템플릿은 이 PR 에서 422 BRACKET_TEMPLATE_UNSUPPORTED', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'gk', format: 'group_knockout', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, {
      kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: false,
    })).rejects.toMatchObject({ response: { code: 'BRACKET_TEMPLATE_UNSUPPORTED' } });
    expect(await counts(tournamentId)).toEqual({ fixtures: 0, groups: 0, slots: 0, edges: 0 });
  });

  it('경기 규칙 버전이 없는 대회는 409 COMPETITION_CONFIG_REQUIRED, 아무것도 만들지 않는다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'noconfig', format: 'knockout', teamCount: 0, withConfig: false });
    await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 4, thirdPlace: false }))
      .rejects.toMatchObject({ response: { code: 'COMPETITION_CONFIG_REQUIRED' } });
    expect(await counts(tournamentId)).toEqual({ fixtures: 0, groups: 0, slots: 0, edges: 0 });
  });

  it('비어 있지 않은 대진에 다시 적용하면 409 BRACKET_NOT_EMPTY 이고 기존 대진은 그대로다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'notempty', format: 'knockout', teamCount: 0 });
    await templates.apply(user, tournamentId, { kind: 'knockout', size: 4, thirdPlace: true });
    const before = await counts(tournamentId);
    await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true }))
      .rejects.toMatchObject({ response: { code: 'BRACKET_NOT_EMPTY' } });
    expect(await counts(tournamentId)).toEqual(before);
  });

  it('support 어드민은 403 이다', async () => {
    const support = await seedSupportAdmin(prisma, 'template-support');
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'support', format: 'knockout', teamCount: 0 });
    await expect(templates.apply(support, tournamentId, { kind: 'knockout', size: 4, thirdPlace: false }))
      .rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(await counts(tournamentId)).toEqual({ fixtures: 0, groups: 0, slots: 0, edges: 0 });
  });

  it('같은 대회에 템플릿을 동시에 두 번 적용하면 하나만 성공하고 대진은 한 벌뿐이다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'race', format: 'knockout', teamCount: 0 });
    const results = await Promise.allSettled([
      templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true }),
      templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ response: { code: 'BRACKET_NOT_EMPTY' } });
    expect(await counts(tournamentId)).toEqual({ fixtures: 8, groups: 4, slots: 8, edges: 8 });
  });
});
```

위 스펙의 DTO 인자는 평탄화 객체 리터럴이다(`ApplyBracketTemplateDto` 구조적 호환 — `kind` 만 필수).

- [ ] **Step 3: 컨트롤러 라우트 계약 테스트 작성** — `apps/v1_api/src/tournaments/templates/bracket-template.controller.spec.ts`

```ts
import 'reflect-metadata';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { BracketTemplateController } from './bracket-template.controller';

describe('BracketTemplateController 라우트 계약', () => {
  it('POST admin/tournaments/:tournamentId/bracket/template, 인증 가드 아래', () => {
    const handler = BracketTemplateController.prototype.apply;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('admin/tournaments/:tournamentId/bracket/template');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(GUARDS_METADATA, BracketTemplateController)).toContain(V1AuthGuard);
  });
});
```

- [ ] **Step 4: 실행 — 실패 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/templates/bracket-template.controller.spec.ts`
Expected: FAIL — `Cannot find module './bracket-template.controller'`.
통합 스펙(CI/로컬 DB): `TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --runInBand --testEnvironment "<rootDir>/test/helpers/isolated-integration-environment.cjs" --testMatch "<rootDir>/test/tournaments/bracket-template.integration-spec.ts`" → FAIL — `Cannot find module '.../bracket-template.service'`.

- [ ] **Step 5: 실행기 구현** — `apps/v1_api/src/tournaments/templates/bracket-template.service.ts`

`applyInTx` 의 "비어 있지 않음" 분기는 이 Task 에서 항상 409 `BRACKET_NOT_EMPTY` 로 끝난다. `replaceExisting` 교체는 Task 6 이 이 분기만 바꾼다.

```ts
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminContextService, type V1ActiveAdmin } from '../../common/admin-context.service';
import { GamesService } from '../../games/games.service';
import { PrismaService } from '../../prisma/prisma.service';
import { lockCompetitionForBracketMutationInTx, type LockableCompetition } from '../slots/competition-bracket-lock';
import { createEmptyTournamentFixtureInTx, createGroupInTx } from '../tournament-bracket-tx';
import { createTournamentMatchAdvancementEdgeInTx } from '../tournament-match-creation';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from '../tournament-surface-lookup';
import { planBracketTemplate, type BracketTemplateInput, type BracketTemplatePlan } from './bracket-template-plan';
import { ApplyBracketTemplateDto, toBracketTemplateInput } from './dto/bracket-template.dto';

// 경기 최대 240개를 한 트랜잭션에서 만든다. 앞단 ALB idle_timeout(60초)보다 낮게 둔다
// (league-fixture-generator.service.ts 의 TRANSACTION_TIMEOUT_MS 주석과 같은 이유).
const TRANSACTION_OPTIONS = { timeout: 45_000, maxWait: 5_000 } as const;

type Tx = Prisma.TransactionClient;
type PinnedTournament = {
  id: string; sportId: string; regionId: string | null; venue: string | null; title: string; competitionConfigVersionId: string;
};

function lookup(map: ReadonlyMap<string, string>, key: string, what: string): string {
  const id = map.get(key);
  if (id === undefined) throw new Error(`template plan references unknown ${what} ${key}`);
  return id;
}

@Injectable()
export class BracketTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly games: GamesService,
  ) {}

  async apply(user: V1AuthUser, tournamentId: string, dto: ApplyBracketTemplateDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const input = toBracketTemplateInput(dto);
    const tournament = await findTournamentOnSurface(this.prisma, TOURNAMENT_KINDS, {
      where: { id: tournamentId, deletedAt: null },
      select: { id: true, format: true, kind: true },
    });
    if (tournament === null) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }
    if (tournament.format !== input.kind) {
      throw new UnprocessableEntityException({
        code: 'BRACKET_TEMPLATE_FORMAT_MISMATCH',
        message: '대회 진행 방식과 맞지 않는 템플릿이에요.',
      });
    }
    // 잠금을 잡기 전에 422(범위 밖·상한 초과)를 먼저 낸다. 번호 offset 은 잠금 안에서 다시 정한다.
    planBracketTemplate(input, { fixtureNumberOffset: 0 });

    return this.prisma.$transaction(
      (tx) => this.applyInTx(tx, admin, tournament, input, dto.replaceExisting ?? false),
      TRANSACTION_OPTIONS,
    );
  }

  private async applyInTx(
    tx: Tx,
    admin: V1ActiveAdmin,
    tournament: LockableCompetition,
    input: BracketTemplateInput,
    replaceExisting: boolean,
  ) {
    await lockCompetitionForBracketMutationInTx(tx, tournament);
    const pinned = await this.loadPinnedTournament(tx, tournament.id);

    const existing = await this.loadExisting(tx, tournament.id);
    if (!existing.isEmpty) {
      // replaceExisting 교체는 Task 6 에서 이 분기에 들어온다.
      throw new ConflictException({ code: 'BRACKET_NOT_EMPTY', message: '이미 대진이 있어요. 비어 있는 대진에서만 템플릿으로 시작할 수 있어요.' });
    }

    const maxNumber = await tx.v1TournamentMatchDetails.aggregate({
      where: { tournamentId: tournament.id, teamMatch: { deletedAt: null } },
      _max: { fixtureNumber: true },
    });
    const plan = planBracketTemplate(input, { fixtureNumberOffset: maxNumber._max.fixtureNumber ?? 0 });
    await this.materialize(tx, admin, pinned, plan);

    const counts = { groups: plan.groups.length, slots: plan.slots.length, fixtures: plan.fixtures.length, edges: plan.edges.length };
    await this.adminContext.logAdminAction(admin, {
      action: 'tournament.bracket.template.apply',
      targetType: 'tournament',
      targetId: tournament.id,
      afterJson: { input: { ...input }, replaced: false, ...counts },
    }, tx);
    return counts;
  }

  /** 잠금 안에서 다시 읽는다 — 경기 규칙 버전이 없으면 아무것도 지우거나 만들기 전에 끊는다. */
  private async loadPinnedTournament(tx: Tx, tournamentId: string): Promise<PinnedTournament> {
    const pinned = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, {
      where: { id: tournamentId, deletedAt: null },
      select: { id: true, sportId: true, regionId: true, venue: true, title: true, competitionConfigVersionId: true },
    });
    if (pinned === null) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }
    if (pinned.competitionConfigVersionId === null) {
      throw new ConflictException({ code: 'COMPETITION_CONFIG_REQUIRED', message: '대회 경기에는 활성 경기 규칙 버전이 필요해요.' });
    }
    return { ...pinned, competitionConfigVersionId: pinned.competitionConfigVersionId };
  }

  private async loadExisting(tx: Tx, tournamentId: string) {
    const fixtures = await tx.v1TournamentMatchDetails.findMany({
      where: { tournamentId, teamMatch: { deletedAt: null } },
      select: {
        teamMatchId: true,
        teamMatch: { select: { status: true, game: { select: { state: true, currentOfficialRevisionId: true } } } },
      },
      orderBy: { teamMatchId: 'asc' },
    });
    const groups = await tx.v1TournamentGroup.findMany({ where: { tournamentId }, select: { id: true }, orderBy: { id: 'asc' } });
    const slotCount = await tx.v1TournamentSlot.count({ where: { tournamentId } });
    return { fixtures, groups, isEmpty: fixtures.length === 0 && groups.length === 0 && slotCount === 0 };
  }

  private async materialize(tx: Tx, admin: V1ActiveAdmin, tournament: PinnedTournament, plan: BracketTemplatePlan) {
    const groupIds = new Map<string, string>();
    for (const group of plan.groups) {
      const created = await createGroupInTx(tx, admin, tournament.id, {
        name: group.name, phase: group.phase, sortOrder: group.sortOrder, advanceCount: group.advanceCount,
      });
      groupIds.set(group.key, created.id);
    }

    const slotIds = new Map<string, string>();
    await tx.v1TournamentSlot.createMany({
      data: plan.slots.map((slot) => {
        const id = randomUUID();
        slotIds.set(slot.key, id);
        return {
          id,
          tournamentId: tournament.id,
          kind: slot.kind,
          groupId: slot.groupKey === null ? null : lookup(groupIds, slot.groupKey, 'group'),
          position: slot.position,
          sourceGroupId: slot.sourceGroupKey === null ? null : lookup(groupIds, slot.sourceGroupKey, 'group'),
        };
      }),
    });
    await tx.v1TournamentByeSlot.createMany({
      data: plan.byeSlots.map((bye) => ({ groupId: lookup(groupIds, bye.groupKey, 'group'), sortOrder: bye.sortOrder })),
    });

    const fixtureIds = new Map<string, string>();
    for (const fixture of [...plan.fixtures].sort((a, b) => a.fixtureNumber - b.fixtureNumber)) {
      const created = await createEmptyTournamentFixtureInTx(tx, { games: this.games }, admin, {
        tournament,
        groupId: lookup(groupIds, fixture.groupKey, 'group'),
        round: fixture.round,
        fixtureNumber: fixture.fixtureNumber,
        legNumber: fixture.legNumber,
        homeSlotId: fixture.homeSlotKey === null ? null : lookup(slotIds, fixture.homeSlotKey, 'slot'),
        awaySlotId: fixture.awaySlotKey === null ? null : lookup(slotIds, fixture.awaySlotKey, 'slot'),
      });
      fixtureIds.set(fixture.key, created.id);
    }
    for (const edge of plan.edges) {
      await createTournamentMatchAdvancementEdgeInTx(tx, {
        tournamentId: tournament.id,
        sourceTeamMatchId: lookup(fixtureIds, edge.sourceFixtureKey, 'fixture'),
        sourceOutcome: edge.outcome,
        targetTeamMatchId: lookup(fixtureIds, edge.targetFixtureKey, 'fixture'),
        targetSide: edge.targetSide,
      });
    }
  }
}
```

`apps/v1_api/src/tournaments/templates/bracket-template.controller.ts`:

```ts
import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { BracketTemplateService } from './bracket-template.service';
import { ApplyBracketTemplateDto } from './dto/bracket-template.dto';

/** 어드민 전용. 인증은 V1AuthGuard, 쓰기 권한(support 거부)은 서비스의 getMutationAdmin 이 다시 본다. */
@Controller()
@UseGuards(V1AuthGuard)
export class BracketTemplateController {
  constructor(private readonly templates: BracketTemplateService) {}

  @Post('admin/tournaments/:tournamentId/bracket/template')
  apply(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: ApplyBracketTemplateDto,
  ) {
    return this.templates.apply(user, tournamentId, dto);
  }
}
```

`apps/v1_api/src/tournaments/tournaments.module.ts` 수정 — import 두 줄을 `TournamentBracketService` import(`:17`) 아래에 추가하고, `TournamentBracketController`(`:85`) 다음 줄에 `BracketTemplateController,`, `TournamentBracketService`(`:102`) 다음 줄에 `BracketTemplateService,` 를 넣는다:

```ts
import { BracketTemplateController } from './templates/bracket-template.controller';
import { BracketTemplateService } from './templates/bracket-template.service';
```

- [ ] **Step 6: 실행 — 통과 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/templates`
Expected: PASS (플래너·삭제 순서·DTO·컨트롤러 전부).
통합: `TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --runInBand --testEnvironment "<rootDir>/test/helpers/isolated-integration-environment.cjs" --testMatch "<rootDir>/test/tournaments/bracket-template.integration-spec.ts`" → PASS (8건).
타입: `cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json"` → `tx.v1TournamentSlot`·`homeSlot` 타입 오류 0.

- [ ] **Step 7: 커밋**

```bash
git add apps/v1_api/test/helpers/bracket-canvas-fixture.ts apps/v1_api/src/tournaments/templates/bracket-template.service.ts apps/v1_api/src/tournaments/templates/bracket-template.controller.ts apps/v1_api/src/tournaments/templates/bracket-template.controller.spec.ts apps/v1_api/test/tournaments/bracket-template.integration-spec.ts
git commit -m "feat(bracket): 대진 템플릿 실행기와 POST bracket/template" -- apps/v1_api/test/helpers/bracket-canvas-fixture.ts apps/v1_api/src/tournaments/templates/bracket-template.service.ts apps/v1_api/src/tournaments/templates/bracket-template.controller.ts apps/v1_api/src/tournaments/templates/bracket-template.controller.spec.ts apps/v1_api/test/tournaments/bracket-template.integration-spec.ts apps/v1_api/src/tournaments/tournaments.module.ts
git show --stat HEAD
```
Expected: 위 6개 파일만.

---

### Task 6: `replaceExisting` 교체 — 순서·`BRACKET_LOCKED`·재교체

스펙 S2 순서: ① 경기 소프트 삭제 → ② 자리 삭제 → ③ GroupTeam·Standing·ByeSlot 삭제 → ④ 조 삭제 → 새로 생성. **하나라도 시작·결과가 있으면 아무것도 지우기 전에** 409 `BRACKET_LOCKED`.

**Files:**
- Modify: `apps/v1_api/src/tournaments/templates/bracket-template.service.ts` — `applyInTx` 의 `if (!existing.isEmpty)` 분기, 새 private 메서드 2개, import
- Test: `apps/v1_api/test/tournaments/bracket-template.integration-spec.ts` (케이스 추가)

**Interfaces:**
- Consumes (PR-1a): `softDeleteTournamentFixtureInTx(tx, admin, fixtureId): Promise<void>` (자리 연결 해제 포함), `deleteTournamentGroupInTx(tx, admin, groupId): Promise<void>`
- Consumes: `orderFixturesForTeardown` (Task 3)

- [ ] **Step 1: 실패하는 테스트 추가** — `bracket-template.integration-spec.ts` 의 마지막 `});`(describe 닫기) 바로 앞에 붙인다.

```ts
  describe('replaceExisting', () => {
    const archived = (tournamentId: string) => prisma.v1TeamMatch.count({ where: { tournamentId, deletedAt: { not: null } } });

    it('시작 전 대진을 새 템플릿으로 교체한다 — 옛 경기는 소프트 삭제, 자리·조·연결은 새것만 남는다', async () => {
      const { tournamentId } = await seedBracketTournament(prisma, { label: 'replace', format: 'knockout', teamCount: 0 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true });

      await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 4, thirdPlace: false, replaceExisting: true }))
        .resolves.toEqual({ groups: 2, slots: 4, fixtures: 3, edges: 2 });

      expect(await counts(tournamentId)).toEqual({ fixtures: 3, groups: 2, slots: 4, edges: 2 });
      expect(await archived(tournamentId)).toBe(8);
      expect((await liveFixtures(tournamentId)).map((f) => f.fixtureNumber)).toEqual([1, 2, 3]); // 번호는 offset 0 부터 다시
      const names = (await prisma.v1TournamentGroup.findMany({ where: { tournamentId }, orderBy: { sortOrder: 'asc' } })).map((g) => g.name);
      expect(names).toEqual(['4강', '결승']);
    });

    it('같은 대회를 연달아 두 번 교체해도 생성 키가 충돌하지 않는다 (소프트 삭제 이력 수 반영)', async () => {
      const { tournamentId } = await seedBracketTournament(prisma, { label: 'replace-twice', format: 'knockout', teamCount: 0 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true, replaceExisting: true });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true, replaceExisting: true });
      expect(await counts(tournamentId)).toEqual({ fixtures: 8, groups: 4, slots: 8, edges: 8 });
      expect(await archived(tournamentId)).toBe(16);
    });

    it('경기가 시작됐거나(game ≠ SCHEDULED) 완료된 대진은 409 BRACKET_LOCKED 이고 아무것도 지우지 않는다', async () => {
      for (const [label, mutate] of [
        ['locked-live', (teamMatchId: string) => prisma.v1Game.update({ where: { teamMatchId }, data: { state: 'LIVE' } })],
        ['locked-completed', (teamMatchId: string) => prisma.v1TeamMatch.update({ where: { id: teamMatchId }, data: { status: 'completed' } })],
      ] as const) {
        const { tournamentId } = await seedBracketTournament(prisma, { label, format: 'knockout', teamCount: 0 });
        await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true });
        const before = await counts(tournamentId);
        const target = (await liveFixtures(tournamentId))[5]; // 4강 한 경기
        await mutate(target.teamMatchId);

        await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 4, thirdPlace: false, replaceExisting: true }))
          .rejects.toMatchObject({ response: { code: 'BRACKET_LOCKED' } });
        expect(await counts(tournamentId)).toEqual(before);
        expect(await archived(tournamentId)).toBe(0);
      }
    });

    it('대진이 비어 있으면 replaceExisting 이어도 그냥 만든다', async () => {
      const { tournamentId } = await seedBracketTournament(prisma, { label: 'replace-empty', format: 'knockout', teamCount: 0 });
      await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 4, thirdPlace: false, replaceExisting: true }))
        .resolves.toEqual({ groups: 2, slots: 4, fixtures: 3, edges: 2 });
    });

    it('조 편성·순위 행이 남은 리그 방식 대회도 교체되고 그 행들은 지워진다', async () => {
      const { tournamentId, registrationIds } = await seedBracketTournament(prisma, { label: 'replace-league', format: 'league', teamCount: 1 });
      await templates.apply(user, tournamentId, { kind: 'league', teamCount: 4, legs: 1 });
      const group = await prisma.v1TournamentGroup.findFirstOrThrow({ where: { tournamentId } });
      await prisma.v1TournamentGroupTeam.create({ data: { groupId: group.id, registrationId: registrationIds[0] } });
      await prisma.v1TournamentStanding.create({ data: { groupId: group.id, registrationId: registrationIds[0] } });

      await templates.apply(user, tournamentId, { kind: 'league', teamCount: 3, legs: 1, replaceExisting: true });

      expect(await prisma.v1TournamentGroupTeam.count({ where: { group: { tournamentId } } })).toBe(0);
      expect(await prisma.v1TournamentStanding.count({ where: { group: { tournamentId } } })).toBe(0);
      expect(await counts(tournamentId)).toEqual({ fixtures: 3, groups: 1, slots: 3, edges: 0 });
    });
  });
```

- [ ] **Step 2: 실행 — 실패 확인**

Run(통합): `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --runInBand --testEnvironment "<rootDir>/test/helpers/isolated-integration-environment.cjs" --testMatch "<rootDir>/test/tournaments/bracket-template.integration-spec.ts" -t replaceExisting`
Expected: FAIL — 교체 케이스가 `BRACKET_NOT_EMPTY` 로 끝나고(`resolves` 기대가 깨짐), "비어 있으면 그냥 만든다" 케이스만 통과한다.

- [ ] **Step 3: 구현** — `bracket-template.service.ts`

import 에 추가:

```ts
import { deleteTournamentGroupInTx, softDeleteTournamentFixtureInTx } from '../tournament-bracket-tx';
import { orderFixturesForTeardown } from './bracket-teardown-order';
```
(`../tournament-bracket-tx` 는 이미 `createEmptyTournamentFixtureInTx, createGroupInTx` 를 import 하고 있으니 한 import 문에 합친다.)

`applyInTx` 의 `if (!existing.isEmpty) { … }` 블록 전체를 아래로 바꾸고, `counts` 이후 감사의 `replaced: false` 를 `replaced` 로 바꾼다(`let replaced = false;` 를 `loadExisting` 호출 다음 줄에 선언).

```ts
    let replaced = false;
    if (!existing.isEmpty) {
      if (!replaceExisting) {
        throw new ConflictException({ code: 'BRACKET_NOT_EMPTY', message: '이미 대진이 있어요. 비어 있는 대진에서만 템플릿으로 시작할 수 있어요.' });
      }
      this.assertReplaceable(existing.fixtures);
      await this.teardown(tx, admin, tournament.id, existing);
      replaced = true;
    }
```

새 private 메서드(같은 클래스 안, `loadExisting` 아래):

```ts
  /** 하나라도 시작·결과가 있으면 아무것도 지우기 전에 끊는다. */
  private assertReplaceable(fixtures: Awaited<ReturnType<BracketTemplateService['loadExisting']>>['fixtures']) {
    const locked = fixtures.filter(({ teamMatch }) =>
      teamMatch.status !== 'matched' ||
      teamMatch.game === null ||
      teamMatch.game.state !== 'SCHEDULED' ||
      teamMatch.game.currentOfficialRevisionId !== null);
    if (locked.length > 0) {
      throw new ConflictException({
        code: 'BRACKET_LOCKED',
        message: '시작했거나 결과가 있는 경기가 있어 대진을 새로 만들 수 없어요.',
        details: { lockedFixtureCount: locked.length },
      });
    }
  }

  /** 스펙 S2 순서: 경기(하류 먼저) → 자리 → GroupTeam·Standing·ByeSlot → 조. */
  private async teardown(
    tx: Tx,
    admin: V1ActiveAdmin,
    tournamentId: string,
    existing: Awaited<ReturnType<BracketTemplateService['loadExisting']>>,
  ) {
    const edges = await tx.v1TournamentMatchAdvancementEdge.findMany({
      where: { tournamentId },
      select: { sourceTeamMatchId: true, targetTeamMatchId: true },
    });
    for (const fixtureId of orderFixturesForTeardown(existing.fixtures.map((fixture) => fixture.teamMatchId), edges)) {
      await softDeleteTournamentFixtureInTx(tx, admin, fixtureId);
    }
    await tx.v1TournamentSlot.deleteMany({ where: { tournamentId } });
    await tx.v1TournamentStanding.deleteMany({ where: { group: { tournamentId } } });
    await tx.v1TournamentGroupTeam.deleteMany({ where: { group: { tournamentId } } });
    await tx.v1TournamentByeSlot.deleteMany({ where: { group: { tournamentId } } });
    for (const group of existing.groups) await deleteTournamentGroupInTx(tx, admin, group.id);
  }
```

- [ ] **Step 4: 실행 — 통과 확인**

Run(통합): `TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --runInBand --testEnvironment "<rootDir>/test/helpers/isolated-integration-environment.cjs" --testMatch "<rootDir>/test/tournaments/bracket-template.integration-spec.ts`"
Expected: PASS (이 Task 의 5건 포함 전체). "두 번 교체" 가 FAIL 이면 Step 0 의 PR-1a 전제(생성 키)가 깨진 것이다.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(bracket): 템플릿 replaceExisting 교체와 BRACKET_LOCKED" -- apps/v1_api/src/tournaments/templates/bracket-template.service.ts apps/v1_api/test/tournaments/bracket-template.integration-spec.ts
git show --stat HEAD
```

---

### Task 7: 자리 배정 코어 — `assignSlotInTx` fan-out · `TournamentSlotService.assignSlot`

자리를 쓰는 경기(비삭제·비취소)를 id 순으로 잠그고, 그 경기들의 사이드만 바꾼다. 조 편성(Task 9)·부전승(Task 10)·배치(Task 11)는 뒤 Task 가 이 코어에 끼운다. HTTP 계층(DTO·컨트롤러·모듈 등록)은 Task 8 이 얹는다 — 이 Task 는 서비스를 직접 생성해 쓰는 단위·통합 스펙으로 닫는다.

**Files:**
- Create: `apps/v1_api/src/tournaments/slots/slot-fixtures.ts`
- Create: `apps/v1_api/src/tournaments/slots/tournament-slot.service.ts`
- Test: `apps/v1_api/src/tournaments/slots/tournament-slot.service.spec.ts` (권한·404 단위)
- Test: `apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts` (생성)
- Modify: `apps/v1_api/scripts/tournament-league-allowed-baseline.json` — 서비스 파일 `allowed: 2` 추가

**Interfaces:**
- Consumes (PR-1a): `assignTournamentFixtureSideInTx(tx, deps, admin, { fixtureId; side: 'HOME' | 'AWAY'; registrationId: string | null }): Promise<void>` · `serializeAdminBracketSlot(row): AdminBracketSlot`·`adminBracketSlotInclude` (`tournaments/slots/admin-bracket-view.ts`) — 라벨은 그 안에서 `tournamentSlotLabel` 로 만든다
- Consumes (기존): `lockGameRows(tx, gameIds)` (`games/roster/game-row-lock.ts`), Task 1 잠금 헬퍼
- Produces:
  - `type SlotMutationContext = { admin: V1ActiveAdmin; adminContext: AdminContextService; games: GamesService }`
  - `assignSlotInTx(tx, ctx: SlotMutationContext, slotId: string, registrationId: string | null): Promise<string[]>` — **호출자가 `lockCompetitionForBracketMutationInTx` 를 이미 잡은 트랜잭션에서** 부른다. 영향 경기 id(오름차순).
  - `TournamentSlotService.assignSlot(user, slotId, registrationId): Promise<{ slot: AdminBracketSlot; affectedTeamMatchIds: string[] }>`

- [ ] **Step 1: 단위 테스트 작성(권한·404)** — `apps/v1_api/src/tournaments/slots/tournament-slot.service.spec.ts`


```ts
import { PrismaService } from '../../prisma/prisma.service';
import { AdminContextService } from '../../common/admin-context.service';
import type { GamesService } from '../../games/games.service';
import { TournamentSlotService } from './tournament-slot.service';

const user = { id: 'u-1', email: 'u@test.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const adminRow = (adminRole: 'owner' | 'ops' | 'support') => ({
  id: 'a-1', userId: 'u-1', adminRole, status: 'active' as const, user: { accountStatus: 'active' as const },
});

function build(admin: ReturnType<typeof adminRow> | null) {
  const prisma = {
    v1AdminUser: { findUnique: jest.fn(async () => admin) },
    v1TournamentSlot: { findUnique: jest.fn(async () => null) },
    v1Tournament: { findFirst: jest.fn(async () => null) },
    $transaction: jest.fn(),
  };
  const service = new TournamentSlotService(
    prisma as unknown as PrismaService,
    new AdminContextService(prisma as unknown as PrismaService),
    {} as GamesService,
  );
  return { prisma, service };
}

describe('TournamentSlotService.assignSlot 권한·존재 확인', () => {
  it('support 어드민은 403 이고 자리 조회나 트랜잭션에 닿지 않는다', async () => {
    const { prisma, service } = build(adminRow('support'));
    await expect(service.assignSlot(user, 's-1', null)).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(prisma.v1TournamentSlot.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('어드민이 아니면 403 이다', async () => {
    const { prisma, service } = build(null);
    await expect(service.assignSlot(user, 's-1', null)).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('없는 자리는 404 SLOT_NOT_FOUND 이고 트랜잭션을 열지 않는다', async () => {
    const { prisma, service } = build(adminRow('ops'));
    await expect(service.assignSlot(user, 's-missing', null)).rejects.toMatchObject({ response: { code: 'SLOT_NOT_FOUND' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 통합 스펙 작성(생성)** — `apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts`

```ts
import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { TournamentSlotService } from '../../src/tournaments/slots/tournament-slot.service';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament, type SeededBracketTournament } from '../helpers/bracket-canvas-fixture';

const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'tournament-slots@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const adminContext = new AdminContextService(prisma);
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const templates = new BracketTemplateService(prisma, adminContext, games);
const slots = new TournamentSlotService(prisma, adminContext, games);

const slotAt = (tournamentId: string, position: number, kind: 'ENTRY' | 'BYE' = 'ENTRY') =>
  prisma.v1TournamentSlot.findFirstOrThrow({ where: { tournamentId, kind, position } });
const fixturesUsing = (slotId: string) => prisma.v1TeamMatch.findMany({
  where: { OR: [{ homeSlotId: slotId }, { awaySlotId: slotId }] },
  include: { game: { include: { sides: true } }, tournamentDetails: true },
  orderBy: { id: 'asc' },
});
const allFixtures = (tournamentId: string) => prisma.v1TeamMatch.findMany({
  where: { tournamentId }, include: { game: { include: { sides: true } }, tournamentDetails: true }, orderBy: { id: 'asc' },
});
const sideTeam = (fixture: Awaited<ReturnType<typeof allFixtures>>[number], slotId: string) =>
  fixture.homeSlotId === slotId ? fixture.hostTeamId : fixture.approvedApplicantTeamId;

/** 리그 방식 대회 4팀 1회전 = 경기 6, 자리마다 3경기. 팀은 4개를 확정 등록으로 둔다. */
async function leagueOf4(label: string) {
  const seeded = await seedBracketTournament(prisma, { label, format: 'league', teamCount: 4 });
  await templates.apply(user, seeded.tournamentId, { kind: 'league', teamCount: 4, legs: 1 });
  return seeded;
}

describe('자리 배정 (PostgreSQL)', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, user);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  describe('fan-out', () => {
    it('자리 하나에 팀을 넣으면 그 자리를 쓰는 3경기만 바뀌고 나머지 3경기는 그대로다', async () => {
      const { tournamentId, registrationIds, teamIds } = await leagueOf4('fan-out');
      const slot1 = await slotAt(tournamentId, 1);

      const result = await slots.assignSlot(user, slot1.id, registrationIds[0]);

      const using = await fixturesUsing(slot1.id);
      expect(using).toHaveLength(3);
      expect(result.affectedTeamMatchIds).toEqual(using.map((f) => f.id)); // id 오름차순
      expect(result.slot).toMatchObject({ id: slot1.id, registrationId: registrationIds[0], teamName: 'fan-out 팀1' });
      for (const fixture of using) {
        expect(sideTeam(fixture, slot1.id)).toBe(teamIds[0]);
        const sideKey = fixture.homeSlotId === slot1.id ? 'HOME' : 'AWAY';
        const side = fixture.game!.sides.find((s) => s.sideKey === sideKey)!;
        expect([side.teamId, side.displayNameSnapshot]).toEqual([teamIds[0], 'fan-out 팀1']);
        const detailsReg = sideKey === 'HOME' ? fixture.tournamentDetails!.homeRegistrationId : fixture.tournamentDetails!.awayRegistrationId;
        expect(detailsReg).toBe(registrationIds[0]);
      }
      // 대조군 — 이 자리를 쓰지 않는 경기는 팀도 이름도 그대로
      const usingIds = new Set(using.map((f) => f.id));
      const others = (await allFixtures(tournamentId)).filter((f) => !usingIds.has(f.id));
      expect(others).toHaveLength(3);
      for (const fixture of others) {
        expect([fixture.hostTeamId, fixture.approvedApplicantTeamId]).toEqual([null, null]);
        expect(fixture.game!.sides.map((s) => s.displayNameSnapshot).sort()).toEqual(['어웨이 팀 미정', '홈 팀 미정']);
      }
      // 명단 재계산 이벤트가 새 팀 몫으로 남는다
      const events = await prisma.v1OutboxEvent.findMany({ where: { type: 'COMPETITION_ROSTER_RESYNC' } });
      expect(events.some((e) => (e.payload as { scope?: string; teamId?: string }).scope === 'competitionTeam'
        && (e.payload as { teamId?: string }).teamId === teamIds[0])).toBe(true);
    });

    it('두 번째 자리를 채우면 두 자리가 만나는 경기에만 양 팀이 들어간다', async () => {
      const { tournamentId, registrationIds, teamIds } = await leagueOf4('fan-out-two');
      const [slot1, slot2] = [await slotAt(tournamentId, 1), await slotAt(tournamentId, 2)];
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      await slots.assignSlot(user, slot2.id, registrationIds[1]);

      const fixtures = await allFixtures(tournamentId);
      const between = fixtures.filter((f) => [f.homeSlotId, f.awaySlotId].sort().join() === [slot1.id, slot2.id].sort().join());
      expect(between).toHaveLength(1);
      expect([between[0].hostTeamId, between[0].approvedApplicantTeamId].sort()).toEqual([teamIds[0], teamIds[1]].sort());
      const filled = fixtures.map((f) => [f.hostTeamId, f.approvedApplicantTeamId].filter((t) => t !== null).length);
      expect(filled.sort()).toEqual([0, 1, 1, 1, 1, 2]); // (1,2)=2 · (1,3)(1,4)(2,3)(2,4)=1 · (3,4)=0
    });

    it('자리를 비우면 그 경기들이 다시 미정이 되고 팀 일정이 취소된다', async () => {
      const { tournamentId, registrationIds, teamIds } = await leagueOf4('clear');
      await prisma.v1TeamMatch.updateMany({ where: { tournamentId }, data: { startAt: new Date('2026-11-01T10:00:00Z'), endAt: new Date('2026-11-01T11:00:00Z') } });
      const slot1 = await slotAt(tournamentId, 1);
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      expect(await prisma.v1TeamSchedule.count({ where: { teamId: teamIds[0], state: 'SCHEDULED' } })).toBe(3);

      const cleared = await slots.assignSlot(user, slot1.id, null);

      expect(cleared.slot).toMatchObject({ registrationId: null, teamName: null });
      for (const fixture of await fixturesUsing(slot1.id)) {
        expect(sideTeam(fixture, slot1.id)).toBeNull();
      }
      expect(await prisma.v1TeamSchedule.count({ where: { teamId: teamIds[0], state: 'SCHEDULED' } })).toBe(0);
      expect(await prisma.v1TeamSchedule.count({ where: { teamId: teamIds[0], state: 'CANCELLED' } })).toBe(3);
    });

    it('같은 팀을 같은 자리에 다시 넣으면 아무 경기도 건드리지 않는다', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('noop');
      const slot1 = await slotAt(tournamentId, 1);
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      const again = await slots.assignSlot(user, slot1.id, registrationIds[0]);
      expect(again.affectedTeamMatchIds).toEqual([]);
    });

    it('취소·삭제된 경기는 반영과 잠금 판정에서 제외된다', async () => {
      const { tournamentId, registrationIds, teamIds } = await leagueOf4('excluded');
      const slot1 = await slotAt(tournamentId, 1);
      const [cancelled, deleted, live] = await fixturesUsing(slot1.id);
      await prisma.v1TeamMatch.update({ where: { id: cancelled.id }, data: { status: 'cancelled' } });
      await prisma.v1Game.update({ where: { teamMatchId: cancelled.id }, data: { state: 'ENDED' } }); // 시작된 것처럼 — 취소라 잠그지 않아야 한다
      await prisma.v1TeamMatch.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

      const result = await slots.assignSlot(user, slot1.id, registrationIds[0]);

      expect(result.affectedTeamMatchIds).toEqual([live.id]);
      const fresh = await allFixtures(tournamentId);
      expect(sideTeam(fresh.find((f) => f.id === live.id)!, slot1.id)).toBe(teamIds[0]);
      expect(sideTeam(fresh.find((f) => f.id === cancelled.id)!, slot1.id)).toBeNull();
      expect(sideTeam(fresh.find((f) => f.id === deleted.id)!, slot1.id)).toBeNull();
    });
  });

  describe('거부', () => {
    it('시작된 경기가 있으면 409 SLOT_LOCKED 이고 어떤 경기도 바뀌지 않는다', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('locked');
      const slot1 = await slotAt(tournamentId, 1);
      const slot2 = await slotAt(tournamentId, 2);
      const started = (await fixturesUsing(slot1.id)).find((f) => [f.homeSlotId, f.awaySlotId].includes(slot2.id))!; // (1,2) 경기
      await prisma.v1Game.update({ where: { teamMatchId: started.id }, data: { state: 'LIVE' } });

      await expect(slots.assignSlot(user, slot1.id, registrationIds[0])).rejects.toMatchObject({ response: { code: 'SLOT_LOCKED' } });

      expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slot1.id } })).registrationId).toBeNull();
      for (const fixture of await fixturesUsing(slot1.id)) expect(sideTeam(fixture, slot1.id)).toBeNull();
      // 대조군 — 시작된 (1,2) 경기를 쓰지 않는 자리 4 는 그대로 배정된다
      await expect(slots.assignSlot(user, (await slotAt(tournamentId, 4)).id, registrationIds[3])).resolves.toBeDefined();
    });

    it('같은 팀을 두 자리에 넣으면 409 SLOT_TEAM_ALREADY_PLACED', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('placed');
      await slots.assignSlot(user, (await slotAt(tournamentId, 1)).id, registrationIds[0]);
      await expect(slots.assignSlot(user, (await slotAt(tournamentId, 2)).id, registrationIds[0]))
        .rejects.toMatchObject({ response: { code: 'SLOT_TEAM_ALREADY_PLACED' } });
    });

    it('다른 대회 등록·미확정 등록은 422 SLOT_REGISTRATION_INVALID', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('invalid');
      const other = await seedBracketTournament(prisma, { label: 'invalid-other', format: 'league', teamCount: 1 });
      const slot1 = await slotAt(tournamentId, 1);
      await expect(slots.assignSlot(user, slot1.id, other.registrationIds[0]))
        .rejects.toMatchObject({ response: { code: 'SLOT_REGISTRATION_INVALID' } });
      await prisma.v1TournamentRegistration.update({ where: { id: registrationIds[1] }, data: { status: 'paid' } });
      await expect(slots.assignSlot(user, slot1.id, registrationIds[1]))
        .rejects.toMatchObject({ response: { code: 'SLOT_REGISTRATION_INVALID' } });
      await expect(slots.assignSlot(user, slot1.id, registrationIds[0])).resolves.toBeDefined(); // 대조군
    });

    it('정규 리그 자리는 이 PR 에서 409 SLOT_LEAGUE_NOT_SUPPORTED_YET (PR-5a 가 연다)', async () => {
      const league = await prisma.v1Tournament.create({
        data: { sportId: ids.soccerSportId, title: 'slot-league', status: 'draft', kind: 'regular_league', competitionConfigVersionId: '11111111-1111-4111-8111-111111111111' },
      });
      const slot = await prisma.v1TournamentSlot.create({ data: { tournamentId: league.id, kind: 'ENTRY', position: 1 } });
      await expect(slots.assignSlot(user, slot.id, null)).rejects.toMatchObject({ response: { code: 'SLOT_LEAGUE_NOT_SUPPORTED_YET' } });
    });
  });
});
```

- [ ] **Step 3: 실행 — 실패 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots/tournament-slot.service.spec.ts`
Expected: FAIL — `Cannot find module './tournament-slot.service'`.

- [ ] **Step 4: 구현 — 자리를 쓰는 경기 조회** — `apps/v1_api/src/tournaments/slots/slot-fixtures.ts`

```ts
import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export type SlotFixture = {
  id: string;
  homeSlotId: string | null;
  awaySlotId: string | null;
  groupId: string | null;
  groupPhase: string | null;
  game: { id: string; state: string; currentOfficialRevisionId: string | null } | null;
};

/** "자리를 쓰는 경기"(스펙 S1) — 비삭제·비취소만. 반영·잠금 판정이 모두 이 목록을 쓴다. id 오름차순. */
export async function loadSlotUsingFixtures(
  tx: Prisma.TransactionClient,
  slotIds: readonly string[],
): Promise<SlotFixture[]> {
  if (slotIds.length === 0) return [];
  const rows = await tx.v1TeamMatch.findMany({
    where: {
      deletedAt: null,
      status: { not: 'cancelled' },
      OR: [{ homeSlotId: { in: [...slotIds] } }, { awaySlotId: { in: [...slotIds] } }],
    },
    select: {
      id: true,
      homeSlotId: true,
      awaySlotId: true,
      game: { select: { id: true, state: true, currentOfficialRevisionId: true } },
      tournamentDetails: { select: { groupId: true, group: { select: { phase: true } } } },
    },
    orderBy: { id: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    homeSlotId: row.homeSlotId,
    awaySlotId: row.awaySlotId,
    groupId: row.tournamentDetails?.groupId ?? null,
    groupPhase: row.tournamentDetails?.group?.phase ?? null,
    game: row.game,
  }));
}

export function sidesUsingSlot(fixture: SlotFixture, slotId: string): Array<'HOME' | 'AWAY'> {
  return [
    ...(fixture.homeSlotId === slotId ? (['HOME'] as const) : []),
    ...(fixture.awaySlotId === slotId ? (['AWAY'] as const) : []),
  ];
}

/** 게임이 SCHEDULED 가 아니거나 공식 결과가 붙은 경기. 게임이 없으면 시작 전으로 볼 수 없다. */
export function isSlotFixtureStarted(fixture: SlotFixture): boolean {
  return fixture.game === null || fixture.game.state !== 'SCHEDULED' || fixture.game.currentOfficialRevisionId !== null;
}

export function assertSlotFixturesNotStarted(fixtures: readonly SlotFixture[]): void {
  const missing = fixtures.filter((fixture) => fixture.game === null);
  if (missing.length > 0) {
    throw new ConflictException({
      code: 'TOURNAMENT_MATCH_GAME_MISSING',
      message: '대회 경기의 정본 게임을 찾을 수 없어요.',
      details: { teamMatchIds: missing.map((fixture) => fixture.id) },
    });
  }
  const started = fixtures.filter(isSlotFixtureStarted);
  if (started.length > 0) {
    throw new ConflictException({
      code: 'SLOT_LOCKED',
      message: '이미 시작했거나 결과가 있는 경기가 있어 자리를 바꿀 수 없어요.',
      details: { teamMatchIds: started.map((fixture) => fixture.id) },
    });
  }
}
```

- [ ] **Step 5: 구현 — 서비스**

`apps/v1_api/src/tournaments/slots/tournament-slot.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, type V1CompetitionKind, type V1TournamentSlotKind } from '@prisma/client';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminContextService, type V1ActiveAdmin } from '../../common/admin-context.service';
import { GamesService } from '../../games/games.service';
import { lockGameRows } from '../../games/roster/game-row-lock';
import { PrismaService } from '../../prisma/prisma.service';
import { assignTournamentFixtureSideInTx } from '../tournament-bracket-tx';
import { adminBracketSlotInclude, serializeAdminBracketSlot } from './admin-bracket-view';
import { ALL_COMPETITION_KINDS, findTournamentOnSurface } from '../tournament-surface-lookup';
import { lockCompetitionForBracketMutationInTx } from './competition-bracket-lock';
import { assertSlotFixturesNotStarted, loadSlotUsingFixtures, sidesUsingSlot } from './slot-fixtures';

type Tx = Prisma.TransactionClient;

export type SlotMutationContext = {
  admin: V1ActiveAdmin;
  adminContext: AdminContextService;
  games: GamesService;
};

// 자리 하나가 경기 수십 개에 닿고 조 편성은 순위 재계산까지 한다 — 템플릿 실행기와 같은 상한.
const SLOT_TRANSACTION_OPTIONS = { timeout: 45_000, maxWait: 5_000 } as const;

const slotNotFound = () => new NotFoundException({ code: 'SLOT_NOT_FOUND', message: '자리를 찾을 수 없어요.' });
const alreadyPlaced = () =>
  new ConflictException({ code: 'SLOT_TEAM_ALREADY_PLACED', message: '이미 다른 자리에 들어간 팀이에요.' });

/**
 * 정규 리그 사이드 배정(`assignLeagueFixtureSideInTx`)은 PR-5a 가 들여온다. 그 전에는 리그 자리를 만드는 경로가
 * 없으므로 이 분기에 닿지 않지만, 닿으면 대회용 배정이 리그 경기에 조용히 잘못 도는 것보다 막는 편이 낫다.
 * PR-5a 가 이 함수 한 곳을 리그 분기로 바꾼다.
 */
function assertTournamentLane(kind: V1CompetitionKind | null): void {
  if (kind === 'regular_league') {
    throw new ConflictException({ code: 'SLOT_LEAGUE_NOT_SUPPORTED_YET', message: '정규 리그 자리 배정은 아직 지원하지 않아요.' });
  }
}

async function assertPlaceable(
  tx: Tx,
  slot: { id: string; tournamentId: string; kind: V1TournamentSlotKind },
  registrationId: string,
): Promise<void> {
  const registration = await tx.v1TournamentRegistration.findFirst({
    where: { id: registrationId, tournamentId: slot.tournamentId },
    select: { status: true },
  });
  if (registration === null || registration.status !== 'confirmed') {
    throw new UnprocessableEntityException({
      code: 'SLOT_REGISTRATION_INVALID',
      message: '이 대회에서 확정된 팀만 자리에 넣을 수 있어요.',
    });
  }
  // ENTRY 와 BYE 는 한 팀이 동시에 차지할 수 없다 — 유일 제약은 같은 kind 끼리만 막으므로 서비스가 교차로 막는다.
  const exclusiveKinds: V1TournamentSlotKind[] = slot.kind === 'GROUP_RANK' ? ['GROUP_RANK'] : ['ENTRY', 'BYE'];
  const placed = await tx.v1TournamentSlot.findFirst({
    where: { tournamentId: slot.tournamentId, registrationId, kind: { in: exclusiveKinds }, id: { not: slot.id } },
    select: { id: true },
  });
  if (placed !== null) throw alreadyPlaced();
}

async function assignSlotCore(
  tx: Tx,
  ctx: SlotMutationContext,
  slotId: string,
  registrationId: string | null,
): Promise<{ tournamentId: string; fixtureIds: string[] }> {
  const slot = await tx.v1TournamentSlot.findUnique({
    where: { id: slotId },
    select: { id: true, tournamentId: true, kind: true, groupId: true, position: true, registrationId: true },
  });
  if (slot === null) throw slotNotFound();
  const competition = await findTournamentOnSurface(tx, ALL_COMPETITION_KINDS, {
    where: { id: slot.tournamentId, deletedAt: null },
    select: { id: true, kind: true },
  });
  if (competition === null) {
    throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
  }
  assertTournamentLane(competition.kind);
  if (slot.registrationId === registrationId) return { tournamentId: slot.tournamentId, fixtureIds: [] };
  if (registrationId !== null) await assertPlaceable(tx, slot, registrationId);

  const fixtures = await loadSlotUsingFixtures(tx, [slot.id]);
  assertSlotFixturesNotStarted(fixtures);
  // 게임 행을 id 순으로 먼저 잡는다 — 결과 확정·명단 워커와 같은 순서라 교착하지 않는다.
  await lockGameRows(tx, fixtures.flatMap((fixture) => (fixture.game === null ? [] : [fixture.game.id])));

  try {
    await tx.v1TournamentSlot.update({ where: { id: slot.id }, data: { registrationId } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw alreadyPlaced();
    throw error;
  }
  for (const fixture of fixtures) {
    for (const side of sidesUsingSlot(fixture, slot.id)) {
      await assignTournamentFixtureSideInTx(tx, ctx, ctx.admin, { fixtureId: fixture.id, side, registrationId });
    }
  }
  const fixtureIds = fixtures.map((fixture) => fixture.id);
  await ctx.adminContext.logAdminAction(
    ctx.admin,
    {
      action: 'tournament.slot.assign',
      targetType: 'tournament_slot',
      targetId: slot.id,
      beforeJson: { registrationId: slot.registrationId },
      afterJson: { registrationId, teamMatchIds: fixtureIds },
    },
    tx,
  );
  return { tournamentId: slot.tournamentId, fixtureIds };
}

/**
 * 자리 하나를 바꾸고 그 자리를 쓰는 경기 전부에 반영한다. **호출자가 이미
 * `lockCompetitionForBracketMutationInTx` 를 잡은 트랜잭션**에서만 부른다. 영향 경기 id(오름차순)를 돌려준다.
 */
export async function assignSlotInTx(
  tx: Tx,
  ctx: SlotMutationContext,
  slotId: string,
  registrationId: string | null,
): Promise<string[]> {
  const { fixtureIds } = await assignSlotCore(tx, ctx, slotId, registrationId);
  return fixtureIds;
}

@Injectable()
export class TournamentSlotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly games: GamesService,
  ) {}

  private context(admin: V1ActiveAdmin): SlotMutationContext {
    return { admin, adminContext: this.adminContext, games: this.games };
  }

  private async loadCompetition(db: PrismaService | Tx, competitionId: string) {
    const competition = await findTournamentOnSurface(db, ALL_COMPETITION_KINDS, {
      where: { id: competitionId, deletedAt: null },
      select: { id: true, kind: true },
    });
    if (competition === null) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }
    return competition;
  }

  async assignSlot(user: V1AuthUser, slotId: string, registrationId: string | null) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const slot = await this.prisma.v1TournamentSlot.findUnique({ where: { id: slotId }, select: { tournamentId: true } });
    if (slot === null) throw slotNotFound();
    const competition = await this.loadCompetition(this.prisma, slot.tournamentId);
    return this.prisma.$transaction(async (tx) => {
      await lockCompetitionForBracketMutationInTx(tx, competition);
      const affectedTeamMatchIds = await assignSlotInTx(tx, this.context(admin), slotId, registrationId);
      const row = await tx.v1TournamentSlot.findUniqueOrThrow({ where: { id: slotId }, include: adminBracketSlotInclude });
      return { slot: serializeAdminBracketSlot(row), affectedTeamMatchIds };
    }, SLOT_TRANSACTION_OPTIONS);
  }
}
```

- [ ] **Step 6: 리그 허용 baseline 갱신** — `apps/v1_api/scripts/tournament-league-allowed-baseline.json`

이 서비스는 `ALL_COMPETITION_KINDS` 를 호출부 2곳(`assignSlotInTx` 안의 조회와 `loadCompetition` — import 줄은 세지 않는다)에서 쓴다. `v1-surface-check` 는 허용치 초과도, 실측보다 큰 baseline 도 둘 다 실패시키므로 **정확히 실측 개수**를 적는다. 마지막 항목 뒤에 추가한다(Task 12 가 3 으로 올린다).

```json
  "src/tournaments/slots/tournament-slot.service.ts": {
    "allowed": 2,
    "why": "자리는 대회와 정규 리그가 같은 모델을 공유한다 — 자리 배정·조회는 종류를 가르지 않고 불러온 뒤 lane 검사(assertTournamentLane)가 정규 리그 자리를 SLOT_LEAGUE_NOT_SUPPORTED_YET 로 막는다. PR-5a 가 리그 lane 을 연다."
  }
```

`_comment` 의 합계 서술은 갱신하지 않아도 되지만(검사는 항목 합을 계산한다), 한 줄 덧붙인다: `2026-10-08 KST: 대진 자리 서비스 2곳 추가`.

- [ ] **Step 7: 실행 — 통과 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots/tournament-slot.service.spec.ts src/tournaments/slots/competition-bracket-lock.spec.ts`
Expected: PASS (잠금 헬퍼 5 + 서비스 3).
통합: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --runInBand --testEnvironment "<rootDir>/test/helpers/isolated-integration-environment.cjs" --testMatch "<rootDir>/test/tournaments/tournament-slots.integration-spec.ts"` → PASS (fan-out 5 + 거부 4).
타입: `cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json"` → 오류 0(`homeSlotId`·`tx.v1TournamentSlot`).
게이트: `cd apps/v1_api && node scripts/v1-surface-check.mjs` → 통과(`[league 허용]` 항목이 서비스 파일 `허용 2` 와 일치).

- [ ] **Step 8: 커밋**

```bash
git add apps/v1_api/src/tournaments/slots/slot-fixtures.ts apps/v1_api/src/tournaments/slots/tournament-slot.service.ts apps/v1_api/src/tournaments/slots/tournament-slot.service.spec.ts apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts
git commit -m "feat(bracket): 자리 배정 코어 assignSlotInTx" -- apps/v1_api/src/tournaments/slots/slot-fixtures.ts apps/v1_api/src/tournaments/slots/tournament-slot.service.ts apps/v1_api/src/tournaments/slots/tournament-slot.service.spec.ts apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts apps/v1_api/scripts/tournament-league-allowed-baseline.json
git show --stat HEAD
```
Expected: 위 5개 파일만.

---

### Task 8: 자리 배정 HTTP 계층 — `PUT admin/tournament-slots/:slotId/assignment`

Task 7 의 `TournamentSlotService.assignSlot` 을 DTO 검증·인증 가드·라우트로 노출하고 모듈에 등록한다. 서비스 로직은 건드리지 않는다.

**Files:**
- Create: `apps/v1_api/src/tournaments/slots/tournament-slot.controller.ts`
- Create: `apps/v1_api/src/tournaments/slots/dto/tournament-slot.dto.ts`
- Test: `apps/v1_api/src/tournaments/slots/tournament-slot.controller.spec.ts` (라우트 계약)
- Test: `apps/v1_api/src/tournaments/slots/dto/tournament-slot.dto.spec.ts`
- Modify: `apps/v1_api/src/tournaments/tournaments.module.ts` — `TournamentSlotController`·`TournamentSlotService` 등록

**Interfaces:**
- Consumes (Task 7): `TournamentSlotService.assignSlot(user, slotId, registrationId)`
- Produces: `AssignSlotDto { registrationId: string | null }`, `TournamentSlotController.assign`

- [ ] **Step 1: 테스트 작성(DTO·라우트 계약)**

`apps/v1_api/src/tournaments/slots/dto/tournament-slot.dto.spec.ts`:

```ts
import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AssignSlotDto } from './tournament-slot.dto';

const pipe = new ValidationPipe({
  whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true },
});
const run = (body: Record<string, unknown>) => pipe.transform(body, { type: 'body', metatype: AssignSlotDto });
const UUID = '5b0f3a6e-3c7e-4b57-9c1e-7c1f4f0a9a11';

describe('AssignSlotDto', () => {
  it('uuid 와 null(비우기)을 받는다', async () => {
    await expect(run({ registrationId: UUID })).resolves.toMatchObject({ registrationId: UUID });
    await expect(run({ registrationId: null })).resolves.toMatchObject({ registrationId: null });
  });

  it.each([
    ['키 누락(비우기는 null 을 명시해야 한다)', {}],
    ['uuid 가 아닌 문자열', { registrationId: 'abc' }],
    ['알 수 없는 필드', { registrationId: UUID, kind: 'BYE' }],
  ])('400 으로 거부한다 — %s', async (_label, body) => {
    await expect(run(body)).rejects.toBeInstanceOf(BadRequestException);
  });
});
```



```ts
import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { TournamentSlotController } from './tournament-slot.controller';

describe('TournamentSlotController 라우트 계약', () => {
  it('PUT admin/tournament-slots/:slotId/assignment, 인증 가드 아래', () => {
    const handler = TournamentSlotController.prototype.assign;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('admin/tournament-slots/:slotId/assignment');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.PUT);
    expect(Reflect.getMetadata(GUARDS_METADATA, TournamentSlotController)).toContain(V1AuthGuard);
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots/dto/tournament-slot.dto.spec.ts src/tournaments/slots/tournament-slot.controller.spec.ts`
Expected: FAIL — `Cannot find module './tournament-slot.dto'` 등.

- [ ] **Step 3: 구현 — DTO·컨트롤러·모듈**

`apps/v1_api/src/tournaments/slots/dto/tournament-slot.dto.ts`:

```ts
import { IsUUID, ValidateIf } from 'class-validator';

export class AssignSlotDto {
  /** null = 자리 비우기. 키를 아예 빼면 400 — 비우려면 null 을 명시한다. */
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  registrationId!: string | null;
}
```

`apps/v1_api/src/tournaments/slots/tournament-slot.controller.ts`:

```ts
import { Body, Controller, Param, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { AssignSlotDto } from './dto/tournament-slot.dto';
import { TournamentSlotService } from './tournament-slot.service';

/** 어드민 전용. 인증은 V1AuthGuard, 쓰기 권한(support 거부)은 서비스의 getMutationAdmin 이 다시 본다. */
@Controller()
@UseGuards(V1AuthGuard)
export class TournamentSlotController {
  constructor(private readonly slots: TournamentSlotService) {}

  @Put('admin/tournament-slots/:slotId/assignment')
  assign(
    @CurrentUser() user: V1AuthUser,
    @Param('slotId') slotId: string,
    @Body() dto: AssignSlotDto,
  ) {
    return this.slots.assignSlot(user, slotId, dto.registrationId);
  }
}
```

`tournaments.module.ts`: `import { TournamentSlotController } from './slots/tournament-slot.controller';` · `import { TournamentSlotService } from './slots/tournament-slot.service';` 추가, `controllers` 에 `TournamentSlotController,`, `providers` 에 `TournamentSlotService,` 를 `BracketTemplate*` 다음 줄에 넣는다.

- [ ] **Step 4: 실행 — 통과 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots`
Expected: PASS (잠금 헬퍼 5 + 서비스 3 + DTO 4 + 컨트롤러 1).
타입: `cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json"` → 오류 0.

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_api/src/tournaments/slots/tournament-slot.controller.ts apps/v1_api/src/tournaments/slots/tournament-slot.controller.spec.ts apps/v1_api/src/tournaments/slots/dto/tournament-slot.dto.ts apps/v1_api/src/tournaments/slots/dto/tournament-slot.dto.spec.ts
git commit -m "feat(bracket): PUT tournament-slots/:slotId/assignment 라우트" -- apps/v1_api/src/tournaments/slots/tournament-slot.controller.ts apps/v1_api/src/tournaments/slots/tournament-slot.controller.spec.ts apps/v1_api/src/tournaments/slots/dto/tournament-slot.dto.ts apps/v1_api/src/tournaments/slots/dto/tournament-slot.dto.spec.ts apps/v1_api/src/tournaments/tournaments.module.ts
git show --stat HEAD
```
Expected: 위 5개 파일만.

---

### Task 9: 조별 조(`phase=group`) 자리 — 이전 팀 해제 (`releaseUnusedGroupTeamsInTx`)

조별 순위·순위대로 채우기는 `V1TournamentGroupTeam` 을 정본으로 읽는다. **편성 생성은 이미 된다** — 자리 배정이 부르는 PR-1a 의 `assignTournamentFixtureSideInTx` → `updateTournamentFixtureInTx` 가 `phase=group` 조에서 `ensureGroupPhaseTeamsInTx` 를 호출한다(Task 0 Step 2). 이 Task 가 더하는 것은 **해제**뿐이다: 교체·비우기 때 **그 조의 다른 비삭제·비취소 경기에 더 이상 나오지 않는 이전 팀**의 편성과 순위 행을 지우고 순위를 다시 계산한다(해제 로직은 지금 코드에 없어 새로 만든다).

**Files:**
- Modify: `apps/v1_api/src/tournaments/tournament-bracket-tx.ts` — `releaseUnusedGroupTeamsInTx` 한 함수만 추가(PR-1a 산출물; 다른 함수는 고치지 않는다)
- Modify: `apps/v1_api/src/tournaments/slots/tournament-slot.service.ts` — `assignSlotCore`·`assignSlotInTx`·`releaseGroupTeams`
- Test: `apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts` (describe 추가)

**Interfaces:**
- Consumes (PR-1a, 같은 파일): `recalculateStandingsInTx(tx, tournamentId)`, `writeAdminActionLog(tx, admin, input)`
- Produces:
  - `releaseUnusedGroupTeamsInTx(tx, admin: V1ActiveAdmin, tournamentId: string, groupId: string, registrationIds: readonly string[]): Promise<void>` — 각 등록이 그 조의 비삭제·비취소 경기 어디에도 없을 때만 지운다(보충표 시그니처).
  - 서비스 안: `type GroupTeamRelease = { groupId: string; registrationId: string }` · `releaseGroupTeams(tx, ctx, tournamentId, releases)` — 후보를 조별로 모아 위 함수를 조마다 한 번씩 부른다.

- [ ] **Step 1: 실패하는 통합 테스트 추가** — `tournament-slots.integration-spec.ts` 최상위 `describe` 안, `describe('거부', …)` 다음에 붙인다. 파일 상단 import 에 `import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';` 와 `const bracket = new TournamentBracketService(prisma, adminContext, games);` 를 추가한다.

```ts
  describe('조 편성 (phase=group)', () => {
    const groupTeams = (tournamentId: string) =>
      prisma.v1TournamentGroupTeam.findMany({ where: { group: { tournamentId } }, orderBy: { sortOrder: 'asc' } });

    it('자리에 팀을 넣으면 조 편성이 생기고, 자리 3개를 채우면 중복 없이 3행이다', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('gt-create');
      for (const position of [1, 2, 3]) await slots.assignSlot(user, (await slotAt(tournamentId, position)).id, registrationIds[position - 1]);
      const rows = await groupTeams(tournamentId);
      expect(rows.map((r) => [r.registrationId, r.isBye, r.sortOrder])).toEqual([
        [registrationIds[0], false, 0], [registrationIds[1], false, 1], [registrationIds[2], false, 2],
      ]);
    });

    it('비우면 편성과 그 팀의 순위 행이 지워진다 — 다른 팀의 편성은 그대로(대조군)', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('gt-clear');
      const [slot1, slot2] = [await slotAt(tournamentId, 1), await slotAt(tournamentId, 2)];
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      await slots.assignSlot(user, slot2.id, registrationIds[1]);
      const group = await prisma.v1TournamentGroup.findFirstOrThrow({ where: { tournamentId } });
      await prisma.v1TournamentStanding.create({ data: { groupId: group.id, registrationId: registrationIds[0] } });

      await slots.assignSlot(user, slot1.id, null);

      expect((await groupTeams(tournamentId)).map((r) => r.registrationId)).toEqual([registrationIds[1]]);
      expect(await prisma.v1TournamentStanding.count({ where: { groupId: group.id, registrationId: registrationIds[0] } })).toBe(0);
    });

    it('A → B 로 교체하면 A 의 편성은 지워지고 B 의 편성이 생긴다', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('gt-swap-team');
      const slot1 = await slotAt(tournamentId, 1);
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      await slots.assignSlot(user, slot1.id, registrationIds[1]);
      expect((await groupTeams(tournamentId)).map((r) => r.registrationId)).toEqual([registrationIds[1]]);
    });

    it('이전 팀이 그 조의 다른 경기(수동 생성)에 남아 있으면 편성을 지우지 않는다 (대조군)', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('gt-keep');
      const slot1 = await slotAt(tournamentId, 1);
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      const group = await prisma.v1TournamentGroup.findFirstOrThrow({ where: { tournamentId } });
      await bracket.createFixture(user, tournamentId, {
        groupId: group.id, round: 'league_r9', fixtureNumber: 99,
        homeRegistrationId: registrationIds[0], awayRegistrationId: registrationIds[2],
      });

      await slots.assignSlot(user, slot1.id, null);

      expect((await groupTeams(tournamentId)).map((r) => r.registrationId).sort())
        .toEqual([registrationIds[0], registrationIds[2]].sort());
    });

    it('결선 단계 조의 자리는 조 편성을 만들지 않는다', async () => {
      const { tournamentId, registrationIds } = await seedBracketTournament(prisma, { label: 'gt-knockout', format: 'knockout', teamCount: 2 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: false });
      await slots.assignSlot(user, (await slotAt(tournamentId, 1)).id, registrationIds[0]);
      expect(await groupTeams(tournamentId)).toEqual([]);
    });
  });
```

- [ ] **Step 2: 실행 — 실패 확인**

Run(통합): `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --runInBand --testEnvironment "<rootDir>/test/helpers/isolated-integration-environment.cjs" --testMatch "<rootDir>/test/tournaments/tournament-slots.integration-spec.ts" -t "조 편성"`
Expected: FAIL — 비우기·교체 케이스가 이전 팀의 편성이 남아 단언이 깨진다. "자리 3개를 채우면 3행"(편성 생성은 PR-1a 경로로 이미 됨)과 "다른 경기에 남아 있으면 유지"·"결선 단계 조" 케이스는 이미 통과한다 — 해제를 아직 안 하니 유지 대조군이 통과하는 것은 당연하고, 해제를 넣은 뒤에도 계속 통과해야 의미가 있는 회귀 방향 단언이다.

- [ ] **Step 3: 해제 함수 추가** — `tournament-bracket-tx.ts` 끝에 (`Tx`·`V1ActiveAdmin`·`writeAdminActionLog`·`recalculateStandingsInTx` 는 이 파일에 이미 있다)

```ts
/**
 * 자리 교체·비우기로 조에서 빠진 팀의 편성을 정리한다. 후보가 그 조의 비삭제·비취소 경기 어디에도 없을 때만
 * 지우고(수동으로 만든 다른 경기가 있으면 유지), 순위 행이 있던 조는 같은 트랜잭션에서 순위를 다시 계산한다.
 * 모든 자리 변경이 끝난 뒤 한 번 부른다 — 맞바꾸기처럼 같은 조 안에서 팀이 옮겨 다니는 경우 중간 상태로 지우지 않게.
 */
export async function releaseUnusedGroupTeamsInTx(
  tx: Tx,
  admin: V1ActiveAdmin,
  tournamentId: string,
  groupId: string,
  registrationIds: readonly string[],
): Promise<void> {
  let recalculate = false;
  for (const registrationId of new Set(registrationIds)) {
    const stillPlaying = await tx.v1TournamentMatchDetails.count({
      where: {
        groupId,
        OR: [{ homeRegistrationId: registrationId }, { awayRegistrationId: registrationId }],
        teamMatch: { deletedAt: null, status: { not: 'cancelled' } },
      },
    });
    if (stillPlaying > 0) continue;
    const groupTeam = await tx.v1TournamentGroupTeam.findFirst({ where: { groupId, registrationId, isBye: false }, select: { id: true } });
    if (groupTeam === null) continue;
    const hadStandings = (await tx.v1TournamentStanding.count({ where: { groupId } })) > 0;
    await tx.v1TournamentGroupTeam.delete({ where: { id: groupTeam.id } });
    await tx.v1TournamentStanding.deleteMany({ where: { groupId, registrationId } });
    await writeAdminActionLog(tx, admin, {
      action: 'tournament.bracket.group_team.remove',
      targetType: 'tournament_group_team',
      targetId: groupTeam.id,
      beforeJson: { groupId, registrationId },
      afterJson: { auto: 'slot', standingsRecalculated: hadStandings },
    });
    if (hadStandings) recalculate = true;
  }
  if (recalculate) {
    const recalculated = await recalculateStandingsInTx(tx, tournamentId);
    await writeAdminActionLog(tx, admin, {
      action: 'tournament.bracket.standings.recalculate_auto',
      targetType: 'tournament',
      targetId: tournamentId,
      afterJson: { trigger: 'slot_group_team_release', groupId, ...recalculated.audit },
    });
  }
}
```

- [ ] **Step 4: 코어에 끼우기** — `tournament-slot.service.ts`

1. import: `import { assignTournamentFixtureSideInTx, releaseUnusedGroupTeamsInTx } from '../tournament-bracket-tx';` (Task 7 에서 넣은 같은 모듈 import 줄을 확장한다).
2. 타입과 모음 함수를 `SlotMutationContext` 아래에 둔다:

```ts
export type GroupTeamRelease = { groupId: string; registrationId: string };

/** 후보를 조별로 모아 조마다 한 번씩 해제한다 — 모든 자리 변경이 끝난 뒤에만 부른다. */
async function releaseGroupTeams(tx: Tx, ctx: SlotMutationContext, tournamentId: string, releases: readonly GroupTeamRelease[]): Promise<void> {
  const byGroup = new Map<string, string[]>();
  for (const { groupId, registrationId } of releases) byGroup.set(groupId, [...(byGroup.get(groupId) ?? []), registrationId]);
  for (const [groupId, registrationIds] of byGroup) {
    await releaseUnusedGroupTeamsInTx(tx, ctx.admin, tournamentId, groupId, registrationIds);
  }
}
```
3. `assignSlotCore` 시그니처에 끝 인자 `releases: GroupTeamRelease[]` 를 추가하고, `for (const fixture of fixtures) {` 루프의 사이드 배정 `for` 앞에 넣는다(편성 **생성**은 사이드 배정이 이미 한다 — 여기서는 빠지는 팀만 모은다):

```ts
    if (fixture.groupPhase === 'group' && fixture.groupId !== null && slot.registrationId !== null) {
      releases.push({ groupId: fixture.groupId, registrationId: slot.registrationId });
    }
```
4. `assignSlotInTx` 본문을 바꾼다:

```ts
  const releases: GroupTeamRelease[] = [];
  const { tournamentId, fixtureIds } = await assignSlotCore(tx, ctx, slotId, registrationId, releases);
  await releaseGroupTeams(tx, ctx, tournamentId, releases);
  return fixtureIds;
```

- [ ] **Step 5: 실행 — 통과 확인**

Run(통합): `TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --runInBand --testEnvironment "<rootDir>/test/helpers/isolated-integration-environment.cjs" --testMatch "<rootDir>/test/tournaments/tournament-slots.integration-spec.ts`"
Expected: PASS (Task 7·8 의 9건 + 이 Task 5건).

- [ ] **Step 6: 커밋**

```bash
git commit -m "feat(bracket): 조별 자리의 이전 팀 편성 해제" -- apps/v1_api/src/tournaments/tournament-bracket-tx.ts apps/v1_api/src/tournaments/slots/tournament-slot.service.ts apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts
git show --stat HEAD
```

---

### Task 10: BYE 자리 ↔ `ByeSlot`/`GroupTeam(isBye)` 전환

12강 그룹의 BYE 자리에 팀을 넣으면 `V1TournamentByeSlot` 이 `GroupTeam(isBye=true)` 로 바뀌고(기존 `createBye` 의미: 같은 id·`createdAt` 승계), 비우면 원복한다. 8강 홈 사이드는 Task 7 의 fan-out 이 이미 채운다.

**Files:**
- Create: `apps/v1_api/src/tournaments/slots/bye-slot-sync.ts`
- Modify: `apps/v1_api/src/tournaments/slots/tournament-slot.service.ts` — 코어에서 호출
- Test: `apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts`

**Interfaces:**
- Consumes: `ROUND12_BYE_SORT_ORDERS` (Task 2)
- Produces: `syncByeSlotInTx(tx, slot: { groupId: string | null; position: number }, registrationId: string | null): Promise<void>`

- [ ] **Step 1: 실패하는 통합 테스트 추가** — 최상위 `describe` 안에 붙인다.

```ts
  describe('BYE 자리 (12강)', () => {
    async function ko12(label: string, teamCount = 3) {
      const seeded = await seedBracketTournament(prisma, { label, format: 'knockout', teamCount });
      await templates.apply(user, seeded.tournamentId, { kind: 'knockout', size: 12, thirdPlace: false });
      return seeded;
    }
    const byeRows = async (tournamentId: string) => ({
      empty: (await prisma.v1TournamentByeSlot.findMany({ where: { group: { tournamentId } }, orderBy: { sortOrder: 'asc' } })).map((b) => b.sortOrder),
      team: (await prisma.v1TournamentGroupTeam.findMany({ where: { group: { tournamentId }, isBye: true }, orderBy: { sortOrder: 'asc' } }))
        .map((g) => [g.registrationId, g.sortOrder]),
    });

    it('BYE 자리 1 에 팀을 넣으면 ByeSlot(0) 이 GroupTeam(isBye) 로 바뀌고 8강 1번 홈에 팀이 들어간다, 비우면 원복', async () => {
      const { tournamentId, registrationIds, teamIds } = await ko12('bye-sync');
      const bye1 = await slotAt(tournamentId, 1, 'BYE');
      const before = await prisma.v1TournamentByeSlot.findFirstOrThrow({ where: { group: { tournamentId }, sortOrder: 0 } });

      await slots.assignSlot(user, bye1.id, registrationIds[0]);

      expect(await byeRows(tournamentId)).toEqual({ empty: [3, 4, 7], team: [[registrationIds[0], 0]] });
      const promoted = await prisma.v1TournamentGroupTeam.findFirstOrThrow({ where: { group: { tournamentId }, isBye: true } });
      expect(promoted.id).toBe(before.id); // createBye 와 같이 id 를 승계한다
      const [quarter1] = await fixturesUsing(bye1.id);
      expect(quarter1.hostTeamId).toBe(teamIds[0]);
      expect(quarter1.approvedApplicantTeamId).toBeNull(); // 어웨이는 12강 승자 연결이 채운다

      await slots.assignSlot(user, bye1.id, null);

      expect(await byeRows(tournamentId)).toEqual({ empty: [0, 3, 4, 7], team: [] });
      expect((await fixturesUsing(bye1.id))[0].hostTeamId).toBeNull();
    });

    it('BYE 자리 팀 교체(A→B)는 GroupTeam 의 등록만 바꾼다', async () => {
      const { tournamentId, registrationIds } = await ko12('bye-replace');
      const bye2 = await slotAt(tournamentId, 2, 'BYE');
      await slots.assignSlot(user, bye2.id, registrationIds[0]);
      await slots.assignSlot(user, bye2.id, registrationIds[1]);
      expect(await byeRows(tournamentId)).toEqual({ empty: [0, 4, 7], team: [[registrationIds[1], 3]] });
    });

    it('ENTRY 와 BYE 에 같은 팀을 동시에 넣을 수 없다 (양방향)', async () => {
      const { tournamentId, registrationIds } = await ko12('bye-exclusive');
      const entry = await slotAt(tournamentId, 1, 'ENTRY');
      const bye = await slotAt(tournamentId, 1, 'BYE');
      await slots.assignSlot(user, entry.id, registrationIds[0]);
      await expect(slots.assignSlot(user, bye.id, registrationIds[0])).rejects.toMatchObject({ response: { code: 'SLOT_TEAM_ALREADY_PLACED' } });
      await slots.assignSlot(user, bye.id, registrationIds[1]);
      await expect(slots.assignSlot(user, (await slotAt(tournamentId, 2, 'ENTRY')).id, registrationIds[1]))
        .rejects.toMatchObject({ response: { code: 'SLOT_TEAM_ALREADY_PLACED' } });
    });
  });
```

- [ ] **Step 2: 실행 — 실패 확인**

Run(통합): `… tournament-slots.integration-spec.ts -t "BYE 자리"`
Expected: FAIL — 첫 두 케이스는 `ByeSlot` 이 그대로(`empty: [0,3,4,7]`)라 단언이 깨진다. 세 번째(교차 배제)는 Task 7 로 이미 통과할 수 있다.

- [ ] **Step 3: 구현** — `apps/v1_api/src/tournaments/slots/bye-slot-sync.ts`

```ts
import { UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ROUND12_BYE_SORT_ORDERS } from '../templates/bracket-template-plan';

/**
 * 12강 그룹의 BYE 자리 ↔ 부전승 저장 형태. 팀이 없으면 `V1TournamentByeSlot`(빈 자리), 팀이 정해지면
 * `V1TournamentGroupTeam(isBye=true)` — `TournamentBracketService.createBye` 와 같은 의미이고, 승계하는 행은
 * 같은 id·createdAt 을 쓴다. 공개 그래프는 GroupTeam(isBye) 가 8강 칸에 배정돼 있을 때 부전승 연결선을 그린다.
 */
export async function syncByeSlotInTx(
  tx: Prisma.TransactionClient,
  slot: { groupId: string | null; position: number },
  registrationId: string | null,
): Promise<void> {
  const sortOrder = ROUND12_BYE_SORT_ORDERS[slot.position - 1];
  if (slot.groupId === null || sortOrder === undefined) {
    throw new UnprocessableEntityException({ code: 'SLOT_BYE_POSITION_INVALID', message: '부전승 자리의 위치가 올바르지 않아요.' });
  }
  const groupId = slot.groupId;
  const team = await tx.v1TournamentGroupTeam.findFirst({ where: { groupId, isBye: true, sortOrder } });
  const empty = await tx.v1TournamentByeSlot.findUnique({ where: { groupId_sortOrder: { groupId, sortOrder } } });

  if (registrationId !== null) {
    if (team !== null) {
      await tx.v1TournamentGroupTeam.update({ where: { id: team.id }, data: { registrationId } });
    } else {
      await tx.v1TournamentGroupTeam.create({
        data: { ...(empty ? { id: empty.id, createdAt: empty.createdAt } : {}), groupId, registrationId, isBye: true, sortOrder },
      });
      if (empty !== null) await tx.v1TournamentByeSlot.delete({ where: { id: empty.id } });
    }
    return;
  }
  if (team !== null) {
    await tx.v1TournamentByeSlot.create({ data: { id: team.id, groupId, sortOrder, createdAt: team.createdAt } });
    await tx.v1TournamentGroupTeam.delete({ where: { id: team.id } });
    await tx.v1TournamentStanding.deleteMany({ where: { groupId, registrationId: team.registrationId } });
  } else if (empty === null) {
    await tx.v1TournamentByeSlot.create({ data: { groupId, sortOrder } });
  }
}
```

`tournament-slot.service.ts` 코어에서 슬롯 `update` 직후(사이드 반영 루프 앞)에:

```ts
  if (slot.kind === 'BYE') await syncByeSlotInTx(tx, slot, registrationId);
```
import: `import { syncByeSlotInTx } from './bye-slot-sync';`

- [ ] **Step 4: 실행 — 통과 확인**

Run(통합): `TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --runInBand --testEnvironment "<rootDir>/test/helpers/isolated-integration-environment.cjs" --testMatch "<rootDir>/test/tournaments/tournament-slots.integration-spec.ts`"
Expected: PASS (앞 Task 포함 전부).

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_api/src/tournaments/slots/bye-slot-sync.ts
git commit -m "feat(bracket): 12강 BYE 자리와 부전승 저장 형태 전환" -- apps/v1_api/src/tournaments/slots/bye-slot-sync.ts apps/v1_api/src/tournaments/slots/tournament-slot.service.ts apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts
git show --stat HEAD
```

---

### Task 11: 배치 변경(비우기 먼저) · 무작위 채우기 `POST admin/tournaments/:id/slots/random-fill`

여러 자리를 한 번에 바꾸는 배치(맞바꾸기·무작위 채우기, PR-4 의 순위대로 채우기)는 **바뀔 자리를 먼저 모두 비운 뒤** 새 값을 넣는다 — 안 그러면 A↔B 맞바꾸기가 `SLOT_TEAM_ALREADY_PLACED`/유일 제약에 걸린다. 이전 팀 해제는 마지막에 한 번만 판정해 같은 조 안 이동에서 편성이 지워졌다 다시 생기지 않게 한다.

**Files:**
- Create: `apps/v1_api/src/tournaments/slots/random-assignment.ts`
- Test: `apps/v1_api/src/tournaments/slots/random-assignment.spec.ts`
- Modify: `apps/v1_api/src/tournaments/slots/tournament-slot.service.ts` — `assignSlotsBatchInTx`, `TournamentSlotService.randomFill`
- Modify: `apps/v1_api/src/tournaments/slots/tournament-slot.controller.ts`, `tournament-slot.controller.spec.ts`
- Test: `apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts`

**Interfaces:**
- Produces:
  - `pickRandomAssignments(emptySlotIds: readonly string[], registrationIds: readonly string[], randomInt: (maxExclusive: number) => number): Array<{ slotId: string; registrationId: string }>` — 개수 = `min(자리, 팀)`, 중복 없음.
  - `type SlotChange = { slotId: string; registrationId: string | null }`, `assignSlotsBatchInTx(tx, ctx, changes: readonly SlotChange[]): Promise<string[]>` — 영향 경기 id 합집합(정렬).
  - `TournamentSlotService.randomFill(user, competitionId): Promise<{ assignments: Array<{ slotId: string; registrationId: string }> }>`

- [ ] **Step 1: 순수 함수 테스트 작성** — `apps/v1_api/src/tournaments/slots/random-assignment.spec.ts`

```ts
import { pickRandomAssignments } from './random-assignment';

// 결정적 난수 — 상위 비트를 써서 LCG 하위 비트의 짧은 주기를 피한다.
function seeded(seed: number) {
  let state = seed;
  return (maxExclusive: number) => {
    state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff; // 32비트 정수 곱 — 부동소수점으로 곱하면 하위 비트가 깨진다
    return Math.floor((state / 0x80000000) * maxExclusive);
  };
}

describe('pickRandomAssignments', () => {
  const slots = ['s1', 's2', 's3', 's4'];

  it('자리가 팀보다 많으면 팀 수만큼만, 중복 없이 채운다', () => {
    const picks = pickRandomAssignments(slots, ['r1', 'r2'], seeded(1));
    expect(picks).toHaveLength(2);
    expect(new Set(picks.map((p) => p.slotId)).size).toBe(2);
    expect(new Set(picks.map((p) => p.registrationId))).toEqual(new Set(['r1', 'r2']));
    for (const pick of picks) expect(slots).toContain(pick.slotId);
  });

  it('팀이 자리보다 많으면 자리 수만큼만 채운다', () => {
    const picks = pickRandomAssignments(slots, ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'], seeded(2));
    expect(picks).toHaveLength(4);
    expect(new Set(picks.map((p) => p.slotId))).toEqual(new Set(slots));
    expect(new Set(picks.map((p) => p.registrationId)).size).toBe(4);
  });

  it('입력이 비면 빈 결과다', () => {
    expect(pickRandomAssignments([], ['r1'], seeded(3))).toEqual([]);
    expect(pickRandomAssignments(slots, [], seeded(3))).toEqual([]);
  });

  it('섞는다 — 3자리 3팀 3000번에서 9개 (자리, 팀) 짝이 모두, 고르게 나온다', () => {
    const random = seeded(7);
    const counts = new Map<string, number>();
    for (let trial = 0; trial < 3000; trial += 1) {
      for (const { slotId, registrationId } of pickRandomAssignments(['a', 'b', 'c'], ['x', 'y', 'z'], random)) {
        counts.set(`${slotId}${registrationId}`, (counts.get(`${slotId}${registrationId}`) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(9); // 섞지 않으면 3짝에 그친다
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(3000 * 0.25);
      expect(count).toBeLessThan(3000 * 0.42);
    }
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots/random-assignment.spec.ts`
Expected: FAIL — `Cannot find module './random-assignment'`.

- [ ] **Step 3: 구현** — `apps/v1_api/src/tournaments/slots/random-assignment.ts`

```ts
function shuffle<T>(items: readonly T[], randomInt: (maxExclusive: number) => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1); // [0, index]
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

/** 빈 자리와 미배치 팀을 각각 섞어 앞에서부터 짝짓는다 — 남는 쪽은 비워 두거나 배치하지 않는다. 난수는 서버가 주입한다. */
export function pickRandomAssignments(
  emptySlotIds: readonly string[],
  registrationIds: readonly string[],
  randomInt: (maxExclusive: number) => number,
): Array<{ slotId: string; registrationId: string }> {
  const slots = shuffle(emptySlotIds, randomInt);
  const registrations = shuffle(registrationIds, randomInt);
  return slots
    .slice(0, registrations.length)
    .map((slotId, index) => ({ slotId, registrationId: registrations[index] }));
}
```

- [ ] **Step 4: 실행 — 통과 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots/random-assignment.spec.ts`
Expected: PASS (4건).

- [ ] **Step 5: 실패하는 통합·라우트 테스트 추가**

`tournament-slot.controller.spec.ts` 의 `describe` 안에 추가:

```ts
  it('POST admin/tournaments/:tournamentId/slots/random-fill', () => {
    const handler = TournamentSlotController.prototype.randomFill;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('admin/tournaments/:tournamentId/slots/random-fill');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
  });
```

`tournament-slots.integration-spec.ts` — 상단 import 에 `import type { Prisma } from '@prisma/client';`, `import { lockCompetitionForBracketMutationInTx } from '../../src/tournaments/slots/competition-bracket-lock';`, `import { assignSlotInTx, assignSlotsBatchInTx, type SlotMutationContext } from '../../src/tournaments/slots/tournament-slot.service';` 를 더하고, 최상위 `describe` 안에 붙인다.

```ts
  async function inLane<T>(tournamentId: string, run: (tx: Prisma.TransactionClient, ctx: SlotMutationContext) => Promise<T>) {
    const admin = await adminContext.getMutationAdmin(user.id);
    return prisma.$transaction(async (tx) => {
      await lockCompetitionForBracketMutationInTx(tx, { id: tournamentId, kind: 'regular_tournament' });
      return run(tx, { admin, adminContext, games });
    }, { timeout: 45_000 });
  }
  const placedBySlot = async (tournamentId: string) =>
    (await prisma.v1TournamentSlot.findMany({ where: { tournamentId, kind: { in: ['ENTRY', 'BYE'] } } }))
      .map((s) => s.registrationId).filter((r): r is string => r !== null);

  describe('배치 변경(batch)', () => {
    it('A↔B 맞바꾸기는 비우기 먼저라 충돌 없이 끝나고 편성은 그대로, 경기 사이드만 뒤집힌다', async () => {
      const { tournamentId, registrationIds, teamIds } = await leagueOf4('batch-swap');
      const [slot1, slot2] = [await slotAt(tournamentId, 1), await slotAt(tournamentId, 2)];
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      await slots.assignSlot(user, slot2.id, registrationIds[1]);
      const groupBefore = await prisma.v1TournamentGroupTeam.findMany({ where: { group: { tournamentId } }, orderBy: { sortOrder: 'asc' } });

      await inLane(tournamentId, (tx, ctx) => assignSlotsBatchInTx(tx, ctx, [
        { slotId: slot1.id, registrationId: registrationIds[1] },
        { slotId: slot2.id, registrationId: registrationIds[0] },
      ]));

      const fresh = await prisma.v1TournamentSlot.findMany({ where: { id: { in: [slot1.id, slot2.id] } } });
      expect(fresh.find((s) => s.id === slot1.id)!.registrationId).toBe(registrationIds[1]);
      expect(fresh.find((s) => s.id === slot2.id)!.registrationId).toBe(registrationIds[0]);
      const fixtures = await allFixtures(tournamentId);
      for (const fixture of fixtures.filter((f) => [f.homeSlotId, f.awaySlotId].includes(slot1.id))) {
        expect(sideTeam(fixture, slot1.id)).toBe(teamIds[1]);
      }
      const groupAfter = await prisma.v1TournamentGroupTeam.findMany({ where: { group: { tournamentId } }, orderBy: { sortOrder: 'asc' } });
      expect(groupAfter.map((g) => g.id)).toEqual(groupBefore.map((g) => g.id)); // 지웠다 다시 만들지 않는다
    });

    it('대조군 — 같은 맞바꾸기를 하나씩 순서대로 하면 SLOT_TEAM_ALREADY_PLACED 로 막힌다', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('batch-control');
      const [slot1, slot2] = [await slotAt(tournamentId, 1), await slotAt(tournamentId, 2)];
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      await slots.assignSlot(user, slot2.id, registrationIds[1]);
      await expect(inLane(tournamentId, (tx, ctx) => assignSlotInTx(tx, ctx, slot1.id, registrationIds[1])))
        .rejects.toMatchObject({ response: { code: 'SLOT_TEAM_ALREADY_PLACED' } });
    });

    it('같은 자리를 두 번 담으면 422 SLOT_CHANGE_DUPLICATED', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('batch-dup');
      const slot1 = await slotAt(tournamentId, 1);
      await expect(inLane(tournamentId, (tx, ctx) => assignSlotsBatchInTx(tx, ctx, [
        { slotId: slot1.id, registrationId: registrationIds[0] }, { slotId: slot1.id, registrationId: registrationIds[1] },
      ]))).rejects.toMatchObject({ response: { code: 'SLOT_CHANGE_DUPLICATED' } });
    });
  });

  describe('무작위 채우기', () => {
    it('팀이 자리보다 적으면 팀 수만큼만 중복 없이 채우고, 이미 배치된 팀은 그 자리에 남는다', async () => {
      const { tournamentId, registrationIds } = await seedBracketTournament(prisma, { label: 'rf-few', format: 'knockout', teamCount: 5 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: false });
      const slot3 = await slotAt(tournamentId, 3);
      await slots.assignSlot(user, slot3.id, registrationIds[0]);

      const { assignments } = await slots.randomFill(user, tournamentId);

      expect(assignments).toHaveLength(4); // 5팀 중 1팀은 이미 배치
      const placed = await placedBySlot(tournamentId);
      expect([...placed].sort()).toEqual([...registrationIds].sort()); // 5팀 모두, 한 번씩
      expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slot3.id } })).registrationId).toBe(registrationIds[0]);
      expect(await prisma.v1TournamentSlot.count({ where: { tournamentId, kind: 'ENTRY', registrationId: null } })).toBe(3);
    });

    it('팀이 자리보다 많으면 자리를 다 채우고 남는 팀은 배치하지 않는다', async () => {
      const { tournamentId, registrationIds } = await seedBracketTournament(prisma, { label: 'rf-many', format: 'knockout', teamCount: 6 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 4, thirdPlace: false });
      const { assignments } = await slots.randomFill(user, tournamentId);
      expect(assignments).toHaveLength(4);
      const placed = await placedBySlot(tournamentId);
      expect(new Set(placed).size).toBe(4);
      for (const id of placed) expect(registrationIds).toContain(id);
      expect((await slots.randomFill(user, tournamentId)).assignments).toEqual([]); // 빈 자리가 없다
    });

    it('확정이 아닌 등록은 뽑지 않는다', async () => {
      const { tournamentId, registrationIds } = await seedBracketTournament(prisma, { label: 'rf-unconfirmed', format: 'knockout', teamCount: 3 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: false });
      await prisma.v1TournamentRegistration.update({ where: { id: registrationIds[2] }, data: { status: 'cancelled' } });
      const { assignments } = await slots.randomFill(user, tournamentId);
      expect(assignments.map((a) => a.registrationId).sort()).toEqual([registrationIds[0], registrationIds[1]].sort());
    });

    it('정규 리그는 409 SLOT_LEAGUE_NOT_SUPPORTED_YET, 없는 대회는 404', async () => {
      const league = await prisma.v1Tournament.create({
        data: { sportId: ids.soccerSportId, title: 'rf-league', status: 'draft', kind: 'regular_league', competitionConfigVersionId: '11111111-1111-4111-8111-111111111111' },
      });
      await expect(slots.randomFill(user, league.id)).rejects.toMatchObject({ response: { code: 'SLOT_LEAGUE_NOT_SUPPORTED_YET' } });
      await expect(slots.randomFill(user, '00000000-0000-4000-8000-00000000dead')).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });
    });
  });
```

- [ ] **Step 6: 실행 — 실패 확인**

Run(통합): `… tournament-slots.integration-spec.ts -t "배치 변경|무작위"`
Expected: FAIL — `assignSlotsBatchInTx`·`randomFill` 가 export 되지 않아 TS 오류.

- [ ] **Step 7: 구현** — `tournament-slot.service.ts`

import 추가: `import { randomInt } from 'node:crypto';` · `import { pickRandomAssignments } from './random-assignment';` (`UnprocessableEntityException`·`GroupTeamRelease`·`lockGameRows`·`loadSlotUsingFixtures` 는 앞 Task 에서 이미 import 됨).

`assignSlotInTx` 아래에:

```ts
export type SlotChange = { slotId: string; registrationId: string | null };

/**
 * 여러 자리를 한 번에 바꾼다(맞바꾸기·무작위 채우기·순위대로 채우기). 바뀔 자리를 **먼저 모두 비운 뒤** 새 값을
 * 넣어 같은 팀이 두 자리에 겹치는 순간을 만들지 않고, 이전 팀의 조 편성 해제는 마지막에 한 번만 판정한다.
 * `assignSlotInTx` 와 같이 호출자가 레인 잠금을 이미 잡은 트랜잭션에서 부른다.
 */
export async function assignSlotsBatchInTx(
  tx: Tx,
  ctx: SlotMutationContext,
  changes: readonly SlotChange[],
): Promise<string[]> {
  if (changes.length === 0) return [];
  const slotIds = changes.map((change) => change.slotId);
  if (new Set(slotIds).size !== slotIds.length) {
    throw new UnprocessableEntityException({ code: 'SLOT_CHANGE_DUPLICATED', message: '같은 자리를 한 번에 두 번 바꿀 수 없어요.' });
  }
  const rows = await tx.v1TournamentSlot.findMany({
    where: { id: { in: slotIds } },
    select: { id: true, tournamentId: true, registrationId: true },
  });
  if (rows.length !== slotIds.length) throw slotNotFound();
  const tournamentIds = new Set(rows.map((row) => row.tournamentId));
  if (tournamentIds.size > 1) {
    throw new UnprocessableEntityException({ code: 'SLOT_CHANGE_CROSS_TOURNAMENT', message: '한 번에 한 대회의 자리만 바꿀 수 있어요.' });
  }
  const tournamentId = rows[0].tournamentId;
  const current = new Map(rows.map((row) => [row.id, row.registrationId]));
  const ordered = [...changes].sort((a, b) => (a.slotId < b.slotId ? -1 : a.slotId > b.slotId ? 1 : 0));

  // 게임 행을 한꺼번에 id 순으로 잡아 자리마다 따로 잡을 때 생기는 순서 뒤섞임을 없앤다.
  const fixtures = await loadSlotUsingFixtures(tx, slotIds);
  await lockGameRows(tx, fixtures.flatMap((fixture) => (fixture.game === null ? [] : [fixture.game.id])));

  const releases: GroupTeamRelease[] = [];
  const affected = new Set<string>();
  for (const change of ordered) {
    const before = current.get(change.slotId) ?? null;
    if (before !== null && before !== change.registrationId) {
      (await assignSlotCore(tx, ctx, change.slotId, null, releases)).fixtureIds.forEach((id) => affected.add(id));
    }
  }
  for (const change of ordered) {
    if (change.registrationId === null) continue;
    (await assignSlotCore(tx, ctx, change.slotId, change.registrationId, releases)).fixtureIds.forEach((id) => affected.add(id));
  }
  await releaseGroupTeams(tx, ctx, tournamentId, releases);
  return [...affected].sort();
}
```

`TournamentSlotService` 에 메서드:

```ts
  async randomFill(user: V1AuthUser, competitionId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const competition = await this.loadCompetition(this.prisma, competitionId);
    assertTournamentLane(competition.kind);
    return this.prisma.$transaction(async (tx) => {
      await lockCompetitionForBracketMutationInTx(tx, competition);
      // 잠금 안에서 다시 읽는다 — 화면이 본 빈 자리가 아니라 지금의 빈 자리·미배치 팀이 기준이다.
      const slotRows = await tx.v1TournamentSlot.findMany({
        where: { tournamentId: competition.id, kind: { in: ['ENTRY', 'BYE'] } },
        select: { id: true, registrationId: true },
        orderBy: { id: 'asc' },
      });
      const placed = slotRows.flatMap((row) => (row.registrationId === null ? [] : [row.registrationId]));
      const candidates = await tx.v1TournamentRegistration.findMany({
        where: { tournamentId: competition.id, status: 'confirmed', id: { notIn: placed } },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      const assignments = pickRandomAssignments(
        slotRows.filter((row) => row.registrationId === null).map((row) => row.id),
        candidates.map((candidate) => candidate.id),
        randomInt,
      );
      await assignSlotsBatchInTx(tx, this.context(admin), assignments);
      await this.adminContext.logAdminAction(
        admin,
        { action: 'tournament.slot.random_fill', targetType: 'tournament', targetId: competition.id, afterJson: { assignments } },
        tx,
      );
      return { assignments };
    }, SLOT_TRANSACTION_OPTIONS);
  }
```

`tournament-slot.controller.ts` 에 라우트 추가(`Post` import 추가):

```ts
  @Post('admin/tournaments/:tournamentId/slots/random-fill')
  randomFill(@CurrentUser() user: V1AuthUser, @Param('tournamentId') tournamentId: string) {
    return this.slots.randomFill(user, tournamentId);
  }
```

- [ ] **Step 8: 실행 — 통과 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots` → PASS.
통합: `… tournament-slots.integration-spec.ts` → PASS (앞 Task 포함 전부).

- [ ] **Step 9: 커밋**

```bash
git add apps/v1_api/src/tournaments/slots/random-assignment.ts apps/v1_api/src/tournaments/slots/random-assignment.spec.ts
git commit -m "feat(bracket): 자리 배치 변경(비우기 먼저)과 무작위 채우기" -- apps/v1_api/src/tournaments/slots/random-assignment.ts apps/v1_api/src/tournaments/slots/random-assignment.spec.ts apps/v1_api/src/tournaments/slots/tournament-slot.service.ts apps/v1_api/src/tournaments/slots/tournament-slot.controller.ts apps/v1_api/src/tournaments/slots/tournament-slot.controller.spec.ts apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts
git show --stat HEAD
```

---

### Task 12: 등록이 확정을 벗어나면 자리를 비운다 — `releaseSlotsForRegistrationInTx`

**전이 지점 전수 확인 결과** (`grep -rn "v1TournamentRegistration\.\(update\|updateMany\)" apps/v1_api/src`):

| 전이 | 위치 | 이 PR 의 처리 |
|---|---|---|
| 어드민 취소: `confirmed`/`cancel_requested` → `cancelled` (참가 취소 요청 승인 포함) | `admin-registrations.service.ts` `cancel` (`:320-376`) | **해제 호출을 건다 (이 Task)** |
| 리그 참가팀 제외: `confirmed` → `cancelled` | `league-match-admin.service.ts:850` | PR-5a (리그 레인) |
| 팀의 취소 요청: `confirmed` → `cancel_requested` | `tournament-registrations.service.ts:553` | **해제하지 않는다.** 요청은 철회(`withdrawCancelRequest`)로 `confirmed` 로 돌아올 수 있고, 운영자가 승인(위 `cancel`)할 때 해제된다. 요청 중인 팀은 아직 대진 참가 팀이다. |
| 운영자 잔류 처리·철회로 복귀 | `rejectCancelRequest`·`withdrawCancelRequest` | 해당 없음(`confirmed` 로 돌아옴) |
| 확정 → 대기 | 불가 — `ADMIN_CONFIRMABLE_STATUSES` 에 `confirmed` 없음 | 해당 없음 |
| 로스터 잠금 해제 | `tournament-players.service.ts:1249` | 해당 없음(상태 불변) |

시작된 경기가 있으면 자리를 **그대로 둔다**(기록 보존). 자리 없는 기존 경기의 취소 동작은 바뀌지 않는다.

**Files:**
- Modify: `apps/v1_api/src/tournaments/slots/tournament-slot.service.ts` — `releaseSlotsForRegistrationInTx`, `TournamentSlotService.releaseForRegistrationInTx`
- Modify: `apps/v1_api/src/tournaments/admin-registrations.service.ts` — 생성자 주입, `cancel` 트랜잭션 맨 앞
- Modify: `apps/v1_api/src/tournaments/admin-registrations.service.spec.ts` — 주입 대체 + 호출 순서
- Modify: `apps/v1_api/scripts/tournament-league-allowed-baseline.json` — 서비스 파일 `allowed` 2 → 3
- Test: `apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts`

**Interfaces:**
- Produces: `releaseSlotsForRegistrationInTx(tx, ctx: SlotMutationContext, registrationId: string): Promise<void>` · `TournamentSlotService.releaseForRegistrationInTx(tx, admin: V1ActiveAdmin, registrationId: string): Promise<void>`
- 해제는 **트랜잭션 맨 앞**에서 한다 — 잠금 순서를 대회 잠금 → 등록 행(자리 배정과 같은 순서)으로 맞춰, 등록 행을 먼저 쥔 채 대회 잠금을 기다리다 교착하지 않게 한다.

- [ ] **Step 1: 실패하는 단위 테스트 추가** — `admin-registrations.service.spec.ts`

1. import: `import { TournamentSlotService } from './slots/tournament-slot.service';`
2. `let notifications` 아래에 `let slots: { releaseForRegistrationInTx: jest.Mock };`, `beforeEach` 의 `notifications = …` 다음 줄에 `slots = { releaseForRegistrationInTx: jest.fn().mockResolvedValue(undefined) };`, providers 배열에 `{ provide: TournamentSlotService, useValue: slots },` 추가.
3. 기존 `cancel:` 케이스들 근처에 추가:

```ts
  it('cancel: 확정이었던 팀(confirmed·취소 요청 전 confirmed)은 등록을 바꾸기 전에 자리를 비운다', async () => {
    for (const row of [
      registrationRow({ status: 'confirmed' }),
      registrationRow({ status: 'cancel_requested', cancelPreviousStatus: 'confirmed' }),
    ]) {
      slots.releaseForRegistrationInTx.mockClear();
      prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
      prisma.v1TournamentRegistration.findUnique.mockResolvedValue(row);
      prisma.v1TournamentRegistration.update.mockClear();
      prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'cancelled' }));
      prisma.v1TournamentPayment.findUnique.mockResolvedValue(null);

      await service.cancel(opsAuth, 'reg-1', {});

      expect(slots.releaseForRegistrationInTx).toHaveBeenCalledTimes(1);
      expect(slots.releaseForRegistrationInTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'ops-admin-id' }), 'reg-1');
      expect(slots.releaseForRegistrationInTx.mock.invocationCallOrder[0])
        .toBeLessThan(prisma.v1TournamentRegistration.update.mock.invocationCallOrder[0]);
    }
  });

  it('cancel: 확정된 적 없는 신청(대조군)은 자리 해제를 부르지 않는다', async () => {
    for (const row of [
      registrationRow({ status: 'awaiting_payment' }),
      registrationRow({ status: 'cancel_requested', cancelPreviousStatus: 'paid' }),
    ]) {
      slots.releaseForRegistrationInTx.mockClear();
      prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
      prisma.v1TournamentRegistration.findUnique.mockResolvedValue(row);
      prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'cancelled' }));
      prisma.v1TournamentPayment.findUnique.mockResolvedValue(null);
      await service.cancel(opsAuth, 'reg-1', {});
      expect(slots.releaseForRegistrationInTx).not.toHaveBeenCalled();
    }
  });
```

- [ ] **Step 2: 실패하는 통합 테스트 추가** — `tournament-slots.integration-spec.ts` 상단 import 에 `import { AdminRegistrationsService } from '../../src/tournaments/admin-registrations.service';`, `import type { NotificationsService } from '../../src/notifications/notifications.service';` 추가, `import { TournamentRegistrationsService } from '../../src/tournaments/tournament-registrations.service';` 도 더하고, 모듈 상수 아래에:

```ts
// 팀이 보내는 취소 요청(`cancelRequest`)은 prisma 만 쓴다 — 알림·약관 의존성은 이 경로에서 불리지 않는다.
const registrations = new TournamentRegistrationsService(prisma, {} as never, {} as never);
const adminRegistrations = new AdminRegistrationsService(
  prisma, adminContext, { emitNotification: async () => undefined } as unknown as NotificationsService, slots,
);
```
최상위 `describe` 안에 붙인다.

```ts
  describe('등록이 확정을 벗어나면 자리가 비워진다', () => {
    it('어드민 취소 → 그 팀의 자리와 경기 사이드가 비워지고 다른 팀의 자리는 그대로(대조군)', async () => {
      const { tournamentId, registrationIds } = await seedBracketTournament(prisma, { label: 'rel-ko', format: 'knockout', teamCount: 2 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: false });
      const [slot1, slot2] = [await slotAt(tournamentId, 1), await slotAt(tournamentId, 2)];
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      await slots.assignSlot(user, slot2.id, registrationIds[1]);

      await adminRegistrations.cancel(user, registrationIds[0], {});

      expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slot1.id } })).registrationId).toBeNull();
      expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slot2.id } })).registrationId).toBe(registrationIds[1]);
      expect((await fixturesUsing(slot1.id))[0].hostTeamId).toBeNull();
      expect((await prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: registrationIds[0] } })).status).toBe('cancelled');
    });

    it('시작된 경기가 있으면 자리를 그대로 둔다 — 등록은 취소된다', async () => {
      const { tournamentId, registrationIds, teamIds } = await seedBracketTournament(prisma, { label: 'rel-started', format: 'knockout', teamCount: 1 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: false });
      const slot1 = await slotAt(tournamentId, 1);
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      const [fixture] = await fixturesUsing(slot1.id);
      await prisma.v1Game.update({ where: { teamMatchId: fixture.id }, data: { state: 'LIVE' } });

      await adminRegistrations.cancel(user, registrationIds[0], {});

      expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slot1.id } })).registrationId).toBe(registrationIds[0]);
      expect((await fixturesUsing(slot1.id))[0].hostTeamId).toBe(teamIds[0]);
      expect((await prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: registrationIds[0] } })).status).toBe('cancelled');
    });

    it('자리에 없던 팀의 취소는 아무 자리도 건드리지 않는다 (기존 동작)', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('rel-unplaced');
      await slots.assignSlot(user, (await slotAt(tournamentId, 1)).id, registrationIds[0]);
      await adminRegistrations.cancel(user, registrationIds[3], {});
      expect(await placedBySlot(tournamentId)).toEqual([registrationIds[0]]);
    });

    it('보류(on_hold) 리그의 참가 거부도 막히지 않는다 — 해제는 잠금만 잡는다', async () => {
      const league = await prisma.v1Tournament.create({
        data: { sportId: ids.soccerSportId, title: 'rel-hold', status: 'on_hold', kind: 'regular_league', competitionConfigVersionId: '11111111-1111-4111-8111-111111111111' },
      });
      const team = await prisma.v1Team.create({ data: { ownerUserId: ids.adminUserId, sportId: ids.soccerSportId, regionId: ids.regionId, name: 'rel-hold 팀' } });
      const registration = await prisma.v1TournamentRegistration.create({
        data: { tournamentId: league.id, teamId: team.id, appliedByUserId: ids.adminUserId, status: 'confirmed' },
      });
      await expect(adminRegistrations.cancel(user, registration.id, { reason: '운영 사유' })).resolves.toMatchObject({ status: 'cancelled' });
    });
  });
```

최상위 `describe` 안에 하나 더 붙인다 — 팀의 **취소 요청**과 운영자 **승인**을 실제 서비스 경로로 밟는다(스펙 Risks · Ambiguity Log: 요청 중인 팀은 아직 대진 참가 팀이고, 승인 때 비운다. 승인 시 자리를 쓰는 경기가 모두 시작 전이면 비우고, 하나라도 시작됐으면 유지한다).

```ts
  describe('팀의 취소 요청은 자리를 비우지 않고, 운영자 승인 때 판정한다', () => {
    const teamIdOf = async (registrationId: string) =>
      (await prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: registrationId }, select: { teamId: true } })).teamId;

    // 팀 매니저 권한(`assertTeamManager`)을 갖춘 뒤 실제 `cancelRequest` 를 부른다 — 상태를 prisma 로 직접 바꾸지 않는다.
    const teamRequestsCancel = async (tournamentId: string, registrationId: string) => {
      await prisma.v1TeamMembership.create({ data: { teamId: await teamIdOf(registrationId), userId: ids.adminUserId, role: 'owner', status: 'active' } });
      await registrations.cancelRequest(user, tournamentId, registrationId, {});
    };

    it('요청만으로는 자리와 경기 사이드가 그대로다 — 등록만 cancel_requested', async () => {
      const { tournamentId, registrationIds, teamIds } = await seedBracketTournament(prisma, { label: 'req-keep', format: 'knockout', teamCount: 1 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: false });
      const slot1 = await slotAt(tournamentId, 1);
      await slots.assignSlot(user, slot1.id, registrationIds[0]);

      await teamRequestsCancel(tournamentId, registrationIds[0]);

      expect((await prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: registrationIds[0] } })).status).toBe('cancel_requested');
      expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slot1.id } })).registrationId).toBe(registrationIds[0]);
      expect((await fixturesUsing(slot1.id))[0].hostTeamId).toBe(teamIds[0]);
    });

    it('승인 — 자리를 쓰는 경기가 모두 시작 전이면 자리·사이드·조 편성이 비워진다', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('req-approve');
      const slot1 = await slotAt(tournamentId, 1);
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      await teamRequestsCancel(tournamentId, registrationIds[0]);

      await adminRegistrations.cancel(user, registrationIds[0], {});

      const using = await fixturesUsing(slot1.id);
      expect(using.length).toBeGreaterThan(1); // 리그 자리는 여러 경기에 걸쳐 있다 — 하나만 검사하면 반쪽이다
      for (const fixture of using) expect(fixture.homeSlotId === slot1.id ? fixture.hostTeamId : fixture.approvedApplicantTeamId).toBeNull();
      expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slot1.id } })).registrationId).toBeNull();
      expect(await prisma.v1TournamentGroupTeam.count({ where: { group: { tournamentId } } })).toBe(0);
      expect((await prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: registrationIds[0] } })).status).toBe('cancelled');
    });

    it('승인 — 자리를 쓰는 경기 중 하나라도 이미 시작됐으면 자리·사이드·조 편성을 그대로 두고 등록만 취소된다', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('req-approve-started');
      const slot1 = await slotAt(tournamentId, 1);
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      const teamId = await teamIdOf(registrationIds[0]);
      const using = await fixturesUsing(slot1.id);
      expect(using.length).toBeGreaterThan(1);
      // 첫 경기가 아니라 마지막 경기를 시작시킨다 — "첫 경기만 본다"는 구현이 통과하지 못하게.
      await prisma.v1Game.update({ where: { teamMatchId: using[using.length - 1].id }, data: { state: 'LIVE' } });
      await teamRequestsCancel(tournamentId, registrationIds[0]);

      await adminRegistrations.cancel(user, registrationIds[0], {});

      expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slot1.id } })).registrationId).toBe(registrationIds[0]);
      for (const fixture of await fixturesUsing(slot1.id)) expect(fixture.homeSlotId === slot1.id ? fixture.hostTeamId : fixture.approvedApplicantTeamId).toBe(teamId);
      expect(await prisma.v1TournamentGroupTeam.count({ where: { group: { tournamentId }, registrationId: registrationIds[0] } })).toBe(1);
      expect((await prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: registrationIds[0] } })).status).toBe('cancelled');
    });
  });
```

- [ ] **Step 3: 실행 — 실패 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/admin-registrations.service.spec.ts -t "cancel: 확정이었던|cancel: 확정된 적 없는"`
Expected: FAIL — `releaseForRegistrationInTx` 가 한 번도 불리지 않는다.
통합: `… tournament-slots.integration-spec.ts -t "확정을 벗어나면|취소 요청은 자리를"` → FAIL (`AdminRegistrationsService` 생성자 인자 개수·자리가 안 비워짐). 취소 요청 describe 의 첫 케이스(요청만으로는 그대로)와 "하나라도 시작됐으면 유지" 케이스는 해제 구현이 없어도 통과하는 **음성 대조군**이다 — 구현 뒤에도 계속 통과해야 의미가 있다.

- [ ] **Step 4: 구현**

`tournament-slot.service.ts` — import 에 `import { lockCompetitionForBracketMutationInTx, lockCompetitionForSlotReleaseInTx } from './competition-bracket-lock';`(기존 import 확장), `import { assertSlotFixturesNotStarted, isSlotFixtureStarted, loadSlotUsingFixtures, sidesUsingSlot } from './slot-fixtures';`. `assignSlotsBatchInTx` 아래에:

```ts
/**
 * 등록이 `confirmed` 를 벗어나는 전이가 부른다. 그 팀이 들어간 자리를 비우되, 시작된 경기를 쓰는 자리는
 * 기록을 지키려고 그대로 둔다. 잠금은 보류 리그도 통과하는 해제용 변형이다.
 */
export async function releaseSlotsForRegistrationInTx(
  tx: Tx,
  ctx: SlotMutationContext,
  registrationId: string,
): Promise<void> {
  const registration = await tx.v1TournamentRegistration.findUnique({ where: { id: registrationId }, select: { tournamentId: true } });
  if (registration === null) return;
  const competition = await findTournamentOnSurface(tx, ALL_COMPETITION_KINDS, {
    where: { id: registration.tournamentId },
    select: { id: true, kind: true },
  });
  if (competition === null) return;
  // 자리가 있는지 먼저 보고 잠금을 건너뛰면 안 된다 — 동시에 자리를 넣는 트랜잭션이 아직 이 등록을 confirmed 로 읽을 수 있다.
  await lockCompetitionForSlotReleaseInTx(tx, competition);
  const held = await tx.v1TournamentSlot.findMany({
    where: { tournamentId: competition.id, registrationId },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (held.length === 0) return;
  const fixtures = await loadSlotUsingFixtures(tx, held.map((slot) => slot.id));
  const releases: GroupTeamRelease[] = [];
  for (const slot of held) {
    const using = fixtures.filter((fixture) => fixture.homeSlotId === slot.id || fixture.awaySlotId === slot.id);
    if (using.some(isSlotFixtureStarted)) continue;
    await assignSlotCore(tx, ctx, slot.id, null, releases);
  }
  await releaseGroupTeams(tx, ctx, competition.id, releases);
}
```
`TournamentSlotService` 에 래퍼:

```ts
  /** `GamesService` 를 따로 받지 않는 호출자(등록 서비스)를 위한 얇은 래퍼. */
  releaseForRegistrationInTx(tx: Tx, admin: V1ActiveAdmin, registrationId: string): Promise<void> {
    return releaseSlotsForRegistrationInTx(tx, this.context(admin), registrationId);
  }
```

`admin-registrations.service.ts`:
1. import: `import { TournamentSlotService } from './slots/tournament-slot.service';`
2. 생성자(`:63-67`)에 `private readonly slots: TournamentSlotService,` 추가.
3. 파일 상단 상수 영역(`ADMIN_CONFIRMABLE_STATUSES` 아래)에 추가하지 말고 `cancel` 안에서 계산한다. `cancel` 의 `this.prisma.$transaction(async (tx) => {` 첫 줄(`const updated = …` 앞)에:

```ts
      // 확정이었던 팀(취소 요청 중이던 확정 팀 포함)은 대진 자리에서 먼저 뺀다. 잠금 순서(대회 → 등록 행)를 자리 배정과 맞추려고 등록을 바꾸기 전에 한다.
      const wasConfirmed = registration.status === 'confirmed'
        || (registration.status === 'cancel_requested' && registration.cancelPreviousStatus === 'confirmed');
      if (wasConfirmed) await this.slots.releaseForRegistrationInTx(tx, admin, registrationId);
```

`tournaments.module.ts` 는 `TournamentSlotService` 가 이미 providers 에 있어 추가 변경 없음.

- [ ] **Step 4b: 리그 허용 baseline 2 → 3** — `apps/v1_api/scripts/tournament-league-allowed-baseline.json`

`releaseSlotsForRegistrationInTx` 의 조회가 `ALL_COMPETITION_KINDS` 를 세 번째로 쓴다(등록 취소는 보류 리그에서도 자리를 비워야 하므로 종류를 가르지 않는다). Task 7 이 적은 `src/tournaments/slots/tournament-slot.service.ts` 의 `allowed` 를 3 으로 올리고 why 끝에 ` 등록 이탈 해제(releaseSlotsForRegistrationInTx)도 리그 등록을 받는다.` 를 덧붙인다. 실행: `cd apps/v1_api && node scripts/v1-surface-check.mjs` → 통과(`허용 3` 이 실측과 일치).

- [ ] **Step 5: 실행 — 통과 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/admin-registrations.service.spec.ts` → PASS (기존 + 신규 2).
통합: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --runInBand --testEnvironment "<rootDir>/test/helpers/isolated-integration-environment.cjs" --testMatch "<rootDir>/test/tournaments/tournament-slots.integration-spec.ts"` → PASS.
Run: `grep -rn "new AdminRegistrationsService(" apps/v1_api` → 생성자를 직접 부르는 다른 곳(스펙·시드)이 있으면 같은 4번째 인자를 넘기도록 고친다(기본 컴파일 오류로 드러난다).

- [ ] **Step 6: 커밋**

```bash
git commit -m "feat(bracket): 등록이 확정을 벗어나면 대진 자리를 비운다" -- apps/v1_api/src/tournaments/slots/tournament-slot.service.ts apps/v1_api/src/tournaments/admin-registrations.service.ts apps/v1_api/src/tournaments/admin-registrations.service.spec.ts apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts apps/v1_api/scripts/tournament-league-allowed-baseline.json
git show --stat HEAD
```

---

### Task 13: 자리 연결 사이드 직접 변경 차단 — 템플릿·자리 배정과 이어진 통합 시나리오로 고정 (409 `SLOT_LINKED`)

가드 자체(`assertSidesNotSlotLinked` 와 `updateFixture` 배선)는 **PR-1a Task 8 이 소유한다** — 이 PR 은 코드를 고치지 않는다(`tournament-bracket.service.ts` 는 Modify 목록에 없다). 이 Task 는 PR-1a 의 가드가 **이 PR 이 만드는 실제 자리**(템플릿 → 자리 배정으로 생긴 `homeSlotId`/`awaySlotId`)에서도 막는지를 통합 시나리오로 고정하는 회귀 방지 테스트만 더한다. 자리가 정본이므로 팀은 자리 배정으로만 바뀌고, 일정·장소·번호 수정은 그대로 허용되어야 한다.

**Files:**
- Test: `apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts`

- [ ] **Step 1: 통합 테스트 추가** — 최상위 `describe` 안에 붙인다(`bracket` 인스턴스는 Task 9 에서 추가됨).

```ts
  describe('SLOT_LINKED 가드', () => {
    it('자리에 연결된 사이드의 팀 변경(지정·null)은 409 이고 아무것도 바뀌지 않는다', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('linked');
      const slot1 = await slotAt(tournamentId, 1);
      const [fixture] = await fixturesUsing(slot1.id);
      const patch = fixture.homeSlotId === slot1.id ? 'homeRegistrationId' : 'awayRegistrationId';

      for (const value of [registrationIds[2], null]) {
        await expect(bracket.updateFixture(user, fixture.id, { [patch]: value }))
          .rejects.toMatchObject({ response: { code: 'SLOT_LINKED' } });
      }
      const after = await prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: fixture.id } });
      expect([after.homeRegistrationId, after.awayRegistrationId]).toEqual([null, null]);
    });

    it('대조군 — 같은 경기의 일정·장소 수정은 그대로 된다', async () => {
      const { tournamentId } = await leagueOf4('linked-schedule');
      const [fixture] = await fixturesUsing((await slotAt(tournamentId, 1)).id);
      await expect(bracket.updateFixture(user, fixture.id, { venue: '새 경기장', scheduledAt: '2026-11-02T10:00:00.000Z' }))
        .resolves.toMatchObject({ id: fixture.id, venue: '새 경기장' });
    });

    it('대조군 — 자리 없는 수동 경기의 팀 변경은 그대로 된다', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('linked-manual');
      const group = await prisma.v1TournamentGroup.findFirstOrThrow({ where: { tournamentId } });
      const manual = await bracket.createFixture(user, tournamentId, {
        groupId: group.id, round: 'league_r9', fixtureNumber: 99,
        homeRegistrationId: registrationIds[0], awayRegistrationId: registrationIds[1],
      });
      await expect(bracket.updateFixture(user, manual.id, { homeRegistrationId: registrationIds[2] }))
        .resolves.toMatchObject({ homeRegistrationId: registrationIds[2] });
    });
  });
```

- [ ] **Step 2: 실행 — 통과 확인 (가드는 PR-1a 에 이미 있다)**

Run(통합): `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --runInBand --testEnvironment "<rootDir>/test/helpers/isolated-integration-environment.cjs" --testMatch "<rootDir>/test/tournaments/tournament-slots.integration-spec.ts" -t "SLOT_LINKED"`
Expected: PASS 3건. 첫 케이스(`SLOT_LINKED` 409)가 FAIL 이면 이 PR 에서 가드를 새로 만들지 말고 **BLOCKED** — PR-1a Task 8 의 `updateFixture` 배선이 빠졌다는 뜻이므로 오케스트레이터에 보고해 PR-1a 로 돌려보낸다(`grep -n "assertSidesNotSlotLinked" apps/v1_api/src/tournaments/tournament-bracket.service.ts` 로 확인). 두 대조군(일정·장소 수정 / 자리 없는 수동 경기)이 FAIL 이면 가드가 과하게 넓은 것이다 — 마찬가지로 PR-1a 문제다.

- [ ] **Step 3: 커밋**

```bash
git commit -m "test(bracket): 자리 연결 사이드의 직접 팀 변경 차단을 템플릿·자리 배정과 이어 고정" -- apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts
git show --stat HEAD
```
Expected: 위 1개 파일만.

---

### Task 14: 자리로 만든 리그 방식 대회 조의 `replaceExisting` 일괄 재생성 차단

`LeagueFixtureGeneratorService.generate` 의 `replaceExisting` 는 기존 좌표를 보존한 채 `updateTournamentMatchInTx` 로 **조 편성 팀을 사이드에 덮어쓴다**(`:706-715`). 자리에 연결된 경기에 이 경로가 돌면 자리의 팀과 경기 사이드가 어긋난다. 스펙 S2 는 정규 리그에만 이 규칙(`LEAGUE_SLOT_FIXTURES_USE_TEMPLATE`)을 적었으나 리그 방식 대회도 같은 자리 모델이라 같은 코드로 막는다 — 템플릿 교체가 유일한 재생성 경로다. (스펙 보충 — 결정 근거는 "자리가 정본" 원칙.)

**Files:**
- Modify: `apps/v1_api/src/tournaments/league-fixture-generator.service.ts` — `generate` 트랜잭션 안, `currentFixtures` 조회(`:551-554`) 다음
- Test: `apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts`

- [ ] **Step 1: 실패하는 통합 테스트 추가** — 상단에 `import { LeagueFixtureGeneratorService } from '../../src/tournaments/league-fixture-generator.service';` 와 `const generator = new LeagueFixtureGeneratorService(prisma, adminContext, games);` 를 더하고 `describe` 안에 붙인다.

```ts
  describe('일괄 재생성과 자리의 충돌', () => {
    it('자리로 만든 조는 replaceExisting 재생성이 409 LEAGUE_SLOT_FIXTURES_USE_TEMPLATE 이고 경기는 그대로다', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('regen-slot');
      for (const [index, registrationId] of registrationIds.entries()) {
        await slots.assignSlot(user, (await slotAt(tournamentId, index + 1)).id, registrationId);
      }
      const group = await prisma.v1TournamentGroup.findFirstOrThrow({ where: { tournamentId } });
      const before = await allFixtures(tournamentId);

      await expect(generator.generate(user, tournamentId, { groupId: group.id, legs: 1, replaceExisting: true }))
        .rejects.toMatchObject({ response: { code: 'LEAGUE_SLOT_FIXTURES_USE_TEMPLATE' } });
      expect((await allFixtures(tournamentId)).map((f) => [f.id, f.hostTeamId, f.approvedApplicantTeamId]))
        .toEqual(before.map((f) => [f.id, f.hostTeamId, f.approvedApplicantTeamId]));
    });

    it('대조군 — 자리 없이 조 편성으로 만드는 기존 흐름은 replaceExisting 이어도 막히지 않는다', async () => {
      const { tournamentId, registrationIds } = await seedBracketTournament(prisma, { label: 'regen-plain', format: 'league', teamCount: 3 });
      const group = await bracket.createGroup(user, tournamentId, { name: 'A조', phase: 'group' });
      for (const registrationId of registrationIds) await bracket.createGroupTeam(user, tournamentId, { groupId: group.id, registrationId });
      await expect(generator.generate(user, tournamentId, { groupId: group.id, legs: 1, replaceExisting: true }))
        .resolves.toMatchObject({ created: 3 });
    });
  });
```

- [ ] **Step 2: 실행 — 실패 확인**

Run(통합): `… tournament-slots.integration-spec.ts -t "일괄 재생성"`
Expected: FAIL — 첫 케이스는 다른 코드(예: `LEAGUE_FIXTURES_NOT_DELETABLE`/`LEAGUE_FIXTURES_LIVE`)로 끝나거나 경기가 덮어써진다. 대조군은 통과.

- [ ] **Step 3: 구현** — `generate` 트랜잭션 안 `const currentFixtures = await tx.v1TournamentMatchDetails.findMany({…});` 바로 다음에

```ts
        if (dto.replaceExisting && currentFixtures.length > 0) {
          // 자리로 만든 대진은 팀을 자리가 정한다 — 조 편성 팀으로 덮어쓰는 재생성 대신 템플릿 교체를 쓰게 한다.
          const slotLinked = await tx.v1TeamMatch.count({
            where: {
              id: { in: currentFixtures.map((fixture) => fixture.teamMatchId) },
              OR: [{ homeSlotId: { not: null } }, { awaySlotId: { not: null } }],
            },
          });
          if (slotLinked > 0) {
            throw new ConflictException({
              code: 'LEAGUE_SLOT_FIXTURES_USE_TEMPLATE',
              message: '자리로 만든 대진은 다시 만들 수 없어요. 대진 템플릿으로 새로 시작해 주세요.',
            });
          }
        }
```

- [ ] **Step 4: 실행 — 통과 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/league-fixture-generator.service.spec.ts` → PASS(기존).
통합: `… tournament-slots.integration-spec.ts` → PASS.

- [ ] **Step 5: 커밋**

```bash
git commit -m "fix(bracket): 자리로 만든 조의 replaceExisting 일괄 재생성을 막는다" -- apps/v1_api/src/tournaments/league-fixture-generator.service.ts apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts
git show --stat HEAD
```

---

### Task 15: 동시성과 교체 통합 시나리오 (레이스·락 순서·팀이 들어간 대진 교체)

앞 Task 들의 락 설계(대회 advisory lock → 게임 행 id 순 → 등록 행)가 실제 PostgreSQL 에서 지켜지는지를 두 어드민이 겹치는 시나리오로 고정한다. 구현 변경은 없다 — 이 시나리오가 깨지면 앞 Task 의 락 순서가 틀린 것이다.

**Files:**
- Test: `apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts`

- [ ] **Step 1: 시나리오 추가** — 최상위 `describe` 안에 붙인다.

```ts
  describe('동시성', () => {
    it('같은 팀을 두 어드민이 서로 다른 자리에 동시에 넣으면 하나만 성공하고 경기 사이드가 일관된다', async () => {
      const { tournamentId, registrationIds, teamIds } = await leagueOf4('race-same-team');
      const [slotA, slotB] = [await slotAt(tournamentId, 1), await slotAt(tournamentId, 3)];

      const results = await Promise.allSettled([
        slots.assignSlot(user, slotA.id, registrationIds[0]),
        slots.assignSlot(user, slotB.id, registrationIds[0]),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason).toMatchObject({ response: { code: 'SLOT_TEAM_ALREADY_PLACED' } });
      expect(await placedBySlot(tournamentId)).toEqual([registrationIds[0]]);
      // 팀이 들어간 사이드는 승자 자리를 쓰는 경기 수(3)와 정확히 같다 — 진 쪽이 사이드를 남기지 않았다
      const sides = (await allFixtures(tournamentId)).flatMap((f) => [f.hostTeamId, f.approvedApplicantTeamId]);
      expect(sides.filter((team) => team === teamIds[0])).toHaveLength(3);
    });

    it('서로 다른 팀을 같은 자리에 동시에 넣어도 둘 다 끝나고 마지막 결과 하나로 일관된다 (자리·사이드·조 편성)', async () => {
      const { tournamentId, registrationIds, teamIds } = await leagueOf4('race-same-slot');
      const slot1 = await slotAt(tournamentId, 1);

      const results = await Promise.allSettled([
        slots.assignSlot(user, slot1.id, registrationIds[0]),
        slots.assignSlot(user, slot1.id, registrationIds[1]),
      ]);

      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
      const winner = (await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slot1.id } })).registrationId!;
      const winnerTeam = teamIds[registrationIds.indexOf(winner)];
      for (const fixture of await fixturesUsing(slot1.id)) expect(sideTeam(fixture, slot1.id)).toBe(winnerTeam);
      expect((await prisma.v1TournamentGroupTeam.findMany({ where: { group: { tournamentId } } })).map((g) => g.registrationId)).toEqual([winner]);
    });

    it('팀 취소와 자리 배정이 겹쳐도 교착 없이 끝나고 취소된 팀이 자리에 남지 않는다', async () => {
      const { tournamentId, registrationIds } = await seedBracketTournament(prisma, { label: 'race-cancel', format: 'knockout', teamCount: 1 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: false });
      const slot1 = await slotAt(tournamentId, 1);

      const results = await Promise.allSettled([
        adminRegistrations.cancel(user, registrationIds[0], {}),
        slots.assignSlot(user, slot1.id, registrationIds[0]),
      ]);

      const [cancelResult, assignResult] = results;
      expect(cancelResult.status).toBe('fulfilled');
      // 배정이 먼저면 성공하고 취소가 비운다, 취소가 먼저면 확정이 아니라서 422 — 어느 쪽이든 교착(40P01)은 없다
      if (assignResult.status === 'rejected') {
        expect(assignResult.reason).toMatchObject({ response: { code: 'SLOT_REGISTRATION_INVALID' } });
      }
      expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slot1.id } })).registrationId).toBeNull();
      expect((await fixturesUsing(slot1.id))[0].hostTeamId).toBeNull();
    });
  });

  describe('팀이 들어간 대진의 교체', () => {
    it('12강 대진에 팀·부전승이 들어가 있어도 교체되고, 자리·부전승·조 편성은 새 대진 기준으로 리셋된다', async () => {
      const { tournamentId, registrationIds } = await seedBracketTournament(prisma, { label: 'replace-placed', format: 'knockout', teamCount: 3 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 12, thirdPlace: true });
      await slots.assignSlot(user, (await slotAt(tournamentId, 1)).id, registrationIds[0]);
      await slots.assignSlot(user, (await slotAt(tournamentId, 2)).id, registrationIds[1]);
      await slots.assignSlot(user, (await slotAt(tournamentId, 1, 'BYE')).id, registrationIds[2]);

      await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 12, thirdPlace: true, replaceExisting: true }))
        .resolves.toEqual({ groups: 5, slots: 12, fixtures: 12, edges: 12 });

      expect(await placedBySlot(tournamentId)).toEqual([]);
      expect((await prisma.v1TournamentByeSlot.findMany({ where: { group: { tournamentId } }, orderBy: { sortOrder: 'asc' } })).map((b) => b.sortOrder)).toEqual([0, 3, 4, 7]);
      expect(await prisma.v1TournamentGroupTeam.count({ where: { group: { tournamentId } } })).toBe(0);
      for (const fixture of await prisma.v1TeamMatch.findMany({ where: { tournamentId, deletedAt: null } })) {
        expect([fixture.hostTeamId, fixture.approvedApplicantTeamId]).toEqual([null, null]);
      }
      // 같은 등록으로 새 대진에 다시 배치할 수 있다
      await expect(slots.assignSlot(user, (await slotAt(tournamentId, 1)).id, registrationIds[0])).resolves.toBeDefined();
    });
  });
```

- [ ] **Step 2: 실행**

Run(통합): `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --runInBand --testEnvironment "<rootDir>/test/helpers/isolated-integration-environment.cjs" --testMatch "<rootDir>/test/tournaments/tournament-slots.integration-spec.ts" -t "동시성|팀이 들어간 대진"`
Expected: PASS. 실패 해석:
- "같은 팀 … 동시에" 가 둘 다 성공 → 레인 잠금이 빠졌다(Task 7 `assignSlot` 의 `lockCompetitionForBracketMutationInTx`).
- "취소와 배정" 에서 `40P01`/`deadlock detected` → Task 12 의 해제 호출 위치가 `cancel` 트랜잭션 맨 앞이 아니다.
- "교체" 에서 `FIXTURE_DOWNSTREAM_ASSIGNED` → Task 3 삭제 순서가 하류 먼저가 아니다.

- [ ] **Step 3: 커밋**

```bash
git commit -m "test(bracket): 자리 배정 동시성과 팀이 들어간 대진 교체 시나리오" -- apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts
git show --stat HEAD
```

---

### Task 16: API 문서 · changeset · 최종 검증

**Files:**
- Modify: `docs/api/domains/tournaments.md` — 파일 끝에 섹션 추가
- Create: `.changeset/admin-bracket-canvas-slots-templates.md`

- [ ] **Step 1: API 문서 추가** — `docs/api/domains/tournaments.md` 맨 끝에

```md

### 대진 템플릿과 자리 배정 (2026-10-08)

모두 `V1AuthGuard` + `getMutationAdmin`(support 어드민 403). 대회 레인은 `league-fixture-generation:{tournamentId}` advisory lock, 정규 리그 레인은 `v1_tournaments` 행 `FOR UPDATE` + 보류 판정 — 이번 범위에서 정규 리그 자리는 만들어지지 않는다.

- `POST /admin/tournaments/:tournamentId/bracket/template` — 본문 `{ kind: 'knockout' | 'group_knockout' | 'league', … , replaceExisting?: boolean }`. `knockout`: `size` 4·8·12, `thirdPlace`. `league`(리그 방식 대회): `teamCount` 3~20, `legs` 1·2. 한 트랜잭션(45초)에서 조·자리·빈 경기(팀 미정)·승자/패자 연결을 만든다. 응답 `{ groups, slots, fixtures, edges }`.
  - 12강은 ENTRY 자리 8 + BYE 자리 4(position 1~4 ↔ `V1TournamentByeSlot.sortOrder` 0·3·4·7), 8강 i번 홈 = BYE 자리 i · 어웨이 = 12강 i번 WINNER 연결.
  - 오류: 422 `BRACKET_TEMPLATE_UNSUPPORTED`(범위 밖·필수 필드 누락·`group_knockout` 은 아직 미지원)·`BRACKET_TEMPLATE_FORMAT_MISMATCH`·`BRACKET_TEMPLATE_TOO_LARGE`(경기 240 초과), 409 `COMPETITION_CONFIG_REQUIRED`·`BRACKET_NOT_EMPTY`(비삭제 경기·조·자리가 있음)·`BRACKET_LOCKED`(`replaceExisting` 인데 시작·결과가 있는 경기가 있음).
  - `replaceExisting`: 모든 경기가 시작 전·결과 없음일 때만. 하류 경기부터 소프트 삭제 → 자리 → GroupTeam·Standing·ByeSlot → 조 순으로 지우고 새로 만든다(경기 번호는 1부터 다시, 생성 키는 소프트 삭제 이력 수를 반영).
- `PUT /admin/tournament-slots/:slotId/assignment` — 본문 `{ registrationId: uuid | null }`(null = 비우기). 응답 `{ slot: { id, kind, groupId, sourceGroupId, position, label, registrationId, teamName }, affectedTeamMatchIds }`.
  - 그 자리를 쓰는 경기(`deletedAt IS NULL AND status <> 'cancelled'`) 전부에 사이드를 반영한다. `phase = group` 조에서는 조 편성(`V1TournamentGroupTeam`)을 만들고, 교체·비우기 때 그 조의 다른 경기에 더 이상 없는 이전 팀의 편성·순위 행을 지운 뒤 순위를 다시 계산한다. BYE 자리는 `ByeSlot` ↔ `GroupTeam(isBye)` 를 전환한다(`createBye` 와 같은 의미).
  - 오류: 404 `SLOT_NOT_FOUND`, 422 `SLOT_REGISTRATION_INVALID`(다른 대회·미확정 등록), 409 `SLOT_TEAM_ALREADY_PLACED`(ENTRY·BYE 교차 포함)·`SLOT_LOCKED`(자리를 쓰는 경기 중 시작·결과 있음)·`SLOT_LEAGUE_NOT_SUPPORTED_YET`(정규 리그 자리).
- `POST /admin/tournaments/:tournamentId/slots/random-fill` — 본문 없음. 잠금 안에서 다시 읽은 빈 ENTRY·BYE 자리에, 아직 어느 자리에도 없는 확정 등록을 서버가 무작위로 배정한다(남는 쪽은 그대로). 응답 `{ assignments: [{ slotId, registrationId }] }`.
- `PATCH /admin/fixtures/:id` 로 자리에 연결된 사이드의 팀을 바꾸면 409 `SLOT_LINKED`(일정·장소·번호 수정은 그대로).
- `POST /admin/tournaments/:tournamentId/league/fixtures/generate` 의 `replaceExisting` 가 자리에 연결된 경기를 덮어쓰려 하면 409 `LEAGUE_SLOT_FIXTURES_USE_TEMPLATE` — 템플릿 교체를 쓴다.
- `PATCH /admin/registrations/:registrationId/cancel`(참가 취소 요청 승인 포함)은 확정이었던 팀의 자리를 비운다. 자리를 쓰는 경기 중 시작된 것이 있으면 자리를 그대로 두고 등록만 취소한다. 팀이 보낸 취소 요청(`cancel_requested`)은 자리를 비우지 않는다 — 운영자가 승인할 때 비운다.
```


- [ ] **Step 2: changeset** — `.changeset/admin-bracket-canvas-slots-templates.md` (이 PR 은 `apps/v1_api` 만 바꾼다 — 실제로 바뀐 앱만 적는다. `v1_api`·`v1_web` 은 fixed 그룹이라 함께 올라간다)

```md
---
"v1_api": minor
---

어드민이 대회 대진을 템플릿으로 한 번에 만들고, 팀은 나중에 자리에 넣을 수 있는 서버 기반을 추가합니다.

토너먼트(4·8·12강, 3·4위전 선택)와 리그 방식 대회의 빈 대진을 만들면 경기·승자 연결·자리가 함께 생기고, 자리에 확정 팀을 넣거나 빼면 그 자리를 쓰는 모든 경기와 조 편성·부전승이 한 번에 바뀝니다. 빈 자리 무작위 채우기를 지원하고, 참가가 취소되면 자리가 자동으로 비워집니다. 화면은 후속 변경에서 연결합니다.
```

- [ ] **Step 3: 전체 검증 (이 PR 범위의 타깃 실행 — 풀스위트 아님)**

Run:
```bash
cd apps/v1_api
TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots src/tournaments/templates src/tournaments/admin-registrations.service.spec.ts src/tournaments/tournament-bracket.service.spec.ts src/tournaments/league-fixture-generator.service.spec.ts src/league-matches/league-match-admin.service.spec.ts
node scripts/v1-surface-check.mjs   # 두 baseline JSON 이 실측과 정확히 맞아야 통과(raw SQL 1곳, 리그 허용 서비스 3곳)
```
Expected: 전부 PASS.
- 격리 `tsc`: `cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json"` → 오류 0. `git status --short` 에 `prisma-iso-tmp` 등 임시 파일이 없음.
- 통합 3개 스펙(`test/tournaments/bracket-template.integration-spec.ts`·`tournament-slots.integration-spec.ts`·기존 `tournament-group-team-enrollment.integration-spec.ts`)은 푸시 후 CI 로 확인한다(로컬 DB 가 있으면 직접).
- 주석 비율 실측: `git diff origin/dev -- apps/v1_api/src | grep -cE "^\+\s*(//|\*)"` 가 추가 줄의 1/3 안팎인지 확인한다.
- **두 벌 구현 없음 확인**(PR-1a 가 이미 `origin/dev` 에 머지된 기준 — 1a·1b 를 한 PR 로 묶었다면 서비스 diff 검사는 건너뛴다): `test ! -e src/tournaments/slots/group-phase-teams.ts && git diff --stat origin/dev -- src/tournaments/tournament-bracket.service.ts | wc -l` → 파일 없음 + 출력 0(이 PR 은 서비스를 수정하지 않았다). `grep -rn "export async function \(ensureGroupPhaseTeamsInTx\|recalculateStandingsInTx\|releaseUnusedGroupTeamsInTx\)" src` → `tournament-bracket-tx.ts` 한 파일에 정확히 3줄.

- [ ] **Step 4: 커밋**

```bash
git add .changeset/admin-bracket-canvas-slots-templates.md
git commit -m "docs(bracket): 템플릿·자리 배정 API 계약과 changeset" -- docs/api/domains/tournaments.md .changeset/admin-bracket-canvas-slots-templates.md
git show --stat HEAD
```
Expected: 위 2개 파일만.

- [ ] **Step 5: 머지 후 확인 (UI 없음 — 갤러리 면제, 읽기 전용 스모크만)**

PR 번호는 `gh pr create` 가 출력한 URL 에서 파싱한다(추측 금지). 이하 `$PR` 는 그 URL, `$MERGE_SHA` 는 `gh pr view "$PR" --json mergeCommit --jq .mergeCommit.oid` 결과. 쓰기는 아래 어느 것도 하지 않는다 — **새 대회·팀·자리를 만드는 alpha 쓰기(템플릿 적용·배정 E2E)는 사용자 승인 뒤에만** 한다.

1. 머지 직전 대상 브랜치 확인: `gh pr view "$PR" --json baseRefName --jq .baseRefName --repo kim-song-jun/matchup-sports-platform` → `dev`.
2. 배포가 내 머지를 포함하는지(배포 창 중에는 측정하지 않는다):

```bash
gh run list --workflow deploy-alpha.yml --branch dev --limit 1 --repo kim-song-jun/matchup-sports-platform --json headSha,status,conclusion --jq '.[0]'
DEPLOYED=$(curl -fsSI https://alpha.teameet.co.kr/landing | grep -i '^x-teameet-commit' | awk '{print $2}' | tr -d '\r'); echo "$DEPLOYED"
git merge-base --is-ancestor "$MERGE_SHA" "$DEPLOYED" && echo "포함됨"
curl -fsS https://alpha.teameet.co.kr/api/v1/health | grep -o '"db":true'
```
Expected: run `completed/success`, `x-teameet-commit` 이 머지 커밋 이후라 `포함됨`, health `"db":true`. 직전 run 이 `cancelled` 면 alpha 가 서빙하는 SHA 는 마지막 **성공** 배포의 것이므로 `포함됨` 이 나올 때까지 기다린다.

3. 읽기 전용 스모크 — 존재하지 않는 id 로 새 라우트가 배포됐고 가드·검증이 도는지만 본다(아무것도 생성·변경되지 않는다). 세션은 로그인 API 로 받은 쿠키를 `ALPHA_SESSION_TOKEN` 환경변수로만 넘긴다(계정·비밀번호는 저장소에 적지 않는다 — 비공개 메모리 참조).

```bash
NONE=00000000-0000-4000-8000-00000000dead
H=(-H "cookie: teameet_v1_session=$ALPHA_SESSION_TOKEN" -H 'content-type: application/json')
curl -sS -o /dev/null -w '%{http_code}\n' "${H[@]}" -X PUT  "https://alpha.teameet.co.kr/api/v1/admin/tournament-slots/$NONE/assignment" -d '{"registrationId":null}'
curl -sS "${H[@]}" -X PUT  "https://alpha.teameet.co.kr/api/v1/admin/tournament-slots/$NONE/assignment" -d '{"registrationId":null}' | grep -o '"code":"[A-Z_]*"'
curl -sS "${H[@]}" -X POST "https://alpha.teameet.co.kr/api/v1/admin/tournaments/$NONE/bracket/template" -d '{"kind":"knockout","size":8,"thirdPlace":false}' | grep -o '"code":"[A-Z_]*"'
curl -sS "${H[@]}" -X POST "https://alpha.teameet.co.kr/api/v1/admin/tournaments/$NONE/slots/random-fill" | grep -o '"code":"[A-Z_]*"'
```
Expected: 첫 줄 `404`, 이어서 `"code":"SLOT_NOT_FOUND"`, `"code":"TOURNAMENT_NOT_FOUND"`, `"code":"TOURNAMENT_NOT_FOUND"` — 라우트가 없으면 Nest 기본 `Cannot PUT …` 404 라 `code` 가 안 나온다(그게 "배포 안 됨" 신호). 기존 대회 하나로 `GET /api/v1/admin/tournaments/<기존 대회 id>/bracket` 이 200 이고 최상위에 `slots` 배열이 있는지도 본다(PR-1a 응답 — 이 PR 이 깨지 않았다는 회귀 확인).

4. 메인 작업트리 동기화(머지 하나당 한 번): `cd /Users/sungjun/Dev/projects/matchup-sports-platform && git fetch origin dev -q && git merge --ff-only origin/dev`. FF 가 거부되면 백업 후 진행 규칙을 따른다.
5. 결과(배포 SHA, 스모크 코드 4개)를 PR 코멘트 없이 사용자 보고에 적는다 — 이 저장소는 public 이므로 실제 대회 id 등 식별자는 보고 채팅에만 둔다.

---

## Self-Review

스펙 항목 → 이 계획의 Task 대응. (S# = `.github/tasks/20261057-admin-bracket-canvas.md` 의 설계 절, T# = Test Scenarios 줄)

| 스펙 항목 | 커버하는 Task |
|---|---|
| 담당 범위 (1) `lockCompetitionForBracketMutationInTx` — 대회 advisory / 리그 행 `FOR UPDATE` + 기존 허용 판정 | Task 1 (기존 `assertFixtureGenerationAllowedInTx` 추출), 사용처 Task 5·7·11 |
| S3 `assignSlotInTx` fan-out(비삭제·비취소, id 순), `SLOT_LOCKED`·`SLOT_REGISTRATION_INVALID`·`SLOT_TEAM_ALREADY_PLACED`(ENTRY/BYE 교차) | Task 7 (+Task 10 교차 양방향) |
| S3 조 편성 **생성**(PR-1a `ensureGroupPhaseTeamsInTx` — 사이드 배정 경로에서 이미 호출, 이 PR 은 import 만) + **신규 해제 로직** `releaseUnusedGroupTeamsInTx` + 순위 재계산(PR-1a `recalculateStandingsInTx`) | Task 0(심볼·사본 부재 확인) · Task 9 |
| S3 BYE 자리 ↔ `ByeSlot`/`GroupTeam(isBye)` (`createBye` 의미) | Task 10 |
| S3 여러 자리 배치는 비우기 먼저(맞바꾸기 유일 제약 회피) | Task 11 (`assignSlotsBatchInTx`, 대조군 포함) |
| S3 `POST …/slots/random-fill` (서버 무작위, 잠금 안 재조회) | Task 11 |
| S3 `PUT …/assignment` 컨트롤러·DTO·감사 로그 | Task 8 (라우트·DTO) · Task 7 (감사 `tournament.slot.assign`), Task 11 (`tournament.slot.random_fill`) |
| S3 정규 리그 자리 → `assignLeagueFixtureSideInTx`(PR-5a) | Task 7 의 `assertTournamentLane` 이 409 `SLOT_LEAGUE_NOT_SUPPORTED_YET` 로 막는다(이 PR 에서 리그 자리가 만들어지지 않음 — PR-5a 가 교체) |
| S3 `releaseSlotsForRegistrationInTx` + confirmed 이탈 전이 전수 확인·연결 | Task 12 (전이 표, `cancel` 연결 / 리그 `removeTeam` 은 PR-5a / `cancel_requested` 진입은 비해제 근거) |
| S3 `SLOT_LINKED` (PATCH 직접 변경 차단) | 가드는 PR-1a Task 8 소유 — 이 PR 은 Task 13 의 통합 시나리오로 고정만 |
| S2 `planBracketTemplate` knockout 4/8/12(+3·4위전)·league(대회), 12강 BYE 배선, 조 이름·라운드 라벨, 상한 240 | Task 2 |
| S2 `BracketTemplateService.apply` — format 일치, `COMPETITION_CONFIG_REQUIRED`, `BRACKET_NOT_EMPTY`, 45초 타임아웃, 잠금 | Task 5 |
| S2 `replaceExisting` 순서(소프트 삭제→자리→GroupTeam·Standing·ByeSlot→조), `BRACKET_LOCKED`, `nextFixtureCreationCommandId` | Task 3(삭제 순서) · Task 6 (두 번 교체 테스트가 생성 키를 검증) · Task 5 Step 0(PR-1a 전제) |
| 모듈 배선 | Task 5 · Task 8 (`tournaments.module.ts`) |
| docs/api + changeset | Task 16 |
| T 개수 계약(knockout 8+3위전, 4, 12+3위전, league 6팀 2회전) | Task 2 단위 + Task 5 DB 통합 |
| T fan-out 대조군 / 자리 비우기→미정·팀 일정 취소 | Task 7 |
| T BYE 배정→GroupTeam(isBye)·8강 홈, 비우면 원복 | Task 10 |
| T 무작위 채우기(자리<팀 / 자리>팀 / 중복 없음) | Task 11 |
| T 조 편성 생성·교체·비우기, 다른 경기에 남아 있으면 유지 | Task 9 |
| E 같은 팀 두 자리·ENTRY↔BYE | Task 7 · Task 10 |
| E `SLOT_LOCKED`·`SLOT_LINKED` | Task 7 · Task 13 |
| E `BRACKET_NOT_EMPTY`·`BRACKET_LOCKED`, format 불일치 422, 상한 422 | Task 5 · Task 6 · Task 2 |
| E 리그 참가팀 제외·등록 취소 시 시작 전 경기는 취소 대신 자리만 비움(대회 레인) | Task 12 (리그 `removeTeam` 연결은 PR-5a) |
| E 맞바꾸기에서 유일 제약 위반 없음(순위대로 채우기 A1↔A2 의 기반) | Task 11 |
| E 동시성(같은 대회 템플릿 두 번 / 같은 팀 두 자리) | Task 5 · Task 15 |
| Error 템플릿·자리 API support 403, 다른 대회 등록 422, 미확정 등록 422, 설정 버전 없음 409 | Task 5 · Task 7 |
| Mock 갱신 | `admin-registrations.service.spec.ts` 주입 대체(Task 12) 하나뿐 — `tournament-bracket.service.spec.ts` 는 이 PR 이 서비스를 안 고치므로 건드리지 않는다. 스키마 해시 fixture·대진 응답 목은 PR-1a 범위 |
| 팀의 취소 요청은 자리를 유지, 승인 시 전부 시작 전이면 비움 / 하나라도 시작됐으면 유지 (스펙 Risks · Ambiguity Log) | Task 12 (`취소 요청은 자리를 비우지 않고, 운영자 승인 때 판정한다` 3건 — 실제 `cancelRequest`·`cancel` 경로) |
| 중복 구현 금지(색인 보충 계약) — PR-1a 함수는 import 만 | Task 0 (존재 확인) · Task 16 Step 3 (두 벌 없음 grep) |
| 머지 후 확인(UI 없음: SHA·배포 포함·읽기 전용 스모크·갤러리 면제) | Task 16 Step 5 |

**이 PR 이 스펙에 더한 것(결정 근거 포함)**: Task 14 — 자리로 만든 리그 방식 대회 조의 `replaceExisting` 일괄 재생성 차단(스펙 S2 는 정규 리그에만 적음, 같은 자리 모델이라 같은 코드로 막음). Task 12 — 팀의 취소 요청(`confirmed → cancel_requested`)은 자리를 비우지 않고 운영자 승인 시 비운다(요청은 철회로 되돌릴 수 있음). 승인 시 자리를 쓰는 경기 중 하나라도 시작됐으면 자리를 유지하고 등록만 취소한다.

**이 PR 이 비워 두는 것**: 정규 리그 자리·리그 템플릿·리그 `removeTeam` 해제(PR-5a), `group_knockout` 템플릿·`GROUP_RANK` 순위 채우기(PR-4), 어드민 대진 응답의 `slots`·`game` 확장과 스키마·마이그레이션, `SLOT_LINKED` 가드, 조 편성 생성·순위 재계산 함수(PR-1a).
