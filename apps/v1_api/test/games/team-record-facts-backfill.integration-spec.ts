import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { runTeamRecordFactsBackfill } from '../../src/games/migration/team-record-facts-backfill';
import { FOOTBALL_V1_CONFIG } from '../../src/tournaments/competition-config/competition-config';

/**
 * Real-database contract for the team-record-facts backfill (outbox-handler
 * + team-record-facts backfill task). Exercises the guarantees the task
 * explicitly requires, all against a real Postgres so the DB-level
 * idempotency (`ON CONFLICT DO NOTHING` + `@@unique([revisionId, teamId])`)
 * and the `v1_guard_game_official_fact_insert` trigger this task's migration
 * (20260810130000_v1_official_fact_backfill_score_shape) widened are the
 * ones actually enforcing correctness, not a fake/mock standing in for them.
 *
 * Three games:
 *   - `game`: TWO OFFICIAL revisions -- revision 1 (superseded, no longer
 *     `game.currentOfficialRevisionId`) and revision 2 (current). Proves
 *     "current official revision only" -- if the superseded one were ever
 *     counted, the second `apply` (idempotency check) would still report
 *     `revisionsProjected: 0` but the affected-team fact COUNT would be
 *     wrong (4 rows, not 2) since a superseded + current pair sharing a game
 *     both project facts for the SAME two teams.
 *   - `alreadyHasFactGame`: a fact row for its OFFICIAL revision is inserted
 *     directly (bypassing this backfill), simulating a revision the LIVE
 *     GAME_RESULT_OFFICIAL handler already projected. Proves the candidate
 *     query's `fact.id IS NULL` gate excludes it -- the backfill must never
 *     touch a revision that's already been projected.
 */
describe('runTeamRecordFactsBackfill real-database contract', () => {
  const prisma = new PrismaService();
  const runId = randomUUID().slice(0, 8);
  const prefix = `trf-backfill-${runId}`;

  const ids = {
    hostUser: randomUUID(),
    opponentUser: randomUUID(),
    sport: randomUUID(),
    region: randomUUID(),
    config: randomUUID(),
    hostTeam: randomUUID(),
    opponentTeam: randomUUID(),
    match: randomUUID(),
    game: randomUUID(),
    homeSide: randomUUID(),
    awaySide: randomUUID(),
    supersededRevision: randomUUID(),
    currentRevision: randomUUID(),
    alreadyHasFactMatch: randomUUID(),
    alreadyHasFactGame: randomUUID(),
    alreadyHasFactHomeSide: randomUUID(),
    alreadyHasFactAwaySide: randomUUID(),
    alreadyHasFactRevision: randomUUID(),
    alreadyHasFactRow: randomUUID(),
  } as const;

  beforeAll(async () => {
    await prisma.$connect();
    await seedFixture();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('projects only the current-official revision, is idempotent on re-run, and skips a revision that already has a fact', async () => {
    const first = await runTeamRecordFactsBackfill(prisma, { mode: 'apply' });

    // Only `currentRevision` is eligible -- the superseded revision is
    // structurally excluded (candidate query starts from
    // `game.current_official_revision_id`), and `alreadyHasFactRevision` is
    // excluded because it already has a fact row.
    expect(first.counts).toEqual({
      revisionsEligible: 1,
      revisionsProjected: 1,
      quarantined: 0,
    });
    expect(first.quarantine).toEqual([]);

    const factsAfterFirst = await teamRecordFactRows(ids.currentRevision);
    expect(factsAfterFirst).toHaveLength(2);
    const byTeam = new Map(factsAfterFirst.map((row) => [row.teamId, row]));
    expect(byTeam.get(ids.hostTeam)).toMatchObject({ result: 'WON', goalsFor: 3, goalsAgainst: 1 });
    expect(byTeam.get(ids.opponentTeam)).toMatchObject({ result: 'LOST', goalsFor: 1, goalsAgainst: 3 });

    // The superseded revision must never get a fact row -- double-counting
    // it would duplicate this team's record for the same real-world game.
    await expect(teamRecordFactRows(ids.supersededRevision)).resolves.toEqual([]);

    // Re-running `apply` must not duplicate anything -- the core idempotency
    // requirement. Row counts (not just the reported counts) must stay the
    // same across both runs.
    const second = await runTeamRecordFactsBackfill(prisma, { mode: 'apply' });
    expect(second.counts).toEqual({
      revisionsEligible: 0,
      revisionsProjected: 0,
      quarantined: 0,
    });
    await expect(teamRecordFactRows(ids.currentRevision)).resolves.toHaveLength(2);

    // The pre-existing fact (simulating one the live handler already wrote)
    // is untouched -- still exactly the one row it started with.
    const preExisting = await teamRecordFactRows(ids.alreadyHasFactRevision);
    expect(preExisting).toEqual([
      expect.objectContaining({ id: ids.alreadyHasFactRow, teamId: ids.hostTeam }),
    ]);
  });

  type FactRow = { id: string; teamId: string; result: string; goalsFor: number; goalsAgainst: number };

  async function teamRecordFactRows(revisionId: string): Promise<FactRow[]> {
    return prisma.$queryRaw<FactRow[]>`
      SELECT id, team_id AS "teamId", result, goals_for AS "goalsFor", goals_against AS "goalsAgainst"
      FROM v1_team_record_facts
      WHERE revision_id = ${revisionId}
      ORDER BY team_id ASC
    `;
  }

  async function seedFixture(): Promise<void> {
    await prisma.v1User.createMany({
      data: [ids.hostUser, ids.opponentUser].map((id, index) => ({
        id,
        email: `${prefix}-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: `${prefix}-football`, name: 'TRF Backfill Football' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: `TRF_${runId.toUpperCase()}`, name: 'TRF Backfill Region', level: 1 },
    });
    await prisma.v1CompetitionConfigVersion.create({
      data: {
        id: ids.config,
        sportCode: `${prefix}-football`,
        name: prefix,
        version: 1,
        status: 'ACTIVE',
        periods: FOOTBALL_V1_CONFIG.periods,
        events: FOOTBALL_V1_CONFIG.events,
        lineup: FOOTBALL_V1_CONFIG.lineup,
        result: FOOTBALL_V1_CONFIG.result,
        tieBreak: FOOTBALL_V1_CONFIG.tieBreak,
        visibility: FOOTBALL_V1_CONFIG.visibility,
        contentHash: `${prefix}:config`,
      },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.hostUser, sportId: ids.sport, regionId: ids.region, name: 'TRF Host' },
        { id: ids.opponentTeam, ownerUserId: ids.opponentUser, sportId: ids.sport, regionId: ids.region, name: 'TRF Opponent' },
      ],
    });

    // Game 1: superseded revision (revision 1, OFFICIAL, no longer current)
    // + current revision (revision 2, OFFICIAL, current).
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.match,
        hostTeamId: ids.hostTeam,
        approvedApplicantTeamId: ids.opponentTeam,
        createdByUserId: ids.hostUser,
        sportId: ids.sport,
        regionId: ids.region,
        title: 'TRF backfill fixture',
        placeName: 'TRF ground',
        startAt: new Date('2026-08-01T00:00:00.000Z'),
        competitionConfigVersionId: ids.config,
      },
    });
    await prisma.v1Game.create({
      data: {
        id: ids.game,
        sourceType: 'TEAM_MATCH',
        teamMatchId: ids.match,
        state: 'ENDED',
        version: 0,
        competitionConfigVersionId: ids.config,
      },
    });
    await prisma.v1GameSide.createMany({
      data: [
        { id: ids.homeSide, gameId: ids.game, sideKey: 'HOME', teamId: ids.hostTeam, displayNameSnapshot: 'TRF Host' },
        { id: ids.awaySide, gameId: ids.game, sideKey: 'AWAY', teamId: ids.opponentTeam, displayNameSnapshot: 'TRF Opponent' },
      ],
    });
    await prisma.v1GameResultRevision.create({
      data: {
        id: ids.supersededRevision,
        gameId: ids.game,
        revision: 1,
        state: 'OFFICIAL',
        score: { home: 1, away: 1 },
        eventsHash: `${prefix}:superseded-hash`,
        createdByActorType: 'USER',
        createdByUserId: ids.hostUser,
        submittedAt: new Date('2026-08-01T00:00:00.000Z'),
        officialAt: new Date('2026-08-01T00:05:00.000Z'),
      },
    });
    await prisma.v1GameResultRevision.create({
      data: {
        id: ids.currentRevision,
        gameId: ids.game,
        revision: 2,
        state: 'OFFICIAL',
        score: { home: 3, away: 1 },
        eventsHash: `${prefix}:current-hash`,
        createdByActorType: 'USER',
        createdByUserId: ids.hostUser,
        supersedesId: ids.supersededRevision,
        submittedAt: new Date('2026-08-02T00:00:00.000Z'),
        officialAt: new Date('2026-08-02T00:05:00.000Z'),
      },
    });
    await prisma.v1Game.update({
      where: { id: ids.game },
      data: { currentOfficialRevisionId: ids.currentRevision },
    });

    // Game 2: already has a fact row for its (only) OFFICIAL revision --
    // simulates one the live GAME_RESULT_OFFICIAL handler already projected.
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.alreadyHasFactMatch,
        hostTeamId: ids.hostTeam,
        approvedApplicantTeamId: ids.opponentTeam,
        createdByUserId: ids.hostUser,
        sportId: ids.sport,
        regionId: ids.region,
        title: 'TRF backfill already-projected fixture',
        placeName: 'TRF ground',
        startAt: new Date('2026-08-03T00:00:00.000Z'),
        competitionConfigVersionId: ids.config,
      },
    });
    await prisma.v1Game.create({
      data: {
        id: ids.alreadyHasFactGame,
        sourceType: 'TEAM_MATCH',
        teamMatchId: ids.alreadyHasFactMatch,
        state: 'ENDED',
        version: 0,
        competitionConfigVersionId: ids.config,
      },
    });
    await prisma.v1GameSide.createMany({
      data: [
        { id: ids.alreadyHasFactHomeSide, gameId: ids.alreadyHasFactGame, sideKey: 'HOME', teamId: ids.hostTeam, displayNameSnapshot: 'TRF Host' },
        { id: ids.alreadyHasFactAwaySide, gameId: ids.alreadyHasFactGame, sideKey: 'AWAY', teamId: ids.opponentTeam, displayNameSnapshot: 'TRF Opponent' },
      ],
    });
    await prisma.v1GameResultRevision.create({
      data: {
        id: ids.alreadyHasFactRevision,
        gameId: ids.alreadyHasFactGame,
        revision: 1,
        state: 'OFFICIAL',
        score: { home: 2, away: 2 },
        eventsHash: `${prefix}:already-hash`,
        createdByActorType: 'USER',
        createdByUserId: ids.hostUser,
        submittedAt: new Date('2026-08-03T00:00:00.000Z'),
        officialAt: new Date('2026-08-03T00:05:00.000Z'),
      },
    });
    await prisma.v1Game.update({
      where: { id: ids.alreadyHasFactGame },
      data: { currentOfficialRevisionId: ids.alreadyHasFactRevision },
    });
    await prisma.$executeRaw`
      INSERT INTO v1_game_official_facts (
        id, revision_id, game_id, revision, source_type, tournament_id,
        home_team_id, away_team_id, home_score, away_score, score,
        events_hash, official_at, recorded_at
      ) VALUES (
        ${randomUUID()}, ${ids.alreadyHasFactRevision}, ${ids.alreadyHasFactGame}, 1,
        'TEAM_MATCH'::"V1GameSourceType", NULL, ${ids.hostTeam}, ${ids.opponentTeam}, 2, 2,
        ${JSON.stringify({ home: 2, away: 2 })}::jsonb, ${`${prefix}:already-hash`},
        ${new Date('2026-08-03T00:05:00.000Z')}, CURRENT_TIMESTAMP
      )
    `;
    await prisma.$executeRaw`
      INSERT INTO v1_team_record_facts (
        id, revision_id, game_id, team_id, opponent_team_id, tournament_id,
        result, goals_for, goals_against, source_hash, official_at, recorded_at
      ) VALUES (
        ${ids.alreadyHasFactRow}, ${ids.alreadyHasFactRevision}, ${ids.alreadyHasFactGame}, ${ids.hostTeam},
        ${ids.opponentTeam}, NULL, 'DRAWN', 2, 2, ${`${prefix}:already-hash`},
        ${new Date('2026-08-03T00:05:00.000Z')}, CURRENT_TIMESTAMP
      )
    `;
  }
});
