import { classifyTeamRecordCategory } from './team-record-category';

describe('classifyTeamRecordCategory', () => {
  it('classifies a tournament-sourced fact as tournament', () => {
    expect(classifyTeamRecordCategory({ tournamentId: 'tournament-1', leagueId: null })).toBe('tournament');
  });

  it('classifies a league team-match fact as league', () => {
    expect(classifyTeamRecordCategory({ tournamentId: null, leagueId: 'league-1' })).toBe('league');
  });

  it('classifies a single team match with neither id as friendly', () => {
    expect(classifyTeamRecordCategory({ tournamentId: null, leagueId: null })).toBe('friendly');
  });

  it('prefers tournament when both ids are present (schema invariant says this never happens, but the function stays defensive)', () => {
    expect(classifyTeamRecordCategory({ tournamentId: 'tournament-1', leagueId: 'league-1' })).toBe('tournament');
  });
});
