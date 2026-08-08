import { calculateSeriesStandings } from './series-standings';

const ORDER = ['points', 'goalDifference', 'goalsFor', 'headToHead'] as const;

describe('calculateSeriesStandings', () => {
  it('승점 우선 — 이긴 팀이 1위', () => {
    const result = calculateSeriesStandings({
      teamIds: ['A', 'B'],
      fixtures: [{ homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 1 }],
      tieBreakOrder: ORDER,
    });
    expect(result[0]).toMatchObject({ teamId: 'A', points: 3, position: 1 });
    expect(result[1]).toMatchObject({ teamId: 'B', points: 0, position: 2 });
  });

  it('승점·골득실·다득점이 모두 같으면 맞대결(승자승)로 갈린다', () => {
    const fixtures = [
      { homeTeamId: 'A', awayTeamId: 'B', homeScore: 3, awayScore: 1 }, // A 승
      { homeTeamId: 'B', awayTeamId: 'C', homeScore: 3, awayScore: 1 }, // B 승
      { homeTeamId: 'C', awayTeamId: 'A', homeScore: 1, awayScore: 3 }, // A 승
    ];
    // A: 2승 6점 GF6/GA2, B: 1승1패 3점 GF4/GA4, C: 2패 0점 — h2h를 안 타도 이미 갈림
    const result = calculateSeriesStandings({ teamIds: ['A', 'B', 'C'], fixtures, tieBreakOrder: ORDER });
    expect(result.map((r) => r.teamId)).toEqual(['A', 'B', 'C']);
  });

  it('전체 지표가 완전히 동일하면 팀ID 사전순으로 결정적으로 정렬한다', () => {
    const fixtures = [{ homeTeamId: 'B', awayTeamId: 'A', homeScore: 1, awayScore: 1 }];
    const result = calculateSeriesStandings({ teamIds: ['A', 'B'], fixtures, tieBreakOrder: ORDER });
    expect(result.map((r) => r.teamId)).toEqual(['A', 'B']);
    expect(result[0].points).toBe(result[1].points);
  });

  it('요약 필드(played/wins/losses/goalsFor/goalsAgainst/points)가 정확히 누적된다', () => {
    const fixtures = [
      { homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 0 },
      { homeTeamId: 'A', awayTeamId: 'C', homeScore: 0, awayScore: 1 },
    ];
    const result = calculateSeriesStandings({ teamIds: ['A', 'B', 'C'], fixtures, tieBreakOrder: ORDER });
    const a = result.find((r) => r.teamId === 'A')!;
    expect(a).toMatchObject({ played: 2, wins: 1, losses: 1, goalsFor: 1, goalsAgainst: 1, points: 3 });
  });

  it('미확정 경기(fixtures에 없는 팀)는 played=0으로 남아 순위 계산에서 자연히 밀린다', () => {
    const result = calculateSeriesStandings({ teamIds: ['A', 'B', 'C'], fixtures: [], tieBreakOrder: ORDER });
    expect(result.every((r) => r.played === 0 && r.points === 0)).toBe(true);
    expect(result.map((r) => r.teamId)).toEqual(['A', 'B', 'C']); // 사전순 폴백
  });
});
