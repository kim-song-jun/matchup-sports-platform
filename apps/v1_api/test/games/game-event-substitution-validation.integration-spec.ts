import { HttpException } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { createHash } from 'node:crypto';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import { FOOTBALL_V1_CONFIG } from '../../src/tournaments/competition-config/competition-config.presets';
import type { GameActorScope, GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Live-substitution addition — proves the wiring `assertEventReferences` →
 * `assertSubstitution` (pure `validateSubstitution` in `core/substitution.ts`)
 * actually reaches a real DB, not just that the pure function's own logic is
 * correct (already covered by `core/substitution.spec.ts`'s unit tests). This
 * is the integration surface Copilot flagged missing on a prior PR — real
 * DB queries, real HTTP status codes, and the position-inheritance side
 * effect that only `appendEvent`'s transaction performs.
 *
 * Uses a dedicated (sportCode, name) config lineage with `maxSubstitutions:
 * 1` — cheap to exhaust the cap without needing 5+ bench players like
 * football-v1's real preset.
 */

const ids = {
  operator: '66000000-0000-4000-8000-000000000001',
  sport: '66000000-0000-4000-8000-000000000010',
  region: '66000000-0000-4000-8000-000000000011',
  hostTeam: '66000000-0000-4000-8000-000000000020',
  awayTeam: '66000000-0000-4000-8000-000000000021',
  tournament: '66000000-0000-4000-8000-000000000030',
  fixture: '66000000-0000-4000-8000-000000000031',
  assignment: '66000000-0000-4000-8000-000000000040',
  config: '66000000-0000-4000-8000-000000000050',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@task-substitution.example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function context(actor: GameActorScope, commandId: string, payload: unknown): GameCommandContext {
  return { actor, expectedVersion: 0, durableCommandId: commandId, payloadHash: canonicalGameCommandPayloadHash(payload) };
}

async function captureFailure(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to fail');
}

function expectHttpCode(error: unknown, status: number, code: string) {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse()).toEqual(expect.objectContaining({ code }));
}

describe('POST /games/:gameId/events — SUBSTITUTION (live-substitution)', () => {
  let gameId: string;
  let homeSideId: string;
  let awaySideId: string;
  let homeStarter1Id: string;
  let homeStarter2Id: string;
  let homeBench1Id: string;
  let homeBench2Id: string;
  let awayStarterId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    await prisma.$connect();

    // maxSubstitutions: 1 — cheap to exhaust the cap with a 2-bench-player fixture.
    const lowCapConfig = {
      ...FOOTBALL_V1_CONFIG,
      lineup: { ...FOOTBALL_V1_CONFIG.lineup, maxSubstitutions: 1 },
    };
    const contentHash = createHash('sha256').update(JSON.stringify(lowCapConfig)).digest('hex');
    const config = await prisma.v1CompetitionConfigVersion.create({
      data: {
        id: ids.config,
        sportCode: 'football',
        name: 'football-v1-substitution-test',
        version: 1,
        status: 'ACTIVE',
        periods: lowCapConfig.periods,
        events: lowCapConfig.events,
        lineup: lowCapConfig.lineup,
        result: lowCapConfig.result,
        tieBreak: lowCapConfig.tieBreak,
        visibility: lowCapConfig.visibility,
        contentHash,
      },
    });

    await prisma.v1User.create({ data: { id: ids.operator, email: 'task-substitution-operator@example.test', accountStatus: 'active', onboardingStatus: 'completed' } });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'football-substitution', name: 'Task Substitution Football' } });
    await prisma.v1Region.create({ data: { id: ids.region, code: 'TASK_SUB_REGION', name: 'Task Substitution Region', level: 1 } });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.operator, sportId: ids.sport, regionId: ids.region, name: 'Substitution Host' },
        { id: ids.awayTeam, ownerUserId: ids.operator, sportId: ids.sport, regionId: ids.region, name: 'Substitution Away' },
      ],
    });
    await prisma.v1Tournament.create({ data: { id: ids.tournament, sportId: ids.sport, title: 'Task Substitution Tournament', competitionConfigVersionId: config.id } });
    await prisma.v1TournamentFixture.create({ data: { id: ids.fixture, tournamentId: ids.tournament, round: 'group', fixtureNumber: 1, competitionConfigVersionId: config.id } });
    await prisma.v1TournamentStaffAssignment.create({
      data: { id: ids.assignment, tournamentId: ids.tournament, userId: ids.operator, role: 'TOURNAMENT_DIRECTOR', grantedByUserId: ids.operator },
    });
    await prisma.v1GameOperationFlag.upsert({
      where: { key: 'PUBLIC_LIVE' },
      create: { key: 'PUBLIC_LIVE', value: 'off', ownerActor: 'platform_ops' },
      update: {},
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixture,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Substitution Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: 'Substitution Away' },
      ],
      participants: [
        { sourceParticipantId: 'home-starter-1', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Home Starter 1' },
        { sourceParticipantId: 'home-starter-2', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Home Starter 2' },
        { sourceParticipantId: 'home-bench-1', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Home Bench 1' },
        { sourceParticipantId: 'home-bench-2', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Home Bench 2' },
        { sourceParticipantId: 'away-starter', sideKey: V1GameSideKey.AWAY, displayNameSnapshot: 'Away Starter' },
      ],
    };
    const actor: GameActorScope = { actorType: 'USER', actorUserId: ids.operator, role: 'field_operator', tournamentId: ids.tournament, fixtureId: ids.fixture };
    const created = await prisma.$transaction((tx) => service.createFromSourceInTransaction(tx, input, context(actor, 'substitution-source-create', input)));
    gameId = created.gameId;

    const persisted = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, include: { sides: true, participants: true } });
    homeSideId = persisted.sides.find((s) => s.sideKey === 'HOME')!.id;
    awaySideId = persisted.sides.find((s) => s.sideKey === 'AWAY')!.id;
    homeStarter1Id = persisted.participants.find((p) => p.displayNameSnapshot === 'Home Starter 1')!.id;
    homeStarter2Id = persisted.participants.find((p) => p.displayNameSnapshot === 'Home Starter 2')!.id;
    homeBench1Id = persisted.participants.find((p) => p.displayNameSnapshot === 'Home Bench 1')!.id;
    homeBench2Id = persisted.participants.find((p) => p.displayNameSnapshot === 'Home Bench 2')!.id;
    awayStarterId = persisted.participants.find((p) => p.displayNameSnapshot === 'Away Starter')!.id;

    // 라이브 콘솔의 실제 라인업 저장 경로가 아니라 테스트 픽스처 셋업이다 —
    // "누가 선발/후보인가"만 필요하므로 saveLineup(다른 레인이 동시 작업 중)을
    // 거치지 않고 직접 세팅한다. Bench 2는 started=false로 남긴다(교체 IN 후보로
    // 계속 쓴다).
    await prisma.v1GameParticipant.updateMany({
      where: { id: { in: [homeBench1Id, homeBench2Id] } },
      data: { started: false },
    });
    await prisma.v1GameParticipant.update({
      where: { id: homeStarter1Id },
      data: { position: 'FW', positionX: 50, positionY: 80 },
    });

    const startToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'substitution-client', lastSequence: 0 })).takeoverToken;
    await service.executeCommand(authUser(ids.operator), gameId, 'start', 'substitution-start', {
      expectedVersion: 0,
      clientCommandId: 'substitution-start',
      takeoverToken: startToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function freshToken(seed: string) {
    return (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: seed, lastSequence: 0 })).takeoverToken;
  }

  it('rejects an outgoing participant who is not on the pitch', async () => {
    const token = await freshToken('sub-out-not-on-pitch');
    const failure = await captureFailure(() =>
      service.appendEvent(authUser(ids.operator), gameId, 'sub-out-not-on-pitch', {
        expectedVersion: 1,
        clientEventId: 'sub-out-not-on-pitch',
        takeoverToken: token,
        type: 'SUBSTITUTION' as never,
        sideId: homeSideId,
        participantId: homeBench1Id, // bench player as the "in" target
        period: 1,
        clockMs: 1000,
        occurredAt: new Date().toISOString(),
        payload: { outParticipantId: homeBench2Id }, // also bench — never on the pitch
      }),
    );
    expectHttpCode(failure, 422, 'SUBSTITUTION_OUT_NOT_ON_PITCH');
  });

  it('rejects an incoming participant who is already on the pitch', async () => {
    const token = await freshToken('sub-in-already-on-pitch');
    const failure = await captureFailure(() =>
      service.appendEvent(authUser(ids.operator), gameId, 'sub-in-already-on-pitch', {
        expectedVersion: 1,
        clientEventId: 'sub-in-already-on-pitch',
        takeoverToken: token,
        type: 'SUBSTITUTION' as never,
        sideId: homeSideId,
        participantId: homeStarter2Id, // already on the pitch
        period: 1,
        clockMs: 1000,
        occurredAt: new Date().toISOString(),
        payload: { outParticipantId: homeStarter1Id },
      }),
    );
    expectHttpCode(failure, 422, 'SUBSTITUTION_IN_ALREADY_ON_PITCH');
  });

  it('rejects a cross-side substitution', async () => {
    const token = await freshToken('sub-cross-side');
    const failure = await captureFailure(() =>
      service.appendEvent(authUser(ids.operator), gameId, 'sub-cross-side', {
        expectedVersion: 1,
        clientEventId: 'sub-cross-side',
        takeoverToken: token,
        type: 'SUBSTITUTION' as never,
        sideId: homeSideId,
        participantId: homeBench1Id,
        period: 1,
        clockMs: 1000,
        occurredAt: new Date().toISOString(),
        payload: { outParticipantId: awayStarterId }, // wrong side
      }),
    );
    expectHttpCode(failure, 422, 'PARTICIPANT_SIDE_MISMATCH');
  });

  it('accepts a valid substitution, persists IN/OUT, and copies the outgoing pitch placement onto the incoming participant', async () => {
    const token = await freshToken('sub-valid');
    const appended = await service.appendEvent(authUser(ids.operator), gameId, 'sub-valid', {
      expectedVersion: 1,
      clientEventId: 'sub-valid',
      takeoverToken: token,
      type: 'SUBSTITUTION' as never,
      sideId: homeSideId,
      participantId: homeBench1Id,
      period: 1,
      clockMs: 1000,
      occurredAt: new Date().toISOString(),
      payload: { outParticipantId: homeStarter1Id },
    });

    const stored = await prisma.v1GameEvent.findUniqueOrThrow({ where: { gameId_sequence: { gameId, sequence: appended.sequence } } });
    expect(stored.participantId).toBe(homeBench1Id);
    expect((stored.payload as { outParticipantId: string }).outParticipantId).toBe(homeStarter1Id);

    const incoming = await prisma.v1GameParticipant.findUniqueOrThrow({ where: { id: homeBench1Id } });
    expect(incoming.position).toBe('FW');
    expect(incoming.positionX).toBe(50);
    expect(incoming.positionY).toBe(80);
  });

  it('enforces the configured substitution cap once it is reached (maxSubstitutions: 1 in this fixture)', async () => {
    // The previous test already used the side's one allowed substitution
    // (home-bench-1 IN / home-starter-1 OUT). A second one for the same
    // side must now be rejected purely on the cap, using otherwise-valid
    // participants (home-starter-2 OUT is genuinely on the pitch, home-
    // bench-2 IN is genuinely on the bench).
    const token = await freshToken('sub-limit-reached');
    const failure = await captureFailure(() =>
      service.appendEvent(authUser(ids.operator), gameId, 'sub-limit-reached', {
        expectedVersion: 2,
        clientEventId: 'sub-limit-reached',
        takeoverToken: token,
        type: 'SUBSTITUTION' as never,
        sideId: homeSideId,
        participantId: homeBench2Id,
        period: 1,
        clockMs: 2000,
        occurredAt: new Date().toISOString(),
        payload: { outParticipantId: homeStarter2Id },
      }),
    );
    expectHttpCode(failure, 422, 'SUBSTITUTION_LIMIT_REACHED');
  });

  it('reversing a SUBSTITUTION restores the prior on-pitch state, so the same swap is valid again', async () => {
    // Reverse the sub-valid event (home-bench-1 IN / home-starter-1 OUT) —
    // home-starter-1 should be back on the pitch and home-bench-1 back on
    // the bench, so submitting the EXACT same substitution again must
    // succeed (this also proves the cap counter itself excludes reversed
    // events — the reversed sub no longer counts toward the side's total,
    // so this does not hit SUBSTITUTION_LIMIT_REACHED even though the
    // side's earlier attempt just did).
    const reverseToken = await freshToken('sub-reverse');
    const eventsResult = await prisma.v1GameEvent.findFirst({
      where: { gameId, clientEventId: 'sub-valid' },
    });
    await service.reverseEvent(authUser(ids.operator), gameId, eventsResult!.id, 'sub-reverse', {
      expectedVersion: 2,
      clientEventId: 'sub-reverse',
      takeoverToken: reverseToken,
      reason: 'test rollback',
    });

    const retryToken = await freshToken('sub-valid-again');
    const appended = await service.appendEvent(authUser(ids.operator), gameId, 'sub-valid-again', {
      expectedVersion: 3,
      clientEventId: 'sub-valid-again',
      takeoverToken: retryToken,
      type: 'SUBSTITUTION' as never,
      sideId: homeSideId,
      participantId: homeBench1Id,
      period: 1,
      clockMs: 3000,
      occurredAt: new Date().toISOString(),
      payload: { outParticipantId: homeStarter1Id },
    });
    expect(appended.sequence).toBeGreaterThan(0);
  });
});
