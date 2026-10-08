import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminContextService, type V1ActiveAdmin } from '../../common/admin-context.service';
import { GamesService } from '../../games/games.service';
import { PrismaService } from '../../prisma/prisma.service';
import { lockCompetitionForBracketMutationInTx, type LockableCompetition } from '../slots/competition-bracket-lock';
import { createEmptyTournamentFixtureInTx, createGroupInTx } from '../tournament-bracket-tx';
import { createTournamentMatchAdvancementEdgeInTx } from '../tournament-match-creation';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from '../tournament-surface-lookup';
import { planBracketTemplate, type BracketTemplateInput, type BracketTemplatePlan } from './bracket-template-plan';
import { ApplyBracketTemplateDto, toBracketTemplateInput } from './dto/bracket-template.dto';

// 경기 최대 240개를 한 트랜잭션에서 만든다. 앞단 ALB idle_timeout(60초)보다 낮게 둔다
// (league-fixture-generator.service.ts 의 TRANSACTION_TIMEOUT_MS 주석과 같은 이유).
const TRANSACTION_OPTIONS = { timeout: 45_000, maxWait: 5_000 } as const;

type Tx = Prisma.TransactionClient;
type PinnedTournament = {
  id: string; sportId: string; regionId: string | null; venue: string | null; title: string; competitionConfigVersionId: string;
};

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

  async apply(user: V1AuthUser, tournamentId: string, dto: ApplyBracketTemplateDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
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
      (tx) => this.applyInTx(tx, admin, tournament, input, dto.replaceExisting ?? false),
      TRANSACTION_OPTIONS,
    );
  }

  private async applyInTx(
    tx: Tx,
    admin: V1ActiveAdmin,
    tournament: LockableCompetition,
    input: BracketTemplateInput,
    replaceExisting: boolean,
  ) {
    await lockCompetitionForBracketMutationInTx(tx, tournament);
    const pinned = await this.loadPinnedTournament(tx, tournament.id);

    const existing = await this.loadExisting(tx, tournament.id);
    if (!existing.isEmpty) {
      // replaceExisting 교체는 Task 6 에서 이 분기에 들어온다.
      throw new ConflictException({ code: 'BRACKET_NOT_EMPTY', message: '이미 대진이 있어요. 비어 있는 대진에서만 템플릿으로 시작할 수 있어요.' });
    }

    const maxNumber = await tx.v1TournamentMatchDetails.aggregate({
      where: { tournamentId: tournament.id, teamMatch: { deletedAt: null } },
      _max: { fixtureNumber: true },
    });
    const plan = planBracketTemplate(input, { fixtureNumberOffset: maxNumber._max.fixtureNumber ?? 0 });
    await this.materialize(tx, admin, pinned, plan);

    const counts = { groups: plan.groups.length, slots: plan.slots.length, fixtures: plan.fixtures.length, edges: plan.edges.length };
    await this.adminContext.logAdminAction(admin, {
      action: 'tournament.bracket.template.apply',
      targetType: 'tournament',
      targetId: tournament.id,
      afterJson: { input: { ...input }, replaced: false, ...counts },
    }, tx);
    return counts;
  }

  /** 잠금 안에서 다시 읽는다 — 경기 규칙 버전이 없으면 아무것도 지우거나 만들기 전에 끊는다. */
  private async loadPinnedTournament(tx: Tx, tournamentId: string): Promise<PinnedTournament> {
    const pinned = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, {
      where: { id: tournamentId, deletedAt: null },
      select: { id: true, sportId: true, regionId: true, venue: true, title: true, competitionConfigVersionId: true },
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

  private async materialize(tx: Tx, admin: V1ActiveAdmin, tournament: PinnedTournament, plan: BracketTemplatePlan) {
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
  }
}
