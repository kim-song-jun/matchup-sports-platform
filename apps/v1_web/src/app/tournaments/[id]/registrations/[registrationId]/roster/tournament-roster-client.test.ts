import { describe, expect, it } from 'vitest';
import {
  formatRosterBirthDate,
  normalizeBirthDateForInput,
  normalizeProfileText,
} from './tournament-roster-client';

describe('tournament roster profile/date helpers', () => {
  it('normalizes team member profile fields before registerability checks use them', () => {
    expect(normalizeProfileText('  홍길동  ')).toBe('홍길동');
    expect(normalizeProfileText(null)).toBe('');
    expect(normalizeBirthDateForInput('19950315')).toBe('1995-03-15');
    expect(normalizeBirthDateForInput('1995.3.5')).toBe('1995-03-05');
    expect(normalizeBirthDateForInput('1995-03-15T00:00:00.000Z')).toBe('1995-03-15');
  });

  it('does not render invalid birthDateSnapshot values as NaN.NaN.NaN', () => {
    expect(formatRosterBirthDate('1995-03-15')).toBe('1995.03.15');
    expect(formatRosterBirthDate('19950315')).toBe('1995.03.15');
    expect(formatRosterBirthDate('not-a-date')).toBe('미입력');
    expect(formatRosterBirthDate(null)).toBe('미입력');
  });
});
