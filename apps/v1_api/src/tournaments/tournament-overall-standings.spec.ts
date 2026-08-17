import { overallStandingsInput } from './tournament-overall-standings';
import type { StandingsSourceGroup } from './tournament-group-standings';

function group(id: string, regIds: string[], fixtures: Array<[string, string, number, number]>): StandingsSourceGroup {
  return {
    id,
    groupTeams: regIds.map((registrationId) => ({ registrationId })),
    fixtures: fixtures.map(([home, away, hs, as]) => ({
      homeRegistrationId: home,
      awayRegistrationId: away,
      game: { currentOfficialRevision: { state: 'OFFICIAL', score: { home: hs, away: as } } },
    })),
  };
}

describe('overallStandingsInput', () => {
  it('모든 조의 참가팀과 경기를 하나로 합친다', () => {
    const input = overallStandingsInput([
      group('A', ['r1', 'r2'], [['r1', 'r2', 2, 0]]),
      group('B', ['r3', 'r4'], [['r3', 'r4', 1, 1]]),
    ]);
    expect(input.registrationIds.sort()).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(input.fixtures).toHaveLength(2);
  });

  it('같은 팀이 두 조에 중복 배정돼도 registrationId를 한 번만 넣는다', () => {
    const input = overallStandingsInput([
      group('A', ['r1', 'r2'], []),
      group('B', ['r2', 'r3'], []),
    ]);
    expect(input.registrationIds.sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it('조가 없으면 빈 입력을 만든다', () => {
    const input = overallStandingsInput([]);
    expect(input.registrationIds).toEqual([]);
    expect(input.fixtures).toEqual([]);
  });
});
