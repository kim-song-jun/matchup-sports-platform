import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type { GameActorScope, GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

const ids = {
  operator: '66000000-0000-4000-8000-000000000001',
  sport: '66000000-0000-4000-8000-000000000010',
  region: '66000000-0000-4000-8000-000000000011',
  hostTeam: '66000000-0000-4000-8000-000000000020',
  awayTeam: '66000000-0000-4000-8000-000000000021',
  tournament: '66000000-0000-4000-8000-000000000030',
  fixture: '66000000-0000-4000-8000-000000000031',
  assignment: '66000000-0000-4000-8000-000000000040',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const authUser = (id: string) => ({ id, email: `${id}@task-record.example.test`, accountStatus: 'active' as const, onboardingStatus: 'completed' as const });

function context(actor: GameActorScope, commandId: string, payload: unknown): GameCommandContext {
  return { actor, expectedVersion: 0, durableCommandId: commandId, payloadHash: canonicalGameCommandPayloadHash(payload) };
}

describe('deriveTournamentRevision — assist/foul aggregation (T1-4)', () => {
  let gameId: string;
  let homeSideId: string;
  let scorerId: string;
  let assisterId: string;
  let foulerId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({ where: { name: 'football-v1', status: 'ACTIVE' }, orderBy: { version: 'desc' } });
    await prisma.v1User.create({ data: { id: ids.operator, email: 'task-record-operator@example.test', accountStatus: 'active', onboardingStatus: 'completed' } });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'football-record', name: 'Task Record Football' } });
    await prisma.v1Region.create({ data: { id: ids.region, code: 'TASK_RECORD_REGION', name: 'Task Record Region', level: 1 } });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.operator, sportId: ids.sport, regionId: ids.region, name: 'Record Host' },
        { id: ids.awayTeam, ownerUserId: ids.operator, sportId: ids.sport, regionId: ids.region, name: 'Record Away' },
      ],
    });
    await prisma.v1Tournament.create({ data: { id: ids.tournament, sportId: ids.sport, title: 'Task Record Tournament', competitionConfigVersionId: config.id } });
    await prisma.v1TournamentFixture.create({ data: { id: ids.fixture, tournamentId: ids.tournament, round: 'group', fixtureNumber: 1, competitionConfigVersionId: config.id } });
    await prisma.v1TournamentStaffAssignment.create({ data: { id: ids.assignment, tournamentId: ids.tournament, userId: ids.operator, role: 'TOURNAMENT_DIRECTOR', grantedByUserId: ids.operator } });
    await prisma.v1GameOperationFlag.upsert({ where: { key: 'PUBLIC_LIVE' }, create: { key: 'PUBLIC_LIVE', value: 'off', ownerActor: 'platform_ops' }, update: {} });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixture,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Record Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: 'Record Away' },
      ],
      participants: [
        { sourceParticipantId: 'record-scorer', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Scorer' },
        { sourceParticipantId: 'record-assister', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Assister' },
        { sourceParticipantId: 'record-fouler', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Fouler' },
      ],
    };
    const actor: GameActorScope = { actorType: 'USER', actorUserId: ids.operator, role: 'field_operator', tournamentId: ids.tournament, fixtureId: ids.fixture };
    const created = await prisma.$transaction((tx) => service.createFromSourceInTransaction(tx, input, context(actor, 'record-source-create', input)));
    gameId = created.gameId;
    const persisted = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, include: { sides: true, participants: true } });
    homeSideId = persisted.sides.find((s) => s.sideKey === 'HOME')!.id;
    scorerId = persisted.participants.find((p) => p.displayNameSnapshot === 'Scorer')!.id;
    assisterId = persisted.participants.find((p) => p.displayNameSnapshot === 'Assister')!.id;
    foulerId = persisted.participants.find((p) => p.displayNameSnapshot === 'Fouler')!.id;

    // GamesService.assertLineupsSubmittedForStart requires a SUBMITTED/LOCKED
    // lineup on every side before `start` is allowed. createFromSourceInTransaction
    // already creates a DRAFT revision-1 lineup per side at game creation, so
    // flip those straight to SUBMITTED (bypassing
    // GamesService.saveLineup/submitLineup, which would consume `version`).
    await prisma.v1GameLineup.updateMany({
      where: { gameId, revision: 1 },
      data: { state: 'SUBMITTED' },
    });
    const startToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'record-client', lastSequence: 0 })).takeoverToken;
    await service.executeCommand(authUser(ids.operator), gameId, 'start', 'record-start', {
      expectedVersion: 0, clientCommandId: 'record-start', takeoverToken: startToken, occurredAt: new Date().toISOString(), payload: {},
    });

    const goalToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'record-goal-client', lastSequence: 0 })).takeoverToken;
    await service.appendEvent(authUser(ids.operator), gameId, 'record-goal', {
      expectedVersion: 1, clientEventId: 'record-goal', takeoverToken: goalToken,
      type: 'GOAL' as never, sideId: homeSideId, participantId: scorerId, assistParticipantId: assisterId,
      period: 1, clockMs: 1000, occurredAt: new Date().toISOString(), payload: {},
    });
    const foulToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'record-foul-client', lastSequence: 0 })).takeoverToken;
    await service.appendEvent(authUser(ids.operator), gameId, 'record-foul', {
      expectedVersion: 2, clientEventId: 'record-foul', takeoverToken: foulToken,
      type: 'FOUL' as never, sideId: homeSideId, participantId: foulerId,
      period: 1, clockMs: 2000, occurredAt: new Date().toISOString(), payload: {},
    });
    const endToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'record-end-client', lastSequence: 0 })).takeoverToken;
    await service.executeCommand(authUser(ids.operator), gameId, 'end', 'record-end', {
      expectedVersion: 3, clientCommandId: 'record-end', takeoverToken: endToken, occurredAt: new Date().toISOString(), payload: {},
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('credits the assist to the assisting participant, not the scorer, and counts the individual foul', async () => {
    const revision = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId }, orderBy: { revision: 'desc' } });
    const rows = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: revision.id } });
    const byParticipant = new Map(rows.map((row) => [row.participantId, row]));

    expect(byParticipant.get(scorerId)).toEqual(expect.objectContaining({ goals: 1, assists: 0, fouls: 0 }));
    expect(byParticipant.get(assisterId)).toEqual(expect.objectContaining({ goals: 0, assists: 1, fouls: 0 }));
    expect(byParticipant.get(foulerId)).toEqual(expect.objectContaining({ goals: 0, assists: 0, fouls: 1 }));
  });
});
