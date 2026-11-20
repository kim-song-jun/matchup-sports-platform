import { stageSixTeamView } from './stage-six-team';
describe('stage six-team progression gates', () => {
  const results = () => [
    { id: 'a', homeRegistrationId: 'a1', awayRegistrationId: 'a2', revisionId: 'r1', score: { home: 4, away: 3 } },
    { id: 'b', homeRegistrationId: 'b1', awayRegistrationId: 'b2', revisionId: 'r2', score: { home: 3, away: 0 } },
    { id: 'c', homeRegistrationId: 'c1', awayRegistrationId: 'c2', revisionId: 'r3', score: { home: 2, away: 0 } },
    { id: 'semi', homeRegistrationId: 'b1', awayRegistrationId: 'c1', revisionId: null, score: null },
    { id: 'final', homeRegistrationId: 'a1', awayRegistrationId: null, revisionId: null, score: null },
  ];
  it('applies the configured sporting order without choosing a tied registration id', () => {
    expect(stageSixTeamView(results()).automaticBye).toBe('a1');
    expect(stageSixTeamView(results(), undefined, ['goal_difference', 'goals_for', 'fewest_goals_against']).automaticBye).toBe('b1');
  });
  it('blocks a semifinal until its actual teams match the current official winners and bye', () => {
    expect(stageSixTeamView(results()).semifinalReady).toBe(true);
    expect(stageSixTeamView(results(), undefined, ['goal_difference', 'goals_for', 'fewest_goals_against']).semifinalReady).toBe(false);
    expect(stageSixTeamView(results()).finalReady).toBe(false);
  });
});
