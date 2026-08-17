import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { assertLeagueGenerationAllowed, buildLeagueFixtureRows } from './league-fixture-generator.service';

describe('assertLeagueGenerationAllowed', () => {
  const base = {
    format: 'league' as const,
    groupPhase: 'group' as const,
    teamCount: 4,
    existingFixtureCount: 0,
    fixturesWithResultCount: 0,
    minMatchesPerTeam: null as number | null,
    legs: 1,
    replaceExisting: false,
  };

  it('리그가 아닌 대회면 거부한다', () => {
    expect(() => assertLeagueGenerationAllowed({ ...base, format: 'knockout' }))
      .toThrow(UnprocessableEntityException);
  });

  it('조 phase가 group이 아니면 거부한다', () => {
    expect(() => assertLeagueGenerationAllowed({ ...base, groupPhase: 'knockout' }))
      .toThrow(UnprocessableEntityException);
  });

  it('팀이 2팀 미만이면 거부한다', () => {
    expect(() => assertLeagueGenerationAllowed({ ...base, teamCount: 1 }))
      .toThrow(UnprocessableEntityException);
  });

  it('replaceExisting=false인데 fixture가 이미 있으면 거부한다', () => {
    expect(() => assertLeagueGenerationAllowed({ ...base, existingFixtureCount: 3 }))
      .toThrow(ConflictException);
  });

  it('replaceExisting=true여도 결과가 확정된 fixture가 있으면 거부한다', () => {
    expect(() => assertLeagueGenerationAllowed({
      ...base, replaceExisting: true, existingFixtureCount: 3, fixturesWithResultCount: 1,
    })).toThrow(ConflictException);
  });

  it('최소 경기 수에 미달하면 거부하고 필요한 legs를 알려준다', () => {
    try {
      assertLeagueGenerationAllowed({ ...base, teamCount: 4, legs: 1, minMatchesPerTeam: 5 });
      throw new Error('should have thrown');
    } catch (error) {
      const response = (error as UnprocessableEntityException).getResponse() as {
        code: string; requiredLegs: number;
      };
      expect(response.code).toBe('LEAGUE_MIN_MATCHES_NOT_MET');
      expect(response.requiredLegs).toBe(2);
    }
  });

  it('조건을 모두 만족하면 통과한다', () => {
    expect(() => assertLeagueGenerationAllowed(base)).not.toThrow();
  });
});

describe('buildLeagueFixtureRows', () => {
  it('라운드 번호를 round 문자열로, leg를 legNumber로 매핑한다', () => {
    const rows = buildLeagueFixtureRows({
      groupId: 'g1',
      groupName: 'A조',
      registrationIds: ['r1', 'r2'],
      legs: 2,
      balanceHome: true,
      schedule: null,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].legNumber).toBe(1);
    expect(rows[1].legNumber).toBe(2);
    expect(rows[0].round).toBe('league_r1');
    expect(rows[0].startAt).toBeNull();
  });

  it('fixtureNumber가 1부터 연속으로 매겨진다', () => {
    const rows = buildLeagueFixtureRows({
      groupId: 'g1', groupName: 'A조',
      registrationIds: ['r1', 'r2', 'r3', 'r4'],
      legs: 1, balanceHome: true, schedule: null,
    });
    expect(rows.map((r) => r.fixtureNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('schedule이 있으면 라운드별 startAt을 주차로 채운다', () => {
    const rows = buildLeagueFixtureRows({
      groupId: 'g1', groupName: 'A조',
      registrationIds: ['r1', 'r2', 'r3', 'r4'],
      legs: 1, balanceHome: true,
      schedule: { startsOn: new Date('2026-09-01T00:00:00.000Z'), template: { dayOfWeek: 6, time: '20:00' } },
    });
    const round1 = rows.filter((r) => r.round === 'league_r1');
    const round2 = rows.filter((r) => r.round === 'league_r2');
    expect(round1[0].startAt).not.toBeNull();
    expect(round2[0].startAt!.getTime() - round1[0].startAt!.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
