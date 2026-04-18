import { PrismaClient, SettlementRecord, SettlementStatus, SettlementType } from '@prisma/client';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Build helpers — pure in-memory objects for unit test mocks (no DB I/O)
// ---------------------------------------------------------------------------

export function buildSettlementRecord(
  overrides: Partial<{
    id: string;
    type: SettlementType;
    sourceId: string;
    orderId: string | null;
    amount: number;
    commission: number;
    netAmount: number;
    recipientId: string | null;
    status: SettlementStatus;
    processedAt: Date | null;
    releasedAt: Date | null;
    payoutId: string | null;
    createdAt: Date;
  }> = {},
): SettlementRecord {
  const amount = overrides.amount ?? 50000;
  const commission = overrides.commission ?? Math.round(amount * 0.1);
  return {
    id: overrides.id ?? `settle-${randomUUID().slice(0, 8)}`,
    type: overrides.type ?? SettlementType.match,
    sourceId: overrides.sourceId ?? 'pay-test-id',
    orderId: overrides.orderId !== undefined ? overrides.orderId : null,
    amount,
    commission,
    netAmount: overrides.netAmount ?? amount - commission,
    recipientId: overrides.recipientId !== undefined ? overrides.recipientId : null,
    status: overrides.status ?? SettlementStatus.pending,
    processedAt: overrides.processedAt ?? null,
    releasedAt: overrides.releasedAt ?? null,
    payoutId: overrides.payoutId !== undefined ? overrides.payoutId : null,
    createdAt: overrides.createdAt ?? new Date('2026-02-01'),
  };
}

// ---------------------------------------------------------------------------
// DB builders
// ---------------------------------------------------------------------------

/**
 * Creates a SettlementRecord in the database.
 */
export async function createSettlementRecord(
  prisma: PrismaClient,
  overrides: Partial<{
    type: SettlementType;
    sourceId: string;
    amount: number;
    commission: number;
    netAmount: number;
    recipientId: string;
    status: SettlementStatus;
  }> = {},
): Promise<SettlementRecord> {
  const amount = overrides.amount ?? 50000;
  const commission = overrides.commission ?? Math.round(amount * 0.1);
  const netAmount = overrides.netAmount ?? amount - commission;

  return prisma.settlementRecord.create({
    data: {
      type: overrides.type ?? SettlementType.match,
      sourceId: overrides.sourceId ?? `pay-${randomUUID().slice(0, 8)}`,
      amount,
      commission,
      netAmount,
      recipientId: overrides.recipientId ?? null,
      status: overrides.status ?? SettlementStatus.pending,
    },
  });
}

/**
 * Creates a set of SettlementRecords covering all status variants.
 * Useful for admin settlement list tests.
 */
export async function createSettlementSet(
  prisma: PrismaClient,
  recipientId?: string,
): Promise<SettlementRecord[]> {
  const specs: Array<{ type: SettlementType; status: SettlementStatus; amount: number }> = [
    { type: SettlementType.match, status: SettlementStatus.pending, amount: 30000 },
    { type: SettlementType.match, status: SettlementStatus.processing, amount: 45000 },
    { type: SettlementType.marketplace, status: SettlementStatus.completed, amount: 80000 },
    { type: SettlementType.lesson, status: SettlementStatus.completed, amount: 60000 },
    { type: SettlementType.marketplace, status: SettlementStatus.failed, amount: 20000 },
  ];

  return Promise.all(
    specs.map((spec) =>
      createSettlementRecord(prisma, {
        type: spec.type,
        amount: spec.amount,
        status: spec.status,
        ...(recipientId ? { recipientId } : {}),
      }),
    ),
  );
}
