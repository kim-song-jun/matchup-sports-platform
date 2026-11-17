import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AdminContextService, V1TournamentManager } from '../../common/admin-context.service';
import type { GamesService } from '../../games/games.service';
import { cascadeCancelTeamMatchSchedulesInTx } from '../../team-schedules/team-schedules.service';
import { assignTournamentFixtureSideInTx, createEmptyTournamentFixtureInTx, softDeleteTournamentFixtureInTx } from '../tournament-bracket-tx';
import { createTournamentMatchAdvancementEdgeInTx } from '../tournament-match-creation';
import { untouchedGameWhere } from '../competition-config/tournament-competition-config';
import { stageInvalid } from './stage-plan';
import { loadStageView, type StoredStagePlan, type RemovedStageFixture } from './stage-view';
import { stagePoolDependsOn } from './stage-dependencies';
import type { StageFixtureRepairDto } from './stage-plan.dto';

type Tournament = Parameters<typeof createEmptyTournamentFixtureInTx>[3]['tournament'];
/** Caller owns the tournament advisory lock and all Game → TeamMatch locks. */
export async function repairStageFixtureInTx(tx: Prisma.TransactionClient, deps: { admin: V1TournamentManager; adminContext: AdminContextService; games: GamesService }, tournament: Tournament, plan: StoredStagePlan, dto: StageFixtureRepairDto) {
  const id = tournament.id;
  let saved: RemovedStageFixture | undefined = plan.removedFixtures?.[dto.fixtureId];
  let replacementId: string | null = null;
  if (dto.action !== 'restore') {
    const detail = await tx.v1TournamentMatchDetails.findFirst({ where: { tournamentId: id, teamMatchId: dto.fixtureId, teamMatch: { deletedAt: null } }, include: { group: true, teamMatch: { include: { game: { include: { currentOfficialRevision: { select: { state: true } } } } } } } });
    if (!detail?.group?.poolKey || !detail.teamMatch.game) return stageInvalid('이 대회의 단계별 경기를 선택해 주세요.');
    const view = await loadStageView(tx, id, plan), key = detail.group.poolKey;
    if (view.pools.some(pool => pool.started && stagePoolDependsOn(plan, pool.key, key))) throw new ConflictException({ code: 'BRACKET_LOCKED', message: '연결된 다음 편성이 시작돼 경기 구성을 바꿀 수 없어요.' });
    const edges = await tx.v1TournamentMatchAdvancementEdge.findMany({ where: { tournamentId: id, OR: [{ sourceTeamMatchId: dto.fixtureId }, { targetTeamMatchId: dto.fixtureId }] } });
    saved = { poolKey: key, groupId: detail.groupId!, round: detail.round, fixtureNumber: detail.fixtureNumber, legNumber: detail.legNumber, homeSlotId: detail.teamMatch.homeSlotId, awaySlotId: detail.teamMatch.awaySlotId, homeRegistrationId: detail.homeRegistrationId, awayRegistrationId: detail.awayRegistrationId, reason: dto.reason.trim(), edges: edges.map(({ sourceTeamMatchId, targetTeamMatchId, sourceOutcome, targetSide }) => ({ sourceTeamMatchId, targetTeamMatchId, sourceOutcome, targetSide })) };
    if (dto.action === 'remove') {
      if (await tx.v1TeamMatch.count({ where: { id: dto.fixtureId, status: 'matched', game: { is: untouchedGameWhere(true) } } }) !== 1) throw new ConflictException({ code: 'FIXTURE_ALREADY_STARTED', message: '시작·이벤트·결과가 없는 경기만 삭제할 수 있어요.' });
      await softDeleteTournamentFixtureInTx(tx, deps.admin, dto.fixtureId);
    } else {
      const game = detail.teamMatch.game;
      if (game.currentOfficialRevision?.state === 'OFFICIAL' || game.state !== 'CANCELLED' && detail.teamMatch.status !== 'cancelled' && game.currentOfficialRevision?.state !== 'VOID') return stageInvalid('취소 또는 무효 경기만 재경기를 만들 수 있어요. 공식 결과를 먼저 적법하게 처리해 주세요.');
      if (game.currentOfficialRevision?.state === 'VOID' && await tx.v1OutboxEvent.count({ where: { revisionId: game.currentOfficialRevisionId, type: 'GAME_RESULT_VOIDED', status: { not: 'COMPLETED' } } }) > 0) throw new ConflictException({ code: 'STAGE_RESULT_PROJECTION_PENDING', message: '무효 결과의 순위·기록 반영이 끝난 뒤 재경기를 만들어 주세요.' });
      const downstream = edges.filter(edge => edge.sourceTeamMatchId === dto.fixtureId).map(edge => edge.targetTeamMatchId);
      if (downstream.length && await tx.v1TeamMatch.count({ where: { id: { in: downstream }, game: { is: untouchedGameWhere(true) } } }) !== downstream.length) throw new ConflictException({ code: 'BRACKET_LOCKED', message: '이어진 경기가 시작돼 재경기를 만들 수 없어요.' });
      // Keep the cancelled/VOID Game, events and revision history immutable.
      await cascadeCancelTeamMatchSchedulesInTx(tx, dto.fixtureId, 'stage_fixture_replay');
      await tx.v1TeamMatch.update({ where: { id: dto.fixtureId }, data: { status: 'archived', deletedAt: new Date(), homeSlotId: null, awaySlotId: null } });
      await tx.v1TournamentMatchAdvancementEdge.deleteMany({ where: { OR: [{ sourceTeamMatchId: dto.fixtureId }, { targetTeamMatchId: dto.fixtureId }] } });
      await tx.v1TournamentMatchDetails.update({ where: { teamMatchId: dto.fixtureId }, data: { groupId: null, parentTeamMatchId: null, round: `${detail.round}:deleted:${dto.fixtureId}` } });
    }
    plan.removedFixtures = { ...plan.removedFixtures, [dto.fixtureId]: saved };
  }
  if (dto.action !== 'remove') {
    if (!saved || saved.replacementId) return stageInvalid('복원할 삭제 경기를 찾을 수 없어요. 최신 대진을 확인해 주세요.');
    const group = await tx.v1TournamentGroup.findFirst({ where: { id: saved.groupId, tournamentId: id, poolKey: saved.poolKey } });
    if (!group) return stageInvalid('편성 구조가 바뀌어 이 경기를 복원할 수 없어요.');
    const slots = await tx.v1TournamentSlot.findMany({ where: { tournamentId: id, group: { poolKey: saved.poolKey } }, select: { id: true, registrationId: true } });
    const members = new Set(slots.flatMap(slot => slot.registrationId ? [slot.registrationId] : []));
    const created = await createEmptyTournamentFixtureInTx(tx, deps, deps.admin, { tournament, groupId: group.id, round: saved.round, fixtureNumber: saved.fixtureNumber, legNumber: saved.legNumber, homeSlotId: saved.homeSlotId, awaySlotId: saved.awaySlotId });
    replacementId = created.id;
    for (const side of ['HOME', 'AWAY'] as const) {
      const slotId = side === 'HOME' ? saved.homeSlotId : saved.awaySlotId;
      const prior = side === 'HOME' ? saved.homeRegistrationId : saved.awayRegistrationId;
      const registrationId = slotId ? slots.find(slot => slot.id === slotId)?.registrationId ?? null : prior && members.has(prior) ? prior : null;
      if (registrationId) await assignTournamentFixtureSideInTx(tx, deps, deps.admin, { fixtureId: created.id, side, registrationId, enrollmentSink: [] });
    }
    for (const edge of saved.edges) await createTournamentMatchAdvancementEdgeInTx(tx, { tournamentId: id, ...edge, sourceTeamMatchId: edge.sourceTeamMatchId === dto.fixtureId ? created.id : edge.sourceTeamMatchId, targetTeamMatchId: edge.targetTeamMatchId === dto.fixtureId ? created.id : edge.targetTeamMatchId });
    saved.replacementId = created.id;
  }
  await deps.adminContext.logAdminAction(deps.admin, { action: `tournament.stages.fixture.${dto.action}`, targetType: 'team_match', targetId: dto.fixtureId, reason: dto.reason.trim(), afterJson: { tournamentId: id, replacementId, poolKey: saved!.poolKey } }, tx);
  return replacementId;
}
