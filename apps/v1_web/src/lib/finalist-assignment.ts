import type { FinalistGroup, FinalistPreview } from '@/types/finalist-assignment';

export const finalistTargetKey = (target: { fixtureId: string; side: string }) => `${target.fixtureId}:${target.side}`;

/** 각 조의 운영자 배정 순서. 공식 성적표는 변경하지 않는다. 동률 구간은 직접 확인한다. */
export function initialFinalistOrder(group: FinalistGroup): string[] {
  return group.teams.map((team) => team.registrationId);
}

export function recommendFinalists(preview: FinalistPreview, orders: Record<string, string[]>, counts: Record<string, number>, mode: 'cross' | 'seed'): string[] {
  const selected = preview.groups.flatMap((group) => (orders[group.id] ?? []).slice(0, counts[group.id] ?? 0)
    .map((id, rank) => ({ id, rank, groupId: group.id })));
  if (new Set(selected.map((team) => team.id)).size !== selected.length) throw new Error('같은 팀이 여러 조에 있어요. 조 편성을 확인해 주세요.');
  if (selected.length !== preview.targets.length) throw new Error(`진출팀 ${selected.length}팀과 결선 자리 ${preview.targets.length}개가 같아야 해요.`);
  const seeded = [...selected].sort((a, b) => a.rank - b.rank);
  const result = new Map<number, string>();
  const targetGroups = new Map<string, number[]>();
  preview.targets.forEach((target, index) => targetGroups.set(target.fixtureId, [...(targetGroups.get(target.fixtureId) ?? []), index]));
  // 앞 경기 승자와 만나는 직행 자리는 먼저 상위 시드를 배정한다.
  for (const indexes of targetGroups.values()) {
    if (indexes.length === 1) result.set(indexes[0], seeded.shift()!.id);
  }
  for (const indexes of targetGroups.values()) {
    if (indexes.length !== 2) continue;
    const home = seeded.shift()!;
    let awayIndex = seeded.length - 1;
    if (mode === 'cross') {
      const candidates = seeded.map((team, index) => ({ team, index })).filter(({ team }) => team.groupId !== home.groupId);
      candidates.sort((a, b) => b.team.rank - a.team.rank || a.index - b.index);
      awayIndex = candidates[0]?.index ?? 0;
    }
    result.set(indexes[0], home.id);
    result.set(indexes[1], seeded.splice(awayIndex, 1)[0].id);
  }
  return preview.targets.map((_, index) => result.get(index)!);
}
