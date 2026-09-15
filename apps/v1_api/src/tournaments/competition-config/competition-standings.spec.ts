import { calculateCompetitionStandings } from './competition-standings';
import { FOOTBALL_V1_CONFIG } from './competition-config.presets';

function defaultTestConfig() {
  return FOOTBALL_V1_CONFIG;
}

describe('calculateCompetitionStandings', () => {
  it('승점이 많은 팀이 상위에 온다', () => {
    const standings = calculateCompetitionStandings({
      tournamentId: 't1',
      configVersionId: 'cfg1',
      registrationIds: ['winner', 'loser'],
      fixtures: [
        { homeRegistrationId: 'winner', awayRegistrationId: 'loser', homeScore: 2, awayScore: 0 },
      ],
      config: defaultTestConfig(),
    });
    expect(standings[0].registrationId).toBe('winner');
    expect(standings[0].points).toBe(3);
    expect(standings[1].registrationId).toBe('loser');
    expect(standings[1].points).toBe(0);
  });

  it('fairPlayByRegistration을 주지 않으면 fairPlayPoints는 전부 0이다', () => {
    const standings = calculateCompetitionStandings({
      tournamentId: 't1',
      configVersionId: 'cfg1',
      registrationIds: ['a', 'b'],
      fixtures: [],
      config: defaultTestConfig(),
    });
    for (const standing of standings) {
      expect(standing.fairPlayPoints).toBe(0);
    }
  });

  it('승점·득실차·다득점이 모두 같으면 페어플레이 벌점이 낮은 팀이 앞선다', () => {
    const standings = calculateCompetitionStandings({
      tournamentId: 't1',
      configVersionId: 'cfg1',
      registrationIds: ['clean', 'dirty'],
      fixtures: [
        { homeRegistrationId: 'clean', awayRegistrationId: 'dirty', homeScore: 1, awayScore: 1 },
      ],
      config: defaultTestConfig(),
      fairPlayByRegistration: new Map([
        ['clean', 1],
        ['dirty', 7],
      ]),
    });
    expect(standings[0].registrationId).toBe('clean');
    expect(standings[1].registrationId).toBe('dirty');
  });
});
