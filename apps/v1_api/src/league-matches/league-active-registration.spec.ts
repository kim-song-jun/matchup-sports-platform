import { leagueActiveRegistrationWhere } from './league-active-registration';

type Row = { tournamentId: string; status: string; entrySource: string | null };

// where 의 status.in / OR(entrySource) 의미만 해석하는 최소 평가기 — 필터가 어떤 행을 세는지를 직접 본다.
function countMatching(rows: Row[], leagueId: string): number {
  const where = leagueActiveRegistrationWhere(leagueId) as {
    tournamentId: string;
    status: { in: string[] };
    OR: Array<{ entrySource: string | null }>;
  };
  return rows.filter(
    (row) =>
      row.tournamentId === where.tournamentId &&
      where.status.in.includes(row.status) &&
      where.OR.some((cond) => cond.entrySource === row.entrySource),
  ).length;
}

describe('leagueActiveRegistrationWhere', () => {
  const row = (status: string, entrySource: string | null, tournamentId = 'league-1'): Row => ({ tournamentId, status, entrySource });

  it('팀이 직접 낸 활성 신청(applied·null)만 센다 — seeded·promoted 는 같은 상태여도 제외', () => {
    const rows = [row('confirmed', 'applied'), row('paid', null), row('confirmed', 'seeded'), row('confirmed', 'promoted')];
    expect(countMatching(rows, 'league-1')).toBe(2);
  });

  it('끝났거나 금액 스냅샷이 없는 상태(draft·cancelled)는 applied 여도 제외, 나머지 활성 상태는 모두 센다', () => {
    const active = ['submitted', 'awaiting_payment', 'payment_checking', 'paid', 'confirmed', 'waitlisted', 'cancel_requested'];
    expect(countMatching([...active.map((s) => row(s, 'applied')), row('draft', 'applied'), row('cancelled', 'applied')], 'league-1')).toBe(7);
  });

  it('다른 리그의 신청은 세지 않는다', () => {
    expect(countMatching([row('confirmed', 'applied', 'league-2'), row('confirmed', 'applied')], 'league-1')).toBe(1);
  });
});
