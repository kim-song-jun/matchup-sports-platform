import { V1GameLineupState } from '@prisma/client';
import { selectLineupParticipantsWithDraftFallback } from './latest-lineup-participants';

export interface FriendlyResultParticipantInput {
  participantId: string;
  sideId: string;
  started?: boolean;
  minutesPlayed?: number;
  goals: number;
  assists?: number;
  fouls?: number;
  cards: { yellow: number; red: number };
  goalkeeper: boolean;
}

export interface FriendlyRosterParticipant {
  id: string;
  sideId: string;
  lineupId: string;
  position: string | null;
}

export interface FriendlyLineupRevision {
  id: string;
  sideId: string;
  revision: number;
  state: V1GameLineupState;
}

/**
 * Client statistics stay authoritative; the latest HOME/AWAY roster only fills omitted rows.
 * The v1 lineup contract is "lineup = appeared participants", so every appended row is an
 * appearance with zero counting stats rather than an invented goal/card contribution.
 */
export function hydrateFriendlyTeamMatchResultParticipants(
  submitted: readonly FriendlyResultParticipantInput[],
  participantCandidates: readonly FriendlyRosterParticipant[],
  lineups: readonly FriendlyLineupRevision[],
): FriendlyResultParticipantInput[] {
  const latestRoster = selectLineupParticipantsWithDraftFallback(
    participantCandidates,
    lineups,
  );
  const submittedIds = new Set(submitted.map((participant) => participant.participantId));
  const missing = latestRoster
    .filter((participant) => !submittedIds.has(participant.id))
    .map((participant): FriendlyResultParticipantInput => ({
      participantId: participant.id,
      sideId: participant.sideId,
      started: true,
      goals: 0,
      assists: 0,
      fouls: 0,
      cards: { yellow: 0, red: 0 },
      goalkeeper: participant.position === 'GK',
    }));
  return [...submitted, ...missing];
}
