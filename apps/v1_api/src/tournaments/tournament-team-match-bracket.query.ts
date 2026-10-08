import { Prisma } from '@prisma/client';
import { serializeAdminBracketGame } from './slots/admin-bracket-view';

type PublicFixtureStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

/** Official game data consumed by the existing bracket result presenter. */
export const tournamentTeamMatchBracketInclude = {
  advancementTargets: { where: { source: { teamMatch: { deletedAt: null } } }, select: { sourceTeamMatchId: true, sourceOutcome: true, targetSide: true } },
  homeRegistration: { include: { team: { select: { name: true } } } },
  awayRegistration: { include: { team: { select: { name: true } } } },
  teamMatch: {
    select: {
      tournamentId: true,
      deletedAt: true,
      startAt: true,
      placeName: true,
      status: true,
      updatedAt: true,
      homeSlotId: true,
      awaySlotId: true,
      videos: { orderBy: { sortOrder: 'asc' }, select: { id: true, title: true, url: true, sortOrder: true } },
      game: {
        select: {
          id: true,
          version: true,
          // Counts all game events (independent of the filtered `events` below); drives the "live records exist" flag.
          _count: { select: { events: true } },
          resultRevisions: {
            orderBy: { revision: 'desc' },
            take: 1,
            select: { id: true, state: true, score: true, reason: true, supersedesId: true },
          },
          sourceType: true,
          teamMatchId: true,
          state: true,
          visibilityPolicy: { select: { mode: true } },
          sides: { select: { id: true, sideKey: true } },
          participants: { select: { id: true, sideId: true, userId: true, displayNameSnapshot: true } },
          currentOfficialRevision: {
            select: { id: true, state: true, score: true, goalEvents: true, outcomeReason: true, outcomeNote: true, officialAt: true, createdAt: true, updatedAt: true, tournamentResultLineages: { select: { note: true } } },
          },
          events: {
            where: { OR: [{ type: { in: ['GOAL', 'OWN_GOAL'] } }, { reversesEventId: { not: null } }] },
            select: { id: true, type: true, sideId: true, participantId: true, clockMs: true, reversesEventId: true, payload: true },
          },
        },
      },
    },
  },
} satisfies Prisma.V1TournamentMatchDetailsInclude;

export type TournamentTeamMatchBracketRow = Prisma.V1TournamentMatchDetailsGetPayload<{
  include: typeof tournamentTeamMatchBracketInclude;
}>;

export function serializeTournamentTeamMatchBracket(row: TournamentTeamMatchBracketRow) {
  const match = row.teamMatch;
  const state = match.game?.state;
  const status: PublicFixtureStatus = match.status === 'cancelled' || state === 'CANCELLED'
    ? 'cancelled'
    : match.status === 'completed'
      ? 'completed'
      : state === 'LIVE' || state === 'PAUSED' || state === 'ENDED'
        ? 'in_progress'
        : 'scheduled';
  return {
    id: row.teamMatchId,
    tournamentId: row.tournamentId,
    groupId: row.groupId,
    round: row.round,
    fixtureNumber: row.fixtureNumber,
    legNumber: row.legNumber,
    parentFixtureId: row.parentTeamMatchId,
    bracketSources: (row.advancementTargets ?? []).map((edge) => ({ fixtureId: edge.sourceTeamMatchId, outcome: edge.sourceOutcome, side: edge.targetSide })),
    homeRegistrationId: row.homeRegistrationId,
    awayRegistrationId: row.awayRegistrationId,
    homeSlotId: match.homeSlotId,
    awaySlotId: match.awaySlotId,
    scheduledAt: match.startAt?.toISOString() ?? null,
    venue: match.placeName,
    status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: new Date(Math.max(row.updatedAt.getTime(), match.updatedAt.getTime())).toISOString(),
    homeTeamName: row.homeRegistration?.team.name ?? 'TBD',
    awayTeamName: row.awayRegistration?.team.name ?? 'TBD',
    game: match.game === null ? null : serializeAdminBracketGame(match.game),
  };
}
