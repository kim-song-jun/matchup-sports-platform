import type { Prisma } from '@prisma/client';
import {
  calculateCompetitionStandings,
  type CalculatedStanding,
  type CompetitionConfig,
  type StandingFixture,
} from './competition-config/competition-config';
import {
  resolveTournamentFixtureOfficialScore,
  type TournamentFixtureOfficialScore,
} from './tournament-fixture-official-result';

/**
 * The shape both `TournamentBracketService.recalculateStandings()` (all
 * group-phase groups in a tournament, admin-triggered) and
 * `GameResultStandingsProjectionService` (a single affected group,
 * triggered automatically when a tournament-fixture result becomes the
 * current OFFICIAL revision) already fetch: a group's teams plus its
 * completed fixtures, each carrying `game.currentOfficialRevision.{state,
 * score}` — the R3 §4-3 new-path source of truth for a fixture's result
 * (see `tournament-fixture-official-result.ts`).
 *
 * `result` is the R3 §4-3~§4-4 한시적 legacy fallback input
 * (`V1TournamentFixtureResult`'s score columns only — standings never need
 * goals/note). It is optional: `recalculateStandings()` fetches it and
 * therefore gets the fallback, while `GameResultStandingsProjectionService`
 * does not fetch it (that automatic trigger only ever fires off a fresh
 * new-path OFFICIAL revision, and in production the other fixtures in the
 * same group have already been through the GAME_BACKFILL migration too —
 * see `tournament-fixture-official-result.ts`'s file-level doc comment).
 * Removed together with the rest of the fallback in R3 §4-4단계.
 */
export type StandingsSourceGroup = {
  id: string;
  groupTeams: readonly { registrationId: string }[];
  fixtures: readonly {
    homeRegistrationId: string | null;
    awayRegistrationId: string | null;
    game: {
      currentOfficialRevision: { state: string; score: Prisma.JsonValue } | null;
    } | null;
    result?: TournamentFixtureOfficialScore | null;
  }[];
};

/** Same "no fictitious score" filtering recalculateStandings() already applied inline. */
export function standingsFixturesFromGroup(group: StandingsSourceGroup): StandingFixture[] {
  return group.fixtures.flatMap((fixture) => {
    if (!fixture.homeRegistrationId || !fixture.awayRegistrationId) return [];
    const score = resolveTournamentFixtureOfficialScore(fixture.game, fixture.result);
    if (!score) return [];
    return [
      {
        homeRegistrationId: fixture.homeRegistrationId,
        awayRegistrationId: fixture.awayRegistrationId,
        homeScore: score.homeScore,
        awayScore: score.awayScore,
      },
    ];
  });
}

/**
 * Computes standings for one group and upserts its `V1TournamentStanding`
 * rows. Extracted out of `TournamentBracketService.recalculateStandings()`
 * so the admin recalculate route and the automatic per-result trigger
 * (`GameResultStandingsProjectionService`) share the exact same
 * calculation and persistence instead of a second implementation drifting
 * from it — the actual points/tie-break rules live in
 * `calculateCompetitionStandings()` alone and must not be re-derived here.
 */
export async function recalculateAndUpsertGroupStandings(
  tx: Prisma.TransactionClient,
  params: {
    tournamentId: string;
    configVersionId: string;
    config: CompetitionConfig;
    group: StandingsSourceGroup;
  },
  recalculatedAt: Date,
): Promise<CalculatedStanding[]> {
  const standings = calculateCompetitionStandings({
    tournamentId: params.tournamentId,
    configVersionId: params.configVersionId,
    registrationIds: params.group.groupTeams.map((team) => team.registrationId),
    fixtures: standingsFixturesFromGroup(params.group),
    config: params.config,
  });

  for (const standing of standings) {
    await tx.v1TournamentStanding.upsert({
      where: {
        groupId_registrationId: {
          groupId: params.group.id,
          registrationId: standing.registrationId,
        },
      },
      create: {
        groupId: params.group.id,
        registrationId: standing.registrationId,
        points: standing.points,
        wins: standing.wins,
        draws: standing.draws,
        losses: standing.losses,
        goalsFor: standing.goalsFor,
        goalsAgainst: standing.goalsAgainst,
        position: standing.position,
        recalculatedAt,
      },
      update: {
        points: standing.points,
        wins: standing.wins,
        draws: standing.draws,
        losses: standing.losses,
        goalsFor: standing.goalsFor,
        goalsAgainst: standing.goalsAgainst,
        position: standing.position,
        recalculatedAt,
      },
    });
  }

  return standings;
}
