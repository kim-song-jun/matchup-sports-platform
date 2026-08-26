import { describe, expect, it } from 'vitest';
import { periodLabel } from './period-label';

describe('periodLabel', () => {
  it('1피리어드는 "전반", 2피리어드는 "후반"으로 부른다', () => {
    expect(periodLabel(1)).toBe('전반');
    expect(periodLabel(2)).toBe('후반');
  });

  it('3피리어드 이상은 전/후반이 뜻을 잃으므로 번호 기반으로 되돌아간다', () => {
    expect(periodLabel(3)).toBe('3피리어드');
    expect(periodLabel(4)).toBe('4피리어드');
  });
});
