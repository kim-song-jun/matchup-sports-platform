import { describe, expect, it } from 'vitest';
import {
  formatRosterBirthDate,
  getRegistrationDeadlineState,
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

  it('classifies registration deadlines independently from roster lock state', () => {
    const now = new Date('2026-07-20T12:00:00Z').getTime();

    expect(getRegistrationDeadlineState('2026-07-20T13:00:00Z', now)).toBe('upcoming');
    expect(getRegistrationDeadlineState('2026-07-20T11:00:00Z', now)).toBe('closed');
    expect(getRegistrationDeadlineState(null, now)).toBe('unscheduled');
    expect(getRegistrationDeadlineState('invalid', now)).toBe('unscheduled');
  });
});
