import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, V1Tournament } from '@prisma/client';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  AdminTournamentListQueryDto,
  ChangeTournamentStatusDto,
  CreateTournamentDto,
  TournamentStatus,
  UpdateTournamentDto,
} from './dto/admin-tournament.dto';

/**
 * 대회 status 전이 규칙. completed/cancelled는 종착(이후 전이 없음).
 * 운영 실수 회복을 위해 closed↔open 재오픈은 허용.
 */
const TOURNAMENT_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  draft: ['open', 'cancelled'],
  open: ['closed', 'cancelled'],
  closed: ['open', 'in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

@Injectable()
export class TournamentsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  async list(user: V1AuthUser, query: AdminTournamentListQueryDto) {
    await this.adminContext.getActiveAdmin(user.id);
    const limit = query.limit ?? 20;

    const where: Prisma.V1TournamentWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.sportId ? { sportId: query.sportId } : {}),
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
    };

    const rows = await this.prisma.v1Tournament.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { _count: { select: { registrations: true } } },
    });

    const hasNext = rows.length > limit;
    const pageItems = hasNext ? rows.slice(0, limit) : rows;

    return {
      items: pageItems.map((row) => this.serialize(row, row._count.registrations)),
      pageInfo: { nextCursor: hasNext ? (pageItems.at(-1)?.id ?? null) : null, hasNext },
    };
  }

  async get(user: V1AuthUser, tournamentId: string) {
    await this.adminContext.getActiveAdmin(user.id);
    const row = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
      include: { _count: { select: { registrations: true } } },
    });
    if (!row) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: 'Tournament was not found' });
    }
    return this.serialize(row, row._count.registrations);
  }

  async create(user: V1AuthUser, dto: CreateTournamentDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    this.assertPlayerRange(dto.minPlayers, dto.maxPlayers);

    const sport = await this.prisma.v1Sport.findUnique({ where: { id: dto.sportId } });
    if (!sport) {
      throw new BadRequestException({ code: 'SPORT_NOT_FOUND', message: 'Sport was not found' });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const tournament = await tx.v1Tournament.create({
        data: {
          sportId: dto.sportId,
          title: dto.title,
          format: dto.format ?? 'group_knockout',
          registrationDeadlineAt: dto.registrationDeadlineAt ? new Date(dto.registrationDeadlineAt) : null,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          venue: dto.venue ?? null,
          teamCount: dto.teamCount ?? 8,
          minPlayers: dto.minPlayers ?? 6,
          maxPlayers: dto.maxPlayers ?? 10,
          entryFee: dto.entryFee ?? 0,
          bankName: dto.bankName ?? null,
          bankAccount: dto.bankAccount ?? null,
          bankHolder: dto.bankHolder ?? null,
          rulesText: dto.rulesText ?? null,
          refundPolicyText: dto.refundPolicyText ?? null,
          prizePool: dto.prizePool ?? null,
          prizeBreakdown: dto.prizeBreakdown ?? null,
          createdByAdminUserId: admin.id,
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.create',
          targetType: 'tournament',
          targetId: tournament.id,
          afterJson: { title: tournament.title, status: tournament.status },
          toStatus: tournament.status,
        },
        tx,
      );
      return tournament;
    });

    return this.serialize(created, 0);
  }

  async update(user: V1AuthUser, tournamentId: string, dto: UpdateTournamentDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const existing = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: 'Tournament was not found' });
    }

    // 변경 후 최종 min/max 기준으로 검증(둘 중 하나만 들어와도 일관성 보장).
    const nextMin = dto.minPlayers ?? existing.minPlayers;
    const nextMax = dto.maxPlayers ?? existing.maxPlayers;
    this.assertPlayerRange(nextMin, nextMax);

    const data: Prisma.V1TournamentUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.format !== undefined) data.format = dto.format;
    if (dto.registrationDeadlineAt !== undefined) {
      data.registrationDeadlineAt = dto.registrationDeadlineAt ? new Date(dto.registrationDeadlineAt) : null;
    }
    if (dto.scheduledAt !== undefined) data.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (dto.venue !== undefined) data.venue = dto.venue;
    if (dto.teamCount !== undefined) data.teamCount = dto.teamCount;
    if (dto.minPlayers !== undefined) data.minPlayers = dto.minPlayers;
    if (dto.maxPlayers !== undefined) data.maxPlayers = dto.maxPlayers;
    if (dto.entryFee !== undefined) data.entryFee = dto.entryFee;
    if (dto.bankName !== undefined) data.bankName = dto.bankName;
    if (dto.bankAccount !== undefined) data.bankAccount = dto.bankAccount;
    if (dto.bankHolder !== undefined) data.bankHolder = dto.bankHolder;
    if (dto.rulesText !== undefined) data.rulesText = dto.rulesText;
    if (dto.refundPolicyText !== undefined) data.refundPolicyText = dto.refundPolicyText;
    if (dto.prizePool !== undefined) data.prizePool = dto.prizePool;
    if (dto.prizeBreakdown !== undefined) data.prizeBreakdown = dto.prizeBreakdown;

    const updated = await this.prisma.$transaction(async (tx) => {
      const tournament = await tx.v1Tournament.update({ where: { id: tournamentId }, data });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.update',
          targetType: 'tournament',
          targetId: tournamentId,
          beforeJson: { title: existing.title },
          afterJson: { title: tournament.title },
        },
        tx,
      );
      return tournament;
    });

    return this.get(user, updated.id);
  }

  async changeStatus(user: V1AuthUser, tournamentId: string, dto: ChangeTournamentStatusDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const existing = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: 'Tournament was not found' });
    }

    const from = existing.status as TournamentStatus;
    const to = dto.status;
    if (from === to) {
      // 동일 상태 재요청은 멱등 처리(no-op).
      return { tournamentId, previousStatus: from, status: to, alreadyInStatus: true };
    }
    if (!TOURNAMENT_TRANSITIONS[from].includes(to)) {
      throw new ConflictException({
        code: 'TOURNAMENT_STATUS_TRANSITION_INVALID',
        message: `Cannot transition tournament from ${from} to ${to}`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.v1Tournament.update({ where: { id: tournamentId }, data: { status: to } });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.status',
          targetType: 'tournament',
          targetId: tournamentId,
          reason: dto.reason ?? null,
          fromStatus: from,
          toStatus: to,
        },
        tx,
      );
    });

    return { tournamentId, previousStatus: from, status: to, alreadyInStatus: false };
  }

  private assertPlayerRange(min: number | undefined, max: number | undefined) {
    if (min !== undefined && max !== undefined && min > max) {
      throw new BadRequestException({
        code: 'TOURNAMENT_PLAYER_RANGE_INVALID',
        message: 'minPlayers cannot exceed maxPlayers',
      });
    }
  }

  private serialize(row: V1Tournament, registrationCount: number) {
    return {
      id: row.id,
      sportId: row.sportId,
      title: row.title,
      status: row.status,
      format: row.format,
      registrationDeadlineAt: row.registrationDeadlineAt?.toISOString() ?? null,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      venue: row.venue,
      teamCount: row.teamCount,
      minPlayers: row.minPlayers,
      maxPlayers: row.maxPlayers,
      entryFee: row.entryFee,
      bankName: row.bankName,
      bankAccount: row.bankAccount,
      bankHolder: row.bankHolder,
      rulesText: row.rulesText,
      refundPolicyText: row.refundPolicyText,
      prizePool: row.prizePool,
      prizeBreakdown: row.prizeBreakdown,
      registrationCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
