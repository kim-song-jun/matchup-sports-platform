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

  it('2위보다 잔여 경기가 많은 3위 이하가 1위를 추월할 수 있으면 그 팀 기준으로 계산한다', () => {
    // 2위(b)는 남은 경기가 1개뿐이라 전승해도 최대 18점 — 1위(a) 20점을 못 넘는다.
    // "2위만 보면 확정"으로 잘못 판정하기 쉬운 상황이지만, 3위(c)는 5경기나 남아 있어
    // 전승하면 23점으로 1위를 추월할 수 있다. challengers 전원(2위 이하 전부)의 최대
    // 도달 승점을 봐야 진짜 도전자(c)를 놓치지 않는다 — 소화 경기 수가 팀마다 다른
    // 리그(다조 통합, 불균등 진행)에서 실제로 생기는 배열이다.
    const result = magicNumberOf(
      [
        { registrationId: 'a', points: 20 },
        { registrationId: 'b', points: 15 },
        { registrationId: 'c', points: 8 },
      ],
      new Map([['a', 0], ['b', 1], ['c', 5]]),
      winPoints,
    );
    // c 최대 = 8 + 5*3 = 23, a 현재 20 → 23 - 20 + 1 = 4.
    // (2위만 봤다면 b 최대 18 - 20 + 1 = -1 → 0으로 묶여 "확정"이라는 오판이 났을 것이다.)
    expect(result).toEqual({ registrationId: 'a', value: 4, clinched: false });
  });
});
