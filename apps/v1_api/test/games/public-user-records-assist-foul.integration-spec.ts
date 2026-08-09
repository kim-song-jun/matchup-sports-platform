import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type { GameActorScope, GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PublicUserRecordsService } from '../../src/games/public-records/public-user-records.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const ids = {
  operator: '67000000-0000-4000-8000-000000000001',
  targetUser: '67000000-0000-4000-8000-000000000002',
  sport: '67000000-0000-4000-8000-000000000010',
  region: '67000000-0000-4000-8000-000000000011',
  hostTeam: '67000000-0000-4000-8000-000000000020',
  awayTeam: '67000000-0000-4000-8000-000000000021',
  tournament: '67000000-0000-4000-8000-000000000030',
  fixture: '67000000-0000-4000-8000-000000000031',
  assignment: '67000000-0000-4000-8000-000000000040',
  linkId: '67000000-0000-4000-8000-000000000050',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const userRecords = new PublicUserRecordsService(prisma);
const authUser = (id: string) => ({ id, email: `${id}@task-summary.example.test`, accountStatus: 'active' as const, onboardingStatus: 'completed' as const });

function context(actor: GameActorScope, commandId: string, payload: unknown): GameCommandContext {
  return { actor, expectedVersion: 0, durableCommandId: commandId, payloadHash: canonicalGameCommandPayloadHash(payload) };
}

describe('PublicUserRecordsService.getRecords — assist/foul summary (T1-4)', () => {
  let participantId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({ where: { name: 'football-v1', status: 'ACTIVE' }, orderBy: { version: 'desc' } });
    await prisma.v1User.createMany({
      data: [
        { id: ids.operator, email: 'task-summary-operator@example.test', accountStatus: 'active', onboardingStatus: 'completed' },
        { id: ids.targetUser, email: 'task-summary-target@example.test', accountStatus: 'active', onboardingStatus: 'completed' },
      ],
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'football-summary', name: 'Task Summary Football' } });
    await prisma.v1Region.create({ data: { id: ids.region, code: 'TASK_SUMMARY_REGION', name: 'Task Summary Region', level: 1 } });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.operator, sportId: ids.sport, regionId: ids.region, name: 'Summary Host' },
        { id: ids.awayTeam, ownerUserId: ids.operator, sportId: ids.sport, regionId: ids.region, name: 'Summary Away' },
      ],
    });
    await prisma.v1Tournament.create({ data: { id: ids.tournament, sportId: ids.sport, title: 'Task Summary Tournament', competitionConfigVersionId: config.id } });
    await prisma.v1TournamentFixture.create({ data: { id: ids.fixture, tournamentId: ids.tournament, round: 'group', fixtureNumber: 1, competitionConfigVersionId: config.id } });
    await prisma.v1TournamentStaffAssignment.create({ data: { id: ids.assignment, tournamentId: ids.tournament, userId: ids.operator, role: 'TOURNAMENT_DIRECTOR', grantedByUserId: ids.operator } });
    await prisma.v1GameOperationFlag.upsert({ where: { key: 'PUBLIC_LIVE' }, create: { key: 'PUBLIC_LIVE', value: 'off', ownerActor: 'platform_ops' }, update: {} });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixture,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Summary Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: 'Summary Away' },
      ],
      participants: [{ sourceParticipantId: 'summary-player', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Player' }],
    };
    const actor: GameActorScope = { actorType: 'USER', actorUserId: ids.operator, role: 'field_operator', tournamentId: ids.tournament, fixtureId: ids.fixture };
    const created = await prisma.$transaction((tx) => games.createFromSourceInTransaction(tx, input, context(actor, 'summary-source-create', input)));
    const gameId = created.gameId;
    const persisted = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, include: { sides: true, participants: true } });
    const homeSideId = persisted.sides.find((s) => s.sideKey === 'HOME')!.id;
    participantId = persisted.participants[0].id;

    const officialAt = new Date('2026-08-01T00:00:00.000Z');
    const revision = await prisma.v1GameResultRevision.create({
      data: {
        gameId, revision: 1, state: 'DRAFT', score: { home: 0, away: 0 }, eventsHash: 'summary-events-hash',
        createdByActorType: 'USER', createdByUserId: ids.operator,
      },
    });
    await prisma.v1GameResultParticipant.create({
      data: {
        resultRevisionId: revision.id, participantId, sideId: homeSideId, started: true,
        goals: 0, assists: 2, fouls: 3, cards: { yellow: 0, red: 0 }, goalkeeper: false,
      },
    });
    // v1_guard_result_participant_mutation requires the revision to still be
    // DRAFT while its participant rows are inserted; flip it to OFFICIAL only
    // after that insert (the terminal-mutation trigger permits this DRAFT ->
    // OFFICIAL transition since OLD.state is not yet terminal).
    await prisma.v1GameResultRevision.update({
      where: { id: revision.id },
      data: { state: 'OFFICIAL', officialAt },
    });
    await prisma.v1Game.update({ where: { id: gameId }, data: { currentOfficialRevisionId: revision.id } });

    await prisma.v1ParticipantIdentityLinkCurrent.create({
      data: { participantId, linkId: ids.linkId, userId: ids.targetUser, version: 1, effectiveFrom: officialAt },
    });
    await prisma.v1ParticipantConsentSnapshot.create({
      data: { participantId, linkId: ids.linkId, consentVersion: 1, state: 'GRANTED', effectiveAt: officialAt, policyHash: 'summary-policy-hash', actorUserId: ids.targetUser },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rolls up assists and fouls into the summary', async () => {
    const records = await userRecords.getRecords(ids.targetUser, {});
    expect(records.summary).toEqual(
      expect.objectContaining({ appearances: 1, goals: 0, assists: 2, fouls: 3 }),
    );
  });
});
