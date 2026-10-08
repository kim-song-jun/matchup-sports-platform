import { randomInt } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, type V1CompetitionKind, type V1TournamentSlotKind } from '@prisma/client';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminContextService, type V1ActiveAdmin } from '../../common/admin-context.service';
import { GamesService } from '../../games/games.service';
import { lockGameRows } from '../../games/roster/game-row-lock';
import { PrismaService } from '../../prisma/prisma.service';
import { assignTournamentFixtureSideInTx, releaseUnusedGroupTeamsInTx } from '../tournament-bracket-tx';
import { adminBracketSlotInclude, serializeAdminBracketSlot } from './admin-bracket-view';
import { ALL_COMPETITION_KINDS, findTournamentOnSurface } from '../tournament-surface-lookup';
import { syncByeSlotInTx } from './bye-slot-sync';
import { lockCompetitionForBracketMutationInTx } from './competition-bracket-lock';
import { pickRandomAssignments } from './random-assignment';
import { assertSlotFixturesNotStarted, loadSlotUsingFixtures, sidesUsingSlot } from './slot-fixtures';

type Tx = Prisma.TransactionClient;

export type SlotMutationContext = {
  admin: V1ActiveAdmin;
  adminContext: AdminContextService;
  games: GamesService;
};

export type GroupTeamRelease = { groupId: string; registrationId: string };

/** 후보를 조별로 모아 조마다 한 번씩 해제한다 — 모든 자리 변경이 끝난 뒤에만 부른다. */
async function releaseGroupTeams(tx: Tx, ctx: SlotMutationContext, tournamentId: string, releases: readonly GroupTeamRelease[]): Promise<void> {
  const byGroup = new Map<string, string[]>();
  for (const { groupId, registrationId } of releases) byGroup.set(groupId, [...(byGroup.get(groupId) ?? []), registrationId]);
  for (const [groupId, registrationIds] of byGroup) {
    await releaseUnusedGroupTeamsInTx(tx, ctx.admin, tournamentId, groupId, registrationIds);
  }
}

// 자리 하나가 경기 수십 개에 닿고 조 편성은 순위 재계산까지 한다 — 템플릿 실행기와 같은 상한.
const SLOT_TRANSACTION_OPTIONS = { timeout: 45_000, maxWait: 5_000 } as const;

const slotNotFound = () => new NotFoundException({ code: 'SLOT_NOT_FOUND', message: '자리를 찾을 수 없어요.' });
const alreadyPlaced = () =>
  new ConflictException({ code: 'SLOT_TEAM_ALREADY_PLACED', message: '이미 다른 자리에 들어간 팀이에요.' });

/**
 * 정규 리그 사이드 배정(`assignLeagueFixtureSideInTx`)은 PR-5a 가 들여온다. 그 전에는 리그 자리를 만드는 경로가
 * 없으므로 이 분기에 닿지 않지만, 닿으면 대회용 배정이 리그 경기에 조용히 잘못 도는 것보다 막는 편이 낫다.
 * PR-5a 가 이 함수 한 곳을 리그 분기로 바꾼다.
 */
function assertTournamentLane(kind: V1CompetitionKind | null): void {
  if (kind === 'regular_league') {
    throw new ConflictException({ code: 'SLOT_LEAGUE_NOT_SUPPORTED_YET', message: '정규 리그 자리 배정은 아직 지원하지 않아요.' });
  }
}

async function assertPlaceable(
  tx: Tx,
  slot: { id: string; tournamentId: string; kind: V1TournamentSlotKind },
  registrationId: string,
): Promise<void> {
  const registration = await tx.v1TournamentRegistration.findFirst({
    where: { id: registrationId, tournamentId: slot.tournamentId },
    select: { status: true },
  });
  if (registration === null || registration.status !== 'confirmed') {
    throw new UnprocessableEntityException({
      code: 'SLOT_REGISTRATION_INVALID',
      message: '이 대회에서 확정된 팀만 자리에 넣을 수 있어요.',
    });
  }
  // ENTRY 와 BYE 는 한 팀이 동시에 차지할 수 없다 — 유일 제약은 같은 kind 끼리만 막으므로 서비스가 교차로 막는다.
  const exclusiveKinds: V1TournamentSlotKind[] = slot.kind === 'GROUP_RANK' ? ['GROUP_RANK'] : ['ENTRY', 'BYE'];
  const placed = await tx.v1TournamentSlot.findFirst({
    where: { tournamentId: slot.tournamentId, registrationId, kind: { in: exclusiveKinds }, id: { not: slot.id } },
    select: { id: true },
  });
  if (placed !== null) throw alreadyPlaced();
}

async function assignSlotCore(
  tx: Tx,
  ctx: SlotMutationContext,
  slotId: string,
  registrationId: string | null,
  releases: GroupTeamRelease[],
): Promise<{ tournamentId: string; fixtureIds: string[] }> {
  const slot = await tx.v1TournamentSlot.findUnique({
    where: { id: slotId },
    select: { id: true, tournamentId: true, kind: true, groupId: true, position: true, registrationId: true },
  });
  if (slot === null) throw slotNotFound();
  const competition = await findTournamentOnSurface(tx, ALL_COMPETITION_KINDS, {
    where: { id: slot.tournamentId, deletedAt: null },
    select: { id: true, kind: true },
  });
  if (competition === null) {
    throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
  }
  assertTournamentLane(competition.kind);
  if (slot.registrationId === registrationId) return { tournamentId: slot.tournamentId, fixtureIds: [] };
  if (registrationId !== null) await assertPlaceable(tx, slot, registrationId);

  const fixtures = await loadSlotUsingFixtures(tx, [slot.id]);
  assertSlotFixturesNotStarted(fixtures);
  // 게임 행을 id 순으로 먼저 잡는다 — 결과 확정·명단 워커와 같은 순서라 교착하지 않는다.
  await lockGameRows(tx, fixtures.flatMap((fixture) => (fixture.game === null ? [] : [fixture.game.id])));

  try {
    await tx.v1TournamentSlot.update({ where: { id: slot.id }, data: { registrationId } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw alreadyPlaced();
    throw error;
  }
  if (slot.kind === 'BYE') await syncByeSlotInTx(tx, slot, registrationId);
  for (const fixture of fixtures) {
    if (fixture.groupPhase === 'group' && fixture.groupId !== null && slot.registrationId !== null) {
      releases.push({ groupId: fixture.groupId, registrationId: slot.registrationId });
    }
    for (const side of sidesUsingSlot(fixture, slot.id)) {
      await assignTournamentFixtureSideInTx(tx, ctx, ctx.admin, { fixtureId: fixture.id, side, registrationId });
    }
  }
  const fixtureIds = fixtures.map((fixture) => fixture.id);
  await ctx.adminContext.logAdminAction(
    ctx.admin,
    {
      action: 'tournament.slot.assign',
      targetType: 'tournament_slot',
      targetId: slot.id,
      beforeJson: { registrationId: slot.registrationId },
      afterJson: { registrationId, teamMatchIds: fixtureIds },
    },
    tx,
  );
  return { tournamentId: slot.tournamentId, fixtureIds };
}

/**
 * 자리 하나를 바꾸고 그 자리를 쓰는 경기 전부에 반영한다. **호출자가 이미
 * `lockCompetitionForBracketMutationInTx` 를 잡은 트랜잭션**에서만 부른다. 영향 경기 id(오름차순)를 돌려준다.
 */
export async function assignSlotInTx(
  tx: Tx,
  ctx: SlotMutationContext,
  slotId: string,
  registrationId: string | null,
): Promise<string[]> {
  const releases: GroupTeamRelease[] = [];
  const { tournamentId, fixtureIds } = await assignSlotCore(tx, ctx, slotId, registrationId, releases);
  await releaseGroupTeams(tx, ctx, tournamentId, releases);
  return fixtureIds;
}

export type SlotChange = { slotId: string; registrationId: string | null };

/**
 * 여러 자리를 한 번에 바꾼다(맞바꾸기·무작위 채우기·순위대로 채우기). 바뀔 자리를 **먼저 모두 비운 뒤** 새 값을
 * 넣어 같은 팀이 두 자리에 겹치는 순간을 만들지 않고, 이전 팀의 조 편성 해제는 마지막에 한 번만 판정한다.
 * `assignSlotInTx` 와 같이 호출자가 레인 잠금을 이미 잡은 트랜잭션에서 부른다.
 */
export async function assignSlotsBatchInTx(
  tx: Tx,
  ctx: SlotMutationContext,
  changes: readonly SlotChange[],
): Promise<string[]> {
  if (changes.length === 0) return [];
  const slotIds = changes.map((change) => change.slotId);
  if (new Set(slotIds).size !== slotIds.length) {
    throw new UnprocessableEntityException({ code: 'SLOT_CHANGE_DUPLICATED', message: '같은 자리를 한 번에 두 번 바꿀 수 없어요.' });
  }
  const rows = await tx.v1TournamentSlot.findMany({
    where: { id: { in: slotIds } },
    select: { id: true, tournamentId: true, registrationId: true },
  });
  if (rows.length !== slotIds.length) throw slotNotFound();
  const tournamentIds = new Set(rows.map((row) => row.tournamentId));
  if (tournamentIds.size > 1) {
    throw new UnprocessableEntityException({ code: 'SLOT_CHANGE_CROSS_TOURNAMENT', message: '한 번에 한 대회의 자리만 바꿀 수 있어요.' });
  }
  const tournamentId = rows[0].tournamentId;
  const current = new Map(rows.map((row) => [row.id, row.registrationId]));
  const ordered = [...changes].sort((a, b) => (a.slotId < b.slotId ? -1 : a.slotId > b.slotId ? 1 : 0));

  // 게임 행을 한꺼번에 id 순으로 잡아 자리마다 따로 잡을 때 생기는 순서 뒤섞임을 없앤다.
  const fixtures = await loadSlotUsingFixtures(tx, slotIds);
  await lockGameRows(tx, fixtures.flatMap((fixture) => (fixture.game === null ? [] : [fixture.game.id])));

  const releases: GroupTeamRelease[] = [];
  const affected = new Set<string>();
  for (const change of ordered) {
    const before = current.get(change.slotId) ?? null;
    if (before !== null && before !== change.registrationId) {
      (await assignSlotCore(tx, ctx, change.slotId, null, releases)).fixtureIds.forEach((id) => affected.add(id));
    }
  }
  for (const change of ordered) {
    if (change.registrationId === null) continue;
    (await assignSlotCore(tx, ctx, change.slotId, change.registrationId, releases)).fixtureIds.forEach((id) => affected.add(id));
  }
  await releaseGroupTeams(tx, ctx, tournamentId, releases);
  return [...affected].sort();
}

@Injectable()
export class TournamentSlotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly games: GamesService,
  ) {}

  private context(admin: V1ActiveAdmin): SlotMutationContext {
    return { admin, adminContext: this.adminContext, games: this.games };
  }

  private async loadCompetition(db: PrismaService | Tx, competitionId: string) {
    const competition = await findTournamentOnSurface(db, ALL_COMPETITION_KINDS, {
      where: { id: competitionId, deletedAt: null },
      select: { id: true, kind: true },
    });
    if (competition === null) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }
    return competition;
  }

  async assignSlot(user: V1AuthUser, slotId: string, registrationId: string | null) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const slot = await this.prisma.v1TournamentSlot.findUnique({ where: { id: slotId }, select: { tournamentId: true } });
    if (slot === null) throw slotNotFound();
    const competition = await this.loadCompetition(this.prisma, slot.tournamentId);
    return this.prisma.$transaction(async (tx) => {
      await lockCompetitionForBracketMutationInTx(tx, competition);
      const affectedTeamMatchIds = await assignSlotInTx(tx, this.context(admin), slotId, registrationId);
      const row = await tx.v1TournamentSlot.findUniqueOrThrow({ where: { id: slotId }, include: adminBracketSlotInclude });
      return { slot: serializeAdminBracketSlot(row), affectedTeamMatchIds };
    }, SLOT_TRANSACTION_OPTIONS);
  }

  async randomFill(user: V1AuthUser, competitionId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const competition = await this.loadCompetition(this.prisma, competitionId);
    assertTournamentLane(competition.kind);
    return this.prisma.$transaction(async (tx) => {
      await lockCompetitionForBracketMutationInTx(tx, competition);
      // 잠금 안에서 다시 읽는다 — 화면이 본 빈 자리가 아니라 지금의 빈 자리·미배치 팀이 기준이다.
      const slotRows = await tx.v1TournamentSlot.findMany({
        where: { tournamentId: competition.id, kind: { in: ['ENTRY', 'BYE'] } },
        select: { id: true, registrationId: true },
        orderBy: { id: 'asc' },
      });
      const placed = slotRows.flatMap((row) => (row.registrationId === null ? [] : [row.registrationId]));
      const candidates = await tx.v1TournamentRegistration.findMany({
        where: { tournamentId: competition.id, status: 'confirmed', id: { notIn: placed } },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      const assignments = pickRandomAssignments(
        slotRows.filter((row) => row.registrationId === null).map((row) => row.id),
        candidates.map((candidate) => candidate.id),
        randomInt,
      );
      await assignSlotsBatchInTx(tx, this.context(admin), assignments);
      await this.adminContext.logAdminAction(
        admin,
        { action: 'tournament.slot.random_fill', targetType: 'tournament', targetId: competition.id, afterJson: { assignments } },
        tx,
      );
      return { assignments };
    }, SLOT_TRANSACTION_OPTIONS);
  }
}
