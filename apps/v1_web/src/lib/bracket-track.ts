import type { StagePlan } from '@/types/stage-plan';
import type { V1TournamentBracketTrack, V1TournamentGroup } from '@/types/api';

export function bracketTrackLabel(track: V1TournamentBracketTrack | null | undefined, plan?: StagePlan | null): string | null {
  if (plan && track?.startsWith('stage:')) {
    for (const stage of plan.stages) { const pool = stage.pools.find(p => `stage:${p.key}` === track); if (pool) return `${stage.name} · ${pool.name}`; }
  }
  if (track === 'upper') return '상위 결선';
  if (track === 'lower') return '하위 결선';
  return track && track !== 'overall' ? track : null;
}

export function effectiveBracketTrack(track: V1TournamentBracketTrack | null | undefined): V1TournamentBracketTrack {
  return track ?? 'overall';
}

/**
 * 결선 그룹 이름 앞에 토너먼트 이름을 한 번만 붙인다. N개 토너먼트의 그룹 이름은 이미 "프리미어 · 12강"처럼
 * 토너먼트 이름으로 시작하므로(그룹 이름은 대회 안에서 유일해야 한다) 그대로 앞붙임하면 "프리미어 · 프리미어 · 12강"이 된다.
 */
export function bracketGroupLabel(track: V1TournamentBracketTrack | null | undefined, groupName: string): string {
  const trackLabel = bracketTrackLabel(track);
  if (trackLabel === null || groupName === trackLabel || groupName.startsWith(`${trackLabel} · `)) return groupName;
  return `${trackLabel} · ${groupName}`;
}

/** 운영자가 이름을 붙인 토너먼트(정규리그 + N개 토너먼트)의 트랙인가. 기존 상·하위 결선(upper·lower)과 전체(overall)는 아니다. */
export function isNamedBracketTrack(track: V1TournamentBracketTrack | null | undefined): boolean {
  return track != null && track !== 'overall' && track !== 'upper' && track !== 'lower';
}

type TrackedGroup = Pick<V1TournamentGroup, 'bracketTrack' | 'sortOrder'>;

/**
 * 결선 트랙(overall 제외)을 운영자가 만든 순서로 돌려준다. 서버가 그룹을 phase → sortOrder 로 내려주므로
 * 먼저 나온 그룹의 트랙을 고르면 팀 수가 다른 토너먼트(12팀의 첫 단계가 8팀의 8강보다 앞선다)에서 순서가 뒤집힌다.
 * N개 토너먼트의 sortOrder 는 트랙번호*100+단계라 트랙별 최소 sortOrder 가 만든 순서다.
 * 기존 상·하위 결선은 sortOrder 가 같으므로 상위가 먼저다.
 */
export function orderedBracketTracks(groups: readonly TrackedGroup[]): string[] {
  const firstSortOrder = new Map<string, number>();
  for (const group of groups) {
    const track = group.bracketTrack;
    if (!track || track === 'overall') continue;
    const known = firstSortOrder.get(track);
    if (known === undefined || group.sortOrder < known) firstSortOrder.set(track, group.sortOrder);
  }
  const legacyRank = (track: string) => (track === 'upper' ? 0 : track === 'lower' ? 1 : 2);
  return [...firstSortOrder.entries()]
    .sort(([trackA, orderA], [trackB, orderB]) => orderA - orderB || legacyRank(trackA) - legacyRank(trackB))
    .map(([track]) => track);
}

/** 트랙별 항목을 결선 그룹 순서로 세운다. 결선 그룹에 없는 트랙은 받은 순서 그대로 맨 뒤에 둔다. */
export function sortByBracketTrackOrder<T>(
  items: readonly T[],
  groups: readonly TrackedGroup[],
  trackOf: (item: T) => string | null | undefined,
): T[] {
  const rank = new Map(orderedBracketTracks(groups).map((track, index) => [track, index]));
  const rankOf = (item: T) => rank.get(trackOf(item) ?? '') ?? rank.size;
  return [...items].sort((a, b) => rankOf(a) - rankOf(b));
}
