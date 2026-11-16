import type { Prisma } from '@prisma/client';
import { calculateCompetitionStandings, type CompetitionConfig, type CalculatedStanding } from '../competition-config/competition-config';
import { fairPlayByRegistrationFromGroups, standingsFixturesFromGroup, type StandingsSourceGroup } from '../tournament-group-standings';
import { loadStageView, type StoredStagePlan } from './stage-view';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from '../tournament-surface-lookup';

/** Explicit final-pool rank ranges; points from unrelated pools are never compared. */
export async function recalculateStageOverallStandingsInTx(tx: Prisma.TransactionClient, tournamentId: string, config: CompetitionConfig, at: Date, suppliedPlan?: StoredStagePlan): Promise<CalculatedStanding[]> {
  const tournament = suppliedPlan ? null : await findTournamentOnSurface(tx, TOURNAMENT_KINDS, { where: { id: tournamentId, deletedAt: null }, select: { stagePlan: true } });
  const plan = suppliedPlan ?? tournament?.stagePlan as unknown as StoredStagePlan | null;
  if (!plan) return [];
  const mapped = plan.stages.at(-1)?.pools.filter(p => p.overallRankStart !== undefined) ?? [];
  if (!mapped.length) {
    await tx.v1TournamentOverallStanding.deleteMany({ where: { tournamentId } });
    return [];
  }
  const view = await loadStageView(tx, tournamentId, plan);
  const details = await tx.v1TournamentMatchDetails.findMany({ where: { tournamentId, group: { poolKey: { in: mapped.map(p => p.key) } }, teamMatch: { deletedAt: null } }, select: {
    homeRegistrationId: true, awayRegistrationId: true, group: { select: { poolKey: true } },
    teamMatch: { select: { game: { select: { currentOfficialRevision: { select: { state: true, score: true, resultParticipants: { select: { sideId: true, cards: true } } } }, sides: { select: { id: true, sideKey: true } } } } } },
  } });
  const standings: CalculatedStanding[] = [];
  for (const mapping of mapped) {
    const pool = view.pools.find(p => p.key === mapping.key);
    if (!pool?.complete || pool.stale || !pool.ranks.length || pool.ranks.some(r => r.length === 0)) continue;
    const ids = pool.registrationIds.filter((id): id is string => id !== null);
    const group: StandingsSourceGroup = { id: pool.key, groupTeams: ids.map(registrationId => ({ registrationId })), fixtures: details.filter(d => d.group?.poolKey === pool.key).map(d => ({ homeRegistrationId: d.homeRegistrationId, awayRegistrationId: d.awayRegistrationId, game: d.teamMatch.game })) };
    const metrics = calculateCompetitionStandings({ tournamentId, configVersionId: '', config, registrationIds: ids, fixtures: standingsFixturesFromGroup(group), fairPlayByRegistration: fairPlayByRegistrationFromGroups([group]) });
    const positions = new Map<string, number>();
    pool.ranks.forEach((ids, index) => ids.forEach(id => { if (!positions.has(id)) positions.set(id, mapping.overallRankStart! + index); }));
    for (const row of metrics) if (positions.has(row.registrationId)) standings.push({ ...row, position: positions.get(row.registrationId)! });
  }
  await tx.v1TournamentOverallStanding.deleteMany({ where: { tournamentId, ...(standings.length ? { registrationId: { notIn: standings.map(s => s.registrationId) } } : {}) } });
  for (const row of standings) {
    const { registrationId, ...metrics } = row;
    const values = { points: metrics.points, wins: metrics.wins, draws: metrics.draws, losses: metrics.losses, goalsFor: metrics.goalsFor, goalsAgainst: metrics.goalsAgainst, fairPlayPoints: metrics.fairPlayPoints, position: metrics.position, recalculatedAt: at };
    await tx.v1TournamentOverallStanding.upsert({ where: { tournamentId_registrationId: { tournamentId, registrationId } }, create: { tournamentId, registrationId, ...values }, update: values });
  }
  return standings.sort((a, b) => a.position - b.position);
}
