import { planLeagueTemplate } from './league-template-plan';

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

describe('planLeagueTemplate', () => {
  it.each([
    { teamCount: 3, legs: 1 as const, fixtures: 3, rounds: 3 },
    { teamCount: 4, legs: 1 as const, fixtures: 6, rounds: 3 },
    { teamCount: 4, legs: 2 as const, fixtures: 12, rounds: 6 },
    { teamCount: 5, legs: 1 as const, fixtures: 10, rounds: 5 },
    { teamCount: 6, legs: 2 as const, fixtures: 30, rounds: 10 },
    { teamCount: 12, legs: 1 as const, fixtures: 66, rounds: 11 },
  ])('$teamCount팀 × $legs회전 = 경기 $fixtures · 라운드 $rounds', ({ teamCount, legs, fixtures, rounds }) => {
    const plan = planLeagueTemplate({ teamCount, legs });
    expect(plan.fixtures).toHaveLength(fixtures);
    expect(plan.totalRounds).toBe(rounds);
    expect(plan.slotPositions).toEqual(Array.from({ length: teamCount }, (_, index) => index + 1));
  });

  it('모든 쌍이 정확히 legs 번 만나고, 2회전이면 홈/원정이 서로 한 번씩이다', () => {
    const plan = planLeagueTemplate({ teamCount: 5, legs: 2 });
    const byPair = new Map<string, Array<[number, number]>>();
    for (const fixture of plan.fixtures) {
      const key = pairKey(fixture.homePosition, fixture.awayPosition);
      byPair.set(key, [...(byPair.get(key) ?? []), [fixture.homePosition, fixture.awayPosition]]);
    }
    expect(byPair.size).toBe(10);
    for (const meetings of byPair.values()) {
      expect(meetings).toHaveLength(2);
      expect(meetings[0][0]).toBe(meetings[1][1]);
      expect(meetings[0][1]).toBe(meetings[1][0]);
    }
  });

  it('한 라운드에 같은 자리가 두 번 나오지 않고 자리 번호는 1..teamCount 안이다', () => {
    for (const teamCount of [3, 4, 7, 12, 20]) {
      const plan = planLeagueTemplate({ teamCount, legs: 2 });
      const seen = new Set<string>();
      for (const fixture of plan.fixtures) {
        expect(fixture.homePosition).not.toBe(fixture.awayPosition);
        for (const position of [fixture.homePosition, fixture.awayPosition]) {
          expect(position).toBeGreaterThanOrEqual(1);
          expect(position).toBeLessThanOrEqual(teamCount);
          const roundKey = `${fixture.round}:${position}`;
          expect(seen.has(roundKey)).toBe(false);
          seen.add(roundKey);
        }
      }
    }
  });

  it('경기는 라운드 오름차순이고 라운드는 1부터 빠짐없이 이어진다', () => {
    const plan = planLeagueTemplate({ teamCount: 6, legs: 2 });
    const rounds = plan.fixtures.map((fixture) => fixture.round);
    expect(rounds).toEqual([...rounds].sort((a, b) => a - b));
    expect([...new Set(rounds)]).toEqual(Array.from({ length: plan.totalRounds }, (_, index) => index + 1));
  });
});
