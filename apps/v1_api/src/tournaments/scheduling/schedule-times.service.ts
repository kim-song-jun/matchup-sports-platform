import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminContextService } from '../../common/admin-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from '../tournament-surface-lookup';
import { CreateScheduleTimeDto } from './schedule-times.dto';

@Injectable()
export class ScheduleTimesService {
  constructor(private readonly prisma: PrismaService, private readonly admins: AdminContextService) {}

  private async assertCompetition(db: PrismaService | Prisma.TransactionClient, id: string) {
    const tournament = await findTournamentOnSurface(db, TOURNAMENT_KINDS, {
      where: { id, deletedAt: null }, select: { id: true, format: true },
    });
    if (!tournament) throw new NotFoundException({ code: 'NOT_FOUND', message: '대회를 찾지 못했어요.' });
    if (tournament.format !== 'league_knockouts') {
      throw new ConflictException({ code: 'SCHEDULE_TIMES_FORMAT_UNSUPPORTED', message: '정규리그 + N개 토너먼트에서 사용하는 시간 목록이에요.' });
    }
  }

  async list(user: V1AuthUser, tournamentId: string) {
    await this.admins.getTournamentAdmin(user.id, { tournamentId });
    await this.assertCompetition(this.prisma, tournamentId);
    return { items: await this.prisma.v1TournamentScheduleTime.findMany({ where: { tournamentId }, orderBy: { scheduledAt: 'asc' } }) };
  }

  async create(user: V1AuthUser, tournamentId: string, dto: CreateScheduleTimeDto) {
    return this.prisma.$transaction(async tx => {
      const admin = await this.admins.getTournamentMutationAdmin(user.id, { tournamentId }, tx);
      await this.assertCompetition(tx, tournamentId);
      const scheduledAt = new Date(dto.scheduledAt);
      // A repeated add is safe, including two operators adding the same instant concurrently.
      const created = await tx.v1TournamentScheduleTime.createMany({
        data: [{ id: randomUUID(), tournamentId, scheduledAt }], skipDuplicates: true,
      });
      const item = await tx.v1TournamentScheduleTime.findUniqueOrThrow({ where: { tournamentId_scheduledAt: { tournamentId, scheduledAt } } });
      if (created.count) await this.admins.logAdminAction(admin, {
        action: 'tournament.schedule_time.create', targetType: 'tournament', targetId: tournamentId,
        afterJson: { id: item.id, scheduledAt: scheduledAt.toISOString() },
      }, tx);
      return { item };
    });
  }
}
