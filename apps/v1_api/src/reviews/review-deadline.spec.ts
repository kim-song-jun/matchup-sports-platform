import { reviewWindowClosed } from './review-deadline';

describe('reviewWindowClosed', () => {
  const anchor = new Date('2026-08-01T00:00:00.000Z');

  it('앵커가 없으면(null) 마감을 판정할 수 없으므로 false를 반환한다(마감 없음)', () => {
    expect(reviewWindowClosed(null, new Date('2099-01-01T00:00:00.000Z'))).toBe(false);
  });

  it('47시간 59분 경과는 아직 마감 전이다', () => {
    const now = new Date(anchor.getTime() + (47 * 60 + 59) * 60 * 1000);
    expect(reviewWindowClosed(anchor, now)).toBe(false);
  });

  it('정확히 48시간 경과는 아직 마감 전이다(경계값, 초과부터 마감)', () => {
    const now = new Date(anchor.getTime() + 48 * 60 * 60 * 1000);
    expect(reviewWindowClosed(anchor, now)).toBe(false);
  });

  it('48시간을 1분이라도 초과하면 마감이다', () => {
    const now = new Date(anchor.getTime() + 48 * 60 * 60 * 1000 + 60 * 1000);
    expect(reviewWindowClosed(anchor, now)).toBe(true);
  });

  it('미래 anchor(now보다 나중)는 경과시간이 음수이므로 마감이 아니다', () => {
    const futureAnchor = new Date('2099-01-01T00:00:00.000Z');
    expect(reviewWindowClosed(futureAnchor, anchor)).toBe(false);
  });
});
