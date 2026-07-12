import { describe, it, expect } from 'vitest';
import {
  parsePrizeRows,
  serializePrizeRows,
  isPrizeAmountValue,
  prizeAmountDigits,
  formatPrizeRowValue,
  prizeRowAmountValue,
  prizeRowsTotal,
} from './prize-breakdown';

describe('parsePrizeRows', () => {
  it('parses existing amount-only breakdown text unchanged (backward compat)', () => {
    expect(parsePrizeRows('1위 600,000원 / 2위 300,000원 / MVP 100,000원')).toEqual([
      { label: '1위', amount: '600,000원' },
      { label: '2위', amount: '300,000원' },
      { label: 'MVP', amount: '100,000원' },
    ]);
  });

  it('parses a goods-only (non-amount) row as free text, keeping "·" listing intact', () => {
    expect(parsePrizeRows('MVP 축구화 · 상품권')).toEqual([
      { label: 'MVP', amount: '축구화 · 상품권' },
    ]);
  });

  it('does not split a single row on "·" even with multiple items listed', () => {
    expect(parsePrizeRows('참가팀 전원 음료·간식 제공')).toEqual([
      { label: '참가팀', amount: '전원 음료·간식 제공' },
    ]);
  });

  it('parses a mixed amount + goods breakdown separated by "/"', () => {
    expect(parsePrizeRows('1위 600,000원 / MVP 축구화')).toEqual([
      { label: '1위', amount: '600,000원' },
      { label: 'MVP', amount: '축구화' },
    ]);
  });

  it('does not treat a comma as a row separator (only "/" and newline are)', () => {
    expect(parsePrizeRows('1위 600,000원, MVP 축구화')).toEqual([
      { label: '1위', amount: '600,000원, MVP 축구화' },
    ]);
  });
});

describe('serializePrizeRows', () => {
  it('serializes amount rows to the existing text format', () => {
    expect(
      serializePrizeRows([
        { label: '1위', amount: '600,000원' },
        { label: '2위', amount: '300,000원' },
      ]),
    ).toBe('1위 600,000원 / 2위 300,000원');
  });

  it('serializes goods rows as free text without breaking the separator convention', () => {
    expect(
      serializePrizeRows([
        { label: '1위', amount: '600,000원' },
        { label: 'MVP', amount: '축구화 · 상품권' },
      ]),
    ).toBe('1위 600,000원 / MVP 축구화 · 상품권');
  });

  it('drops rows with an empty label', () => {
    expect(serializePrizeRows([{ label: '  ', amount: '600,000원' }])).toBe('');
  });
});

describe('isPrizeAmountValue', () => {
  it('classifies pure numeric + optional 원 suffix as amount', () => {
    expect(isPrizeAmountValue('600,000원')).toBe(true);
    expect(isPrizeAmountValue('600000')).toBe(true);
    expect(isPrizeAmountValue('600,000')).toBe(true);
  });

  it('classifies free text (goods) as non-amount', () => {
    expect(isPrizeAmountValue('우승 트로피')).toBe(false);
    expect(isPrizeAmountValue('축구화 · 상품권')).toBe(false);
    expect(isPrizeAmountValue('상품권 10만원 상당')).toBe(false);
    expect(isPrizeAmountValue('')).toBe(false);
    expect(isPrizeAmountValue('   ')).toBe(false);
  });
});

describe('prizeAmountDigits / formatPrizeRowValue', () => {
  it('extracts digits from an amount value', () => {
    expect(prizeAmountDigits('600,000원')).toBe(600000);
    expect(prizeAmountDigits('600000')).toBe(600000);
  });

  it('returns null for goods values', () => {
    expect(prizeAmountDigits('우승 트로피')).toBeNull();
  });

  it('normalizes an amount value to a comma-formatted "원" string', () => {
    expect(formatPrizeRowValue('600000')).toBe('600,000원');
    expect(formatPrizeRowValue('600,000원')).toBe('600,000원');
  });

  it('returns the trimmed original text for goods values', () => {
    expect(formatPrizeRowValue('  우승 트로피  ')).toBe('우승 트로피');
  });
});

describe('prizeRowAmountValue / prizeRowsTotal (backward compat)', () => {
  it('sums only the amount rows, ignoring goods rows', () => {
    const rows = [
      { label: '1위', amount: '600,000원' },
      { label: '2위', amount: '300,000원' },
      { label: 'MVP', amount: '축구화' },
    ];
    expect(prizeRowAmountValue(rows[0])).toBe(600000);
    expect(prizeRowAmountValue(rows[2])).toBeNull();
    expect(prizeRowsTotal(rows)).toBe(900000);
  });
});
