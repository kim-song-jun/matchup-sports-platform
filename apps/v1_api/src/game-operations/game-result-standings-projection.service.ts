import { Prisma } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { validateCompetitionConfig } from '../tournaments/competition-config/competition-config';
import {
  fairPlayByRegistrationFromGroups,
  recalculateAndUpsertGroupStandings,
  type StandingsSourceGroup,
} from '../tournaments/tournament-group-standings';
import { recalculateAndUpsertOverallStandings } from '../tournaments/tournament-overall-standings';
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
 * canonical tournament TeamMatch game result becomes the current OFFICIAL revision, so
 * group standings stay live instead of requiring an admin to hit
 * `POST admin/tournaments/:id/standings/recalculate` by hand after every
 * result (that route stays in place as an operator recovery tool — see
 * TournamentBracketService.recalculateStandings()).
 *
 * Skips (no-op, no throw) for anything that isn't a standings-bearing
 * group-phase canonical result:
 *  - legacy-only, league, and friendly revisions without a canonical tournament TeamMatch;
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
    // Friendly/league and legacy-only revisions have no tournament Details.
    // Historical import creates a canonical TeamMatch before invoking this projector.
    if (revision.tournamentTeamMatchId === null) return;
    if (revision.sourceType !== 'TEAM_MATCH') {
      throw new ConflictException({
        code: 'CANONICAL_MATCH_REQUIRED',
        message: 'Tournament standings require a TEAM_MATCH source.',
      });
    }

    const detail = await tx.v1TournamentMatchDetails.findUnique({
      where: { teamMatchId: revision.tournamentTeamMatchId },
      select: {
        groupId: true,
        tournamentId: true,
        homeRegistrationId: true,
        awayRegistrationId: true,
        teamMatch: {
          select: {
            id: true,
            deletedAt: true,
            tournamentId: true,
            leagueId: true,
            status: true,
            game: {
              select: {
                id: true,
                sourceType: true,
                currentOfficialRevision: {
                  select: {
                    state: true,
                    score: true,
                    resultParticipants: { select: { sideId: true, cards: true } },
                  },
                },
                sides: { select: { id: true, sideKey: true } },
              },
            },
          },
        },
      },
    });
    const match = detail?.teamMatch;
    if (detail === null || match == null) {
      throw new ConflictException({
        code: 'CANONICAL_MATCH_REQUIRED',
        message: 'The official revision is not bound to a valid canonical tournament match.',
      });
    }
    if (
      match.deletedAt !== null ||
      match.id !== revision.tournamentTeamMatchId ||
      match.tournamentId === null ||
      match.tournamentId !== detail.tournamentId ||
      match.tournamentId !== revision.teamMatchTournamentId ||
      match.leagueId !== null ||
      match.status !== 'completed' ||
      match.game === null ||
      match.game.id !== revision.gameId ||
      match.game.sourceType !== 'TEAM_MATCH'
    ) {
      throw new ConflictException({
        code: 'CANONICAL_MATCH_REQUIRED',
        message: 'The official revision is not bound to a valid canonical tournament match.',
      });
    }
    if (detail.groupId === null) return;

    const targetGroup = await tx.v1TournamentGroup.findUnique({
      where: { id: detail.groupId },
      select: {
        id: true,
        phase: true,
        tournament: {
          select: {
            id: true,
            deletedAt: true,
            competitionConfigVersionId: true,
            competitionConfig: true,
          },
        },
      },
    });
    if (targetGroup === null || targetGroup.tournament?.id !== detail.tournamentId) {
      throw new ConflictException({
        code: 'CANONICAL_MATCH_REQUIRED',
        message: 'The canonical tournament group could not be resolved.',
      });
    }
    if (targetGroup.phase !== 'group') return;
    const allGroups = await this.loadCanonicalGroups(tx, detail.tournamentId);
    const group = allGroups.find((candidate) => candidate.id === detail.groupId);
    if (group === undefined) {
      throw new ConflictException({
        code: 'CANONICAL_MATCH_REQUIRED',
        message: 'The canonical tournament group could not be loaded.',
      });
    }
    const tournament = group.tournament;
    if (!tournament || tournament.deletedAt !== null || !tournament.competitionConfigVersionId) return;
    const config = validateCompetitionConfig(tournament.competitionConfig);
    const now = new Date();
    // F5: 이 그룹만으로 계산해도 값은 전체 조 기준과 동일하다 — 픽스처는 조별로
    // 분리돼 있어 다른 조 픽스처가 이 그룹 팀의 카드 집계에 섞일 수 없다.
    const groupFairPlayByRegistration = fairPlayByRegistrationFromGroups([group]);
    await recalculateAndUpsertGroupStandings(
      tx,
      {
        tournamentId: tournament.id,
        configVersionId: tournament.competitionConfigVersionId,
        config,
        group,
        fairPlayByRegistration: groupFairPlayByRegistration,
      },
      now,
    );

    // Invariant (§7.1): every path that calls recalculateAndUpsertGroupStandings
    // must also call recalculateAndUpsertOverallStandings in the same tx, so
    // the group view and the overall (통합) view never drift. Unlike
    // TournamentBracketService.recalculateStandings() (admin-triggered, loops
    // every group-phase group already), this automatic per-result trigger
    // only has the one affected group loaded above — so it re-fetches every
    // group-phase group of the tournament here, in the same transaction, to
    // feed the overall recalculation.
    await recalculateAndUpsertOverallStandings(
      tx,
      {
        tournamentId: tournament.id,
        configVersionId: tournament.competitionConfigVersionId,
        config,
        groups: allGroups,
        fairPlayByRegistration: fairPlayByRegistrationFromGroups(allGroups),
      },
      now,
    );
  }

  private async loadCanonicalGroups(
    tx: Prisma.TransactionClient,
    tournamentId: string,
  ): Promise<GroupForStandingsRow[]> {
    const groups = await tx.v1TournamentGroup.findMany({
      where: {
        tournamentId,
        phase: 'group',
      },
      select: {
        id: true,
        phase: true,
        groupTeams: { select: { registrationId: true } },
        tournament: {
          select: {
            id: true,
            deletedAt: true,
            competitionConfigVersionId: true,
            competitionConfig: true,
          },
        },
      },
    });
    const details = await tx.v1TournamentMatchDetails.findMany({
      where: {
        tournamentId,
        teamMatch: { deletedAt: null },
      },
      select: {
        groupId: true,
        homeRegistrationId: true,
        awayRegistrationId: true,
        teamMatch: {
          select: {
            tournamentId: true,
            leagueId: true,
            status: true,
            game: {
              select: {
                id: true,
                sourceType: true,
                currentOfficialRevision: {
                  select: {
                    state: true,
                    score: true,
                    resultParticipants: { select: { sideId: true, cards: true } },
                  },
                },
                sides: { select: { id: true, sideKey: true } },
              },
            },
          },
        },
      },
    });
    type CanonicalFixture = StandingsSourceGroup['fixtures'][number];
    const fixturesByGroup = new Map<string, CanonicalFixture[]>();
    for (const detail of details) {
      const match = detail.teamMatch;
      if (
        match === null ||
        match.tournamentId !== tournamentId ||
        match.leagueId !== null ||
        match.game === null ||
        match.game.sourceType !== 'TEAM_MATCH'
      ) {
        throw new ConflictException({
          code: 'CANONICAL_MATCH_REQUIRED',
          message: 'A tournament group contains a non-canonical TeamMatch.',
        });
      }
      if (match.status !== 'completed') continue;
      if (detail.groupId === null) continue;
      const fixtures = fixturesByGroup.get(detail.groupId) ?? [];
      fixtures.push({
        homeRegistrationId: detail.homeRegistrationId,
        awayRegistrationId: detail.awayRegistrationId,
        game: detail.teamMatch.game,
      });
      fixturesByGroup.set(detail.groupId, fixtures);
    }
    return groups.map((group) => ({
      ...group,
      fixtures: fixturesByGroup.get(group.id) ?? [],
    })) as GroupForStandingsRow[];
  }
}
