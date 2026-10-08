import { excludeUnfilledSlotFixturesSql, isUnfilledSlotFixture } from './unfilled-slot-gate';

describe('isUnfilledSlotFixture — 자리에 연결됐는데 팀이 빈 사이드가 있는가', () => {
  const filled = { homeSlotId: 's1', awaySlotId: 's2', hostTeamId: 'a', approvedApplicantTeamId: 'b' };

  it('자리 두 곳 모두 팀이 찼으면 false', () => {
    expect(isUnfilledSlotFixture(filled)).toBe(false);
  });

  it('홈 자리만 비었거나, 원정 자리만 비었거나, 둘 다 비면 true (반쪽 경기 포함)', () => {
    expect(isUnfilledSlotFixture({ ...filled, hostTeamId: null })).toBe(true);
    expect(isUnfilledSlotFixture({ ...filled, approvedApplicantTeamId: null })).toBe(true);
    expect(isUnfilledSlotFixture({ ...filled, hostTeamId: null, approvedApplicantTeamId: null })).toBe(true);
  });

  it('대조군: 자리 없는 기존 경기는 원정이 null 이어도 false — 게이트가 기존 경기를 가리면 안 된다', () => {
    expect(
      isUnfilledSlotFixture({ homeSlotId: null, awaySlotId: null, hostTeamId: 'a', approvedApplicantTeamId: null }),
    ).toBe(false);
  });

  it('홈만 자리에 연결된 경기는 홈 팀만 본다', () => {
    const homeOnly = { homeSlotId: 's1', awaySlotId: null, hostTeamId: 'a', approvedApplicantTeamId: null };
    expect(isUnfilledSlotFixture(homeOnly)).toBe(false);
    expect(isUnfilledSlotFixture({ ...homeOnly, hostTeamId: null })).toBe(true);
  });
});

describe('excludeUnfilledSlotFixturesSql — alias 는 식별자만 받는다', () => {
  it('네 컬럼 모두 alias 로 한정한다', () => {
    const { sql } = excludeUnfilledSlotFixturesSql('team_match');
    for (const column of ['home_slot_id', 'host_team_id', 'away_slot_id', 'approved_applicant_team_id']) {
      expect(sql).toContain(`team_match.${column}`);
    }
  });

  it('식별자가 아닌 alias 는 던진다 — raw 조각에 문자열이 그대로 들어가기 때문이다', () => {
    expect(() => excludeUnfilledSlotFixturesSql('tm; DROP TABLE v1_users')).toThrow();
    expect(() => excludeUnfilledSlotFixturesSql('')).toThrow();
    expect(() => excludeUnfilledSlotFixturesSql('1tm')).toThrow();
  });
});
