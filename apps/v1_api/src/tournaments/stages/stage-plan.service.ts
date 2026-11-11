import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminContextService } from '../../common/admin-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GamesService } from '../../games/games.service';
import { TOURNAMENT_VENUE_SELECT } from '../../places/tournament-venue';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from '../tournament-surface-lookup';
import { BracketTemplateService } from '../templates/bracket-template.service';
import { lockCompetitionForBracketMutationInTx } from '../slots/competition-bracket-lock';
import { assignSlotsBatchInTx } from '../slots/tournament-slot.service';
import { recalculateStandingsInTx } from '../tournament-bracket-tx';
import { planCompetitionStages, stageInvalid, validateStagePlan } from './stage-plan';
import { loadStageView, type StoredStagePlan } from './stage-view';
import type { StageAssignDto, StageTieBreakOrderDto, StageVersionDto } from './stage-plan.dto';
import { STAGE_KEY_PATTERN } from './stage-plan.dto';
import { loadStageTieBreakView, STAGE_TIE_BREAK_LOCKED_MESSAGE } from './stage-tie-break';
import { assertValidTieBreakOrder, resolveStageTieBreakOrder, sameTieBreakOrder } from '../competition-config/tournament-tie-break-order';
import { lockCompetitionFixtureRows, lockTournamentForConfigChange } from '../competition-config/tournament-competition-config';
const options = { timeout: 45_000, maxWait: 5_000 };
const stale = () => new ConflictException({ code: 'STAGE_PLAN_STALE', message: '대회 구성이나 공식 결과가 바뀌었어요. 최신 정보를 다시 불러와 주세요.' });
@Injectable()
export class StagePlanService {
  constructor(private readonly prisma: PrismaService, private readonly admins: AdminContextService, private readonly templates: BracketTemplateService, private readonly games: GamesService) {}
  private async tournament(tx: Prisma.TransactionClient, id: string) {
    const row = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, { where: { id, deletedAt: null }, select: { id: true, kind: true, format: true, status: true, title: true, sportId: true, regionId: true, teamCount: true, stagePlan: true, stagePlanRevision: true, tieBreakOrder: true, competitionConfigVersionId: true, ...TOURNAMENT_VENUE_SELECT } });
    if (!row) throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    if (!row.stagePlan || row.kind !== 'regular_tournament') return stageInvalid('단계형 대회에서만 사용할 수 있어요.');
    return row;
  }
  private mutable(status: string) { if (!['draft', 'open', 'closed', 'in_progress'].includes(status)) throw new ConflictException({ code: 'BRACKET_LOCKED', message: '종료·취소한 대회의 대진은 변경할 수 없어요.' }); }
  async get(user: V1AuthUser, id: string) {
    await this.admins.getTournamentAdmin(user.id, { tournamentId: id });
    return this.prisma.$transaction(async tx => { const t = await this.tournament(tx, id); return { revision: t.stagePlanRevision, ...await loadStageView(tx, id, t.stagePlan as unknown as StoredStagePlan) }; }, { ...options, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async generate(user: V1AuthUser, id: string, dto: StageVersionDto) {
    const admin = await this.admins.getTournamentMutationAdmin(user.id, { tournamentId: id });
    return this.prisma.$transaction(async tx => {
      const first = await this.tournament(tx, id); await lockCompetitionForBracketMutationInTx(tx, first);
      const t = await this.tournament(tx, id); this.mutable(t.status);
      if (t.stagePlanRevision !== dto.expectedRevision) throw stale();
      const config = t.stagePlan as unknown as StoredStagePlan;
      validateStagePlan(config, t.teamCount);
      if (await tx.v1TournamentGroup.count({ where: { tournamentId: id } }) || await tx.v1TournamentMatchDetails.count({ where: { tournamentId: id, teamMatch: { deletedAt: null } } })) throw new ConflictException({ code: 'BRACKET_NOT_EMPTY', message: '이미 생성된 대진이 있어요. 기존 경기와 일정은 유지해요.' });
      if (!t.competitionConfigVersionId) return stageInvalid('대회 경기 규칙을 먼저 저장해 주세요.');
      await this.templates.materialize(tx, admin, { ...t, competitionConfigVersionId: t.competitionConfigVersionId }, planCompetitionStages(config));
      await tx.v1Tournament.update({ where: { id }, data: { stagePlanRevision: { increment: 1 } } });
      await this.admins.logAdminAction(admin, { action: 'tournament.stages.generate', targetType: 'tournament', targetId: id, afterJson: JSON.parse(JSON.stringify(config)) }, tx);
      return { revision: t.stagePlanRevision + 1, ...await loadStageView(tx, id, config) };
    }, options);
  }
  async assign(user: V1AuthUser, id: string, dto: StageAssignDto) {
    const admin = await this.admins.getTournamentMutationAdmin(user.id, { tournamentId: id });
    return this.prisma.$transaction(async tx => {
      const first = await this.tournament(tx, id); await lockCompetitionForBracketMutationInTx(tx, first);
      const t = await this.tournament(tx, id); this.mutable(t.status);
      if (t.stagePlanRevision !== dto.expectedRevision) throw stale();
      // Source results and target state must remain stable through the roster write.
      await tx.$queryRaw`SELECT g.id FROM v1_games g JOIN v1_tournament_match_details d ON d.team_match_id = g.team_match_id JOIN v1_team_matches m ON m.id = d.team_match_id WHERE d.tournament_id = ${id} AND m.deleted_at IS NULL ORDER BY g.id FOR UPDATE OF g`;
      const config = t.stagePlan as unknown as StoredStagePlan;
      const view = await loadStageView(tx, id, config);
      const pool = view.pools.find(p => p.key === dto.poolKey);
      if (!pool || !pool.generated || pool.slots.length !== pool.capacity) return stageInvalid('대진을 먼저 생성하고 배정할 편성을 선택해 주세요.');
      const acknowledge = dto.acknowledgeStartedCorrection === true;
      if (acknowledge && (!pool.started || !pool.stale || !pool.assigned || pool.stageIndex === 0 || pool.candidates.some(c => !c.length) || !dto.reason?.trim() || dto.registrationIds.some((r, i) => r !== pool.registrationIds[i]) || dto.registrationIds.length !== pool.capacity)) return stageInvalid('이미 시작한 편성의 참가팀을 그대로 유지할 때만 정정 영향과 사유를 확인할 수 있어요. 이전 단계 결과부터 확정해 주세요.');
      if (pool.started && !acknowledge) throw new ConflictException({ code: 'BRACKET_LOCKED', message: '시작했거나 기록이 있는 편성은 참가팀을 바꿀 수 없어요.' });
      if (pool.sourceVersion !== dto.sourceVersion) throw stale();
      if (dto.registrationIds.length !== pool.capacity || new Set(dto.registrationIds).size !== pool.capacity) return stageInvalid('모든 자리에 서로 다른 팀을 배정해 주세요.');
      const confirmed = new Set(view.registrations.map(r => r.id));
      if (dto.registrationIds.some(r => !confirmed.has(r))) return stageInvalid('이 대회의 확정 참가팀만 배정할 수 있어요.');
      if (!acknowledge && pool.stageIndex > 0 && dto.registrationIds.some((r, i) => !pool.candidates[i]?.includes(r))) return stageInvalid('이전 단계의 공식 순위와 동률 후보에 맞는 팀을 선택해 주세요.');
      if (pool.stageIndex > 0 && pool.candidates.some(c => c.length > 1) && !dto.reason?.trim()) return stageInvalid('동률 순위의 결정 사유를 입력해 주세요.');
      const duplicate = view.pools.some(p => p.stageKey === pool.stageKey && p.key !== pool.key && p.registrationIds.some(r => r !== null && dto.registrationIds.includes(r)));
      if (duplicate) return stageInvalid('같은 단계의 다른 편성에 이미 배정된 팀이 있어요.');
      if (!acknowledge) await assignSlotsBatchInTx(tx, { admin, adminContext: this.admins, games: this.games }, pool.slots.map((slot, i) => ({ slotId: slot.id, registrationId: dto.registrationIds[i] })));
      const previous = config.assignments?.[pool.key];
      config.assignments = { ...config.assignments, [pool.key]: { sourceVersion: pool.sourceVersion, registrationIds: dto.registrationIds, reason: dto.reason?.trim() ?? '', at: new Date().toISOString() } };
      await tx.v1Tournament.update({ where: { id }, data: { stagePlan: JSON.parse(JSON.stringify(config)), stagePlanRevision: { increment: 1 } } });
      await recalculateStandingsInTx(tx, id);
      await this.admins.logAdminAction(admin, { action: acknowledge ? 'tournament.stages.acknowledge_started_correction' : 'tournament.stages.assign', targetType: 'tournament', targetId: id, beforeJson: previous ? JSON.parse(JSON.stringify(previous)) : undefined, afterJson: { poolKey: pool.key, ...config.assignments[pool.key] } }, tx);
      return { revision: t.stagePlanRevision + 1, ...await loadStageView(tx, id, config) };
    }, options);
  }
  /**
   * MD-QA #186: 조별리그 단계 하나의 동점 순서를 정하거나(order) 대회 설정 따름으로 되돌린다(null).
   * 플랫폼 owner·ops 만 바꾼다(대회 디렉터·support 는 403). 그 단계 조별 경기에 공식 결과가 하나라도 있으면 409.
   */
  async updateTieBreakOrder(user: V1AuthUser, id: string, stageKey: string, dto: StageTieBreakOrderDto) {
    const admin = await this.admins.getMutationAdmin(user.id);
    if (!STAGE_KEY_PATTERN.test(stageKey)) return stageInvalid('단계를 찾을 수 없어요.');
    const next = dto.order === null || dto.order === undefined ? null : assertValidTieBreakOrder(dto.order);
    return this.prisma.$transaction(async tx => {
      const first = await this.tournament(tx, id);
      // Same order as the tournament-level change: tournament row, then its Game → TeamMatch rows, so a result being confirmed commits first.
      await lockTournamentForConfigChange(tx, id);
      await lockCompetitionFixtureRows(tx, first.kind, id);
      const t = await this.tournament(tx, id); this.mutable(t.status);
      if (t.stagePlanRevision !== dto.expectedRevision) throw stale();
      const stage = (t.stagePlan as unknown as StoredStagePlan).stages.find(candidate => candidate.key === stageKey);
      if (!stage) return stageInvalid('단계를 찾을 수 없어요.');
      if (!stage.pools.some(pool => pool.format === 'league')) return stageInvalid('토너먼트 단계는 승부로 가려서 동점 순서가 없어요.');
      const current = await tx.v1TournamentStageTieBreakSetting.findUnique({ where: { tournamentId_stageKey: { tournamentId: id, stageKey } }, select: { order: true } });
      const before = current ? assertValidTieBreakOrder(current.order) : null;
      const unchanged = before === null ? next === null : next !== null && sameTieBreakOrder(before, next);
      if (unchanged) return { revision: t.stagePlanRevision, stageTieBreak: await loadStageTieBreakView(tx, t) };
      const view = await loadStageTieBreakView(tx, t);
      if (view.stages.find(candidate => candidate.stageKey === stageKey)?.lockedReason) {
        throw new ConflictException({ code: 'TIE_BREAK_ORDER_LOCKED', message: STAGE_TIE_BREAK_LOCKED_MESSAGE });
      }
      if (next === null) await tx.v1TournamentStageTieBreakSetting.delete({ where: { tournamentId_stageKey: { tournamentId: id, stageKey } } });
      else await tx.v1TournamentStageTieBreakSetting.upsert({ where: { tournamentId_stageKey: { tournamentId: id, stageKey } }, create: { tournamentId: id, stageKey, order: next }, update: { order: next } });
      await tx.v1Tournament.update({ where: { id }, data: { stagePlanRevision: { increment: 1 } } });
      await this.admins.logAdminAction(admin, {
        action: 'tournament.stage_tie_break.update', targetType: 'tournament', targetId: id,
        beforeJson: { stageKey, inherit: before === null, order: before, resolvedOrder: resolveStageTieBreakOrder(t.tieBreakOrder, before) },
        afterJson: { stageKey, inherit: next === null, order: next, resolvedOrder: resolveStageTieBreakOrder(t.tieBreakOrder, next) },
      }, tx);
      return { revision: t.stagePlanRevision + 1, stageTieBreak: await loadStageTieBreakView(tx, t) };
    }, options);
  }
}
