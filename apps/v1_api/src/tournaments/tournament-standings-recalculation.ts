import type { PrismaClient } from '@prisma/client';
import { UnprocessableEntityException } from '@nestjs/common';
import { validateCompetitionConfig } from './competition-config/competition-config';
import { recalculateAndUpsertGroupStandings } from './tournament-group-standings';

/**
 * Batch counterpart of `TournamentBracketService.recalculateStandings()`
 * (the admin single-tournament route). Both share the exact same
 * calculation + persistence path
 * (`recalculateAndUpsertGroupStandings()`/`calculateCompetitionStandings()`)
 * so a group's standings never depend on which caller triggered the
 * recalculation. See `tournament-standings-recalculation.cli.ts` for the
 * deploy-pipeline entry point that runs this against every tournament.
 *
 * Written to remove a real bug: `seed-alpha-tournament-qa.ts` used to write
 * `V1TournamentStanding` rows directly from array-index arithmetic instead
 * of actual fixture results, so alpha's public group standings could show a
 * team that won 2:0 as having lost. The seed no longer writes standings at
 * all — this recalculation (run right after `fixture-game-backfill` in the
 * deploy pipeline) is what fills them in from real results instead.
 */
export type TournamentStandingsRecalculationQuarantineReason = 'CONFIG_INVALID';

export type TournamentStandingsRecalculationQuarantine = {
  tournamentId: string;
  reason: TournamentStandingsRecalculationQuarantineReason;
  detail: string;
};

export type TournamentStandingsRecalculationResult = {
  counts: {
    tournamentsScanned: number;
    tournamentsRecalculated: number;
    groupsRecalculated: number;
    quarantined: number;
  };
  quarantine: TournamentStandingsRecalculationQuarantine[];
};

export async function runTournamentStandingsRecalculation(
  prisma: PrismaClient,
): Promise<TournamentStandingsRecalculationResult> {
  const now = new Date();

  // Every deletedAt-null tournament with at least one group-phase group —
  // not just the QA seed's hardcoded tournament ids. alpha-sanitize.sql
  // runs before every deploy specifically because alpha's DB also carries
  // real tester-created tournaments alongside the QA seed scenarios; a
  // hardcoded id list would silently leave those out of recalculation
  // forever.
  const rows = await prisma.v1TournamentGroup.findMany({
    where: { phase: 'group', tournament: { deletedAt: null } },
    select: { tournamentId: true },
    distinct: ['tournamentId'],
  });
  const tournamentIds = rows.map((row) => row.tournamentId);

  const quarantine: TournamentStandingsRecalculationQuarantine[] = [];
  let tournamentsRecalculated = 0;
  let groupsRecalculated = 0;

  for (const tournamentId of tournamentIds) {
    const tournament = await prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
      include: { competitionConfig: true },
    });
    if (!tournament) continue;

    let config;
    try {
      config = validateCompetitionConfig(tournament.competitionConfig);
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        const response = error.getResponse() as { message?: string } | string;
        const detail =
          typeof response === 'string' ? response : (response.message ?? error.message);
        quarantine.push({ tournamentId, reason: 'CONFIG_INVALID', detail });
        continue;
      }
      throw error;
    }

    // Narrowed into a local binding rather than relying on
    // tournament.competitionConfigVersionId directly, since TypeScript does
    // not carry a property-access narrowing into the $transaction callback
    // closure below — same reason
    // TournamentBracketService.recalculateStandings() does this.
    if (!tournament.competitionConfigVersionId) continue;
    const configVersionId = tournament.competitionConfigVersionId;

    const groups = await prisma.v1TournamentGroup.findMany({
      where: { tournamentId, phase: 'group' },
      include: {
        groupTeams: {
          orderBy: { registrationId: 'asc' },
        },
        fixtures: {
          where: { status: 'completed' },
          include: {
            game: { select: { currentOfficialRevision: { select: { state: true, score: true } } } },
            // R3 §4-3단계 한시적 레거시 폴백 입력 — standingsFixturesFromGroup()이 새 경로에
            // OFFICIAL 리비전이 없는 픽스처(game 백필 전)만 이 스코어로 대체한다. §4-4단계에서 제거.
            result: {
              select: {
                homeScore: true,
                awayScore: true,
                hasPenalty: true,
                homePenaltyScore: true,
                awayPenaltyScore: true,
              },
            },
          },
        },
      },
    });

    await prisma.$transaction(async (tx) => {
      for (const group of groups) {
        // Calculation + upsert extracted to tournament-group-standings.ts —
        // shared verbatim with the admin route and the automatic per-result
        // trigger (GameResultStandingsProjectionService).
        await recalculateAndUpsertGroupStandings(
          tx,
          { tournamentId, configVersionId, config, group },
          now,
        );
      }
    });

    tournamentsRecalculated += 1;
    groupsRecalculated += groups.length;
  }

  return {
    counts: {
      tournamentsScanned: tournamentIds.length,
      tournamentsRecalculated,
      groupsRecalculated,
      quarantined: quarantine.length,
    },
    quarantine,
  };
}
