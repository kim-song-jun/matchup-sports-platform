import { Prisma } from '@prisma/client';
import { validateCompetitionConfig } from '../tournaments/competition-config/competition-config';
import {
  recalculateAndUpsertGroupStandings,
  type StandingsSourceGroup,
} from '../tournaments/tournament-group-standings';
import type { OfficialRevisionRow } from './game-result-official-projection.types';

type GroupForStandingsRow = StandingsSourceGroup & {
  phase: string;
  tournament: {
    id: string;
    deletedAt: Date | null;
    competitionConfigVersionId: string | null;
    competitionConfig: unknown;
  } | null;
};

/**
 * Recalculates the affected group's `V1TournamentStanding` rows whenever a
 * tournament-fixture game result becomes the current OFFICIAL revision, so
 * group standings stay live instead of requiring an admin to hit
 * `POST admin/tournaments/:id/standings/recalculate` by hand after every
 * result (that route stays in place as an operator recovery tool — see
 * TournamentBracketService.recalculateStandings()).
 *
 * Skips (no-op, no throw) for anything that isn't a standings-bearing
 * group-phase fixture result:
 *  - team-match games (`revision.tournamentFixtureId === null`) — team
 *    matches have no tournament standings at all;
 *  - a fixture with no `groupId` (e.g. a knockout slot never wired to a
 *    group row);
 *  - a group whose `phase !== 'group'` — semi/final/third_place fixtures
 *    never feed standings. `phase` is the discriminator (not the `round`
 *    display label, which mixes Korean/English strings), matching
 *    `TournamentBracketService.recalculateStandings()`'s own
 *    `where: { phase: 'group' }` filter exactly. Knockout progression is
 *    `GameResultBracketProjectionService.project()`'s job, not this one's.
 *  - a soft-deleted tournament or one without an active competition config
 *    — same "nothing to recalculate" cases `recalculateStandings()` guards
 *    against before its own transaction.
 *
 * Any other failure (most plausibly `validateCompetitionConfig()` rejecting
 * a structurally-invalid stored config, which should be impossible once a
 * game has reached OFFICIAL — see games.service.ts's
 * `competitionConfigVersionId` invariant) is left to throw uncaught. This
 * mirrors `GameResultBracketProjectionService.project()`'s own unguarded
 * asserts (BRACKET_SOURCE_STATE_INVALID etc.): both run inside the same DB
 * transaction as the rest of `GameResultOfficialProjectionService.handler`,
 * so a throw here rolls back that entire GAME_RESULT_OFFICIAL projection
 * attempt and is retried by the outbox worker's existing
 * `GAME_OPERATION_RETRY_DELAYS_MS` backoff (then POISONED + alerted after 6
 * attempts, see `V1GameOperationsWorkerService.fail`). There is no bespoke
 * partial-rollback path to invent here, and a standings bug must not
 * silently leave bracket advancement or the public result cache
 * half-projected while standings alone go stale.
 */
export class GameResultStandingsProjectionService {
  async project(tx: Prisma.TransactionClient, revision: OfficialRevisionRow): Promise<void> {
    if (revision.tournamentFixtureId === null) return;

    const fixture = await tx.v1TournamentFixture.findUnique({
      where: { id: revision.tournamentFixtureId },
      select: { groupId: true },
    });
    if (!fixture || fixture.groupId === null) return;

    const group = await tx.v1TournamentGroup.findUnique({
      where: { id: fixture.groupId },
      select: {
        id: true,
        phase: true,
        groupTeams: { select: { registrationId: true } },
        fixtures: {
          where: { status: 'completed' },
          select: {
            homeRegistrationId: true,
            awayRegistrationId: true,
            game: {
              select: { currentOfficialRevision: { select: { state: true, score: true } } },
            },
          },
        },
        tournament: {
          select: {
            id: true,
            deletedAt: true,
            competitionConfigVersionId: true,
            competitionConfig: true,
          },
        },
      },
    }) as GroupForStandingsRow | null;
    if (!group || group.phase !== 'group') return;

    const tournament = group.tournament;
    if (!tournament || tournament.deletedAt !== null || !tournament.competitionConfigVersionId) return;

    const config = validateCompetitionConfig(tournament.competitionConfig);
    await recalculateAndUpsertGroupStandings(
      tx,
      {
        tournamentId: tournament.id,
        configVersionId: tournament.competitionConfigVersionId,
        config,
        group,
      },
      new Date(),
    );
  }
}
