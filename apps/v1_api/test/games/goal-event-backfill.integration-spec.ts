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

  gamePartial: id('000000000030'),
  revisionPartial: id('000000000031'),
  homeSidePartial: id('000000000032'),
  awaySidePartial: id('000000000033'),
  partialExistingEvent: id('000000000034'),
  fixturePartial: id('000000000035'),

  gameLegacyShapedLive: id('000000000040'),
  revisionLegacyShapedLive: id('000000000041'),
  homeSideLegacyShaped: id('000000000042'),
  awaySideLegacyShaped: id('000000000043'),
  legacyShapedLiveEvent: id('000000000044'),
  fixtureLegacyShaped: id('000000000045'),
};

// Mirrors the id scheme goal-event-backfill.ts derives for every event it
// writes. Spelled out here rather than imported so a change to that scheme
// has to be reckoned with by this contract too.
const backfillClientEventId = (gameId: string, goalIndex: number) => `GOAL_BACKFILL:${gameId}:${goalIndex}`;

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
    // bare fixture rows exist only to satisfy that constraint (no
    // registrations/results attached; this migration never reads the
    // fixture itself, only the Game + its OFFICIAL revision).
    await prisma.v1TournamentFixture.createMany({
      data: [
        { id: ids.fixtureWithGoals, tournamentId: ids.tournament, round: 'group', fixtureNumber: 1 },
        { id: ids.fixtureAlreadyLive, tournamentId: ids.tournament, round: 'group', fixtureNumber: 2 },
        { id: ids.fixturePartial, tournamentId: ids.tournament, round: 'group', fixtureNumber: 3 },
        { id: ids.fixtureLegacyShaped, tournamentId: ids.tournament, round: 'group', fixtureNumber: 4 },
      ],
    });

    // Game 1: a backfilled (Task 10 style) ENDED game whose goals exist only
    // in score.goals[] -- the exact bug this migration fixes. Goal 0 has
    // playerId: null (guest scorer -- must produce a participant-less
    // event); goal 1 has a playerId but this game has zero
    // V1GameParticipant rows (the real production shape), so it must be
    // quarantined instead of guessed at; goal 2 has no recorded minute at
    // all, which must still be recorded (clockMs 0 + payload.minuteKnown
    // false) rather than dropped from the lineage.
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
              regulation: { home: 3, away: 0 },
              penalty: null,
              goals: [
                { team: 'home', playerId: null, playerName: '대타 김철수', minute: 12 },
                { team: 'home', playerId: 'legacy-player-unresolvable', playerName: '박민수', minute: 55 },
                { team: 'home', playerId: null, playerName: '분모름 득점자', minute: null },
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

    // Game 2: a genuinely live-officiated tournament game. Must be left
    // completely untouched.
    //
    // Its revision deliberately carries the FLAT `{ home, away }` score that
    // GamesService.deriveTournamentRevision() actually writes when a game is
    // ended through the live `end` command -- notably with NO `provenance`
    // key, which only the (since-deleted) Task 10 importer ever wrote. That
    // is what makes this fixture the real production shape for a live game,
    // and it matters more than it used to: once the candidate gate stopped
    // excluding games that already hold GOAL events, `score.provenance !==
    // 'TOURNAMENT_FIXTURE_RESULT' -> skip` became one of only two things
    // standing between this backfill and a live game's event stream. This
    // game holds that one honest; Game 4 below holds the other one honest.
    //
    // (It previously carried a GAME_BACKFILL-style `provenance:
    // 'TOURNAMENT_FIXTURE_RESULT'` score alongside a live event -- a pairing
    // no producer in the codebase can generate, since ending a game replaces
    // the official revision with the flat shape above. Under the old
    // game-level gate that mismatch was invisible; it would have made this
    // game a candidate the moment the gate moved to goal level.)
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
            score: { home: 1, away: 0 },
            eventsHash: 'goal-event-backfill-live-hash',
            missingScorer: false,
            // A live-ended game's revision is authored by the operator who
            // sent the `end` command, not by a migration system actor.
            createdByActorType: 'USER',
            createdByUserId: 'test-live-operator',
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

    // Game 3: the state defect 1 is about -- a PARTIALLY backfilled game. An
    // earlier run inserted goal 0 and got no further (goal 1 was blocked at
    // the time). Under the game-level `events: { none: { type: 'GOAL' } }`
    // gate this game was excluded from every subsequent run the instant that
    // first event landed, so goal 1 could never be filled in no matter how
    // many times the migration was re-run. The rerun must add exactly the
    // missing goal and must not duplicate the one already there.
    await prisma.v1Game.create({
      data: {
        id: ids.gamePartial,
        sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
        tournamentFixtureId: ids.fixturePartial,
        state: V1GameState.ENDED,
        competitionConfigVersionId: ids.config,
        lastSequence: 1,
        createdAt: new Date('2026-04-03T09:00:00.000Z'),
        sides: {
          create: [
            { id: ids.homeSidePartial, sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Home FC 3' },
            { id: ids.awaySidePartial, sideKey: V1GameSideKey.AWAY, displayNameSnapshot: 'Away FC 3' },
          ],
        },
        resultRevisions: {
          create: {
            id: ids.revisionPartial,
            revision: 1,
            state: 'OFFICIAL',
            score: {
              regulation: { home: 1, away: 1 },
              penalty: null,
              goals: [
                { team: 'home', playerId: null, playerName: '이미백필된골', minute: 15 },
                { team: 'away', playerId: null, playerName: '아직백필안된골', minute: 40 },
              ],
              incomplete: false,
              provenance: 'TOURNAMENT_FIXTURE_RESULT',
            },
            eventsHash: 'goal-event-backfill-partial-hash',
            missingScorer: false,
            createdByActorType: 'SYSTEM',
            createdBySystemActor: 'GAME_BACKFILL',
            submittedAt: new Date('2026-04-03T09:00:00.000Z'),
            officialAt: new Date('2026-04-03T09:00:00.000Z'),
            createdAt: new Date('2026-04-03T09:00:00.000Z'),
          },
        },
      },
    });
    await prisma.v1Game.update({
      where: { id: ids.gamePartial },
      data: { currentOfficialRevisionId: ids.revisionPartial },
    });
    // The event a previous backfill run already wrote for goal 0 -- carrying
    // the exact clientEventId that run would have derived, which is what the
    // goal-level skip has to recognise.
    await prisma.v1GameEvent.create({
      data: {
        id: ids.partialExistingEvent,
        gameId: ids.gamePartial,
        sequence: 1,
        clientEventId: backfillClientEventId(ids.gamePartial, 0),
        payloadHash: 'partial-existing-payload-hash',
        type: V1GameEventType.GOAL,
        sideId: ids.homeSidePartial,
        period: 1,
        clockMs: 15 * 60_000,
        occurredAt: new Date('2026-04-03T09:00:00.000Z'),
        actorUserId: 'SYSTEM:GOAL_EVENT_BACKFILL',
        payload: { source: 'GOAL_BACKFILL_V1', legacyPlayerName: '이미백필된골' },
      },
    });

    // Game 4: the pairing no producer in this codebase can currently generate
    // -- a score carrying the legacy `provenance: 'TOURNAMENT_FIXTURE_RESULT'`
    // shape (goals and all) on a revision the OPERATOR authored, alongside a
    // real live-recorded GOAL event.
    //
    // It exists because the candidate gate's two remaining guards must each be
    // load-bearing on their own. Game 2 (flat score, operator-authored) proves
    // `parseScoreForGoals`'s provenance check; this one proves the query's
    // `currentOfficialRevision.createdBySystemActor = 'GAME_BACKFILL'` filter,
    // by being the exact input that provenance check would WAVE THROUGH. Drop
    // that filter and the backfill starts appending its own GOAL events into
    // this game's live event stream -- which is precisely the failure mode the
    // removed `events: { none: { type: 'GOAL' } }` gate used to prevent by
    // accident.
    await prisma.v1Game.create({
      data: {
        id: ids.gameLegacyShapedLive,
        sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
        tournamentFixtureId: ids.fixtureLegacyShaped,
        state: V1GameState.ENDED,
        competitionConfigVersionId: ids.config,
        lastSequence: 1,
        createdAt: new Date('2026-04-04T09:00:00.000Z'),
        sides: {
          create: [
            { id: ids.homeSideLegacyShaped, sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Home FC 4' },
            { id: ids.awaySideLegacyShaped, sideKey: V1GameSideKey.AWAY, displayNameSnapshot: 'Away FC 4' },
          ],
        },
        resultRevisions: {
          create: {
            id: ids.revisionLegacyShapedLive,
            revision: 1,
            state: 'OFFICIAL',
            score: {
              regulation: { home: 1, away: 0 },
              penalty: null,
              goals: [{ team: 'home', playerId: null, playerName: '레거시모양 득점자', minute: 30 }],
              incomplete: false,
              provenance: 'TOURNAMENT_FIXTURE_RESULT',
            },
            eventsHash: 'goal-event-backfill-legacy-shaped-hash',
            missingScorer: false,
            createdByActorType: 'USER',
            createdByUserId: 'test-live-operator-2',
            submittedAt: new Date('2026-04-04T09:00:00.000Z'),
            officialAt: new Date('2026-04-04T09:00:00.000Z'),
            createdAt: new Date('2026-04-04T09:00:00.000Z'),
          },
        },
      },
    });
    await prisma.v1Game.update({
      where: { id: ids.gameLegacyShapedLive },
      data: { currentOfficialRevisionId: ids.revisionLegacyShapedLive },
    });
    await prisma.v1GameEvent.create({
      data: {
        id: ids.legacyShapedLiveEvent,
        gameId: ids.gameLegacyShapedLive,
        sequence: 1,
        clientEventId: 'legacy-shaped-live-client-event',
        payloadHash: 'legacy-shaped-live-payload-hash',
        type: V1GameEventType.GOAL,
        sideId: ids.homeSideLegacyShaped,
        period: 1,
        clockMs: 30 * 60_000,
        occurredAt: new Date('2026-04-04T09:30:00.000Z'),
        actorUserId: 'test-live-operator-2',
        payload: {},
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('fills only the goals still missing, records an unknown minute instead of dropping it, and leaves the live game alone', async () => {
    const first = await runGoalEventBackfill(prisma, { mode: 'apply' });

    // Game 1 contributes 2 (guest scorer + unknown-minute scorer; the
    // unresolvable one is quarantined), Game 3 contributes exactly 1 (the
    // single hole left by the earlier partial run).
    expect(first.counts.eventsCreated).toBe(3);
    expect(first.counts.gamesWithEventsCreated).toBe(2);
    // Only Games 1 and 3 are this backfill's rows. Games 2 and 4 are ended
    // tournament games too, but neither is claimed -- see their fixtures.
    expect(first.counts.gamesEligible).toBe(2);
    expect(first.quarantine).toEqual([
      { gameId: ids.gameWithGoals, goalIndex: 1, reason: 'PARTICIPANT_UNRESOLVED' },
    ]);

    const game1Events = await prisma.v1GameEvent.findMany({
      where: { gameId: ids.gameWithGoals },
      orderBy: { sequence: 'asc' },
    });
    expect(game1Events).toHaveLength(2);
    expect(game1Events[0]).toMatchObject({
      type: 'GOAL',
      sideId: ids.homeSide,
      participantId: null,
      clockMs: 12 * 60_000,
      sequence: 1,
      clientEventId: backfillClientEventId(ids.gameWithGoals, 0),
    });
    // The minute-less goal is present, parked at clockMs 0, and says so in
    // its payload -- clockMs alone cannot distinguish it from a goal scored
    // in the opening minute.
    expect(game1Events[1]).toMatchObject({
      type: 'GOAL',
      clockMs: 0,
      sequence: 2,
      clientEventId: backfillClientEventId(ids.gameWithGoals, 2),
    });
    expect(game1Events[1].payload).toMatchObject({ minuteKnown: false });

    const game1 = await prisma.v1Game.findUniqueOrThrow({ where: { id: ids.gameWithGoals } });
    expect(game1.lastSequence).toBe(2);

    // Defect 1's core contract: the partially backfilled game got its hole
    // filled -- previously unreachable forever -- without duplicating the
    // event the earlier run had already written.
    const game3Events = await prisma.v1GameEvent.findMany({
      where: { gameId: ids.gamePartial },
      orderBy: { sequence: 'asc' },
    });
    expect(game3Events).toHaveLength(2);
    expect(game3Events[0].id).toBe(ids.partialExistingEvent);
    expect(game3Events[1]).toMatchObject({
      sideId: ids.awaySidePartial,
      clockMs: 40 * 60_000,
      sequence: 2,
      clientEventId: backfillClientEventId(ids.gamePartial, 1),
    });
    const game3 = await prisma.v1Game.findUniqueOrThrow({ where: { id: ids.gamePartial } });
    expect(game3.lastSequence).toBe(2);

    // The live game keeps exactly its own event. With the game-level gate
    // gone, this is proof that the score.provenance check keeps the backfill
    // out of a live event stream on its own.
    const liveGameEvents = await prisma.v1GameEvent.findMany({ where: { gameId: ids.gameAlreadyLive } });
    expect(liveGameEvents).toHaveLength(1);
    expect(liveGameEvents[0].id).toBe(ids.liveGoalEvent);
    const liveGame = await prisma.v1Game.findUniqueOrThrow({ where: { id: ids.gameAlreadyLive } });
    expect(liveGame.lastSequence).toBe(1);

    // ...and the same for the OTHER guard, on the one input that would sail
    // straight past the provenance check: an operator-authored revision that
    // nonetheless carries the legacy score shape. Nothing appended, sequence
    // untouched.
    const legacyShapedEvents = await prisma.v1GameEvent.findMany({
      where: { gameId: ids.gameLegacyShapedLive },
    });
    expect(legacyShapedEvents).toHaveLength(1);
    expect(legacyShapedEvents[0].id).toBe(ids.legacyShapedLiveEvent);
    const legacyShapedGame = await prisma.v1Game.findUniqueOrThrow({
      where: { id: ids.gameLegacyShapedLive },
    });
    expect(legacyShapedGame.lastSequence).toBe(1);
  });

  it('adds nothing on rerun once every goal is backfilled, while still reporting the goals it cannot resolve', async () => {
    // Runs against the state the previous test left behind (this suite seeds
    // once in beforeAll and does not truncate between tests).
    const before = await prisma.v1GameEvent.findMany({ orderBy: { id: 'asc' }, select: { id: true } });

    const rerun = await runGoalEventBackfill(prisma, { mode: 'apply' });

    expect(rerun.counts.eventsCreated).toBe(0);
    expect(rerun.counts.gamesWithEventsCreated).toBe(0);
    // `gamesEligible` counts rows this backfill CLAIMS, not rows still needing
    // work -- it deliberately does not drain to 0 as the job completes (the
    // goal-level skip happens further in). "Nothing left to do" is the two
    // counters above plus `quarantined` staying at its known, reported set.
    // Pinned because the CLI prints this number straight at an operator.
    expect(rerun.counts.gamesEligible).toBe(2);
    // Unlike the old game-level gate -- which made a fully backfilled game
    // vanish from the candidate set and so silently stopped reporting its
    // unresolved goals -- the goal-level gate keeps surfacing goals that
    // still have no home. That visibility is the point: these are the rows
    // an operator has to act on, and they must not fade out just because
    // some other goal in the same game succeeded.
    expect(rerun.quarantine).toEqual([
      { gameId: ids.gameWithGoals, goalIndex: 1, reason: 'PARTICIPANT_UNRESOLVED' },
    ]);

    const after = await prisma.v1GameEvent.findMany({ orderBy: { id: 'asc' }, select: { id: true } });
    expect(after).toEqual(before);
  });
});
