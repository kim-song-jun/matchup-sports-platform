import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { submitFriendlyTeamMatchLineups } from './submit-friendly-team-match-lineups';

// PR #1315 Copilot finding (verified real): the helper used to hardcode
// `revision: 1` whenever a side had no *valid* (invalidatedAt: null) lineup,
// but `(gameId, sideId, revision)` is unique — a side whose only lineup row
// is an INVALIDATED revision 1 (no valid lineup exists, but revision 1 is
// taken) made that insert collide. This spec pins the fix: the helper must
// continue from the side's true max revision (invalidated rows included).
const prisma = new PrismaService();

describe('submitFriendlyTeamMatchLineups (test helper)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for this integration verification');
    }
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates revision 2 (not a colliding revision 1) when the only existing lineup is an invalidated revision 1', async () => {
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    const sport = await prisma.v1Sport.upsert({
      where: { code: 'football' },
      create: { code: 'football', name: 'Football' },
      update: {},
    });
    const user = await prisma.v1User.create({ data: {} });
    const region = await prisma.v1Region.create({
      data: { code: `FIXTURE_${randomUUID().slice(0, 8)}`, name: 'Fixture Region', level: 1 },
    });
    const team = await prisma.v1Team.create({
      data: { ownerUserId: user.id, sportId: sport.id, regionId: region.id, name: 'Fixture Host' },
    });
    // v1_games_canonical_source_guard_ck requires a real teamMatchId for any
    // TEAM_MATCH-sourced game, and v1_team_matches_friendly_required_ck
    // requires hostTeamId/createdByUserId/regionId/placeName/startAt when
    // it isn't tournament/league-owned -- a minimal friendly row satisfies both.
    const teamMatch = await prisma.v1TeamMatch.create({
      data: {
        hostTeamId: team.id,
        createdByUserId: user.id,
        sportId: sport.id,
        regionId: region.id,
        title: 'Friendly lineup fixture regression match',
        placeName: 'Fixture ground',
        startAt: new Date(),
        competitionConfigVersionId: config.id,
      },
    });
    const game = await prisma.v1Game.create({
      data: {
        sourceType: 'TEAM_MATCH',
        teamMatchId: teamMatch.id,
        state: 'SCHEDULED',
        competitionConfigVersionId: config.id,
      },
    });
    const side = await prisma.v1GameSide.create({
      data: {
        gameId: game.id,
        sideKey: 'HOME',
        teamId: randomUUID(),
        displayNameSnapshot: 'Invalidated-lineup side',
      },
    });
    // Only lineup row for this side is revision 1, already invalidated --
    // no currently valid lineup, but revision 1 is taken in the unique index.
    await prisma.v1GameLineup.create({
      data: {
        gameId: game.id,
        sideId: side.id,
        revision: 1,
        state: 'SUBMITTED',
        invalidatedAt: new Date(),
        invalidationReason: 'test: superseded before resubmission',
      },
    });

    await expect(submitFriendlyTeamMatchLineups(prisma, game.id)).resolves.toBeUndefined();

    const validLineups = await prisma.v1GameLineup.findMany({
      where: { gameId: game.id, sideId: side.id, invalidatedAt: null },
    });
    expect(validLineups).toHaveLength(1);
    expect(validLineups[0]).toMatchObject({ revision: 2, state: 'SUBMITTED' });
    expect(
      await prisma.v1GameParticipant.count({
        where: { gameId: game.id, sideId: side.id, lineupId: validLineups[0].id },
      }),
    ).toBe(1);
  });
});
