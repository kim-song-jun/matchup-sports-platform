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
    reason: null, sourceType: 'TEAM_MATCH', currentOfficialRevisionId: canonicalIds.revision,
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
});
