const id = (suffix: string) => `10000000-0000-4000-8000-${suffix}`;

export const gameBackfillFixture = {
  timestamps: {
    created: new Date('2026-07-01T00:00:00.000Z'),
    tournamentRecorded: new Date('2026-07-10T09:30:00.000Z'),
    teamMatchCompleted: new Date('2026-07-11T10:45:00.000Z'),
    deleted: new Date('2026-07-12T12:00:00.000Z'),
  },
  ids: {
    user: id('000000000001'),
    admin: id('000000000002'),
    sport: id('000000000003'),
    region: id('000000000004'),
    homeTeam: id('000000000005'),
    awayTeam: id('000000000006'),
    tournament: id('000000000007'),
    homeRegistration: id('000000000008'),
    awayRegistration: id('000000000009'),
    competitionConfigVersion: id('000000000010'),
    validFixture: id('000000000011'),
    validFixtureResult: id('000000000012'),
    validHomeGoal: id('000000000013'),
    validAwayGoal: id('000000000014'),
    corruptFixture: id('000000000015'),
    corruptFixtureResult: id('000000000016'),
    importedFixture: id('000000000017'),
    importedFixtureResult: id('000000000018'),
    completedTeamMatch: id('000000000019'),
    deletedTeamMatch: id('000000000020'),
    importedGame: id('000000000021'),
    importedHomeSide: id('000000000022'),
    importedAwaySide: id('000000000023'),
    importedRevision: id('000000000024'),
    mismatchRevision: id('000000000027'),
  },
  expected: {
    sourceCounts: {
      sourceRows: 5,
      reconstructable: 1,
      partial: 1,
      alreadyImported: 1,
      quarantined: 2,
    },
    firstInsertCount: 2,
    secondInsertCount: 0,
    quarantine: [
      {
        sourceType: 'TOURNAMENT_FIXTURE',
        sourceId: id('000000000015'),
        reason: 'CORRUPT_RESULT',
      },
      {
        sourceType: 'TEAM_MATCH',
        sourceId: id('000000000020'),
        reason: 'SOURCE_DELETED',
      },
    ],
    validScore: {
      regulation: { home: 3, away: 1 },
      penalty: null,
      goals: [
        { team: 'home', playerId: null, playerName: 'Legacy Home Nine', minute: 12 },
        { team: 'away', playerId: null, playerName: 'Legacy Away Seven', minute: 54 },
      ],
      incomplete: false,
      provenance: 'TOURNAMENT_FIXTURE_RESULT',
    },
    partialScore: {
      regulation: null,
      penalty: null,
      goals: [],
      incomplete: true,
      provenance: 'TEAM_MATCH_COMPLETION_ONLY',
    },
    bracketResult: {
      id: id('000000000012'),
      fixtureId: id('000000000011'),
      homeScore: 3,
      awayScore: 1,
      hasPenalty: false,
      homePenaltyScore: null,
      awayPenaltyScore: null,
      note: 'official legacy result',
      recordedAt: '2026-07-10T09:30:00.000Z',
      createdAt: '2026-07-10T09:30:00.000Z',
      updatedAt: '2026-07-10T09:30:00.000Z',
      goals: [
        {
          id: id('000000000013'),
          team: 'home',
          playerId: null,
          playerName: 'Legacy Home Nine',
          minute: 12,
        },
        {
          id: id('000000000014'),
          team: 'away',
          playerId: null,
          playerName: 'Legacy Away Seven',
          minute: 54,
        },
      ],
    },
    completedTeamMatchDetail: {
      teamMatchId: id('000000000019'),
      // Task 17 added `gameId` to the team-match detail response so the result
      // UI can reach the game aggregate. This fixture row is legacy,
      // pre-migration data with no V1Game, so the pinned value is null. The
      // PIN assertion compares the whole object, so omitting the field made it
      // fail once the "V1 API unit tests" job started running (Task 10 landing
      // unblocked that gate) -- this is an intentional contract addition, not
      // unintended drift.
      gameId: null,
      title: 'Completed without a legacy score',
      description: null,
      imageUrl: null,
      sport: { sportId: id('000000000003'), name: 'Football' },
      region: { regionId: id('000000000004'), name: 'Task 10 District' },
      place: { name: 'Task 10 Ground', addressText: null },
      startsAt: new Date('2026-07-11T08:45:00.000Z'),
      endsAt: new Date('2026-07-11T10:45:00.000Z'),
      deadlineAt: null,
      status: 'completed',
      displayState: 'completed',
      costNote: null,
      levelLabel: null,
      minLevel: null,
      maxLevel: null,
      rulesText: null,
      genderRule: null,
      // v1-team-match-structured-conditions added these three columns to the detail()
      // response; this fixture row has no legacy formatNote and predates the backfill,
      // so all three stay at their unset defaults, same as levelLabel/minLevel/maxLevel
      // above.
      matchFormat: null,
      matchStyle: [],
      uniformColor: null,
      paymentRequired: false,
      hostTeam: {
        teamId: id('000000000005'),
        name: 'Task 10 Home',
        logoUrl: null,
        trustState: 'none',
        ownerUserId: id('000000000001'),
      },
      approvedOpponentTeam: null,
      viewer: { state: 'guest', manageableHostTeam: false, eligibleTeams: [], manageRoute: null },
    },
  },
} as const;

export type GameBackfillSourceCounts = typeof gameBackfillFixture.expected.sourceCounts;

export type GameBackfillRunResult = {
  counts: GameBackfillSourceCounts;
  populationHash: string;
  inserted: number;
  quarantine: Array<{
    sourceType: 'TEAM_MATCH' | 'TOURNAMENT_FIXTURE';
    sourceId: string;
    reason: 'CORRUPT_RESULT' | 'SOURCE_DELETED';
  }>;
};

export type GameBackfillCompareResult = {
  counts: {
    sourceRows: number;
    compared: number;
    matched: number;
    mismatched: number;
    partial: number;
    quarantined: number;
  };
  populationHash: string;
  mismatches: Array<{
    entityType: 'TEAM_MATCH' | 'TOURNAMENT_FIXTURE';
    entityId: string;
    revisionId: string;
    field: string;
    legacy: unknown;
    projected: unknown;
  }>;
};
