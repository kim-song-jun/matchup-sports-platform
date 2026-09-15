import { HttpException } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TeamMatchLineupService } from '../../src/team-matches/team-match-lineup.service';

/**
 * Task 14 blocker fix: the generic per-side lineup endpoints
 * (`PUT /games/:gameId/lineups/:sideId`, `POST /games/:gameId/lineups/:lineupId/submit`)
 * enforce none of Task 14's lineup invariants (duplicate jersey, goalkeeper
 * count, roster size, membership/attendance eligibility, deadline) and were
 * therefore a bypass around the validated `/team-matches/:teamMatchId/lineup`
 * path for TEAM_MATCH-sourced games. This spec proves the generic routes now
 * refuse TEAM_MATCH-sourced games outright with `409
 * TEAM_MATCH_GENERIC_LINEUP_FORBIDDEN` instead of quietly accepting an
 * invariant-violating payload.
 *
 * On revert of that fix, the first `it` below would actually persist a new
 * lineup with two players sharing jersey number 1 (and the second would
 * flip a real DRAFT to SUBMITTED) - proving the bypass is real, not merely a
 * documentation gap.
 *
 * Row-count baseline note: `GamesService.createFromSourceInTransaction`
 * unconditionally seeds one empty (0-participant) revision-1 `v1GameLineup`
 * per side at game creation - this is real production behavior (see
 * `TeamMatchesService.teamMatchGameSourceInput`, which always creates the AWAY
 * side with zero participants until an opponent is approved), not a test
 * artifact. So a freshly created game already has 2 lineup rows before any
 * save/submit call runs; the assertions below compare against that baseline
 * rather than assuming a fresh game starts at 0.
 */

const ids = {
  hostUser: '6a000000-0000-4000-8000-000000000001',
  opponentUser: '6a000000-0000-4000-8000-000000000002',
  sport: '6a000000-0000-4000-8000-000000000010',
  region: '6a000000-0000-4000-8000-000000000011',
  hostTeam: '6a000000-0000-4000-8000-000000000020',
  opponentTeam: '6a000000-0000-4000-8000-000000000021',
  teamMatch: '6a000000-0000-4000-8000-000000000030',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const lineups = new TeamMatchLineupService(prisma, new OperationAuditWriterService());

const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function creationContext(commandId: string, payload: unknown): GameCommandContext {
  return {
    actor: { actorType: 'USER', actorUserId: ids.hostUser, role: 'team_owner' },
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

describe('Task 14 generic Game lineup routes refuse TEAM_MATCH-sourced games', () => {
  let configId: string;
  let gameId: string;
  let hostSideId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for Task 14 integration verification');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('Task 11 futsal-v1 preset is required');
    }
    configId = config.id;

    await prisma.v1User.createMany({
      data: [ids.hostUser, ids.opponentUser].map((id, index) => ({
        id,
        email: `task14-lineup-bypass-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1Sport.create({
      data: { id: ids.sport, code: 'futsal', name: 'Task 14 Lineup Bypass Futsal' },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK14_LINEUP_BYPASS_REGION', name: 'Task 14 Lineup Bypass Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.hostUser, sportId: ids.sport, regionId: ids.region, name: 'Task 14 Bypass Host' },
        { id: ids.opponentTeam, ownerUserId: ids.opponentUser, sportId: ids.sport, regionId: ids.region, name: 'Task 14 Bypass Opponent' },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.hostTeam, userId: ids.hostUser, role: 'owner', status: 'active' },
        { teamId: ids.opponentTeam, userId: ids.opponentUser, role: 'owner', status: 'active' },
      ],
    });
    const futureStartAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.teamMatch,
        hostTeamId: ids.hostTeam,
        createdByUserId: ids.hostUser,
        sportId: ids.sport,
        regionId: ids.region,
        title: 'Task 14 lineup bypass match',
        placeName: 'Task 14 futsal court',
        startAt: futureStartAt,
        approvedApplicantTeamId: ids.opponentTeam,
        competitionConfigVersionId: configId,
      },
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: ids.teamMatch,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Task 14 Bypass Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Task 14 Bypass Opponent' },
      ],
      participants: [],
    };
    const created = await prisma.$transaction((tx) =>
      games.createFromSourceInTransaction(tx, input, creationContext('lineup-bypass-source-create', input)),
    );
    gameId = created.gameId;
    hostSideId = (
      await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('refuses PUT /games/:gameId/lineups/:sideId for a TEAM_MATCH game even with an invariant-violating payload', async () => {
    // Baseline: the two empty per-side seed lineups from game creation (see
    // the file-level comment above) - captured fresh rather than hardcoded so
    // this assertion is about the refused call's effect, not the seed count.
    const lineupCountBefore = await prisma.v1GameLineup.count({ where: { gameId } });
    const participantCountBefore = await prisma.v1GameParticipant.count({ where: { gameId } });

    // Two starters sharing jersey number 1 violates Task 14's
    // LINEUP_DUPLICATE_JERSEY_NUMBER invariant. The generic route has no such
    // check at all, so if it were still reachable for a TEAM_MATCH game this
    // payload would be silently accepted and persisted.
    const error = await captureFailure(() =>
      games.saveLineup(authUser(ids.hostUser), gameId, hostSideId, 'lineup-bypass-save-1', {
        expectedVersion: 0,
        clientCommandId: 'lineup-bypass-save-1',
        participants: [
          { displayNameSnapshot: 'Player A', jerseyNumber: 1, started: true },
          { displayNameSnapshot: 'Player B', jerseyNumber: 1, started: true },
        ],
      }),
    );
    expectHttpCode(error, 409, 'TEAM_MATCH_GENERIC_LINEUP_FORBIDDEN');

    // No lineup/participant rows were created by the refused call - counts
    // are unchanged from the pre-existing seed.
    expect(await prisma.v1GameLineup.count({ where: { gameId } })).toBe(lineupCountBefore);
    expect(await prisma.v1GameParticipant.count({ where: { gameId } })).toBe(participantCountBefore);
  });

  it('refuses POST /games/:gameId/lineups/:lineupId/submit for a TEAM_MATCH game, leaving a real DRAFT lineup untouched', async () => {
    // Build a real, invariant-valid DRAFT lineup through the validated
    // Task 14 path so there is a genuine lineupId to target. `expectedVersion`
    // here is the team-match lineup chain's own `revision` CAS token (see the
    // file-level comment: hostSideId already carries the empty revision-1
    // seed lineup from game creation), so it must be read fresh rather than
    // assumed to be 0 for "the first save". futsal-v1 also requires a
    // minimum of 3 starters, so a single-player roster (which the seeded
    // version-conflict masked from ever actually running) used to fail
    // LINEUP_SIZE_INVALID here too. **Task 163 removed that gate** — roster
    // size no longer blocks a save. The padding stays because this spec is
    // about the team-match source being forbidden on this route, and shrinking
    // the roster would only add an unrelated variable.
    const priorLineup = await prisma.v1GameLineup.findFirst({
      where: { gameId, sideId: hostSideId },
      orderBy: { revision: 'desc' },
    });
    const saved = await lineups.saveLineup(authUser(ids.hostUser), ids.teamMatch, 'lineup-bypass-team-draft', {
      expectedVersion: priorLineup?.revision ?? 0,
      starters: [
        { userId: ids.hostUser, jerseyNumber: 1, goalkeeper: true },
        { displayName: 'Bypass Guest 2', jerseyNumber: 2 },
        { displayName: 'Bypass Guest 3', jerseyNumber: 3 },
      ],
      bench: [],
    });
    expect(saved.state).toBe('DRAFT');

    // The generic route's `expectedVersion` is the Game aggregate's own
    // optimistic-concurrency `version` column - a separate counter from the
    // team-match lineup chain's `revision` that TeamMatchLineupService.
    // saveLineup above never touches - so it must be read fresh from the
    // Game row, not assumed to equal `saved.revision`.
    const currentGame = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    const error = await captureFailure(() =>
      games.submitLineup(authUser(ids.hostUser), gameId, saved.lineupId, 'lineup-bypass-submit-1', {
        expectedVersion: currentGame.version,
        clientCommandId: 'lineup-bypass-submit-1',
      }),
    );
    expectHttpCode(error, 409, 'TEAM_MATCH_GENERIC_LINEUP_FORBIDDEN');

    const row = await prisma.v1GameLineup.findUniqueOrThrow({ where: { id: saved.lineupId } });
    expect(row.state).toBe('DRAFT');
    expect(row.submittedAt).toBeNull();
  });
});
