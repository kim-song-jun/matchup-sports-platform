import { generateRoundRobinFixtures } from './round-robin-schedule';

describe('generateRoundRobinFixtures', () => {
  it('4팀·3주에 모든 페어가 정확히 한 번씩 만나고, 라운드마다 팀이 중복 출전하지 않는다', () => {
    const fixtures = generateRoundRobinFixtures(['A', 'B', 'C', 'D'], 3);
    expect(fixtures).toHaveLength(6); // C(4,2)
    const pairKey = (h: string, a: string) => [h, a].sort().join('-');
    expect(new Set(fixtures.map((f) => pairKey(f.homeTeamId, f.awayTeamId))).size).toBe(6);
    for (let round = 1; round <= 3; round++) {
      const roundTeams = fixtures.filter((f) => f.round === round).flatMap((f) => [f.homeTeamId, f.awayTeamId]);
      expect(new Set(roundTeams).size).toBe(4);
    }
  });

  it('4팀·3주 홈 경기 수 최대-최소 차이가 1을 넘지 않는다(균등 배분)', () => {
    const fixtures = generateRoundRobinFixtures(['A', 'B', 'C', 'D'], 3);
    const homeCounts = new Map<string, number>();
    for (const f of fixtures) homeCounts.set(f.homeTeamId, (homeCounts.get(f.homeTeamId) ?? 0) + 1);
    const counts = ['A', 'B', 'C', 'D'].map((id) => homeCounts.get(id) ?? 0);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('홀수 팀(3팀)은 매주 한 팀이 bye이고, 각 팀은 총 2경기를 뛴다', () => {
    const fixtures = generateRoundRobinFixtures(['A', 'B', 'C'], 3);
    expect(fixtures).toHaveLength(3);
    const appearances = new Map<string, number>();
    for (const f of fixtures) {
      appearances.set(f.homeTeamId, (appearances.get(f.homeTeamId) ?? 0) + 1);
      appearances.set(f.awayTeamId, (appearances.get(f.awayTeamId) ?? 0) + 1);
    }
    expect(['A', 'B', 'C'].every((id) => appearances.get(id) === 2)).toBe(true);
  });

  it('weeksCount가 한 사이클을 넘으면 사이클을 반복하되 홈/원정 배분은 계속 균등해진다', () => {
    const fixtures = generateRoundRobinFixtures(['A', 'B'], 4);
    expect(fixtures).toHaveLength(4);
    const homeCounts = new Map<string, number>();
    for (const f of fixtures) homeCounts.set(f.homeTeamId, (homeCounts.get(f.homeTeamId) ?? 0) + 1);
    expect(homeCounts.get('A')).toBe(2);
    expect(homeCounts.get('B')).toBe(2);
  });

  it('같은 입력에 항상 같은 결과를 낸다(결정적)', () => {
    const a = generateRoundRobinFixtures(['A', 'B', 'C', 'D', 'E'], 5);
    const b = generateRoundRobinFixtures(['A', 'B', 'C', 'D', 'E'], 5);
    expect(a).toEqual(b);
  });

  it('팀이 1개 이하거나 weeksCount가 0 이하면 빈 배열을 반환한다', () => {
    expect(generateRoundRobinFixtures(['A'], 3)).toEqual([]);
    expect(generateRoundRobinFixtures(['A', 'B'], 0)).toEqual([]);
  });
});
