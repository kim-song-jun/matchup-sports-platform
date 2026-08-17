import { fairPlayPointsOf } from './league-fair-play';

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
