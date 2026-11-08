import { describe, expect, it } from 'vitest';
import { bracketStageLabel } from './bracket-stage-label';

describe('bracketStageLabel', () => {
  it.each<[string | null, string, string]>([
    ['프리미어', '프리미어 · 12강', '12강'],
    ['프리미어', '프리미어 · 본선 첫 경기', '본선 첫 경기'],
    ['프리미어', '운영자가 고른 이름', '운영자가 고른 이름'],
    ['upper', '상위 결선 · 6강', '6강'],
    [null, ' 준결승 ', '준결승'],
    ['프리미어', '프리미어', '프리미어'],
  ])('%s / %s → %s', (track, name, expected) => {
    expect(bracketStageLabel(track, name)).toBe(expected);
  });
});
