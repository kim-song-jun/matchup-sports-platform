import { GameResultStandingsProjectionService } from './game-result-standings-projection.service';
import type { OfficialRevisionRow } from './game-result-official-projection.types';
import { FOOTBALL_V1_CONFIG } from '../tournaments/competition-config/competition-config';

const canonicalIds = {
  tournament: 'tournament-1', group: 'group-1', match: 'match-1', game: 'game-1',
  revision: 'revision-1', homeRegistration: 'reg-1', awayRegistration: 'reg-2',
} as const;

function revisionRow(overrides: Partial<OfficialRevisionRow> = {}): OfficialRevisionRow {
  return {
    revisionId: canonicalIds.revision, gameId: canonicalIds.game, revision: 1,
    score: { home: 2, away: 1 }, sourceHash: 'hash-1',
    playedAt: new Date('2026-06-14T00:00:00Z'), officialAt: new Date('2026-06-14T00:00:00Z'),
    reason: null, outcomeReason: 'NORMAL', sourceType: 'TEAM_MATCH', currentOfficialRevisionId: canonicalIds.revision,
    tournamentId: canonicalIds.tournament, teamMatchId: canonicalIds.match,
    tournamentTeamMatchId: canonicalIds.match, teamMatchTournamentId: canonicalIds.tournament,
    leagueId: null, homeTeamId: 'team-home', awayTeamId: 'team-away', visibility: 'LIVE' as const,
    ...overrides,
  };
}

function canonicalGame(overrides: Record<string, unknown> = {}) {
  return {
    id: canonicalIds.game, sourceType: 'TEAM_MATCH',
    currentOfficialRevision: { state: 'OFFICIAL', score: { home: 2, away: 1 }, resultParticipants: [] },
    sides: [{ id: 'home-side', sideKey: 'HOME' }, { id: 'away-side', sideKey: 'AWAY' }], ...overrides,
  };
}

function canonicalDetail(overrides: Record<string, unknown> = {}) {
  return {
    groupId: canonicalIds.group, tournamentId: canonicalIds.tournament,
    homeRegistrationId: canonicalIds.homeRegistration, awayRegistrationId: canonicalIds.awayRegistration,
    teamMatch: {
      id: canonicalIds.match, deletedAt: null, tournamentId: canonicalIds.tournament,
      leagueId: null, status: 'completed', game: canonicalGame(),
    }, ...overrides,
  };
}

function groupBase(overrides: Record<string, unknown> = {}) {
  return {
    id: canonicalIds.group, phase: 'group',
    groupTeams: [{ registrationId: canonicalIds.homeRegistration }, { registrationId: canonicalIds.awayRegistration }],
    tournament: {
      id: canonicalIds.tournament, deletedAt: null, competitionConfigVersionId: 'config-version-1',
      competitionConfig: FOOTBALL_V1_CONFIG,
    }, ...overrides,
  };
}

function makeTx() {
  return {
    v1TournamentMatchDetails: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    v1TournamentGroup: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    v1TournamentStanding: { upsert: jest.fn().mockResolvedValue({}) },
    v1TournamentOverallStanding: {
      upsert: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  } as any;
}

function configureCanonicalGroup(tx: ReturnType<typeof makeTx>, detail = canonicalDetail()) {
  tx.v1TournamentMatchDetails.findUnique.mockResolvedValue(detail);
  tx.v1TournamentGroup.findUnique.mockResolvedValue(groupBase());
  tx.v1TournamentGroup.findMany.mockResolvedValue([groupBase()]);
  tx.v1TournamentMatchDetails.findMany.mockResolvedValue([detail]);
}

describe('GameResultStandingsProjectionService', () => {
  const service = new GameResultStandingsProjectionService();

  it('projects canonical tournament TeamMatch results to group and overall standings', async () => {
    const tx = makeTx(); configureCanonicalGroup(tx);
    await service.project(tx, revisionRow());
    for (const table of [tx.v1TournamentStanding, tx.v1TournamentOverallStanding]) {
      const rows = (table.upsert as jest.Mock).mock.calls.map(([input]) => input.create);
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.registrationId === canonicalIds.homeRegistration)).toMatchObject({ points: 3, wins: 1, position: 1 });
      expect(rows.find((row) => row.registrationId === canonicalIds.awayRegistration)).toMatchObject({ points: 0, losses: 1, position: 2 });
    }
  });

  it('ignores legacy-only revisions without querying legacy fixtures', async () => {
    const tx = makeTx();
    await service.project(tx, revisionRow({ sourceType: 'TOURNAMENT_FIXTURE', teamMatchId: null, tournamentTeamMatchId: null, teamMatchTournamentId: null }));
    expect(tx.v1TournamentMatchDetails.findUnique).not.toHaveBeenCalled();
    expect(tx.v1TournamentGroup.findMany).not.toHaveBeenCalled();
    expect(tx.v1TournamentStanding.upsert).not.toHaveBeenCalled();
  });

  it('rejects a canonical revision whose Details or TeamMatch cannot be resolved', async () => {
    const tx = makeTx(); tx.v1TournamentMatchDetails.findUnique.mockResolvedValue(null);
    await expect(service.project(tx, revisionRow())).rejects.toMatchObject({ response: { code: 'CANONICAL_MATCH_REQUIRED' } });
    expect(tx.v1TournamentStanding.upsert).not.toHaveBeenCalled();
  });

  it('rejects cross-tournament canonical ownership instead of projecting zeroes', async () => {
    const tx = makeTx();
    const base = canonicalDetail();
    configureCanonicalGroup(tx, canonicalDetail({ tournamentId: 'other-tournament', teamMatch: { ...base.teamMatch, tournamentId: 'other-tournament' } }));
    await expect(service.project(tx, revisionRow())).rejects.toMatchObject({ response: { code: 'CANONICAL_MATCH_REQUIRED' } });
    expect(tx.v1TournamentStanding.upsert).not.toHaveBeenCalled();
  });

  it('skips a valid canonical knockout match without group standings', async () => {
    const tx = makeTx(); tx.v1TournamentMatchDetails.findUnique.mockResolvedValue(canonicalDetail({ groupId: null }));
    await service.project(tx, revisionRow());
    expect(tx.v1TournamentGroup.findMany).not.toHaveBeenCalled();
    expect(tx.v1TournamentStanding.upsert).not.toHaveBeenCalled();
  });

  it('skips a canonical match attached to a non-group phase even when groupId is present', async () => {
    const tx = makeTx();
    tx.v1TournamentMatchDetails.findUnique.mockResolvedValue(canonicalDetail());
    tx.v1TournamentGroup.findUnique.mockResolvedValue(groupBase({ phase: 'semi' }));

    await service.project(tx, revisionRow());

    expect(tx.v1TournamentGroup.findMany).not.toHaveBeenCalled();
    expect(tx.v1TournamentStanding.upsert).not.toHaveBeenCalled();
  });

  it('keeps VOID current revisions from contributing points while preserving both rows', async () => {
    const tx = makeTx(); const base = canonicalDetail();
    const detail = canonicalDetail({ teamMatch: { ...base.teamMatch, game: canonicalGame({ currentOfficialRevision: { state: 'VOID', score: { home: 2, away: 1 }, resultParticipants: [] } }) } });
    configureCanonicalGroup(tx, detail); await service.project(tx, revisionRow());
    const rows = (tx.v1TournamentStanding.upsert as jest.Mock).mock.calls.map(([input]) => input.create);
    expect(rows).toHaveLength(2); expect(rows.every((row) => row.points === 0 && row.wins === 0 && row.losses === 0)).toBe(true);
  });

  describe('대회가 고른 동점 순서', () => {
    // A and B both end on 3 points; A beat B head-to-head but has the worse goal difference (-2 vs +3).
    const fixtureOf = (home: string, away: string, homeScore: number, awayScore: number) => {
      const base = canonicalDetail();
      return canonicalDetail({
        homeRegistrationId: home, awayRegistrationId: away,
        teamMatch: { ...base.teamMatch, game: canonicalGame({ currentOfficialRevision: { state: 'OFFICIAL', score: { home: homeScore, away: awayScore }, resultParticipants: [] } }) },
      });
    };
    const details = [fixtureOf('A', 'B', 1, 0), fixtureOf('D', 'A', 3, 0), fixtureOf('B', 'E', 4, 0), fixtureOf('D', 'E', 1, 0)];
    const projectedOrder = async (tieBreakOrder?: unknown) => {
      const tx = makeTx();
      const group = groupBase({
        groupTeams: ['A', 'B', 'D', 'E'].map((registrationId) => ({ registrationId })),
        tournament: { id: canonicalIds.tournament, deletedAt: null, competitionConfigVersionId: 'config-version-1', competitionConfig: FOOTBALL_V1_CONFIG, tieBreakOrder },
      });
      tx.v1TournamentMatchDetails.findUnique.mockResolvedValue(details[0]);
      tx.v1TournamentGroup.findUnique.mockResolvedValue(group);
      tx.v1TournamentGroup.findMany.mockResolvedValue([group]);
      tx.v1TournamentMatchDetails.findMany.mockResolvedValue(details);
      await service.project(tx, revisionRow());
      const rows = (tx.v1TournamentStanding.upsert as jest.Mock).mock.calls.map(([input]) => input.create);
      return rows.sort((left, right) => left.position - right.position).map((row) => row.registrationId);
    };

    it('저장한 순서가 없으면 맞대결 승자가 득실이 나빠도 앞선다 — 기존 대회 순위는 그대로', async () => {
      expect(await projectedOrder(null)).toEqual(['D', 'A', 'B', 'E']);
    });

    it('득실차를 맞대결보다 먼저 둔 대회는 저장 순위가 그 순서로 계산된다', async () => {
      expect(await projectedOrder(['points', 'goal_difference', 'goals_for', 'head_to_head', 'fair_play', 'seeded_draw'])).toEqual(['D', 'B', 'A', 'E']);
    });
  });
});
