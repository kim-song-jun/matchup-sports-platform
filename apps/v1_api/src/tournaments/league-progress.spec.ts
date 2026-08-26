import { leagueProgressOf, magicNumberOf } from './league-progress';

describe('leagueProgressOf', () => {
  it('확정된 경기 수로 진행률을 낸다', () => {
    expect(leagueProgressOf([{ hasResult: true }, { hasResult: true }, { hasResult: false }]))
      .toEqual({ total: 3, played: 2, remaining: 1, percent: 67 });
  });

  it('경기가 없으면 percent는 0이다', () => {
    expect(leagueProgressOf([])).toEqual({ total: 0, played: 0, remaining: 0, percent: 0 });
  });
});

describe('magicNumberOf', () => {
  const winPoints = 3;

  it('2위가 남은 경기를 다 이겨도 못 넘으면 우승이 확정된다', () => {
    const result = magicNumberOf(
      [{ registrationId: 'a', points: 20 }, { registrationId: 'b', points: 10 }],
      new Map([['a', 0], ['b', 2]]),
      winPoints,
    );
    expect(result).toEqual({ registrationId: 'a', value: 0, clinched: true });
  });

  it('아직 뒤집힐 수 있으면 필요한 승점을 알려준다', () => {
    const result = magicNumberOf(
      [{ registrationId: 'a', points: 12 }, { registrationId: 'b', points: 10 }],
      new Map([['a', 2], ['b', 2]]),
      winPoints,
    );
    // b 최대 = 10 + 6 = 16, a 현재 12 → 16 - 12 + 1 = 5
    expect(result).toEqual({ registrationId: 'a', value: 5, clinched: false });
  });

  it('팀이 2팀 미만이면 null을 반환한다', () => {
    expect(magicNumberOf([{ registrationId: 'a', points: 3 }], new Map(), winPoints)).toBeNull();
    expect(magicNumberOf([], new Map(), winPoints)).toBeNull();
  });
});
