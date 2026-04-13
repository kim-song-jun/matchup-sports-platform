import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma, SportType, LessonType, TeamRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettlementsService } from '../settlements/settlements.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { TeamMembershipService } from '../teams/team-membership.service';

interface TossConfirmResponse {
  paymentKey: string;
  orderId: string;
  status: string;
  method: string;
  totalAmount: number;
  paidAt: string;
}

interface TossErrorResponse {
  code: string;
  message: string;
}

function toDateOnlyString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Injectable()
export class LessonsService {
  private readonly logger = new Logger(LessonsService.name);
  private readonly tossEnabled: boolean;
  private readonly tossSecretKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly settlementsService: SettlementsService,
    private readonly teamMembershipService: TeamMembershipService,
  ) {
    this.tossSecretKey = process.env.TOSS_SECRET_KEY ?? '';
    this.tossEnabled = !!this.tossSecretKey;

    if (!this.tossEnabled) {
      this.logger.warn('TOSS_SECRET_KEY not set — lesson payments running in mock mode');
    }
  }

  async findById(id: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: {
        host: {
          select: {
            id: true,
            nickname: true,
            profileImageUrl: true,
            mannerScore: true,
          },
        },
        team: { select: { id: true, name: true } },
        ticketPlans: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            lessonId: true,
            name: true,
            type: true,
            price: true,
            originalPrice: true,
            totalSessions: true,
            validDays: true,
            description: true,
            isActive: true,
            sortOrder: true,
          },
        },
        schedules: {
          where: {
            sessionDate: { gte: today },
          },
          orderBy: [{ sessionDate: 'asc' }, { startTime: 'asc' }],
          select: {
            id: true,
            lessonId: true,
            sessionDate: true,
            startTime: true,
            endTime: true,
            maxParticipants: true,
            note: true,
            isCancelled: true,
            cancelReason: true,
            _count: {
              select: {
                attendances: true,
              },
            },
          },
        },
      },
    });
    if (!lesson) {
      throw new NotFoundException('강좌를 찾을 수 없습니다.');
    }

    const { schedules, ...lessonData } = lesson;

    return {
      ...lessonData,
      upcomingSchedules: schedules.map((schedule) => ({
        id: schedule.id,
        lessonId: schedule.lessonId,
        sessionDate: toDateOnlyString(schedule.sessionDate),
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        maxParticipants: schedule.maxParticipants ?? undefined,
        note: schedule.note ?? undefined,
        isCancelled: schedule.isCancelled,
        cancelReason: schedule.cancelReason ?? undefined,
        attendeeCount: schedule._count.attendances,
      })),
    };
  }

  async findAll(filter: {
    sportType?: string;
    type?: string;
    teamId?: string;
    venueId?: string;
    cursor?: string;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(1, filter.limit ?? 20), 100);
    const where: Prisma.LessonWhereInput = { status: 'open' };
    if (filter.sportType) where.sportType = filter.sportType as SportType;
    if (filter.type) where.type = filter.type as LessonType;
    if (filter.teamId) where.teamId = filter.teamId;
    if (filter.venueId) where.venueId = filter.venueId;

    const items = await this.prisma.lesson.findMany({
      where,
      include: {
        host: { select: { id: true, nickname: true, profileImageUrl: true } },
        team: { select: { id: true, name: true } },
        ticketPlans: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            lessonId: true,
            name: true,
            type: true,
            price: true,
            originalPrice: true,
            totalSessions: true,
            validDays: true,
            description: true,
            isActive: true,
            sortOrder: true,
          },
        },
      },
      orderBy: { lessonDate: 'asc' },
      take: limit + 1,
      ...(filter.cursor && { cursor: { id: filter.cursor }, skip: 1 }),
    });

    const venueIds = [...new Set(items.map((item) => item.venueId).filter((id): id is string => Boolean(id)))];
    const venues = venueIds.length > 0
      ? await this.prisma.venue.findMany({
        where: { id: { in: venueIds } },
        select: { id: true, name: true },
      })
      : [];
    const venueMap = new Map(venues.map((venue) => [venue.id, venue]));

    const hasNext = items.length > limit;
    const result = hasNext ? items.slice(0, limit) : items;
    return {
      items: result.map((item) => ({
        ...item,
        venue: item.venueId ? venueMap.get(item.venueId) ?? undefined : undefined,
      })),
      nextCursor: hasNext ? result[result.length - 1].id : null,
    };
  }

  async findMyTickets(userId: string) {
    return this.prisma.lessonTicket.findMany({
      where: {
        userId,
        paymentId: { not: null },
      },
      orderBy: { purchasedAt: 'desc' },
      include: {
        plan: {
          select: {
            id: true,
            lessonId: true,
            name: true,
            type: true,
            price: true,
            originalPrice: true,
            totalSessions: true,
            validDays: true,
            description: true,
            isActive: true,
            sortOrder: true,
          },
        },
        lesson: {
          select: {
            id: true,
            hostId: true,
            sportType: true,
            type: true,
            title: true,
            description: true,
            venueName: true,
            lessonDate: true,
            startTime: true,
            endTime: true,
            maxParticipants: true,
            currentParticipants: true,
            fee: true,
            levelMin: true,
            levelMax: true,
            status: true,
            coachName: true,
            coachBio: true,
            imageUrls: true,
          },
        },
      },
    });
  }

  async create(hostId: string, userRole: string, data: CreateLessonDto) {
    this.assertSingleAffiliation(data.teamId, data.venueId);
    await this.assertAffiliationWriteAccess(hostId, userRole, data.teamId, data.venueId);

    const lesson = await this.prisma.lesson.create({
      data: {
        hostId,
        teamId: data.teamId,
        sportType: data.sportType,
        type: data.type,
        title: data.title,
        description: data.description,
        venueName: data.venueName,
        venueId: data.venueId,
        lessonDate: new Date(data.lessonDate),
        startTime: data.startTime,
        endTime: data.endTime,
        maxParticipants: data.maxParticipants,
        fee: data.fee ?? 0,
        levelMin: data.levelMin ?? 1,
        levelMax: data.levelMax ?? 5,
        coachName: data.coachName,
        coachBio: data.coachBio,
        imageUrls: data.imageUrls ?? [],
        isRecurring: data.isRecurring ?? false,
        recurringDays: data.recurringDays ?? [],
        recurringUntil: data.recurringUntil ? new Date(data.recurringUntil) : undefined,
      },
      include: {
        host: { select: { id: true, nickname: true, profileImageUrl: true } },
        team: { select: { id: true, name: true } },
        ticketPlans: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            lessonId: true,
            name: true,
            type: true,
            price: true,
            originalPrice: true,
            totalSessions: true,
            validDays: true,
            description: true,
            isActive: true,
            sortOrder: true,
          },
        },
      },
    });

    if (!lesson.venueId) {
      return lesson;
    }

    const venue = await this.prisma.venue.findUnique({
      where: { id: lesson.venueId },
      select: { id: true, name: true },
    });

    return {
      ...lesson,
      venue: venue ?? undefined,
    };
  }

  async purchaseTicket(userId: string, planId: string) {
    const plan = await this.prisma.lessonTicketPlan.findUnique({
      where: { id: planId },
      include: {
        lesson: { select: { id: true, title: true, hostId: true } },
      },
    });

    if (!plan) throw new NotFoundException('티켓 플랜을 찾을 수 없습니다.');
    if (!plan.isActive) throw new BadRequestException('비활성화된 티켓 플랜입니다.');
    if (plan.lesson.hostId === userId) {
      throw new BadRequestException('본인 강좌 수강권은 구매할 수 없습니다.');
    }

    const existingDraft = await this.prisma.lessonTicket.findFirst({
      where: {
        planId,
        userId,
        paymentId: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingDraft) {
      return {
        ticket: existingDraft,
        payment: {
          orderId: `MU-LESSON-${existingDraft.id}`,
          amount: existingDraft.paidAmount,
          ticketId: existingDraft.id,
        },
      };
    }

    const ticket = await this.prisma.lessonTicket.create({
      data: {
        planId,
        userId,
        lessonId: plan.lessonId,
        status: 'active',
        totalSessions: plan.totalSessions ?? null,
        paidAmount: plan.price,
        purchasedAt: new Date(),
      },
    });

    // orderId is derived from ticket.id so confirmTicketPayment can reconstruct it
    // without persisting a separate column.
    return {
      ticket,
      payment: {
        orderId: `MU-LESSON-${ticket.id}`,
        amount: plan.price,
        ticketId: ticket.id,
      },
    };
  }

  async confirmTicketPayment(ticketId: string, paymentKey: string | undefined, userId: string) {
    const ticket = await this.prisma.lessonTicket.findUnique({
      where: { id: ticketId },
      include: {
        plan: { select: { price: true, validDays: true } },
        lesson: { select: { title: true, hostId: true } },
      },
    });

    if (!ticket) throw new NotFoundException('티켓을 찾을 수 없습니다.');
    if (ticket.userId !== userId) throw new ForbiddenException('본인 티켓만 결제를 확인할 수 있습니다.');

    if (ticket.paymentId) {
      throw new BadRequestException('이미 결제가 완료된 티켓입니다.');
    }

    if (ticket.paidAmount > 0 && !paymentKey) {
      throw new BadRequestException('결제 확인을 위한 paymentKey가 필요합니다.');
    }

    if (this.tossEnabled && ticket.paidAmount > 0) {
      await this.callTossConfirm(paymentKey!, `MU-LESSON-${ticketId}`, ticket.paidAmount);
    }

    const purchasedAt = new Date();
    const startDate = new Date(purchasedAt);
    const expiresAt = ticket.plan.validDays
      ? new Date(startDate.getTime() + ticket.plan.validDays * 24 * 60 * 60 * 1000)
      : null;
    const resolvedPaymentKey = ticket.paidAmount > 0 ? paymentKey! : `FREE-LESSON-${ticketId}`;

    const updated = await this.prisma.lessonTicket.update({
      where: { id: ticketId },
      data: {
        status: 'active',
        paymentId: resolvedPaymentKey,
        purchasedAt,
        startDate,
        expiresAt: expiresAt ?? undefined,
      },
    });

    // Notify instructor
    await this.notificationsService.create({
      userId: ticket.lesson.hostId,
      type: NotificationType.marketplace_order,
      title: '레슨 티켓이 구매되었어요',
      body: `"${ticket.lesson.title}" 레슨 티켓이 구매되었습니다.`,
      data: { ticketId: ticket.id, lessonId: ticket.lessonId },
    });

    // Fire-and-forget: settlement record for lesson ticket sale
    this.settlementsService
      .recordSettlement({
        type: 'lesson',
        amount: ticket.paidAmount,
        sourceId: ticket.id,
        recipientId: ticket.lesson.hostId,
      })
      .catch((err) => this.logger.error(`Settlement record failed for lesson ticket ${ticket.id}: ${err}`));

    return updated;
  }

  private tossAuthHeader(): string {
    const encoded = Buffer.from(`${this.tossSecretKey}:`).toString('base64');
    return `Basic ${encoded}`;
  }

  private async callTossConfirm(paymentKey: string, orderId: string, amount: number): Promise<TossConfirmResponse> {
    const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: this.tossAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as TossErrorResponse;
      this.logger.error(`Toss confirm failed for lesson ticket ${orderId}: ${err.code} — ${err.message}`);
      throw new InternalServerErrorException(`결제 승인 실패: ${err.message ?? '알 수 없는 오류'}`);
    }

    return response.json() as Promise<TossConfirmResponse>;
  }

  private assertSingleAffiliation(teamId?: string, venueId?: string) {
    if (teamId && venueId) {
      throw new BadRequestException('팀과 장소 소속을 동시에 지정할 수 없습니다.');
    }
  }

  private async assertAffiliationWriteAccess(
    userId: string,
    userRole: string,
    teamId?: string,
    venueId?: string,
  ) {
    if (teamId) {
      await this.teamMembershipService.assertRole(teamId, userId, TeamRole.manager);
      return;
    }

    if (!venueId) return;

    if (userRole === 'admin') return;

    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true, ownerId: true },
    });

    if (!venue) {
      throw new NotFoundException('시설을 찾을 수 없습니다.');
    }

    if (!venue.ownerId || venue.ownerId !== userId) {
      throw new ForbiddenException('해당 시설 소속 강좌를 생성할 권한이 없습니다.');
    }
  }
}
