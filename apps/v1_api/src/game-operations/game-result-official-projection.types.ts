import type { Prisma, V1VisibilityMode } from '@prisma/client';

/**
 * `penalties` mirrors the flat producer shape `GamesService.deriveTournamentRevision`/
 * `TournamentResultReviewService.supersedeAndSubmit`/`createResultCorrection` write into
 * `V1GameResultRevision.score` (`{ home, away, penalties?: { home, away } }`) -- see
 * `tournament-fixture-official-result.ts`'s file doc for the two-producer JSON shape this
 * type must stay in sync with. Only set when a knockout fixture's regulation score was a
 * draw and an operator recorded a penalty shootout via the `end` command's payload.
 */
export type OfficialScore = { home: number; away: number; penalties?: { home: number; away: number } };

export type OfficialRevisionRow = {
  revisionId: string;
  gameId: string;
  revision: number;
  score: Prisma.JsonValue;
  sourceHash: string;
  playedAt: Date;
  officialAt: Date;
  reason: string | null;
  sourceType: string;
  currentOfficialRevisionId: string | null;
  tournamentId: string | null;
  tournamentFixtureId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  visibility: V1VisibilityMode;
};

export type PublicResultPayload = {
  gameId: string;
  revisionId: string;
  revision: number;
  sourceType: string;
  tournamentId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  score: OfficialScore;
  eventsHash: string;
  officialAt: string;
  visibility: V1VisibilityMode;
};

export type PublicResultProjection = {
  payload: PublicResultPayload;
  payloadJson: string;
  payloadHash: string;
  isCurrent: boolean;
};
