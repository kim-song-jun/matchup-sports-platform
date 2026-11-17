import { calculateCompetitionStandings, calculateCompetitionStandingsWithTies, type StandingFixture } from './competition-standings';
import { FOOTBALL_V1_CONFIG, REQUIRED_TIE_BREAK_ORDER } from './competition-config.presets';
import type { CompetitionConfig } from './competition-config.types';
import { withTournamentTieBreakOrder } from './tournament-tie-break-order';

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

  it('같은 승점 집단에 진짜 동률 한 쌍과 맞대결로 갈린 한 쌍이 같이 있으면 진짜 동률만 묶는다', () => {
    // A, B, C and D all finish on 3 points (E and F only supply the points). A and B are level on every criterion;
    // C and D are level on overall goals too, but C beat D head-to-head, so only A and B are left to the draw.
    const { standings, drawnTies } = ties({
      registrationIds: ['A', 'B', 'C', 'D', 'E', 'F'],
      fixtures: [result('A', 'B', 1, 1), result('A', 'E', 1, 1), result('A', 'F', 1, 1), result('B', 'E', 1, 1), result('B', 'F', 1, 1),
        result('C', 'D', 1, 0), result('C', 'E', 0, 1), result('C', 'F', 0, 1), result('D', 'E', 1, 0), result('D', 'F', 0, 1)],
    });
    expect(standings.slice(2, 6).map((row) => row.points)).toEqual([3, 3, 3, 3]);
    expect(sortedTies(drawnTies)).toEqual([['A', 'B']]);
    const order = standings.map((row) => row.registrationId);
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('D'));
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

describe('calculateCompetitionStandings — 대회가 고른 동점 순서', () => {
  // A and B both finish on 3 points. A beat B 1-0 (head-to-head winner) but has the worse overall goal
  // difference (-2 vs +3), fewer goals (1 vs 4) and, in the fair-play case below, the worse discipline.
  const fixtures = [result('A', 'B', 1, 0), result('D', 'A', 3, 0), result('B', 'E', 4, 0), result('D', 'E', 1, 0)];
  const registrationIds = ['A', 'B', 'D', 'E'];
  const orderOf = (tieBreakOrder: CompetitionConfig['tieBreak']['order'], fairPlay?: ReadonlyMap<string, number>) =>
    calculateCompetitionStandings({
      tournamentId: 't1', configVersionId: 'cfg1', registrationIds, fixtures, fairPlayByRegistration: fairPlay,
      config: withTournamentTieBreakOrder(defaultTestConfig(), tieBreakOrder),
    }).map((row) => row.registrationId);

  it('기본 순서에서는 맞대결에서 이긴 팀이 득실이 나빠도 앞선다 — 순위가 바뀌지 않는 대조군', () => {
    expect(orderOf(REQUIRED_TIE_BREAK_ORDER)).toEqual(['D', 'A', 'B', 'E']);
    expect(calculateCompetitionStandings({ tournamentId: 't1', configVersionId: 'cfg1', registrationIds, fixtures, config: defaultTestConfig() })
      .map((row) => row.registrationId)).toEqual(['D', 'A', 'B', 'E']);
  });

  it('득실차를 맞대결보다 먼저 두면 득실이 좋은 팀이 앞선다', () => {
    expect(orderOf(['points', 'goal_difference', 'goals_for', 'head_to_head', 'fair_play', 'seeded_draw'])).toEqual(['D', 'B', 'A', 'E']);
  });

  it('다득점을 맞대결보다 먼저 두면 많이 넣은 팀이 앞선다', () => {
    expect(orderOf(['points', 'goals_for', 'head_to_head', 'goal_difference', 'fair_play', 'seeded_draw'])).toEqual(['D', 'B', 'A', 'E']);
  });

  it('MD-QA #186: 최소 실점을 맞대결보다 먼저 두면 덜 먹은 팀이 앞선다', () => {
    expect(orderOf(['points', 'fewest_goals_against', 'head_to_head', 'goal_difference', 'goals_for', 'fair_play', 'seeded_draw'])).toEqual(['D', 'B', 'A', 'E']);
  });

  it('MD-QA #186: 득실차가 같으면 최소 실점이 다득점과 반대로 가를 수 있다', () => {
    // X 2-1 Z, Y 1-0 Z, X 2-2 Y: X and Y both 4 points, goal difference +1, X scored more (4 vs 3) but conceded more (3 vs 2).
    const ids = ['X', 'Y', 'Z'];
    const games = [result('X', 'Z', 2, 1), result('Y', 'Z', 1, 0), result('X', 'Y', 2, 2)];
    const rank = (order: CompetitionConfig['tieBreak']['order']) => calculateCompetitionStandings({
      tournamentId: 't1', configVersionId: 'cfg1', registrationIds: ids, fixtures: games, config: withTournamentTieBreakOrder(defaultTestConfig(), order),
    }).map((row) => row.registrationId);
    expect(rank(['points', 'goal_difference', 'goals_for', 'fewest_goals_against', 'head_to_head', 'fair_play', 'seeded_draw'])).toEqual(['X', 'Y', 'Z']);
    expect(rank(['points', 'goal_difference', 'fewest_goals_against', 'goals_for', 'head_to_head', 'fair_play', 'seeded_draw'])).toEqual(['Y', 'X', 'Z']);
  });

  it('MD-QA #186: 옛 6칸 순서와 7칸으로 읽은 순서는 같은 순위를 낸다', () => {
    expect(orderOf(['points', 'goal_difference', 'goals_for', 'head_to_head', 'fair_play', 'fewest_goals_against', 'seeded_draw']))
      .toEqual(orderOf(['points', 'goal_difference', 'goals_for', 'head_to_head', 'fair_play', 'seeded_draw']));
  });

  it('페어플레이를 맨 앞에 두면 벌점이 적은 팀이 앞선다', () => {
    const fairPlay = new Map([['A', 6], ['B', 0]]);
    expect(orderOf(REQUIRED_TIE_BREAK_ORDER, fairPlay)).toEqual(['D', 'A', 'B', 'E']);
    expect(orderOf(['points', 'fair_play', 'head_to_head', 'goal_difference', 'goals_for', 'seeded_draw'], fairPlay)).toEqual(['D', 'B', 'A', 'E']);
  });

  describe('맞대결이 앞 기준으로 갈리지 않은 팀들끼리만 따진다', () => {
    // A, B and C all beat D and each other in a cycle (A>B 5-0, B>C 1-0, C>A 1-0): 6 points each, overall
    // goal difference A +5, B +1, C +1. B and C are still level after goal difference, and B beat C directly.
    // A mini-table over all three would let the A-C result drag B below C; the direct game decides instead.
    const cycle = [
      result('A', 'B', 5, 0), result('B', 'C', 1, 0), result('C', 'A', 1, 0),
      result('A', 'D', 1, 0), result('B', 'D', 5, 0), result('C', 'D', 1, 0),
    ];
    const cycleOrder = (tieBreakOrder: CompetitionConfig['tieBreak']['order']) =>
      calculateCompetitionStandings({
        tournamentId: 't1', configVersionId: 'cfg1', registrationIds: ['A', 'B', 'C', 'D'], fixtures: cycle,
        config: withTournamentTieBreakOrder(defaultTestConfig(), tieBreakOrder),
      }).map((row) => row.registrationId);

    it('득실차 다음에 맞대결이면 같은 득실의 두 팀은 서로의 경기로 가른다', () => {
      expect(cycleOrder(['points', 'goal_difference', 'head_to_head', 'goals_for', 'fair_play', 'seeded_draw'])).toEqual(['A', 'B', 'C', 'D']);
    });

    it('다득점이 먼저여도 같은 결과다 — 앞 기준이 이미 B 를 C 앞에 둔다', () => {
      expect(cycleOrder(['points', 'goal_difference', 'goals_for', 'head_to_head', 'fair_play', 'seeded_draw'])).toEqual(['A', 'B', 'C', 'D']);
    });

    it('맞대결이 승점 바로 다음이면 세 팀 전체의 맞대결 성적표를 쓴다 — 기본 순서는 그대로', () => {
      expect(cycleOrder(REQUIRED_TIE_BREAK_ORDER)).toEqual(['A', 'C', 'B', 'D']);
    });
  });

  it('순서를 바꿔도 추첨으로만 갈린 묶음은 같다 — 어느 기준으로도 안 갈린 팀은 순서와 무관하다', () => {
    const level = [result('A', 'B', 1, 1), result('A', 'C', 1, 0), result('B', 'C', 1, 0)];
    const input = { tournamentId: 't1', configVersionId: 'cfg1', registrationIds: ['A', 'B', 'C'], fixtures: level };
    const base = calculateCompetitionStandingsWithTies({ ...input, config: defaultTestConfig() });
    const reordered = calculateCompetitionStandingsWithTies({
      ...input, config: withTournamentTieBreakOrder(defaultTestConfig(), ['points', 'fair_play', 'goals_for', 'goal_difference', 'head_to_head', 'seeded_draw']),
    });
    expect(sortedTies(reordered.drawnTies)).toEqual(sortedTies(base.drawnTies));
    expect(sortedTies(reordered.drawnTies)).toEqual([['A', 'B']]);
  });
});
