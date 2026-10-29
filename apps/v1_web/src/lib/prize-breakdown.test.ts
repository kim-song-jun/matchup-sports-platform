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
  groupPrizeRows,
} from './prize-breakdown';

describe('groupPrizeRows', () => {
  it('비연속 항목과 우승·숫자 순위를 같은 묶음으로 모으되 저장 데이터와 상품 수량을 보존한다', () => {
    const rows = parsePrizeRows('우승 1000000 / MVP 트레이닝복 / 1위 트로피 / 우승 트로피 / MVP 삭스 / 준우승 300000 / 3위 상품권 / 추첨 경품 / 개인어워드 상품권 / 특별 상품');
    const before = structuredClone(rows);
    expect(groupPrizeRows(rows)).toEqual([
      { label: '우승', position: 1, category: '팀 시상', amounts: ['1000000', '트로피', '트로피'] },
      { label: 'MVP', position: null, category: '개인 시상', amounts: ['트레이닝복', '삭스'] },
      { label: '준우승', position: 2, category: '팀 시상', amounts: ['300000'] },
      { label: '3위', position: 3, category: '팀 시상', amounts: ['상품권'] },
      { label: '추첨', position: null, category: '기타 시상', amounts: ['경품'] },
      { label: '개인어워드', position: null, category: '개인 시상', amounts: ['상품권'] },
      { label: '특별', position: null, category: '기타 시상', amounts: ['상품'] },
    ]);
    expect(rows).toEqual(before);
  });

  it('빈 라벨을 생략하고 내용 없는 시상·공동 순위·자유 항목은 보존한다', () => {
    expect(groupPrizeRows([{ label: ' ', amount: '상품' }, { label: '공동 3위', amount: ' 트로피 ' }, { label: '특별', amount: '' }])).toEqual([
      { label: '공동 3위', position: 3, category: '팀 시상', amounts: ['트로피'] },
      { label: '특별', position: null, category: '기타 시상', amounts: [] },
    ]);
    expect(groupPrizeRows([])).toEqual([]);
  });
});

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

describe('sanitize 트레일링 구분자 정리', () => {
  it('구분자 문자로 끝나는 값은 꼬리 · 없이 저장된다', () => {
    expect(serializePrizeRows([{ label: 'MVP', amount: '티셔츠/' }])).toBe('MVP 티셔츠');
    expect(serializePrizeRows([{ label: '전원', amount: '음료, ' }])).toBe('전원 음료');
  });

  it('구분자로 시작하는 값도 선행 · 없이 저장된다', () => {
    expect(serializePrizeRows([{ label: 'MVP', amount: '/티셔츠' }])).toBe('MVP 티셔츠');
  });
});

describe('isPrizeAmountValue 숫자 최소 1개 요구', () => {
  it('콤마·원만 있는 값은 금액이 아니다', () => {
    expect(isPrizeAmountValue(',')).toBe(false);
    expect(isPrizeAmountValue(',,원')).toBe(false);
    expect(isPrizeAmountValue('원')).toBe(false);
  });
});


describe('명시적 시상 분류 저장 계약', () => {
  it('공백·구분자가 있는 자유 시상명을 저장하고 재조회해도 개인 분류와 내용을 보존한다', () => {
    const rows = [{ category: '개인 시상' as const, label: '오늘의 허슬 플레이어', amount: '트로피/상품권, 운동복' }];
    const saved = serializePrizeRows(rows);
    const loaded = parsePrizeRows(saved);
    expect(loaded).toEqual(rows);
    expect(groupPrizeRows(loaded)).toEqual([{ category: '개인 시상', label: '오늘의 허슬 플레이어', position: null, amounts: ['트로피/상품권, 운동복'] }]);
    expect(splitPrizeSegments(saved)).toEqual(['오늘의 허슬 플레이어 트로피/상품권, 운동복']);
  });

  it('우승·1위·1등, 준우승·2위·2등을 같은 팀 시상과 수상팀 순위로 연결한다', () => {
    const groups = groupPrizeRows(parsePrizeRows('우승 현금 / 1위 트로피 / 1등 상품권 / 준우승 현금 / 2등 트로피 / 2위 상품권 / 3등 상품'));
    expect(groups.map(({ position, amounts }) => ({ position, amounts }))).toEqual([
      { position: 1, amounts: ['현금', '트로피', '상품권'] },
      { position: 2, amounts: ['현금', '트로피', '상품권'] },
      { position: 3, amounts: ['상품'] },
    ]);
  });

  it('같은 이름도 다른 분류라면 합치지 않고 개인 시상에 팀 순위를 연결하지 않는다', () => {
    const groups = groupPrizeRows(parsePrizeRows(serializePrizeRows([
      { category: '팀 시상', label: '우승', amount: '트로피' },
      { category: '개인 시상', label: '우승', amount: '개인 상품' },
      { category: '기타 시상', label: '득점왕', amount: '' },
    ])));
    expect(groups.map(({ category, position }) => ({ category, position }))).toEqual([
      { category: '팀 시상', position: 1 }, { category: '개인 시상', position: null }, { category: '기타 시상', position: null },
    ]);
  });

  it('명시적 빈 목록은 비우고 손상된 분류 데이터는 성공처럼 파싱하지 않는다', () => {
    expect(serializePrizeRows([{ category: '개인 시상', label: ' ', amount: '상품' }])).toBe('');
    expect(() => parsePrizeRows('@teameet/prizes/v1:[{"category":"invalid","label":"상","amount":""}]')).toThrow();
  });
});
