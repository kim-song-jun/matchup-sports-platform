import { findStandingsMismatches } from './tournament-standings-reconcile.cli';

describe('findStandingsMismatches', () => {
  it('조별 합계와 통합이 일치하면 불일치가 없다', () => {
    const mismatches = findStandingsMismatches(
      [
        { registrationId: 'r1', points: 6, wins: 2, draws: 0, losses: 0, goalsFor: 5, goalsAgainst: 1 },
        { registrationId: 'r2', points: 0, wins: 0, draws: 0, losses: 2, goalsFor: 1, goalsAgainst: 5 },
      ],
      [
        { registrationId: 'r1', points: 6, wins: 2, draws: 0, losses: 0, goalsFor: 5, goalsAgainst: 1 },
        { registrationId: 'r2', points: 0, wins: 0, draws: 0, losses: 2, goalsFor: 1, goalsAgainst: 5 },
      ],
    );
    expect(mismatches).toEqual([]);
  });

  it('승점이 다르면 불일치로 잡는다', () => {
    const mismatches = findStandingsMismatches(
      [{ registrationId: 'r1', points: 6, wins: 2, draws: 0, losses: 0, goalsFor: 5, goalsAgainst: 1 }],
      [{ registrationId: 'r1', points: 3, wins: 2, draws: 0, losses: 0, goalsFor: 5, goalsAgainst: 1 }],
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({ registrationId: 'r1', field: 'points', groupValue: 6, overallValue: 3 });
  });

  it('통합에 행이 아예 없으면 불일치로 잡는다', () => {
    const mismatches = findStandingsMismatches(
      [{ registrationId: 'r1', points: 3, wins: 1, draws: 0, losses: 0, goalsFor: 2, goalsAgainst: 0 }],
      [],
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].field).toBe('missing');
  });

  it('조별에 없는 팀이 통합에 남아 있으면 불일치로 잡는다', () => {
    const mismatches = findStandingsMismatches(
      [],
      [{ registrationId: 'ghost', points: 3, wins: 1, draws: 0, losses: 0, goalsFor: 2, goalsAgainst: 0 }],
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].field).toBe('orphan');
  });
});
