import { generateRoundRobinFixtures, resolveFixtureStartAt, WEEK_MS } from './round-robin-schedule';

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

describe('resolveFixtureStartAt', () => {
  it('template이 없으면 기존 동작을 그대로 유지한다(시작일 + (round-1)주, 시각도 그대로)', () => {
    const seriesStartsOn = new Date('2026-08-10T03:30:00.000Z');
    expect(resolveFixtureStartAt(seriesStartsOn, 1)).toEqual(seriesStartsOn);
    expect(resolveFixtureStartAt(seriesStartsOn, 3).getTime()).toBe(seriesStartsOn.getTime() + 2 * WEEK_MS);
  });

  it('template이 있으면 시작일 이후 첫 해당 요일의 그 시각(KST)부터 매주 채운다', () => {
    // 2026-08-10T00:00:00Z는 KST로 2026-08-10 09:00, 월요일이다.
    const seriesStartsOn = new Date('2026-08-10T00:00:00.000Z');
    const first = resolveFixtureStartAt(seriesStartsOn, 1, { dayOfWeek: 6, time: '18:00' }); // 토요일 18:00 KST
    expect(first.toISOString()).toBe('2026-08-15T09:00:00.000Z'); // 8/15(토) 18:00 KST = 09:00 UTC
    const second = resolveFixtureStartAt(seriesStartsOn, 2, { dayOfWeek: 6, time: '18:00' });
    expect(second.getTime()).toBe(first.getTime() + WEEK_MS);
  });

  it('요일 판정은 UTC 달력일이 아니라 KST 달력일을 기준으로 한다', () => {
    // 2026-08-09T20:00:00Z는 UTC로는 일요일(0)이지만, KST로는 2026-08-10 05:00 월요일(1)이다.
    // UTC 요일로 잘못 판정하면 결과가 하루 밀린다.
    const seriesStartsOn = new Date('2026-08-09T20:00:00.000Z');
    const result = resolveFixtureStartAt(seriesStartsOn, 1, { dayOfWeek: 1, time: '18:00' }); // 월요일 18:00 KST
    expect(result.toISOString()).toBe('2026-08-10T09:00:00.000Z'); // 같은 KST 달력일(8/10), 09:00 UTC
  });

  it('시작일의 KST 요일이 target과 같으면 같은 날로 채운다(0일 뒤로 미루지 않음)', () => {
    const seriesStartsOn = new Date('2026-08-10T00:00:00.000Z'); // KST 월요일 09:00
    const result = resolveFixtureStartAt(seriesStartsOn, 1, { dayOfWeek: 1, time: '20:00' });
    expect(result.toISOString()).toBe('2026-08-10T11:00:00.000Z'); // 8/10 20:00 KST = 11:00 UTC
  });

  it('시작일과 같은 요일이지만 template.time이 시작일의 실제 시각보다 이르면 한 주 뒤로 민다(시작일 이전 반환 금지)', () => {
    const seriesStartsOn = new Date('2026-08-10T00:00:00.000Z'); // KST 월요일 09:00
    const result = resolveFixtureStartAt(seriesStartsOn, 1, { dayOfWeek: 1, time: '08:00' }); // 09:00보다 이른 08:00 KST
    expect(result.toISOString()).toBe('2026-08-16T23:00:00.000Z'); // 8/17(월) 08:00 KST = 8/16 23:00 UTC
    expect(result.getTime()).toBeGreaterThan(seriesStartsOn.getTime());
  });
});
