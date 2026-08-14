import { PrismaClient, V1GameEventType, V1GameSideKey, V1GameSourceType, V1GameState } from '@prisma/client';
import { runGoalEventBackfill } from '../../src/games/migration/goal-event-backfill';
import { FOOTBALL_V1_CONFIG } from '../../src/tournaments/competition-config/competition-config';

/**
 * Proves the goal-event backfill against a real database (not a hand-rolled
 * Prisma fake — see goal-event-backfill.ts's own header doc for why the
 * project's "fake prisma silently ignores `where`" trap makes that
 * unsuitable here, since the whole point of this suite is to prove the
 * relation-filter WHERE clause that decides idempotency actually behaves
 * correctly against Postgres).
 *
 * Deliberately minimal: unlike fixture-game-backfill's own integration spec,
 * this seeds a Game directly (bypassing the tournament/fixture/registration
 * chain entirely) — exactly mirroring the shape
 * game-result-backfill.ts's createImportedGame() actually produces for the
 * 21 real backfilled matches this migration targets (a bare Game + sides +
 * OFFICIAL revision, `tournamentFixtureId: null` since nothing here reads
 * it), which keeps this suite's own DB load small.
 */

const prisma = new PrismaClient();
const id = (suffix: string) => `69000000-0000-4000-8000-${suffix}`;

const ids = {
  config: id('000000000001'),
  sport: id('000000000002'),
  tournament: id('000000000003'),

  gameWithGoals: id('000000000010'),
  revisionWithGoals: id('000000000011'),
  homeSide: id('000000000012'),
  awaySide: id('000000000013'),
  fixtureWithGoals: id('000000000014'),

  gameAlreadyLive: id('000000000020'),
  revisionAlreadyLive: id('000000000021'),
  homeSideLive: id('000000000022'),
  awaySideLive: id('000000000023'),
  liveGoalEvent: id('000000000024'),
  fixtureAlreadyLive: id('000000000025'),
};

describe('goal-event-backfill — restores GOAL events for backfilled tournament results', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the goal-event-backfill integration suite');
    }
    await prisma.$connect();

    await prisma.v1CompetitionConfigVersion.create({
      data: {
        id: ids.config,
        sportCode: 'football',
        name: 'goal-event-backfill-football-v1',
        version: 1,
        status: 'ACTIVE',
        periods: FOOTBALL_V1_CONFIG.periods,
        events: FOOTBALL_V1_CONFIG.events,
        lineup: FOOTBALL_V1_CONFIG.lineup,
        result: FOOTBALL_V1_CONFIG.result,
        tieBreak: FOOTBALL_V1_CONFIG.tieBreak,
        visibility: FOOTBALL_V1_CONFIG.visibility,
        contentHash: 'goal-event-backfill-config-hash',
      },
    });
    await prisma.v1Sport.create({
      data: { id: ids.sport, code: 'goal-event-backfill-football', name: 'Goal Event Backfill Football' },
    });
    await prisma.v1Tournament.create({
      data: {
        id: ids.tournament,
        sportId: ids.sport,
        title: 'Goal Event Backfill Tournament',
        competitionConfigVersionId: ids.config,
      },
    });
    // `v1_games_source_exactly_one_ck` requires a real, unique
    // tournamentFixtureId for every TOURNAMENT_FIXTURE-sourced game -- these
    // two bare fixture rows exist only to satisfy that constraint (no
    // registrations/results attached; this migration never reads the
    // fixture itself, only the Game + its OFFICIAL revision).
    await prisma.v1TournamentFixture.createMany({
      data: [
        { id: ids.fixtureWithGoals, tournamentId: ids.tournament, round: 'group', fixtureNumber: 1 },
        { id: ids.fixtureAlreadyLive, tournamentId: ids.tournament, round: 'group', fixtureNumber: 2 },
      ],
    });

    // Game 1: a backfilled (Task 10 style) ENDED game whose goals exist only
    // in score.goals[] -- the exact bug this migration fixes. One goal has
    // playerId: null (guest scorer -- must produce a participant-less
    // event); the other has a playerId but this game has zero
    // V1GameParticipant rows (the real production shape), so it must be
    // quarantined instead of guessed at.
    await prisma.v1Game.create({
      data: {
        id: ids.gameWithGoals,
        sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
        tournamentFixtureId: ids.fixtureWithGoals,
        state: V1GameState.ENDED,
        competitionConfigVersionId: ids.config,
        createdAt: new Date('2026-04-01T09:00:00.000Z'),
        sides: {
          create: [
            { id: ids.homeSide, sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Home FC' },
            { id: ids.awaySide, sideKey: V1GameSideKey.AWAY, displayNameSnapshot: 'Away FC' },
          ],
        },
        resultRevisions: {
          create: {
            id: ids.revisionWithGoals,
            revision: 1,
            state: 'OFFICIAL',
            score: {
              regulation: { home: 2, away: 0 },
              penalty: null,
              goals: [
                { team: 'home', playerId: null, playerName: '대타 김철수', minute: 12 },
                { team: 'home', playerId: 'legacy-player-unresolvable', playerName: '박민수', minute: 55 },
              ],
              incomplete: false,
              provenance: 'TOURNAMENT_FIXTURE_RESULT',
            },
            eventsHash: 'goal-event-backfill-fixture-hash',
            missingScorer: false,
            createdByActorType: 'SYSTEM',
            createdBySystemActor: 'GAME_BACKFILL',
            submittedAt: new Date('2026-04-01T09:00:00.000Z'),
            officialAt: new Date('2026-04-01T09:00:00.000Z'),
            createdAt: new Date('2026-04-01T09:00:00.000Z'),
          },
        },
      },
    });
    await prisma.v1Game.update({
      where: { id: ids.gameWithGoals },
      data: { currentOfficialRevisionId: ids.revisionWithGoals },
    });

    // Game 2: already has a real, live-recorded GOAL event. Must be left
    // completely untouched -- proves the candidate query's `events: { none:
    // { type: 'GOAL' } }` gate actually excludes it at the database level.
    await prisma.v1Game.create({
      data: {
        id: ids.gameAlreadyLive,
        sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
        tournamentFixtureId: ids.fixtureAlreadyLive,
        state: V1GameState.ENDED,
        competitionConfigVersionId: ids.config,
        lastSequence: 1,
        createdAt: new Date('2026-04-02T09:00:00.000Z'),
        sides: {
          create: [
            { id: ids.homeSideLive, sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Home FC 2' },
            { id: ids.awaySideLive, sideKey: V1GameSideKey.AWAY, displayNameSnapshot: 'Away FC 2' },
          ],
        },
        resultRevisions: {
          create: {
            id: ids.revisionAlreadyLive,
            revision: 1,
            state: 'OFFICIAL',
            score: {
              regulation: { home: 1, away: 0 },
              penalty: null,
              goals: [{ team: 'home', playerId: null, playerName: '실시간 득점자', minute: 30 }],
              incomplete: false,
              provenance: 'TOURNAMENT_FIXTURE_RESULT',
            },
            eventsHash: 'goal-event-backfill-live-hash',
            missingScorer: false,
            createdByActorType: 'SYSTEM',
            createdBySystemActor: 'GAME_BACKFILL',
            submittedAt: new Date('2026-04-02T09:00:00.000Z'),
            officialAt: new Date('2026-04-02T09:00:00.000Z'),
            createdAt: new Date('2026-04-02T09:00:00.000Z'),
          },
        },
      },
    });
    await prisma.v1Game.update({
      where: { id: ids.gameAlreadyLive },
      data: { currentOfficialRevisionId: ids.revisionAlreadyLive },
    });
    await prisma.v1GameEvent.create({
      data: {
        id: ids.liveGoalEvent,
        gameId: ids.gameAlreadyLive,
        sequence: 1,
        clientEventId: 'live-client-event-1',
        payloadHash: 'live-payload-hash',
        type: V1GameEventType.GOAL,
        sideId: ids.homeSideLive,
        period: 1,
        clockMs: 30 * 60_000,
        occurredAt: new Date('2026-04-02T09:29:00.000Z'),
        actorUserId: 'test-live-operator',
        payload: {},
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates GOAL events only for resolvable goals, quarantines the unresolved scorer, leaves the already-live game untouched, and stays idempotent on rerun', async () => {
    const first = await runGoalEventBackfill(prisma, { mode: 'apply' });

    expect(first.counts.eventsCreated).toBe(1);
    expect(first.counts.gamesWithEventsCreated).toBe(1);
    expect(first.quarantine).toContainEqual({
      gameId: ids.gameWithGoals,
      goalIndex: 1,
      reason: 'PARTICIPANT_UNRESOLVED',
    });

    const eventsAfterFirstRun = await prisma.v1GameEvent.findMany({ where: { gameId: ids.gameWithGoals } });
    expect(eventsAfterFirstRun).toHaveLength(1);
    expect(eventsAfterFirstRun[0]).toMatchObject({
      type: 'GOAL',
      sideId: ids.homeSide,
      participantId: null,
      clockMs: 12 * 60_000,
      sequence: 1,
    });

    const gameAfterFirstRun = await prisma.v1Game.findUniqueOrThrow({ where: { id: ids.gameWithGoals } });
    expect(gameAfterFirstRun.lastSequence).toBe(1);

    const liveGameEvents = await prisma.v1GameEvent.findMany({ where: { gameId: ids.gameAlreadyLive } });
    expect(liveGameEvents).toHaveLength(1);
    expect(liveGameEvents[0].id).toBe(ids.liveGoalEvent);

    const second = await runGoalEventBackfill(prisma, { mode: 'apply' });
    expect(second.counts.eventsCreated).toBe(0);
    expect(second.counts.gamesWithEventsCreated).toBe(0);
    expect(second.quarantine).toEqual([]);

    const eventsAfterSecondRun = await prisma.v1GameEvent.findMany({ where: { gameId: ids.gameWithGoals } });
    expect(eventsAfterSecondRun).toHaveLength(1);
    expect(eventsAfterSecondRun[0].id).toBe(eventsAfterFirstRun[0].id);
  });
});
