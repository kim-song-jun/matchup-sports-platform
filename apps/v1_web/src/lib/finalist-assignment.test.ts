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
  it('순위 출처 없는 수동 6팀 골격도 교차 추천하되 중복 승자 연결은 거부한다', () => {
    const preview = previewOf([5, 5]);
    preview.targets = preview.targets.slice(0, 6);
    preview.targets[4] = { ...preview.targets[4], fixtureId: 's1', opponentWinnerFixtureId: 'f0' };
    preview.targets[5] = { ...preview.targets[5], fixtureId: 's2', opponentWinnerFixtureId: 'f1' };
    const orders = { g0: initialFinalistOrder(preview.groups[0]), g1: initialFinalistOrder(preview.groups[1]) };
    [orders.g0[1], orders.g0[2]] = [orders.g0[2], orders.g0[1]];
    expect(recommendFinalists(preview, orders, { g0: 3, g1: 3 }, 'cross')).toEqual(['g1-1', 'g0-1', 'g0-2', 'g1-2', 'g0-0', 'g1-0']);
    preview.targets[5].opponentWinnerFixtureId = 'f0';
    expect(() => recommendFinalists(preview, orders, { g0: 3, g1: 3 }, 'cross')).toThrow('승자 연결');
  });
  it.each([false, true])('6팀은 실제 부전승 상대 연결로 같은 조 1·2위를 분리한다 (역순=%s)', (reverse) => {
    const preview = previewOf([5, 5]);
    preview.targets = [
      { fixtureId: 'p1', side: 'HOME', sourceGroupId: 'g0', sourceRank: 2 },
      { fixtureId: 'p1', side: 'AWAY', sourceGroupId: 'g1', sourceRank: 3 },
      { fixtureId: 'p2', side: 'HOME', sourceGroupId: 'g1', sourceRank: 2 },
      { fixtureId: 'p2', side: 'AWAY', sourceGroupId: 'g0', sourceRank: 3 },
      { fixtureId: 's1', side: 'HOME', sourceGroupId: 'g0', sourceRank: 1, opponentWinnerFixtureId: 'p1' },
      { fixtureId: 's2', side: 'AWAY', sourceGroupId: 'g1', sourceRank: 1, opponentWinnerFixtureId: 'p2' },
    ].map(target => ({ label: target.fixtureId + target.side, groupId: null, slotId: null, currentRegistrationId: null, ...target })) as FinalistPreview['targets'];
    if (reverse) preview.targets.reverse();
    const before = JSON.stringify(preview);
    const orders = Object.fromEntries(preview.groups.map(group => [group.id, initialFinalistOrder(group)]));
    const result = recommendFinalists(preview, orders, { g0: 3, g1: 3 }, 'cross');
    const byTarget = Object.fromEntries(preview.targets.map((target, i) => [target.fixtureId + target.side, result[i]]));
    expect(byTarget).toEqual({ p1HOME: 'g1-1', p1AWAY: 'g0-2', p2HOME: 'g0-1', p2AWAY: 'g1-2', s1HOME: 'g0-0', s2AWAY: 'g1-0' });
    expect(new Set(result).size).toBe(6);
    expect(JSON.stringify(preview)).toBe(before);
    expect(recommendFinalists(preview, orders, { g0: 3, g1: 3 }, 'seed')).toEqual(preview.targets.map(target => orders[target.sourceGroupId!][target.sourceRank! - 1]));
    preview.targets = preview.targets.map(target => ({ ...target, opponentWinnerFixtureId: undefined }));
    expect(() => recommendFinalists(preview, orders, { g0: 3, g1: 3 }, 'cross')).toThrow('승자 연결');
  });
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
