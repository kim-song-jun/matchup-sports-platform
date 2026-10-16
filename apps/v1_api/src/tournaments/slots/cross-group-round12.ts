import { createHash } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import type { AdminContextService } from '../../common/admin-context.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { GamesService } from '../../games/games.service';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from '../tournament-surface-lookup';
import { loadCanonicalStandingsSource } from '../tournament-standings-source';
import { loadGroupRankSources } from './load-group-rank-preview';
import { resolveGroupRank } from './group-rank-preview';
import { assignSlotsBatchInTx } from './tournament-slot.service';
import { validateCrossGroupSelection, type CrossGroupPreview, type CrossGroupSelection, type CrossGroupTarget } from './cross-group-round12-plan';

type Tx = Prisma.TransactionClient;
function conflict(message: string): never {
  throw new ConflictException({ code: 'ROUND12_NOT_READY', message });
}

async function loadPreview(tx: Tx, tournamentId: string): Promise<CrossGroupPreview> {
  const tournament = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, {
    where: { id: tournamentId, deletedAt: null }, select: { id: true, format: true },
  });
  if (tournament === null) throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
  if (tournament.format !== 'group_knockout') conflict('조별리그 후 결선 방식의 대회에서만 사용할 수 있어요.');
  const groups = await tx.v1TournamentGroup.findMany({ where: { tournamentId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  const sourceGroups = groups.filter((group) => group.phase === 'group');
  const round12 = groups.filter((group) => group.phase === 'round12');
  const quarters = groups.filter((group) => group.phase === 'quarter');
  if (sourceGroups.length !== 5 || round12.length !== 1 || quarters.length !== 1) conflict('5개 조와 12강·8강 대진을 먼저 만들어 주세요.');
  const sources = await loadGroupRankSources(tx, tournamentId, sourceGroups.map((group) => group.id));
  const standings = await tx.v1TournamentStanding.findMany({
    where: { groupId: { in: sourceGroups.map((group) => group.id) } }, orderBy: [{ groupId: 'asc' }, { registrationId: 'asc' }],
  });
  const teams: CrossGroupPreview['teams'] = [];
  const ranks: CrossGroupPreview['ranks'] = [];
  for (const group of sourceGroups) {
    const source = sources.get(group.id)!;
    if (source.registrationIds.length !== 4 || source.fixtures.length !== 6) conflict(`${group.name}은 4팀·6경기로 편성해 주세요.`);
    const pairs = new Set(source.fixtures.map((fixture) => [fixture.homeRegistrationId, fixture.awayRegistrationId].sort().join(':')));
    if (pairs.size !== 6 || source.registrationIds.some((id) =>
      source.fixtures.filter((fixture) => fixture.homeRegistrationId === id || fixture.awayRegistrationId === id).length !== 3)) {
      conflict(`${group.name}의 모든 팀이 서로 한 번씩 경기해야 해요.`);
    }
    for (let rank = 1; rank <= 3; rank += 1) {
      const resolution = resolveGroupRank(source, rank);
      if (resolution.state === 'group_incomplete') conflict(`${group.name}의 공식 결과를 모두 확정하고 순위를 재계산해 주세요.`);
      ranks.push({ groupId: group.id, groupName: group.name, rank,
        candidates: resolution.state === 'ready' ? [resolution.registrationId] : [...resolution.tiedRegistrationIds].sort() });
    }
    for (const id of [...source.registrationIds].sort()) {
      const row = standings.find((standing) => standing.groupId === group.id && standing.registrationId === id);
      if (row === undefined || row.wins + row.draws + row.losses !== 3) conflict('모든 팀의 3경기 결과가 순위에 반영되어야 해요.');
      teams.push({ registrationId: id, teamName: source.teamNameById.get(id) ?? '이름 없는 팀', groupId: group.id,
        groupName: group.name, points: row.points, goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst });
    }
  }
  const registrations = await tx.v1TournamentRegistration.count({ where: {
    tournamentId, status: 'confirmed', id: { in: teams.map((team) => team.registrationId) },
  } });
  if (registrations !== 20 || new Set(teams.map((team) => team.registrationId)).size !== 20) conflict('서로 다른 확정 참가팀 20팀이 필요해요.');
  const details = await tx.v1TournamentMatchDetails.findMany({
    where: { tournamentId, group: { phase: { not: 'group' } }, teamMatch: { deletedAt: null } },
    include: { teamMatch: { include: { game: { include: { resultRevisions: { select: { state: true }, orderBy: { id: 'asc' } }, _count: { select: { events: true } } } } } } },
    orderBy: [{ fixtureNumber: 'asc' }, { teamMatchId: 'asc' }],
  });
  if (details.some(({ teamMatch: match }) => match.status !== 'matched' || match.game === null ||
    match.game.state !== 'SCHEDULED' || match.game.currentOfficialRevisionId !== null || match.game._count.events > 0 ||
    match.game.resultRevisions.some((revision) => revision.state !== 'VOID'))) {
    conflict('결선에 시작했거나 결과·기록이 있는 경기가 있어 일괄 배정할 수 없어요.');
  }
  const r12Fixtures = details.filter((fixture) => fixture.groupId === round12[0].id);
  const quarterFixtures = details.filter((fixture) => fixture.groupId === quarters[0].id);
  if (r12Fixtures.length !== 4 || quarterFixtures.length !== 4) conflict('12강 4경기와 8강 4경기가 필요해요.');
  const edges = await tx.v1TournamentMatchAdvancementEdge.findMany({ where: { tournamentId }, orderBy: { id: 'asc' } });
  const slots = await tx.v1TournamentSlot.findMany({ where: { tournamentId }, orderBy: { id: 'asc' } });
  const byes = await tx.v1TournamentByeSlot.findMany({ where: { groupId: round12[0].id }, orderBy: { sortOrder: 'asc' } });
  const byeTeams = await tx.v1TournamentGroupTeam.findMany({ where: { groupId: round12[0].id, isBye: true }, orderBy: { sortOrder: 'asc' } });
  const byeOrders = [...byes, ...byeTeams].map((bye) => bye.sortOrder).sort((a, b) => a - b);
  if (byeOrders.length !== 4 || new Set(byeOrders).size !== 4) conflict('12강 부전승 4자리의 위치를 확인해 주세요.');
  const targets: CrossGroupTarget[] = [];
  const matchSeeds = [[8, 9], [5, 12], [6, 11], [7, 10]];
  const byeSeeds = [1, 4, 3, 2];
  quarterFixtures.forEach((quarter, index) => {
    const incoming = edges.filter((edge) => edge.targetTeamMatchId === quarter.teamMatchId);
    if (incoming.length !== 1 || incoming[0].sourceOutcome !== 'WINNER') conflict('각 8강 경기에는 12강 승자 연결 한 개와 부전승 자리 한 개가 필요해요.');
    const edge = incoming[0];
    const fixture = r12Fixtures.find((row) => row.teamMatchId === edge.sourceTeamMatchId);
    if (fixture === undefined || edges.some((item) => item.targetTeamMatchId === fixture.teamMatchId)) conflict('12강→8강 진출 연결을 먼저 확인해 주세요.');
    const byeSide = edge.targetSide === 'HOME' ? 'AWAY' : 'HOME';
    const add = (seed: number, row: typeof quarter, side: 'HOME' | 'AWAY', byePosition: number | null) => {
      const slotId = side === 'HOME' ? row.teamMatch.homeSlotId : row.teamMatch.awaySlotId;
      const current = side === 'HOME' ? row.homeRegistrationId : row.awayRegistrationId;
      const slot = slots.find((item) => item.id === slotId);
      if (slotId !== null && (slot === undefined || slot.tournamentId !== tournamentId || slot.groupId !== round12[0].id || slot.registrationId !== current ||
        (byePosition === null && slot.kind !== 'ENTRY' && slot.kind !== 'GROUP_RANK') ||
        (byePosition !== null && (slot.kind !== 'BYE' || slot.position !== byePosition)))) conflict('자리와 경기의 팀 연결을 먼저 확인해 주세요.');
      const byeSortOrder = slot?.byeSortOrder ?? (byePosition === null ? null : byeOrders[byePosition - 1]);
      if (byePosition !== null && (byeTeams.find((team) => team.sortOrder === byeSortOrder)?.registrationId ?? null) !== current) {
        conflict('부전승팀과 8강 직행 자리의 팀이 달라요. 두 배정을 먼저 맞춰 주세요.');
      }
      targets.push({ seed, label: byePosition !== null ? `${seed}번 시드 · 부전승 → 8강 #${row.fixtureNumber}` : `${seed}번 시드 · 12강 #${row.fixtureNumber} ${side === 'HOME' ? '홈' : '원정'}`,
        fixtureId: row.teamMatchId, side, slotId, currentRegistrationId: current, byePosition, groupId: round12[0].id });
    };
    add(byeSeeds[index], quarter, byeSide, index + 1);
    add(matchSeeds[index][0], fixture, 'HOME', null);
    add(matchSeeds[index][1], fixture, 'AWAY', null);
  });
  if (new Set(targets.map((target) => target.fixtureId + target.side)).size !== 12 ||
    new Set(edges.filter((edge) => quarterFixtures.some((quarter) => quarter.teamMatchId === edge.targetTeamMatchId)).map((edge) => edge.sourceTeamMatchId)).size !== 4) {
    conflict('12강과 8강 사이의 진출 연결이 겹쳐 있어요.');
  }
  targets.sort((a, b) => a.seed - b.seed);
  const assignedSlots = targets.flatMap((target) => target.slotId === null ? [] : [target.slotId]);
  if (new Set(assignedSlots).size !== assignedSlots.length) conflict('두 진출 자리가 같은 팀 자리를 공유하고 있어요.');
  const usages = await tx.v1TeamMatch.findMany({ where: {
    deletedAt: null, OR: [{ homeSlotId: { in: assignedSlots } }, { awaySlotId: { in: assignedSlots } }],
  }, select: { id: true, homeSlotId: true, awaySlotId: true } });
  for (const target of targets) {
    if (target.slotId !== null && usages.filter((match) => match.homeSlotId === target.slotId || match.awaySlotId === target.slotId).length !== 1) {
      conflict('결선 자리가 다른 경기에도 연결돼 있어요. 자리 연결을 먼저 확인해 주세요.');
    }
  }
  const currentTeams = targets.flatMap((target) => target.currentRegistrationId === null ? [] : [target.currentRegistrationId]);
  if (new Set(currentTeams).size !== currentTeams.length) conflict('현재 결선에 같은 팀이 중복 배정돼 있어요. 중복 배정을 먼저 해제해 주세요.');
  const version = createHash('sha256').update(JSON.stringify({ teams, ranks, targets, details, standings, edges, slots, byes, byeTeams,
  })).digest('hex');
  return { version, teams, ranks, targets };
}

type Dependencies = { prisma: PrismaService; adminContext: AdminContextService; games: GamesService };
const options = { timeout: 45_000, maxWait: 5_000 } as const;

export async function previewCrossGroupRound12(deps: Dependencies, user: V1AuthUser, tournamentId: string) {
  await deps.adminContext.getActiveAdmin(user.id);
  return deps.prisma.$transaction(async (tx) => {
    // 공식 결과와 같은 잠금 순서로 읽어 한 시점의 순위·대진을 표시한다.
    await loadCanonicalStandingsSource(tx, tournamentId);
    return loadPreview(tx, tournamentId);
  }, options);
}

export async function applyCrossGroupRound12(deps: Dependencies, user: V1AuthUser, tournamentId: string,
  input: CrossGroupSelection & { version: string; reason: string }) {
  const admin = await deps.adminContext.getMutationAdmin(user.id);
  return deps.prisma.$transaction(async (tx) => {
    await loadCanonicalStandingsSource(tx, tournamentId);
    const preview = await loadPreview(tx, tournamentId);
    if (preview.version !== input.version) throw new ConflictException({ code: 'ROUND12_PREVIEW_STALE', message: '결과나 대진이 바뀌었어요. 다시 계산하고 확인해 주세요.' });
    validateCrossGroupSelection(preview, input);
    // A manually built bracket may still use the old 1/4/5/8 positions.
    // Normalize only display order, preserving the existing opponent/side.
    const byeTargets = preview.targets.filter((target) => target.byePosition !== null);
    const byeGroupId = byeTargets[0].groupId;
    const byeRows = [...await tx.v1TournamentByeSlot.findMany({ where: { groupId: byeGroupId } }),
      ...await tx.v1TournamentGroupTeam.findMany({ where: { groupId: byeGroupId, isBye: true } })]
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const byeSlots = await tx.v1TournamentSlot.findMany({ where: { groupId: byeGroupId, kind: 'BYE' } });
    const movements = byeTargets.map((target) => ({
      oldOrder: byeSlots.find((slot) => slot.id === target.slotId)?.byeSortOrder ?? byeRows[target.byePosition! - 1].sortOrder,
      newOrder: (target.byePosition! - 1) * 2 + (target.side === 'AWAY' ? 1 : 0),
    })).filter((move) => move.oldOrder !== move.newOrder);
    for (const move of movements) {
      await tx.v1TournamentGroupTeam.updateMany({ where: { groupId: byeGroupId, isBye: true, sortOrder: move.oldOrder }, data: { sortOrder: -100 - move.newOrder } });
      await tx.v1TournamentByeSlot.updateMany({ where: { groupId: byeGroupId, sortOrder: move.oldOrder }, data: { sortOrder: -100 - move.newOrder } });
    }
    for (const move of movements) {
      await tx.v1TournamentGroupTeam.updateMany({ where: { groupId: byeGroupId, isBye: true, sortOrder: -100 - move.newOrder }, data: { sortOrder: move.newOrder } });
      await tx.v1TournamentByeSlot.updateMany({ where: { groupId: byeGroupId, sortOrder: -100 - move.newOrder }, data: { sortOrder: move.newOrder } });
    }
    const changes = [];
    for (const [index, target] of preview.targets.entries()) {
      let slotId = target.slotId;
      if (slotId === null) {
        const slot = await tx.v1TournamentSlot.create({ data: {
          tournamentId, groupId: target.groupId, kind: target.byePosition !== null ? 'BYE' : 'GROUP_RANK',
          position: target.byePosition ?? target.seed,
          byeSortOrder: target.byePosition === null ? null : (target.byePosition - 1) * 2 + (target.side === 'AWAY' ? 1 : 0),
        } });
        slotId = slot.id;
        await tx.v1TeamMatch.update({ where: { id: target.fixtureId }, data: target.side === 'HOME' ? { homeSlotId: slotId } : { awaySlotId: slotId } });
      } else if (target.byePosition === null) {
        // 수동 대진/단독 템플릿의 ENTRY도 조별 참가 자리와 분리된 결선 진출 자리로 전환한다.
        await tx.v1TournamentSlot.update({ where: { id: slotId }, data: { kind: 'GROUP_RANK', sourceGroupId: null } });
      } else {
        await tx.v1TournamentSlot.update({ where: { id: slotId }, data: { byeSortOrder: (target.byePosition - 1) * 2 + (target.side === 'AWAY' ? 1 : 0) } });
      }
      changes.push({ slotId, registrationId: input.assignments[index] });
    }
    await assignSlotsBatchInTx(tx, { admin, adminContext: deps.adminContext, games: deps.games }, changes);
    await deps.adminContext.logAdminAction(admin, { action: 'tournament.bracket.cross_group_round12',
      targetType: 'tournament', targetId: tournamentId, reason: input.reason,
      beforeJson: { assignments: preview.targets.map((target) => target.currentRegistrationId) },
      afterJson: { rankPicks: input.rankPicks, rankingOrder: input.rankingOrder, assignments: input.assignments, version: input.version },
    }, tx);
    return { assignments: changes };
  }, options);
}
