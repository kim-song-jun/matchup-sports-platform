import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { StagePlanDto } from './stage-plan.dto';
import { loadGroupRankSources } from '../slots/load-group-rank-preview';
import { drawnTieGroups, resolveStoredGroupRank } from '../slots/group-rank-preview';
import { resolveTournamentFixtureOfficialScore } from '../tournament-fixture-official-result';

export type StoredStagePlan = StagePlanDto & { assignments?: Record<string, { sourceVersion: string; registrationIds: string[]; reason: string; at: string }> };
export const stageHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function stagePlanDefinition(plan: StoredStagePlan | null | undefined): StagePlanDto | null {
  return plan ? { version: plan.version, stages: plan.stages } : null;
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
    const candidates = pool.sources.map(source => {
      const upstream = result.get(source.poolKey);
      return upstream?.complete && !upstream.stale ? upstream.ranks[source.rank - 1] ?? [] : [];
    });
    const sourceVersion = stageHash(pool.sources.map(source => [source.poolKey, source.rank, result.get(source.poolKey)?.fingerprint]));
    const saved = config.assignments?.[pool.key];
    const assigned = ownSlots.length === pool.capacity && members.every(id => id !== null && confirmed.has(id));
    const stale = Boolean(saved && (saved.sourceVersion !== sourceVersion || !assigned || members.some((id, i) => saved.registrationIds[i] !== id)));
    const expectedFixtures = pool.format === 'league' ? pool.capacity * (pool.capacity - 1) / 2 * pool.legs : pool.capacity - 1;
    const complete = assigned && !stale && own.length === expectedFixtures && own.every(f => f.teamMatch.status === 'completed' && resolveTournamentFixtureOfficialScore(f.teamMatch.game) !== null);
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
    }
    const fingerprint = stageHash({ sourceVersion, members, fixtures: own.map(f => [f.teamMatchId, f.homeRegistrationId, f.awayRegistrationId, f.teamMatch.status, f.teamMatch.game?.currentOfficialRevisionId]) });
    result.set(pool.key, { fingerprint, complete, ranks, stale });
    return { ...pool, stageKey: stage.key, stageName: stage.name, stageIndex, generated: own.length > 0,
      slots: ownSlots.map(s => ({ id: s.id, position: s.position, registrationId: s.registrationId })), registrationIds: members,
      candidates, sourceVersion, stale, assigned, complete,
      started: own.some(f => f.teamMatch.status !== 'matched' || f.teamMatch.game?.state !== 'SCHEDULED' || f.teamMatch.game.currentOfficialRevisionId !== null || (f.teamMatch.game?._count.events ?? 0) > 0),
      standings: standings.filter(s => groups.some(g => g.id === s.groupId && g.poolKey === pool.key)),
      fixtureIds: own.map(f => f.teamMatchId),
    };
  }));
  return { config: stagePlanDefinition(config), pools, registrations };
}
