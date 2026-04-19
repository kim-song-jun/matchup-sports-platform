import { PrismaClient, Payment, PaymentMethod, PaymentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createMatchWithParticipants } from './matches';

// ---------------------------------------------------------------------------
// In-memory build helper — pure object for unit test mocks (no DB I/O)
// ---------------------------------------------------------------------------

export function buildPayment(
  overrides: Partial<{
    id: string;
    userId: string;
    participantId: string;
    amount: number;
    method: PaymentMethod | null;
    status: PaymentStatus;
    pgProvider: string | null;
    pgTid: string | null;
    paymentKey: string | null;
    orderId: string;
    receiptUrl: string | null;
    cardNumber: string | null;
    refundAmount: number | null;
    refundReason: string | null;
    paidAt: Date | null;
    refundedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
): Payment {
  return {
    id: overrides.id ?? `pay-${randomUUID().slice(0, 8)}`,
    userId: overrides.userId ?? 'user-test-id',
    participantId: overrides.participantId ?? `part-${randomUUID().slice(0, 8)}`,
    amount: overrides.amount ?? 15000,
    method: overrides.method !== undefined ? overrides.method : null,
    status: overrides.status ?? PaymentStatus.pending,
    pgProvider: overrides.pgProvider !== undefined ? overrides.pgProvider : null,
    pgTid: overrides.pgTid !== undefined ? overrides.pgTid : null,
    paymentKey: overrides.paymentKey !== undefined ? overrides.paymentKey : null,
    orderId: overrides.orderId ?? `MU-${randomUUID().slice(0, 8)}`,
    receiptUrl: overrides.receiptUrl !== undefined ? overrides.receiptUrl : null,
    cardNumber: overrides.cardNumber !== undefined ? overrides.cardNumber : null,
    refundAmount: overrides.refundAmount !== undefined ? overrides.refundAmount : null,
    refundReason: overrides.refundReason !== undefined ? overrides.refundReason : null,
    paidAt: overrides.paidAt !== undefined ? overrides.paidAt : null,
    refundedAt: overrides.refundedAt !== undefined ? overrides.refundedAt : null,
    createdAt: overrides.createdAt ?? new Date('2026-04-01'),
    updatedAt: overrides.updatedAt ?? new Date('2026-04-01'),
  };
}

// ---------------------------------------------------------------------------
// DB builders
// ---------------------------------------------------------------------------

/**
 * Creates a Payment linked to a real MatchParticipant.
 * Automatically creates a match and participant if no participantId is provided.
 */
export async function createPayment(
  prisma: PrismaClient,
  userId: string,
  overrides: Partial<{
    participantId: string;
    amount: number;
    status: PaymentStatus;
  }> = {},
): Promise<Payment> {
  let participantId = overrides.participantId;

  if (!participantId) {
    const { participants } = await createMatchWithParticipants(
      prisma,
      userId,
      [userId],
    );
    participantId = participants[0].id;
  }

  return prisma.payment.create({
    data: {
      userId,
      participantId,
      amount: overrides.amount ?? 15000,
      orderId: `MU-${Date.now()}-${randomUUID().slice(0, 8)}`,
      status: overrides.status ?? PaymentStatus.pending,
    },
  });
}
