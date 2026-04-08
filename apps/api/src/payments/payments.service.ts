import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

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
      include: {
        match: {
          include: {
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
      include: { match: true },
    });

    if (!participant || participant.userId !== userId) {
      throw new NotFoundException('참가 정보를 찾을 수 없습니다.');
    }

    if (participant.match.fee !== amount) {
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
      // TODO: 토스페이먼츠 연동 시 paymentKey 추가
    };
  }

  async confirm(data: Record<string, unknown>) {
    // TODO: 토스페이먼츠 API로 실제 결제 승인
    const payment = await this.prisma.payment.update({
      where: { orderId: data.orderId as string },
      data: {
        status: 'completed',
        paymentKey: data.paymentKey as string,
        paidAt: new Date(),
      },
      include: this.paymentInclude,
    });

    // 참가 상태 업데이트
    await this.prisma.matchParticipant.update({
      where: { id: payment.participantId },
      data: { status: 'confirmed', paymentStatus: 'completed' },
    });

    return payment;
  }

  async refund(userId: string, paymentId: string, data: Record<string, unknown>) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: this.paymentInclude,
    });
    if (!payment || payment.userId !== userId) throw new NotFoundException('결제를 찾을 수 없습니다.');

    if (payment.status !== 'completed') {
      throw new BadRequestException('완료된 결제만 환불할 수 있습니다.');
    }

    // TODO: 토스페이먼츠 환불 API 호출
    await this.prisma.matchParticipant.update({
      where: { id: payment.participantId },
      data: { status: 'cancelled', paymentStatus: 'refunded' },
    });

    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'refunded',
        refundAmount: payment.amount,
        refundReason: [data.reason, data.note].filter(Boolean).join(' / ') || null,
        refundedAt: new Date(),
      },
      include: this.paymentInclude,
    });
  }

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

  private normalizeMethod(method?: string) {
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
}
