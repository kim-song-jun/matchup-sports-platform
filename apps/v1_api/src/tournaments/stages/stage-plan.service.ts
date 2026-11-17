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
import { recalculateStandingsInTx, softDeleteTournamentFixtureInTx, deleteTournamentGroupInTx } from '../tournament-bracket-tx';
import { planCompetitionStages, stageInvalid, validateStagePlan } from './stage-plan';
import { loadStageView, type StoredStagePlan } from './stage-view';
import type { StageAssignDto, StageAutomationDto, StageFixtureRepairDto, StagePoolRenameDto, StageSixTeamDto, StageStructureDto, StageTieBreakOrderDto, StageVersionDto } from './stage-plan.dto';
import { STAGE_KEY_PATTERN } from './stage-plan.dto';
import { loadStageTieBreakView, STAGE_TIE_BREAK_LOCKED_MESSAGE } from './stage-tie-break';
import { assertValidTieBreakOrder, resolveStageTieBreakOrder, sameTieBreakOrder } from '../competition-config/tournament-tie-break-order';
import { lockCompetitionFixtureRows, lockTournamentForConfigChange } from '../competition-config/tournament-competition-config';
import { NotificationsService } from '../../notifications/notifications.service';
import { randomInt } from 'node:crypto';
import { stagePoolDependsOn } from './stage-dependencies';
import { orderFixturesForTeardown } from '../templates/bracket-teardown-order';
import { repairStageFixtureInTx } from './stage-fixture-repair';
import { stageSixResults, stageSixTeamView, syncStageSixTeamsInTx } from './stage-six-team';
const options = { timeout: 45_000, maxWait: 5_000 };
const stale = () => new ConflictException({ code: 'STAGE_PLAN_STALE', message: '대회 구성이나 공식 결과가 바뀌었어요. 최신 정보를 다시 불러와 주세요.' });
@Injectable()
export class StagePlanService {
  constructor(private readonly prisma: PrismaService, private readonly admins: AdminContextService, private readonly templates: BracketTemplateService, private readonly games: GamesService, private readonly notifications?: NotificationsService) {}
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
      config.automation ??= { configuredByUserId: user.id };
      await tx.v1Tournament.update({ where: { id }, data: { stagePlan: JSON.parse(JSON.stringify(config)), stagePlanRevision: { increment: 1 } } });
      await this.admins.logAdminAction(admin, { action: 'tournament.stages.generate', targetType: 'tournament', targetId: id, afterJson: JSON.parse(JSON.stringify(config)) }, tx);
      return { revision: t.stagePlanRevision + 1, ...await loadStageView(tx, id, config) };
    }, options);
  }
  async assign(user: V1AuthUser, id: string, dto: StageAssignDto) {
    const admin = await this.admins.getTournamentMutationAdmin(user.id, { tournamentId: id });
    if (dto.overrideCandidates) {
      await this.admins.getMutationAdmin(user.id);
      if (!dto.reason?.trim() || dto.acknowledgeStartedCorrection) return stageInvalid('예외 배정에는 운영자 권한과 사유가 필요해요.');
    }
    const advanced: Array<{ registrationId: string; seed: number; poolName: string }> = [];
    const result = await this.prisma.$transaction(async tx => {
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
      const selected = dto.registrationIds.filter((r): r is string => r !== null);
      if (dto.registrationIds.length !== pool.capacity || new Set(selected).size !== selected.length || !dto.draft && selected.length !== pool.capacity || dto.draft && acknowledge) return stageInvalid('확정할 때는 모든 자리에 서로 다른 팀을 배정해 주세요.');
      const confirmed = new Set(view.registrations.map(r => r.id));
      if (selected.some(r => !confirmed.has(r))) return stageInvalid('이 대회의 확정 참가팀만 배정할 수 있어요.');
      if (!acknowledge && !dto.overrideCandidates && pool.stageIndex > 0 && dto.registrationIds.some((r, i) => r !== null && !pool.candidates[i]?.includes(r))) return stageInvalid('이전 단계의 공식 순위와 동률 후보에 맞는 팀을 선택해 주세요.');
      if (!dto.draft && pool.stageIndex > 0 && pool.candidates.some(c => c.length > 1) && !dto.reason?.trim()) return stageInvalid('동률 순위의 결정 사유를 입력해 주세요.');
      const duplicate = view.pools.some(p => p.stageKey === pool.stageKey && p.key !== pool.key && p.registrationIds.some(r => r !== null && dto.registrationIds.includes(r)));
      if (duplicate) return stageInvalid('같은 단계의 다른 편성에 이미 배정된 팀이 있어요.');
      if (!acknowledge) await assignSlotsBatchInTx(tx, { admin, adminContext: this.admins, games: this.games }, pool.slots.map((slot, i) => ({ slotId: slot.id, registrationId: dto.registrationIds[i] })));
      const previous = config.assignments?.[pool.key];
      config.assignments = { ...config.assignments, [pool.key]: { sourceVersion: pool.sourceVersion, registrationIds: dto.registrationIds, reason: dto.reason?.trim() ?? '', at: new Date().toISOString(), ...(dto.draft ? { draft: true } : {}), ...(dto.overrideCandidates ? { overrideCandidates: true } : {}) } };
      await tx.v1Tournament.update({ where: { id }, data: { stagePlan: JSON.parse(JSON.stringify(config)), stagePlanRevision: { increment: 1 } } });
      await recalculateStandingsInTx(tx, id);
      await this.admins.logAdminAction(admin, { action: acknowledge ? 'tournament.stages.acknowledge_started_correction' : 'tournament.stages.assign', targetType: 'tournament', targetId: id, beforeJson: previous ? JSON.parse(JSON.stringify(previous)) : undefined, afterJson: { poolKey: pool.key, ...config.assignments[pool.key] } }, tx);
      if (!dto.draft && !acknowledge && pool.stageIndex > 0) selected.forEach((registrationId, i) => {
        if (!previous || previous.draft || !previous.registrationIds.includes(registrationId)) advanced.push({ registrationId, seed: i + 1, poolName: pool.name });
      });
      return { revision: t.stagePlanRevision + 1, ...await loadStageView(tx, id, config) };
    }, options);
    for (const entry of advanced) this.notifications?.emitToManyDeferred(async () => {
      const members = await this.prisma.v1TeamMembership.findMany({ where: { status: 'active', role: { in: ['owner', 'manager'] }, team: { tournamentRegistrations: { some: { id: entry.registrationId } } } }, select: { userId: true } });
      return [...new Set(members.map(m => m.userId))];
    }, 'tournament_finals_advanced', id, `${entry.poolName} · ${entry.seed}번 자리로 진출했어요. 대진표에서 다음 경기를 확인해 주세요.`, { businessKey: `tournament-stage-advanced:${id}:${dto.poolKey}:${entry.registrationId}` });
    return result;
  }

  async rename(user: V1AuthUser, id: string, dto: StagePoolRenameDto) {
    const admin = await this.admins.getTournamentMutationAdmin(user.id, { tournamentId: id });
    return this.prisma.$transaction(async tx => {
      const initial = await this.tournament(tx, id); await lockCompetitionForBracketMutationInTx(tx, initial);
      const t = await this.tournament(tx, id); if (t.stagePlanRevision !== dto.expectedRevision) throw stale();
      const config = t.stagePlan as unknown as StoredStagePlan;
      const stage = config.stages.find(s => s.pools.some(p => p.key === dto.poolKey));
      const pool = stage?.pools.find(p => p.key === dto.poolKey);
      if (!stage || !pool) return stageInvalid('편성을 찾을 수 없어요.');
      const previousLabels = planCompetitionStages(config).groups;
      const before = { stageName: stage.name, name: pool.name, overallRankStart: pool.overallRankStart ?? null };
      pool.name = dto.name.trim(); if (dto.stageName !== undefined) stage.name = dto.stageName.trim();
      if (dto.overallRankStart === null) delete pool.overallRankStart;
      else if (dto.overallRankStart !== undefined) pool.overallRankStart = dto.overallRankStart;
      validateStagePlan(config, t.teamCount);
      const expected = planCompetitionStages(config).groups;
      const groups = await tx.v1TournamentGroup.findMany({ where: { tournamentId: id, stageKey: stage.key } });
      for (const group of groups) {
        const label = expected.find(g => g.poolKey === group.poolKey && g.phase === group.phase);
        const oldLabel = previousLabels.find(g => g.poolKey === group.poolKey && g.phase === group.phase);
        if (label && (group.phase === 'group' || group.name === oldLabel?.name)) await tx.v1TournamentGroup.update({ where: { id: group.id }, data: { name: label.name } });
      }
      await tx.v1Tournament.update({ where: { id }, data: { stagePlan: JSON.parse(JSON.stringify(config)), stagePlanRevision: { increment: 1 } } });
      await this.admins.logAdminAction(admin, { action: 'tournament.stages.rename', targetType: 'tournament', targetId: id, beforeJson: before, afterJson: { poolKey: pool.key, stageName: stage.name, name: pool.name, overallRankStart: pool.overallRankStart ?? null } }, tx);
      if (dto.overallRankStart !== undefined) await recalculateStandingsInTx(tx, id);
      return { revision: t.stagePlanRevision + 1, ...await loadStageView(tx, id, config) };
    }, options);
  }

  async setAutomation(user: V1AuthUser, id: string, dto: StageAutomationDto) {
    const admin = await this.admins.getTournamentMutationAdmin(user.id, { tournamentId: id });
    return this.prisma.$transaction(async tx => {
      const initial = await this.tournament(tx, id); await lockCompetitionForBracketMutationInTx(tx, initial);
      const t = await this.tournament(tx, id); this.mutable(t.status); if (t.stagePlanRevision !== dto.expectedRevision) throw stale();
      const plan = t.stagePlan as unknown as StoredStagePlan, before = plan.autoAdvance === true;
      plan.autoAdvance = dto.enabled; plan.automation = { configuredByUserId: user.id };
      await tx.v1Tournament.update({ where: { id }, data: { stagePlan: JSON.parse(JSON.stringify(plan)), stagePlanRevision: { increment: 1 } } });
      await this.admins.logAdminAction(admin, { action: 'tournament.stages.automation', targetType: 'tournament', targetId: id, beforeJson: { enabled: before }, afterJson: { enabled: dto.enabled } }, tx);
      if (dto.enabled) await tx.v1OutboxEvent.create({ data: { businessKey: `stage-auto-config:${id}:${t.stagePlanRevision + 1}`, aggregateType: 'TOURNAMENT', aggregateId: id, type: 'STAGE_AUTO_ADVANCE', payload: { tournamentId: id } } });
      return { revision: t.stagePlanRevision + 1, ...await loadStageView(tx, id, plan) };
    }, options);
  }

  async repairFixture(user: V1AuthUser, id: string, dto: StageFixtureRepairDto) {
    const admin = await this.admins.getTournamentMutationAdmin(user.id, { tournamentId: id });
    if (!dto.reason.trim()) return stageInvalid('경기 변경 사유를 입력해 주세요.');
    return this.prisma.$transaction(async tx => {
      const initial = await this.tournament(tx, id); await lockCompetitionForBracketMutationInTx(tx, initial);
      const t = await this.tournament(tx, id); this.mutable(t.status);
      if (t.stagePlanRevision !== dto.expectedRevision) throw stale();
      if (!t.competitionConfigVersionId) return stageInvalid('대회 경기 규칙을 먼저 저장해 주세요.');
      await lockCompetitionFixtureRows(tx, t.kind, id);
      const plan = t.stagePlan as unknown as StoredStagePlan;
      const replacementId = await repairStageFixtureInTx(tx, { admin, adminContext: this.admins, games: this.games }, { ...t, competitionConfigVersionId: t.competitionConfigVersionId }, plan, dto);
      await tx.v1Tournament.update({ where: { id }, data: { stagePlan: JSON.parse(JSON.stringify(plan)), stagePlanRevision: { increment: 1 } } });
      await recalculateStandingsInTx(tx, id);
      return { replacementId, revision: t.stagePlanRevision + 1, ...await loadStageView(tx, id, plan) };
    }, options);
  }

  async selectSixTeamBye(user: V1AuthUser, id: string, dto: StageSixTeamDto) {
    const admin = await this.admins.getTournamentMutationAdmin(user.id, { tournamentId: id });
    if (!dto.reason.trim()) return stageInvalid('6강 결승 직행 결정 사유를 입력해 주세요.');
    return this.prisma.$transaction(async tx => {
      const initial = await this.tournament(tx, id); await lockCompetitionForBracketMutationInTx(tx, initial);
      const t = await this.tournament(tx, id); this.mutable(t.status); if (t.stagePlanRevision !== dto.expectedRevision) throw stale();
      await lockCompetitionFixtureRows(tx, t.kind, id);
      const plan = t.stagePlan as unknown as StoredStagePlan, pool = plan.stages.flatMap(stage => stage.pools).find(pool => pool.key === dto.poolKey);
      if (!pool?.sixTeamFinalBye) return stageInvalid('6강 결승 직행 편성을 선택해 주세요.');
      const results = await stageSixResults(tx, id, pool.key), view = stageSixTeamView(results, plan.sixTeamSelections?.[pool.key], pool.sixTeamDirectFinalOrder);
      if (view.sourceVersion !== dto.sourceVersion) throw stale();
      if (!view.ready || dto.byeRegistrationId && !view.candidates.includes(dto.byeRegistrationId)) return stageInvalid('6강 공식 승자 3팀 중에서 결승 직행팀을 선택해 주세요.');
      plan.sixTeamSelections = { ...plan.sixTeamSelections, [pool.key]: { bye: dto.byeRegistrationId ?? view.automaticBye, sourceVersion: view.sourceVersion, manual: Boolean(dto.byeRegistrationId), reason: dto.reason.trim() } };
      await syncStageSixTeamsInTx(tx, id, plan);
      await tx.v1Tournament.update({ where: { id }, data: { stagePlan: JSON.parse(JSON.stringify(plan)), stagePlanRevision: { increment: 1 } } });
      await this.admins.logAdminAction(admin, { action: 'tournament.stages.six_team_bye', targetType: 'tournament', targetId: id, reason: dto.reason.trim(), afterJson: { poolKey: pool.key, ...plan.sixTeamSelections[pool.key] } }, tx);
      return { revision: t.stagePlanRevision + 1, ...await loadStageView(tx, id, plan) };
    }, options);
  }

  /** Replace only changed, untouched pools. Other fixture identities and schedules survive. */
  async updateStructure(user: V1AuthUser, id: string, dto: StageStructureDto) {
    const admin = await this.admins.getTournamentMutationAdmin(user.id, { tournamentId: id });
    if (!dto.reason.trim()) return stageInvalid('구성 변경 사유를 입력해 주세요.');
    return this.prisma.$transaction(async tx => {
      const initial = await this.tournament(tx, id); await lockCompetitionForBracketMutationInTx(tx, initial);
      const t = await this.tournament(tx, id); this.mutable(t.status);
      if (t.stagePlanRevision !== dto.expectedRevision) throw stale();
      validateStagePlan(dto.plan, t.teamCount);
      await lockCompetitionFixtureRows(tx, t.kind, id);
      const previous = t.stagePlan as unknown as StoredStagePlan, view = await loadStageView(tx, id, previous);
      const allPools = (plan: StoredStagePlan) => plan.stages.flatMap(stage => stage.pools.map(pool => ({ ...pool, stageKey: stage.key })));
      const before = allPools(previous), after = allPools(dto.plan);
      const shape = (pool: (typeof before)[number]) => JSON.stringify({ stageKey: pool.stageKey, format: pool.format, capacity: pool.capacity, legs: pool.legs, thirdPlace: pool.thirdPlace === true, sixTeamFinalBye: pool.sixTeamFinalBye === true });
      const changed = new Set([...before.filter(pool => !after.some(next => next.key === pool.key && shape(next) === shape(pool))).map(pool => pool.key), ...after.filter(pool => !before.some(old => old.key === pool.key && shape(old) === shape(pool))).map(pool => pool.key)]);
      if (view.pools.some(pool => pool.started) && JSON.stringify(previous.stages.map(s => s.key)) !== JSON.stringify(dto.plan.stages.map(s => s.key))) return stageInvalid('경기가 시작된 뒤에는 단계 순서를 바꿀 수 없어요.');
      for (const pool of view.pools) {
        const next = after.find(p => p.key === pool.key);
        const changedSources = !next || JSON.stringify(next.sources) !== JSON.stringify(pool.sources) || (next.seeding ?? 'fixed') !== (pool.seeding ?? 'fixed') || JSON.stringify(next.sixTeamDirectFinalOrder ?? null) !== JSON.stringify(pool.sixTeamDirectFinalOrder ?? null);
        if (pool.started && (changed.has(pool.key) || changedSources || [...changed].some(key => stagePoolDependsOn(previous, pool.key, key)))) throw new ConflictException({ code: 'BRACKET_LOCKED', message: '변경할 편성이나 연결된 다음 편성에 시작한 경기가 있어요.' });
      }
      const removedFixtureIds = view.pools.filter(pool => changed.has(pool.key)).flatMap(pool => pool.fixtureIds);
      const groupIds = (await tx.v1TournamentGroup.findMany({ where: { tournamentId: id, poolKey: { in: [...changed] } }, select: { id: true } })).map(g => g.id);
      const edges = await tx.v1TournamentMatchAdvancementEdge.findMany({ where: { tournamentId: id }, select: { sourceTeamMatchId: true, targetTeamMatchId: true } });
      if (edges.some(edge => removedFixtureIds.includes(edge.sourceTeamMatchId) !== removedFixtureIds.includes(edge.targetTeamMatchId))) return stageInvalid('다른 편성과 연결된 경기의 연결을 먼저 확인해 주세요.');
      const release = view.pools.filter(pool => changed.has(pool.key)).flatMap(pool => pool.slots.map(slot => ({ slotId: slot.id, registrationId: null })));
      if (release.length) await assignSlotsBatchInTx(tx, { admin, adminContext: this.admins, games: this.games }, release);
      for (const fixtureId of orderFixturesForTeardown(removedFixtureIds, edges)) await softDeleteTournamentFixtureInTx(tx, admin, fixtureId);
      await tx.v1TournamentSlot.deleteMany({ where: { tournamentId: id, groupId: { in: groupIds } } });
      await tx.v1TournamentStanding.deleteMany({ where: { groupId: { in: groupIds } } });
      await tx.v1TournamentGroupTeam.deleteMany({ where: { groupId: { in: groupIds } } });
      await tx.v1TournamentByeSlot.deleteMany({ where: { groupId: { in: groupIds } } });
      for (const groupId of groupIds) await deleteTournamentGroupInTx(tx, admin, groupId);
      const plan: StoredStagePlan = { ...dto.plan, removedFixtures: Object.fromEntries(Object.entries(previous.removedFixtures ?? {}).filter(([, fixture]) => !changed.has(fixture.poolKey) && after.some(pool => pool.key === fixture.poolKey))), assignments: Object.fromEntries(Object.entries(previous.assignments ?? {}).filter(([key]) => !changed.has(key) && after.some(pool => pool.key === key))), automation: { configuredByUserId: user.id }, periodSettings: previous.periodSettings };
      plan.sixTeamSelections = Object.fromEntries(Object.entries(previous.sixTeamSelections ?? {}).filter(([key]) => !changed.has(key) && after.some(pool => pool.key === key && pool.sixTeamFinalBye)));
      if (plan.periodSettings) {
        plan.periodSettings.stages = Object.fromEntries(Object.entries(plan.periodSettings.stages ?? {}).filter(([key]) => plan.stages.some(s => s.key === key)));
        plan.periodSettings.pools = Object.fromEntries(Object.entries(plan.periodSettings.pools ?? {}).filter(([key]) => after.some(p => p.key === key)));
      }
      const generated = view.pools.some(pool => pool.generated);
      if (generated && changed.size) {
        if (!t.competitionConfigVersionId) return stageInvalid('대회 경기 규칙을 먼저 저장해 주세요.');
        const blueprint = planCompetitionStages(plan);
        const includedGroups = new Set(blueprint.groups.filter(group => changed.has(group.poolKey!)).map(group => group.key));
        const fixtures = blueprint.fixtures.filter(fixture => includedGroups.has(fixture.groupKey));
        const includedFixtures = new Set(fixtures.map(fixture => fixture.key));
        const max = await tx.v1TournamentMatchDetails.aggregate({ where: { tournamentId: id, teamMatch: { deletedAt: null } }, _max: { fixtureNumber: true } });
        fixtures.forEach((fixture, index) => { fixture.fixtureNumber = (max._max.fixtureNumber ?? 0) + index + 1; });
        await this.templates.materialize(tx, admin, { ...t, competitionConfigVersionId: t.competitionConfigVersionId }, { groups: blueprint.groups.filter(group => includedGroups.has(group.key)), slots: blueprint.slots.filter(slot => slot.groupKey && includedGroups.has(slot.groupKey)), fixtures, edges: blueprint.edges.filter(edge => includedFixtures.has(edge.sourceFixtureKey) && includedFixtures.has(edge.targetFixtureKey)), byeSlots: blueprint.byeSlots.filter(slot => includedGroups.has(slot.groupKey)) });
      }
      const expected = planCompetitionStages(plan).groups;
      const previousLabels = planCompetitionStages(previous).groups;
      for (const group of await tx.v1TournamentGroup.findMany({ where: { tournamentId: id } })) {
        const label = expected.find(g => g.poolKey === group.poolKey && g.phase === group.phase);
        const oldLabel = previousLabels.find(g => g.poolKey === group.poolKey && g.phase === group.phase);
        if (label && label.name !== group.name && (group.phase === 'group' || changed.has(group.poolKey!) || group.name === oldLabel?.name)) await tx.v1TournamentGroup.update({ where: { id: group.id }, data: { name: label.name } });
      }
      await tx.v1TournamentStageTieBreakSetting.deleteMany({ where: { tournamentId: id, stageKey: { notIn: plan.stages.map(s => s.key) } } });
      await tx.v1Tournament.update({ where: { id }, data: { stagePlan: JSON.parse(JSON.stringify(plan)), stagePlanRevision: { increment: 1 } } });
      await recalculateStandingsInTx(tx, id);
      await this.admins.logAdminAction(admin, { action: 'tournament.stages.structure', targetType: 'tournament', targetId: id, beforeJson: JSON.parse(JSON.stringify(previous)), afterJson: { plan: JSON.parse(JSON.stringify(plan)), reason: dto.reason.trim(), replacedPoolKeys: [...changed], archivedFixtureIds: removedFixtureIds } }, tx);
      if (plan.autoAdvance) await tx.v1OutboxEvent.create({ data: { businessKey: `stage-auto-structure:${id}:${t.stagePlanRevision + 1}`, aggregateType: 'TOURNAMENT', aggregateId: id, type: 'STAGE_AUTO_ADVANCE', payload: { tournamentId: id } } });
      return { revision: t.stagePlanRevision + 1, ...await loadStageView(tx, id, plan) };
    }, options);
  }

  /** Durable worker entry: the tournament lock is acquired before any downstream Game rows. */
  async advanceReadyInTx(tx: Prisma.TransactionClient, id: string): Promise<Array<() => Promise<void>>> {
    const initial = await this.tournament(tx, id);
    await lockCompetitionForBracketMutationInTx(tx, initial);
    const t = await this.tournament(tx, id), plan = t.stagePlan as unknown as StoredStagePlan;
    if ((!plan.autoAdvance && !plan.stages.some(stage => stage.pools.some(pool => pool.sixTeamFinalBye))) || !['open', 'closed', 'in_progress'].includes(t.status)) return [];
    if (!plan.automation?.configuredByUserId) return stageInvalid('자동 진출 설정의 운영자를 확인해 주세요.');
    const user = { id: plan.automation.configuredByUserId } as V1AuthUser;
    const admin = await this.admins.getTournamentMutationAdmin(user.id, { tournamentId: id });
    await lockCompetitionFixtureRows(tx, t.kind, id);
    let changed = await syncStageSixTeamsInTx(tx, id, plan);
    if (changed) await this.admins.logAdminAction(admin, { action: 'tournament.stages.six_team_sync', targetType: 'tournament', targetId: id, afterJson: JSON.parse(JSON.stringify(plan.sixTeamSelections ?? {})) }, tx);
    let view = await loadStageView(tx, id, plan);
    const notices: Array<() => Promise<void>> = [];
    for (const key of view.pools.filter(p => plan.autoAdvance && p.stageIndex > 0).map(p => p.key)) {
      const pool = view.pools.find(p => p.key === key)!;
      // Never silently replace an existing decision, a draft, or an in-progress pool.
      if (!pool.generated || pool.slots.length !== pool.capacity || pool.assigned || pool.started || pool.stale || plan.assignments?.[key] || pool.candidates.some(c => c.length !== 1)) continue;
      const selected = pool.candidates.map(c => c[0]);
      if (new Set(selected).size !== pool.capacity || view.pools.some(p => p.stageKey === pool.stageKey && p.key !== key && p.registrationIds.some(r => r !== null && selected.includes(r)))) continue;
      await assignSlotsBatchInTx(tx, { admin, adminContext: this.admins, games: this.games }, pool.slots.map((s, i) => ({ slotId: s.id, registrationId: selected[i] })));
      plan.assignments = { ...plan.assignments, [key]: { sourceVersion: pool.sourceVersion, registrationIds: selected, reason: '공식 순위 자동 진출', at: new Date().toISOString() } };
      await this.admins.logAdminAction(admin, { action: 'tournament.stages.auto_advance', targetType: 'tournament', targetId: id, afterJson: { poolKey: key, registrationIds: selected, sourceVersion: pool.sourceVersion } }, tx);
      notices.push(async () => { this.notifyAdvanced(id, key, pool.name, selected); });
      changed = true;
      view = await loadStageView(tx, id, plan);
      break; // Bound one durable job to one pool's roster writes.
    }
    if (changed) {
      await tx.v1Tournament.update({ where: { id }, data: { stagePlan: JSON.parse(JSON.stringify(plan)), stagePlanRevision: { increment: 1 } } });
      await recalculateStandingsInTx(tx, id);
      await tx.v1OutboxEvent.create({ data: { businessKey: `stage-auto-followup:${id}:${t.stagePlanRevision + 1}`, aggregateType: 'TOURNAMENT', aggregateId: id, type: 'STAGE_AUTO_ADVANCE', payload: { tournamentId: id } } });
    }
    return notices;
  }

  private notifyAdvanced(id: string, poolKey: string, poolName: string, registrations: string[]) {
    registrations.forEach((registrationId, i) => this.notifications?.emitToManyDeferred(async () => {
      const rows = await this.prisma.v1TeamMembership.findMany({ where: { status: 'active', role: { in: ['owner', 'manager'] }, team: { tournamentRegistrations: { some: { id: registrationId } } } }, select: { userId: true } });
      return [...new Set(rows.map(r => r.userId))];
    }, 'tournament_finals_advanced', id, `${poolName} · ${i + 1}번 자리로 진출했어요.`, { businessKey: `tournament-stage-advanced:${id}:${poolKey}:${registrationId}` }));
  }

  async randomize(user: V1AuthUser, id: string, dto: StageVersionDto) {
    const admin = await this.admins.getTournamentMutationAdmin(user.id, { tournamentId: id });
    return this.prisma.$transaction(async tx => {
      const initial = await this.tournament(tx, id); await lockCompetitionForBracketMutationInTx(tx, initial);
      const t = await this.tournament(tx, id); this.mutable(t.status); if (t.stagePlanRevision !== dto.expectedRevision) throw stale();
      await lockCompetitionFixtureRows(tx, t.kind, id);
      const config = t.stagePlan as unknown as StoredStagePlan, view = await loadStageView(tx, id, config);
      const pools = view.pools.filter(p => p.stageIndex === 0);
      if (pools.some(p => p.started)) throw new ConflictException({ code: 'BRACKET_LOCKED', message: '첫 단계에 시작했거나 기록이 있는 경기가 있어 무작위 배정할 수 없어요.' });
      if (pools.some(p => !p.generated) || view.registrations.length !== t.teamCount) return stageInvalid('첫 단계 대진을 만들고 전체 참가팀이 확정된 시작 전 상태에서 배정해 주세요.');
      const ids = view.registrations.map(r => r.id);
      for (let i = ids.length - 1; i > 0; i--) { const j = randomInt(i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
      let offset = 0;
      // Release the whole stage before moving teams between its pools.
      await assignSlotsBatchInTx(tx, { admin, adminContext: this.admins, games: this.games }, pools.flatMap(p => p.slots.map(s => ({ slotId: s.id, registrationId: null }))));
      for (const pool of pools) {
        const selected = ids.slice(offset, offset + pool.capacity); offset += pool.capacity;
        await assignSlotsBatchInTx(tx, { admin, adminContext: this.admins, games: this.games }, pool.slots.map((s, i) => ({ slotId: s.id, registrationId: selected[i] })));
        config.assignments = { ...config.assignments, [pool.key]: { registrationIds: selected, sourceVersion: pool.sourceVersion, reason: '첫 단계 무작위 배정', at: new Date().toISOString() } };
      }
      await tx.v1Tournament.update({ where: { id }, data: { stagePlan: JSON.parse(JSON.stringify(config)), stagePlanRevision: { increment: 1 } } });
      await recalculateStandingsInTx(tx, id);
      await this.admins.logAdminAction(admin, { action: 'tournament.stages.randomize', targetType: 'tournament', targetId: id, afterJson: { registrationIds: ids } }, tx);
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
