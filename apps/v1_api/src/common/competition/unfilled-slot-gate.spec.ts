import {
  excludeUnfilledSlotFixturesSql,
  excludeUnfilledSlotFixturesWhere,
  isUnfilledSlotFixture,
  unfilledSlotFixtureWhere,
} from './unfilled-slot-gate';

type Row = Parameters<typeof isUnfilledSlotFixture>[0];

const base = { status: 'matched' } as const;
// 공개에서 가려야 하는 셋(a,b,e)과 보여야 하는 넷(c,d,f,g) — 한쪽만 있으면 좁힘이 잘못돼도 단언이 맞는다.
const hiddenRows: Record<string, Row> = {
  'a 자리 연결 빈 경기': { ...base, homeSlotId: 's1', awaySlotId: 's2', hostTeamId: null, approvedApplicantTeamId: null },
  'b 반쪽만 찬 경기': { ...base, homeSlotId: 's1', awaySlotId: 's2', hostTeamId: 'a', approvedApplicantTeamId: null },
  'e 팀 없이 취소돼 자리가 지워진 경기': { status: 'cancelled', homeSlotId: null, awaySlotId: null, hostTeamId: null, approvedApplicantTeamId: null },
};
const shownRows: Record<string, Row> = {
  'c 다 찬 경기': { ...base, homeSlotId: 's1', awaySlotId: 's2', hostTeamId: 'a', approvedApplicantTeamId: 'b' },
  'd 자리 없는 기존 경기(원정 null)': { ...base, homeSlotId: null, awaySlotId: null, hostTeamId: 'a', approvedApplicantTeamId: null },
  'f 홈 팀이 있는 취소 경기': { status: 'cancelled', homeSlotId: null, awaySlotId: null, hostTeamId: 'a', approvedApplicantTeamId: 'b' },
  'g 자리 없는 기존 취소 경기': { status: 'cancelled', homeSlotId: null, awaySlotId: null, hostTeamId: 'a', approvedApplicantTeamId: null },
};

/** 게이트 Prisma where 가 쓰는 연산(OR/NOT, 값·{not:null} 비교)만 푸는 최소 평가기. */
function matches(where: Record<string, unknown>, row: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Record<string, unknown>[]).some((c) => matches(c, row));
    if (key === 'NOT') return !matches(cond as Record<string, unknown>, row);
    if (cond !== null && typeof cond === 'object') return row[key] !== (cond as { not: unknown }).not;
    return row[key] === cond;
  });
}

describe('게이트 세 형태(Prisma where · row 헬퍼)는 같은 경기 집합을 가린다', () => {
  it.each(Object.entries(hiddenRows))('%s — 가린다', (_name, row) => {
    expect(isUnfilledSlotFixture(row)).toBe(true);
    expect(matches(unfilledSlotFixtureWhere() as never, row)).toBe(true);
    expect(matches(excludeUnfilledSlotFixturesWhere() as never, row)).toBe(false);
  });

  it.each(Object.entries(shownRows))('%s — 그대로 보여 준다', (_name, row) => {
    expect(isUnfilledSlotFixture(row)).toBe(false);
    expect(matches(unfilledSlotFixtureWhere() as never, row)).toBe(false);
    expect(matches(excludeUnfilledSlotFixturesWhere() as never, row)).toBe(true);
  });
});

describe('isUnfilledSlotFixture — 자리에 연결됐는데 팀이 빈 사이드가 있는가', () => {
  const filled = { ...base, homeSlotId: 's1', awaySlotId: 's2', hostTeamId: 'a', approvedApplicantTeamId: 'b' };

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
      isUnfilledSlotFixture({ ...base, homeSlotId: null, awaySlotId: null, hostTeamId: 'a', approvedApplicantTeamId: null }),
    ).toBe(false);
  });

  it('홈만 자리에 연결된 경기는 홈 팀만 본다', () => {
    const homeOnly = { ...base, homeSlotId: 's1', awaySlotId: null, hostTeamId: 'a', approvedApplicantTeamId: null };
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

  it('취소 + 홈 팀 없음 절도 alias 로 한정한다', () => {
    const { sql } = excludeUnfilledSlotFixturesSql('team_match');
    expect(sql).toContain("team_match.status = 'cancelled' AND team_match.host_team_id IS NULL");
  });

  it('식별자가 아닌 alias 는 던진다 — raw 조각에 문자열이 그대로 들어가기 때문이다', () => {
    expect(() => excludeUnfilledSlotFixturesSql('tm; DROP TABLE v1_users')).toThrow();
    expect(() => excludeUnfilledSlotFixturesSql('')).toThrow();
    expect(() => excludeUnfilledSlotFixturesSql('1tm')).toThrow();
  });
});
