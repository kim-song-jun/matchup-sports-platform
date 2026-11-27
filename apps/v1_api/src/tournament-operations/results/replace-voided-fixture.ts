import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { gameOperationAuditActor, type GamesService } from '../../games/games.service';
import type { OperationAuditWriterService } from '../../common/audit/operation-audit-writer.service';
import type { GameCommandContext } from '../../games/games.types';
import { lockGameRows } from '../../games/roster/game-row-lock';
import { competitionTeamTargets, enqueueRosterResync } from '../../games/roster/roster-resync-events';
import { untouchedGameWhere } from '../../tournaments/competition-config/tournament-competition-config';
import { parseSixTeamState } from '../../tournaments/six-team/six-team-state';
import { loadStageView, type StoredStagePlan } from '../../tournaments/stages/stage-view';
import { stagePoolDependsOn } from '../../tournaments/stages/stage-dependencies';
import { toPlaceView } from '../../places/place-snapshot';
import { cascadeCancelTeamMatchSchedulesInTx } from '../../team-schedules/team-schedules.service';
import { createTournamentMatchInTx, createTournamentMatchAdvancementEdgeInTx } from '../../tournaments/tournament-match-creation';

/** Caller owns the result command Game lock and has reversed the official result. */
export async function replaceVoidedFixture(tx: Prisma.TransactionClient, games: GamesService, fixtureId: string, context: GameCommandContext, auditWriter: OperationAuditWriterService, reason: string) {
  const detail = await tx.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: fixtureId }, include: {
    tournament: true, group: true, teamMatch: { include: { game: { include: { sides: true, currentOfficialRevision: true, visibilityPolicy: true } } } },
  } });
  const match = detail.teamMatch, game = match.game;
  if (match.deletedAt || game?.currentOfficialRevision?.state !== 'VOID' || !['draft', 'open', 'closed', 'in_progress'].includes(detail.tournament.status)) {
    throw new ConflictException({ code: 'FIXTURE_RESET_NOT_ALLOWED', message: '진행 가능한 대회의 무효 경기만 시작 전으로 돌릴 수 있어요.' });
  }
  const home = game.sides.find(s => s.sideKey === 'HOME'), away = game.sides.find(s => s.sideKey === 'AWAY');
  if (!home || !away) throw new ConflictException({ code: 'FIXTURE_SIDES_MISSING', message: '경기의 홈·어웨이 정보를 확인해 주세요.' });
  const allEdges = await tx.v1TournamentMatchAdvancementEdge.findMany({ where: { tournamentId: detail.tournamentId } });
  const downstream = new Set<string>();
  const visit = (id: string) => { for (const e of allEdges) if (e.sourceTeamMatchId === id && !downstream.has(e.targetTeamMatchId)) { downstream.add(e.targetTeamMatchId); visit(e.targetTeamMatchId); } };
  visit(fixtureId);
  const six = parseSixTeamState(detail.tournament.sixTeamBracket);
  const sixIndex = six?.rounds.indexOf(fixtureId) ?? -1;
  if (six && sixIndex >= 0) for (const id of six.rounds.slice(sixIndex < 3 ? 3 : sixIndex + 1)) downstream.add(id);
  if (detail.tournament.stagePlan !== null && detail.group?.poolKey) {
    const plan = detail.tournament.stagePlan as unknown as StoredStagePlan;
    const view = await loadStageView(tx, detail.tournamentId, plan);
    if (view.pools.some(pool => pool.started && stagePoolDependsOn(plan, pool.key, detail.group!.poolKey!))) {
      throw new ConflictException({ code: 'NEXT_FIXTURE_CONFLICT', message: '연결된 다음 편성이 시작돼 복구할 수 없어요.' });
    }
  }
  const laterGames = await tx.v1Game.findMany({ where: { teamMatchId: { in: [...downstream] } }, select: { id: true } });
  await lockGameRows(tx, laterGames.map(g => g.id), false);
  if (downstream.has(fixtureId) || downstream.size && await tx.v1TeamMatch.count({ where: {
    id: { in: [...downstream] }, deletedAt: null, status: 'matched', game: { is: untouchedGameWhere(true) },
  } }) !== downstream.size) throw new ConflictException({ code: 'NEXT_FIXTURE_CONFLICT', message: '이후 경기에 시작·결과·기록이 있어 복구할 수 없어요.' });
  const edges = await tx.v1TournamentMatchAdvancementEdge.findMany({ where: { OR: [{ sourceTeamMatchId: fixtureId }, { targetTeamMatchId: fixtureId }] } });
  await cascadeCancelTeamMatchSchedulesInTx(tx, fixtureId, 'result_void_reset');
  await tx.v1TeamMatch.update({ where: { id: fixtureId }, data: { status: 'archived', deletedAt: new Date(), homeSlotId: null, awaySlotId: null } });
  // Preserve the original Game, events, revisions and metadata for history. Free only the bracket coordinate.
  await tx.v1TournamentMatchDetails.update({ where: { teamMatchId: fixtureId }, data: { groupId: null, parentTeamMatchId: null, round: `${detail.round}:deleted:${fixtureId}` } });
  const created = await createTournamentMatchInTx(tx, games, {
    tournamentId: detail.tournamentId, groupId: detail.groupId, round: detail.round,
    fixtureNumber: detail.fixtureNumber, legNumber: detail.legNumber, parentTeamMatchId: detail.parentTeamMatchId,
    homeRegistrationId: detail.homeRegistrationId, awayRegistrationId: detail.awayRegistrationId,
    homeSlotId: match.homeSlotId, awaySlotId: match.awaySlotId,
    sportId: match.sportId, regionId: match.regionId, title: match.title, place: toPlaceView(match),
    startAt: match.startAt, endAt: match.endAt, fieldId: match.fieldId,
    createdByUserId: context.actor.actorType === 'USER' ? context.actor.actorUserId : null,
    competitionConfigVersionId: game.competitionConfigVersionId,
    home: { id: match.hostTeamId, name: home.displayNameSnapshot },
    away: { id: match.approvedApplicantTeamId, name: away.displayNameSnapshot },
    actor: context.actor, durableCommandId: `void-reset:${game.id}:${game.currentOfficialRevisionId}`, payloadHash: context.payloadHash,
  });
  await tx.v1TournamentMatchDetails.update({ where: { teamMatchId: created.teamMatchId }, data: {
    displayTitle: detail.displayTitle, homeDisplayLabel: detail.homeDisplayLabel, awayDisplayLabel: detail.awayDisplayLabel,
  } });
  if (game.visibilityPolicy) await tx.v1GameVisibilityPolicy.update({ where: { gameId: created.game.gameId }, data: {
    mode: game.visibilityPolicy.mode, lineupAt: game.visibilityPolicy.lineupAt,
  } });
  await enqueueRosterResync(tx, competitionTeamTargets(detail.tournamentId, [match.hostTeamId, match.approvedApplicantTeamId]));
  await tx.v1TournamentMatchDetails.updateMany({ where: { parentTeamMatchId: fixtureId }, data: { parentTeamMatchId: created.teamMatchId } });
  const scopes = await tx.v1TournamentStaffFixtureScope.findMany({ where: { teamMatchId: fixtureId } });
  for (const scope of scopes) await tx.v1TournamentStaffFixtureScope.create({ data: {
    assignmentId: scope.assignmentId, tournamentId: scope.tournamentId, teamMatchId: created.teamMatchId,
  } });
  await tx.v1TournamentMatchAdvancementEdge.deleteMany({ where: { OR: [{ sourceTeamMatchId: fixtureId }, { targetTeamMatchId: fixtureId }] } });
  for (const edge of edges) await createTournamentMatchAdvancementEdgeInTx(tx, {
    ...edge, sourceTeamMatchId: edge.sourceTeamMatchId === fixtureId ? created.teamMatchId : edge.sourceTeamMatchId,
    targetTeamMatchId: edge.targetTeamMatchId === fixtureId ? created.teamMatchId : edge.targetTeamMatchId,
  });
  const remap = (value: Prisma.JsonValue): Prisma.InputJsonValue => {
    if (value === fixtureId) return created.teamMatchId;
    if (Array.isArray(value)) return value.map(v => v === null ? null : remap(v));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k === fixtureId ? created.teamMatchId : k, v == null ? null : remap(v)]));
    return value as Prisma.InputJsonValue;
  };
  const stagePlan = detail.tournament.stagePlan as unknown as StoredStagePlan | null;
  const nextStagePlan = stagePlan === null ? null : {
    ...stagePlan,
    ...(stagePlan.removedFixtures ? { removedFixtures: Object.fromEntries(Object.entries(stagePlan.removedFixtures).map(([id, saved]) => [id, saved.replacementId === fixtureId ? { ...saved, replacementId: created.teamMatchId } : saved])) } : {}),
  };
  await tx.v1Tournament.update({ where: { id: detail.tournamentId }, data: {
    ...(detail.tournament.sixTeamBracket === null ? {} : { sixTeamBracket: remap(detail.tournament.sixTeamBracket) }),
    ...(nextStagePlan === null ? {} : { stagePlan: nextStagePlan as unknown as Prisma.InputJsonValue, stagePlanRevision: { increment: 1 } }),
  } });
  const replacement = { fixtureId: created.teamMatchId, gameId: created.game.gameId };
  await auditWriter.create(tx, {
    actor: gameOperationAuditActor(context.actor), requestId: context.durableCommandId, action: 'TOURNAMENT_FIXTURE_RESET',
    occurredAt: new Date(),
    targetType: 'TEAM_MATCH', targetId: fixtureId, tournamentId: detail.tournamentId, teamMatchId: fixtureId, reason,
    before: { gameId: game.id, revisionId: game.currentOfficialRevisionId, groupId: detail.groupId, round: detail.round,
      fixtureNumber: detail.fixtureNumber, legNumber: detail.legNumber, parentTeamMatchId: detail.parentTeamMatchId,
      homeSlotId: match.homeSlotId, awaySlotId: match.awaySlotId, homeRegistrationId: detail.homeRegistrationId, awayRegistrationId: detail.awayRegistrationId,
      startAt: match.startAt?.toISOString() ?? null, fieldId: match.fieldId },
    after: { replacement, state: 'SCHEDULED' },
  });
  return replacement;
}
