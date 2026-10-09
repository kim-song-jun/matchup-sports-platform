// apps/v1_web/src/lib/bracket-canvas-group-layout.test.ts
import { describe, expect, it } from 'vitest';
import { makeGroup, makeSlot } from '@/test/bracket-canvas-fixtures';
import { groupBlockGroups, groupRankAnchorY, layoutGroupBlocks } from './bracket-canvas-group-layout';

const geometry = { x: 632, top: 56, width: 232, headerHeight: 44, rowHeight: 44, gap: 24 };

const gA = makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0, advanceCount: 2 });
const gB = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1, advanceCount: 2 });
const semi = makeGroup({ id: 'g-semi', name: '4강', phase: 'semi' });

const entries = (groupId: string, letter: string, count: number) =>
  Array.from({ length: count }, (_, i) =>
    makeSlot({ id: `e${letter}${i + 1}`, kind: 'ENTRY', groupId, position: i + 1, label: `${letter}조 ${i + 1}번` }),
  );
const rank = (letter: string, sourceGroupId: string, position: number) =>
  makeSlot({ id: `r${letter}${position}`, kind: 'GROUP_RANK', groupId: 'g-semi', sourceGroupId, position, label: `${letter}조 ${position}위` });

const slots = [...entries('gA', 'A', 4), ...entries('gB', 'B', 4), rank('A', 'gA', 1), rank('A', 'gA', 2), rank('B', 'gB', 1), rank('B', 'gB', 2)];

describe('groupBlockGroups', () => {
  it('순위 자리가 있는 대진에서 ENTRY 자리를 가진 조별 조만 조 순서대로 돌려준다', () => {
    expect(groupBlockGroups([gB, semi, gA], slots).map((g) => g.id)).toEqual(['gA', 'gB']);
  });

  it('순위 자리가 하나도 없으면(토너먼트·리그·수동 조) 블록이 없다 — 대조: 순위 자리를 더하면 생긴다', () => {
    const withoutRanks = slots.filter((slot) => slot.kind !== 'GROUP_RANK');
    expect(groupBlockGroups([gA, gB], withoutRanks)).toEqual([]);
    expect(groupBlockGroups([gA, gB], [...withoutRanks, rank('A', 'gA', 1)])).toHaveLength(2);
  });

  it('ENTRY 자리가 없는 조(수동으로 만든 조)는 건너뛴다', () => {
    const manual = makeGroup({ id: 'gC', name: 'C조', phase: 'group', sortOrder: 2 });
    expect(groupBlockGroups([gA, gB, manual], slots).map((g) => g.id)).toEqual(['gA', 'gB']);
  });
});

describe('layoutGroupBlocks', () => {
  it('높이 = 머리 44 + 자리 수 x 44 + 바닥 8, 다음 블록은 간격 24 를 두고 아래에 놓인다', () => {
    const [a, b] = layoutGroupBlocks({ ...geometry, groups: [gA, gB], slots });
    expect([a.x, a.y, a.width, a.height]).toEqual([632, 56, 232, 228]);
    expect(b.y).toBe(56 + 228 + 24);
  });

  it('자리는 순번 순이고 자기 조의 ENTRY 자리만 담는다 (섞어 넣어도)', () => {
    const shuffled = [...slots].reverse();
    const [a, b] = layoutGroupBlocks({ ...geometry, groups: [gA, gB], slots: shuffled });
    expect(a.slots.map((s) => s.id)).toEqual(['eA1', 'eA2', 'eA3', 'eA4']);
    expect(b.slots.map((s) => s.id)).toEqual(['eB1', 'eB2', 'eB3', 'eB4']);
  });

  it('올라오는 순위 자리 중 가장 큰 순위를 rankCount 로 기록한다', () => {
    const [a] = layoutGroupBlocks({ ...geometry, groups: [gA, gB], slots });
    expect(a.rankCount).toBe(2);
    const onlyFirst = layoutGroupBlocks({ ...geometry, groups: [gA, gB], slots: slots.filter((s) => s.id !== 'rA2') });
    expect(onlyFirst[0].rankCount).toBe(1);
  });
});

describe('groupRankAnchorY', () => {
  const [a] = layoutGroupBlocks({ ...geometry, groups: [gA, gB], slots });

  it('진출 2팀이면 블록 높이를 3등분한 지점 — 1위·2위 선이 서로 다른 높이다', () => {
    expect(groupRankAnchorY(a, 1)).toBe(56 + 76);
    expect(groupRankAnchorY(a, 2)).toBe(56 + 152);
  });

  it('진출 1팀이면 블록 가운데', () => {
    const one = { ...a, advanceCount: 1 };
    expect(groupRankAnchorY(one, 1)).toBe(56 + 114);
  });

  it('진출 수가 비어 있으면 rankCount 로 나눈다', () => {
    const unknown = { ...a, advanceCount: null };
    expect(groupRankAnchorY(unknown, 1)).toBe(56 + 76);
  });

  it('데이터가 어긋나 순위가 진출 수보다 커도 선은 블록 안에서 나간다', () => {
    const odd = { ...a, advanceCount: 1, rankCount: 1 };
    const y = groupRankAnchorY(odd, 2);
    expect(y).toBeGreaterThan(odd.y);
    expect(y).toBeLessThan(odd.y + odd.height);
  });
});
