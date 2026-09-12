import { Prisma } from '@prisma/client';

type PublicFixtureStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

/** Official game data consumed by the existing bracket result presenter. */
export const tournamentTeamMatchBracketInclude = {
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
      videos: { orderBy: { sortOrder: 'asc' }, select: { id: true, title: true, url: true, sortOrder: true } },
      game: {
        select: {
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
    homeRegistrationId: row.homeRegistrationId,
    awayRegistrationId: row.awayRegistrationId,
    scheduledAt: match.startAt?.toISOString() ?? null,
    venue: match.placeName,
    status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: new Date(Math.max(row.updatedAt.getTime(), match.updatedAt.getTime())).toISOString(),
    homeTeamName: row.homeRegistration?.team.name ?? 'TBD',
    awayTeamName: row.awayRegistration?.team.name ?? 'TBD',
  };
}
