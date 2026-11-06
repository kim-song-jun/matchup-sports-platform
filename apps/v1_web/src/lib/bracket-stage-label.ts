import { bracketTrackLabel } from './bracket-track';

/** A stage control already sits inside its tournament scope. Keep the stored stage name once. */
export function bracketStageLabel(track: Parameters<typeof bracketTrackLabel>[0], groupName: string): string {
  const name = groupName.trim();
  const trackName = bracketTrackLabel(track);
  const prefix = trackName ? `${trackName} · ` : '';
  return (prefix && name.startsWith(prefix) ? name.slice(prefix.length).trim() : name) || name;
}
