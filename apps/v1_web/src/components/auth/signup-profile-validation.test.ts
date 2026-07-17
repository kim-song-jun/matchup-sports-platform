import { describe, expect, it } from 'vitest';
import {
  formatBirthDate,
  formatPhone,
  getSignupProfileIssue,
  isCompleteSignupProfile,
  normalizeSeparatedDigits,
} from './signup-profile-validation';

const VALID_PROFILE = {
  displayName: '홍길동',
  phone: '01012345678',
  birthDate: '20000229',
  gender: 'male',
} as const;

describe('signup profile validation', () => {
  it.each([
    ['displayName', { displayName: '   ' }],
    ['displayName', { displayName: '\u200B\u200C\u200D\uFEFF' }],
    ['phone', { phone: '0101234567' }],
    ['birthDate', { birthDate: '20010229' }],
    ['gender', { gender: '' }],
  ] as const)('returns %s for an invalid required profile field', (field, override) => {
    // Given
    const profile = { ...VALID_PROFILE, ...override };

    // When
    const issue = getSignupProfileIssue(profile);

    // Then
    expect(issue).toBe(field);
  });

  it('accepts a complete required profile', () => {
    // Given
    const profile = VALID_PROFILE;

    // When
    const issue = getSignupProfileIssue(profile);

    // Then
    expect(issue).toBeNull();
    expect(isCompleteSignupProfile(profile)).toBe(true);
  });

  it('normalizes pasted phone and birth-date values for the API payload', () => {
    // Given
    const phone = '010-1234-5678';
    const birthDate = '2000-02-29';

    // When
    const phoneDigits = normalizeSeparatedDigits(phone);
    const birthDateDigits = normalizeSeparatedDigits(birthDate);

    // Then
    expect({ phoneDigits, birthDateDigits }).toEqual({
      phoneDigits: '01012345678',
      birthDateDigits: '20000229',
    });
    expect(formatPhone(phoneDigits)).toBe(phone);
    expect(formatBirthDate(birthDateDigits)).toBe(birthDate);
  });

  it.each([
    '010123456789',
    '0101234abcd',
    '200002290',
    '2000ab29',
  ] as const)('does not turn invalid raw value %s into valid digits', (rawValue) => {
    // Given
    const input = rawValue;

    // When
    const normalized = normalizeSeparatedDigits(input);

    // Then
    expect(normalized).toBe(rawValue);
  });
});
