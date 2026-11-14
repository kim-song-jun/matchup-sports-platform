import { Prisma, PrismaClient } from '@prisma/client';
import { loadCanonicalStandingsSource } from '../tournament-standings-source';
import { fairPlayByRegistrationFromGroups, recalculateAndUpsertGroupStandings, standingsFixturesFromGroup } from '../tournament-group-standings';
import { recalculateAndUpsertOverallStandings } from '../tournament-overall-standings';
import { resolveTieBreakOrder, sameTieBreakOrder, withTournamentTieBreakOrder } from '../competition-config/tournament-tie-break-order';
import { TOURNAMENT_TIE_BREAK_PRESETS } from '../competition-config/tournament-tie-break-presets';
import { lockTournamentForConfigChange } from '../competition-config/tournament-competition-config';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from '../tournament-surface-lookup';

export const QUEENS_CUP_ID = '178e0e13-2f1f-4e29-a21f-90f756fe1891';
export const QUEENS_CUP_REPAIR_ID = 'queens-cup-ranking-20261114';
const originalOrder = [...TOURNAMENT_TIE_BREAK_PRESETS[0].order];
export const QUEENS_CUP_ORDER = [...TOURNAMENT_TIE_BREAK_PRESETS[1].order];

/** User-authorized correction of this event's published rules, not a change to platform defaults.
 * The audit receipt makes this one-shot: later operator changes are never overwritten on redeploy.
 * Settings, group/overall ranks and receipt commit atomically. Fixtures and official scores are untouched.
 */
export async function repairQueensCupRanking(prisma: PrismaClient) {
  return prisma.$transaction(async (tx) => {
    await lockTournamentForConfigChange(tx, QUEENS_CUP_ID);
    const event = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, {
      where: { id: QUEENS_CUP_ID, deletedAt: null },
      select: { title: true, kind: true, format: true, tieBreakOrder: true },
    });
    if (event === null) return { status: 'absent' as const };
    const receipt = await tx.v1OperationAudit.findFirst({
      where: { tournamentId: QUEENS_CUP_ID, requestId: QUEENS_CUP_REPAIR_ID, action: 'TOURNAMENT_RANKING_RULE_REPAIRED' },
      select: { id: true },
    });
    if (receipt !== null) return { status: 'already_repaired' as const };
    if (event.title !== 'The QUEENS CUP(퀸즈컵)' || event.kind !== 'regular_tournament' || event.format !== 'league_knockouts') {
      throw new Error('QUEENS_CUP_REPAIR_IDENTITY_MISMATCH');
    }
    const previousOrder = resolveTieBreakOrder(event.tieBreakOrder);
    if (!sameTieBreakOrder(previousOrder, originalOrder) && !sameTieBreakOrder(previousOrder, QUEENS_CUP_ORDER)) {
      throw new Error('QUEENS_CUP_REPAIR_UNEXPECTED_ORDER');
    }
    const overrides = await tx.v1TournamentStageTieBreakSetting.count({ where: { tournamentId: QUEENS_CUP_ID } });
    if (overrides !== 0) throw new Error('QUEENS_CUP_REPAIR_STAGE_OVERRIDE');
    const source = await loadCanonicalStandingsSource(tx, QUEENS_CUP_ID);
    if (source === null || source.groups.length !== 4 || source.groups.some((group) => group.groupTeams.length !== 6 || group.fixtures.length !== 15)) {
      throw new Error('QUEENS_CUP_REPAIR_INCOMPLETE_GROUPS');
    }
    // A completed match without a canonical official score must fail, not silently reduce the table.
    if (source.groups.some((group) => standingsFixturesFromGroup(group).length !== 15)) {
      throw new Error('QUEENS_CUP_REPAIR_UNOFFICIAL_RESULT');
    }
    await tx.v1Tournament.update({ where: { id: QUEENS_CUP_ID }, data: { tieBreakOrder: QUEENS_CUP_ORDER } });
    const config = withTournamentTieBreakOrder(source.config, QUEENS_CUP_ORDER);
    const fairPlayByRegistration = fairPlayByRegistrationFromGroups(source.groups);
    for (const group of source.groups) {
      await recalculateAndUpsertGroupStandings(tx, {
        tournamentId: QUEENS_CUP_ID, configVersionId: source.configVersionId, config, group, fairPlayByRegistration,
      }, source.recalculatedAt);
    }
    await recalculateAndUpsertOverallStandings(tx, {
      tournamentId: QUEENS_CUP_ID, configVersionId: source.configVersionId, config, groups: source.groups, fairPlayByRegistration,
    }, source.recalculatedAt);
    await tx.v1OperationAudit.create({ data: {
      actorType: 'SYSTEM', systemActor: QUEENS_CUP_REPAIR_ID,
      action: 'TOURNAMENT_RANKING_RULE_REPAIRED', resourceType: 'tournament', resourceId: QUEENS_CUP_ID,
      tournamentId: QUEENS_CUP_ID, requestId: QUEENS_CUP_REPAIR_ID,
      before: { tieBreakOrder: previousOrder }, after: { tieBreakOrder: QUEENS_CUP_ORDER },
      reason: '2026-11-14 user authorization: align Queens Cup preliminary standings with published goal difference, goals for, head-to-head order. Preserve knockout assignments and official results.',
    } });
    return { status: 'repaired' as const, groups: source.groups.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
}
