import { GENDER_RULES, genderRuleColumnFilter, normalizeGenderRule } from './gender-rule';

// 컬럼 필터(`equals` 문자열 또는 `{ in }`)를 메모리에서 평가한다.
function matchesFilter(filter: ReturnType<typeof genderRuleColumnFilter>, stored: string | null): boolean {
  if (typeof filter === 'string') return stored === filter;
  return stored !== null && (filter.in as string[]).includes(stored);
}

const STORED = ['성별 무관', '무관', 'any', '남', '여', null, '남녀 혼성', 'Any'];

describe('gender-rule', () => {
  it('정본 값은 그대로, 별칭은 성별 무관으로 접고, 알 수 없는 값은 null 이다', () => {
    expect(GENDER_RULES.map((rule) => normalizeGenderRule(rule))).toEqual([...GENDER_RULES]);
    expect(normalizeGenderRule('any')).toBe('성별 무관');
    expect(normalizeGenderRule('무관')).toBe('성별 무관');
    expect(normalizeGenderRule('남녀 혼성')).toBeNull();
    expect(normalizeGenderRule('')).toBeNull();
    expect(normalizeGenderRule(null)).toBeNull();
  });

  it.each(['성별 무관', '무관'] as const)('%s 필터는 별칭으로 저장된 행을 포함하고 남·여·미설정·미상 행은 제외한다', (query) => {
    const included = STORED.filter((stored) => matchesFilter(genderRuleColumnFilter(query), stored));
    expect(included).toEqual(['성별 무관', '무관', 'any']);
  });

  it.each(['남', '여'] as const)('%s 필터는 해당 값의 행만 고른다', (query) => {
    const included = STORED.filter((stored) => matchesFilter(genderRuleColumnFilter(query), stored));
    expect(included).toEqual([query]);
  });

  it('필터가 고르는 행과 표시 정규화가 같은 의미를 가진다 (필터 결과는 전부 해당 라벨로 보인다)', () => {
    for (const query of GENDER_RULES) {
      for (const stored of STORED.filter((value) => matchesFilter(genderRuleColumnFilter(query), value))) {
        expect(normalizeGenderRule(stored)).toBe(query);
      }
    }
  });
});
