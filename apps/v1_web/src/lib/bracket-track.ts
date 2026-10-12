import type { V1TournamentBracketTrack } from '@/types/api';

export function bracketTrackLabel(track: V1TournamentBracketTrack | null | undefined): string | null {
  if (track === 'upper') return '상위 결선';
  if (track === 'lower') return '하위 결선';
  return null;
}

export function effectiveBracketTrack(track: V1TournamentBracketTrack | null | undefined): V1TournamentBracketTrack {
  return track ?? 'overall';
}
