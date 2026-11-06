import { describe, expect, it } from 'vitest';
import { initialFinalistOrder, recommendFinalists } from './finalist-assignment';
import type { FinalistPreview } from '@/types/finalist-assignment';
export function previewOf(sizes = [4, 4, 3, 3]): FinalistPreview {
  return { version: 'v', blockedReason: null,
    groups: sizes.map((size, i) => ({ id: `g${i}`, name: `${i}조`, advanceCount: 2, complete: true, ranks: [],
      teams: Array.from({ length: size }, (_, j) => ({ registrationId: `g${i}-${j}`, teamName: `팀${i}-${j}`, position: j + 1, points: size - j, goalsFor: size, goalsAgainst: j })) })),
    targets: Array.from({ length: 8 }, (_, i) => ({ fixtureId: `f${Math.floor(i / 2)}`, side: i % 2 ? 'AWAY' : 'HOME', label: `자리${i}`, groupId: 'q', slotId: null, currentRegistrationId: null })),
  };
}
describe('결선 자동 배정 초안', () => {
  it.each([[4, 4, 3, 3], [4, 4, 4, 3]])('불균등 조 %j 에서 상위 2팀씩 중복 없이 교차 배정한다', (...sizes) => {
    const preview = previewOf(sizes);
    const orders = Object.fromEntries(preview.groups.map((group) => [group.id, initialFinalistOrder(group)]));
    const counts = Object.fromEntries(preview.groups.map((group) => [group.id, 2]));
    const result = recommendFinalists(preview, orders, counts, 'cross');
    expect(new Set(result).size).toBe(8);
    expect([...result].sort()).toEqual(preview.groups.flatMap((group) => group.teams.slice(0, 2).map((team) => team.registrationId)).sort());
    for (let i = 0; i < 8; i += 2) expect(result[i].slice(0, 2)).not.toBe(result[i + 1].slice(0, 2));
  });
  it('운영자 변경 순서를 쓰되 원본 공식 순위는 변경하지 않는다', () => {
    const preview = previewOf(); const original = JSON.stringify(preview);
    const orders = Object.fromEntries(preview.groups.map((group) => [group.id, initialFinalistOrder(group)]));
    [orders.g0[0], orders.g0[2]] = [orders.g0[2], orders.g0[0]];
    const result = recommendFinalists(preview, orders, { g0: 2, g1: 2, g2: 2, g3: 2 }, 'seed');
    expect(result).toContain('g0-2'); expect(result).not.toContain('g0-0');
    expect(JSON.stringify(preview)).toBe(original);
  });
  it('직행 자리에 상위 시드를 먼저 배정하고 나머지를 기존 경기 순서에 넣는다', () => {
    const preview = previewOf();
    preview.targets[6].fixtureId = 'q1'; preview.targets[7].fixtureId = 'q2';
    const orders = Object.fromEntries(preview.groups.map((group) => [group.id, initialFinalistOrder(group)]));
    const result = recommendFinalists(preview, orders, { g0: 2, g1: 2, g2: 2, g3: 2 }, 'seed');
    expect(result[6]).toBe('g0-0'); expect(result[7]).toBe('g1-0');
    expect(new Set(result).size).toBe(8);
  });
  it('진출팀 수와 기존 결선 자리 수가 다르면 배정을 만들지 않는다', () => {
    const preview = previewOf(); const orders = Object.fromEntries(preview.groups.map((group) => [group.id, initialFinalistOrder(group)]));
    expect(() => recommendFinalists(preview, orders, { g0: 1, g1: 2, g2: 2, g3: 2 }, 'cross')).toThrow('같아야');
  });
});
