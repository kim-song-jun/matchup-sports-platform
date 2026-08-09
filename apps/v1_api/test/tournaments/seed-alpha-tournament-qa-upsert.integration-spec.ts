import { V1TournamentStatus } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  createScenario,
  ensureTeamRoster,
  type PersonaSeed,
  type TeamSeed,
} from '../../prisma/seed-alpha-tournament-qa';
import { runCompetitionConfigContractPhaseBackfill } from '../../src/tournaments/competition-config/competition-config-backfill';

/**
 * Part 2 (delete→upsert 근본 해소): the alpha QA seed no longer deletes the fixed
 * scenario tournaments/fixtures before recreating them. `createScenario` now upserts
 * the tournament (by id) + group + fixtures (by natural key) — never deleting them —
 * and delete-recreates only the leaf rows (registrations, standings, results, videos,
 * awards, reviews, sponsor, announcement, campaign), none of which any append-only
 * trigger or Restrict FK references.
 *
 * That structurally removes the 2026-08-09 deploy deadlock: an append-only
 * `v1_operation_audits` row (or a V1Game) that pins a tournament/fixture used to make
 * the old delete-based reset fail with P2003 and skip that tournament, leaving it stale
 * every deploy. This suite proves, against a real Postgres database, that:
 *   1. re-seeding the same scenario twice is idempotent — no duplicate tournament /
 *      group / fixture / registration rows,
 *   2. an append-only operation_audit row referencing the tournament + fixture does NOT
 *      block the reseed (upsert never deletes them) and both the audit row and the
 *      tournament survive untouched (same row, not delete+recreate),
 *   3. a V1Game attached to a fixture survives the reseed with a stable fixture id —
 *      the exact Restrict FK (`v1_games_tournament_fixture_id_fkey`) that broke the old
 *      delete path.
 */

const id = (suffix: string) => `6a000000-0000-4000-8000-${suffix}`;

const ids = {
  sport: id('000000000001'),
  region: id('000000000002'),
  tournament: id('000000000010'),
  pinnedGame: id('000000000020'),
} as const;

const personas: readonly PersonaSeed[] = [
  { id: id('000000000101'), email: 'p2.upsert.a@example.test', phone: '01099000001', nickname: 'P2A', realName: '홍길A', gender: 'male' },
  { id: id('000000000102'), email: 'p2.upsert.b@example.test', phone: '01099000002', nickname: 'P2B', realName: '홍길B', gender: 'female' },
  { id: id('000000000103'), email: 'p2.upsert.c@example.test', phone: '01099000003', nickname: 'P2C', realName: '홍길C', gender: 'male' },
  { id: id('000000000104'), email: 'p2.upsert.d@example.test', phone: '01099000004', nickname: 'P2D', realName: '홍길D', gender: 'female' },
];

const teamSeeds: readonly TeamSeed[] = [
  { id: id('000000000201'), name: 'P2 Upsert FC A' },
  { id: id('000000000202'), name: 'P2 Upsert FC B' },
  { id: id('000000000203'), name: 'P2 Upsert FC C' },
  { id: id('000000000204'), name: 'P2 Upsert FC D' },
];

// A 'completed' scenario exercises the full path in one shot: 4 confirmed
// registrations, one group with standings + group-team rows, 3 group fixtures + 4
// knockout fixtures (semi x2 / final / third_place) with results, plus videos, awards,
// reviews and a sponsor.
const scenario = {
  id: ids.tournament,
  slug: 'p2-upsert-completed',
  title: '(테스트) Part 2 upsert 검증 컵',
  status: V1TournamentStatus.completed,
  startsInDays: -7,
  entryFee: 100_000,
  promoPriority: 10,
  hasCampaign: true,
} as const;

const EXPECTED_FIXTURES = 7; // 3 group + 4 knockout
const EXPECTED_REGISTRATIONS = 4;

const prisma = new PrismaService();
let configId: string;

async function seedScenarioOnce(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const teams = await ensureTeamRoster(
      tx,
      ids.sport,
      ids.region,
      personas,
      teamSeeds,
      'Part 2 upsert 검증용 가상 사용자입니다.',
      'Part 2 upsert 검증용 가상 팀입니다.',
    );
    // adminUserId=null is a supported path (main() passes admin?.id ?? null), so this
    // suite needs no V1AdminUser fixture.
    await createScenario(tx, scenario, ids.sport, teams, null, new Date(), configId);
  });
}

async function countScenarioRows() {
  const [tournaments, groups, fixtures, registrations] = await Promise.all([
    prisma.v1Tournament.count({ where: { id: ids.tournament } }),
    prisma.v1TournamentGroup.count({ where: { tournamentId: ids.tournament } }),
    prisma.v1TournamentFixture.count({ where: { tournamentId: ids.tournament } }),
    prisma.v1TournamentRegistration.count({ where: { tournamentId: ids.tournament } }),
  ]);
  return { tournaments, groups, fixtures, registrations };
}

describe('alpha QA seed — Part 2 delete→upsert idempotency & append-only survival', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for this integration suite');
    }
    await prisma.$connect();
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'p2-upsert-sport', name: 'P2 Upsert Sport' } });
    await prisma.v1Region.create({ data: { id: ids.region, code: 'P2_UPSERT_REGION', name: 'P2 Upsert Region', level: 1 } });
    configId = await loadFootballConfigId();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('re-seeding the same scenario twice is idempotent — no duplicate tournament / group / fixture / registration rows', async () => {
    await seedScenarioOnce();
    const afterFirst = await countScenarioRows();
    expect(afterFirst).toEqual({
      tournaments: 1,
      groups: 1,
      fixtures: EXPECTED_FIXTURES,
      registrations: EXPECTED_REGISTRATIONS,
    });

    await seedScenarioOnce();
    const afterSecond = await countScenarioRows();
    // The second run upserts the skeleton and delete-recreates the leaves, so the
    // counts are identical — nothing duplicated.
    expect(afterSecond).toEqual(afterFirst);
  });

  it('re-seeds through an append-only operation_audit that pins the tournament + fixture (the 2026-08-09 deadlock) — never deletes them, audit survives', async () => {
    const fixture = await prisma.v1TournamentFixture.findFirstOrThrow({
      where: { tournamentId: ids.tournament },
      select: { id: true },
    });
    // INSERT is always allowed (the append-only trigger only blocks DELETE/UPDATE), so
    // this reproduces the exact undeletable state that broke the delete-based reset.
    await prisma.v1OperationAudit.create({
      data: {
        actorType: 'SYSTEM',
        systemActor: 'p2-upsert-test',
        action: 'GAME_RESULT_OFFICIAL',
        resourceType: 'game',
        resourceId: 'p2-upsert-audit-resource',
        requestId: 'p2-upsert-audit-request',
        tournamentId: ids.tournament,
        fixtureId: fixture.id,
      },
    });
    const before = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: ids.tournament }, select: { id: true, createdAt: true } });

    // The old delete-based reset threw P2003 here and skipped this tournament; the
    // upsert path must simply succeed.
    await expect(seedScenarioOnce()).resolves.not.toThrow();

    const auditCount = await prisma.v1OperationAudit.count({ where: { tournamentId: ids.tournament } });
    expect(auditCount).toBeGreaterThanOrEqual(1); // the append-only row is never touched

    const after = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: ids.tournament }, select: { id: true, createdAt: true } });
    expect(after.id).toBe(before.id);
    // Same createdAt proves the row was UPDATED in place (upsert), not delete+recreate.
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
    expect(await countScenarioRows()).toEqual({
      tournaments: 1,
      groups: 1,
      fixtures: EXPECTED_FIXTURES,
      registrations: EXPECTED_REGISTRATIONS,
    });
  });

  it('re-seeds without deleting a V1Game attached to a fixture (the Restrict FK that broke the delete path) and keeps the fixture id stable', async () => {
    const fixture = await prisma.v1TournamentFixture.findFirstOrThrow({
      where: { tournamentId: ids.tournament, round: 'group', fixtureNumber: 1 },
      select: { id: true },
    });
    await prisma.v1Game.create({
      data: {
        id: ids.pinnedGame,
        sourceType: 'TOURNAMENT_FIXTURE',
        tournamentFixtureId: fixture.id,
        competitionConfigVersionId: configId,
        state: 'SCHEDULED',
      },
    });

    await expect(seedScenarioOnce()).resolves.not.toThrow();

    const game = await prisma.v1Game.findUnique({ where: { id: ids.pinnedGame }, select: { id: true, tournamentFixtureId: true } });
    expect(game).not.toBeNull();
    const fixtureAfter = await prisma.v1TournamentFixture.findFirstOrThrow({
      where: { tournamentId: ids.tournament, round: 'group', fixtureNumber: 1 },
      select: { id: true },
    });
    // Fixture is upserted by its natural key, not recreated, so its id — and the Game's
    // FK to it — stays valid across the reseed.
    expect(fixtureAfter.id).toBe(fixture.id);
    expect(game?.tournamentFixtureId).toBe(fixture.id);
  });
});

async function loadFootballConfigId(): Promise<string> {
  // Seeds the canonical football-v1 ACTIVE config row if absent — idempotent, mirrors
  // what the CI migration gate and an alpha deploy both do.
  await runCompetitionConfigContractPhaseBackfill(prisma);
  const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
    where: { name: 'football-v1', status: 'ACTIVE' },
    orderBy: { version: 'desc' },
  });
  return config.id;
}
