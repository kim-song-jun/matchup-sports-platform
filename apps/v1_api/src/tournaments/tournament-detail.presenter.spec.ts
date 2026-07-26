import { isBracketPublished } from './tournament-detail.presenter';

// 대진표 공개 판정은 스케줄러 없이 조회 시점에 이뤄진다. 경계(예약 시각 정각)와
// 즉시/예약의 우선순위가 틀리면 비공개 대진표가 노출되거나 예약이 영원히 안 열린다.
describe('isBracketPublished', () => {
  const now = new Date('2026-08-01T09:00:00.000Z');

  it('공개도 예약도 없으면 비공개', () => {
    expect(isBracketPublished(null, null, now)).toBe(false);
  });

  it('undefined 가 들어와도 던지지 않고 비공개로 떨어진다', () => {
    // 부분 select 나 구식 fixture 로 컬럼이 빠지면 undefined 가 들어온다. 여기서 던지면
    // 대회 상세 조회 전체가 500 이 되므로 반드시 안전하게 false 여야 한다.
    expect(isBracketPublished(undefined, undefined, now)).toBe(false);
    expect(isBracketPublished(null, undefined, now)).toBe(false);
    expect(isBracketPublished(undefined, new Date('2026-07-01T00:00:00.000Z'), now)).toBe(true);
  });

  it('즉시 공개된 대회는 예약과 무관하게 공개', () => {
    const publishedAt = new Date('2026-07-30T00:00:00.000Z');
    expect(isBracketPublished(publishedAt, null, now)).toBe(true);
    // 미래 예약이 남아 있어도 이미 공개된 사실이 우선한다.
    expect(isBracketPublished(publishedAt, new Date('2026-08-05T00:00:00.000Z'), now)).toBe(true);
  });

  it('예약 시각이 아직 오지 않았으면 비공개', () => {
    expect(isBracketPublished(null, new Date('2026-08-01T09:00:00.001Z'), now)).toBe(false);
  });

  it('예약 시각 정각이면 공개 — 경계 포함', () => {
    expect(isBracketPublished(null, new Date('2026-08-01T09:00:00.000Z'), now)).toBe(true);
  });

  it('예약 시각이 지났으면 공개 — 별도 스케줄러 실행 없이 전환된다', () => {
    expect(isBracketPublished(null, new Date('2026-07-31T09:00:00.000Z'), now)).toBe(true);
  });
});
