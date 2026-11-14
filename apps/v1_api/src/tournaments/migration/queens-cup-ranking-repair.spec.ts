import { Prisma, PrismaClient } from '@prisma/client';
import { FOOTBALL_V1_CONFIG, calculateCompetitionStandings } from '../competition-config/competition-config';
import { loadCanonicalStandingsSource } from '../tournament-standings-source';
import { QUEENS_CUP_ID, QUEENS_CUP_ORDER, repairQueensCupRanking } from './queens-cup-ranking-repair';
import { TOURNAMENT_TIE_BREAK_PRESETS } from '../competition-config/tournament-tie-break-presets';

jest.mock('../tournament-standings-source', () => ({ loadCanonicalStandingsSource: jest.fn() }));
const loadSource = jest.mocked(loadCanonicalStandingsSource);

// Synthetic full round robins, not a copy of the live event's 60 matches.
function source() {
  return {
    config: FOOTBALL_V1_CONFIG, configVersionId: 'config', recalculatedAt: new Date('2026-11-14T08:00:00Z'),
    groups: ['A', 'B', 'C', 'D'].map((id) => {
      const teams = Array.from({ length: 6 }, (_, n) => `${id}${n}`);
      return {
        id, groupTeams: teams.map((registrationId) => ({ registrationId })),
        fixtures: teams.flatMap((homeRegistrationId, home) => teams.slice(home + 1).map((awayRegistrationId) => ({
          homeRegistrationId, awayRegistrationId,
          game: { currentOfficialRevision: { state: 'OFFICIAL', score: id !== 'C' ? { home: 1, away: 0 }
            : homeRegistrationId === 'C0' && awayRegistrationId === 'C1' ? { home: 1, away: 0 }
            : homeRegistrationId === 'C0' && awayRegistrationId === 'C2' ? { home: 0, away: 1 }
            : homeRegistrationId === 'C1' && awayRegistrationId === 'C2' ? { home: 4, away: 0 }
            : homeRegistrationId === 'C2' && awayRegistrationId === 'C3' ? { home: 1, away: 0 }
            : { home: 0, away: 0 } } },
        }))),
      };
    }),
  };
}

function setup() {
  loadSource.mockReset();
  loadSource.mockResolvedValue(source());
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1), $queryRaw: jest.fn().mockResolvedValue([]),
    v1Tournament: {
      findFirst: jest.fn<Promise<Record<string, unknown> | null>, unknown[]>().mockResolvedValue({ title: 'The QUEENS CUP(퀸즈컵)', kind: 'regular_tournament', format: 'league_knockouts', tieBreakOrder: null }),
      update: jest.fn().mockResolvedValue({}),
    },
    v1TournamentStageTieBreakSetting: { count: jest.fn().mockResolvedValue(0) },
    v1TournamentStanding: { upsert: jest.fn<Promise<unknown>, [Prisma.V1TournamentStandingUpsertArgs]>().mockResolvedValue({}) },
    v1TournamentOverallStanding: { deleteMany: jest.fn().mockResolvedValue({}), upsert: jest.fn().mockResolvedValue({}) },
    v1OperationAudit: { findFirst: jest.fn<Promise<{ id: string } | null>, unknown[]>().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
  };
  const transaction = jest.fn().mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  return { tx, prisma: { $transaction: transaction } as unknown as PrismaClient };
}

describe('Queens Cup ranking repair', () => {
  it('prefers overall goal difference/goals for when head-to-head would rank differently', () => {
    // Synthetic tie: A beats B, B beats X heavily, X beats A. Both have 3 points;
    // B must lead on overall goal difference despite losing their direct match.
    const fixtures = [
      { homeRegistrationId: 'A', awayRegistrationId: 'B', homeScore: 1, awayScore: 0 },
      { homeRegistrationId: 'B', awayRegistrationId: 'X', homeScore: 4, awayScore: 0 },
      { homeRegistrationId: 'X', awayRegistrationId: 'A', homeScore: 1, awayScore: 0 },
      { homeRegistrationId: 'X', awayRegistrationId: 'Y', homeScore: 1, awayScore: 0 },
    ];
    const input = { tournamentId: QUEENS_CUP_ID, configVersionId: 'config', registrationIds: ['A', 'B', 'X', 'Y'], fixtures };
    const old = calculateCompetitionStandings({ ...input, config: { ...FOOTBALL_V1_CONFIG, tieBreak: { ...FOOTBALL_V1_CONFIG.tieBreak, order: [...TOURNAMENT_TIE_BREAK_PRESETS[0].order] } } });
    const corrected = calculateCompetitionStandings({ ...input, config: { ...FOOTBALL_V1_CONFIG, tieBreak: { ...FOOTBALL_V1_CONFIG.tieBreak, order: QUEENS_CUP_ORDER } } });
    expect(corrected.map((row) => row.registrationId)).toEqual(['X', 'B', 'A', 'Y']);
    expect(old.map((row) => row.registrationId)).toEqual(['X', 'A', 'B', 'Y']);
  });

  it('writes 24 real calculated group and overall rows and a completion receipt', async () => {
    const { tx, prisma } = setup();
    await expect(repairQueensCupRanking(prisma)).resolves.toEqual({ status: 'repaired', groups: 4 });
    expect(tx.v1Tournament.update).toHaveBeenCalledWith({ where: { id: QUEENS_CUP_ID }, data: { tieBreakOrder: QUEENS_CUP_ORDER } });
    expect(tx.v1TournamentStanding.upsert).toHaveBeenCalledTimes(24);
    expect(tx.v1TournamentOverallStanding.upsert).toHaveBeenCalledTimes(24);
    for (const [call] of tx.v1TournamentStanding.upsert.mock.calls) {
      if (call.create.registrationId?.startsWith('C')) continue;
      const n = Number(call.create.registrationId?.slice(1));
      expect(call.create).toMatchObject({ position: n + 1, wins: 5 - n, losses: n, points: (5 - n) * 3, goalsFor: 5 - n, goalsAgainst: n });
    }
    const cRows = tx.v1TournamentStanding.upsert.mock.calls.map(([call]) => call.create).filter((row) => row.registrationId?.startsWith('C'));
    expect(cRows.find((row) => row.registrationId === 'C1')).toMatchObject({ position: 2, points: 6, goalsFor: 4, goalsAgainst: 1 });
    expect(cRows.find((row) => row.registrationId === 'C0')).toMatchObject({ position: 3, points: 6, goalsFor: 1, goalsAgainst: 1 });
    expect(tx.v1OperationAudit.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ after: { tieBreakOrder: QUEENS_CUP_ORDER } }) }));
  });

  it.each(['absent', 'already_repaired'] as const)('does not overwrite when %s', async (status) => {
    const { tx, prisma } = setup();
    if (status === 'absent') tx.v1Tournament.findFirst.mockResolvedValue(null);
    else tx.v1OperationAudit.findFirst.mockResolvedValue({ id: 'receipt' });
    await expect(repairQueensCupRanking(prisma)).resolves.toEqual({ status });
    expect(loadSource).not.toHaveBeenCalled();
    expect(tx.v1Tournament.update).not.toHaveBeenCalled();
  });

  it.each(['identity', 'order', 'stage', 'incomplete', 'unofficial'] as const)('rejects %s drift before writes', async (drift) => {
    const { tx, prisma } = setup();
    if (drift === 'identity') tx.v1Tournament.findFirst.mockResolvedValue({ title: 'Other', kind: 'regular_tournament', format: 'league_knockouts', tieBreakOrder: null });
    if (drift === 'order') tx.v1Tournament.findFirst.mockResolvedValue({ title: 'The QUEENS CUP(퀸즈컵)', kind: 'regular_tournament', format: 'league_knockouts', tieBreakOrder: ['points', 'goals_for', 'goal_difference', 'fewest_goals_against', 'head_to_head', 'fair_play', 'seeded_draw'] });
    if (drift === 'stage') tx.v1TournamentStageTieBreakSetting.count.mockResolvedValue(1);
    const invalid = source();
    if (drift === 'incomplete') invalid.groups[0].fixtures.pop();
    if (drift === 'unofficial') invalid.groups[0].fixtures[0].game.currentOfficialRevision.state = 'VOID';
    if (drift === 'incomplete' || drift === 'unofficial') loadSource.mockResolvedValue(invalid);
    await expect(repairQueensCupRanking(prisma)).rejects.toThrow('QUEENS_CUP_REPAIR_');
    expect(tx.v1Tournament.update).not.toHaveBeenCalled();
    expect(tx.v1OperationAudit.create).not.toHaveBeenCalled();
  });

  it('propagates write failure without a completion receipt', async () => {
    const { tx, prisma } = setup();
    tx.v1TournamentStanding.upsert.mockRejectedValue(new Error('write failed'));
    await expect(repairQueensCupRanking(prisma)).rejects.toThrow('write failed');
    expect(tx.v1OperationAudit.create).not.toHaveBeenCalled();
  });
});
