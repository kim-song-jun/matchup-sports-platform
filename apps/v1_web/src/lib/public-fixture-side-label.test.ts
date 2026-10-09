import { describe, expect, it } from 'vitest';
import { publicFixtureSideLabel } from './public-fixture-side-label';

describe('publicFixtureSideLabel', () => {
  it.each([
    ['배정됐지만 모집 중이라 가려진 팀은 자리 라벨이 있어도 비공개', null, 'A조 1위', '비공개'],
    ['TBD 이고 자리 라벨이 있으면 자리 라벨', 'TBD', 'A조 1위', 'A조 1위'],
    ['빈 이름이고 자리 라벨이 있으면 자리 라벨', '', '3번 자리', '3번 자리'],
    ['TBD 이고 자리 라벨이 없으면 미정', 'TBD', null, '미정'],
    ['빈 이름이고 자리 라벨 필드 자체가 없으면 미정', '', undefined, '미정'],
    ['실명이면 자리 라벨이 있어도 실명', '서울FC', 'A조 1위', '서울FC'],
  ] as const)('%s', (_name, name, slotLabel, expected) => {
    expect(publicFixtureSideLabel(name, slotLabel)).toBe(expected);
  });
});
