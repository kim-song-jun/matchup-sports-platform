import { compareScheduledAtNullLast, orderUntimedByProgress, type OrderableTeamMatch } from './untimed-game-order';

function match(
  id: string,
  details: { round: string; fixtureNumber?: number; legNumber?: number; phase?: string | null } | null,
): OrderableTeamMatch {
  return {
    id,
    tournamentDetails:
      details === null
        ? null
        : {
            round: details.round,
            fixtureNumber: details.fixtureNumber ?? 1,
            legNumber: details.legNumber ?? 1,
            group: details.phase == null ? null : { phase: details.phase },
          },
  };
}

const ids = (matches: readonly OrderableTeamMatch[]) => matches.map((entry) => entry.id);

describe('orderUntimedByProgress', () => {
  it('단계(조별리그 → 결선) → 라운드 → 대진 번호 → 차수 순으로 놓는다', () => {
    const ordered = orderUntimedByProgress([
      match('final', { round: 'final', phase: 'final' }),
      match('semi', { round: 'semi', phase: 'semi' }),
      match('group-r2-no2', { round: 'league_r2', fixtureNumber: 2, phase: 'group' }),
      match('group-r2-no1', { round: 'league_r2', fixtureNumber: 1, phase: 'group' }),
      match('group-r1', { round: 'league_r1', phase: 'group' }),
      match('semi-leg2', { round: 'semi', legNumber: 2, phase: 'semi' }),
    ]);

    expect(ids(ordered)).toEqual(['group-r1', 'group-r2-no1', 'group-r2-no2', 'semi', 'semi-leg2', 'final']);
  });

  it('조별 라운드는 숫자로 비교한다 — league_r10 이 league_r2 보다 앞서지 않는다', () => {
    const ordered = orderUntimedByProgress([
      match('r10', { round: 'league_r10', phase: 'group' }),
      match('r2', { round: 'league_r2', phase: 'group' }),
      match('r1', { round: 'league_r1', phase: 'group' }),
    ]);

    expect(ids(ordered)).toEqual(['r1', 'r2', 'r10']);
  });

  it('조가 없는 토너먼트 경기는 라운드 이름으로 단계를 읽는다', () => {
    const ordered = orderUntimedByProgress([
      match('final', { round: '결승' }),
      match('quarter', { round: '8강' }),
    ]);

    expect(ids(ordered)).toEqual(['quarter', 'final']);
  });

  it('대회 경기 정보가 없는 행도 던지지 않고, 같은 자리면 id 순으로 안정적으로 놓는다', () => {
    const ordered = orderUntimedByProgress([
      match('b', null),
      match('a', null),
      match('c', { round: 'league_r1', phase: 'group' }),
    ]);

    expect(ids(ordered)).toEqual(['a', 'b', 'c']);
  });
});

describe('compareScheduledAtNullLast', () => {
  it('시각 오름차순이고 시각 없는 쪽이 항상 뒤이며, 둘 다 없으면 같은 자리다', () => {
    const early = new Date('2026-11-10T10:00:00Z');
    const late = new Date('2026-11-20T10:00:00Z');

    expect(compareScheduledAtNullLast(early, late)).toBeLessThan(0);
    expect(compareScheduledAtNullLast(late, early)).toBeGreaterThan(0);
    expect(compareScheduledAtNullLast(late, null)).toBeLessThan(0);
    expect(compareScheduledAtNullLast(null, early)).toBeGreaterThan(0);
    expect(compareScheduledAtNullLast(null, null)).toBe(0);
  });
});
