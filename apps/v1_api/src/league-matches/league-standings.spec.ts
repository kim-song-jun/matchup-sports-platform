import { calculateLeagueStandings, calculateLeagueStandingsWithTieBreakInfo } from './league-standings';

const ORDER = ['points', 'goalDifference', 'goalsFor', 'headToHead'] as const;

describe('calculateLeagueStandings', () => {
  it('승점 우선 — 이긴 팀이 1위', () => {
    const result = calculateLeagueStandings({
      teamIds: ['A', 'B'],
      fixtures: [{ homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 1 }],
      tieBreakOrder: ORDER,
    });
    expect(result[0]).toMatchObject({ teamId: 'A', points: 3, position: 1 });
    expect(result[1]).toMatchObject({ teamId: 'B', points: 0, position: 2 });
  });

  it('승점·골득실·다득점이 모두 같으면 맞대결(승자승)로 갈린다', () => {
    const fixtures = [
      { homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 0 }, // A 승 (h2h 1차전)
      { homeTeamId: 'B', awayTeamId: 'A', homeScore: 1, awayScore: 1 }, // 무 (h2h 2차전)
      { homeTeamId: 'A', awayTeamId: 'C', homeScore: 0, awayScore: 2 }, // A 패
      { homeTeamId: 'B', awayTeamId: 'C', homeScore: 2, awayScore: 0 }, // B 승
    ];
    // A: 승1무1패1 4점 GF3/GA3, B: 승1무1패1 4점 GF3/GA3 — 승점·골득실·다득점이
    // 완전히 동률이라 headToHead까지 내려가야 한다. A·B의 맞대결 2경기만 놓고
    // 보면 A가 3+1=4점, B가 0+1=1점으로 A가 우위.
    const result = calculateLeagueStandings({ teamIds: ['A', 'B', 'C'], fixtures, tieBreakOrder: ORDER });
    const a = result.find((r) => r.teamId === 'A')!;
    const b = result.find((r) => r.teamId === 'B')!;
    expect(a.points).toBe(b.points);
    expect(a.goalsFor - a.goalsAgainst).toBe(b.goalsFor - b.goalsAgainst);
    expect(a.goalsFor).toBe(b.goalsFor);
    expect(result.map((r) => r.teamId)).toEqual(['A', 'B', 'C']);
  });

  it('전체 지표가 완전히 동일하면 팀ID 사전순으로 결정적으로 정렬한다', () => {
    const fixtures = [{ homeTeamId: 'B', awayTeamId: 'A', homeScore: 1, awayScore: 1 }];
    const result = calculateLeagueStandings({ teamIds: ['A', 'B'], fixtures, tieBreakOrder: ORDER });
    expect(result.map((r) => r.teamId)).toEqual(['A', 'B']);
    expect(result[0].points).toBe(result[1].points);
  });

  it('요약 필드(played/wins/losses/goalsFor/goalsAgainst/points)가 정확히 누적된다', () => {
    const fixtures = [
      { homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 0 },
      { homeTeamId: 'A', awayTeamId: 'C', homeScore: 0, awayScore: 1 },
    ];
    const result = calculateLeagueStandings({ teamIds: ['A', 'B', 'C'], fixtures, tieBreakOrder: ORDER });
    const a = result.find((r) => r.teamId === 'A')!;
    expect(a).toMatchObject({ played: 2, wins: 1, losses: 1, goalsFor: 1, goalsAgainst: 1, points: 3 });
  });

  it('3팀 순환 동률(A>B>C>A)은 모든 기준이 소진되고 팀ID 사전순 폴백으로 결정적으로 정렬된다', () => {
    // A 1-0 B, B 1-0 C, C 1-0 A — 셋 다 1승 1패 3점, GD 0, GF 1이고 맞대결(h2h)조차
    // 같은 순환이라 미니 리그도 전원 3점 동률. 기준이 전부 소진되는 유일한 실전형 케이스다.
    const fixtures = [
      { homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 0 },
      { homeTeamId: 'B', awayTeamId: 'C', homeScore: 1, awayScore: 0 },
      { homeTeamId: 'C', awayTeamId: 'A', homeScore: 1, awayScore: 0 },
    ];
    const result = calculateLeagueStandings({ teamIds: ['A', 'B', 'C'], fixtures, tieBreakOrder: ORDER });
    expect(result.every((r) => r.points === 3 && r.goalsFor - r.goalsAgainst === 0 && r.goalsFor === 1)).toBe(true);
    expect(result.map((r) => r.teamId)).toEqual(['A', 'B', 'C']); // 사전순 폴백
    // teamIds 입력 순서가 달라도 같은 순위가 나와야 결정적이다.
    const shuffled = calculateLeagueStandings({ teamIds: ['C', 'A', 'B'], fixtures, tieBreakOrder: ORDER });
    expect(shuffled).toEqual(result);
  });

  it('3팀 동률에서 headToHead가 1팀만 분리하고 남은 2팀은 잔여 기준(goalDifference)으로 갈린다', () => {
    // A·B·C 모두 4점 동률. 맞대결(A 1-0 B, C 2-0 B, A 1-1 C)만 보면 A=4, C=4, B=0으로
    // B만 분리되고, A·C는 h2h로도 동률이라 다음 기준인 전체 goalDifference(C +2 > A +1)로
    // 갈린다. B의 전체 GD(+3)는 셋 중 최고이므로, headToHead를 건너뛰고 GD로 정렬했다면
    // B가 1위가 됐을 것이다 — 이 단언이 h2h가 실제로 먼저 적용됨을 증명한다.
    const fixtures = [
      { homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 0 },
      { homeTeamId: 'C', awayTeamId: 'B', homeScore: 2, awayScore: 0 },
      { homeTeamId: 'A', awayTeamId: 'C', homeScore: 1, awayScore: 1 },
      { homeTeamId: 'B', awayTeamId: 'D', homeScore: 6, awayScore: 0 },
      { homeTeamId: 'B', awayTeamId: 'D', homeScore: 0, awayScore: 0 },
    ];
    const result = calculateLeagueStandings({
      teamIds: ['A', 'B', 'C', 'D'],
      fixtures,
      tieBreakOrder: ['points', 'headToHead', 'goalDifference', 'goalsFor'],
    });
    const byId = new Map(result.map((r) => [r.teamId, r]));
    // 전제 검증: 셋이 승점 동률이고, B의 GD가 셋 중 가장 크다.
    expect(byId.get('A')!.points).toBe(4);
    expect(byId.get('B')!.points).toBe(4);
    expect(byId.get('C')!.points).toBe(4);
    const gd = (id: string) => byId.get(id)!.goalsFor - byId.get(id)!.goalsAgainst;
    expect(gd('B')).toBeGreaterThan(gd('C'));
    expect(gd('B')).toBeGreaterThan(gd('A'));
    expect(result.map((r) => r.teamId)).toEqual(['C', 'A', 'B', 'D']);
  });

  it('미확정 경기(fixtures에 없는 팀)는 played=0으로 남아 순위 계산에서 자연히 밀린다', () => {
    const result = calculateLeagueStandings({ teamIds: ['A', 'B', 'C'], fixtures: [], tieBreakOrder: ORDER });
    expect(result.every((r) => r.played === 0 && r.points === 0)).toBe(true);
    expect(result.map((r) => r.teamId)).toEqual(['A', 'B', 'C']); // 사전순 폴백
  });
});

// Task 153 Wave 2 감사 H-5 — "동률이 실제로 발생했는지 감지" (승강 확정 화면이
// "동률이라 임의로 갈렸어요" 안내를 띄우려면 필요). calculateLeagueStandingsWithTieBreakInfo
// 가 정렬 결과 자체는 절대 바꾸지 않으면서 감지만 얹는다는 게 이 스위트의 핵심 계약이다.
describe('calculateLeagueStandingsWithTieBreakInfo', () => {
  it('tie-break 기준을 모두 소진해 팀ID 사전순으로 갈린 팀들을 tieGroups로 잡는다', () => {
    // 3팀 순환 동률 — 위 스펙의 "모든 기준이 소진되고 팀ID 사전순 폴백" 케이스 재사용.
    const fixtures = [
      { homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 0 },
      { homeTeamId: 'B', awayTeamId: 'C', homeScore: 1, awayScore: 0 },
      { homeTeamId: 'C', awayTeamId: 'A', homeScore: 1, awayScore: 0 },
    ];
    const { standings, tieGroups } = calculateLeagueStandingsWithTieBreakInfo({
      teamIds: ['A', 'B', 'C'],
      fixtures,
      tieBreakOrder: ORDER,
    });
    // 정렬 결과는 calculateLeagueStandings 와 완전히 동일해야 한다 -- 감지가 계산을 바꾸지 않는다.
    expect(standings).toEqual(calculateLeagueStandings({ teamIds: ['A', 'B', 'C'], fixtures, tieBreakOrder: ORDER }));
    expect(tieGroups).toEqual([{ teamIds: ['A', 'B', 'C'] }]);
  });

  it('승점만 같고 골득실로 실제로 갈린 경우는 tieGroups에 잡히지 않는다(부분 동률 오탐 방지)', () => {
    const fixtures = [
      { homeTeamId: 'A', awayTeamId: 'C', homeScore: 3, awayScore: 0 }, // A 승점3, GD+3
      { homeTeamId: 'B', awayTeamId: 'C', homeScore: 1, awayScore: 0 }, // B 승점3, GD+1
    ];
    // A·B는 승점(3점)만 같고 goalDifference(criteria[1])에서 이미 갈린다 -- headToHead 까지도,
    // criteria 전부 소진까지도 가지 않으므로 tieGroups 에 잡히면 안 된다.
    const { tieGroups } = calculateLeagueStandingsWithTieBreakInfo({
      teamIds: ['A', 'B', 'C'],
      fixtures,
      tieBreakOrder: ORDER,
    });
    expect(tieGroups).toEqual([]);
  });

  it('동률 팀이 하나도 없으면 tieGroups가 빈 배열이다', () => {
    const fixtures = [{ homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 1 }];
    const { tieGroups } = calculateLeagueStandingsWithTieBreakInfo({ teamIds: ['A', 'B'], fixtures, tieBreakOrder: ORDER });
    expect(tieGroups).toEqual([]);
  });
});
