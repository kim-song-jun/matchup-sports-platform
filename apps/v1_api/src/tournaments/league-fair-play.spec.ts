import { fairPlayPointsOf, parseFairPlayCards } from './league-fair-play';

describe('parseFairPlayCards', () => {
  it('{yellow, red} Json을 FairPlayCards로 변환한다 (red는 directRed로)', () => {
    expect(parseFairPlayCards({ yellow: 2, red: 1 })).toEqual({
      yellow: 2,
      secondYellowRed: 0,
      directRed: 1,
    });
  });

  it('형태가 맞지 않으면 전부 0으로 안전하게 처리한다', () => {
    expect(parseFairPlayCards(null)).toEqual({ yellow: 0, secondYellowRed: 0, directRed: 0 });
    expect(parseFairPlayCards({})).toEqual({ yellow: 0, secondYellowRed: 0, directRed: 0 });
    expect(parseFairPlayCards('garbage')).toEqual({ yellow: 0, secondYellowRed: 0, directRed: 0 });
  });
});

describe('fairPlayPointsOf', () => {
  it('카드가 없으면 0점이다', () => {
    expect(fairPlayPointsOf({ yellow: 0, secondYellowRed: 0, directRed: 0 })).toBe(0);
  });

  it('옐로 1장은 1점이다', () => {
    expect(fairPlayPointsOf({ yellow: 1, secondYellowRed: 0, directRed: 0 })).toBe(1);
  });

  it('경고 누적 퇴장은 3점이다', () => {
    expect(fairPlayPointsOf({ yellow: 0, secondYellowRed: 1, directRed: 0 })).toBe(3);
  });

  it('직접 퇴장은 4점이다', () => {
    expect(fairPlayPointsOf({ yellow: 0, secondYellowRed: 0, directRed: 1 })).toBe(4);
  });

  it('여러 사건은 합산된다', () => {
    expect(fairPlayPointsOf({ yellow: 2, secondYellowRed: 1, directRed: 1 })).toBe(9);
  });
});
