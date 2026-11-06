import type { V1TournamentBracketTrack } from '@/types/api';

export function bracketTrackLabel(track: V1TournamentBracketTrack | null | undefined): string | null {
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
