export interface ShowcaseResultParticipantRow {
  readonly participantId: string;
  readonly sideId: string;
  readonly started: boolean;
  readonly minutesPlayed: number | null;
  readonly goals: number;
  readonly assists: number;
  readonly fouls: number;
  readonly cards: unknown;
  readonly goalkeeper: boolean;
}

export interface ShowcaseResultParticipantPlan {
  readonly requiresRevision: boolean;
  readonly rows: readonly ShowcaseResultParticipantRow[];
}

export function buildShowcaseResultParticipantPlan(input: {
  readonly homeSideId: string;
  readonly awaySideId: string;
  readonly homeParticipantId: string;
  readonly awayParticipantId: string;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly currentRows: readonly ShowcaseResultParticipantRow[];
}): ShowcaseResultParticipantPlan {
  const rows = input.currentRows.map((row) => ({ ...row }));
  const currentIds = new Set(rows.map((row) => row.participantId));
  const addPrimaryParticipant = (
    participantId: string,
    sideId: string,
    sideScore: number,
  ) => {
    if (currentIds.has(participantId)) return;
    const accountedGoals = rows
      .filter((row) => row.sideId === sideId)
      .reduce((total, row) => total + row.goals, 0);
    rows.push({
      participantId,
      sideId,
      started: true,
      minutesPlayed: 40,
      goals: Math.max(0, sideScore - accountedGoals),
      assists: 0,
      fouls: 0,
      cards: { yellow: 0, red: 0 },
      goalkeeper: false,
    });
    currentIds.add(participantId);
  };

  addPrimaryParticipant(input.homeParticipantId, input.homeSideId, input.homeScore);
  addPrimaryParticipant(input.awayParticipantId, input.awaySideId, input.awayScore);
  return {
    requiresRevision: rows.length !== input.currentRows.length,
    rows,
  };
}