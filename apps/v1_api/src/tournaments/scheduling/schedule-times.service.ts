import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminContextService } from '../../common/admin-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { findTournamentOnSurface, TOURNAMENT_KINDS, LEAGUE_KINDS } from '../tournament-surface-lookup';
import { CreateScheduleTimeDto, UpdateScheduleTimeDto } from './schedule-times.dto';
import { lockCompetitionFieldMatches } from '../../places/competition-field-place';
import { updateTournamentMatchInTx } from '../tournament-match-update';
import { assertFixtureScheduleKeepsStageOrder } from '../tournament-schedule-order';

@Injectable()
export class ScheduleTimesService {
  constructor(private readonly prisma: PrismaService, private readonly admins: AdminContextService) {}

  private async assertCompetition(db: PrismaService | Prisma.TransactionClient, id: string, surface: 'tournaments' | 'league-matches') {
    const tournament = await findTournamentOnSurface(db, surface === 'league-matches' ? LEAGUE_KINDS : TOURNAMENT_KINDS, {
      where: { id, deletedAt: null }, select: { id: true, format: true },
    });
    if (!tournament) throw new NotFoundException({ code: 'NOT_FOUND', message: '대회를 찾지 못했어요.' });
    if (surface === 'tournaments' && tournament.format !== 'league_knockouts') {
      throw new ConflictException({ code: 'SCHEDULE_TIMES_FORMAT_UNSUPPORTED', message: '정규리그 + N개 토너먼트에서 사용하는 시간 목록이에요.' });
    }
  }

  async list(user: V1AuthUser, tournamentId: string, surface: 'tournaments' | 'league-matches' = 'tournaments') {
    if (surface === 'league-matches') await this.admins.getActiveAdmin(user.id);
    else await this.admins.getTournamentAdmin(user.id, { tournamentId });
    await this.assertCompetition(this.prisma, tournamentId, surface);
    return { items: await this.prisma.v1TournamentScheduleTime.findMany({ where: { tournamentId }, orderBy: { scheduledAt: 'asc' } }) };
  }

  async create(user: V1AuthUser, tournamentId: string, dto: CreateScheduleTimeDto, surface: 'tournaments' | 'league-matches' = 'tournaments') {
    return this.prisma.$transaction(async tx => {
      const admin = surface === 'league-matches'
        ? await this.admins.getMutationAdmin(user.id, tx)
        : await this.admins.getTournamentMutationAdmin(user.id, { tournamentId }, tx);
      await this.assertCompetition(tx, tournamentId, surface);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${tournamentId}`}, 0))`;
      const scheduledAt = new Date(dto.scheduledAt);
      // A repeated add is safe, including two operators adding the same instant concurrently.
      const created = await tx.v1TournamentScheduleTime.createMany({
        data: [{ id: randomUUID(), tournamentId, scheduledAt }], skipDuplicates: true,
      });
      const item = await tx.v1TournamentScheduleTime.findUniqueOrThrow({ where: { tournamentId_scheduledAt: { tournamentId, scheduledAt } } });
      if (created.count) await this.admins.logAdminAction(admin, {
        action: surface === 'league-matches' ? 'league.schedule_time.create' : 'tournament.schedule_time.create', targetType: surface === 'league-matches' ? 'league' : 'tournament', targetId: tournamentId,
        afterJson: { id: item.id, scheduledAt: scheduledAt.toISOString() },
      }, tx);
      return { item };
    });
  }

  async update(user: V1AuthUser, tournamentId: string, dto: UpdateScheduleTimeDto, surface: 'tournaments' | 'league-matches' = 'tournaments') {
    return this.prisma.$transaction(async tx => {
      const admin = surface === 'league-matches'
        ? await this.admins.getMutationAdmin(user.id, tx)
        : await this.admins.getTournamentMutationAdmin(user.id, { tournamentId }, tx);
      await this.assertCompetition(tx, tournamentId, surface);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${tournamentId}`}, 0))`;
      // Same Game -> TeamMatch order as match writers; a game cannot start during a bulk move.
      await lockCompetitionFieldMatches(tx, tournamentId);
      const previous = new Date(dto.expectedScheduledAt);
      const next = new Date(dto.scheduledAt);
      const existing = await tx.v1TournamentScheduleTime.findUnique({
        where: { tournamentId_scheduledAt: { tournamentId, scheduledAt: previous } },
      });
      const fixtures = await tx.v1TeamMatch.findMany({
        where: { tournamentId, startAt: previous, deletedAt: null, tournamentDetails: { isNot: null } },
        orderBy: { id: 'asc' }, select: { id: true, game: { select: { state: true } } },
      });
      const sameLegacyFixtures = Boolean(existing) || JSON.stringify(fixtures.map(fixture => fixture.id).sort()) === JSON.stringify([...(dto.expectedFixtureIds ?? [])].sort());
      if ((existing?.id ?? null) !== dto.expectedScheduleTimeId || !sameLegacyFixtures || !existing && fixtures.length === 0) throw new ConflictException({
        code: 'SCHEDULE_TIME_STALE', message: '시간 항목이 이미 변경됐어요. 목록을 새로 불러온 뒤 다시 수정해 주세요.',
      });
      if (+previous === +next) return { item: existing, affectedFixtureCount: 0 };
      if (await tx.v1TournamentScheduleTime.findUnique({ where: { tournamentId_scheduledAt: { tournamentId, scheduledAt: next } } }) ||
          await tx.v1TeamMatch.findFirst({ where: { tournamentId, startAt: next, deletedAt: null, tournamentDetails: { isNot: null } }, select: { id: true } })) {
        throw new ConflictException({ code: 'SCHEDULE_TIME_DUPLICATE', message: '이미 등록되거나 배정된 시간이에요. 다른 시간을 선택해 주세요.' });
      }
      if (fixtures.some(fixture => !fixture.game)) throw new ConflictException({
        code: 'TOURNAMENT_MATCH_GAME_MISSING', message: '대회 경기의 정본 게임을 찾을 수 없어요.',
      });
      if (fixtures.some(fixture => fixture.game?.state !== 'SCHEDULED')) throw new ConflictException({
        code: 'SCHEDULE_TIME_FIXTURE_STARTED', message: '시작됐거나 종료된 경기가 포함되어 있어 시간을 함께 변경할 수 없어요.',
      });
      const movingIds = fixtures.map(fixture => fixture.id);
      // Compare against the final group position, not an intermediate partially-moved group.
      for (const fixture of fixtures) await assertFixtureScheduleKeepsStageOrder(tx, {
        tournamentId, teamMatchId: fixture.id, startAt: next, movingTeamMatchIds: movingIds,
      });
      for (const fixture of fixtures) await updateTournamentMatchInTx(tx, {
        teamMatchId: fixture.id, scheduledAt: next, actorUserId: admin.userId,
      });
      const item = existing
        ? await tx.v1TournamentScheduleTime.update({ where: { id: existing.id }, data: { scheduledAt: next } })
        : await tx.v1TournamentScheduleTime.create({ data: { tournamentId, scheduledAt: next } });
      await this.admins.logAdminAction(admin, {
        action: surface === 'league-matches' ? 'league.schedule_time.update' : 'tournament.schedule_time.update',
        targetType: surface === 'league-matches' ? 'league' : 'tournament', targetId: tournamentId,
        beforeJson: { scheduledAt: previous.toISOString() },
        afterJson: { id: item.id, scheduledAt: next.toISOString(), fixtureIds: movingIds },
      }, tx);
      return { item, affectedFixtureCount: fixtures.length };
    }, { timeout: 20_000 });
  }
}
