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

function nullableText(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

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
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }
    return this.serialize(row, row._count.registrations);
  }

  async create(user: V1AuthUser, dto: CreateTournamentDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    if (dto.teamCount === undefined) {
      throw new BadRequestException({
        code: 'TOURNAMENT_TEAM_COUNT_REQUIRED',
        message: '참가 팀 수를 입력해 주세요.',
      });
    }
    this.assertPlayerRange(dto.minPlayers, dto.maxPlayers);
    this.assertScheduleRange(
      dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      dto.scheduledEndAt ? new Date(dto.scheduledEndAt) : null,
    );

    const sport = await this.prisma.v1Sport.findUnique({ where: { id: dto.sportId } });
    if (!sport) {
      throw new BadRequestException({ code: 'SPORT_NOT_FOUND', message: '종목을 찾을 수 없어요.' });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const tournament = await tx.v1Tournament.create({
        data: {
          sportId: dto.sportId,
          title: dto.title,
          format: dto.format ?? 'group_knockout',
          registrationDeadlineAt: dto.registrationDeadlineAt ? new Date(dto.registrationDeadlineAt) : null,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          scheduledEndAt: dto.scheduledEndAt ? new Date(dto.scheduledEndAt) : null,
          venue: dto.venue ?? null,
          teamCount: dto.teamCount,
          minPlayers: dto.minPlayers ?? 6,
          maxPlayers: dto.maxPlayers ?? 10,
          entryFee: dto.entryFee ?? 0,
          bankName: dto.bankName ?? null,
          bankAccount: dto.bankAccount ?? null,
          bankHolder: dto.bankHolder ?? null,
          rulesText: dto.rulesText ?? null,
          refundPolicyText: dto.refundPolicyText ?? null,
          prizePool: dto.prizePool ?? null,
          prizeSummary: dto.prizeSummary ?? null,
          prizeBreakdown: dto.prizeBreakdown ?? null,
          promoHomeEnabled: dto.promoHomeEnabled ?? false,
          promoHomeTitle: nullableText(dto.promoHomeTitle) ?? null,
          promoHomeSubtitle: nullableText(dto.promoHomeSubtitle) ?? null,
          promoHomeImageUrl: nullableText(dto.promoHomeImageUrl) ?? null,
          promoHomeBadgeText: nullableText(dto.promoHomeBadgeText) ?? null,
          promoHomeDateText: nullableText(dto.promoHomeDateText) ?? null,
          promoHomeTeamsText: nullableText(dto.promoHomeTeamsText) ?? null,
          promoHomeLocationText: nullableText(dto.promoHomeLocationText) ?? null,
          promoHomePrizeText: nullableText(dto.promoHomePrizeText) ?? null,
          promoHomePriority: dto.promoHomePriority ?? 0,
          promoListEnabled: dto.promoListEnabled ?? false,
          promoListTitle: nullableText(dto.promoListTitle) ?? null,
          promoListSubtitle: nullableText(dto.promoListSubtitle) ?? null,
          promoListImageUrl: nullableText(dto.promoListImageUrl) ?? null,
          promoListBadgeText: nullableText(dto.promoListBadgeText) ?? null,
          promoListDateText: nullableText(dto.promoListDateText) ?? null,
          promoListTeamsText: nullableText(dto.promoListTeamsText) ?? null,
          promoListLocationText: nullableText(dto.promoListLocationText) ?? null,
          promoListPrizeText: nullableText(dto.promoListPrizeText) ?? null,
          promoListPriority: dto.promoListPriority ?? 0,
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
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }

    // 변경 후 최종 min/max 기준으로 검증(둘 중 하나만 들어와도 일관성 보장).
    const nextMin = dto.minPlayers ?? existing.minPlayers;
    const nextMax = dto.maxPlayers ?? existing.maxPlayers;
    this.assertPlayerRange(nextMin, nextMax);
    const nextScheduledAt =
      dto.scheduledAt !== undefined
        ? dto.scheduledAt
          ? new Date(dto.scheduledAt)
          : null
        : existing.scheduledAt;
    const nextScheduledEndAt =
      dto.scheduledEndAt !== undefined
        ? dto.scheduledEndAt
          ? new Date(dto.scheduledEndAt)
          : null
        : existing.scheduledEndAt;
    this.assertScheduleRange(nextScheduledAt, nextScheduledEndAt);

    const data: Prisma.V1TournamentUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.format !== undefined) data.format = dto.format;
    if (dto.registrationDeadlineAt !== undefined) {
      data.registrationDeadlineAt = dto.registrationDeadlineAt ? new Date(dto.registrationDeadlineAt) : null;
    }
    if (dto.scheduledAt !== undefined) data.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (dto.scheduledEndAt !== undefined) data.scheduledEndAt = dto.scheduledEndAt ? new Date(dto.scheduledEndAt) : null;
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
    if (dto.prizeSummary !== undefined) data.prizeSummary = dto.prizeSummary;
    if (dto.prizeBreakdown !== undefined) data.prizeBreakdown = dto.prizeBreakdown;
    if (dto.promoHomeEnabled !== undefined) data.promoHomeEnabled = dto.promoHomeEnabled;
    if (dto.promoHomeTitle !== undefined) data.promoHomeTitle = nullableText(dto.promoHomeTitle);
    if (dto.promoHomeSubtitle !== undefined) data.promoHomeSubtitle = nullableText(dto.promoHomeSubtitle);
    if (dto.promoHomeImageUrl !== undefined) data.promoHomeImageUrl = nullableText(dto.promoHomeImageUrl);
    if (dto.promoHomeBadgeText !== undefined) data.promoHomeBadgeText = nullableText(dto.promoHomeBadgeText);
    if (dto.promoHomeDateText !== undefined) data.promoHomeDateText = nullableText(dto.promoHomeDateText);
    if (dto.promoHomeTeamsText !== undefined) data.promoHomeTeamsText = nullableText(dto.promoHomeTeamsText);
    if (dto.promoHomeLocationText !== undefined) data.promoHomeLocationText = nullableText(dto.promoHomeLocationText);
    if (dto.promoHomePrizeText !== undefined) data.promoHomePrizeText = nullableText(dto.promoHomePrizeText);
    if (dto.promoHomePriority !== undefined) data.promoHomePriority = dto.promoHomePriority;
    if (dto.promoListEnabled !== undefined) data.promoListEnabled = dto.promoListEnabled;
    if (dto.promoListTitle !== undefined) data.promoListTitle = nullableText(dto.promoListTitle);
    if (dto.promoListSubtitle !== undefined) data.promoListSubtitle = nullableText(dto.promoListSubtitle);
    if (dto.promoListImageUrl !== undefined) data.promoListImageUrl = nullableText(dto.promoListImageUrl);
    if (dto.promoListBadgeText !== undefined) data.promoListBadgeText = nullableText(dto.promoListBadgeText);
    if (dto.promoListDateText !== undefined) data.promoListDateText = nullableText(dto.promoListDateText);
    if (dto.promoListTeamsText !== undefined) data.promoListTeamsText = nullableText(dto.promoListTeamsText);
    if (dto.promoListLocationText !== undefined) data.promoListLocationText = nullableText(dto.promoListLocationText);
    if (dto.promoListPrizeText !== undefined) data.promoListPrizeText = nullableText(dto.promoListPrizeText);
    if (dto.promoListPriority !== undefined) data.promoListPriority = dto.promoListPriority;

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
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
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
        message: `${from} 상태에서 ${to}(으)로 변경할 수 없어요.`,
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
        message: '최소 선수 수는 최대 선수 수보다 클 수 없어요.',
      });
    }
  }

  private assertScheduleRange(start: Date | null, end: Date | null) {
    if (!end) return;
    if (!start || end.getTime() < start.getTime()) {
      throw new BadRequestException({
        code: 'TOURNAMENT_SCHEDULE_RANGE_INVALID',
        message: '대회 종료 일시는 시작 일시 이후여야 해요.',
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
      scheduledEndAt: row.scheduledEndAt?.toISOString() ?? null,
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
      prizeSummary: row.prizeSummary,
      prizeBreakdown: row.prizeBreakdown,
      promoHomeEnabled: row.promoHomeEnabled,
      promoHomeTitle: row.promoHomeTitle,
      promoHomeSubtitle: row.promoHomeSubtitle,
      promoHomeImageUrl: row.promoHomeImageUrl,
      promoHomeBadgeText: row.promoHomeBadgeText,
      promoHomeDateText: row.promoHomeDateText,
      promoHomeTeamsText: row.promoHomeTeamsText,
      promoHomeLocationText: row.promoHomeLocationText,
      promoHomePrizeText: row.promoHomePrizeText,
      promoHomePriority: row.promoHomePriority,
      promoListEnabled: row.promoListEnabled,
      promoListTitle: row.promoListTitle,
      promoListSubtitle: row.promoListSubtitle,
      promoListImageUrl: row.promoListImageUrl,
      promoListBadgeText: row.promoListBadgeText,
      promoListDateText: row.promoListDateText,
      promoListTeamsText: row.promoListTeamsText,
      promoListLocationText: row.promoListLocationText,
      promoListPrizeText: row.promoListPrizeText,
      promoListPriority: row.promoListPriority,
      registrationCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
