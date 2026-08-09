import { HttpException } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TeamMatchLineupService } from '../../src/team-matches/team-match-lineup.service';

/**
 * Dedicated, minimal-fixture regression spec for the lineup roster-size gate
 * (`team-match-lineup.service.ts#resolveEntries` — `dto.starters.length`
 * against the pinned `V1CompetitionConfigVersion.lineup.{minPlayers,maxPlayers}`).
 *
 * Split out of `team-match-lineup.integration-spec.ts` on purpose: that file
 * is NOT in `jest.config.ts`'s `integration` project `testMatch` — it
 * predates a later Idempotency-Key-mandatory change and 6 of its 8 cases are
 * documented as pre-existing bit rot unrelated to lineup sizing (see the
 * comment above `test/team-matches/team-match-schedule-link.integration-spec.ts`'s
 * entry in jest.config.ts). Wildcarding that whole directory back into CI
 * would turn CI red for reasons this change didn't cause. This file exists
 * so the futsal maxPlayers 5->6 fix (and any future lineup-cap change) still
 * gets real CI coverage without resurrecting that unrelated bit rot.
 *
 * Reads `maxPlayers` off the DB-pinned `futsal-v1` config at run time instead
 * of hardcoding a number — the property under test is "the save path follows
 * whatever is pinned", so hardcoding the current value here would make this
 * spec exactly the kind of shadow-hardcoded-cap this fix was about removing.
 * All starters are unlinked guests (no `userId`) — `resolveEntry` skips team
 * membership/attendance checks for guests, so the fixture needs no
 * V1TeamMembership/V1TeamSchedule/V1ScheduleAttendance rows, only enough to
 * satisfy `loadContext`'s owner/manager permission check for the caller.
 */

const ids = {
  hostOwner: '6a000000-0000-4000-8000-000000000001',
  opponentOwner: '6a000000-0000-4000-8000-000000000002',
  sport: '6a000000-0000-4000-8000-000000000010',
  region: '6a000000-0000-4000-8000-000000000011',
  hostTeam: '6a000000-0000-4000-8000-000000000020',
  opponentTeam: '6a000000-0000-4000-8000-000000000021',
  teamMatch: '6a000000-0000-4000-8000-000000000030',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const service = new TeamMatchLineupService(prisma, new OperationAuditWriterService());

const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function creationContext(commandId: string, payload: unknown): GameCommandContext {
  return {
    actor: { actorType: 'USER', actorUserId: ids.hostOwner, role: 'team_owner' },
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

function guestStarter(index: number, goalkeeper = false) {
  return { displayName: `Lineup size guest ${index}`, jerseyNumber: index, goalkeeper };
}

describe('team-match lineup roster-size gate follows the pinned competition config', () => {
  let pinnedMaxPlayers: number;

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
    const lineup = config.lineup as { maxPlayers: number };
    pinnedMaxPlayers = lineup.maxPlayers;

    await prisma.v1User.createMany({
      data: [ids.hostOwner, ids.opponentOwner].map((id, index) => ({
        id,
        email: `lineup-size-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'futsal', name: 'Lineup size futsal' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'LINEUP_SIZE_REGION', name: 'Lineup size region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.hostOwner, sportId: ids.sport, regionId: ids.region, name: 'Lineup size host' },
        { id: ids.opponentTeam, ownerUserId: ids.opponentOwner, sportId: ids.sport, regionId: ids.region, name: 'Lineup size opponent' },
      ],
    });
    await prisma.v1TeamMembership.create({
      data: { teamId: ids.hostTeam, userId: ids.hostOwner, role: 'owner', status: 'active' },
    });

    const startAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.teamMatch,
        hostTeamId: ids.hostTeam,
        createdByUserId: ids.hostOwner,
        sportId: ids.sport,
        regionId: ids.region,
        title: 'Lineup size fixture match',
        placeName: 'Lineup size futsal court',
        startAt,
        approvedApplicantTeamId: ids.opponentTeam,
        competitionConfigVersionId: config.id,
      },
    });
    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: ids.teamMatch,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Lineup size host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Lineup size opponent' },
      ],
      participants: [],
    };
    await prisma.$transaction((tx) =>
      games.createFromSourceInTransaction(tx, input, creationContext('lineup-size-source', input)),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('accepts a roster exactly at the pinned maxPlayers and rejects one more, with the count in the error message', async () => {
    expect(pinnedMaxPlayers).toBeGreaterThan(0);

    const atCap = Array.from({ length: pinnedMaxPlayers }, (_, index) =>
      guestStarter(index + 1, index === 0),
    );
    // GamesService.createFromSourceInTransaction() already creates an empty
    // revision-1 V1GameLineup per side as part of game/side creation (see
    // games.service.ts's `sides` loop) — the CAS token to save against is
    // whatever getLineup() reports *now*, not 0.
    const startVersion = (await service.getLineup(authUser(ids.hostOwner), ids.teamMatch)).version;
    const saved = await service.saveLineup(authUser(ids.hostOwner), ids.teamMatch, 'idem-lineup-size-at-cap', {
      expectedVersion: startVersion,
      starters: atCap,
      bench: [],
    });
    expect(saved).toEqual(
      expect.objectContaining({ teamMatchId: ids.teamMatch, state: 'DRAFT', version: startVersion + 1 }),
    );
    const atCapView = await service.getLineup(authUser(ids.hostOwner), ids.teamMatch);
    expect(atCapView.starters).toHaveLength(pinnedMaxPlayers);

    const overCap = [...atCap, guestStarter(pinnedMaxPlayers + 1)];
    const tooMany = await captureFailure(() =>
      service.saveLineup(authUser(ids.hostOwner), ids.teamMatch, 'idem-lineup-size-over-cap', {
        expectedVersion: saved.version,
        starters: overCap,
        bench: [],
      }),
    );
    expectHttpCode(tooMany, 422, 'LINEUP_SIZE_INVALID');
    expect((tooMany as HttpException).getResponse()).toEqual(
      expect.objectContaining({ message: expect.stringContaining(`${pinnedMaxPlayers}명 이하`) }),
    );

    // The rejected attempt must not have created a new revision beyond the at-cap save.
    const afterRejection = await service.getLineup(authUser(ids.hostOwner), ids.teamMatch);
    expect(afterRejection.version).toBe(saved.version);
  });
});
