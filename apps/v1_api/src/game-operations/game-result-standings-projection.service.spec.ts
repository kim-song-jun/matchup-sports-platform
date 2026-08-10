/**
 * game-result-standings-projection.service.spec.ts
 *
 * Contract tests for the automatic per-result group-standings trigger:
 *   - team-match games (no tournamentFixtureId) never touch tournament tables
 *   - a fixture with no groupId is skipped
 *   - knockout-phase groups (phase !== 'group') are skipped, matching
 *     TournamentBracketService.recalculateStandings()'s own filter
 *   - a soft-deleted tournament / missing competition config is skipped
 *   - a real group-phase group with a completed OFFICIAL fixture gets its
 *     V1TournamentStanding rows recomputed via the real
 *     calculateCompetitionStandings() (not a mocked calculation)
 *
 * 관찰 가능한 동작(tx 호출 여부/인자)만 검증한다. Mock 자체를 검증하지 않는다.
 */
import { GameResultStandingsProjectionService } from './game-result-standings-projection.service';
import type { OfficialRevisionRow } from './game-result-official-projection.types';
import { FOOTBALL_V1_CONFIG } from '../tournaments/competition-config/competition-config';

function revisionRow(overrides: Partial<OfficialRevisionRow> = {}): OfficialRevisionRow {
  return {
    revisionId: 'revision-1',
    gameId: 'game-1',
    revision: 1,
    score: { home: 2, away: 1 },
    sourceHash: 'hash-1',
    officialAt: new Date('2026-06-14T00:00:00Z'),
    reason: null,
    sourceType: 'TOURNAMENT_FIXTURE',
    currentOfficialRevisionId: 'revision-1',
    tournamentId: 'tournament-1',
    tournamentFixtureId: 'fixture-1',
    homeTeamId: 'team-home',
    awayTeamId: 'team-away',
    visibility: 'LIVE' as const,
    ...overrides,
  };
}

function makeTx() {
  return {
    v1TournamentFixture: { findUnique: jest.fn() },
    v1TournamentGroup: { findUnique: jest.fn() },
    v1TournamentStanding: { upsert: jest.fn().mockResolvedValue({}) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function groupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'group-1',
    phase: 'group',
    groupTeams: [{ registrationId: 'reg-1' }, { registrationId: 'reg-2' }],
    fixtures: [
      {
        homeRegistrationId: 'reg-1',
        awayRegistrationId: 'reg-2',
        game: {
          currentOfficialRevision: { state: 'OFFICIAL', score: { home: 2, away: 1 } },
        },
      },
    ],
    tournament: {
      id: 'tournament-1',
      deletedAt: null,
      competitionConfigVersionId: 'config-version-1',
      competitionConfig: FOOTBALL_V1_CONFIG,
    },
    ...overrides,
  };
}

describe('GameResultStandingsProjectionService', () => {
  const service = new GameResultStandingsProjectionService();

  it('team-match game (tournamentFixtureId === null) → no tournament tables touched', async () => {
    const tx = makeTx();
    await service.project(tx, revisionRow({ tournamentFixtureId: null }));

    expect(tx.v1TournamentFixture.findUnique).not.toHaveBeenCalled();
    expect(tx.v1TournamentGroup.findUnique).not.toHaveBeenCalled();
    expect(tx.v1TournamentStanding.upsert).not.toHaveBeenCalled();
  });

  it('fixture has no groupId → group is never looked up, no standings upserted', async () => {
    const tx = makeTx();
    tx.v1TournamentFixture.findUnique.mockResolvedValue({ groupId: null });

    await service.project(tx, revisionRow());

    expect(tx.v1TournamentFixture.findUnique).toHaveBeenCalledWith({
      where: { id: 'fixture-1' },
      select: { groupId: true },
    });
    expect(tx.v1TournamentGroup.findUnique).not.toHaveBeenCalled();
    expect(tx.v1TournamentStanding.upsert).not.toHaveBeenCalled();
  });

  it('fixture row missing entirely (defensive) → no standings upserted', async () => {
    const tx = makeTx();
    tx.v1TournamentFixture.findUnique.mockResolvedValue(null);

    await service.project(tx, revisionRow());

    expect(tx.v1TournamentGroup.findUnique).not.toHaveBeenCalled();
    expect(tx.v1TournamentStanding.upsert).not.toHaveBeenCalled();
  });

  it('knockout-phase group (phase !== "group") → skipped, no standings upserted', async () => {
    const tx = makeTx();
    tx.v1TournamentFixture.findUnique.mockResolvedValue({ groupId: 'group-1' });
    tx.v1TournamentGroup.findUnique.mockResolvedValue(groupRow({ phase: 'semi' }));

    await service.project(tx, revisionRow());

    expect(tx.v1TournamentStanding.upsert).not.toHaveBeenCalled();
  });

  it('soft-deleted tournament → skipped, no standings upserted', async () => {
    const tx = makeTx();
    tx.v1TournamentFixture.findUnique.mockResolvedValue({ groupId: 'group-1' });
    tx.v1TournamentGroup.findUnique.mockResolvedValue(
      groupRow({ tournament: { id: 'tournament-1', deletedAt: new Date(), competitionConfigVersionId: 'config-version-1', competitionConfig: FOOTBALL_V1_CONFIG } }),
    );

    await service.project(tx, revisionRow());

    expect(tx.v1TournamentStanding.upsert).not.toHaveBeenCalled();
  });

  it('tournament without an active competition config → skipped, no standings upserted', async () => {
    const tx = makeTx();
    tx.v1TournamentFixture.findUnique.mockResolvedValue({ groupId: 'group-1' });
    tx.v1TournamentGroup.findUnique.mockResolvedValue(
      groupRow({ tournament: { id: 'tournament-1', deletedAt: null, competitionConfigVersionId: null, competitionConfig: null } }),
    );

    await service.project(tx, revisionRow());

    expect(tx.v1TournamentStanding.upsert).not.toHaveBeenCalled();
  });

  it('group-phase group + completed OFFICIAL fixture → real calculateCompetitionStandings() result is upserted for both teams', async () => {
    const tx = makeTx();
    tx.v1TournamentFixture.findUnique.mockResolvedValue({ groupId: 'group-1' });
    tx.v1TournamentGroup.findUnique.mockResolvedValue(groupRow());

    await service.project(tx, revisionRow());

    const calls = (tx.v1TournamentStanding.upsert as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    const winner = calls.find((c) => c[0].create.registrationId === 'reg-1')?.[0].create;
    const loser = calls.find((c) => c[0].create.registrationId === 'reg-2')?.[0].create;
    expect(winner).toMatchObject({ groupId: 'group-1', points: 3, wins: 1, losses: 0, position: 1 });
    expect(loser).toMatchObject({ groupId: 'group-1', points: 0, wins: 0, losses: 1, position: 2 });
  });

  it('nested {regulation} backfill score shape → still recomputed correctly', async () => {
    const tx = makeTx();
    tx.v1TournamentFixture.findUnique.mockResolvedValue({ groupId: 'group-1' });
    tx.v1TournamentGroup.findUnique.mockResolvedValue(
      groupRow({
        fixtures: [
          {
            homeRegistrationId: 'reg-1',
            awayRegistrationId: 'reg-2',
            game: {
              currentOfficialRevision: {
                state: 'OFFICIAL',
                score: { regulation: { home: 1, away: 1 }, penalty: null, goals: [], incomplete: false },
              },
            },
          },
        ],
      }),
    );

    await service.project(tx, revisionRow());

    const calls = (tx.v1TournamentStanding.upsert as jest.Mock).mock.calls;
    for (const call of calls) {
      expect(call[0].create.points).toBe(1);
      expect(call[0].create.draws).toBe(1);
    }
  });
});
