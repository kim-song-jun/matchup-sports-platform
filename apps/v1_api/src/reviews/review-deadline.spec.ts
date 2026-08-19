import {
  DEFAULT_REVIEW_WINDOW_HOURS,
  formatReviewWindow,
  reviewWindowClosed,
} from './review-deadline';

describe('reviewWindowClosed', () => {
  const anchor = new Date('2026-08-01T00:00:00.000Z');
  const after = (hours: number, minutes = 0) =>
    new Date(anchor.getTime() + hours * 60 * 60 * 1000 + minutes * 60 * 1000);

  it('앵커가 없으면(null) 마감을 판정할 수 없으므로 false를 반환한다(마감 없음)', () => {
    expect(reviewWindowClosed(null, new Date('2099-01-01T00:00:00.000Z'))).toBe(false);
  });

  it('기본 기간은 168시간(7일)이다', () => {
    expect(DEFAULT_REVIEW_WINDOW_HOURS).toBe(168);
  });

  it('기본 기간에서, 예전 정책(48시간)을 넘겨도 아직 마감이 아니다', () => {
    // 정책을 48h -> 168h 로 늘린 변경의 회귀 방지. 이 단언이 깨지면 기본 기간이 되돌아간 것이다.
    expect(reviewWindowClosed(anchor, after(48, 1))).toBe(false);
  });

  it('정확히 168시간 경과는 아직 마감 전이다(경계값, 초과부터 마감)', () => {
    expect(reviewWindowClosed(anchor, after(168))).toBe(false);
  });

  it('168시간을 1분이라도 초과하면 마감이다', () => {
    expect(reviewWindowClosed(anchor, after(168, 1))).toBe(true);
  });

  it('windowHours 를 넘기면 그 값이 기본값 대신 쓰인다(어드민 설정 경로)', () => {
    expect(reviewWindowClosed(anchor, after(48, 1), 48)).toBe(true);
    expect(reviewWindowClosed(anchor, after(48, 1), 72)).toBe(false);
    expect(reviewWindowClosed(anchor, after(240), 336)).toBe(false);
  });

  it('미래 anchor(now보다 나중)는 경과시간이 음수이므로 마감이 아니다', () => {
    const futureAnchor = new Date('2099-01-01T00:00:00.000Z');
    expect(reviewWindowClosed(futureAnchor, anchor)).toBe(false);
  });
});

describe('formatReviewWindow', () => {
  it('24시간 배수는 일 단위로 표기한다', () => {
    expect(formatReviewWindow(168)).toBe('7일');
    expect(formatReviewWindow(48)).toBe('2일');
    expect(formatReviewWindow(24)).toBe('1일');
  });

  it('24로 나누어떨어지지 않으면 시간 단위로 표기한다', () => {
    expect(formatReviewWindow(36)).toBe('36시간');
    expect(formatReviewWindow(1)).toBe('1시간');
  });
});
