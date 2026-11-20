import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { StagePlanDto } from './stage-plan.dto';
import { loadGroupRankSources } from '../slots/load-group-rank-preview';
import { drawnTieGroups, resolveStoredGroupRank } from '../slots/group-rank-preview';
import { resolveTournamentFixtureOfficialScore } from '../tournament-fixture-official-result';
import { wildcardRankCandidates } from './stage-wildcard';
import { crossGroupTopThree } from '../multi-finals/multi-finals-seeding';
import { stageSixTeamView, type StageSixSelection } from './stage-six-team';

export type StagePeriodOverride = { competitionConfigVersionId: string; periods: Array<{ code: string; label: string; durationMinutes: number; extraTime: boolean }> };
export type RemovedStageFixture = { poolKey: string; groupId: string; round: string; fixtureNumber: number; legNumber: number; homeSlotId: string | null; awaySlotId: string | null; homeRegistrationId: string | null; awayRegistrationId: string | null; reason: string; replacementId?: string; edges: Array<{ sourceTeamMatchId: string; targetTeamMatchId: string; sourceOutcome: 'WINNER' | 'LOSER'; targetSide: 'HOME' | 'AWAY' }> };
export type StoredStagePlan = StagePlanDto & {
  sixTeamSelections?: Record<string, StageSixSelection>;
  removedFixtures?: Record<string, RemovedStageFixture>;
  periodSettings?: { stages?: Record<string, StagePeriodOverride>; pools?: Record<string, StagePeriodOverride> };
  automation?: { configuredByUserId: string };
  assignments?: Record<string, { sourceVersion: string; registrationIds: Array<string | null>; reason: string; at: string; draft?: boolean; overrideCandidates?: boolean }>;
};
export const stageHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function stagePlanDefinition(plan: StoredStagePlan | null | undefined): StagePlanDto | null {
  return plan ? { version: plan.version, stages: plan.stages, ...(plan.autoAdvance !== undefined ? { autoAdvance: plan.autoAdvance } : {}) } : null;
}
export async function loadStageView(tx: Prisma.TransactionClient, tournamentId: string, config: StoredStagePlan) {
  const groups = await tx.v1TournamentGroup.findMany({ where: { tournamentId, stageKey: { not: null } }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  const slots = await tx.v1TournamentSlot.findMany({ where: { tournamentId, entryScope: { startsWith: 'stage:' } }, orderBy: [{ position: 'asc' }, { id: 'asc' }], include: { group: { select: { poolKey: true } } } });
  const fixtures = await tx.v1TournamentMatchDetails.findMany({ where: { tournamentId, group: { stageKey: { not: null } }, teamMatch: { deletedAt: null } }, orderBy: { teamMatchId: 'asc' }, include: {
    group: { select: { poolKey: true, phase: true } }, teamMatch: { select: { status: true, game: { select: { state: true, currentOfficialRevisionId: true, currentOfficialRevision: { select: { state: true, score: true } }, _count: { select: { events: true } } } } } },
  } });
  const registrations = await tx.v1TournamentRegistration.findMany({ where: { tournamentId, status: 'confirmed' }, select: { id: true, team: { select: { name: true } } }, orderBy: { id: 'asc' } });
  const confirmed = new Set(registrations.map(r => r.id));
  const sources = await loadGroupRankSources(tx, tournamentId, groups.filter(g => g.phase === 'group').map(g => g.id));
  const standings = await tx.v1TournamentStanding.findMany({ where: { groupId: { in: groups.map(g => g.id) } }, orderBy: [{ position: 'asc' }, { registrationId: 'asc' }] });
  const result = new Map<string, { fingerprint: string; complete: boolean; ranks: string[][]; stale: boolean }>();
  const pools = config.stages.flatMap((stage, stageIndex) => stage.pools.map(pool => {
    const ownSlots = slots.filter(s => s.group?.poolKey === pool.key);
    const own = fixtures.filter(f => f.group?.poolKey === pool.key);
    const members = ownSlots.map(s => s.registrationId);
    let candidates = pool.sources.map(source => {
      if (source.comparisonPoolKeys) {
        const origins = source.comparisonPoolKeys.map(key => result.get(key));
        if (origins.some(origin => !origin?.complete || origin.stale)) return [];
        const eligible = origins.map(origin => origin!.ranks[source.rank - 1] ?? []);
        // An unresolved source-group tie must be decided before comparing its representative.
        if (eligible.some(ids => ids.length !== 1)) return [];
        const rows = eligible.map(ids => standings.find(row => row.registrationId === ids[0] && groups.some(group => group.id === row.groupId && source.comparisonPoolKeys!.includes(group.poolKey!))));
        if (rows.some(row => !row)) return [];
        return wildcardRankCandidates(rows.filter((row): row is NonNullable<typeof row> => Boolean(row)), source.comparisonPosition!);
      }
      const upstream = result.get(source.poolKey);
      return upstream?.complete && !upstream.stale ? upstream.ranks[source.rank - 1] ?? [] : [];
    });
    if (pool.seeding === 'cross_group_top_three') {
      const keys = [...new Set(pool.sources.map(source => source.poolKey))];
      const ready = keys.every(key => result.get(key)?.complete && !result.get(key)?.stale && result.get(key)!.ranks.slice(0, 3).length === 3 && result.get(key)!.ranks.slice(0, 3).every(ids => ids.length === 1));
      candidates = ready ? crossGroupTopThree(keys.map(key => ({ id: key, ranks: result.get(key)!.ranks.slice(0, 3).map(ids => ids[0]) })), () => 0).map(id => [id]) : Array.from({ length: pool.capacity }, () => []);
    }
    const sourceVersion = pool.seeding === 'cross_group_top_three' || pool.sources.some(source => source.comparisonPoolKeys)
      ? stageHash({ seeding: pool.seeding ?? 'fixed', sources: pool.sources.map(source => [source, (source.comparisonPoolKeys ?? [source.poolKey]).map(key => result.get(key)?.fingerprint)]) })
      : stageHash(pool.sources.map(source => [source.poolKey, source.rank, result.get(source.poolKey)?.fingerprint]));
    const saved = config.assignments?.[pool.key];
    const assigned = !saved?.draft && ownSlots.length === pool.capacity && members.every(id => id !== null && confirmed.has(id));
    const stale = Boolean(saved && !saved.draft && (saved.sourceVersion !== sourceVersion || !assigned || members.some((id, i) => saved.registrationIds[i] !== id)));
    const expectedFixtures = pool.format === 'league' ? pool.capacity * (pool.capacity - 1) / 2 * pool.legs : pool.capacity - 1 + (pool.thirdPlace ? 1 : 0);
    const sixRows = pool.sixTeamFinalBye ? [...own.filter(f => f.group?.phase === 'quarter').sort((a, b) => a.fixtureNumber - b.fixtureNumber), ...own.filter(f => f.group?.phase === 'semi'), ...own.filter(f => f.group?.phase === 'final')] : [];
    const sixTeam = pool.sixTeamFinalBye && sixRows.length === 5 ? stageSixTeamView(sixRows.map(f => ({ id: f.teamMatchId, homeRegistrationId: f.homeRegistrationId, awayRegistrationId: f.awayRegistrationId, revisionId: f.teamMatch.game?.currentOfficialRevision?.state === 'OFFICIAL' ? f.teamMatch.game.currentOfficialRevisionId : null, score: f.teamMatch.game?.currentOfficialRevision?.state === 'OFFICIAL' ? f.teamMatch.game.currentOfficialRevision.score : null })), config.sixTeamSelections?.[pool.key], pool.sixTeamDirectFinalOrder) : undefined;
    const complete = assigned && !stale && !sixTeam?.needsReview && (!pool.sixTeamFinalBye || sixTeam?.finalReady === true) && own.length === expectedFixtures && own.every(f => f.teamMatch.status === 'completed' && resolveTournamentFixtureOfficialScore(f.teamMatch.game) !== null);
    let ranks: string[][] = [];
    if (pool.format === 'league') {
      const group = groups.find(g => g.poolKey === pool.key && g.phase === 'group');
      const source = group ? sources.get(group.id) : undefined;
      ranks = Array.from({ length: pool.capacity }, (_, i) => {
        if (!complete || !source) return [];
        const rank = resolveStoredGroupRank(source, i + 1, drawnTieGroups(source));
        return rank.state === 'ready' ? [rank.registrationId] : rank.state === 'tied' ? rank.tiedRegistrationIds : [];
      });
    } else if (complete) {
      const final = own.find(f => f.group?.phase === 'final');
      const score = final ? resolveTournamentFixtureOfficialScore(final.teamMatch.game) : null;
      if (final && score && final.homeRegistrationId && final.awayRegistrationId) {
        const home = score.homeScore === score.awayScore ? (score.homePenaltyScore ?? 0) > (score.awayPenaltyScore ?? 0) : score.homeScore > score.awayScore;
        const decisive = score.homeScore !== score.awayScore || score.hasPenalty && score.homePenaltyScore !== score.awayPenaltyScore;
        if (decisive) ranks = home ? [[final.homeRegistrationId], [final.awayRegistrationId]] : [[final.awayRegistrationId], [final.homeRegistrationId]];
      }
      if (pool.thirdPlace) {
        const third = own.find(f => f.group?.phase === 'third_place');
        const thirdScore = third ? resolveTournamentFixtureOfficialScore(third.teamMatch.game) : null;
        if (third && thirdScore && third.homeRegistrationId && third.awayRegistrationId) {
          const decisive = thirdScore.homeScore !== thirdScore.awayScore || thirdScore.hasPenalty && thirdScore.homePenaltyScore !== thirdScore.awayPenaltyScore;
          const home = thirdScore.homeScore === thirdScore.awayScore ? (thirdScore.homePenaltyScore ?? 0) > (thirdScore.awayPenaltyScore ?? 0) : thirdScore.homeScore > thirdScore.awayScore;
          if (decisive) ranks.push(...(home ? [[third.homeRegistrationId], [third.awayRegistrationId]] : [[third.awayRegistrationId], [third.homeRegistrationId]]));
        }
      }
    }
    const fingerprint = stageHash({ sourceVersion, members, fixtures: own.map(f => [f.teamMatchId, f.homeRegistrationId, f.awayRegistrationId, f.teamMatch.status, f.teamMatch.game?.currentOfficialRevisionId]) });
    result.set(pool.key, { fingerprint, complete, ranks, stale });
    return { ...pool, sixTeam, stageKey: stage.key, stageName: stage.name, stageIndex, generated: own.length > 0 || ownSlots.length > 0 || groups.some(group => group.poolKey === pool.key),
      removedFixtures: Object.entries(config.removedFixtures ?? {}).filter(([, fixture]) => fixture.poolKey === pool.key && !fixture.replacementId).map(([id, fixture]) => ({ id, round: fixture.round, fixtureNumber: fixture.fixtureNumber })),
      slots: ownSlots.map(s => ({ id: s.id, position: s.position, registrationId: s.registrationId })), registrationIds: members,
      candidates, sourceVersion, stale, assigned, complete, ranks: complete ? ranks : [],
      started: own.some(f => f.teamMatch.status !== 'matched' || f.teamMatch.game?.state !== 'SCHEDULED' || f.teamMatch.game.currentOfficialRevisionId !== null || (f.teamMatch.game?._count.events ?? 0) > 0),
      standings: standings.filter(s => groups.some(g => g.id === s.groupId && g.poolKey === pool.key)),
      fixtureIds: own.map(f => f.teamMatchId),
    };
  }));
  return { config: stagePlanDefinition(config), pools, registrations };
}
