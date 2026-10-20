import { fairPlayPointsOf, parseFairPlayCards } from './league-fair-play';

describe('parseFairPlayCards', () => {
  it('옐로 없는 레드는 직접 퇴장이다', () => {
    expect(parseFairPlayCards({ yellow: 0, red: 1 })).toEqual({ yellow: 0, secondYellowRed: 0, directRed: 1 });
  });

  // MD-QA #174: 콘솔은 두 번째 옐로 뒤에 레드를 한 장 더 기록해 옐로 2 · 레드 1로 저장된다.
  it('옐로 2장 + 레드는 경고 누적 퇴장 하나다 (옐로 1+1+퇴장 4 = 6점이 아니라 3점)', () => {
    const cards = parseFairPlayCards({ yellow: 2, red: 1 });
    expect(cards).toEqual({ yellow: 0, secondYellowRed: 1, directRed: 0 });
    expect(fairPlayPointsOf(cards)).toBe(3);
  });

  it('옐로 1장 뒤 직접 레드는 둘 다 남는다', () => {
    expect(parseFairPlayCards({ yellow: 1, red: 1 })).toEqual({ yellow: 1, secondYellowRed: 0, directRed: 1 });
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
