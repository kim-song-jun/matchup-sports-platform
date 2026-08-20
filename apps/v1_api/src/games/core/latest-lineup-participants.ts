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
  return participants.filter((participant) => {
    // `undefined === undefined` 로 통과시키지 않는다. 라인업을 한 건도 못 찾은 경우
    // (`lineups` 가 비었거나 participant 가 사라진 라인업을 가리키는 경우) 양쪽이 모두
    // undefined 라 그냥 비교하면 **필터가 아무것도 거르지 않고 전원을 통과시킨다** --
    // 이 함수를 붙인 이유(옛 리비전 선수가 공식 기록에 남는 것)와 정반대 결과가 된다.
    // 최신 리비전을 확정할 수 없으면 그 participant 는 공식 스냅샷에 넣지 않는다.
    const participantRevision = lineupById.get(participant.lineupId)?.revision;
    if (participantRevision === undefined) return false;
    return participantRevision === latestRevisionBySide.get(participant.sideId);
  });
}
