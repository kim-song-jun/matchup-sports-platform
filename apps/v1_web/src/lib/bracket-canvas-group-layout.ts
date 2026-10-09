// apps/v1_web/src/lib/bracket-canvas-group-layout.ts
import type { V1AdminBracketGroup, V1AdminBracketSlot } from '@/types/api';

/** 블록 맨 아래 여백 */
export const GROUP_BLOCK_FOOTER_HEIGHT = 8;

export type GroupBlockSlotRow = Pick<V1AdminBracketSlot, 'id' | 'position' | 'label' | 'registrationId' | 'teamName'>;

export type GroupBlockLayout = {
  groupId: string;
  name: string;
  advanceCount: number | null;
  /** 이 조에서 올라오는 순위 자리 중 가장 큰 순위. 진출 수가 비어 있을 때 연결선 높이를 나누는 데 쓴다. */
  rankCount: number;
  slots: GroupBlockSlotRow[];
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GroupBlockGeometry = {
  x: number;
  top: number;
  width: number;
  headerHeight: number;
  rowHeight: number;
  gap: number;
};

/**
 * 조 편성 블록을 그릴 조들. 순위 자리(GROUP_RANK)가 하나도 없는 대진(토너먼트·리그·수동으로 만든 조)은
 * 블록이 필요 없다 — 그 화면은 기존 그대로다. ENTRY 자리가 없는 조도 건너뛴다.
 */
export function groupBlockGroups(
  groups: readonly V1AdminBracketGroup[],
  slots: readonly V1AdminBracketSlot[],
): V1AdminBracketGroup[] {
  if (!slots.some((slot) => slot.kind === 'GROUP_RANK')) return [];
  return groups
    .filter((group) => group.phase === 'group' && slots.some((slot) => slot.kind === 'ENTRY' && slot.groupId === group.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ko'));
}

export function layoutGroupBlocks(
  input: GroupBlockGeometry & { groups: readonly V1AdminBracketGroup[]; slots: readonly V1AdminBracketSlot[] },
): GroupBlockLayout[] {
  const blocks: GroupBlockLayout[] = [];
  let y = input.top;
  for (const group of groupBlockGroups(input.groups, input.slots)) {
    const rows = input.slots
      .filter((slot) => slot.kind === 'ENTRY' && slot.groupId === group.id)
      .sort((a, b) => a.position - b.position)
      .map(({ id, position, label, registrationId, teamName }) => ({ id, position, label, registrationId, teamName }));
    const rankCount = input.slots
      .filter((slot) => slot.kind === 'GROUP_RANK' && slot.sourceGroupId === group.id)
      .reduce((max, slot) => Math.max(max, slot.position), 0);
    const height = input.headerHeight + rows.length * input.rowHeight + GROUP_BLOCK_FOOTER_HEIGHT;
    blocks.push({
      groupId: group.id,
      name: group.name,
      advanceCount: group.advanceCount,
      rankCount,
      slots: rows,
      x: input.x,
      y,
      width: input.width,
      height,
    });
    y += height + input.gap;
  }
  return blocks;
}

/**
 * 순위 연결선이 블록 오른쪽 가장자리에서 나가는 높이. 진출 수가 N 이면 블록 높이를 N+1 등분한 지점이라
 * 같은 조의 1위·2위 선이 서로 다른 높이에서 나가 겹치지 않는다.
 */
export function groupRankAnchorY(block: GroupBlockLayout, rank: number): number {
  const advance = Math.max(block.advanceCount ?? block.rankCount, rank);
  return block.y + (block.height * rank) / (advance + 1);
}
