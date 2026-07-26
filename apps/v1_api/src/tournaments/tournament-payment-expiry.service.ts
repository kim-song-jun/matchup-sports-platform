import { Injectable } from '@nestjs/common';
import { V1TournamentPayment, V1TournamentRegistration } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const TOURNAMENT_PAYMENT_DEADLINE_HOURS = 2;
export const TOURNAMENT_PAYMENT_EXPIRED_REASON =
  '입금 안내 후 2시간 내 입금 확인이 없어 자동 취소됐어요.';

const TOURNAMENT_PAYMENT_DEADLINE_MS =
  TOURNAMENT_PAYMENT_DEADLINE_HOURS * 60 * 60 * 1000;

export function getTournamentPaymentDueAt(
  payment: Pick<V1TournamentPayment, 'createdAt'>,
): Date {
  return new Date(payment.createdAt.getTime() + TOURNAMENT_PAYMENT_DEADLINE_MS);
}

type PaymentExpiryResult = {
  registration: V1TournamentRegistration;
  payment: V1TournamentPayment | null;
  expired: boolean;
  paymentDueAt: Date | null;
};

@Injectable()
export class TournamentPaymentExpiryService {
  constructor(private readonly prisma: PrismaService) {}

  async expireIfOverdue(
    registration: V1TournamentRegistration,
    payment: V1TournamentPayment | null,
  ): Promise<PaymentExpiryResult> {
    const paymentDueAt = payment ? getTournamentPaymentDueAt(payment) : null;
    if (
      registration.status !== 'awaiting_payment' ||
      !payment ||
      payment.status !== 'ready' ||
      !paymentDueAt ||
      paymentDueAt.getTime() > Date.now()
    ) {
      return { registration, payment, expired: false, paymentDueAt };
    }

    const cancelledAt = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedRegistration = await tx.v1TournamentRegistration.update({
        where: { id: registration.id },
        data: {
          status: 'cancelled',
          cancelReason: TOURNAMENT_PAYMENT_EXPIRED_REASON,
        },
      });
      const updatedPayment = await tx.v1TournamentPayment.update({
        where: { registrationId: registration.id },
        data: {
          status: 'cancelled',
          cancelledAt,
        },
      });
      return { updatedRegistration, updatedPayment };
    });

    return {
      registration: result.updatedRegistration,
      payment: result.updatedPayment,
      expired: true,
      paymentDueAt,
    };
  }
}
