import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { NotificationType, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import { NotificationsService } from '../notifications/notifications.service';

// ---------------------------------------------------------------------------
// Toss Payments API response shapes (v1)
// ---------------------------------------------------------------------------

interface TossPaymentConfirmResponse {
  paymentKey: string;
  orderId: string;
  status: string;
  method: string;
  totalAmount: number;
  paidAt: string;
  receiptUrl?: string;
  card?: { number?: string };
}

interface TossErrorResponse {
  code: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly tossEnabled: boolean;
  private readonly tossSecretKey: string;
  private readonly tossWebhookSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.tossSecretKey = process.env.TOSS_SECRET_KEY ?? '';
    this.tossWebhookSecret = process.env.TOSS_WEBHOOK_SECRET ?? '';
    this.tossEnabled = !!this.tossSecretKey;

    if (!this.tossEnabled) {
      this.logger.warn('TOSS_SECRET_KEY not set — payments running in mock mode');
    }
  }

  private readonly paymentInclude = {
    user: {
      select: {
        id: true,
        nickname: true,
        email: true,
        profileImageUrl: true,
      },
    },
    participant: {
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        match: {
          select: {
            id: true,
            title: true,
            sportType: true,
            matchDate: true,
            startTime: true,
            endTime: true,
            fee: true,
            venue: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
          },
        },
      },
    },
  } as const;

  // ── prepare ────────────────────────────────────────────────────────────────

  async prepare(userId: string, data: Record<string, unknown>) {
    const participantId = String(data.participantId ?? '');
    const amount = Number(data.amount ?? 0);

    if (!participantId) {
      throw new BadRequestException('참가 정보가 없습니다.');
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('유효한 결제 금액이 필요합니다.');
    }

    const participant = await this.prisma.matchParticipant.findUnique({
      where: { id: participantId },
      select: {
        id: true,
        matchId: true,
        userId: true,
        paymentStatus: true,
      },
    });

    if (!participant || participant.userId !== userId) {
      throw new NotFoundException('참가 정보를 찾을 수 없습니다.');
    }

    const match = await this.prisma.match.findUnique({
      where: { id: participant.matchId },
      select: {
        id: true,
        title: true,
        fee: true,
      },
    });

    if (!match) {
      throw new NotFoundException('매치 정보를 찾을 수 없습니다.');
    }

    if (match.fee !== amount) {
      throw new BadRequestException('매치 참가비와 결제 금액이 일치하지 않습니다.');
    }

    if (participant.paymentStatus === 'completed') {
      throw new BadRequestException('이미 결제가 완료된 참가입니다.');
    }

    const existingPayment = await this.prisma.payment.findUnique({
      where: { participantId },
    });

    if (existingPayment) {
      if (existingPayment.status === 'pending') {
        return {
          paymentId: existingPayment.id,
          orderId: existingPayment.orderId,
          amount: existingPayment.amount,
        };
      }

      throw new BadRequestException('이미 처리된 결제가 있어 다시 준비할 수 없습니다.');
    }

    const orderId = `MU-${Date.now()}-${randomUUID().slice(0, 8)}`;

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        participantId,
        amount,
        orderId,
        status: 'pending',
        method: this.normalizeMethod(data.method as string | undefined),
      },
    });

    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      amount: payment.amount,
    };
  }

  // ── confirm ────────────────────────────────────────────────────────────────

  async confirm(data: Record<string, unknown>) {
    const orderId = data.orderId as string;
    const paymentKey = data.paymentKey as string;
    const amount = Number(data.amount);

    if (!orderId || !paymentKey) {
      throw new BadRequestException('orderId와 paymentKey가 필요합니다.');
    }

    // Verify amount against DB record before calling Toss
    const pendingPayment = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    if (!pendingPayment) {
      throw new NotFoundException('결제 정보를 찾을 수 없습니다.');
    }

    if (Number.isFinite(amount) && pendingPayment.amount !== amount) {
      throw new BadRequestException('결제 금액이 일치하지 않습니다.');
    }

    if (this.tossEnabled) {
      return this.realConfirm(orderId, paymentKey, pendingPayment.amount);
    }

    return this.mockConfirm(orderId, paymentKey);
  }

  private async realConfirm(orderId: string, paymentKey: string, amount: number) {
    const tossResponse = await this.callTossConfirm(paymentKey, orderId, amount);

    const payment = await this.prisma.payment.update({
      where: { orderId },
      data: {
        status: 'completed',
        paymentKey: tossResponse.paymentKey,
        pgProvider: 'toss',
        pgTid: tossResponse.paymentKey,
        paidAt: tossResponse.paidAt ? new Date(tossResponse.paidAt) : new Date(),
        receiptUrl: tossResponse.receiptUrl ?? null,
        cardNumber: tossResponse.card?.number ?? null,
        method: this.normalizeTossMethod(tossResponse.method),
      },
      include: this.paymentInclude,
    });

    await this.finalizeConfirm(payment);
    return payment;
  }

  private async mockConfirm(orderId: string, paymentKey: string) {
    const payment = await this.prisma.payment.update({
      where: { orderId },
      data: {
        status: 'completed',
        paymentKey,
        pgProvider: 'mock',
        paidAt: new Date(),
      },
      include: this.paymentInclude,
    });

    await this.finalizeConfirm(payment);
    return payment;
  }

  private async finalizeConfirm(payment: { id: string; userId: string; participantId: string; orderId: string; participant?: { match?: { id?: string; title?: string } | null } | null }) {
    await this.prisma.matchParticipant.update({
      where: { id: payment.participantId },
      data: { status: 'confirmed', paymentStatus: 'completed' },
    });

    await this.notificationsService.create({
      userId: payment.userId,
      type: NotificationType.payment_confirmed,
      title: '결제가 완료되었어요',
      body: `${payment.participant?.match?.title ?? '매치'} 결제가 정상적으로 완료되었습니다.`,
      data: {
        paymentId: payment.id,
        orderId: payment.orderId,
        participantId: payment.participantId,
        matchId: payment.participant?.match?.id ?? null,
      },
    });
  }

  // ── refund ─────────────────────────────────────────────────────────────────

  async refund(userId: string, paymentId: string, data: Record<string, unknown>) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: this.paymentInclude,
    });

    if (!payment || payment.userId !== userId) {
      throw new NotFoundException('결제를 찾을 수 없습니다.');
    }

    if (payment.status !== 'completed') {
      throw new BadRequestException('완료된 결제만 환불할 수 있습니다.');
    }

    const cancelReason = [data.reason, data.note].filter(Boolean).join(' / ') || '사용자 요청';

    if (this.tossEnabled) {
      return this.realRefund(payment, cancelReason);
    }

    return this.mockRefund(payment, cancelReason);
  }

  private async realRefund(
    payment: { id: string; userId: string; participantId: string; orderId: string; amount: number; paymentKey: string | null; participant?: { match?: { id?: string; title?: string } | null } | null },
    cancelReason: string,
  ) {
    if (!payment.paymentKey) {
      throw new BadRequestException('paymentKey가 없어 환불할 수 없습니다.');
    }

    await this.callTossCancel(payment.paymentKey, cancelReason);

    return this.finalizeRefund(payment, cancelReason);
  }

  private async mockRefund(
    payment: { id: string; userId: string; participantId: string; orderId: string; amount: number; participant?: { match?: { id?: string; title?: string } | null } | null },
    cancelReason: string,
  ) {
    return this.finalizeRefund(payment, cancelReason);
  }

  private async finalizeRefund(
    payment: { id: string; userId: string; participantId: string; orderId: string; amount: number; participant?: { match?: { id?: string; title?: string } | null } | null },
    cancelReason: string,
  ) {
    await this.prisma.matchParticipant.update({
      where: { id: payment.participantId },
      data: { status: 'cancelled', paymentStatus: 'refunded' },
    });

    const refunded = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'refunded',
        refundAmount: payment.amount,
        refundReason: cancelReason,
        refundedAt: new Date(),
      },
      include: this.paymentInclude,
    });

    await this.notificationsService.create({
      userId: refunded.userId,
      type: NotificationType.payment_refunded,
      title: '환불이 완료되었어요',
      body: `${refunded.participant?.match?.title ?? '결제'} 환불이 처리되었습니다.`,
      data: {
        paymentId: refunded.id,
        orderId: refunded.orderId,
        participantId: refunded.participantId,
        matchId: refunded.participant?.match?.id ?? null,
      },
    });

    return refunded;
  }

  // ── webhook ────────────────────────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer, signatureHeader: string | undefined, payload: Record<string, unknown>) {
    // Verify HMAC-SHA256 signature when secret is configured
    if (this.tossWebhookSecret) {
      this.verifyWebhookSignature(rawBody, signatureHeader);
    } else if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Webhook signature verification is required in production');
    } else {
      this.logger.warn('TOSS_WEBHOOK_SECRET not set — skipping webhook signature verification (dev only)');
    }

    const eventType = payload.eventType as string;
    const data = payload.data as Record<string, unknown> | undefined;

    switch (eventType) {
      case 'PAYMENT_STATUS_CHANGED': {
        const paymentKey = data?.paymentKey as string | undefined;
        const status = data?.status as string | undefined;

        if (!paymentKey || !status) {
          this.logger.warn('Webhook PAYMENT_STATUS_CHANGED missing paymentKey or status');
          return { received: true };
        }

        await this.syncPaymentStatusFromWebhook(paymentKey, status);
        break;
      }
      default:
        this.logger.log(`Unhandled Toss webhook event: ${eventType}`);
    }

    return { received: true };
  }

  private verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined) {
    if (!signatureHeader) {
      throw new UnauthorizedException('Webhook 서명 헤더가 없습니다.');
    }

    const hmac = createHmac('sha256', this.tossWebhookSecret);
    hmac.update(rawBody);
    const expected = hmac.digest('hex');

    const expectedBuf = Buffer.from(expected, 'utf-8');
    const receivedBuf = Buffer.from(signatureHeader, 'utf-8');

    if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
      throw new UnauthorizedException('Webhook 서명이 유효하지 않습니다.');
    }
  }

  private async syncPaymentStatusFromWebhook(paymentKey: string, tossStatus: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { paymentKey },
    });

    if (!payment) {
      this.logger.warn(`Webhook: payment not found for paymentKey ${paymentKey}`);
      return;
    }

    // Only sync terminal states to avoid overwriting in-progress states
    if (tossStatus === 'CANCELED' && payment.status === 'completed') {
      await this.prisma.payment.update({
        where: { paymentKey },
        data: { status: 'refunded', refundedAt: new Date() },
      });
      this.logger.log(`Webhook: payment ${payment.id} synced to refunded`);
    } else if (tossStatus === 'DONE' && payment.status === 'pending') {
      await this.prisma.payment.update({
        where: { paymentKey },
        data: { status: 'completed', paidAt: new Date() },
      });
      this.logger.log(`Webhook: payment ${payment.id} synced to completed`);
    }
  }

  // ── queries ────────────────────────────────────────────────────────────────

  async getByUserId(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      include: this.paymentInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(userId: string, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: this.paymentInclude,
    });

    if (!payment || payment.userId !== userId) {
      throw new NotFoundException('결제를 찾을 수 없습니다.');
    }

    return payment;
  }

  // ── Toss API calls ─────────────────────────────────────────────────────────

  private tossAuthHeader(): string {
    const encoded = Buffer.from(`${this.tossSecretKey}:`).toString('base64');
    return `Basic ${encoded}`;
  }

  private async callTossConfirm(
    paymentKey: string,
    orderId: string,
    amount: number,
  ): Promise<TossPaymentConfirmResponse> {
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
      this.logger.error(`Toss confirm failed: ${err.code} — ${err.message}`);

      await this.prisma.payment.update({
        where: { orderId },
        data: { status: 'failed' },
      });

      throw new BadRequestException(`결제 승인 실패: ${err.message ?? '알 수 없는 오류'}`);
    }

    return response.json() as Promise<TossPaymentConfirmResponse>;
  }

  private async callTossCancel(paymentKey: string, cancelReason: string): Promise<void> {
    const response = await fetch(`https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: this.tossAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cancelReason }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as TossErrorResponse;
      this.logger.error(`Toss cancel failed: ${err.code} — ${err.message}`);
      throw new InternalServerErrorException(`환불 처리 실패: ${err.message ?? '알 수 없는 오류'}`);
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private normalizeMethod(method?: string): PaymentMethod {
    switch (method) {
      case 'tosspay':
      case 'toss_pay':
        return PaymentMethod.toss_pay;
      case 'naverpay':
      case 'naver_pay':
        return PaymentMethod.naver_pay;
      case 'kakaopay':
      case 'kakao_pay':
        return PaymentMethod.kakao_pay;
      case 'transfer':
        return PaymentMethod.transfer;
      case 'card':
      default:
        return PaymentMethod.card;
    }
  }

  private normalizeTossMethod(tossMethod: string): PaymentMethod {
    switch (tossMethod) {
      case '토스페이':
        return PaymentMethod.toss_pay;
      case '네이버페이':
        return PaymentMethod.naver_pay;
      case '카카오페이':
        return PaymentMethod.kakao_pay;
      case '계좌이체':
        return PaymentMethod.transfer;
      case '카드':
      default:
        return PaymentMethod.card;
    }
  }
}
