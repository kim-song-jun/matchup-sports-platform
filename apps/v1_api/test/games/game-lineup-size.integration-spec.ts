import { HttpException } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Dedicated, minimal-fixture regression spec for
 * `GamesService.saveLineup` — the generic tournament-fixture lineup save
 * route (`PUT /games/:gameId/lineups/:sideId`), used by tournament
 * director/staff to enter a side's lineup. Before this change the route had
 * NO roster-size validation at all (unlike the parallel team-match path,
 * `team-match-lineup.service.ts#resolveEntries`, which already enforces
 * `LINEUP_SIZE_INVALID` against `V1CompetitionConfigVersion.lineup.{min,max}Players`) —
 * a director could save any number of starters regardless of what the
 * tournament's pinned competition config (and, since the admin-selectable
 * "출전 인원" feature, whatever the admin actually picked) allows.
 *
 * Reads `minPlayers`/`maxPlayers` off the DB-pinned `futsal-v1` config at run
 * time instead of hardcoding a number, mirroring
 * `test/team-matches/team-match-lineup-size.integration-spec.ts` — the
 * property under test is "the save path follows whatever is pinned", so a
 * hardcoded expectation here would defeat the point of the admin-selectable
 * lineup size feature this spec guards.
 */

const ids = {
  platformOpsUser: '6b000000-0000-4000-8000-000000000001',
  sport: '6b000000-0000-4000-8000-000000000010',
  region: '6b000000-0000-4000-8000-000000000011',
  hostTeam: '6b000000-0000-4000-8000-000000000020',
  opponentTeam: '6b000000-0000-4000-8000-000000000021',
  tournament: '6b000000-0000-4000-8000-000000000030',
  fixture: '6b000000-0000-4000-8000-000000000040',
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
    displayNameSnapshot: `Lineup size participant ${index + 1}`,
    jerseyNumber: index + 1,
    ...(index === 0 ? { position: 'GOLEIRO' } : {}),
    started: true,
  }));
}

describe('GamesService.saveLineup enforces the pinned competition config roster-size gate', () => {
  let pinnedMinPlayers: number;
  let pinnedMaxPlayers: number;
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
    const lineup = config.lineup as { minPlayers: number; maxPlayers: number };
    pinnedMinPlayers = lineup.minPlayers;
    pinnedMaxPlayers = lineup.maxPlayers;

    await prisma.v1User.create({
      data: {
        id: ids.platformOpsUser,
        email: 'game-lineup-size-platform-ops@example.test',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    // platform_ops (non-support admin) can act on any tournament-fixture
    // lineup without a per-tournament staff assignment row
    // (GamesService.resolveActor's `eligibleAdmin` branch) — keeps this
    // fixture minimal, matching the "guest-only, no membership rows" spirit
    // of the sibling team-match-lineup-size spec.
    await prisma.v1AdminUser.create({
      data: { userId: ids.platformOpsUser, adminRole: 'owner', status: 'active' },
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'futsal', name: 'Lineup size futsal' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'GAME_LINEUP_SIZE_REGION', name: 'Lineup size region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.platformOpsUser, sportId: ids.sport, regionId: ids.region, name: 'Lineup size host' },
        { id: ids.opponentTeam, ownerUserId: ids.platformOpsUser, sportId: ids.sport, regionId: ids.region, name: 'Lineup size opponent' },
      ],
    });
    await prisma.v1Tournament.create({
      data: {
        id: ids.tournament,
        sportId: ids.sport,
        title: 'Lineup size tournament',
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
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Lineup size host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Lineup size opponent' },
      ],
      participants: [],
    };
    const created = await prisma.$transaction((tx) =>
      games.createFromSourceInTransaction(tx, input, creationContext('game-lineup-size-source', input)),
    );
    gameId = created.gameId;
    hostSideId = (
      await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('accepts a roster exactly at the pinned maxPlayers and rejects one more, with the count in the error message', async () => {
    expect(pinnedMaxPlayers).toBeGreaterThan(0);

    const before = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    const saved = await games.saveLineup(authUser(ids.platformOpsUser), gameId, hostSideId, 'idem-game-lineup-size-at-cap', {
      expectedVersion: 0,
      clientCommandId: 'idem-game-lineup-size-at-cap',
      participants: starters(pinnedMaxPlayers),
    });
    expect(saved).toEqual(expect.objectContaining({ gameId, version: before.version + 1 }));
    expect(await prisma.v1GameParticipant.count({ where: { lineupId: saved.lineupId } })).toBe(pinnedMaxPlayers);

    const afterSave = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    const overCap = await captureFailure(() =>
      games.saveLineup(authUser(ids.platformOpsUser), gameId, hostSideId, 'idem-game-lineup-size-over-cap', {
        expectedVersion: saved.lineupRevision,
        clientCommandId: 'idem-game-lineup-size-over-cap',
        participants: starters(pinnedMaxPlayers + 1),
      }),
    );
    expectHttpCode(overCap, 422, 'LINEUP_SIZE_INVALID');
    expect((overCap as HttpException).getResponse()).toEqual(
      expect.objectContaining({ message: expect.stringContaining(`${pinnedMaxPlayers}명 이하`) }),
    );

    // The rejected attempt must not have created a new lineup revision.
    const afterRejection = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(afterRejection.version).toBe(afterSave.version);
  });

  it('requires exactly one starting goalkeeper using the sport-specific position code', async () => {
    const latestLineup = await prisma.v1GameLineup.findFirstOrThrow({
      where: { gameId, sideId: hostSideId },
      orderBy: { revision: 'desc' },
    });
    const noGoalkeeper = starters(pinnedMinPlayers).map((participant) => ({
      displayNameSnapshot: participant.displayNameSnapshot,
      jerseyNumber: participant.jerseyNumber,
      started: participant.started,
    }));
    const missing = await captureFailure(() =>
      games.saveLineup(authUser(ids.platformOpsUser), gameId, hostSideId, 'idem-game-lineup-gk-missing', {
        expectedVersion: latestLineup.revision,
        clientCommandId: 'idem-game-lineup-gk-missing',
        participants: noGoalkeeper,
      }),
    );
    expectHttpCode(missing, 422, 'LINEUP_GOALKEEPER_INVALID');

    const multipleGoalkeepers = starters(pinnedMinPlayers).map((participant, index) =>
      index === 1 ? { ...participant, position: 'GOLEIRO' } : participant,
    );
    const multiple = await captureFailure(() =>
      games.saveLineup(authUser(ids.platformOpsUser), gameId, hostSideId, 'idem-game-lineup-gk-multiple', {
        expectedVersion: latestLineup.revision,
        clientCommandId: 'idem-game-lineup-gk-multiple',
        participants: multipleGoalkeepers,
      }),
    );
    expectHttpCode(multiple, 422, 'LINEUP_GOALKEEPER_INVALID');
  });

  it('rejects a roster below the pinned minPlayers, with the count in the error message', async () => {
    expect(pinnedMinPlayers).toBeGreaterThan(0);
    const belowMinCount = pinnedMinPlayers - 1;

    const before = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    const latestLineup = await prisma.v1GameLineup.findFirstOrThrow({
      where: { gameId, sideId: hostSideId },
      orderBy: { revision: 'desc' },
    });
    const belowMin = await captureFailure(() =>
      games.saveLineup(authUser(ids.platformOpsUser), gameId, hostSideId, 'idem-game-lineup-size-below-min', {
        expectedVersion: latestLineup.revision,
        clientCommandId: 'idem-game-lineup-size-below-min',
        participants: starters(belowMinCount),
      }),
    );
    expectHttpCode(belowMin, 422, 'LINEUP_SIZE_INVALID');
    expect((belowMin as HttpException).getResponse()).toEqual(
      expect.objectContaining({ message: expect.stringContaining(`${pinnedMinPlayers}명 이상`) }),
    );

    const after = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(after.version).toBe(before.version);
  });
});
