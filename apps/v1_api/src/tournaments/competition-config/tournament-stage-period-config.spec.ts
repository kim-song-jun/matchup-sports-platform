import { inPeriodScope, resolveTournamentFixturePeriodSource, resolveTournamentStageCompetitionConfigVersionId, type FixturePeriodRow } from './tournament-stage-period-config';

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

  it('prefers the group override over the stage setting', async () => {
    const tx = {
      v1TournamentGroup: { findFirst: jest.fn().mockResolvedValue({ name: 'B조', phase: 'group', competitionConfigVersionId: 'group-b-config' }) },
      v1TournamentStagePeriodSetting: { findUnique: jest.fn() },
    };
    await expect(resolveTournamentFixturePeriodSource(tx as never, {
      tournamentId: 't-1', groupId: 'g-b', round: 'B조', defaultCompetitionConfigVersionId: 'default-config',
    })).resolves.toEqual({ source: 'group', phase: 'group', groupName: 'B조', competitionConfigVersionId: 'group-b-config' });
    expect(tx.v1TournamentStagePeriodSetting.findUnique).not.toHaveBeenCalled();
  });
});

describe('inPeriodScope', () => {
  const row = (overrides: Partial<FixturePeriodRow>): FixturePeriodRow => ({
    teamMatchId: 'm', phase: 'group', groupId: 'g-a', groupOverridden: false, matchOverridden: false, ...overrides,
  });
  const stages = new Set(['group' as const]);

  it('keeps narrower settings out of wider scopes', () => {
    expect(inPeriodScope(row({}), { kind: 'stage', phase: 'group' }, stages)).toBe(true);
    expect(inPeriodScope(row({}), { kind: 'default' }, stages)).toBe(false);
    expect(inPeriodScope(row({ phase: 'final', groupId: 'g-f' }), { kind: 'default' }, stages)).toBe(true);
    expect(inPeriodScope(row({ groupOverridden: true }), { kind: 'stage', phase: 'group' }, stages)).toBe(false);
    expect(inPeriodScope(row({ groupOverridden: true }), { kind: 'group', groupId: 'g-a' }, stages)).toBe(true);
    expect(inPeriodScope(row({ matchOverridden: true }), { kind: 'group', groupId: 'g-a' }, stages)).toBe(false);
  });
});
