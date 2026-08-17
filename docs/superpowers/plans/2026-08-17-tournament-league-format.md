# 대회 리그전(League Format) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대회(Tournament) 도메인에 리그전을 서버 계약으로 구현한다 — 조별 리그 + 통합 순위표, 홈/어웨이 더블 라운드로빈, 라운드로빈 생성기의 서버 단일화.

**Architecture:** 라운드로빈 페어링을 도메인 중립 순수함수(`common/scheduling/round-robin.ts`)로 추출해 대회·시리즈가 공유한다. 통합 순위는 신규 테이블 `V1TournamentOverallStanding`에 저장하되 조별 순위와 **같은 트랜잭션**에서 갱신해 어긋날 수 없게 한다. `calculateCompetitionStandings`는 그룹 개념을 모르는 순수함수이므로 입력만 바꿔 통합 순위를 산출한다.

**Tech Stack:** NestJS 11 + Prisma 6 + PostgreSQL 16 (apps/v1_api), Next.js 16 App Router (apps/v1_web), Jest 30 (unit/integration), Vitest (web)

**Spec:** `docs/superpowers/specs/2026-08-17-tournament-league-format-design.md`

**Worktree:** `.claude/worktrees/league-format`, 브랜치 `feat/v1-tournament-league-format`, base `origin/dev@36cbf281`

## Global Constraints

- **활성 스택은 `apps/v1_api` / `apps/v1_web`다.** `apps/api` / `apps/web`은 구 스택이며 이 계획에서 절대 건드리지 않는다.
- **schema.prisma를 고치면 CI `V1 migration replay + drift gate`가 `SOURCE_SNAPSHOT_DRIFT`로 실패한다.** `apps/v1_api/test/fixtures/game-schema.fixture.ts`의 `gameSchemaSourceManifest.schema`를 `shasum -a 256 prisma/schema.prisma` 결과로 재핀하고 **재핀 근거 주석을 덧붙여야 한다**(Task 3).
- **스키마 변경은 반드시 migration 파일을 동반한다.** `prisma db push`만 하고 migration을 빠뜨리면 프로덕션 `migrate deploy`가 깨진다.
- **에러 메시지는 해요체**(`~했어요`, `~해주세요`). 합니다체 금지.
- **에러 코드는 `DOMAIN_CODE` 형태** (예: `TOURNAMENT_NOT_LEAGUE`).
- **숫자 기본값은 `??`를 쓴다** (`||`는 0을 falsy로 처리).
- **base는 항상 `dev`.** dev 머지 = alpha 즉시 실배포.
- **UI 검증은 로컬 next 서버가 아니라 alpha 배포 후 스크린샷으로 한다.**
- **커밋은 pathspec으로 내 파일만** 지정하고 직후 `git show --stat HEAD`로 휩쓸린 파일이 없는지 확인한다. `git add -A` / `git commit -a` 금지.
- 테스트 실행: `cd apps/v1_api && pnpm test` (unit), `pnpm test:integration` (통합, --runInBand)
- worktree에는 node_modules가 없다. 메인 트리에서 심링크하거나 `pnpm --filter v1_api ...`를 레포 루트에서 실행한다.

---

## File Structure

### PR 1 — 스키마 + 공유 커널

| 파일 | 책임 |
|---|---|
| `apps/v1_api/src/common/scheduling/round-robin.ts` (신규) | 도메인 중립 라운드로빈 페어링 순수함수 |
| `apps/v1_api/src/common/scheduling/round-robin.spec.ts` (신규) | 커널 단위 테스트 |
| `apps/v1_api/src/team-match-series/round-robin-schedule.ts` (수정) | 커널의 얇은 래퍼로 전환. 시그니처 불변 |
| `apps/v1_api/prisma/schema.prisma` (수정) | 모델 3건 |
| `apps/v1_api/prisma/migrations/20260817000000_v1_tournament_league_format/migration.sql` (신규) | additive 마이그레이션 |
| `apps/v1_api/test/fixtures/game-schema.fixture.ts` (수정) | drift gate 해시 재핀 |

### PR 2 — 서버 API

| 파일 | 책임 |
|---|---|
| `apps/v1_api/src/tournaments/competition-config/competition-standings.ts` (수정) | 페어플레이 입력 수용 |
| `apps/v1_api/src/tournaments/league-fair-play.ts` (신규) | 카드 → 페어플레이 벌점 집계 |
| `apps/v1_api/src/tournaments/tournament-overall-standings.ts` (신규) | 통합 순위 계산·upsert |
| `apps/v1_api/src/tournaments/league-fixture-generator.service.ts` (신규) | 리그 대진 생성 |
| `apps/v1_api/src/tournaments/league-progress.ts` (신규) | 진행률·매직넘버 파생 계산 |
| `apps/v1_api/src/tournaments/dto/admin-league.dto.ts` (신규) | 대진 생성 DTO |
| `apps/v1_api/src/tournaments/tournament-bracket.controller.ts` (수정) | 신규 엔드포인트 2종 |
| `apps/v1_api/src/tournaments/tournament-bracket.service.ts` (수정) | 리그 전용 차단 규칙 |
| `apps/v1_api/src/tournaments/tournament-group-standings.ts` (수정) | 통합 재계산을 같은 트랜잭션에 연결 |
| `apps/v1_api/src/tournaments/tournament-standings-reconcile.cli.ts` (신규) | 조별↔통합 대조 |

### PR 3 — 프론트엔드

| 파일 | 책임 |
|---|---|
| `apps/v1_web/src/lib/tournament-bracket-gen.ts` (수정) | `roundRobinRounds` 삭제 |
| `apps/v1_web/src/app/admin/tournaments/[id]/tournament-detail-client.tsx` (수정) | 자동생성을 서버 API 호출로 교체 + legs 선택 |
| `apps/v1_web/src/app/admin/tournaments/new/page.tsx` (수정) | `minMatchesPerTeam` 입력 |
| `apps/v1_web/src/components/tournaments/league-standings-table.tsx` (신규) | 통합 순위표 + 진행률 + 매직넘버 |
| `apps/v1_web/src/types/api.ts` (수정) | 신규 응답 타입 |

---

# PR 1 — 스키마 + 공유 커널

## Task 1: 라운드로빈 공유 커널

**Files:**
- Create: `apps/v1_api/src/common/scheduling/round-robin.ts`
- Test: `apps/v1_api/src/common/scheduling/round-robin.spec.ts`

**Interfaces:**
- Consumes: 없음 (순수함수, 의존성 없음)
- Produces:
  - `type RoundRobinPairing = { round: number; leg: number; homeId: string; awayId: string }`
  - `type RoundRobinOptions = { rounds?: number; legs?: number; balanceHome?: boolean }`
  - `function generateRoundRobin(participantIds: readonly string[], options: RoundRobinOptions): RoundRobinPairing[]`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`apps/v1_api/src/common/scheduling/round-robin.spec.ts`:

```ts
import { generateRoundRobin } from './round-robin';

describe('generateRoundRobin', () => {
  it('4명·1회전에 모든 페어가 정확히 한 번씩 만난다', () => {
    const pairings = generateRoundRobin(['a', 'b', 'c', 'd'], { legs: 1 });
    expect(pairings).toHaveLength(6);
    const pairKeys = pairings.map((p) => [p.homeId, p.awayId].sort().join('-')).sort();
    expect(pairKeys).toEqual(['a-b', 'a-c', 'a-d', 'b-c', 'b-d', 'c-d']);
  });

  it('한 라운드 안에서 같은 참가자가 두 번 나오지 않는다', () => {
    const pairings = generateRoundRobin(['a', 'b', 'c', 'd', 'e', 'f'], { legs: 1 });
    const byRound = new Map<number, string[]>();
    for (const p of pairings) {
      const ids = byRound.get(p.round) ?? [];
      ids.push(p.homeId, p.awayId);
      byRound.set(p.round, ids);
    }
    for (const ids of byRound.values()) {
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('legs=2이면 각 페어가 두 번 만나고 홈/어웨이가 뒤바뀐다', () => {
    const pairings = generateRoundRobin(['a', 'b', 'c', 'd'], { legs: 2 });
    expect(pairings).toHaveLength(12);
    const ab = pairings.filter((p) => [p.homeId, p.awayId].sort().join('-') === 'a-b');
    expect(ab).toHaveLength(2);
    expect(ab[0].homeId).not.toBe(ab[1].homeId);
  });

  it('legs=2에서 각 참가자의 홈 경기 수와 원정 경기 수가 같다', () => {
    const pairings = generateRoundRobin(['a', 'b', 'c', 'd'], { legs: 2 });
    for (const id of ['a', 'b', 'c', 'd']) {
      const home = pairings.filter((p) => p.homeId === id).length;
      const away = pairings.filter((p) => p.awayId === id).length;
      expect(home).toBe(away);
    }
  });

  it('leg 번호가 1부터 매겨지고 round는 leg를 통틀어 연속 증가한다', () => {
    const pairings = generateRoundRobin(['a', 'b', 'c', 'd'], { legs: 2 });
    expect(Math.max(...pairings.map((p) => p.leg))).toBe(2);
    expect(Math.max(...pairings.map((p) => p.round))).toBe(6);
    const leg2Rounds = pairings.filter((p) => p.leg === 2).map((p) => p.round);
    expect(Math.min(...leg2Rounds)).toBe(4);
  });

  it('홀수 인원은 매 라운드 한 명이 bye이고 각자 (n-1)경기를 뛴다', () => {
    const pairings = generateRoundRobin(['a', 'b', 'c'], { legs: 1 });
    expect(pairings).toHaveLength(3);
    for (const id of ['a', 'b', 'c']) {
      const played = pairings.filter((p) => p.homeId === id || p.awayId === id).length;
      expect(played).toBe(2);
    }
  });

  it('rounds를 직접 주면 부분 회전도 만든다', () => {
    const pairings = generateRoundRobin(['a', 'b', 'c', 'd'], { rounds: 2 });
    expect(new Set(pairings.map((p) => p.round))).toEqual(new Set([1, 2]));
    expect(pairings).toHaveLength(4);
  });

  it('rounds와 legs를 둘 다 주면 rounds가 우선한다', () => {
    const pairings = generateRoundRobin(['a', 'b', 'c', 'd'], { rounds: 1, legs: 5 });
    expect(pairings).toHaveLength(2);
  });

  it('balanceHome=false면 홈 균등 배분을 하지 않는다', () => {
    const balanced = generateRoundRobin(['a', 'b', 'c', 'd'], { legs: 1, balanceHome: true });
    const raw = generateRoundRobin(['a', 'b', 'c', 'd'], { legs: 1, balanceHome: false });
    expect(raw).toHaveLength(balanced.length);
  });

  it('같은 입력에 항상 같은 결과를 낸다', () => {
    const first = generateRoundRobin(['a', 'b', 'c', 'd', 'e'], { legs: 2 });
    const second = generateRoundRobin(['a', 'b', 'c', 'd', 'e'], { legs: 2 });
    expect(first).toEqual(second);
  });

  it('참가자가 2명 미만이거나 라운드가 0 이하이면 빈 배열을 반환한다', () => {
    expect(generateRoundRobin(['a'], { legs: 1 })).toEqual([]);
    expect(generateRoundRobin([], { legs: 1 })).toEqual([]);
    expect(generateRoundRobin(['a', 'b'], { rounds: 0 })).toEqual([]);
    expect(generateRoundRobin(['a', 'b'], { legs: 0 })).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && pnpm test -- round-robin.spec`
Expected: FAIL — `Cannot find module './round-robin'`

- [ ] **Step 3: 커널을 구현한다**

`apps/v1_api/src/common/scheduling/round-robin.ts`:

```ts
/**
 * 도메인 중립 라운드로빈 페어링 (circle method).
 *
 * 대회(registrationId)와 팀 정기전 시리즈(teamId)가 공유하는 단일 소스다.
 * 이 파일 밖에서 라운드로빈 페어링을 다시 구현하지 않는다 —
 * 과거에 대회는 프론트 순수함수, 시리즈는 백엔드에 각각 따로 갖고 있었다.
 */

export interface RoundRobinPairing {
  /** 1-based. 모든 leg를 통틀어 연속 증가한다. */
  round: number;
  /** 1-based. 몇 번째 회전인지. */
  leg: number;
  homeId: string;
  awayId: string;
}

export interface RoundRobinOptions {
  /** 총 라운드 수를 직접 지정한다(부분 회전 허용). legs보다 우선한다. */
  rounds?: number;
  /** 회전 수. rounds = cycleRounds * legs 로 환산된다. */
  legs?: number;
  /** 홈 경기 수를 참가자 간에 균등 분배한다. 기본 true. */
  balanceHome?: boolean;
}

const BYE: unique symbol = Symbol('bye');
type Slot = string | typeof BYE;

export function generateRoundRobin(
  participantIds: readonly string[],
  options: RoundRobinOptions,
): RoundRobinPairing[] {
  if (participantIds.length < 2) return [];

  const padded: Slot[] = participantIds.length % 2 === 0
    ? [...participantIds]
    : [...participantIds, BYE];
  const cycleRounds = padded.length - 1;

  const totalRounds = options.rounds ?? cycleRounds * (options.legs ?? 1);
  if (totalRounds < 1) return [];

  const balanceHome = options.balanceHome ?? true;
  const homeCounts = new Map<string, number>(participantIds.map((id) => [id, 0]));
  const pairings: RoundRobinPairing[] = [];

  for (let round = 1; round <= totalRounds; round++) {
    const cycleIndex = (round - 1) % cycleRounds;
    const leg = Math.floor((round - 1) / cycleRounds) + 1;
    const arrangement = cycleIndex === 0 ? padded : rotateCircle(padded, cycleIndex);

    for (const [left, right] of circlePairs(arrangement)) {
      if (left === BYE || right === BYE) continue;
      const [homeId, awayId] = balanceHome
        ? pickHomeByBalance(left, right, homeCounts)
        : [left, right];
      homeCounts.set(homeId, (homeCounts.get(homeId) ?? 0) + 1);
      pairings.push({ round, leg, homeId, awayId });
    }
  }
  return pairings;
}

/** 홈 경기 수가 적은 쪽을 홈으로 준다. 동수면 입력 순서를 유지해 결정적으로 만든다. */
function pickHomeByBalance(
  left: string,
  right: string,
  homeCounts: ReadonlyMap<string, number>,
): [string, string] {
  return (homeCounts.get(left) ?? 0) <= (homeCounts.get(right) ?? 0)
    ? [left, right]
    : [right, left];
}

/** base[0]을 고정하고 나머지를 시계방향으로 steps만큼 회전한다(표준 circle method). */
function rotateCircle(base: readonly Slot[], steps: number): Slot[] {
  const [fixed, ...rest] = base;
  const offset = steps % rest.length;
  return [fixed, ...rest.slice(rest.length - offset), ...rest.slice(0, rest.length - offset)];
}

function circlePairs(arrangement: readonly Slot[]): Array<[Slot, Slot]> {
  const size = arrangement.length;
  const pairs: Array<[Slot, Slot]> = [];
  for (let i = 0; i < size / 2; i++) pairs.push([arrangement[i], arrangement[size - 1 - i]]);
  return pairs;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && pnpm test -- round-robin.spec`
Expected: PASS (11 tests)

- [ ] **Step 5: 커밋한다**

```bash
git add apps/v1_api/src/common/scheduling/round-robin.ts apps/v1_api/src/common/scheduling/round-robin.spec.ts
git commit -m "feat(scheduling): 도메인 중립 라운드로빈 커널 추가"
git show --stat HEAD
```

---

## Task 2: 시리즈를 커널 위로 전환 (회귀 게이트)

**Files:**
- Modify: `apps/v1_api/src/team-match-series/round-robin-schedule.ts:20-42`
- Test (기존, 수정 금지): `apps/v1_api/src/team-match-series/round-robin-schedule.spec.ts`

**Interfaces:**
- Consumes: `generateRoundRobin` from Task 1
- Produces: `generateRoundRobinFixtures(teamIds, weeksCount)` — **시그니처·반환 형태 불변**

> 이 태스크는 기존 동작을 **바꾸지 않는 것**이 목표다. 기존 spec 12개가 그대로 통과해야 한다.
> 하나라도 깨지면 Task 1의 커널이 틀린 것이므로 커널을 고친다 — spec을 고치지 않는다.

- [ ] **Step 1: 전환 전 기존 테스트가 통과하는 것을 먼저 확인한다 (기준선)**

Run: `cd apps/v1_api && pnpm test -- round-robin-schedule.spec`
Expected: PASS. 통과하지 않으면 여기서 멈추고 원인을 보고한다 — 기준선이 없으면 회귀를 판별할 수 없다.

- [ ] **Step 2: `generateRoundRobinFixtures`를 커널 래퍼로 바꾼다**

`apps/v1_api/src/team-match-series/round-robin-schedule.ts`에서 기존 `generateRoundRobinFixtures` 본문과
파일 하단의 `rotateCircle` / `circlePairs` / `BYE` / `Slot`을 삭제하고 아래로 교체한다.
`resolveFixtureStartAt`·`WEEK_MS`·`KST_OFFSET_MS`·`FixtureScheduleTemplate`은 **그대로 둔다**.

파일 상단 import 추가:
```ts
import { generateRoundRobin } from '../common/scheduling/round-robin';
```

교체 본문:
```ts
/**
 * 주차 기반 라운드로빈. 페어링 자체는 공용 커널
 * (`common/scheduling/round-robin.ts`)이 계산하고 여기서는 시리즈의
 * 기존 계약(주차=round, teamId 필드명)으로 변환만 한다.
 */
export function generateRoundRobinFixtures(
  teamIds: readonly string[],
  weeksCount: number,
): RoundRobinFixture[] {
  return generateRoundRobin(teamIds, { rounds: weeksCount, balanceHome: true }).map(
    ({ round, homeId, awayId }) => ({ round, homeTeamId: homeId, awayTeamId: awayId }),
  );
}
```

- [ ] **Step 3: 기존 테스트가 여전히 통과하는지 확인한다 (회귀 게이트)**

Run: `cd apps/v1_api && pnpm test -- round-robin-schedule.spec`
Expected: PASS — 12개 전부. 실패하면 **spec이 아니라 커널을 고친다.**

- [ ] **Step 4: 시리즈 호출부 타입이 깨지지 않았는지 확인한다**

Run: `cd apps/v1_api && npx tsc --noEmit`
Expected: 에러 0건. `team-match-series-admin.service.ts:133`이 그대로 컴파일되어야 한다.

- [ ] **Step 5: 커밋한다**

```bash
git add apps/v1_api/src/team-match-series/round-robin-schedule.ts
git commit -m "refactor(series): 라운드로빈 페어링을 공용 커널로 위임"
git show --stat HEAD
```

---

## Task 3: Prisma 스키마 + 마이그레이션 + drift gate 재핀

**Files:**
- Modify: `apps/v1_api/prisma/schema.prisma`
- Create: `apps/v1_api/prisma/migrations/20260817000000_v1_tournament_league_format/migration.sql`
- Modify: `apps/v1_api/test/fixtures/game-schema.fixture.ts`

**Interfaces:**
- Produces: Prisma 모델 `V1TournamentOverallStanding`, 필드 `V1Tournament.minMatchesPerTeam`, `V1TournamentStanding.fairPlayPoints`

- [ ] **Step 1: `V1TournamentStanding`에 `fairPlayPoints`를 추가한다**

`apps/v1_api/prisma/schema.prisma`의 `model V1TournamentStanding`에서 `goalsAgainst` 다음 줄에 추가:

```prisma
  fairPlayPoints Int       @default(0) @map("fair_play_points")
```

- [ ] **Step 2: `V1Tournament`에 `minMatchesPerTeam`을 추가한다**

`model V1Tournament` 안, `format` 필드 근처에 추가:

```prisma
  /** 리그전에서 각 팀이 최소 몇 경기를 보장받는지. null이면 검증하지 않는다. */
  minMatchesPerTeam Int? @map("min_matches_per_team")
```

- [ ] **Step 3: `V1TournamentOverallStanding` 모델을 추가한다**

`model V1TournamentStanding` 블록 바로 다음에 추가:

```prisma
/**
 * 대회 전체(모든 조 합산) 통합 순위. 조별 순위(V1TournamentStanding)와
 * 항상 같은 트랜잭션에서 갱신된다 — 한쪽만 갱신되는 경로를 만들지 말 것.
 * 소화 경기 수는 wins + draws + losses 로 파생한다(중복 저장 금지).
 */
model V1TournamentOverallStanding {
  id             String    @id @default(uuid())
  tournamentId   String    @map("tournament_id")
  registrationId String    @map("registration_id")
  points         Int       @default(0)
  wins           Int       @default(0)
  draws          Int       @default(0)
  losses         Int       @default(0)
  goalsFor       Int       @default(0) @map("goals_for")
  goalsAgainst   Int       @default(0) @map("goals_against")
  fairPlayPoints Int       @default(0) @map("fair_play_points")
  position       Int?
  recalculatedAt DateTime? @map("recalculated_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  tournament   V1Tournament             @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  registration V1TournamentRegistration @relation(fields: [registrationId], references: [id], onDelete: Cascade)

  @@unique([tournamentId, registrationId])
  @@index([tournamentId, position])
  @@map("v1_tournament_overall_standings")
}
```

- [ ] **Step 4: 역방향 relation을 추가한다**

`model V1Tournament`의 relation 목록에 추가:
```prisma
  overallStandings V1TournamentOverallStanding[]
```

`model V1TournamentRegistration`의 relation 목록에 추가:
```prisma
  overallStandings V1TournamentOverallStanding[]
```

- [ ] **Step 5: 마이그레이션 SQL을 작성한다**

`apps/v1_api/prisma/migrations/20260817000000_v1_tournament_league_format/migration.sql`:

```sql
-- 리그전: 통합 순위 테이블 + 최소 경기 수 설정 + 페어플레이 포인트
-- additive only. 기존 행/컬럼을 변경하거나 삭제하지 않는다.

ALTER TABLE "v1_tournament_standings"
  ADD COLUMN IF NOT EXISTS "fair_play_points" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "v1_tournaments"
  ADD COLUMN IF NOT EXISTS "min_matches_per_team" INTEGER;

CREATE TABLE IF NOT EXISTS "v1_tournament_overall_standings" (
  "id" TEXT NOT NULL,
  "tournament_id" TEXT NOT NULL,
  "registration_id" TEXT NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 0,
  "wins" INTEGER NOT NULL DEFAULT 0,
  "draws" INTEGER NOT NULL DEFAULT 0,
  "losses" INTEGER NOT NULL DEFAULT 0,
  "goals_for" INTEGER NOT NULL DEFAULT 0,
  "goals_against" INTEGER NOT NULL DEFAULT 0,
  "fair_play_points" INTEGER NOT NULL DEFAULT 0,
  "position" INTEGER,
  "recalculated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "v1_tournament_overall_standings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "v1_tournament_overall_standings_tournament_id_registration_id_key"
  ON "v1_tournament_overall_standings" ("tournament_id", "registration_id");

CREATE INDEX IF NOT EXISTS "v1_tournament_overall_standings_tournament_id_position_idx"
  ON "v1_tournament_overall_standings" ("tournament_id", "position");

ALTER TABLE "v1_tournament_overall_standings"
  ADD CONSTRAINT "v1_tournament_overall_standings_tournament_id_fkey"
  FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "v1_tournament_overall_standings"
  ADD CONSTRAINT "v1_tournament_overall_standings_registration_id_fkey"
  FOREIGN KEY ("registration_id") REFERENCES "v1_tournament_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 6: 마이그레이션이 빈 DB에서 재생되는지 확인한다**

Run:
```bash
cd apps/v1_api && npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL" \
  --exit-code
```
Expected: exit code 0 (드리프트 없음). 0이 아니면 마이그레이션 SQL과 schema.prisma가 어긋난 것이다.

> `SHADOW_DATABASE_URL`이 없으면 `docker compose up -d`로 PostgreSQL을 띄우고
> 빈 DB를 하나 만들어 지정한다. **기존 dev DB를 shadow로 쓰지 않는다** — 내용이 지워진다.

- [ ] **Step 7: drift gate 해시를 재핀한다**

Run: `cd apps/v1_api && shasum -a 256 prisma/schema.prisma`

`apps/v1_api/test/fixtures/game-schema.fixture.ts`의 `gameSchemaSourceManifest.schema` 값을
위 결과로 교체하고, **기존 재핀 주석 사슬의 형식을 그대로 따라** 바로 위에 주석을 덧붙인다:

```ts
// 2026-08-17 재핀: 리그전 통합 순위(V1TournamentOverallStanding) 신규 테이블 +
// V1Tournament.minMatchesPerTeam + V1TournamentStanding.fairPlayPoints 추가.
// 게임 도메인(V1Game*) 모델은 건드리지 않았고 전부 additive다.
// 뒷받침 마이그레이션: 20260817000000_v1_tournament_league_format.
```

`migration` 핀 값은 **바꾸지 않는다** — 바인딩된 마이그레이션 파일을 편집한 것이 아니라 새 파일을 추가한 것이다.

- [ ] **Step 8: drift gate가 통과하는지 확인한다**

Run: `cd apps/v1_api && pnpm test -- game-schema`
Expected: PASS — `SOURCE_SNAPSHOT_DRIFT` 없음

- [ ] **Step 9: 커밋한다**

```bash
git add apps/v1_api/prisma/schema.prisma \
        apps/v1_api/prisma/migrations/20260817000000_v1_tournament_league_format/migration.sql \
        apps/v1_api/test/fixtures/game-schema.fixture.ts
git commit -m "feat(db): 리그전 통합 순위 테이블·최소경기수·페어플레이 컬럼 추가"
git show --stat HEAD
```

> **PR 1 종료 지점.** 여기서 PR을 열고 base가 `dev`인지 `gh pr view <N> --json baseRefName`으로 확인한다.

---

# PR 2 — 서버 API

## Task 4: 페어플레이 벌점 집계

**Files:**
- Create: `apps/v1_api/src/tournaments/league-fair-play.ts`
- Test: `apps/v1_api/src/tournaments/league-fair-play.spec.ts`
- Modify: `apps/v1_api/src/tournaments/competition-config/competition-standings.ts:94-118`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type FairPlayCards = { yellow: number; secondYellowRed: number; directRed: number }`
  - `function fairPlayPointsOf(cards: FairPlayCards): number`
  - `calculateCompetitionStandings` 입력에 `fairPlayByRegistration?: ReadonlyMap<string, number>` 추가

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`apps/v1_api/src/tournaments/league-fair-play.spec.ts`:

```ts
import { fairPlayPointsOf } from './league-fair-play';

describe('fairPlayPointsOf', () => {
  it('카드가 없으면 0점이다', () => {
    expect(fairPlayPointsOf({ yellow: 0, secondYellowRed: 0, directRed: 0 })).toBe(0);
  });

  it('옐로 1장은 1점이다', () => {
    expect(fairPlayPointsOf({ yellow: 1, secondYellowRed: 0, directRed: 0 })).toBe(1);
  });

  it('경고 누적 퇴장은 3점이다', () => {
    expect(fairPlayPointsOf({ yellow: 0, secondYellowRed: 1, directRed: 0 })).toBe(3);
  });

  it('직접 퇴장은 4점이다', () => {
    expect(fairPlayPointsOf({ yellow: 0, secondYellowRed: 0, directRed: 1 })).toBe(4);
  });

  it('여러 사건은 합산된다', () => {
    expect(fairPlayPointsOf({ yellow: 2, secondYellowRed: 1, directRed: 1 })).toBe(9);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && pnpm test -- league-fair-play.spec`
Expected: FAIL — `Cannot find module './league-fair-play'`

- [ ] **Step 3: 구현한다**

`apps/v1_api/src/tournaments/league-fair-play.ts`:

```ts
/**
 * 페어플레이 벌점 — **낮을수록 상위**다.
 * `calculateCompetitionStandings`의 tie-break 5단계가 오름차순으로 비교한다.
 */
export interface FairPlayCards {
  yellow: number;
  /** 경고 누적 퇴장 */
  secondYellowRed: number;
  /** 직접 퇴장 */
  directRed: number;
}

const YELLOW_POINTS = 1;
const SECOND_YELLOW_RED_POINTS = 3;
const DIRECT_RED_POINTS = 4;

export function fairPlayPointsOf(cards: FairPlayCards): number {
  return (
    cards.yellow * YELLOW_POINTS +
    cards.secondYellowRed * SECOND_YELLOW_RED_POINTS +
    cards.directRed * DIRECT_RED_POINTS
  );
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && pnpm test -- league-fair-play.spec`
Expected: PASS (5 tests)

- [ ] **Step 5: `calculateCompetitionStandings`가 페어플레이 입력을 받게 한다**

`competition-standings.ts:94-100`의 시그니처에 optional 필드를 추가한다:

```ts
export function calculateCompetitionStandings(input: {
  tournamentId: string;
  configVersionId: string;
  registrationIds: string[];
  fixtures: StandingFixture[];
  config: CompetitionConfig;
  /**
   * registrationId → 누적 페어플레이 벌점(낮을수록 상위).
   * 주지 않으면 전부 0으로 두어 기존 동작을 유지한다.
   */
  fairPlayByRegistration?: ReadonlyMap<string, number>;
}): CalculatedStanding[] {
```

그리고 같은 함수의 `stats` 초기화(101-115행)에서 `fairPlayPoints: 0`을 바꾼다:

```ts
        fairPlayPoints: input.fairPlayByRegistration?.get(registrationId) ?? 0,
```

- [ ] **Step 6: 기존 순위 테스트가 깨지지 않았는지 확인한다**

Run: `cd apps/v1_api && pnpm test -- competition-standings`
Expected: PASS — optional 필드라 기존 호출부는 영향받지 않는다.

- [ ] **Step 7: 페어플레이가 실제로 순위를 가르는지 테스트를 추가한다**

`competition-standings.spec.ts`(기존 파일)에 추가:

```ts
it('승점·득실차·다득점이 모두 같으면 페어플레이 벌점이 낮은 팀이 앞선다', () => {
  const standings = calculateCompetitionStandings({
    tournamentId: 't1',
    configVersionId: 'cfg1',
    registrationIds: ['clean', 'dirty'],
    fixtures: [{ homeRegistrationId: 'clean', awayRegistrationId: 'dirty', homeScore: 1, awayScore: 1 }],
    config: defaultTestConfig(),
    fairPlayByRegistration: new Map([['clean', 1], ['dirty', 7]]),
  });
  expect(standings[0].registrationId).toBe('clean');
  expect(standings[1].registrationId).toBe('dirty');
});
```

> `defaultTestConfig()`는 이 spec 파일이 이미 쓰는 헬퍼다. 파일을 열어 실제 이름을 확인하고
> 다르면 그 이름을 쓴다. 없으면 파일 안의 기존 테스트가 config를 만드는 방식을 그대로 복사한다.

- [ ] **Step 8: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && pnpm test -- competition-standings`
Expected: PASS

- [ ] **Step 9: 커밋한다**

```bash
git add apps/v1_api/src/tournaments/league-fair-play.ts \
        apps/v1_api/src/tournaments/league-fair-play.spec.ts \
        apps/v1_api/src/tournaments/competition-config/competition-standings.ts \
        apps/v1_api/src/tournaments/competition-config/competition-standings.spec.ts
git commit -m "feat(tournaments): 페어플레이 벌점을 tie-break에 연결"
git show --stat HEAD
```

---

## Task 5: 통합 순위 계산·저장

**Files:**
- Create: `apps/v1_api/src/tournaments/tournament-overall-standings.ts`
- Test: `apps/v1_api/src/tournaments/tournament-overall-standings.spec.ts`
- Modify: `apps/v1_api/src/tournaments/tournament-group-standings.ts`

**Interfaces:**
- Consumes: `calculateCompetitionStandings`(Task 4에서 확장), `standingsFixturesFromGroup`(기존, `tournament-group-standings.ts:47`)
- Produces:
  - `function recalculateAndUpsertOverallStandings(tx, params, recalculatedAt): Promise<CalculatedStanding[]>`
  - `params: { tournamentId, configVersionId, config, groups: StandingsSourceGroup[], fairPlayByRegistration? }`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`apps/v1_api/src/tournaments/tournament-overall-standings.spec.ts`:

```ts
import { overallStandingsInput } from './tournament-overall-standings';
import type { StandingsSourceGroup } from './tournament-group-standings';

function group(id: string, regIds: string[], fixtures: Array<[string, string, number, number]>): StandingsSourceGroup {
  return {
    id,
    groupTeams: regIds.map((registrationId) => ({ registrationId })),
    fixtures: fixtures.map(([home, away, hs, as]) => ({
      homeRegistrationId: home,
      awayRegistrationId: away,
      game: { currentOfficialRevision: { state: 'OFFICIAL', score: { home: hs, away: as } } },
    })),
  };
}

describe('overallStandingsInput', () => {
  it('모든 조의 참가팀과 경기를 하나로 합친다', () => {
    const input = overallStandingsInput([
      group('A', ['r1', 'r2'], [['r1', 'r2', 2, 0]]),
      group('B', ['r3', 'r4'], [['r3', 'r4', 1, 1]]),
    ]);
    expect(input.registrationIds.sort()).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(input.fixtures).toHaveLength(2);
  });

  it('같은 팀이 두 조에 중복 배정돼도 registrationId를 한 번만 넣는다', () => {
    const input = overallStandingsInput([
      group('A', ['r1', 'r2'], []),
      group('B', ['r2', 'r3'], []),
    ]);
    expect(input.registrationIds.sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it('조가 없으면 빈 입력을 만든다', () => {
    const input = overallStandingsInput([]);
    expect(input.registrationIds).toEqual([]);
    expect(input.fixtures).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && pnpm test -- tournament-overall-standings.spec`
Expected: FAIL — `Cannot find module './tournament-overall-standings'`

- [ ] **Step 3: 구현한다**

`apps/v1_api/src/tournaments/tournament-overall-standings.ts`:

```ts
import type { Prisma } from '@prisma/client';
import {
  calculateCompetitionStandings,
  type CalculatedStanding,
  type CompetitionConfig,
  type StandingFixture,
} from './competition-config/competition-config';
import { standingsFixturesFromGroup, type StandingsSourceGroup } from './tournament-group-standings';

/**
 * 여러 조를 하나의 통합 순위 입력으로 합친다.
 *
 * `calculateCompetitionStandings`는 그룹 개념을 모르는 순수함수이므로
 * "전체 참가팀 + 전체 경기"를 넘기면 그대로 통합 순위가 나온다.
 * 승자승(head-to-head)도 옳게 동작한다 — 다른 조 팀끼리는 맞대결이 0건이라
 * 자동으로 다음 tie-break(득실차)로 넘어간다.
 */
export function overallStandingsInput(groups: readonly StandingsSourceGroup[]): {
  registrationIds: string[];
  fixtures: StandingFixture[];
} {
  const registrationIds = new Set<string>();
  const fixtures: StandingFixture[] = [];
  for (const group of groups) {
    for (const team of group.groupTeams) registrationIds.add(team.registrationId);
    fixtures.push(...standingsFixturesFromGroup(group));
  }
  return { registrationIds: [...registrationIds], fixtures };
}

/**
 * 대회 전체 통합 순위를 계산해 upsert 한다.
 *
 * **반드시 조별 순위와 같은 트랜잭션에서 호출한다.** 한쪽만 갱신되면
 * 조별 화면과 통합 화면이 다른 숫자를 보여준다.
 */
export async function recalculateAndUpsertOverallStandings(
  tx: Prisma.TransactionClient,
  params: {
    tournamentId: string;
    configVersionId: string;
    config: CompetitionConfig;
    groups: readonly StandingsSourceGroup[];
    fairPlayByRegistration?: ReadonlyMap<string, number>;
  },
  recalculatedAt: Date,
): Promise<CalculatedStanding[]> {
  const { registrationIds, fixtures } = overallStandingsInput(params.groups);

  const standings = calculateCompetitionStandings({
    tournamentId: params.tournamentId,
    configVersionId: params.configVersionId,
    registrationIds,
    fixtures,
    config: params.config,
    fairPlayByRegistration: params.fairPlayByRegistration,
  });

  for (const standing of standings) {
    const values = {
      points: standing.points,
      wins: standing.wins,
      draws: standing.draws,
      losses: standing.losses,
      goalsFor: standing.goalsFor,
      goalsAgainst: standing.goalsAgainst,
      fairPlayPoints: standing.fairPlayPoints,
      position: standing.position,
      recalculatedAt,
    };
    await tx.v1TournamentOverallStanding.upsert({
      where: {
        tournamentId_registrationId: {
          tournamentId: params.tournamentId,
          registrationId: standing.registrationId,
        },
      },
      create: {
        tournamentId: params.tournamentId,
        registrationId: standing.registrationId,
        ...values,
      },
      update: values,
    });
  }

  return standings;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && pnpm test -- tournament-overall-standings.spec`
Expected: PASS (3 tests)

- [ ] **Step 5: 조별 재계산 호출부에 통합 재계산을 잇는다**

`tournament-bracket.service.ts`의 `recalculateStandings`(773-861행)에서
`recalculateAndUpsertGroupStandings`를 모든 조에 대해 호출한 **뒤, 같은 트랜잭션 안에서**
`recalculateAndUpsertOverallStandings`를 한 번 호출한다.

`GameResultStandingsProjectionService`(자동 트리거)도 동일하게 잇는다 — 다만 이 경로는
영향받은 조 하나만 가져오므로, **통합 재계산을 위해서는 그 대회의 모든 group-phase 조를
같은 트랜잭션에서 다시 조회해야 한다.** 조회 조건은 `recalculateStandings`가 쓰는 것과 같은
include를 재사용한다.

> 이 스텝은 기존 파일 구조를 읽고 맞춰야 하므로 정확한 라인은 구현 시 확인한다.
> **불변식: `recalculateAndUpsertGroupStandings`가 호출되는 모든 경로에서
> `recalculateAndUpsertOverallStandings`도 같은 `tx`로 호출되어야 한다.**

- [ ] **Step 6: 통합 테스트로 트랜잭션 원자성을 검증한다**

`apps/v1_api/test/integration/` 아래에 시나리오를 추가한다:
- 2개 조에 각각 2팀, 각 조 1경기 결과 확정
- 확정 후 `v1_tournament_standings`(조별)와 `v1_tournament_overall_standings`(통합)의
  승점 합계가 일치하는지 확인
- 통합 upsert가 실패하도록 강제했을 때 조별도 롤백되는지 확인

Run: `cd apps/v1_api && pnpm test:integration`
Expected: PASS

- [ ] **Step 7: 커밋한다**

```bash
git add apps/v1_api/src/tournaments/tournament-overall-standings.ts \
        apps/v1_api/src/tournaments/tournament-overall-standings.spec.ts \
        apps/v1_api/src/tournaments/tournament-bracket.service.ts
git commit -m "feat(tournaments): 통합 순위를 조별 순위와 같은 트랜잭션에서 갱신"
git show --stat HEAD
```

---

## Task 6: 리그 대진 생성 API

**Files:**
- Create: `apps/v1_api/src/tournaments/league-fixture-generator.service.ts`
- Create: `apps/v1_api/src/tournaments/dto/admin-league.dto.ts`
- Test: `apps/v1_api/src/tournaments/league-fixture-generator.service.spec.ts`
- Modify: `apps/v1_api/src/tournaments/tournament-bracket.controller.ts`
- Modify: `apps/v1_api/src/tournaments/tournaments.module.ts`

**Interfaces:**
- Consumes: `generateRoundRobin`(Task 1), `resolveFixtureStartAt`(기존, `team-match-series/round-robin-schedule.ts:55`)
- Produces: `POST /api/v1/admin/tournaments/:tournamentId/league/fixtures/generate`

- [ ] **Step 1: DTO를 작성한다**

`apps/v1_api/src/tournaments/dto/admin-league.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, Min, ValidateNested } from 'class-validator';

export class LeagueScheduleTemplateDto {
  /** 0(일)~6(토), KST 기준 */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  /** 'HH:mm', KST 기준 24시간제 */
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: '시각은 HH:mm 형식으로 입력해주세요.' })
  time!: string;
}

export class LeagueScheduleDto {
  @ValidateNested()
  @Type(() => LeagueScheduleTemplateDto)
  template!: LeagueScheduleTemplateDto;

  @IsISO8601()
  startsOn!: string;
}

export class GenerateLeagueFixturesDto {
  @IsUUID()
  groupId!: string;

  /** 회전 수. 1=싱글 라운드로빈, 2=홈/어웨이 더블 라운드로빈 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  legs!: number;

  @IsOptional()
  @IsBoolean()
  balanceHome?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => LeagueScheduleDto)
  schedule?: LeagueScheduleDto;

  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;
}
```

- [ ] **Step 2: 실패하는 테스트를 작성한다**

`apps/v1_api/src/tournaments/league-fixture-generator.service.spec.ts`:

```ts
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { assertLeagueGenerationAllowed, buildLeagueFixtureRows } from './league-fixture-generator.service';

describe('assertLeagueGenerationAllowed', () => {
  const base = {
    format: 'league' as const,
    groupPhase: 'group' as const,
    teamCount: 4,
    existingFixtureCount: 0,
    fixturesWithResultCount: 0,
    minMatchesPerTeam: null as number | null,
    legs: 1,
    replaceExisting: false,
  };

  it('리그가 아닌 대회면 거부한다', () => {
    expect(() => assertLeagueGenerationAllowed({ ...base, format: 'knockout' }))
      .toThrow(UnprocessableEntityException);
  });

  it('조 phase가 group이 아니면 거부한다', () => {
    expect(() => assertLeagueGenerationAllowed({ ...base, groupPhase: 'knockout' }))
      .toThrow(UnprocessableEntityException);
  });

  it('팀이 2팀 미만이면 거부한다', () => {
    expect(() => assertLeagueGenerationAllowed({ ...base, teamCount: 1 }))
      .toThrow(UnprocessableEntityException);
  });

  it('replaceExisting=false인데 fixture가 이미 있으면 거부한다', () => {
    expect(() => assertLeagueGenerationAllowed({ ...base, existingFixtureCount: 3 }))
      .toThrow(ConflictException);
  });

  it('replaceExisting=true여도 결과가 확정된 fixture가 있으면 거부한다', () => {
    expect(() => assertLeagueGenerationAllowed({
      ...base, replaceExisting: true, existingFixtureCount: 3, fixturesWithResultCount: 1,
    })).toThrow(ConflictException);
  });

  it('최소 경기 수에 미달하면 거부하고 필요한 legs를 알려준다', () => {
    try {
      assertLeagueGenerationAllowed({ ...base, teamCount: 4, legs: 1, minMatchesPerTeam: 5 });
      throw new Error('should have thrown');
    } catch (error) {
      const response = (error as UnprocessableEntityException).getResponse() as {
        code: string; requiredLegs: number;
      };
      expect(response.code).toBe('LEAGUE_MIN_MATCHES_NOT_MET');
      expect(response.requiredLegs).toBe(2);
    }
  });

  it('조건을 모두 만족하면 통과한다', () => {
    expect(() => assertLeagueGenerationAllowed(base)).not.toThrow();
  });
});

describe('buildLeagueFixtureRows', () => {
  it('라운드 번호를 round 문자열로, leg를 legNumber로 매핑한다', () => {
    const rows = buildLeagueFixtureRows({
      groupId: 'g1',
      groupName: 'A조',
      registrationIds: ['r1', 'r2'],
      legs: 2,
      balanceHome: true,
      schedule: null,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].legNumber).toBe(1);
    expect(rows[1].legNumber).toBe(2);
    expect(rows[0].round).toBe('league_r1');
    expect(rows[0].startAt).toBeNull();
  });

  it('fixtureNumber가 1부터 연속으로 매겨진다', () => {
    const rows = buildLeagueFixtureRows({
      groupId: 'g1', groupName: 'A조',
      registrationIds: ['r1', 'r2', 'r3', 'r4'],
      legs: 1, balanceHome: true, schedule: null,
    });
    expect(rows.map((r) => r.fixtureNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('schedule이 있으면 라운드별 startAt을 주차로 채운다', () => {
    const rows = buildLeagueFixtureRows({
      groupId: 'g1', groupName: 'A조',
      registrationIds: ['r1', 'r2', 'r3', 'r4'],
      legs: 1, balanceHome: true,
      schedule: { startsOn: new Date('2026-09-01T00:00:00.000Z'), template: { dayOfWeek: 6, time: '20:00' } },
    });
    const round1 = rows.filter((r) => r.round === 'league_r1');
    const round2 = rows.filter((r) => r.round === 'league_r2');
    expect(round1[0].startAt).not.toBeNull();
    expect(round2[0].startAt!.getTime() - round1[0].startAt!.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && pnpm test -- league-fixture-generator`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: 순수 검증·조립 함수를 구현한다**

`apps/v1_api/src/tournaments/league-fixture-generator.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { generateRoundRobin } from '../common/scheduling/round-robin';
import { resolveFixtureStartAt, type FixtureScheduleTemplate } from '../team-match-series/round-robin-schedule';

export interface LeagueGenerationGuardInput {
  format: string;
  groupPhase: string;
  teamCount: number;
  existingFixtureCount: number;
  fixturesWithResultCount: number;
  minMatchesPerTeam: number | null;
  legs: number;
  replaceExisting: boolean;
}

/** 한 팀이 치르는 경기 수 = (참가팀 수 - 1) × 회전 수. */
export function matchesPerTeam(teamCount: number, legs: number): number {
  return Math.max(teamCount - 1, 0) * legs;
}

export function assertLeagueGenerationAllowed(input: LeagueGenerationGuardInput): void {
  if (input.format !== 'league') {
    throw new UnprocessableEntityException({
      code: 'TOURNAMENT_NOT_LEAGUE',
      message: '리그 대회에서만 리그 대진을 생성할 수 있어요.',
    });
  }
  if (input.groupPhase !== 'group') {
    throw new UnprocessableEntityException({
      code: 'LEAGUE_GROUP_PHASE_INVALID',
      message: '리그 대진은 조별 단계에서만 생성할 수 있어요.',
    });
  }
  if (input.teamCount < 2) {
    throw new UnprocessableEntityException({
      code: 'LEAGUE_TEAMS_INSUFFICIENT',
      message: '조에 배정된 팀이 2팀 이상이어야 대진을 만들 수 있어요.',
    });
  }
  if (!input.replaceExisting && input.existingFixtureCount > 0) {
    throw new ConflictException({
      code: 'LEAGUE_FIXTURES_ALREADY_EXIST',
      message: '이미 대진이 있어요. 다시 만들려면 기존 대진을 교체해주세요.',
    });
  }
  if (input.replaceExisting && input.fixturesWithResultCount > 0) {
    throw new ConflictException({
      code: 'LEAGUE_FIXTURES_HAVE_RESULTS',
      message: '결과가 확정된 경기가 있어 대진을 다시 만들 수 없어요.',
    });
  }
  const perTeam = matchesPerTeam(input.teamCount, input.legs);
  if (input.minMatchesPerTeam !== null && perTeam < input.minMatchesPerTeam) {
    const requiredLegs = Math.ceil(input.minMatchesPerTeam / Math.max(input.teamCount - 1, 1));
    throw new UnprocessableEntityException({
      code: 'LEAGUE_MIN_MATCHES_NOT_MET',
      message: `최소 ${input.minMatchesPerTeam}경기를 보장하려면 회전 수를 ${requiredLegs} 이상으로 설정해주세요.`,
      requiredLegs,
      currentMatchesPerTeam: perTeam,
    });
  }
}

export interface LeagueFixtureRow {
  groupId: string;
  round: string;
  fixtureNumber: number;
  legNumber: number;
  homeRegistrationId: string;
  awayRegistrationId: string;
  startAt: Date | null;
}

export function buildLeagueFixtureRows(input: {
  groupId: string;
  groupName: string;
  registrationIds: readonly string[];
  legs: number;
  balanceHome: boolean;
  schedule: { startsOn: Date; template: FixtureScheduleTemplate } | null;
}): LeagueFixtureRow[] {
  const pairings = generateRoundRobin(input.registrationIds, {
    legs: input.legs,
    balanceHome: input.balanceHome,
  });
  return pairings.map((pairing, index) => ({
    groupId: input.groupId,
    round: `league_r${pairing.round}`,
    fixtureNumber: index + 1,
    legNumber: pairing.leg,
    homeRegistrationId: pairing.homeId,
    awayRegistrationId: pairing.awayId,
    startAt: input.schedule
      ? resolveFixtureStartAt(input.schedule.startsOn, pairing.round, input.schedule.template)
      : null,
  }));
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && pnpm test -- league-fixture-generator`
Expected: PASS (10 tests)

- [ ] **Step 6: 서비스 클래스와 트랜잭션 저장을 구현한다**

같은 파일에 이어서 작성한다. `PrismaService`와 기존 `AdminContext`(`tournament-bracket.service.ts`가
쓰는 `this.adminContext.getMutationAdmin(user.id)`) 패턴을 그대로 따른다.

```ts
@Injectable()
export class LeagueFixtureGeneratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: V1AdminContextService,
  ) {}

  async generate(user: V1AuthUser, tournamentId: string, dto: GenerateLeagueFixturesDto) {
    await this.adminContext.getMutationAdmin(user.id);

    const tournament = await this.prisma.v1Tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, format: true, minMatchesPerTeam: true },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }

    const group = await this.prisma.v1TournamentGroup.findFirst({
      where: { id: dto.groupId, tournamentId },
      include: { groupTeams: { select: { registrationId: true } } },
    });
    if (!group) {
      throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: '해당 대회의 조를 찾을 수 없어요.' });
    }

    const existingFixtures = await this.prisma.v1TournamentFixture.findMany({
      where: { groupId: group.id },
      select: { id: true, game: { select: { currentOfficialRevisionId: true } } },
    });
    const fixturesWithResultCount = existingFixtures.filter(
      (fixture) => fixture.game?.currentOfficialRevisionId != null,
    ).length;

    assertLeagueGenerationAllowed({
      format: tournament.format,
      groupPhase: group.phase,
      teamCount: group.groupTeams.length,
      existingFixtureCount: existingFixtures.length,
      fixturesWithResultCount,
      minMatchesPerTeam: tournament.minMatchesPerTeam,
      legs: dto.legs,
      replaceExisting: dto.replaceExisting ?? false,
    });

    const rows = buildLeagueFixtureRows({
      groupId: group.id,
      groupName: group.name,
      registrationIds: group.groupTeams.map((team) => team.registrationId),
      legs: dto.legs,
      balanceHome: dto.balanceHome ?? true,
      schedule: dto.schedule
        ? { startsOn: new Date(dto.schedule.startsOn), template: dto.schedule.template }
        : null,
    });

    const deleted = await this.prisma.$transaction(async (tx) => {
      let removed = 0;
      if (dto.replaceExisting && existingFixtures.length > 0) {
        const result = await tx.v1TournamentFixture.deleteMany({ where: { groupId: group.id } });
        removed = result.count;
      }
      await tx.v1TournamentFixture.createMany({ data: rows });
      return removed;
    });

    const warnings: Array<{ code: string; message: string }> = [];
    if (!dto.schedule) {
      warnings.push({ code: 'SCHEDULE_NOT_SET', message: '경기 일시가 지정되지 않았어요.' });
    }
    if (group.groupTeams.length % 2 !== 0) {
      warnings.push({ code: 'ODD_TEAM_COUNT_BYE', message: '팀 수가 홀수라 라운드마다 한 팀이 쉬어요.' });
    }

    return {
      created: rows.length,
      deleted,
      perTeamMatches: matchesPerTeam(group.groupTeams.length, dto.legs),
      rounds: Math.max(...rows.map((row) => row.legNumber), 0) === 0 ? 0 : new Set(rows.map((r) => r.round)).size,
      warnings,
    };
  }
}
```

> `V1AdminContextService`·`PrismaService`·`V1AuthUser`의 정확한 import 경로는
> `tournament-bracket.service.ts` 상단을 그대로 복사해 맞춘다.
> `V1TournamentFixture`의 필수 컬럼(예: `status` 기본값)이 `createMany`에 빠지지 않았는지
> schema.prisma의 `model V1TournamentFixture`를 열어 확인한다.

- [ ] **Step 7: 컨트롤러에 엔드포인트를 추가한다**

`tournament-bracket.controller.ts`의 `@Post('admin/tournaments/:tournamentId/fixtures')` 근처에 추가:

```ts
  @Post('admin/tournaments/:tournamentId/league/fixtures/generate')
  generateLeagueFixtures(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: GenerateLeagueFixturesDto,
  ) {
    return this.leagueFixtureGenerator.generate(user, tournamentId, dto);
  }
```

생성자에 `private readonly leagueFixtureGenerator: LeagueFixtureGeneratorService`를 추가하고,
`tournaments.module.ts`의 `providers`에 `LeagueFixtureGeneratorService`를 등록한다.

- [ ] **Step 8: 타입 체크와 테스트를 돌린다**

Run: `cd apps/v1_api && npx tsc --noEmit && pnpm test -- league-fixture-generator`
Expected: tsc 에러 0건, 테스트 PASS

- [ ] **Step 9: 커밋한다**

```bash
git add apps/v1_api/src/tournaments/league-fixture-generator.service.ts \
        apps/v1_api/src/tournaments/league-fixture-generator.service.spec.ts \
        apps/v1_api/src/tournaments/dto/admin-league.dto.ts \
        apps/v1_api/src/tournaments/tournament-bracket.controller.ts \
        apps/v1_api/src/tournaments/tournaments.module.ts
git commit -m "feat(tournaments): 리그 대진 자동 생성 API 추가"
git show --stat HEAD
```

---

## Task 7: 리그 전용 차단 규칙

**Files:**
- Modify: `apps/v1_api/src/tournaments/tournament-bracket.service.ts` (`createGroup`, `updateGroup`)
- Test: `apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts` (기존 파일에 추가)

**Interfaces:**
- Consumes: 없음
- Produces: 리그 대회에서 knockout 그룹 생성·`advanceCount` 설정이 422로 거부됨

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`tournament-bracket.service.spec.ts`에 추가 (기존 파일의 mock/setup 패턴을 그대로 따른다):

```ts
describe('리그 대회 차단 규칙', () => {
  it('format=league인 대회에 knockout 조를 만들면 LEAGUE_KNOCKOUT_GROUP_FORBIDDEN으로 거부한다', async () => {
    // 기존 spec이 tournament mock을 만드는 방식을 그대로 쓰되 format을 'league'로 둔다
    await expect(
      service.createGroup(adminUser, leagueTournamentId, { name: '4강', phase: 'knockout', sortOrder: 1 }),
    ).rejects.toMatchObject({
      response: { code: 'LEAGUE_KNOCKOUT_GROUP_FORBIDDEN' },
    });
  });

  it('format=league인 대회에 advanceCount를 설정하면 LEAGUE_ADVANCE_COUNT_FORBIDDEN으로 거부한다', async () => {
    await expect(
      service.createGroup(adminUser, leagueTournamentId, { name: 'A조', phase: 'group', sortOrder: 1, advanceCount: 2 }),
    ).rejects.toMatchObject({
      response: { code: 'LEAGUE_ADVANCE_COUNT_FORBIDDEN' },
    });
  });

  it('format=group_knockout인 대회는 knockout 조를 그대로 만들 수 있다', async () => {
    await expect(
      service.createGroup(adminUser, groupKnockoutTournamentId, { name: '4강', phase: 'knockout', sortOrder: 1 }),
    ).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && pnpm test -- tournament-bracket.service.spec`
Expected: FAIL — 현재는 거부하지 않고 그대로 생성됨

- [ ] **Step 3: 차단 규칙을 구현한다**

`tournament-bracket.service.ts`에 헬퍼를 추가한다:

```ts
  /**
   * 리그 대회는 브래킷(토너먼트) 개념을 갖지 않는다.
   * 서버가 format을 실제로 읽어 막지 않으면 관리자 화면에서 실수로
   * 브래킷 액션을 눌렀을 때 데이터가 조용히 뒤섞인다.
   */
  private assertLeagueGroupShape(format: string, phase: string, advanceCount?: number | null) {
    if (format !== 'league') return;
    if (phase === 'knockout') {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_KNOCKOUT_GROUP_FORBIDDEN',
        message: '리그 대회에는 토너먼트 조를 만들 수 없어요.',
      });
    }
    if (advanceCount !== undefined && advanceCount !== null) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_ADVANCE_COUNT_FORBIDDEN',
        message: '리그 대회에는 진출 팀 수를 설정할 수 없어요.',
      });
    }
  }
```

`createGroup`과 `updateGroup`에서 대회를 로드한 직후 이 헬퍼를 호출한다.
`updateGroup`은 현재 `tournament`를 조회하지 않으므로(`670-673`행이 group만 조회),
`group.tournamentId`로 대회의 `format`을 함께 조회하도록 쿼리를 확장한다.

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && pnpm test -- tournament-bracket.service.spec`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add apps/v1_api/src/tournaments/tournament-bracket.service.ts \
        apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts
git commit -m "feat(tournaments): 리그 대회에서 브래킷 조·진출 설정 차단"
git show --stat HEAD
```

---

## Task 8: 통합 순위 공개 API + 진행률 + 매직넘버

**Files:**
- Create: `apps/v1_api/src/tournaments/league-progress.ts`
- Test: `apps/v1_api/src/tournaments/league-progress.spec.ts`
- Modify: `apps/v1_api/src/tournaments/tournaments-read.controller.ts`
- Modify: `apps/v1_api/src/tournaments/tournaments-read.service.ts`

**Interfaces:**
- Consumes: `V1TournamentOverallStanding`(Task 3), 순위 행 타입
- Produces:
  - `function leagueProgressOf(fixtures): { total, played, remaining, percent }`
  - `function magicNumberOf(standings, remainingByRegistration, winPoints): { registrationId, value, clinched } | null`
  - `GET /api/v1/tournaments/:tournamentId/standings/overall`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`apps/v1_api/src/tournaments/league-progress.spec.ts`:

```ts
import { leagueProgressOf, magicNumberOf } from './league-progress';

describe('leagueProgressOf', () => {
  it('확정된 경기 수로 진행률을 낸다', () => {
    expect(leagueProgressOf([{ hasResult: true }, { hasResult: true }, { hasResult: false }]))
      .toEqual({ total: 3, played: 2, remaining: 1, percent: 67 });
  });

  it('경기가 없으면 percent는 0이다', () => {
    expect(leagueProgressOf([])).toEqual({ total: 0, played: 0, remaining: 0, percent: 0 });
  });
});

describe('magicNumberOf', () => {
  const winPoints = 3;

  it('2위가 남은 경기를 다 이겨도 못 넘으면 우승이 확정된다', () => {
    const result = magicNumberOf(
      [{ registrationId: 'a', points: 20 }, { registrationId: 'b', points: 10 }],
      new Map([['a', 0], ['b', 2]]),
      winPoints,
    );
    expect(result).toEqual({ registrationId: 'a', value: 0, clinched: true });
  });

  it('아직 뒤집힐 수 있으면 필요한 승점을 알려준다', () => {
    const result = magicNumberOf(
      [{ registrationId: 'a', points: 12 }, { registrationId: 'b', points: 10 }],
      new Map([['a', 2], ['b', 2]]),
      winPoints,
    );
    // b 최대 = 10 + 6 = 16, a 현재 12 → 16 - 12 + 1 = 5
    expect(result).toEqual({ registrationId: 'a', value: 5, clinched: false });
  });

  it('팀이 2팀 미만이면 null을 반환한다', () => {
    expect(magicNumberOf([{ registrationId: 'a', points: 3 }], new Map(), winPoints)).toBeNull();
    expect(magicNumberOf([], new Map(), winPoints)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && pnpm test -- league-progress.spec`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

`apps/v1_api/src/tournaments/league-progress.ts`:

```ts
export interface LeagueProgress {
  total: number;
  played: number;
  remaining: number;
  /** 0~100 정수. 반올림한다. */
  percent: number;
}

export function leagueProgressOf(fixtures: ReadonlyArray<{ hasResult: boolean }>): LeagueProgress {
  const total = fixtures.length;
  const played = fixtures.filter((fixture) => fixture.hasResult).length;
  return {
    total,
    played,
    remaining: total - played,
    percent: total === 0 ? 0 : Math.round((played / total) * 100),
  };
}

export interface MagicNumber {
  registrationId: string;
  /** 우승 확정까지 필요한 승점. 0 이하이면 확정. */
  value: number;
  clinched: boolean;
}

/**
 * 1위가 우승을 확정하기까지 필요한 승점.
 *
 * 동점 시 tie-break로 갈리는 경우까지 엄밀히 반영하지 않고 +1 로 보수적으로 계산한다 —
 * "확정"이라고 표시했다가 뒤집히는 것보다 확정을 늦게 표시하는 쪽이 안전하다.
 */
export function magicNumberOf(
  standings: ReadonlyArray<{ registrationId: string; points: number }>,
  remainingByRegistration: ReadonlyMap<string, number>,
  winPoints: number,
): MagicNumber | null {
  if (standings.length < 2) return null;
  const [leader, runnerUp] = standings;
  const runnerUpMax = runnerUp.points + (remainingByRegistration.get(runnerUp.registrationId) ?? 0) * winPoints;
  const value = Math.max(runnerUpMax - leader.points + 1, 0);
  return { registrationId: leader.registrationId, value, clinched: value === 0 };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && pnpm test -- league-progress.spec`
Expected: PASS (5 tests)

- [ ] **Step 5: 공개 조회 엔드포인트를 추가한다**

`tournaments-read.controller.ts`에 추가:

```ts
  @Get(':tournamentId/standings/overall')
  getOverallStandings(@Param('tournamentId') tournamentId: string) {
    return this.tournamentsReadService.getOverallStandings(tournamentId);
  }
```

`tournaments-read.service.ts`에 `getOverallStandings`를 구현한다. 응답은 스펙 §6.2를 따른다:
- `v1TournamentOverallStanding`을 `position` 오름차순으로 조회하고 팀 표시명을 join한다
- 대회 전체 fixture로 `leagueProgressOf`를 계산한다
- 팀별 잔여 경기 수를 세어 `magicNumberOf`에 넘긴다
- **PII를 싣지 않는다** — 팀 표시명만. 선수 실명·연락처·생년월일은 포함하지 않는다

- [ ] **Step 6: 응답에 PII가 없는지 확인하는 테스트를 추가한다**

`tournaments-read.service.spec.ts`에 추가:

```ts
it('통합 순위 응답에 선수 개인정보가 포함되지 않는다', async () => {
  const result = await service.getOverallStandings(tournamentId);
  const serialized = JSON.stringify(result);
  expect(serialized).not.toContain('realName');
  expect(serialized).not.toContain('birthDate');
  expect(serialized).not.toContain('phone');
});
```

- [ ] **Step 7: 테스트와 타입 체크를 돌린다**

Run: `cd apps/v1_api && npx tsc --noEmit && pnpm test -- tournaments-read`
Expected: tsc 0건, PASS

- [ ] **Step 8: 커밋한다**

```bash
git add apps/v1_api/src/tournaments/league-progress.ts \
        apps/v1_api/src/tournaments/league-progress.spec.ts \
        apps/v1_api/src/tournaments/tournaments-read.controller.ts \
        apps/v1_api/src/tournaments/tournaments-read.service.ts \
        apps/v1_api/src/tournaments/tournaments-read.service.spec.ts
git commit -m "feat(tournaments): 통합 순위·진행률·매직넘버 공개 API 추가"
git show --stat HEAD
```

---

## Task 9: 조별↔통합 reconcile CLI

**Files:**
- Create: `apps/v1_api/src/tournaments/tournament-standings-reconcile.cli.ts`
- Test: `apps/v1_api/src/tournaments/tournament-standings-reconcile.spec.ts`

**Interfaces:**
- Consumes: `overallStandingsInput`(Task 5)
- Produces: `function findStandingsMismatches(groupStandings, overallStandings): Mismatch[]`

> 기존 `tournament-standings-recalculation.cli.ts`가 이 레포의 CLI 패턴이다. 그 파일을 열어
> 부트스트랩·인자 파싱·종료 코드 방식을 그대로 따른다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`apps/v1_api/src/tournaments/tournament-standings-reconcile.spec.ts`:

```ts
import { findStandingsMismatches } from './tournament-standings-reconcile.cli';

describe('findStandingsMismatches', () => {
  it('조별 합계와 통합이 일치하면 불일치가 없다', () => {
    const mismatches = findStandingsMismatches(
      [
        { registrationId: 'r1', points: 6, wins: 2, draws: 0, losses: 0, goalsFor: 5, goalsAgainst: 1 },
        { registrationId: 'r2', points: 0, wins: 0, draws: 0, losses: 2, goalsFor: 1, goalsAgainst: 5 },
      ],
      [
        { registrationId: 'r1', points: 6, wins: 2, draws: 0, losses: 0, goalsFor: 5, goalsAgainst: 1 },
        { registrationId: 'r2', points: 0, wins: 0, draws: 0, losses: 2, goalsFor: 1, goalsAgainst: 5 },
      ],
    );
    expect(mismatches).toEqual([]);
  });

  it('승점이 다르면 불일치로 잡는다', () => {
    const mismatches = findStandingsMismatches(
      [{ registrationId: 'r1', points: 6, wins: 2, draws: 0, losses: 0, goalsFor: 5, goalsAgainst: 1 }],
      [{ registrationId: 'r1', points: 3, wins: 2, draws: 0, losses: 0, goalsFor: 5, goalsAgainst: 1 }],
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({ registrationId: 'r1', field: 'points', groupValue: 6, overallValue: 3 });
  });

  it('통합에 행이 아예 없으면 불일치로 잡는다', () => {
    const mismatches = findStandingsMismatches(
      [{ registrationId: 'r1', points: 3, wins: 1, draws: 0, losses: 0, goalsFor: 2, goalsAgainst: 0 }],
      [],
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].field).toBe('missing');
  });

  it('조별에 없는 팀이 통합에 남아 있으면 불일치로 잡는다', () => {
    const mismatches = findStandingsMismatches(
      [],
      [{ registrationId: 'ghost', points: 3, wins: 1, draws: 0, losses: 0, goalsFor: 2, goalsAgainst: 0 }],
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].field).toBe('orphan');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && pnpm test -- tournament-standings-reconcile`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 대조 순수함수를 구현한다**

`apps/v1_api/src/tournaments/tournament-standings-reconcile.cli.ts`:

```ts
export interface StandingTotals {
  registrationId: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface StandingMismatch {
  registrationId: string;
  field: 'points' | 'wins' | 'draws' | 'losses' | 'goalsFor' | 'goalsAgainst' | 'missing' | 'orphan';
  groupValue: number | null;
  overallValue: number | null;
}

const COMPARED_FIELDS = ['points', 'wins', 'draws', 'losses', 'goalsFor', 'goalsAgainst'] as const;

/**
 * 조별 순위를 registrationId 단위로 합산한 값과 통합 순위 저장값을 대조한다.
 * 조별이 단일 진실 원천이므로 불일치 시 통합만 재계산한다.
 */
export function findStandingsMismatches(
  groupTotals: readonly StandingTotals[],
  overallRows: readonly StandingTotals[],
): StandingMismatch[] {
  const summed = new Map<string, StandingTotals>();
  for (const row of groupTotals) {
    const current = summed.get(row.registrationId);
    if (!current) {
      summed.set(row.registrationId, { ...row });
      continue;
    }
    for (const field of COMPARED_FIELDS) current[field] += row[field];
  }

  const overallByReg = new Map(overallRows.map((row) => [row.registrationId, row]));
  const mismatches: StandingMismatch[] = [];

  for (const [registrationId, expected] of summed) {
    const actual = overallByReg.get(registrationId);
    if (!actual) {
      mismatches.push({ registrationId, field: 'missing', groupValue: expected.points, overallValue: null });
      continue;
    }
    for (const field of COMPARED_FIELDS) {
      if (expected[field] !== actual[field]) {
        mismatches.push({ registrationId, field, groupValue: expected[field], overallValue: actual[field] });
      }
    }
  }

  for (const [registrationId, actual] of overallByReg) {
    if (!summed.has(registrationId)) {
      mismatches.push({ registrationId, field: 'orphan', groupValue: null, overallValue: actual.points });
    }
  }

  return mismatches;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && pnpm test -- tournament-standings-reconcile`
Expected: PASS (4 tests)

- [ ] **Step 5: CLI 진입점을 추가한다**

같은 파일 하단에, `tournament-standings-recalculation.cli.ts`의 부트스트랩 패턴을 그대로 따라
`--tournament-id <id>`와 `--fix` 인자를 받는 진입점을 작성한다. 동작:
- 대회의 모든 group-phase 조 standings를 읽어 합산
- 통합 standings를 읽어 `findStandingsMismatches`로 대조
- 불일치를 표로 출력하고, 불일치가 있으면 종료 코드 1
- `--fix`가 주어지면 `recalculateAndUpsertOverallStandings`를 호출해 통합만 다시 쓰고 종료 코드 0

- [ ] **Step 6: 커밋한다**

```bash
git add apps/v1_api/src/tournaments/tournament-standings-reconcile.cli.ts \
        apps/v1_api/src/tournaments/tournament-standings-reconcile.spec.ts
git commit -m "feat(tournaments): 조별-통합 순위 대조 CLI 추가"
git show --stat HEAD
```

> **PR 2 종료 지점.** PR을 열기 전에 `cd apps/v1_api && pnpm test && npx tsc --noEmit`를 한 번 돌린다.

---

# PR 3 — 프론트엔드

## Task 10: 프론트 라운드로빈 삭제 + 서버 API 연결

**Files:**
- Modify: `apps/v1_web/src/lib/tournament-bracket-gen.ts:12-34` (`roundRobinRounds` 삭제)
- Modify: `apps/v1_web/src/app/admin/tournaments/[id]/tournament-detail-client.tsx:1463-1485`
- Modify: `apps/v1_web/src/types/api.ts`
- Test: `apps/v1_web/src/lib/tournament-bracket-gen.test.ts` (기존 — 해당 테스트 삭제)

**Interfaces:**
- Consumes: `POST /admin/tournaments/:id/league/fixtures/generate` (Task 6)
- Produces: 조별리그 자동생성이 서버 API를 호출

- [ ] **Step 1: 응답 타입을 추가한다**

`apps/v1_web/src/types/api.ts`에 추가:

```ts
export interface V1GenerateLeagueFixturesResponse {
  created: number;
  deleted: number;
  perTeamMatches: number;
  rounds: number;
  warnings: Array<{ code: string; message: string }>;
}

export interface V1LeagueOverallStandingRow {
  registrationId: string;
  teamName: string;
  position: number | null;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  fairPlayPoints: number;
}

export interface V1LeagueOverallStandingsResponse {
  standings: V1LeagueOverallStandingRow[];
  progress: { total: number; played: number; remaining: number; percent: number };
  magicNumber: { registrationId: string; value: number; clinched: boolean } | null;
  recalculatedAt: string | null;
}
```

- [ ] **Step 2: 자동생성 핸들러를 서버 호출로 교체한다**

`tournament-detail-client.tsx:1463-1485`의 조별리그 분기에서
`roundRobinRounds(...)`로 페어를 만들어 fixture를 하나씩 POST하던 코드를 제거하고,
`POST /admin/tournaments/${tournamentId}/league/fixtures/generate`를 한 번 호출하도록 바꾼다.
요청 본문에 `groupId`, `legs`(아래 Step 3의 UI 값), `replaceExisting`을 담는다.

에러 처리는 이 파일이 이미 쓰는 방식을 따르고, 서버가 돌려주는 `code`별로 안내를 띄운다:
- `LEAGUE_FIXTURES_ALREADY_EXIST` → "이미 대진이 있어요. 교체할까요?" 확인 후 `replaceExisting: true`로 재호출
- `LEAGUE_MIN_MATCHES_NOT_MET` → 응답의 `requiredLegs`를 안내에 넣는다
- 그 외 → 서버 `message`를 그대로 노출

- [ ] **Step 3: 회전 수(legs) 선택 UI를 추가한다**

자동생성 버튼 옆에 1회전/2회전 선택을 둔다. 기존 폼 컨트롤 패턴과 토큰을 그대로 쓰고,
`<label htmlFor>` + `<select id>`를 연결하며 터치 타겟 `min-h-[44px]`를 지킨다.
색만으로 상태를 전달하지 않는다.

- [ ] **Step 4: `roundRobinRounds`를 삭제한다**

`apps/v1_web/src/lib/tournament-bracket-gen.ts`에서 `roundRobinRounds` 함수와 그 JSDoc을 삭제한다.
녹아웃 시드 페어링 함수는 **유지한다**.
`tournament-bracket-gen.test.ts`에서 `roundRobinRounds` 관련 describe 블록도 삭제한다.

- [ ] **Step 5: 삭제된 함수를 참조하는 곳이 없는지 확인한다**

Run: `cd apps/v1_web && grep -rn "roundRobinRounds" src/`
Expected: 0건. 남아 있으면 그 호출부도 서버 API로 옮긴다.

- [ ] **Step 6: 타입 체크와 테스트를 돌린다**

Run: `cd apps/v1_web && npx tsc --noEmit && pnpm test -- tournament-bracket-gen`
Expected: tsc 0건, PASS

- [ ] **Step 7: 커밋한다**

```bash
git add apps/v1_web/src/lib/tournament-bracket-gen.ts \
        apps/v1_web/src/lib/tournament-bracket-gen.test.ts \
        apps/v1_web/src/app/admin/tournaments/\[id\]/tournament-detail-client.tsx \
        apps/v1_web/src/types/api.ts
git commit -m "refactor(web): 조별리그 대진 생성을 서버 API로 이관"
git show --stat HEAD
```

---

## Task 11: 통합 순위표 컴포넌트

**Files:**
- Create: `apps/v1_web/src/components/tournaments/league-standings-table.tsx`
- Test: `apps/v1_web/src/components/tournaments/league-standings-table.test.tsx`
- Modify: `apps/v1_web/src/app/tournaments/[id]/tournament-detail-client.tsx`

**Interfaces:**
- Consumes: `V1LeagueOverallStandingsResponse` (Task 10)
- Produces: `<LeagueStandingsTable data={...} />`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`league-standings-table.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { LeagueStandingsTable } from './league-standings-table';

const baseData = {
  standings: [
    { registrationId: 'r1', teamName: '성수 블루웨이브', position: 1, points: 18, wins: 6, draws: 0, losses: 1, goalsFor: 22, goalsAgainst: 9, fairPlayPoints: 3 },
    { registrationId: 'r2', teamName: '강남 FC', position: 2, points: 12, wins: 4, draws: 0, losses: 3, goalsFor: 15, goalsAgainst: 14, fairPlayPoints: 5 },
  ],
  progress: { total: 30, played: 21, remaining: 9, percent: 70 },
  magicNumber: { registrationId: 'r1', value: 4, clinched: false },
  recalculatedAt: '2026-08-17T10:00:00.000Z',
};

describe('LeagueStandingsTable', () => {
  it('순위·팀명·승점을 표시한다', () => {
    render(<LeagueStandingsTable data={baseData} />);
    expect(screen.getByText('성수 블루웨이브')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
  });

  it('진행률을 숫자와 함께 보여준다(색만으로 전달하지 않는다)', () => {
    render(<LeagueStandingsTable data={baseData} />);
    expect(screen.getByText(/21\s*\/\s*30/)).toBeInTheDocument();
    expect(screen.getByText(/70%/)).toBeInTheDocument();
  });

  it('우승이 확정되면 확정 배지를 보여준다', () => {
    render(<LeagueStandingsTable data={{ ...baseData, magicNumber: { registrationId: 'r1', value: 0, clinched: true } }} />);
    expect(screen.getByText('우승 확정')).toBeInTheDocument();
  });

  it('아직 확정 전이면 매직넘버를 보여준다', () => {
    render(<LeagueStandingsTable data={baseData} />);
    expect(screen.getByText(/매직넘버 4/)).toBeInTheDocument();
  });

  it('순위가 비어 있으면 EmptyState를 보여준다', () => {
    render(<LeagueStandingsTable data={{ ...baseData, standings: [], progress: { total: 0, played: 0, remaining: 0, percent: 0 }, magicNumber: null }} />);
    expect(screen.getByText(/아직 순위가 없어요/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_web && pnpm test -- league-standings-table`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 컴포넌트를 구현한다**

`league-standings-table.tsx`를 작성한다. 요구사항:
- 기존 v1 디자인 토큰과 컴포넌트만 사용한다(하드코딩 색상 금지). `EmptyState`가 있으면 재사용한다
- 진행률은 막대 + **숫자 병기**(`21 / 30 · 70%`)
- `clinched`면 "우승 확정" 텍스트 배지, 아니면 "매직넘버 N"
- 다크모드 대응(`dark:` 클래스 누락은 Critical)
- 모바일 390px에서 가로 스크롤이 나지 않게 하고, 넘칠 수 있는 표는 자체 `overflow-x-auto` 컨테이너에 넣는다
- 터치 타겟 44px, 표 헤더에 `scope` 속성

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_web && pnpm test -- league-standings-table`
Expected: PASS (5 tests)

- [ ] **Step 5: 공개 대회 상세에 연결한다**

`apps/v1_web/src/app/tournaments/[id]/tournament-detail-client.tsx`의
`format === 'league'` 분기(1573행 근처)에서 통합 순위표를 렌더한다.
데이터는 `GET /tournaments/:id/standings/overall`로 가져온다.

- [ ] **Step 6: 타입 체크와 전체 웹 테스트를 돌린다**

Run: `cd apps/v1_web && npx tsc --noEmit && pnpm test`
Expected: tsc 0건, 기존 테스트 무회귀

- [ ] **Step 7: 커밋한다**

```bash
git add apps/v1_web/src/components/tournaments/league-standings-table.tsx \
        apps/v1_web/src/components/tournaments/league-standings-table.test.tsx \
        apps/v1_web/src/app/tournaments/\[id\]/tournament-detail-client.tsx
git commit -m "feat(web): 리그 통합 순위표·진행률·매직넘버 표시"
git show --stat HEAD
```

---

## Task 12: 최소 경기 수 입력 + alpha 시각 검증

**Files:**
- Modify: `apps/v1_web/src/app/admin/tournaments/new/page.tsx:589` 근처
- Modify: `apps/v1_api/src/tournaments/dto/admin-tournament.dto.ts` (`minMatchesPerTeam` 수용)
- Modify: `apps/v1_api/src/tournaments/tournaments-admin.service.ts:259,434` (저장)

**Interfaces:**
- Consumes: `V1Tournament.minMatchesPerTeam` (Task 3)
- Produces: 대회 생성/수정 시 최소 경기 수 저장

- [ ] **Step 1: DTO에 필드를 추가한다**

`admin-tournament.dto.ts`의 생성·수정 DTO 양쪽에 추가:

```ts
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  minMatchesPerTeam?: number;
```

- [ ] **Step 2: 서비스에서 저장한다**

`tournaments-admin.service.ts`의 create(259행 근처)와 update(434행 근처)에서
`minMatchesPerTeam: dto.minMatchesPerTeam ?? null`을 data에 포함한다.
(`??`를 쓴다 — `||`는 0을 falsy로 처리한다. 여기서는 `@Min(1)`이라 0이 오지 않지만 규약을 지킨다.)

- [ ] **Step 3: 생성 폼에 입력을 추가한다**

`admin/tournaments/new/page.tsx`에서 format이 `league`일 때만 노출되는 숫자 입력을 추가한다.
`<label htmlFor="minMatchesPerTeam">최소 경기 수</label>` + `<input id="minMatchesPerTeam" type="number" min={1}>`.
설명 문구: "각 팀이 최소 몇 경기를 보장받을지 정해요. 비워두면 검증하지 않아요."

- [ ] **Step 4: 타입 체크와 테스트를 돌린다**

Run: `cd apps/v1_api && npx tsc --noEmit && pnpm test -- tournaments-admin` 그리고 `cd apps/v1_web && npx tsc --noEmit`
Expected: tsc 0건, PASS

- [ ] **Step 5: 커밋한다**

```bash
git add apps/v1_api/src/tournaments/dto/admin-tournament.dto.ts \
        apps/v1_api/src/tournaments/tournaments-admin.service.ts \
        apps/v1_web/src/app/admin/tournaments/new/page.tsx
git commit -m "feat(tournaments): 리그 최소 경기 수 설정 추가"
git show --stat HEAD
```

- [ ] **Step 6: PR을 열고 dev 머지 후 alpha에서 시각 검증한다**

**로컬 next 서버로 검증하지 않는다.** dev 머지 = alpha 즉시 실배포이므로 alpha에서 확인한다.

배포 후 캡처할 화면 (📱390 / 📲768 / 🖥1440 3폭):
1. 리그 대회 공개 상세 — 통합 순위표 + 진행률 + 매직넘버
2. 어드민 대진 관리 — 회전 수 선택 + 자동생성 결과
3. 어드민 대회 생성 — 최소 경기 수 입력

캡처 스크립트는 `scripts/` 안에 둔다(`/tmp`는 모듈 해석에 실패한다).
갤러리를 PR 코멘트로 게시하고 raw URL이 200인지 확인한다.

> **이 저장소는 public이다.** PR 코멘트에 프로덕션 UUID·실제 대회명·엔드포인트를 넣지 않는다.
> 집계 수치와 스크린샷만 올린다.

---

## Self-Review 결과

**1. 스펙 커버리지**

| 스펙 요구 | 담당 태스크 |
|---|---|
| §4.1 통합 순위 테이블 | Task 3 |
| §4.2 minMatchesPerTeam | Task 3, 12 |
| §4.3 fairPlayPoints | Task 3, 4 |
| §5.1 공유 커널 | Task 1 |
| §5.2 시리즈 어댑터 | Task 2 |
| §5.4 프론트 roundRobinRounds 삭제 | Task 10 |
| §6.1 대진 생성 API | Task 6 |
| §6.1.1 replaceExisting | Task 6 |
| §6.2 통합 순위 조회 API | Task 8 |
| §6.3 리그 전용 차단 | Task 7 |
| §7.1 동일 트랜잭션 | Task 5 |
| §7.2 워터마크 | Task 3(`recalculatedAt`), Task 5 |
| §7.3 reconcile | Task 9 |
| §8.1 진행률 | Task 8 |
| §8.2 페어플레이 | Task 4 |
| §8.3 매직넘버 | Task 8 |
| §8.4 최소 경기 수 | Task 6(검증), Task 12(설정) |
| §9 프론트 화면 | Task 10, 11, 12 |
| §10 검증 전략 | 각 태스크의 테스트 스텝 + Task 12 Step 6 |
| §11 마이그레이션·drift gate | Task 3 |

**갭 없음.**

**2. 미해결 항목 (의도된 것)**

- Task 5 Step 5와 Task 9 Step 5는 기존 파일 구조를 읽고 맞춰야 하는 부분이라
  정확한 라인 대신 **지켜야 할 불변식**을 적었다. 구현자가 파일을 열어 확인한다.
- 스펙 §13의 미결(대진 startAt 기본 정책, 페어플레이 config화)은 이번 계획에서
  **둘 다 지원 / 하드코딩 상수**로 처리했다. config화는 후속 작업이다.

**3. 타입 일관성**

- `RoundRobinPairing`(Task 1) → `buildLeagueFixtureRows`(Task 6)에서 `pairing.round`/`pairing.leg` 사용 — 일치
- `StandingsSourceGroup`(기존) → `overallStandingsInput`(Task 5) 입력 — 일치
- `CalculatedStanding.fairPlayPoints`(기존 필드) → Task 4에서 입력으로 주입, Task 5에서 저장 — 일치
- `V1LeagueOverallStandingsResponse`(Task 10) → `LeagueStandingsTable`(Task 11) props — 일치
