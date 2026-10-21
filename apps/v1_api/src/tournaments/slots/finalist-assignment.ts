import { createHash } from 'node:crypto';
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import type { AdminContextService } from '../../common/admin-context.service';
import type { GamesService } from '../../games/games.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from '../tournament-surface-lookup';
import { loadCanonicalStandingsSource } from '../tournament-standings-source';
import { resolveGroupRank } from './group-rank-preview';
import { loadGroupRankSources } from './load-group-rank-preview';
import { assignSlotsBatchInTx } from './tournament-slot.service';
import type { FinalistAssignmentDto } from './dto/finalist-assignment.dto';

type Dependencies = { prisma: PrismaService; adminContext: AdminContextService; games: GamesService };
type Target = { fixtureId: string; side: 'HOME' | 'AWAY'; label: string; groupId: string | null; slotId: string | null; currentRegistrationId: string | null; byeSortOrder: number | null; byePosition: number | null };
const options = { timeout: 45_000, maxWait: 5_000 } as const;
const notReady = (message: string) => new ConflictException({ code: 'FINALIST_NOT_READY', message });

export async function loadFinalistPreview(tx: Prisma.TransactionClient, tournamentId: string) {
  const tournament = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, {
    where: { id: tournamentId, deletedAt: null }, select: { id: true, format: true, status: true },
  });
  if (tournament === null) throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
  if (tournament.format !== 'group_knockout') throw notReady('조별리그 후 결선 방식에서만 배정할 수 있어요.');
  const groups = await tx.v1TournamentGroup.findMany({ where: { tournamentId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  const sourceGroups = groups.filter((group) => group.phase === 'group');
  const sources = await loadGroupRankSources(tx, tournamentId, sourceGroups.map((group) => group.id));
  const standings = await tx.v1TournamentStanding.findMany({ where: { groupId: { in: sourceGroups.map((group) => group.id) } }, orderBy: [{ groupId: 'asc' }, { registrationId: 'asc' }] });
  const registrations = await tx.v1TournamentRegistration.findMany({ where: { tournamentId, status: 'confirmed' }, select: { id: true }, orderBy: { id: 'asc' } });
  const confirmed = new Set(registrations.map((row) => row.id));
  const previewGroups = sourceGroups.map((group) => {
    const source = sources.get(group.id)!;
    const teams = source.registrationIds.filter((id) => confirmed.has(id)).map((id) => {
      const row = standings.find((standing) => standing.groupId === group.id && standing.registrationId === id);
      return { registrationId: id, teamName: source.teamNameById.get(id) ?? '이름 없는 팀', position: row?.position ?? null,
        points: row?.points ?? 0, goalsFor: row?.goalsFor ?? 0, goalsAgainst: row?.goalsAgainst ?? 0 };
    }).sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.registrationId.localeCompare(b.registrationId));
    const ranks = source.registrationIds.map((_, index) => ({ rank: index + 1, ...resolveGroupRank(source, index + 1) }));
    return { id: group.id, name: group.name, advanceCount: group.advanceCount ?? 2, teams, ranks,
      complete: ranks.length > 0 && ranks.every((rank) => rank.state !== 'group_incomplete') && teams.length === source.registrationIds.length };
  });
  const details = await tx.v1TournamentMatchDetails.findMany({
    where: { tournamentId, OR: [{ groupId: null }, { group: { is: { phase: { not: 'group' } } } }], teamMatch: { is: { deletedAt: null, status: { notIn: ['cancelled', 'archived'] } } } },
    include: { teamMatch: { include: { game: { include: { resultRevisions: { select: { state: true }, orderBy: { id: 'asc' } }, _count: { select: { events: true } } } } } } },
    orderBy: [{ fixtureNumber: 'asc' }, { teamMatchId: 'asc' }],
  });
  const edges = await tx.v1TournamentMatchAdvancementEdge.findMany({ where: { tournamentId }, orderBy: { id: 'asc' } });
  const slots = await tx.v1TournamentSlot.findMany({ where: { tournamentId }, orderBy: { id: 'asc' } });
  const byeGroups = groups.filter((group) => group.phase === 'round12');
  const byeRows = await tx.v1TournamentByeSlot.findMany({ where: { groupId: { in: byeGroups.map((group) => group.id) } }, orderBy: [{ groupId: 'asc' }, { sortOrder: 'asc' }] });
  const byeTeams = await tx.v1TournamentGroupTeam.findMany({ where: { groupId: { in: byeGroups.map((group) => group.id) }, isBye: true }, orderBy: [{ groupId: 'asc' }, { sortOrder: 'asc' }] });
  const targets: Target[] = [];
  const phaseOrder = ['round16', 'round12', 'quarter', 'semi', 'final'];
  const phaseOf = (groupId: string | null) => groups.find((group) => group.id === groupId)?.phase;
  const firstPhase = phaseOrder.find((phase) => details.some((fixture) => phaseOf(fixture.groupId) === phase));
  let missingLinks = false;
  for (const fixture of details) {
    const match = fixture.teamMatch;
    const incoming = edges.filter((edge) => edge.targetTeamMatchId === fixture.teamMatchId);
    const phase = phaseOf(fixture.groupId);
    if (phase === 'third_place') {
      if (incoming.length !== 2) missingLinks = true;
      continue;
    }
    if (phase !== undefined && phase !== firstPhase && incoming.length === 0) { missingLinks = true; continue; }
    for (const side of ['HOME', 'AWAY'] as const) {
      if (edges.some((edge) => edge.targetTeamMatchId === fixture.teamMatchId && edge.targetSide === side)) continue;
      const slotId = side === 'HOME' ? match.homeSlotId : match.awaySlotId;
      const slot = slots.find((row) => row.id === slotId);
      if (slotId !== null && (slot === undefined || slot.registrationId !== (side === 'HOME' ? fixture.homeRegistrationId : fixture.awayRegistrationId) || (slot.groupId !== null && sourceGroups.some((group) => group.id === slot.groupId)))) {
        throw notReady('조별 참가 자리와 결선 자리가 공유돼 있어요. 결선 자리를 분리해 주세요.');
      }
      if (slot?.kind === 'BYE' && (slot.groupId === null || slot.byeSortOrder === null)) throw notReady('부전승 자리의 위치를 먼저 확인해 주세요.');
      const sourceRound12 = incoming.length === 1 ? details.find((row) => row.teamMatchId === incoming[0].sourceTeamMatchId && phaseOf(row.groupId) === 'round12') : undefined;
      const quarterIndex = details.filter((row) => row.groupId === fixture.groupId).findIndex((row) => row.teamMatchId === fixture.teamMatchId);
      const manualByes = sourceRound12 ? [...byeRows, ...byeTeams].filter((row) => row.groupId === sourceRound12.groupId).sort((a, b) => a.sortOrder - b.sortOrder) : [];
      const manualBye = manualByes[quarterIndex];
      if (slotId === null && sourceRound12 && manualBye === undefined) throw notReady('직행할 부전승 자리와 결선 연결을 먼저 확인해 주세요.');
      const isBye = slot?.kind === 'BYE' || (slotId === null && manualBye !== undefined);
      const byeSortOrder = slot?.kind === 'BYE' ? slot.byeSortOrder : manualBye?.sortOrder ?? null;
      targets.push({ fixtureId: fixture.teamMatchId, side, slotId, groupId: slot?.groupId ?? (isBye ? sourceRound12!.groupId : fixture.groupId),
        byeSortOrder: isBye ? byeSortOrder : null, byePosition: isBye ? slot?.position ?? quarterIndex + 1 : null,
        label: `${groups.find((group) => group.id === fixture.groupId)?.name ?? fixture.round} #${fixture.fixtureNumber} ${side === 'HOME' ? '홈' : '원정'}${isBye ? ' · 직행' : ''}`,
        currentRegistrationId: side === 'HOME' ? fixture.homeRegistrationId : fixture.awayRegistrationId });
    }
  }
  const ready = previewGroups.length > 0 && previewGroups.every((group) => group.complete);
  const blockedReason = !['draft', 'open', 'closed', 'in_progress'].includes(tournament.status) ? '종료·취소·보관된 대회에는 결선 팀을 배정할 수 없어요.'
    : missingLinks ? '후속 결선 경기의 승자·패자 연결을 먼저 완성해 주세요.'
    : !ready ? '모든 조별 경기의 공식 결과를 확정하고 순위를 재계산해 주세요.'
    : details.some(({ teamMatch: match }) => match.status !== 'matched' || match.game === null || match.game.state !== 'SCHEDULED' ||
      match.game.currentOfficialRevisionId !== null || match.game._count.events > 0 || match.game.resultRevisions.some((revision) => revision.state !== 'VOID'))
      ? '결선에 시작했거나 결과·기록이 있는 경기가 있어 배정할 수 없어요.'
      : targets.length === 0 ? '직접 배정할 결선 자리가 없어요. 결선 대진과 경기 연결을 확인해 주세요.' : null;
  const sourceVersion = createHash('sha256').update(JSON.stringify({ groups: previewGroups, sources: [...sources], standings })).digest('hex');
  const previous = await tx.v1AdminActionLog.findFirst({ where: { targetType: 'tournament', targetId: tournamentId, action: 'tournament.bracket.assign_finalists' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { afterJson: true } });
  const savedSource = previous?.afterJson !== null && typeof previous?.afterJson === 'object' && !Array.isArray(previous.afterJson) ? previous.afterJson.sourceVersion : undefined;
  const standingsChanged = typeof savedSource === 'string' && savedSource !== sourceVersion;
  const version = createHash('sha256').update(JSON.stringify({ groups: previewGroups, sources: [...sources], standings, registrations, details, edges, slots, byeRows, byeTeams })).digest('hex');
  return { version, sourceVersion, standingsChanged, groups: previewGroups, targets, blockedReason };
}

export function validateFinalistAssignments(preview: Awaited<ReturnType<typeof loadFinalistPreview>>, input: FinalistAssignmentDto) {
  if (preview.version !== input.version) throw new ConflictException({ code: 'FINALIST_PREVIEW_STALE', message: '결과나 대진이 바뀌었어요. 다시 불러온 뒤 배정을 확인해 주세요.' });
  if (preview.blockedReason !== null) throw notReady(preview.blockedReason);
  if (!input.reason.trim()) throw new UnprocessableEntityException({ code: 'FINALIST_ASSIGNMENT_INVALID', message: '배정 사유를 입력해 주세요.' });
  const allowed = new Set(preview.groups.flatMap((group) => group.teams.map((team) => team.registrationId)));
  const byKey = new Map(preview.targets.map((target) => [`${target.fixtureId}:${target.side}`, target]));
  const seenTargets = new Set<string>();
  const seenTeams = new Set<string>();
  if (input.assignments.length !== preview.targets.length) throw notReady('모든 결선 자리에 팀을 배정해 주세요.');
  for (const assignment of input.assignments) {
    const key = `${assignment.fixtureId}:${assignment.side}`;
    if (!byKey.has(key) || seenTargets.has(key) || !allowed.has(assignment.registrationId) || seenTeams.has(assignment.registrationId)) {
      throw new UnprocessableEntityException({ code: 'FINALIST_ASSIGNMENT_INVALID', message: '중복 자리·중복 팀 또는 배정할 수 없는 팀이 있어요.' });
    }
    seenTargets.add(key); seenTeams.add(assignment.registrationId);
  }
}

export async function previewFinalistAssignment(deps: Dependencies, user: V1AuthUser, tournamentId: string) {
  await deps.adminContext.getActiveAdmin(user.id);
  return deps.prisma.$transaction(async (tx) => {
    await loadCanonicalStandingsSource(tx, tournamentId);
    return loadFinalistPreview(tx, tournamentId);
  }, options);
}

export async function applyFinalistAssignment(deps: Dependencies, user: V1AuthUser, tournamentId: string, input: FinalistAssignmentDto) {
  const admin = await deps.adminContext.getMutationAdmin(user.id);
  return deps.prisma.$transaction(async (tx) => {
    await loadCanonicalStandingsSource(tx, tournamentId);
    const preview = await loadFinalistPreview(tx, tournamentId);
    validateFinalistAssignments(preview, input);
    const changes = [];
    for (const target of preview.targets) {
      let slotId = target.slotId;
      if (slotId !== null) {
        const usages = await tx.v1TeamMatch.count({ where: { deletedAt: null, OR: [{ homeSlotId: slotId }, { awaySlotId: slotId }] } });
        if (usages !== 1) throw notReady('여러 경기가 같은 결선 자리를 공유해 배정할 수 없어요. 자리 연결을 확인해 주세요.');
        const slot = await tx.v1TournamentSlot.findUniqueOrThrow({ where: { id: slotId } });
        if (slot.kind !== 'BYE') await tx.v1TournamentSlot.update({ where: { id: slotId }, data: { kind: 'GROUP_RANK', sourceGroupId: null } });
      } else {
        const slot = await tx.v1TournamentSlot.create({ data: { tournamentId, groupId: target.groupId, kind: target.byePosition === null ? 'GROUP_RANK' : 'BYE', position: target.byePosition ?? preview.targets.indexOf(target) + 1, byeSortOrder: target.byeSortOrder } });
        slotId = slot.id;
        await tx.v1TeamMatch.update({ where: { id: target.fixtureId }, data: target.side === 'HOME' ? { homeSlotId: slotId } : { awaySlotId: slotId } });
      }
      changes.push({ slotId, registrationId: input.assignments.find((row) => row.fixtureId === target.fixtureId && row.side === target.side)!.registrationId });
    }
    await assignSlotsBatchInTx(tx, { admin, adminContext: deps.adminContext, games: deps.games }, changes);
    await deps.adminContext.logAdminAction(admin, { action: 'tournament.bracket.assign_finalists', targetType: 'tournament', targetId: tournamentId,
      reason: input.reason.trim(), beforeJson: { targets: preview.targets }, afterJson: { assignments: input.assignments.map((row) => ({ fixtureId: row.fixtureId, side: row.side, registrationId: row.registrationId })), version: input.version, sourceVersion: preview.sourceVersion } }, tx);
    return { assignments: changes };
  }, options);
}
