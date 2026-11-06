import { describe, expect, it } from 'vitest';
import { bracketGroupLabel, isNamedBracketTrack } from './bracket-track';

describe('bracketGroupLabel', () => {
  it('트랙 이름으로 이미 시작하는 그룹 이름에는 다시 붙이지 않는다', () => {
    expect(bracketGroupLabel('프리미어', '프리미어 · 12강')).toBe('프리미어 · 12강');
    expect(bracketGroupLabel('프리미어', '프리미어')).toBe('프리미어');
  });
  it('트랙 이름이 없거나 그룹 이름이 다르면 기존처럼 앞에 붙인다', () => {
    expect(bracketGroupLabel('upper', '상위 8강')).toBe('상위 결선 · 상위 8강');
    expect(bracketGroupLabel('lower', 'B조')).toBe('하위 결선 · B조');
    expect(bracketGroupLabel('overall', '8강')).toBe('8강');
    expect(bracketGroupLabel(null, 'A조')).toBe('A조');
  });
});

describe('isNamedBracketTrack', () => {
  it('운영자가 이름을 붙인 트랙만 true 다', () => {
    expect(isNamedBracketTrack('프리미어')).toBe(true);
    for (const track of ['overall', 'upper', 'lower', null, undefined] as const) expect(isNamedBracketTrack(track)).toBe(false);
  });
});
