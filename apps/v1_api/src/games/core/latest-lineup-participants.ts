export interface LineupRevisionParticipant {
  readonly sideId: string;
  readonly lineupId: string;
}

export interface LineupRevision {
  readonly id: string;
  readonly sideId: string;
  readonly revision: number;
}

export function selectLatestLineupParticipants<T extends LineupRevisionParticipant>(
  participants: readonly T[],
  lineups: readonly LineupRevision[],
): T[] {
  const latestRevisionBySide = new Map<string, number>();
  const lineupById = new Map(lineups.map((lineup) => [lineup.id, lineup]));
  for (const lineup of lineups) {
    const latest = latestRevisionBySide.get(lineup.sideId) ?? 0;
    latestRevisionBySide.set(lineup.sideId, Math.max(latest, lineup.revision));
  }
  return participants.filter(
    (participant) =>
      lineupById.get(participant.lineupId)?.revision === latestRevisionBySide.get(participant.sideId),
  );
}
