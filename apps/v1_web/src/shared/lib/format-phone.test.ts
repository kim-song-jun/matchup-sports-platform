import { describe, expect, it } from 'vitest';
import { formatPhone } from './format-phone';

describe('formatPhone', () => {
  it.each([
    ['010', '010'],
    ['0101234', '010-1234'],
    ['01012345678', '010-1234-5678'],
    ['010-1234-5678', '010-1234-5678'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatPhone(input)).toBe(expected);
  });
});
