import { findTournamentManagementAction } from '../../common/tournament-management-history';
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminContextService, type V1TournamentManager } from '../../common/admin-context.service';
import { GamesService } from '../../games/games.service';
import { PrismaService } from '../../prisma/prisma.service';
import { lockCompetitionForBracketMutationInTx, type LockableCompetition } from '../slots/competition-bracket-lock';
import { assignSlotsBatchInTx } from '../slots/tournament-slot.service';
import {
  createEmptyTournamentFixtureInTx, createGroupInTx, deleteTournamentGroupInTx, softDeleteTournamentFixtureInTx,
} from '../tournament-bracket-tx';
import { createTournamentMatchAdvancementEdgeInTx } from '../tournament-match-creation';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from '../tournament-surface-lookup';
import { orderFixturesForTeardown } from './bracket-teardown-order';
import { planBracketTemplate, type BracketTemplateInput, type BracketTemplatePlan } from './bracket-template-plan';
import { ApplyBracketTemplateDto, toBracketTemplateInput } from './dto/bracket-template.dto';

// 경기 최대 240개를 한 트랜잭션에서 만든다. 앞단 ALB idle_timeout(60초)보다 낮게 둔다
// (league-fixture-generator.service.ts 의 TRANSACTION_TIMEOUT_MS 주석과 같은 이유).
const TRANSACTION_OPTIONS = { timeout: 45_000, maxWait: 5_000 } as const;

import { TOURNAMENT_VENUE_SELECT, type TournamentVenueRow } from '../../places/tournament-venue';

type Tx = Prisma.TransactionClient;
type PinnedTournament = {
  id: string; format: string; sportId: string; regionId: string | null; title: string; competitionConfigVersionId: string;
} & TournamentVenueRow;

function lookup(map: ReadonlyMap<string, string>, key: string, what: string): string {
  const id = map.get(key);
  if (id === undefined) throw new Error(`template plan references unknown ${what} ${key}`);
  return id;
}

@Injectable()
export class BracketTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly games: GamesService,
  ) {}

  private async snapshot(tx: Tx, tournamentId: string) {
    const tournament = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, {
      where: { id: tournamentId, deletedAt: null }, select: { id: true, format: true, teamCount: true, competitionConfigVersionId: true },
    });
    if (!tournament) throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    const groups = await tx.v1TournamentGroup.findMany({ where: { tournamentId }, orderBy: { id: 'asc' } });
    const slots = await tx.v1TournamentSlot.findMany({ where: { tournamentId }, orderBy: { id: 'asc' } });
    const fixtures = await tx.v1TournamentMatchDetails.findMany({ where: { tournamentId, teamMatch: { deletedAt: null } },
      include: { teamMatch: { select: { status: true, homeSlotId: true, awaySlotId: true, game: { select: { state: true, currentOfficialRevisionId: true } } } } }, orderBy: { teamMatchId: 'asc' } });
    const registrations = await tx.v1TournamentRegistration.findMany({ where: { tournamentId }, select: { id: true, status: true }, orderBy: { id: 'asc' } });
    const edges = await tx.v1TournamentMatchAdvancementEdge.findMany({ where: { tournamentId }, orderBy: { id: 'asc' } });
    return { tournament, groups, slots, fixtures, registrations, edges };
  }

  private hash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

  private flexibleEnabled(tournamentId: string) {
    const allowed = (process.env.V1_FLEXIBLE_BRACKET_TOURNAMENT_IDS ?? '').split(',').map(id => id.trim());
    return process.env.V1_FLEXIBLE_BRACKETS_ENABLED === 'true' || allowed.includes(tournamentId);
  }

  async capabilities(user: V1AuthUser, tournamentId: string) {
    await this.draft(user, tournamentId);
    const row = await findTournamentOnSurface(this.prisma, TOURNAMENT_KINDS, { where: { id: tournamentId, deletedAt: null }, select: { format: true, teamCount: true } });
    return { flexibleEnabled: this.flexibleEnabled(tournamentId), schemaVersion: 2, sixTeamEligible: row?.format === 'knockout' && row.teamCount === 6 };
  }

  private assertFlexibleEnabled(tournamentId: string, dto: ApplyBracketTemplateDto) {
    if (dto.schemaVersion === 2 && !dto.sixTeamMode && !this.flexibleEnabled(tournamentId)) {
      throw new ConflictException({ code: 'BRACKET_V2_DISABLED', message: '새 대진 설정은 아직 활성화되지 않았어요.' });
    }
  }

  async preview(user: V1AuthUser, tournamentId: string, dto: ApplyBracketTemplateDto) {
    await this.adminContext.getTournamentMutationAdmin(user.id, { tournamentId });
    this.assertFlexibleEnabled(tournamentId, dto);
    const input = toBracketTemplateInput(dto);
    const plan = planBracketTemplate(input, { fixtureNumberOffset: 0 });
    return this.prisma.$transaction(async (tx) => {
      const snapshot = await this.snapshot(tx, tournamentId);
      if (snapshot.tournament.format !== input.kind) throw new UnprocessableEntityException({ code: 'BRACKET_TEMPLATE_FORMAT_MISMATCH', message: '대회 진행 방식과 맞지 않아요.' });
      this.assertSixTeamEligibility(input, snapshot);
      if (input.kind !== 'league' && input.registrationIds) {
        const entries = input.kind === 'knockout' ? plan.slots : plan.slots.filter((slot) => slot.kind === 'ENTRY');
        const confirmed = new Set(snapshot.registrations.filter((row) => row.status === 'confirmed').map((row) => row.id));
        if (input.registrationIds.length !== entries.length || new Set(input.registrationIds).size !== entries.length || input.registrationIds.some((id) => !confirmed.has(id))) {
          throw new UnprocessableEntityException({ code: 'BRACKET_ASSIGNMENT_INVALID', message: '모든 자리에 서로 다른 확정 참가팀을 배정해 주세요.' });
        }
      }
      return { ...plan, counts: { groups: plan.groups.length, slots: plan.slots.length, fixtures: plan.fixtures.length, edges: plan.edges.length },
        previewHash: this.hash({ input, snapshot }), confirmedTeamCount: snapshot.registrations.filter((row) => row.status === 'confirmed').length };
    }, { ...TRANSACTION_OPTIONS, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async draft(user: V1AuthUser, tournamentId: string) {
    await this.adminContext.getTournamentMutationAdmin(user.id, { tournamentId });
    const row = await findTournamentOnSurface(this.prisma, TOURNAMENT_KINDS, { where: { id: tournamentId, deletedAt: null }, select: { bracketDraft: true, bracketDraftRevision: true } });
    if (!row) throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    return { input: row.bracketDraft, revision: row.bracketDraftRevision };
  }

  async saveDraft(user: V1AuthUser, tournamentId: string, dto: ApplyBracketTemplateDto) {
    const admin = await this.adminContext.getTournamentMutationAdmin(user.id, { tournamentId });
    this.assertFlexibleEnabled(tournamentId, dto);
    const input = toBracketTemplateInput(dto);
    planBracketTemplate(input, { fixtureNumberOffset: 0 });
    const expectedRevision = dto.expectedRevision;
    if (expectedRevision === undefined) throw new ConflictException({ code: 'BRACKET_DRAFT_STALE', message: '초안을 먼저 불러와 주세요.' });
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.v1Tournament.updateMany({ where: { id: tournamentId, deletedAt: null, kind: { in: [...TOURNAMENT_KINDS] }, format: input.kind, bracketDraftRevision: expectedRevision },
        data: { bracketDraft: JSON.parse(JSON.stringify(input)), bracketDraftRevision: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException({ code: 'BRACKET_DRAFT_STALE', message: '다른 관리자가 설정을 바꿨어요. 초안을 다시 불러와 주세요.' });
      await this.adminContext.logAdminAction(admin, { action: 'tournament.bracket.draft.save', targetType: 'tournament', targetId: tournamentId,
        afterJson: { revision: expectedRevision + 1 } }, tx);
      return { input, revision: expectedRevision + 1 };
    });
  }

  async requestStatus(user: V1AuthUser, tournamentId: string, requestId: string) {
    await this.draft(user, tournamentId);
    const row = await findTournamentManagementAction(this.prisma, { targetType: 'tournament', targetId: tournamentId,
      action: 'tournament.bracket.template.apply', afterJson: { path: ['requestId'], equals: requestId } });
    return { completed: row !== null, result: row?.afterJson ?? null };
  }

  async apply(user: V1AuthUser, tournamentId: string, dto: ApplyBracketTemplateDto) {
    const admin = await this.adminContext.getTournamentMutationAdmin(user.id, { tournamentId });
    this.assertFlexibleEnabled(tournamentId, dto);
    const input = toBracketTemplateInput(dto);
    const tournament = await findTournamentOnSurface(this.prisma, TOURNAMENT_KINDS, {
      where: { id: tournamentId, deletedAt: null },
      select: { id: true, format: true, kind: true },
    });
    if (tournament === null) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }
    if (tournament.format !== input.kind) {
      throw new UnprocessableEntityException({
        code: 'BRACKET_TEMPLATE_FORMAT_MISMATCH',
        message: '대회 진행 방식과 맞지 않는 템플릿이에요.',
      });
    }
    // 잠금을 잡기 전에 422(범위 밖·상한 초과)를 먼저 낸다. 번호 offset 은 잠금 안에서 다시 정한다.
    planBracketTemplate(input, { fixtureNumberOffset: 0 });

    return this.prisma.$transaction(
      (tx) => this.applyInTx(tx, admin, tournament, input, dto.replaceExisting ?? false, dto),
      TRANSACTION_OPTIONS,
    );
  }

  private async applyInTx(
    tx: Tx,
    admin: V1TournamentManager,
    tournament: LockableCompetition,
    input: BracketTemplateInput,
    replaceExisting: boolean,
    dto: ApplyBracketTemplateDto,
  ) {
    await lockCompetitionForBracketMutationInTx(tx, tournament);
    const requestHash = this.hash({ input, replaceExisting });
    if (input.kind !== 'league' && input.schemaVersion === 2 && (!dto.requestId || !dto.previewHash)) {
      throw new ConflictException({ code: 'BRACKET_PREVIEW_REQUIRED', message: '미리보기를 확인한 뒤 생성해 주세요.' });
    }
    if (dto.requestId) {
      const previous = await findTournamentManagementAction(tx, { targetType: 'tournament', targetId: tournament.id,
        action: 'tournament.bracket.template.apply', afterJson: { path: ['requestId'], equals: dto.requestId } });
      const saved = previous?.afterJson as { requestHash?: string; groups: number; slots: number; fixtures: number; edges: number } | undefined;
      if (saved) {
        if (saved.requestHash !== requestHash) throw new ConflictException({ code: 'BRACKET_REQUEST_CONFLICT', message: '같은 생성 요청의 설정이 바뀌었어요.' });
        return { groups: saved.groups, slots: saved.slots, fixtures: saved.fixtures, edges: saved.edges };
      }
    }
    const pinned = await this.loadPinnedTournament(tx, tournament.id);
    if (pinned.format !== input.kind) {
      throw new UnprocessableEntityException({
        code: 'BRACKET_TEMPLATE_FORMAT_MISMATCH',
        message: '대회 진행 방식과 맞지 않는 템플릿이에요.',
      });
    }

    if (dto.previewHash && dto.previewHash !== this.hash({ input, snapshot: await this.snapshot(tx, tournament.id) })) {
      throw new ConflictException({ code: 'BRACKET_PREVIEW_STALE', message: '대회나 대진이 바뀌었어요. 미리보기를 다시 확인해 주세요.' });
    }
    const existing = await this.loadExisting(tx, tournament.id);
    let replaced = false;
    if (!existing.isEmpty) {
      if (!replaceExisting) {
        throw new ConflictException({ code: 'BRACKET_NOT_EMPTY', message: '이미 대진이 있어요. 비어 있는 대진에서만 템플릿으로 시작할 수 있어요.' });
      }
      this.assertReplaceable(existing.fixtures);
      await this.teardown(tx, admin, tournament.id, existing);
      replaced = true;
    }

    const maxNumber = await tx.v1TournamentMatchDetails.aggregate({
      where: { tournamentId: tournament.id, teamMatch: { deletedAt: null } },
      _max: { fixtureNumber: true },
    });
    const plan = planBracketTemplate(input, { fixtureNumberOffset: maxNumber._max.fixtureNumber ?? 0 });
    if (plan.warnings?.length && !dto.acknowledgeRematches) throw new ConflictException({ code: 'BRACKET_REMATCH_CONFIRMATION_REQUIRED', message: '같은 조 재대결 안내를 확인해 주세요.' });
    if (input.kind !== 'league' && input.sixTeamMode) this.assertSixTeamEligibility(input, await this.snapshot(tx, tournament.id));
    const { slotIds, fixtureIds } = await this.materialize(tx, admin, pinned, plan);
    if (input.kind !== 'league' && input.registrationIds) {
      const entries = input.kind === 'knockout' ? [...plan.slots].sort((a, b) => a.position - b.position)
        : plan.slots.filter((slot) => slot.kind === 'ENTRY');
      if (entries.length !== input.registrationIds.length || new Set(input.registrationIds).size !== entries.length) {
        throw new UnprocessableEntityException({ code: 'BRACKET_ASSIGNMENT_INVALID', message: '모든 참가 자리에 서로 다른 팀을 배정해 주세요.' });
      }
      await assignSlotsBatchInTx(tx, { admin, adminContext: this.adminContext, games: this.games }, entries.map((slot, index) => ({
        slotId: lookup(slotIds, slot.key, 'slot'), registrationId: input.registrationIds![index],
      })));
    }

    await tx.v1Tournament.update({ where: { id: tournament.id }, data: { sixTeamMode: input.kind !== 'league' && Boolean(input.sixTeamMode), sixTeamBracket: input.kind !== 'league' && input.sixTeamMode
      ? { rounds: plan.fixtures.map(row => lookup(fixtureIds, row.key, 'fixture')), winners: {}, bye: null, manual: false, sourceVersion: null, needsReview: false } : Prisma.DbNull } });
    const counts = { groups: plan.groups.length, slots: plan.slots.length, fixtures: plan.fixtures.length, edges: plan.edges.length };
    await this.adminContext.logAdminAction(admin, {
      action: 'tournament.bracket.template.apply',
      targetType: 'tournament',
      targetId: tournament.id,
      afterJson: JSON.parse(JSON.stringify({ input, replaced, ...counts, requestId: dto.requestId, requestHash, acknowledgeRematches: dto.acknowledgeRematches })),
    }, tx);
    return counts;
  }

  private assertSixTeamEligibility(input: BracketTemplateInput, snapshot: Awaited<ReturnType<BracketTemplateService['snapshot']>>) {
    if (input.kind === 'league' || !input.sixTeamMode) return;
    if (snapshot.tournament.format !== 'knockout' || snapshot.tournament.teamCount !== 6 || snapshot.registrations.filter(row => row.status === 'confirmed').length !== 6 || input.registrationIds?.length !== 6) {
      throw new UnprocessableEntityException({ code: 'SIX_TEAM_REGISTRATIONS_REQUIRED', message: '모집 정원이 6팀인 토너먼트에서 확정팀 6팀을 모두 배정해 주세요.' });
    }
  }

  /** 잠금 안에서 다시 읽는다 — 경기 규칙 버전이 없으면 아무것도 지우거나 만들기 전에 끊는다. */
  private async loadPinnedTournament(tx: Tx, tournamentId: string): Promise<PinnedTournament> {
    const pinned = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, {
      where: { id: tournamentId, deletedAt: null },
      select: { id: true, format: true, sportId: true, regionId: true, ...TOURNAMENT_VENUE_SELECT, title: true, competitionConfigVersionId: true },
    });
    if (pinned === null) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }
    if (pinned.competitionConfigVersionId === null) {
      throw new ConflictException({ code: 'COMPETITION_CONFIG_REQUIRED', message: '대회 경기에는 활성 경기 규칙 버전이 필요해요.' });
    }
    return { ...pinned, competitionConfigVersionId: pinned.competitionConfigVersionId };
  }

  private async loadExisting(tx: Tx, tournamentId: string) {
    const fixtures = await tx.v1TournamentMatchDetails.findMany({
      where: { tournamentId, teamMatch: { deletedAt: null } },
      select: {
        teamMatchId: true,
        teamMatch: { select: { status: true, game: { select: { state: true, currentOfficialRevisionId: true } } } },
      },
      orderBy: { teamMatchId: 'asc' },
    });
    const groups = await tx.v1TournamentGroup.findMany({ where: { tournamentId }, select: { id: true }, orderBy: { id: 'asc' } });
    const slotCount = await tx.v1TournamentSlot.count({ where: { tournamentId } });
    return { fixtures, groups, isEmpty: fixtures.length === 0 && groups.length === 0 && slotCount === 0 };
  }

  /** 하나라도 시작·결과가 있으면 아무것도 지우기 전에 끊는다. */
  private assertReplaceable(fixtures: Awaited<ReturnType<BracketTemplateService['loadExisting']>>['fixtures']) {
    const locked = fixtures.filter(({ teamMatch }) =>
      teamMatch.status !== 'matched' ||
      teamMatch.game === null ||
      teamMatch.game.state !== 'SCHEDULED' ||
      teamMatch.game.currentOfficialRevisionId !== null);
    if (locked.length > 0) {
      throw new ConflictException({
        code: 'BRACKET_LOCKED',
        message: '시작했거나 결과가 있는 경기가 있어 대진을 새로 만들 수 없어요.',
        details: { lockedFixtureCount: locked.length },
      });
    }
  }

  /** 스펙 S2 순서: 경기(하류 먼저) → 자리 → GroupTeam·Standing·ByeSlot → 조. */
  private async teardown(
    tx: Tx,
    admin: V1TournamentManager,
    tournamentId: string,
    existing: Awaited<ReturnType<BracketTemplateService['loadExisting']>>,
  ) {
    const edges = await tx.v1TournamentMatchAdvancementEdge.findMany({
      where: { tournamentId },
      select: { sourceTeamMatchId: true, targetTeamMatchId: true },
    });
    for (const fixtureId of orderFixturesForTeardown(existing.fixtures.map((fixture) => fixture.teamMatchId), edges)) {
      await softDeleteTournamentFixtureInTx(tx, admin, fixtureId);
    }
    await tx.v1TournamentSlot.deleteMany({ where: { tournamentId } });
    await tx.v1TournamentStanding.deleteMany({ where: { group: { tournamentId } } });
    await tx.v1TournamentGroupTeam.deleteMany({ where: { group: { tournamentId } } });
    await tx.v1TournamentByeSlot.deleteMany({ where: { group: { tournamentId } } });
    for (const group of existing.groups) await deleteTournamentGroupInTx(tx, admin, group.id);
  }

  private async materialize(tx: Tx, admin: V1TournamentManager, tournament: PinnedTournament, plan: BracketTemplatePlan) {
    const groupIds = new Map<string, string>();
    for (const group of plan.groups) {
      const created = await createGroupInTx(tx, admin, tournament.id, {
        name: group.name, phase: group.phase, sortOrder: group.sortOrder, advanceCount: group.advanceCount,
      });
      groupIds.set(group.key, created.id);
    }

    const slotIds = new Map<string, string>();
    await tx.v1TournamentSlot.createMany({
      data: plan.slots.map((slot) => {
        const id = randomUUID();
        slotIds.set(slot.key, id);
        return {
          id,
          tournamentId: tournament.id,
          kind: slot.kind,
          groupId: slot.groupKey === null ? null : lookup(groupIds, slot.groupKey, 'group'),
          position: slot.position,
          byeSortOrder: slot.byeSortOrder ?? (slot.kind === 'BYE' ? (slot.position - 1) * 2 : null),
          sourceGroupId: slot.sourceGroupKey === null ? null : lookup(groupIds, slot.sourceGroupKey, 'group'),
        };
      }),
    });
    await tx.v1TournamentByeSlot.createMany({
      data: plan.byeSlots.map((bye) => ({ groupId: lookup(groupIds, bye.groupKey, 'group'), sortOrder: bye.sortOrder })),
    });

    const fixtureIds = new Map<string, string>();
    for (const fixture of [...plan.fixtures].sort((a, b) => a.fixtureNumber - b.fixtureNumber)) {
      const created = await createEmptyTournamentFixtureInTx(tx, { games: this.games }, admin, {
        tournament,
        groupId: lookup(groupIds, fixture.groupKey, 'group'),
        round: fixture.round,
        fixtureNumber: fixture.fixtureNumber,
        legNumber: fixture.legNumber,
        homeSlotId: fixture.homeSlotKey === null ? null : lookup(slotIds, fixture.homeSlotKey, 'slot'),
        awaySlotId: fixture.awaySlotKey === null ? null : lookup(slotIds, fixture.awaySlotKey, 'slot'),
      });
      fixtureIds.set(fixture.key, created.id);
    }
    for (const edge of plan.edges) {
      await createTournamentMatchAdvancementEdgeInTx(tx, {
        tournamentId: tournament.id,
        sourceTeamMatchId: lookup(fixtureIds, edge.sourceFixtureKey, 'fixture'),
        sourceOutcome: edge.outcome,
        targetTeamMatchId: lookup(fixtureIds, edge.targetFixtureKey, 'fixture'),
        targetSide: edge.targetSide,
      });
    }
    return { slotIds, fixtureIds };
  }
}
