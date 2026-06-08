import { ForbiddenException } from '@nestjs/common';
import { AdminOpsService } from './admin-ops.service';

const activeOwner = {
  id: 'admin-1',
  userId: 'user-admin-1',
  adminRole: 'owner',
  status: 'active',
};

const supportAdmin = {
  id: 'admin-support-1',
  userId: 'user-support-1',
  adminRole: 'support',
  status: 'active',
};

const user = {
  id: 'user-admin-1',
  email: 'admin@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

describe('AdminOpsService', () => {
  const tossPayments = {
    confirmPayment: jest.fn(),
    retrievePayment: jest.fn(),
    cancelPayment: jest.fn(),
    payoutContractUnavailable: jest.fn(() => ({
      code: 'TOSS_PAYOUT_CONTRACT_REQUIRED',
      message: 'Payout contract is not ready',
    })),
  };

  const tx = {
    v1AdminActionLog: { create: jest.fn() },
    v1OpsCaseEvent: { create: jest.fn() },
    v1PaymentOrder: { update: jest.fn() },
    v1PaymentRefund: { update: jest.fn() },
    v1SettlementBatch: { update: jest.fn() },
    v1PayoutAttempt: { create: jest.fn() },
  };

  const prisma = {
    v1AdminUser: { findUnique: jest.fn() },
    v1OpsReport: { count: jest.fn(), findUnique: jest.fn() },
    v1OpsDispute: { count: jest.fn() },
    v1PaymentOrder: { count: jest.fn(), findUnique: jest.fn() },
    v1PaymentRefund: { count: jest.fn(), create: jest.fn() },
    v1SettlementBatch: { count: jest.fn(), findUnique: jest.fn() },
    v1PayoutAttempt: { count: jest.fn() },
    v1OpsCaseEvent: { findMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };

  let service: AdminOpsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminOpsService(prisma as never, tossPayments as never);
  });

  it('allows support admins to read ops overview', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdmin);
    prisma.v1OpsReport.count.mockResolvedValue(2);
    prisma.v1OpsDispute.count.mockResolvedValue(3);
    prisma.v1PaymentOrder.count.mockResolvedValue(4);
    prisma.v1PaymentRefund.count.mockResolvedValue(5);
    prisma.v1SettlementBatch.count.mockResolvedValue(6);
    prisma.v1PayoutAttempt.count.mockResolvedValue(1);
    prisma.v1OpsCaseEvent.findMany.mockResolvedValue([]);

    await expect(service.overview(user)).resolves.toEqual({
      queues: {
        openReports: 2,
        activeDisputes: 3,
        pendingPayments: 4,
        refundRequests: 5,
        settlementReviews: 6,
        payoutFailures: 1,
      },
      recentEvents: [],
    });
  });

  it('blocks support admins from mutating report actions', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdmin);

    await expect(service.reportAction(user, 'report-1', { action: 'resolve', reason: '처리 완료' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.v1OpsReport.findUnique).not.toHaveBeenCalled();
  });

  it('records provider refund failure without turning it into success', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOwner);
    prisma.v1PaymentOrder.findUnique.mockResolvedValue({
      id: 'payment-order-1',
      amount: 42000,
      status: 'confirmed',
      providerPaymentKey: 'test_payment_key',
      refunds: [],
    });
    prisma.v1PaymentRefund.create.mockResolvedValue({
      id: 'refund-1',
      paymentOrderId: 'payment-order-1',
      amount: 12000,
      status: 'processing',
    });
    tossPayments.cancelPayment.mockRejectedValue(new Error('provider down'));
    tx.v1PaymentRefund.update.mockResolvedValue({
      id: 'refund-1',
      paymentOrderId: 'payment-order-1',
      requesterUserId: null,
      reviewedByAdminUserId: activeOwner.id,
      providerRefundId: null,
      amount: 12000,
      reason: '부분 환불',
      status: 'failed',
      providerStatus: null,
      failureCode: 'PROVIDER_ERROR',
      failureMessage: 'provider down',
      requestedAt: new Date('2026-05-19T09:00:00.000Z'),
      reviewedAt: new Date('2026-05-19T09:00:00.000Z'),
      completedAt: null,
      createdAt: new Date('2026-05-19T09:00:00.000Z'),
      updatedAt: new Date('2026-05-19T09:00:00.000Z'),
    });

    await expect(service.refundPayment(user, 'payment-order-1', { amount: 12000, reason: '부분 환불' })).resolves.toMatchObject({
      refund: { refundId: 'refund-1', status: 'failed', failureMessage: 'provider down' },
      providerError: { code: 'PROVIDER_ERROR', message: 'provider down' },
    });
    expect(tx.v1AdminActionLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'ops.payment.refund.failed' }),
    }));
    expect(tx.v1OpsCaseEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: 'refund_status_changed', toStatus: 'failed' }),
    }));
  });

  it('marks stale payment confirmation as expired and records operator history', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOwner);
    prisma.v1PaymentOrder.findUnique.mockResolvedValue({
      id: 'payment-order-expired',
      orderId: 'tm_expired_001',
      amount: 42000,
      status: 'pending',
      providerPaymentKey: null,
      expiresAt: new Date('2026-05-19T08:00:00.000Z'),
      refunds: [],
    });
    tx.v1PaymentOrder.update.mockResolvedValue({
      id: 'payment-order-expired',
      status: 'expired',
    });

    await expect(service.confirmPayment(user, {
      paymentKey: 'test_payment_expired',
      orderId: 'tm_expired_001',
      amount: 42000,
    })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PAYMENT_ORDER_EXPIRED' }),
    });

    expect(tossPayments.confirmPayment).not.toHaveBeenCalled();
    expect(tx.v1PaymentOrder.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'expired', failureCode: 'PAYMENT_ORDER_EXPIRED' }),
    }));
    expect(tx.v1AdminActionLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'ops.payment.confirm.expired' }),
    }));
    expect(tx.v1OpsCaseEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: 'payment_failed', toStatus: 'expired' }),
    }));
  });

  it('does not trust webhook body status when provider verification fails', async () => {
    prisma.v1PaymentOrder.findUnique.mockResolvedValue({
      id: 'payment-order-1',
      orderId: 'tm_seed_ops_001',
      amount: 42000,
      status: 'pending',
      providerPaymentKey: 'test_payment_seed_ops_001',
      refunds: [],
    });
    tossPayments.retrievePayment.mockRejectedValue(new Error('provider lookup unavailable'));

    await expect(service.tossWebhook({
      eventType: 'PAYMENT_STATUS_CHANGED',
      paymentKey: 'test_payment_seed_ops_001',
      orderId: 'tm_seed_ops_001',
      amount: 42000,
      payload: { status: 'DONE' },
    })).resolves.toEqual({
      received: true,
      linked: true,
      verified: false,
      providerError: { code: 'PROVIDER_ERROR', message: 'provider lookup unavailable' },
    });

    expect(tx.v1PaymentOrder.update).not.toHaveBeenCalled();
    expect(prisma.v1OpsCaseEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventType: 'payment_webhook_received',
        fromStatus: 'pending',
        toStatus: 'pending',
      }),
    }));
  });

  it('keeps payout request failed until contracted Toss payout is ready', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOwner);
    prisma.v1SettlementBatch.findUnique.mockResolvedValue({
      id: 'settlement-1',
      status: 'approved',
      totalAmount: 30000,
      payoutAttempts: [],
      items: [],
    });
    tx.v1PayoutAttempt.create.mockResolvedValue({
      id: 'payout-1',
      settlementBatchId: 'settlement-1',
      requestedByAdminUserId: activeOwner.id,
      providerPayoutId: null,
      status: 'failed',
      amount: 30000,
      requestedAt: new Date('2026-05-20T10:00:00.000Z'),
      providerConfirmedAt: null,
      failureCode: 'TOSS_PAYOUT_CONTRACT_REQUIRED',
      failureMessage: 'Payout contract is not ready',
      createdAt: new Date('2026-05-20T10:00:00.000Z'),
      updatedAt: new Date('2026-05-20T10:00:00.000Z'),
    });
    tx.v1SettlementBatch.update.mockResolvedValue({
      id: 'settlement-1',
      batchKey: 'settlement_seed_202605',
      status: 'failed',
      periodStart: new Date('2026-05-01T00:00:00.000Z'),
      periodEnd: new Date('2026-05-31T23:59:59.000Z'),
      currency: 'KRW',
      totalAmount: 30000,
      holdReason: null,
      approvedAt: new Date('2026-05-20T10:00:00.000Z'),
      payoutRequestedAt: new Date('2026-05-20T10:00:00.000Z'),
      completedAt: null,
      createdAt: new Date('2026-05-20T10:00:00.000Z'),
      updatedAt: new Date('2026-05-20T10:00:00.000Z'),
      items: [],
      payoutAttempts: [],
    });

    await expect(service.requestPayout(user, 'settlement-1', { reason: '월 정산 지급' })).resolves.toMatchObject({
      payout: { payoutAttemptId: 'payout-1', status: 'failed', failureCode: 'TOSS_PAYOUT_CONTRACT_REQUIRED' },
      settlement: { settlementBatchId: 'settlement-1', status: 'failed' },
      providerError: { code: 'TOSS_PAYOUT_CONTRACT_REQUIRED' },
    });
  });
});
