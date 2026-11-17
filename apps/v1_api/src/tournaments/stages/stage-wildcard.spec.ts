import { wildcardRankCandidates } from './stage-wildcard';
const row = (registrationId: string, points: number, played: number, goalsFor = 3) => ({ registrationId, points, wins: played, draws: 0, losses: 0, goalsFor, goalsAgainst: 0, fairPlayPoints: 0 });
describe('wildcard official cross-pool comparison', () => {
  it('compares ratios when the pool sizes differ', () => {
    expect(wildcardRankCandidates([row('a', 6, 3), row('b', 9, 5)], 1)).toEqual(['a']);
  });
  it('returns every tied sporting candidate without choosing an id as the winner', () => {
    expect(wildcardRankCandidates([row('z', 6, 3), row('a', 6, 3)], 2)).toEqual(['z', 'a']);
  });
  it('does not advance a candidate with no played matches', () => {
    expect(wildcardRankCandidates([row('a', 0, 0)], 1)).toEqual([]);
  });
});
