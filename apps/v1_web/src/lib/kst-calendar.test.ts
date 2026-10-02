import { describe, expect, it } from 'vitest';
import { isoToKstDatetimeLocal, kstDatetimeLocalToIso } from './kst-calendar';

// vitest 는 TZ=UTC 로 돈다 — 브라우저 로컬 해석이면 KST 와 9시간 어긋난다.
const KST_OCT4_0030 = '2026-10-03T15:30:00.000Z';
const KST_OCT3_2359 = '2026-10-03T14:59:00.000Z';

describe('datetime-local ↔ ISO (KST 벽시계)', () => {
  it('입력값을 KST 로 읽고 쓴다 (자정 경계 양쪽)', () => {
    expect(isoToKstDatetimeLocal(KST_OCT4_0030)).toBe('2026-10-04T00:30');
    expect(isoToKstDatetimeLocal(KST_OCT3_2359)).toBe('2026-10-03T23:59');
    expect(kstDatetimeLocalToIso('2026-10-04T00:30')).toBe(KST_OCT4_0030);
    expect(kstDatetimeLocalToIso('2026-10-01T23:59')).toBe('2026-10-01T14:59:00.000Z');
  });

  it('초가 붙은 값도 읽는다', () => {
    expect(kstDatetimeLocalToIso('2026-10-04T00:30:15')).toBe('2026-10-03T15:30:15.000Z');
  });

  it('ISO → 입력값 → ISO 왕복이 값을 바꾸지 않는다', () => {
    for (const iso of [KST_OCT4_0030, KST_OCT3_2359, '2026-12-31T15:00:00.000Z']) {
      expect(kstDatetimeLocalToIso(isoToKstDatetimeLocal(iso))).toBe(iso);
    }
  });

  it('빈 값·깨진 값은 입력값 쪽은 빈 문자열, ISO 쪽은 null', () => {
    for (const empty of [null, undefined, '', 'not-a-date']) {
      expect(isoToKstDatetimeLocal(empty)).toBe('');
    }
    expect(kstDatetimeLocalToIso('')).toBeNull();
    expect(kstDatetimeLocalToIso('not-a-date')).toBeNull();
  });
});
