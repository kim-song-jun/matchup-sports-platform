import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async prepare(userId: string, data: Record<string, unknown>) {
    const orderId = `MU-${Date.now()}-${randomUUID().slice(0, 8)}`;

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        participantId: data.participantId as string,
        amount: data.amount as number,
        orderId,
        status: 'pending',
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
    });

    // 참가 상태 업데이트
    await this.prisma.matchParticipant.update({
      where: { id: payment.participantId },
      data: { status: 'confirmed', paymentStatus: 'completed' },
    });

    return payment;
  }

  async refund(paymentId: string, data: Record<string, unknown>) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('결제를 찾을 수 없습니다.');

    // TODO: 토스페이먼츠 환불 API 호출

    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'refunded',
        refundAmount: payment.amount,
        refundReason: data.reason as string,
        refundedAt: new Date(),
      },
    });
  }

  async getByUserId(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
