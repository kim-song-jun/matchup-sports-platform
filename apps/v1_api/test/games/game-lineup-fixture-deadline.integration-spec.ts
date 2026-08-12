import { HttpException } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Issue #378 — `GamesService.saveLineup`'s tournament-fixture route
 * (`PUT /games/:gameId/lineups/:sideId`) had no deadline gate at all: a
 * caller could overwrite a fixture's lineup (DRAFT or SUBMITTED) after
 * kickoff, even though the frontend hid the save UI once the lineup was
 * SUBMITTED. This is a minimal-fixture regression spec (mirrors
 * `game-lineup-size.integration-spec.ts`'s harness) for the new
 * `LINEUP_DEADLINE_PASSED` gate, matching the sibling team-match path's gate
 * of the same name (`team-match-lineup.service.ts#saveLineup`).
 */

const ids = {
  platformOpsUser: '6b000000-0000-4000-8000-000000000101',
  sport: '6b000000-0000-4000-8000-000000000110',
  region: '6b000000-0000-4000-8000-000000000111',
  hostTeam: '6b000000-0000-4000-8000-000000000120',
  opponentTeam: '6b000000-0000-4000-8000-000000000121',
  tournament: '6b000000-0000-4000-8000-000000000130',
  fixture: '6b000000-0000-4000-8000-000000000140',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function creationContext(commandId: string, payload: unknown): GameCommandContext {
  return {
    actor: { actorType: 'USER', actorUserId: ids.platformOpsUser, role: 'platform_ops' },
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

async function captureFailure(operation: () => Promise<unknown>) {
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

function starters(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    displayNameSnapshot: `Fixture deadline participant ${index + 1}`,
    jerseyNumber: index + 1,
    started: true,
  }));
}

describe('GamesService.saveLineup rejects tournament-fixture saves once the game has started (#378)', () => {
  let minPlayers: number;
  let gameId: string;
  let hostSideId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for this integration verification');
    }
    await prisma.$connect();

    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('futsal-v1 competition config preset is required (run competition-config-backfill.cli.ts)');
    }
    minPlayers = (config.lineup as { minPlayers: number }).minPlayers;

    await prisma.v1User.create({
      data: {
        id: ids.platformOpsUser,
        email: 'game-lineup-fixture-deadline-platform-ops@example.test',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    await prisma.v1AdminUser.create({
      data: { userId: ids.platformOpsUser, adminRole: 'owner', status: 'active' },
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'futsal', name: 'Lineup deadline futsal' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'GAME_LINEUP_DEADLINE_REGION', name: 'Lineup deadline region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.platformOpsUser, sportId: ids.sport, regionId: ids.region, name: 'Lineup deadline host' },
        { id: ids.opponentTeam, ownerUserId: ids.platformOpsUser, sportId: ids.sport, regionId: ids.region, name: 'Lineup deadline opponent' },
      ],
    });
    await prisma.v1Tournament.create({
      data: {
        id: ids.tournament,
        sportId: ids.sport,
        title: 'Lineup deadline tournament',
        competitionConfigVersionId: config.id,
      },
    });
    await prisma.v1TournamentFixture.create({
      data: {
        id: ids.fixture,
        tournamentId: ids.tournament,
        round: 'group',
        fixtureNumber: 1,
        competitionConfigVersionId: config.id,
      },
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixture,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Lineup deadline host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Lineup deadline opponent' },
      ],
      participants: [],
    };
    const created = await prisma.$transaction((tx) =>
      games.createFromSourceInTransaction(tx, input, creationContext('game-lineup-deadline-source', input)),
    );
    gameId = created.gameId;
    hostSideId = (
      await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows the normal pre-kickoff flow: an initial save and a re-save both succeed while SCHEDULED', async () => {
    const before = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(before.state).toBe('SCHEDULED');

    const firstSave = await games.saveLineup(authUser(ids.platformOpsUser), gameId, hostSideId, 'idem-fixture-deadline-first-save', {
      expectedVersion: before.version,
      clientCommandId: 'idem-fixture-deadline-first-save',
      participants: starters(minPlayers),
    });
    expect(firstSave).toEqual(expect.objectContaining({ gameId, version: before.version + 1 }));

    // Re-saving (the "다시 편집하기" flow, whether the prior lineup was DRAFT
    // or SUBMITTED — saveLineup itself never inspects lineup.state) must still
    // go through as long as the game hasn't started yet.
    const afterFirstSave = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    const resave = await games.saveLineup(authUser(ids.platformOpsUser), gameId, hostSideId, 'idem-fixture-deadline-resave', {
      expectedVersion: afterFirstSave.version,
      clientCommandId: 'idem-fixture-deadline-resave',
      participants: starters(minPlayers),
    });
    expect(resave).toEqual(expect.objectContaining({ gameId, version: afterFirstSave.version + 1 }));
  });

  it('rejects saveLineup once the game has left SCHEDULED, with the same LINEUP_DEADLINE_PASSED code the team-match path uses', async () => {
    await prisma.v1GamePeriod.updateMany({ where: { gameId, number: 1 }, data: { state: 'LIVE', startedAt: new Date() } });
    await prisma.v1Game.update({ where: { id: gameId }, data: { state: 'LIVE' } });

    const live = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    const rejectedLive = await captureFailure(() =>
      games.saveLineup(authUser(ids.platformOpsUser), gameId, hostSideId, 'idem-fixture-deadline-live-reject', {
        expectedVersion: live.version,
        clientCommandId: 'idem-fixture-deadline-live-reject',
        participants: starters(minPlayers),
      }),
    );
    expectHttpCode(rejectedLive, 409, 'LINEUP_DEADLINE_PASSED');
    // The rejected attempt must not have created a new lineup revision.
    const afterLiveRejection = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(afterLiveRejection.version).toBe(live.version);

    // CANCELLED must also stay rejected: a cancelled fixture has no upcoming
    // kickoff to prepare a roster for, so there is nothing left to save.
    await prisma.v1Game.update({ where: { id: gameId }, data: { state: 'CANCELLED' } });
    const cancelled = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    const rejectedCancelled = await captureFailure(() =>
      games.saveLineup(authUser(ids.platformOpsUser), gameId, hostSideId, 'idem-fixture-deadline-cancelled-reject', {
        expectedVersion: cancelled.version,
        clientCommandId: 'idem-fixture-deadline-cancelled-reject',
        participants: starters(minPlayers),
      }),
    );
    expectHttpCode(rejectedCancelled, 409, 'LINEUP_DEADLINE_PASSED');
  });
});
