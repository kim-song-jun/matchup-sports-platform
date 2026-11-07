import { calculateCompetitionStandings, calculateCompetitionStandingsWithTies, type StandingFixture } from './competition-standings';
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

const result = (home: string, away: string, homeScore: number, awayScore: number): StandingFixture => ({
  homeRegistrationId: home, awayRegistrationId: away, homeScore, awayScore,
});
const ties = (input: { registrationIds: string[]; fixtures: StandingFixture[]; fairPlay?: ReadonlyMap<string, number> }) =>
  calculateCompetitionStandingsWithTies({
    tournamentId: 't1', configVersionId: 'cfg1', registrationIds: input.registrationIds, fixtures: input.fixtures,
    config: defaultTestConfig(), fairPlayByRegistration: input.fairPlay,
  });
const sortedTies = (groups: string[][]) => groups.map((group) => [...group].sort()).sort((left, right) => left[0].localeCompare(right[0]));

describe('calculateCompetitionStandingsWithTies — 추첨으로만 갈린 묶음', () => {
  it('승점·맞대결·득실·득점·페어플레이가 모두 같은 두 팀은 한 묶음이고 순위는 둘 다 유일하게 매겨진다', () => {
    const { standings, drawnTies } = ties({
      registrationIds: ['A', 'B', 'C'],
      fixtures: [result('A', 'B', 1, 1), result('A', 'C', 1, 0), result('B', 'C', 1, 0)],
    });
    expect(sortedTies(drawnTies)).toEqual([['A', 'B']]);
    expect(standings.map((row) => row.position)).toEqual([1, 2, 3]);
    expect(standings[2].registrationId).toBe('C');
  });

  it('페어플레이 벌점만 달라도 동률이 아니다 — 저장 순위가 벌점으로 갈랐다', () => {
    const { standings, drawnTies } = ties({
      registrationIds: ['A', 'B', 'C'],
      fixtures: [result('A', 'B', 1, 1), result('A', 'C', 1, 0), result('B', 'C', 1, 0)],
      fairPlay: new Map([['A', 0], ['B', 2]]),
    });
    expect(drawnTies).toEqual([]);
    expect(standings.map((row) => row.registrationId)).toEqual(['A', 'B', 'C']);
  });

  it('승점·득실·득점이 같아도 맞대결에서 이긴 팀이 있으면 동률이 아니다', () => {
    // A and B both have 6 points, +1 goal difference and 2 goals; only their head-to-head separates them (A won).
    const { standings, drawnTies } = ties({
      registrationIds: ['A', 'B', 'C', 'D'],
      fixtures: [result('A', 'B', 1, 0), result('A', 'C', 1, 0), result('D', 'A', 1, 0),
        result('B', 'C', 1, 0), result('B', 'D', 1, 0), result('C', 'D', 1, 0)],
    });
    expect(drawnTies).toEqual([]);
    expect(standings.slice(0, 2).map((row) => row.registrationId)).toEqual(['A', 'B']);
  });

  it('세 팀이 서로 한 번씩 1-0 으로 이긴 순환은 세 팀이 한 묶음이다', () => {
    const { standings, drawnTies } = ties({
      registrationIds: ['A', 'B', 'C'],
      fixtures: [result('A', 'B', 1, 0), result('B', 'C', 1, 0), result('C', 'A', 1, 0)],
    });
    expect(sortedTies(drawnTies)).toEqual([['A', 'B', 'C']]);
    expect(new Set(standings.map((row) => row.position)).size).toBe(3);
  });

  it('진짜 동률 한 쌍과 맞대결로 갈린 한 쌍이 한 조에 같이 있으면 진짜 동률만 묶는다', () => {
    // A and B are level on everything (7 points); C and D are level on points but C won the head-to-head.
    const { drawnTies } = ties({
      registrationIds: ['A', 'B', 'C', 'D'],
      fixtures: [result('A', 'B', 0, 0), result('A', 'C', 1, 0), result('A', 'D', 1, 0),
        result('B', 'C', 1, 0), result('B', 'D', 1, 0), result('C', 'D', 1, 0)],
    });
    expect(sortedTies(drawnTies)).toEqual([['A', 'B']]);
  });

  it('승점이 다른 두 자리에 각각 완전 동률이 있으면 묶음도 둘이다', () => {
    const { drawnTies } = ties({
      registrationIds: ['A', 'B', 'C', 'D'],
      fixtures: [result('A', 'B', 0, 0), result('C', 'D', 0, 0), result('A', 'C', 1, 0), result('A', 'D', 1, 0),
        result('B', 'C', 1, 0), result('B', 'D', 1, 0)],
    });
    expect(sortedTies(drawnTies)).toEqual([['A', 'B'], ['C', 'D']]);
  });

  it('경기 결과가 하나도 없는 조는 팀 전원이 한 묶음이다', () => {
    const { drawnTies } = ties({ registrationIds: ['A', 'B', 'C'], fixtures: [] });
    expect(sortedTies(drawnTies)).toEqual([['A', 'B', 'C']]);
  });

  it('묶음은 추첨 시드(대회·설정 버전)와 무관하다 — 순서만 바뀔 수 있다', () => {
    const fixtures = [result('A', 'B', 1, 1), result('A', 'C', 1, 0), result('B', 'C', 1, 0)];
    const first = calculateCompetitionStandingsWithTies({ tournamentId: 't1', configVersionId: 'cfg1', registrationIds: ['A', 'B', 'C'], fixtures, config: defaultTestConfig() });
    const second = calculateCompetitionStandingsWithTies({ tournamentId: 't2', configVersionId: 'cfg2', registrationIds: ['A', 'B', 'C'], fixtures, config: defaultTestConfig() });
    expect(sortedTies(second.drawnTies)).toEqual(sortedTies(first.drawnTies));
  });
});
