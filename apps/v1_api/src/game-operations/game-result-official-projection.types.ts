import type { Prisma, V1VisibilityMode } from '@prisma/client';

export type OfficialScore = { home: number; away: number };

export type OfficialRevisionRow = {
  revisionId: string;
  gameId: string;
  revision: number;
  score: Prisma.JsonValue;
  sourceHash: string;
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
