/**
 * Task 24 -- frontend-local mirror of the public-records response shapes
 * shipped in `apps/v1_api/src/games/public-records/**` (see
 * `docs/api/domains/public-records.md`). Kept separate from `@/types/api`
 * (not a declared Task 24 output) and never imports `@prisma/client`
 * directly, per this repo's frontend convention.
 *
 * `visibilityMode` only ever carries the three modes a public payload can
 * actually be serialized under -- a `hidden` fixture is never returned by
 * the API at all (same 404 as "does not exist"), so `'hidden'` is
 * deliberately not part of this union.
 */
export type PublicVisibilityMode = 'status_only' | 'live' | 'official_only';

/** `pending` covers both "no official revision yet" and "a correction draft is mid-review". */
export type PublicResultState = 'pending' | 'official' | 'corrected' | 'void';

export type PublicScoreStatus = 'unavailable' | 'live' | 'official';

export interface PublicScore {
  readonly home: number;
  readonly away: number;
}

export interface PublicSideSummary {
  readonly registrationId: string;
  readonly teamId: string;
  readonly teamName: string;
}

/** One row of `GET /tournaments/:id/schedule` `items[]`/`unscheduled[]`. */
export interface PublicScheduleEntry {
  readonly fixtureId: string;
  readonly round: string;
  readonly fixtureNumber: number;
  readonly legNumber: number;
  readonly groupId: string | null;
  readonly groupName: string | null;
  readonly scheduledAt: string | null;
  readonly venue: string | null;
  readonly fieldName: string | null;
  readonly home: PublicSideSummary | null;
  readonly away: PublicSideSummary | null;
  readonly visibilityMode: PublicVisibilityMode;
  readonly status: string;
  readonly resultState: PublicResultState;
  readonly scoreStatus: PublicScoreStatus;
  readonly score: PublicScore | null;
  readonly hasVideo: boolean;
}

export interface PublicStandingRow {
  readonly groupId: string;
  readonly groupName: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly position: number;
  readonly points: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
}

export interface PublicTournamentScheduleResponse {
  readonly tournamentId: string;
  readonly tournamentTitle: string;
  readonly bracketPublished: boolean;
  readonly items: readonly PublicScheduleEntry[];
  readonly unscheduled: readonly PublicScheduleEntry[];
  readonly standings: readonly PublicStandingRow[];
  readonly nextCursor: string | null;
}

/** A lineup slot's `displayName` is `null` exactly when D-03/D-11 consent gating withholds identity. */
export interface PublicLineupSlot {
  readonly participantId: string;
  readonly displayName: string | null;
  readonly jerseyNumber: number | null;
  readonly position: string | null;
}

export interface PublicLineup {
  readonly home: readonly PublicLineupSlot[];
  readonly away: readonly PublicLineupSlot[];
}

/** `type` mirrors `V1GameEventType` ('GOAL' | 'CARD') but is kept as `string` to avoid a `@prisma/client` import. */
export interface PublicMatchEvent {
  readonly type: string;
  readonly sideId: string;
  readonly participantId: string | null;
  readonly period: number | null;
  readonly clockMs: number | null;
}

export interface PublicMatchMvp {
  readonly participantId: string;
  readonly displayName: string | null;
}

export interface PublicMatchHistoryEntry {
  readonly revision: number;
  readonly state: 'OFFICIAL' | 'VOID';
  readonly officialAt: string | null;
  readonly reason: string | null;
  readonly isCorrection: boolean;
}

export interface PublicMatchVideo {
  readonly id: string;
  readonly title: string | null;
  readonly url: string;
}

export interface PublicNextMatch {
  readonly fixtureId: string;
  readonly round: string;
  readonly scheduledAt: string | null;
  readonly home: { readonly teamId: string; readonly teamName: string } | null;
  readonly away: { readonly teamId: string; readonly teamName: string } | null;
}

/** `GET /tournaments/:id/matches/:fixtureId` response. */
export interface PublicMatchDetail {
  readonly tournamentId: string;
  readonly tournamentTitle: string;
  readonly fixtureId: string;
  readonly gameId: string | null;
  readonly round: string;
  readonly fixtureNumber: number;
  readonly legNumber: number;
  readonly groupId: string | null;
  readonly groupName: string | null;
  readonly scheduledAt: string | null;
  readonly venue: string | null;
  readonly fieldName: string | null;
  readonly home: PublicSideSummary | null;
  readonly away: PublicSideSummary | null;
  readonly visibilityMode: PublicVisibilityMode;
  readonly status: string;
  readonly resultState: PublicResultState;
  readonly scoreStatus: PublicScoreStatus;
  readonly score: PublicScore | null;
  readonly lineup: PublicLineup | null;
  readonly events: readonly PublicMatchEvent[];
  readonly mvp: PublicMatchMvp | null;
  readonly pendingProjection: boolean;
  readonly history: readonly PublicMatchHistoryEntry[];
  readonly videos: readonly PublicMatchVideo[];
  readonly nextMatch: PublicNextMatch | null;
}

export interface PublicTeamRecordItem {
  readonly gameId: string;
  readonly teamMatchId: string | null;
  readonly tournamentId: string | null;
  readonly tournamentTitle: string | null;
  readonly opponentTeamId: string | null;
  readonly opponentTeamName: string | null;
  readonly opponentTeamLogoUrl: string | null;
  /** `WON | DRAWN | LOST` (`V1TeamRecordResult`), kept as `string` to avoid a `@prisma/client` import. */
  readonly result: string;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly officialAt: string;
  readonly isCorrected: boolean;
}

export interface PublicTeamRecordsSummary {
  readonly played: number;
  readonly won: number;
  readonly drawn: number;
  readonly lost: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
}

/** `GET /teams/:id/records` response. */
export interface PublicTeamRecordsResponse {
  readonly teamId: string;
  readonly teamName: string;
  readonly teamLogoUrl: string | null;
  readonly summary: PublicTeamRecordsSummary;
  readonly items: readonly PublicTeamRecordItem[];
  readonly nextCursor: string | null;
}

export interface PublicUserRecordItem {
  readonly id: string;
  readonly gameId: string;
  readonly matchType: 'tournament' | 'team_match';
  readonly tournamentId: string | null;
  readonly tournamentTitle: string | null;
  readonly round: string | null;
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly opponentTeamId: string | null;
  readonly opponentTeamName: string | null;
  readonly result: 'WON' | 'LOST' | 'DRAWN' | null;
  readonly goals: number;
  readonly cards: { readonly yellow: number; readonly red: number };
  readonly minutesPlayed: number | null;
  readonly started: boolean;
  readonly goalkeeper: boolean;
  readonly mvp: boolean;
  readonly isCorrected: boolean;
  readonly officialAt: string;
}

export interface PublicUserRecordsSummary {
  readonly appearances: number;
  readonly goals: number;
  readonly assists: number;
  readonly fouls: number;
  readonly yellowCards: number;
  readonly redCards: number;
  readonly mvpCount: number;
}

/**
 * `GET /users/:id/records` response. Every row here already passed
 * `isParticipantPubliclyEligible` server-side -- this is the user's own
 * career page, so every appearance shown here is one the user consented to
 * make public. `nickname` is the user's own profile nickname, never gated.
 */
export interface PublicUserRecordsResponse {
  readonly userId: string;
  readonly nickname: string | null;
  readonly summary: PublicUserRecordsSummary;
  readonly items: readonly PublicUserRecordItem[];
  readonly nextCursor: string | null;
}
