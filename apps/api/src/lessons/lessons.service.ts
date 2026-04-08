import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { randomUUID } from 'crypto';

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

@Injectable()
export class LessonsService {
  private readonly logger = new Logger(LessonsService.name);
  private readonly tossEnabled: boolean;
  private readonly tossSecretKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.tossSecretKey = process.env.TOSS_SECRET_KEY ?? '';
    this.tossEnabled = !!this.tossSecretKey;

    if (!this.tossEnabled) {
      this.logger.warn('TOSS_SECRET_KEY not set — lesson payments running in mock mode');
    }
  }

  async findById(id: string) {
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
      },
    });
    if (!lesson) {
      throw new NotFoundException('강좌를 찾을 수 없습니다.');
    }
    return lesson;
  }

  async findAll(filter: { sportType?: string; type?: string; cursor?: string }) {
    const limit = 20;
    const where: Record<string, unknown> = { status: 'open' };
    if (filter.sportType) where.sportType = filter.sportType;
    if (filter.type) where.type = filter.type;

    const items = await this.prisma.lesson.findMany({
      where,
      include: {
        host: { select: { id: true, nickname: true, profileImageUrl: true } },
      },
      orderBy: { lessonDate: 'asc' },
      take: limit + 1,
      ...(filter.cursor && { cursor: { id: filter.cursor }, skip: 1 }),
    });

    const hasNext = items.length > limit;
    const result = hasNext ? items.slice(0, limit) : items;
    return {
      items: result,
      nextCursor: hasNext ? result[result.length - 1].id : null,
    };
  }

  async create(hostId: string, data: Record<string, unknown>) {
    return this.prisma.lesson.create({
      data: {
        hostId,
        sportType: data.sportType as never,
        type: data.type as never,
        title: data.title as string,
        description: data.description as string | undefined,
        venueName: data.venueName as string | undefined,
        venueId: data.venueId as string | undefined,
        lessonDate: new Date(data.lessonDate as string),
        startTime: data.startTime as string,
        endTime: data.endTime as string,
        maxParticipants: data.maxParticipants as number,
        fee: (data.fee as number) || 0,
        levelMin: (data.levelMin as number) || 1,
        levelMax: (data.levelMax as number) || 5,
        coachName: data.coachName as string | undefined,
        coachBio: data.coachBio as string | undefined,
        imageUrls: (data.imageUrls as string[]) || [],
      },
    });
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

    const orderId = `MU-LESSON-${randomUUID()}`;

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

    return {
      ticket,
      payment: {
        orderId,
        amount: plan.price,
        ticketId: ticket.id,
      },
    };
  }

  async confirmTicketPayment(ticketId: string, paymentKey: string, userId: string) {
    const ticket = await this.prisma.lessonTicket.findUnique({
      where: { id: ticketId },
      include: {
        plan: { select: { price: true } },
        lesson: { select: { title: true, hostId: true } },
      },
    });

    if (!ticket) throw new NotFoundException('티켓을 찾을 수 없습니다.');
    if (ticket.userId !== userId) throw new ForbiddenException('본인 티켓만 결제를 확인할 수 있습니다.');

    if (ticket.paymentId) {
      throw new BadRequestException('이미 결제가 완료된 티켓입니다.');
    }

    if (this.tossEnabled) {
      await this.callTossConfirm(paymentKey, `MU-LESSON-${ticketId}`, ticket.paidAmount);
    }

    const updated = await this.prisma.lessonTicket.update({
      where: { id: ticketId },
      data: {
        status: 'active',
        paymentId: paymentKey,
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
}
