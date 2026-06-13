import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { V1TournamentPayment, V1TournamentRegistration } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';

/**
 * 소비자/팀 결제 서비스 — PG(스텁) + 계좌이체 흐름.
 *
 * PG 결제 흐름:
 *   1) POST .../payment/prepare  → providerTxId 생성(STUB), checkoutUrl 반환.
 *   2) POST .../payment/confirm  → payment ready→paid, registration awaiting_payment→paid.
 *
 * 계좌이체 흐름: 어드민 confirm-payment 경로 사용 (이 서비스는 PG만 처리).
 *
 * TODO: 실제 토스페이먼츠 연동 시 STUB 구현 교체.
 */
@Injectable()
export class TournamentPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * PG 결제 준비.
   * 가드: registration.status = 'awaiting_payment' AND payment.method = 'pg'.
   * 반환: { paymentKey, orderId, amount, checkoutUrl } — STUB.
   * payment.status는 ready 유지(confirm 전까지).
   *
   * TODO: 실제 토스페이먼츠 prepare 연동 — /v1/payments 호출로 교체.
   */
  async preparePg(user: V1AuthUser, tournamentId: string, registrationId: string) {
    const registration = await this.loadRegistration(tournamentId, registrationId);
    await this.assertTeamManager(registration.teamId, user.id);

    if (registration.status !== 'awaiting_payment') {
      throw new ConflictException({
        code: 'REGISTRATION_STATUS_INVALID',
        message: `Cannot prepare payment: registration is in status ${registration.status}`,
      });
    }

    const payment = await this.prisma.v1TournamentPayment.findUnique({ where: { registrationId } });
    if (!payment) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment record was not found' });
    }
    if (payment.method !== 'pg') {
      throw new ConflictException({
        code: 'PAYMENT_METHOD_MISMATCH',
        message: 'This endpoint is for PG payments only. Bank transfer uses the admin confirm-payment path.',
      });
    }
    if (payment.status !== 'ready') {
      throw new ConflictException({
        code: 'PAYMENT_STATUS_INVALID',
        message: `Payment is already in status ${payment.status}`,
      });
    }

    // STUB: 토스페이먼츠 prepare 미연동. 실제 연동 시 아래 stubPaymentKey/orderId를
    // 토스페이먼츠 API 응답 값으로 교체한다.
    const stubPaymentKey = `stub_pk_${registrationId.slice(0, 8)}_${Date.now()}`;
    const orderId = `tmtpay_${registrationId.slice(0, 12)}`;
    const checkoutUrl = `https://pay.toss.im/stub/checkout?orderId=${orderId}&amount=${payment.amount}`;

    // providerTxId를 stub 값으로 저장해 confirm 단계에서 대조 가능하게 함.
    await this.prisma.v1TournamentPayment.update({
      where: { registrationId },
      data: { providerTxId: stubPaymentKey },
    });

    return {
      paymentKey: stubPaymentKey,
      orderId,
      amount: payment.amount,
      checkoutUrl,
    };
  }

  /**
   * PG 결제 확인(STUB).
   * 가드: payment.method = 'pg' AND payment.status = 'ready'.
   * 동작: payment ready→paid(+paidAt, providerTxId), registration awaiting_payment→paid.
   *
   * TODO: 실제 토스 confirm 검증 — /v1/payments/confirm 호출로 교체.
   */
  async confirmPg(
    user: V1AuthUser,
    tournamentId: string,
    registrationId: string,
    body: { paymentKey: string; orderId: string; amount: number },
  ) {
    const registration = await this.loadRegistration(tournamentId, registrationId);
    await this.assertTeamManager(registration.teamId, user.id);

    if (registration.status !== 'awaiting_payment') {
      throw new ConflictException({
        code: 'REGISTRATION_STATUS_INVALID',
        message: `Cannot confirm payment: registration is in status ${registration.status}`,
      });
    }

    const payment = await this.prisma.v1TournamentPayment.findUnique({ where: { registrationId } });
    if (!payment) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment record was not found' });
    }
    if (payment.method !== 'pg') {
      throw new ConflictException({
        code: 'PAYMENT_METHOD_MISMATCH',
        message: 'This endpoint is for PG payments only.',
      });
    }
    if (payment.status !== 'ready') {
      throw new ConflictException({
        code: 'PAYMENT_STATUS_INVALID',
        message: `Payment is already in status ${payment.status}`,
      });
    }
    if (payment.amount !== body.amount) {
      throw new ConflictException({
        code: 'PAYMENT_AMOUNT_MISMATCH',
        message: `Payment amount mismatch: expected ${payment.amount}, received ${body.amount}`,
      });
    }

    // TODO: 실제 토스 confirm 검증 — 아래 STUB 로직을 토스페이먼츠 /v1/payments/confirm
    // API 호출로 교체하여 paymentKey·orderId·amount를 서버-사이드에서 검증한다.
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.v1TournamentPayment.update({
        where: { registrationId },
        data: {
          status: 'paid',
          paidAt: new Date(),
          providerTxId: body.paymentKey,
        },
      });
      const updatedRegistration = await tx.v1TournamentRegistration.update({
        where: { id: registrationId },
        data: { status: 'paid' },
      });
      return { updatedPayment, updatedRegistration };
    });

    const playerCount = await this.prisma.v1TournamentPlayer.count({
      where: { registrationId, removedAt: null },
    });

    return this.serialize(result.updatedRegistration, result.updatedPayment, playerCount);
  }

  /** 팀장 또는 운영진(manager+)만 결제를 진행할 수 있다. */
  private async assertTeamManager(teamId: string, userId: string) {
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: {
        teamId,
        userId,
        status: 'active',
        role: { in: ['owner', 'manager'] },
        team: { status: 'active', deletedAt: null },
      },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Only team owners or managers can manage tournament payment',
      });
    }
  }

  private async loadRegistration(tournamentId: string, registrationId: string): Promise<V1TournamentRegistration> {
    const registration = await this.prisma.v1TournamentRegistration.findFirst({
      where: { id: registrationId, tournamentId },
    });
    if (!registration) {
      throw new NotFoundException({ code: 'REGISTRATION_NOT_FOUND', message: 'Registration was not found' });
    }
    return registration;
  }

  private serialize(
    row: V1TournamentRegistration,
    payment: V1TournamentPayment | null,
    playerCount: number,
  ) {
    return {
      id: row.id,
      tournamentId: row.tournamentId,
      teamId: row.teamId,
      status: row.status,
      playerCount,
      payment: payment
        ? {
            method: payment.method,
            status: payment.status,
            amount: payment.amount,
            paidAt: payment.paidAt?.toISOString() ?? null,
            providerTxId: payment.providerTxId,
          }
        : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
