/**
 * tournament-payments.service.spec.ts
 *
 * Contract tests for PG payment prepare/confirm flows: manager+ gate,
 * registration/payment status guards, method mismatch guard, amount validation,
 * and atomic state transition on confirm. Asserts observable behaviour only.
 */
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentPaymentsService } from './tournament-payments.service';

const manager = { id: 'manager-user', email: 'm@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

function registrationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reg-1',
    tournamentId: 'tournament-1',
    teamId: 'team-1',
    appliedByUserId: 'manager-user',
    status: 'awaiting_payment',
    depositorName: null,
    agreedRules: true,
    agreedPrivacy: true,
    agreedRefund: true,
    agreedMediaConsent: false,
    confirmedByAdminUserId: null,
    confirmedAt: null,
    rosterLockedAt: null,
    cancelRequestedAt: null,
    cancelReason: null,
    createdAt: new Date('2026-06-14T00:00:00.000Z'),
    updatedAt: new Date('2026-06-14T00:00:00.000Z'),
    ...overrides,
  };
}

function pgPaymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    registrationId: 'reg-1',
    method: 'pg',
    provider: 'toss',
    providerTxId: null,
    amount: 120000,
    status: 'ready',
    paidAt: null,
    cancelledAt: null,
    refundedAt: null,
    confirmedByAdminUserId: null,
    rawWebhookRef: null,
    createdAt: new Date('2026-06-14T00:00:00.000Z'),
    updatedAt: new Date('2026-06-14T00:00:00.000Z'),
    ...overrides,
  };
}

function bankPaymentRow() {
  return pgPaymentRow({ method: 'bank_transfer', provider: null });
}

describe('TournamentPaymentsService', () => {
  let service: TournamentPaymentsService;
  let prisma: {
    v1TeamMembership: { findFirst: jest.Mock };
    v1TournamentRegistration: { findFirst: jest.Mock; update: jest.Mock };
    v1TournamentPayment: { findUnique: jest.Mock; update: jest.Mock };
    v1TournamentPlayer: { count: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1TeamMembership: { findFirst: jest.fn() },
      v1TournamentRegistration: { findFirst: jest.fn(), update: jest.fn() },
      v1TournamentPayment: { findUnique: jest.fn(), update: jest.fn() },
      v1TournamentPlayer: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(),
    };
    const p = prisma;
    (prisma.$transaction as jest.Mock).mockImplementation((cb: (tx: typeof p) => Promise<unknown>) => cb(p));
    // 기본: 매니저 권한 통과
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [TournamentPaymentsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(TournamentPaymentsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── preparePg ──────────────────────────────────────────────────────────────

  it('preparePg: non-manager → 403 PERMISSION_DENIED', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null);
    await expect(service.preparePg(manager, 'tournament-1', 'reg-1')).rejects.toThrow(ForbiddenException);
  });

  it('preparePg: registration not found → 404', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(null);
    await expect(service.preparePg(manager, 'tournament-1', 'ghost')).rejects.toThrow(NotFoundException);
  });

  it('preparePg: registration not in awaiting_payment → 409 REGISTRATION_STATUS_INVALID', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow({ status: 'paid' }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(pgPaymentRow({ status: 'paid' }));
    await expect(service.preparePg(manager, 'tournament-1', 'reg-1')).rejects.toMatchObject({
      response: { code: 'REGISTRATION_STATUS_INVALID' },
    });
  });

  it('preparePg: bank_transfer payment → 409 PAYMENT_METHOD_MISMATCH', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(bankPaymentRow());
    await expect(service.preparePg(manager, 'tournament-1', 'reg-1')).rejects.toMatchObject({
      response: { code: 'PAYMENT_METHOD_MISMATCH' },
    });
  });

  it('preparePg: payment already paid → 409 PAYMENT_STATUS_INVALID', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(pgPaymentRow({ status: 'paid' }));
    await expect(service.preparePg(manager, 'tournament-1', 'reg-1')).rejects.toMatchObject({
      response: { code: 'PAYMENT_STATUS_INVALID' },
    });
  });

  it('preparePg: valid pg + awaiting_payment → returns stub paymentKey/orderId/amount/checkoutUrl', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(pgPaymentRow());
    prisma.v1TournamentPayment.update.mockResolvedValue(pgPaymentRow({ providerTxId: 'stub_pk_reg-1' }));

    const result = await service.preparePg(manager, 'tournament-1', 'reg-1');

    expect(result).toMatchObject({ amount: 120000 });
    expect(typeof result.paymentKey).toBe('string');
    expect(typeof result.orderId).toBe('string');
    expect(typeof result.checkoutUrl).toBe('string');
    expect(result.checkoutUrl).toContain('stub');
    // stub providerTxId 저장 확인
    expect(prisma.v1TournamentPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ providerTxId: expect.stringContaining('stub_') }) }),
    );
  });

  // ─── confirmPg ──────────────────────────────────────────────────────────────

  it('confirmPg: non-manager → 403', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null);
    await expect(
      service.confirmPg(manager, 'tournament-1', 'reg-1', { paymentKey: 'pk', orderId: 'oid', amount: 120000 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('confirmPg: amount mismatch → 409 PAYMENT_AMOUNT_MISMATCH', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(pgPaymentRow());
    await expect(
      service.confirmPg(manager, 'tournament-1', 'reg-1', { paymentKey: 'pk', orderId: 'oid', amount: 9999 }),
    ).rejects.toMatchObject({ response: { code: 'PAYMENT_AMOUNT_MISMATCH' } });
  });

  it('confirmPg: bank_transfer payment method → 409 PAYMENT_METHOD_MISMATCH', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(bankPaymentRow());
    await expect(
      service.confirmPg(manager, 'tournament-1', 'reg-1', { paymentKey: 'pk', orderId: 'oid', amount: 120000 }),
    ).rejects.toMatchObject({ response: { code: 'PAYMENT_METHOD_MISMATCH' } });
  });

  it('confirmPg: valid pg confirm → payment paid + registration paid atomically', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(pgPaymentRow());
    const paidPayment = pgPaymentRow({ status: 'paid', paidAt: new Date(), providerTxId: 'pk_123' });
    const paidRegistration = registrationRow({ status: 'paid' });
    prisma.v1TournamentPayment.update.mockResolvedValue(paidPayment);
    prisma.v1TournamentRegistration.update.mockResolvedValue(paidRegistration);

    const result = await service.confirmPg(manager, 'tournament-1', 'reg-1', {
      paymentKey: 'pk_123',
      orderId: 'oid_1',
      amount: 120000,
    });

    expect(result).toMatchObject({
      status: 'paid',
      payment: { status: 'paid', amount: 120000 },
    });
    expect(prisma.v1TournamentRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'paid' }) }),
    );
    expect(prisma.v1TournamentPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'paid' }) }),
    );
  });

  it('confirmPg: registration already paid → 409 REGISTRATION_STATUS_INVALID', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow({ status: 'paid' }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(pgPaymentRow({ status: 'paid' }));
    await expect(
      service.confirmPg(manager, 'tournament-1', 'reg-1', { paymentKey: 'pk', orderId: 'oid', amount: 120000 }),
    ).rejects.toMatchObject({ response: { code: 'REGISTRATION_STATUS_INVALID' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
