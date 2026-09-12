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
 * scenario tournaments/matches before recreating them. `createScenario` now upserts
 * the tournament (by id) + group + canonical match details (by natural key) — never
 * deleting them — and preserves registrations, games, results, and append-only history.
 *
 * That structurally removes the 2026-08-09 deploy deadlock: an append-only
 * `v1_operation_audits` row (or a V1Game) that pins a tournament/TeamMatch used to make
 * the old delete-based reset fail with P2003 and skip that tournament, leaving it stale
 * every deploy. This suite proves, against a real Postgres database, that:
 *   1. re-seeding the same scenario twice is idempotent — no duplicate tournament /
 *      group / match / registration rows,
 *   2. an append-only operation_audit row referencing the tournament + TeamMatch does NOT
 *      block the reseed (upsert never deletes them) and both the audit row and the
 *      tournament survive untouched (same row, not delete+recreate),
 *   3. a canonical V1Game attached to a TeamMatch survives the reseed with stable
 *      state, revision, and TeamMatch identity.
 */

const id = (suffix: string) => `6a000000-0000-4000-8000-${suffix}`;

const ids = {
  sport: id('000000000001'),
  region: id('000000000002'),
  tournament: id('000000000010'),
  operatorVideo: id('000000000030'),
  identityRevokeRequest: id('000000000040'),
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

async function seedScenarioOnce(seedNow = new Date()): Promise<void> {
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
    await createScenario(tx, scenario, ids.sport, teams, null, seedNow, configId);
  });
}

async function countScenarioRows() {
  const [tournaments, groups, fixtures, registrations] = await Promise.all([
    prisma.v1Tournament.count({ where: { id: ids.tournament } }),
    prisma.v1TournamentGroup.count({ where: { tournamentId: ids.tournament } }),
    prisma.v1TournamentMatchDetails.count({ where: { tournamentId: ids.tournament } }),
    prisma.v1TournamentRegistration.count({ where: { tournamentId: ids.tournament } }),
  ]);
  return { tournaments, groups, fixtures, registrations };
}

async function snapshotOperationalRows() {
  const [tournament, matches, registrations] = await Promise.all([
    prisma.v1Tournament.findUniqueOrThrow({
      where: { id: ids.tournament },
      select: { id: true, scheduledAt: true, scheduledEndAt: true, registrationDeadlineAt: true },
    }),
    prisma.v1TournamentMatchDetails.findMany({
      where: { tournamentId: ids.tournament },
      orderBy: [{ round: 'asc' }, { fixtureNumber: 'asc' }],
      select: {
        teamMatchId: true,
        teamMatch: {
          select: {
            startAt: true,
            status: true,
            videos: { orderBy: { id: 'asc' }, select: { id: true, title: true, url: true, sortOrder: true } },
            game: {
              select: {
                id: true,
                state: true,
                version: true,
                currentOfficialRevisionId: true,
                sides: { orderBy: { sideKey: 'asc' }, select: { id: true, sideKey: true, teamId: true, displayNameSnapshot: true } },
                participants: { orderBy: { id: 'asc' }, select: { id: true, sideId: true, lineupId: true, userId: true, displayNameSnapshot: true, jerseyNumber: true } },
                events: { orderBy: { id: 'asc' }, select: { id: true, clientEventId: true, sequence: true } },
                resultRevisions: { orderBy: { revision: 'asc' }, select: { id: true, revision: true, state: true, eventsHash: true } },
              },
            },
          },
        },
      },
    }),
    prisma.v1TournamentRegistration.findMany({
      where: { tournamentId: ids.tournament },
      orderBy: { teamId: 'asc' },
      select: { id: true, teamId: true, players: { select: { id: true, userId: true } }, payment: { select: { id: true } } },
    }),
  ]);
  return { tournament, matches, registrations };
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
    await seedScenarioOnce(new Date('2026-08-01T09:00:00.000Z'));
    const afterFirst = await countScenarioRows();
    const initialSnapshot = await snapshotOperationalRows();
    const operatorTeamMatchId = initialSnapshot.matches[0]?.teamMatchId;
    if (!operatorTeamMatchId) throw new Error('Expected a canonical TeamMatch for operator-video preservation.');
    await prisma.v1TeamMatchVideo.create({
      data: { id: ids.operatorVideo, teamMatchId: operatorTeamMatchId, title: 'Operator upload', url: 'https://example.test/operator.mp4', sortOrder: 99 },
    });
    const operatorMatch = await prisma.v1TournamentMatchDetails.findUniqueOrThrow({
      where: { teamMatchId: operatorTeamMatchId },
      select: { teamMatchId: true, teamMatch: { select: { game: { select: { id: true, sides: { select: { id: true } }, participants: { select: { id: true } } } } } } },
    });
    const operatorGame = operatorMatch.teamMatch.game;
    const operatorSide = operatorGame?.sides[0];
    const operatorParticipant = operatorGame?.participants[0];
    if (!operatorGame || !operatorSide || !operatorParticipant) throw new Error('Expected canonical Game snapshots for preservation.');
    await prisma.v1GameSide.update({ where: { id: operatorSide.id }, data: { displayNameSnapshot: 'Operator renamed side' } });
    await prisma.v1GameParticipant.update({ where: { id: operatorParticipant.id }, data: { jerseyNumber: 99 } });
    const currentIdentity = await prisma.v1ParticipantIdentityLinkCurrent.findUnique({ where: { participantId: operatorParticipant.id } });
    if (!currentIdentity) throw new Error('Expected a current identity before revocation preservation check.');
    await prisma.v1ParticipantIdentityLinkCurrent.delete({ where: { participantId: operatorParticipant.id } });
    await prisma.v1ParticipantIdentityLinkEvent.create({
      data: {
        participantId: operatorParticipant.id,
        linkId: currentIdentity.linkId,
        eventVersion: currentIdentity.version + 1,
        requestId: ids.identityRevokeRequest,
        action: 'REVOKED',
        userId: currentIdentity.userId,
        actorType: 'SYSTEM',
        systemActor: 'p2-upsert-test',
        reason: 'operator preservation regression',
      },
    });
    const operationalBefore = await snapshotOperationalRows();
    expect(afterFirst).toEqual({
      tournaments: 1,
      groups: 1,
      fixtures: EXPECTED_FIXTURES,
      registrations: EXPECTED_REGISTRATIONS,
    });

    await seedScenarioOnce(new Date('2026-09-01T09:00:00.000Z'));
    const afterSecond = await countScenarioRows();
    const operationalAfter = await snapshotOperationalRows();
    // The second run preserves canonical rows and registration identities.
    expect(afterSecond).toEqual(afterFirst);
    expect(operationalAfter).toEqual(operationalBefore);
    expect(await prisma.v1ParticipantIdentityLinkCurrent.findUnique({ where: { participantId: operatorParticipant.id } })).toBeNull();
    expect(await prisma.v1ParticipantIdentityLinkEvent.findFirst({ where: { participantId: operatorParticipant.id, action: 'REVOKED' } })).not.toBeNull();
  });

  it('re-seeds through an append-only operation_audit that pins the tournament + TeamMatch — never deletes them, audit survives', async () => {
    const fixture = await prisma.v1TournamentMatchDetails.findFirstOrThrow({
      where: { tournamentId: ids.tournament },
      select: { teamMatchId: true },
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
        teamMatchId: fixture.teamMatchId,
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

  it('re-seeds without changing an official canonical Game or TeamMatch identity', async () => {
    const fixture = await prisma.v1TournamentMatchDetails.findFirstOrThrow({
      where: { tournamentId: ids.tournament, round: 'group', fixtureNumber: 1 },
      select: { teamMatchId: true },
    });
    const before = await prisma.v1Game.findUniqueOrThrow({
      where: { teamMatchId: fixture.teamMatchId },
      select: { id: true, state: true, currentOfficialRevisionId: true, version: true },
    });

    await expect(seedScenarioOnce()).resolves.not.toThrow();

    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: before.id }, select: { id: true, state: true, currentOfficialRevisionId: true, version: true } });
    const fixtureAfter = await prisma.v1TournamentMatchDetails.findFirstOrThrow({
      where: { tournamentId: ids.tournament, round: 'group', fixtureNumber: 1 },
      select: { teamMatchId: true },
    });
    expect(fixtureAfter.teamMatchId).toBe(fixture.teamMatchId);
    expect(game).toEqual(before);
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
