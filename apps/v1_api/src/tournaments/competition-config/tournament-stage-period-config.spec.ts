import { resolveTournamentStageCompetitionConfigVersionId } from './tournament-stage-period-config';

describe('resolveTournamentStageCompetitionConfigVersionId', () => {
  it('uses the exact group phase override', async () => {
    const tx = {
      v1TournamentGroup: { findFirst: jest.fn().mockResolvedValue({ phase: 'final' }) },
      v1TournamentStagePeriodSetting: { findUnique: jest.fn().mockResolvedValue({ competitionConfigVersionId: 'final-config' }) },
    };

    await expect(resolveTournamentStageCompetitionConfigVersionId(tx as never, {
      tournamentId: 't-1', groupId: 'g-final', round: '결승', defaultCompetitionConfigVersionId: 'default-config',
    })).resolves.toBe('final-config');
    expect(tx.v1TournamentStagePeriodSetting.findUnique).toHaveBeenCalledWith({
      where: { tournamentId_phase: { tournamentId: 't-1', phase: 'final' } },
      select: { competitionConfigVersionId: true },
    });
  });

  it('falls back to the tournament default when the phase has no override', async () => {
    const tx = {
      v1TournamentGroup: { findFirst: jest.fn().mockResolvedValue({ phase: 'group' }) },
      v1TournamentStagePeriodSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    await expect(resolveTournamentStageCompetitionConfigVersionId(tx as never, {
      tournamentId: 't-1', groupId: 'g-a', round: 'group_a', defaultCompetitionConfigVersionId: 'default-config',
    })).resolves.toBe('default-config');
  });

  it('recognizes a group-less final by its canonical round label', async () => {
    const tx = {
      v1TournamentGroup: { findFirst: jest.fn() },
      v1TournamentStagePeriodSetting: { findUnique: jest.fn().mockResolvedValue({ competitionConfigVersionId: 'final-config' }) },
    };
    await expect(resolveTournamentStageCompetitionConfigVersionId(tx as never, {
      tournamentId: 't-1', groupId: null, round: 'final', defaultCompetitionConfigVersionId: 'default-config',
    })).resolves.toBe('final-config');
    expect(tx.v1TournamentGroup.findFirst).not.toHaveBeenCalled();
  });
});
