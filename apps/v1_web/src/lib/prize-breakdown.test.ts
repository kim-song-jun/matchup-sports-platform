import { describe, it, expect } from 'vitest';
import {
  splitPrizeSegments,
  parsePrizeRows,
  serializePrizeRows,
  isPrizeAmountValue,
  prizeAmountDigits,
  formatPrizeRowValue,
  prizeRowAmountValue,
  prizeRowsTotal,
} from './prize-breakdown';

describe('splitPrizeSegments (공용 스플리터 — 공개 칩·시상/어드민 행 공유)', () => {
  it('splits on "/" and newline', () => {
    expect(splitPrizeSegments('1위 600,000원 / 2위 300,000원\nMVP 100,000원')).toEqual([
      '1위 600,000원',
      '2위 300,000원',
      'MVP 100,000원',
    ]);
  });

  it('keeps numeric thousands commas but splits on non-numeric commas', () => {
    expect(splitPrizeSegments('1위 600,000원, MVP 축구화')).toEqual([
      '1위 600,000원',
      'MVP 축구화',
    ]);
  });

  it('keeps "·" goods listing inside a single segment', () => {
    expect(splitPrizeSegments('MVP 축구화 · 상품권')).toEqual(['MVP 축구화 · 상품권']);
    expect(splitPrizeSegments('참가팀 전원 음료·간식 제공')).toEqual(['참가팀 전원 음료·간식 제공']);
  });
});

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

  it('splits mixed breakdown on a non-numeric comma — 공개 칩과 동일한 2행 (구분자 규칙 통일)', () => {
    expect(parsePrizeRows('1위 600,000원, MVP 축구화')).toEqual([
      { label: '1위', amount: '600,000원' },
      { label: 'MVP', amount: '축구화' },
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

describe('round-trip 보호 — 값 안의 구분자 문자', () => {
  it('keeps a goods value containing "/" as one row after serialize → re-parse', () => {
    const serialized = serializePrizeRows([{ label: 'MVP', amount: '티셔츠/모자' }]);
    expect(serialized).toBe('MVP 티셔츠·모자');
    expect(parsePrizeRows(serialized)).toEqual([{ label: 'MVP', amount: '티셔츠·모자' }]);
  });

  it('folds surrounding spaces into the "·" replacement', () => {
    expect(serializePrizeRows([{ label: 'MVP', amount: '티셔츠 / 모자' }])).toBe('MVP 티셔츠·모자');
  });

  it('neutralizes non-numeric commas and newlines while preserving thousands commas', () => {
    const serialized = serializePrizeRows([
      { label: '1위', amount: '600,000원' },
      { label: '참가팀', amount: '음료, 간식\n제공' },
    ]);
    expect(serialized).toBe('1위 600,000원 / 참가팀 음료·간식 제공');
    expect(parsePrizeRows(serialized)).toEqual([
      { label: '1위', amount: '600,000원' },
      { label: '참가팀', amount: '음료·간식 제공' },
    ]);
  });

  it('sanitizes separator characters inside labels too', () => {
    const serialized = serializePrizeRows([{ label: '득점왕/도움왕', amount: '트로피' }]);
    expect(serialized).toBe('득점왕·도움왕 트로피');
    expect(parsePrizeRows(serialized)).toEqual([{ label: '득점왕·도움왕', amount: '트로피' }]);
  });

  it('leaves already-safe "·" listings untouched (spacing preserved)', () => {
    expect(serializePrizeRows([{ label: 'MVP', amount: '축구화 · 상품권' }])).toBe(
      'MVP 축구화 · 상품권',
    );
  });
});

describe('isPrizeAmountValue', () => {
  it('classifies pure numeric + optional 원 suffix as amount', () => {
    expect(isPrizeAmountValue('600,000원')).toBe(true);
    expect(isPrizeAmountValue('600000')).toBe(true);
    expect(isPrizeAmountValue('600,000')).toBe(true);
  });

  it('tolerates whitespace between digits and "원" (표기 편차)', () => {
    expect(isPrizeAmountValue('600,000 원')).toBe(true);
    expect(isPrizeAmountValue(' 600,000원 ')).toBe(true);
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
    expect(prizeAmountDigits('600,000 원')).toBe(600000);
  });

  it('returns null for goods values', () => {
    expect(prizeAmountDigits('우승 트로피')).toBeNull();
  });

  it('normalizes an amount value to a comma-formatted "원" string', () => {
    expect(formatPrizeRowValue('600000')).toBe('600,000원');
    expect(formatPrizeRowValue('600,000원')).toBe('600,000원');
    expect(formatPrizeRowValue('600,000 원')).toBe('600,000원');
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
