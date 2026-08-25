import { generateRoundRobinFixtures, resolveFixtureStartAt, resolveFixtureTimeSlots, WEEK_MS } from './round-robin-schedule';

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
    const leagueStartsOn = new Date('2026-08-10T03:30:00.000Z');
    expect(resolveFixtureStartAt(leagueStartsOn, 1)).toEqual(leagueStartsOn);
    expect(resolveFixtureStartAt(leagueStartsOn, 3).getTime()).toBe(leagueStartsOn.getTime() + 2 * WEEK_MS);
  });

  it('template이 있으면 시작일 이후 첫 해당 요일의 그 시각(KST)부터 매주 채운다', () => {
    // 2026-08-10T00:00:00Z는 KST로 2026-08-10 09:00, 월요일이다.
    const leagueStartsOn = new Date('2026-08-10T00:00:00.000Z');
    const first = resolveFixtureStartAt(leagueStartsOn, 1, { dayOfWeek: 6, time: '18:00' }); // 토요일 18:00 KST
    expect(first.toISOString()).toBe('2026-08-15T09:00:00.000Z'); // 8/15(토) 18:00 KST = 09:00 UTC
    const second = resolveFixtureStartAt(leagueStartsOn, 2, { dayOfWeek: 6, time: '18:00' });
    expect(second.getTime()).toBe(first.getTime() + WEEK_MS);
  });

  it('요일 판정은 UTC 달력일이 아니라 KST 달력일을 기준으로 한다', () => {
    // 2026-08-09T20:00:00Z는 UTC로는 일요일(0)이지만, KST로는 2026-08-10 05:00 월요일(1)이다.
    // UTC 요일로 잘못 판정하면 결과가 하루 밀린다.
    const leagueStartsOn = new Date('2026-08-09T20:00:00.000Z');
    const result = resolveFixtureStartAt(leagueStartsOn, 1, { dayOfWeek: 1, time: '18:00' }); // 월요일 18:00 KST
    expect(result.toISOString()).toBe('2026-08-10T09:00:00.000Z'); // 같은 KST 달력일(8/10), 09:00 UTC
  });

  it('시작일의 KST 요일이 target과 같으면 같은 날로 채운다(0일 뒤로 미루지 않음)', () => {
    const leagueStartsOn = new Date('2026-08-10T00:00:00.000Z'); // KST 월요일 09:00
    const result = resolveFixtureStartAt(leagueStartsOn, 1, { dayOfWeek: 1, time: '20:00' });
    expect(result.toISOString()).toBe('2026-08-10T11:00:00.000Z'); // 8/10 20:00 KST = 11:00 UTC
  });

  it('시작일과 같은 요일이지만 template.time이 시작일의 실제 시각보다 이르면 한 주 뒤로 민다(시작일 이전 반환 금지)', () => {
    const leagueStartsOn = new Date('2026-08-10T00:00:00.000Z'); // KST 월요일 09:00
    const result = resolveFixtureStartAt(leagueStartsOn, 1, { dayOfWeek: 1, time: '08:00' }); // 09:00보다 이른 08:00 KST
    expect(result.toISOString()).toBe('2026-08-16T23:00:00.000Z'); // 8/17(월) 08:00 KST = 8/16 23:00 UTC
    expect(result.getTime()).toBeGreaterThan(leagueStartsOn.getTime());
  });
});

describe('resolveFixtureTimeSlots', () => {
  // 2026-08-31T00:00:00Z = KST 8/31(월) 09:00. 수요일(3) 지정 시 첫 매치데이는 9/2(수).
  const leagueStartsOn = new Date('2026-08-31T00:00:00.000Z');
  const wednesday22 = { dayOfWeek: 3, time: '22:00' };

  it('4팀·팀당 하루 3경기·15분 경기·5분 휴식이면 하루 6경기가 20분 간격으로 연달아 배치된다', () => {
    // 한 구장 운영 시나리오: 22:00~00:00 사이 6경기(팀당 3경기).
    const fixtures = generateRoundRobinFixtures(['A', 'B', 'C', 'D'], 3); // 1매치데이 × 3라운드
    const slots = resolveFixtureTimeSlots(fixtures, leagueStartsOn, { gameDurationMinutes: 15, breakMinutes: 5, gamesPerTeamPerDay: 3 }, wednesday22);
    expect(slots).toHaveLength(6);
    expect(slots.map((s) => s.startAt.toISOString())).toEqual([
      '2026-09-02T13:00:00.000Z', // 22:00 KST
      '2026-09-02T13:20:00.000Z', // 22:20
      '2026-09-02T13:40:00.000Z', // 22:40
      '2026-09-02T14:00:00.000Z', // 23:00
      '2026-09-02T14:20:00.000Z', // 23:20
      '2026-09-02T14:40:00.000Z', // 23:40
    ]);
    expect(slots[5].endAt.toISOString()).toBe('2026-09-02T14:55:00.000Z'); // 마지막 경기 23:55 KST 종료
    expect(slots.every((s) => s.matchday === 1)).toBe(true);
    expect(slots.map((s) => s.orderInDay)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('endAt은 startAt + 경기 시간이다(휴식은 다음 경기 시작 간격에만 반영)', () => {
    const fixtures = generateRoundRobinFixtures(['A', 'B'], 1);
    const slots = resolveFixtureTimeSlots(fixtures, leagueStartsOn, { gameDurationMinutes: 40, breakMinutes: 10, gamesPerTeamPerDay: 1 }, wednesday22);
    expect(slots[0].endAt.getTime() - slots[0].startAt.getTime()).toBe(40 * 60_000);
  });

  it('각 팀은 매치데이마다 정확히 팀당 하루 경기 수만큼 출전한다', () => {
    const fixtures = generateRoundRobinFixtures(['A', 'B', 'C', 'D'], 6); // 2매치데이 × 3라운드
    const slots = resolveFixtureTimeSlots(fixtures, leagueStartsOn, { gameDurationMinutes: 15, breakMinutes: 5, gamesPerTeamPerDay: 3 }, wednesday22);
    const perDay = new Map<string, number>();
    fixtures.forEach((fixture, i) => {
      for (const teamId of [fixture.homeTeamId, fixture.awayTeamId]) {
        const key = `${slots[i].matchday}:${teamId}`;
        perDay.set(key, (perDay.get(key) ?? 0) + 1);
      }
    });
    expect(perDay.size).toBe(8); // 2매치데이 × 4팀
    for (const count of perDay.values()) expect(count).toBe(3);
  });

  it('다음 매치데이는 정확히 7일 뒤 같은 시각부터 다시 시작한다', () => {
    const fixtures = generateRoundRobinFixtures(['A', 'B', 'C', 'D'], 6);
    const slots = resolveFixtureTimeSlots(fixtures, leagueStartsOn, { gameDurationMinutes: 15, breakMinutes: 5, gamesPerTeamPerDay: 3 }, wednesday22);
    expect(slots[6].matchday).toBe(2);
    expect(slots[6].orderInDay).toBe(1);
    expect(slots[6].startAt.getTime()).toBe(slots[0].startAt.getTime() + WEEK_MS);
  });

  it('팀당 하루 1경기여도 같은 매치데이 경기들은 순차 배치된다(동시 시작 없음)', () => {
    const fixtures = generateRoundRobinFixtures(['A', 'B', 'C', 'D', 'E', 'F'], 1); // 1라운드 3경기
    const slots = resolveFixtureTimeSlots(fixtures, leagueStartsOn, { gameDurationMinutes: 15, breakMinutes: 5, gamesPerTeamPerDay: 1 }, wednesday22);
    expect(slots.map((s) => s.startAt.toISOString())).toEqual([
      '2026-09-02T13:00:00.000Z',
      '2026-09-02T13:20:00.000Z',
      '2026-09-02T13:40:00.000Z',
    ]);
  });

  it('휴식 0분이면 경기 시간 간격으로 바로 이어 붙인다', () => {
    const fixtures = generateRoundRobinFixtures(['A', 'B', 'C', 'D'], 1);
    const slots = resolveFixtureTimeSlots(fixtures, leagueStartsOn, { gameDurationMinutes: 30, breakMinutes: 0, gamesPerTeamPerDay: 1 }, wednesday22);
    expect(slots[1].startAt.getTime() - slots[0].startAt.getTime()).toBe(30 * 60_000);
  });

  it('template 없이도 시작일 시각부터 순차 배치하고 매치데이는 주 단위로 반복한다', () => {
    const fixtures = generateRoundRobinFixtures(['A', 'B', 'C', 'D'], 2); // 2매치데이 × 1라운드
    const slots = resolveFixtureTimeSlots(fixtures, leagueStartsOn, { gameDurationMinutes: 15, breakMinutes: 5, gamesPerTeamPerDay: 1 });
    expect(slots[0].startAt).toEqual(leagueStartsOn);
    expect(slots[1].startAt.getTime()).toBe(leagueStartsOn.getTime() + 20 * 60_000);
    expect(slots[2].startAt.getTime()).toBe(leagueStartsOn.getTime() + WEEK_MS);
  });
});
