import { describe, expect, it } from 'vitest';
import { isBracketPublished } from './bracket-visibility';

// 이 판정이 서버와 어긋나면 어드민이 "이미 공개된" 대진표를 계속 예약 상태로 보고
// 공개 버튼을 다시 누르게 된다. 서버 규칙과 같은 경계를 검증한다.
describe('isBracketPublished (client)', () => {
  const now = new Date('2026-08-01T09:00:00.000Z');

  it('공개도 예약도 없으면 비공개', () => {
    expect(isBracketPublished(null, null, now)).toBe(false);
    expect(isBracketPublished(undefined, undefined, now)).toBe(false);
  });

  it('publishedAt 이 있으면 공개', () => {
    expect(isBracketPublished('2026-07-30T00:00:00.000Z', null, now)).toBe(true);
  });

  it('예약 시각이 지났으면 publishedAt 이 없어도 공개 — 서버 판정과 일치', () => {
    expect(isBracketPublished(null, '2026-08-01T08:59:59.999Z', now)).toBe(true);
  });

  it('예약 시각 정각이면 공개 — 경계 포함', () => {
    expect(isBracketPublished(null, '2026-08-01T09:00:00.000Z', now)).toBe(true);
  });

  it('예약 시각이 아직이면 비공개', () => {
    expect(isBracketPublished(null, '2026-08-01T09:00:00.001Z', now)).toBe(false);
  });

  it('잘못된 날짜 문자열은 비공개로 떨어진다', () => {
    expect(isBracketPublished(null, 'not-a-date', now)).toBe(false);
  });
});
