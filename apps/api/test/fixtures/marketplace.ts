import {
  PrismaClient,
  MarketplaceListing,
  MarketplaceOrder,
  Dispute,
  DisputeMessage,
  Payout,
  SportType,
  ListingStatus,
  ItemCondition,
  ListingType,
  OrderStatus,
  DisputeStatus,
  DisputeActorRole,
  DisputeTargetType,
  PayoutStatus,
  SettlementStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { computeCommission } from '../../src/common/constants/commission';

/**
 * Creates an active MarketplaceListing for the given seller.
 */
export async function createListing(
  prisma: PrismaClient,
  sellerId: string,
  overrides: Partial<{
    title: string;
    description: string;
    sportType: SportType;
    category: string;
    condition: ItemCondition;
    price: number;
    listingType: ListingType;
    status: ListingStatus;
  }> = {},
): Promise<MarketplaceListing> {
  return prisma.marketplaceListing.create({
    data: {
      sellerId,
      title: overrides.title ?? 'Test Listing',
      description: overrides.description ?? 'Test description',
      sportType: overrides.sportType ?? SportType.futsal,
      category: overrides.category ?? 'shoes',
      condition: overrides.condition ?? ItemCondition.good,
      price: overrides.price ?? 50000,
      listingType: overrides.listingType ?? ListingType.sell,
      status: overrides.status ?? ListingStatus.active,
      imageUrls: [],
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
  });
}

/**
 * Creates a MarketplaceOrder in escrow_held state (paid, awaiting delivery confirmation).
 */
export async function createEscrowOrder(
  prisma: PrismaClient,
  listingId: string,
  buyerId: string,
  sellerId: string,
  overrides: Partial<{
    amount: number;
    status: OrderStatus;
    autoReleaseAt: Date;
  }> = {},
): Promise<MarketplaceOrder> {
  const amount = overrides.amount ?? 50000;
  return prisma.marketplaceOrder.create({
    data: {
      listingId,
      buyerId,
      sellerId,
      amount,
      commission: computeCommission(amount),
      orderId: `MU-MKT-TEST-${randomUUID().slice(0, 8)}`,
      status: overrides.status ?? OrderStatus.escrow_held,
      paymentKey: `test-toss-${randomUUID().slice(0, 8)}`,
      paidAt: new Date(),
      autoReleaseAt: overrides.autoReleaseAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}

/**
 * Creates a released MarketplaceOrder (buyer confirmed receipt, funds released to seller).
 */
export async function createReleasedOrder(
  prisma: PrismaClient,
  listingId: string,
  buyerId: string,
  sellerId: string,
  overrides: Partial<{ amount: number }> = {},
): Promise<MarketplaceOrder> {
  const amount = overrides.amount ?? 50000;
  const now = new Date();
  return prisma.marketplaceOrder.create({
    data: {
      listingId,
      buyerId,
      sellerId,
      amount,
      commission: computeCommission(amount),
      orderId: `MU-MKT-TEST-${randomUUID().slice(0, 8)}`,
      status: OrderStatus.completed,
      paymentKey: `test-toss-${randomUUID().slice(0, 8)}`,
      paidAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      shippedAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
      deliveredAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
      confirmedReceiptAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      releasedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      autoReleaseAt: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000),
      completedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
    },
  });
}

/**
 * Creates a completed SettlementRecord for a released marketplace order.
 */
export async function createReleasedSettlement(
  prisma: PrismaClient,
  orderId: string,       // MarketplaceOrder.id (PK)
  orderPublicId: string, // MarketplaceOrder.orderId (MU-MKT-... string)
  sellerId: string,
  amount: number,
) {
  const commission = Math.round(amount * 0.1);
  return prisma.settlementRecord.create({
    data: {
      type: 'marketplace',
      sourceId: orderPublicId,
      orderId,
      amount,
      commission,
      netAmount: amount - commission,
      recipientId: sellerId,
      status: SettlementStatus.completed,
      releasedAt: new Date(),
      processedAt: new Date(),
    },
  });
}

/**
 * Creates a held SettlementRecord for an escrow-held marketplace order.
 */
export async function createHeldSettlement(
  prisma: PrismaClient,
  orderId: string,
  orderPublicId: string,
  sellerId: string,
  amount: number,
) {
  const commission = Math.round(amount * 0.1);
  return prisma.settlementRecord.create({
    data: {
      type: 'marketplace',
      sourceId: orderPublicId,
      orderId,
      amount,
      commission,
      netAmount: amount - commission,
      recipientId: sellerId,
      status: SettlementStatus.held,
    },
  });
}

// ---------------------------------------------------------------------------
// In-memory build helpers (pure objects, no DB I/O) — for unit test mocks
// ---------------------------------------------------------------------------

export function buildPayout(
  overrides: Partial<{
    id: string;
    batchId: string;
    recipientId: string;
    grossAmount: number;
    platformFee: number;
    netAmount: number;
    status: PayoutStatus;
    note: string | null;
    failureReason: string | null;
    paidAt: Date | null;
    processedAt: Date | null;
    markedPaidByAdminId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
): Payout {
  const grossAmount = overrides.grossAmount ?? 50000;
  const platformFee = overrides.platformFee ?? 5000;
  return {
    id: overrides.id ?? `payout-${randomUUID().slice(0, 8)}`,
    batchId: overrides.batchId ?? `batch-${randomUUID().slice(0, 8)}`,
    recipientId: overrides.recipientId ?? 'user-seller-id',
    grossAmount,
    platformFee,
    netAmount: overrides.netAmount ?? grossAmount - platformFee,
    status: overrides.status ?? PayoutStatus.pending,
    note: overrides.note !== undefined ? overrides.note : null,
    failureReason: overrides.failureReason !== undefined ? overrides.failureReason : null,
    paidAt: overrides.paidAt !== undefined ? overrides.paidAt : null,
    processedAt: overrides.processedAt !== undefined ? overrides.processedAt : null,
    markedPaidByAdminId: overrides.markedPaidByAdminId !== undefined ? overrides.markedPaidByAdminId : null,
    createdAt: overrides.createdAt ?? new Date('2026-04-10'),
    updatedAt: overrides.updatedAt ?? new Date('2026-04-10'),
  };
}

export function buildPayoutBatch(
  recipientId: string,
  count: number = 3,
  statusOverride?: PayoutStatus,
): Payout[] {
  const batchId = `batch-${randomUUID().slice(0, 8)}`;
  return Array.from({ length: count }, (_, i) => {
    const grossAmount = (i + 1) * 50000;
    const platformFee = Math.round(grossAmount * 0.1);
    return buildPayout({
      batchId,
      recipientId,
      grossAmount,
      platformFee,
      netAmount: grossAmount - platformFee,
      status: statusOverride ?? PayoutStatus.pending,
    });
  });
}

export function buildDispute(
  overrides: Partial<{
    id: string;
    targetType: DisputeTargetType;
    orderId: string | null;
    teamMatchId: string | null;
    type: string;
    status: DisputeStatus;
    buyerId: string;
    sellerId: string;
    description: string;
    evidence: string[];
    priorOrderStatus: OrderStatus;
    resolvedByAdminId: string | null;
    resolvedAt: Date | null;
    resolution: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
): Dispute {
  return {
    id: overrides.id ?? `dispute-${randomUUID().slice(0, 8)}`,
    targetType: overrides.targetType ?? DisputeTargetType.marketplace_order,
    orderId: overrides.orderId !== undefined ? overrides.orderId : `order-${randomUUID().slice(0, 8)}`,
    teamMatchId: overrides.teamMatchId !== undefined ? overrides.teamMatchId : null,
    type: overrides.type ?? 'item_not_as_described',
    status: overrides.status ?? DisputeStatus.filed,
    buyerId: overrides.buyerId ?? 'user-buyer-id',
    sellerId: overrides.sellerId ?? 'user-seller-id',
    description: overrides.description ?? 'Item was not as described in the listing.',
    evidence: overrides.evidence ?? [],
    priorOrderStatus: overrides.priorOrderStatus ?? OrderStatus.escrow_held,
    resolvedByAdminId: overrides.resolvedByAdminId !== undefined ? overrides.resolvedByAdminId : null,
    resolvedAt: overrides.resolvedAt !== undefined ? overrides.resolvedAt : null,
    resolution: overrides.resolution !== undefined ? overrides.resolution : null,
    createdAt: overrides.createdAt ?? new Date('2026-04-12'),
    updatedAt: overrides.updatedAt ?? new Date('2026-04-12'),
  };
}

export function buildDisputeMessage(
  overrides: Partial<{
    id: string;
    disputeId: string;
    authorId: string;
    role: DisputeActorRole;
    body: string;
    createdAt: Date;
  }> = {},
): DisputeMessage {
  return {
    id: overrides.id ?? `dmsg-${randomUUID().slice(0, 8)}`,
    disputeId: overrides.disputeId ?? `dispute-${randomUUID().slice(0, 8)}`,
    authorId: overrides.authorId ?? 'user-buyer-id',
    role: overrides.role ?? DisputeActorRole.buyer,
    body: overrides.body ?? 'I received a damaged item.',
    createdAt: overrides.createdAt ?? new Date('2026-04-12'),
  };
}
