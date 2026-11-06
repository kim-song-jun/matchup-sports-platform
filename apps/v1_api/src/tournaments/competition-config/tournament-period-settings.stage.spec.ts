import { V1CompetitionKind } from '@prisma/client';
import { periodsActor, teamMatchPeriodsFixture } from '../../team-matches/team-match-periods.service.fixtures';

describe('TournamentPeriodSettingsService stage overrides', () => {
  it('stores a final-only override and can return it to the tournament default', async () => {
    const fixture = await teamMatchPeriodsFixture();
    const saved = await fixture.tournamentService.update(periodsActor, fixture.tournament.id, {
      expectedVersion: fixture.tournament.updatedAt.toISOString(),
      phase: 'final',
      periods: [{ durationMinutes: 10 }, { durationMinutes: 10 }],
    });

    expect(saved).toMatchObject({
      changed: true,
      kind: 'regular_tournament',
      stageOverrides: [{ phase: 'final', periods: [
        { durationMinutes: 10, label: '전반' },
        { durationMinutes: 10, label: '후반' },
      ] }],
    });
    expect(fixture.tournament.competitionConfigVersionId).toBe(fixture.baseConfig.id);
    expect(fixture.stagePeriodSettings).toHaveLength(1);
    expect(fixture.stagePeriodSettings[0].competitionConfig).toMatchObject({
      events: fixture.baseConfig.events,
      lineup: fixture.baseConfig.lineup,
      result: fixture.baseConfig.result,
      tieBreak: fixture.baseConfig.tieBreak,
      visibility: fixture.baseConfig.visibility,
    });

    const inherited = await fixture.tournamentService.update(periodsActor, fixture.tournament.id, {
      expectedVersion: saved.expectedVersion,
      phase: 'final',
      inheritDefault: true,
    });
    expect(inherited).toMatchObject({ changed: true, stageOverrides: [] });
    expect(fixture.stagePeriodSettings).toHaveLength(0);
    await fixture.module.close();
  });

  it('rejects stage overrides for a regular league', async () => {
    const fixture = await teamMatchPeriodsFixture();
    fixture.tournament.kind = V1CompetitionKind.regular_league;
    await expect(fixture.tournamentService.update(periodsActor, fixture.tournament.id, {
      expectedVersion: fixture.tournament.updatedAt.toISOString(),
      phase: 'group',
      periods: [{ durationMinutes: 15 }],
    })).rejects.toMatchObject({ response: { code: 'TOURNAMENT_STAGE_PERIODS_UNSUPPORTED' } });
    await fixture.module.close();
  });
});
