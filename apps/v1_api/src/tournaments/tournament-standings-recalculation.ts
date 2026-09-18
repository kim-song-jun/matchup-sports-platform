import type { PrismaClient } from '@prisma/client';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import {
  fairPlayByRegistrationFromGroups,
  recalculateAndUpsertGroupStandings,
} from './tournament-group-standings';
import { recalculateAndUpsertOverallStandings } from './tournament-overall-standings';
import { loadCanonicalStandingsSource } from './tournament-standings-source';

export type TournamentStandingsRecalculationQuarantineReason = 'CONFIG_INVALID' | 'CANONICAL_SOURCE_INVALID';
export type TournamentStandingsRecalculationQuarantine = { tournamentId: string; reason: TournamentStandingsRecalculationQuarantineReason; detail: string };
export type TournamentStandingsRecalculationResult = {
  counts: { tournamentsScanned: number; tournamentsRecalculated: number; groupsRecalculated: number; quarantined: number };
  quarantine: TournamentStandingsRecalculationQuarantine[];
};

/** Recalculates canonical tournament group and overall standings in source-lock order. */
export async function runTournamentStandingsRecalculation(
  prisma: PrismaClient,
): Promise<TournamentStandingsRecalculationResult> {
  const rows = await prisma.v1TournamentGroup.findMany({
    where: {
      phase: 'group',
      tournament: {
        deletedAt: null,
        OR: [{ kind: 'regular_tournament' }, { kind: null }],
      },
    },
    select: { tournamentId: true },
    distinct: ['tournamentId'],
  });
  const tournamentIds = rows.map((row) => row.tournamentId);
  const quarantine: TournamentStandingsRecalculationQuarantine[] = [];
  let tournamentsRecalculated = 0;
  let groupsRecalculated = 0;

  for (const tournamentId of tournamentIds) {
    try {
      const recalculated = await prisma.$transaction(async (tx) => {
        const source = await loadCanonicalStandingsSource(tx, tournamentId);
        if (source === null) return null;
        const fairPlayByRegistration = fairPlayByRegistrationFromGroups(source.groups);
        for (const group of source.groups) {
          await recalculateAndUpsertGroupStandings(tx, {
            tournamentId,
            configVersionId: source.configVersionId,
            config: source.config,
            group,
            fairPlayByRegistration,
          }, source.recalculatedAt);
        }
        await recalculateAndUpsertOverallStandings(tx, {
          tournamentId,
          configVersionId: source.configVersionId,
          config: source.config,
          groups: source.groups,
          fairPlayByRegistration,
        }, source.recalculatedAt);
        return source.groups.length;
      });
      if (recalculated === null) continue;
      tournamentsRecalculated += 1;
      groupsRecalculated += recalculated;
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        quarantine.push({ tournamentId, reason: 'CONFIG_INVALID', detail: exceptionDetail(error) });
        continue;
      }
      if (error instanceof ConflictException) {
        const code = exceptionCode(error);
        if (code === 'COMPETITION_CONFIG_REQUIRED') {
          quarantine.push({ tournamentId, reason: 'CONFIG_INVALID', detail: exceptionDetail(error) });
          continue;
        }
        if (code === 'CANONICAL_MATCH_REQUIRED' || code === 'TOURNAMENT_MATCH_GAME_MISSING') {
          quarantine.push({ tournamentId, reason: 'CANONICAL_SOURCE_INVALID', detail: exceptionDetail(error) });
          continue;
        }
        // Concurrency conflicts and unknown HTTP failures must reach the caller;
        // quarantining them would falsely report a successful batch pass.
        throw error;
      }
      throw error;
    }
  }
  return {
    counts: { tournamentsScanned: tournamentIds.length, tournamentsRecalculated, groupsRecalculated, quarantined: quarantine.length },
    quarantine,
  };
}

function exceptionCode(error: ConflictException | UnprocessableEntityException): string | undefined {
  const response = error.getResponse();
  return typeof response === 'object' && response !== null && 'code' in response && typeof response.code === 'string'
    ? response.code
    : undefined;
}

function exceptionDetail(error: ConflictException | UnprocessableEntityException): string {
  const response = error.getResponse();
  if (typeof response === 'string') return response;
  if (typeof response === 'object' && response !== null && 'message' in response) {
    return Array.isArray(response.message) ? response.message.join(', ') : String(response.message);
  }
  return error.message;
}
