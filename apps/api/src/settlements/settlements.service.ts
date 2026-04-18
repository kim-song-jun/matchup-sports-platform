import { Injectable, NotFoundException } from '@nestjs/common';
import { PayoutStatus, SettlementStatus, SettlementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeCommission } from '../common/constants/commission';

@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: { status?: string; type?: string; cursor?: string; limit?: number }) {
    const where: {
      status?: SettlementStatus;
      type?: SettlementType;
    } = {};

    if (filter.status && Object.values(SettlementStatus).includes(filter.status as SettlementStatus)) {
      where.status = filter.status as SettlementStatus;
    }
    if (filter.type && Object.values(SettlementType).includes(filter.type as SettlementType)) {
      where.type = filter.type as SettlementType;
    }

    const take = Math.min(filter.limit ?? 20, 100);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.settlementRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: take + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
      this.prisma.settlementRecord.count({ where }),
    ]);

    const hasMore = items.length > take;
    if (hasMore) items.pop();

    return {
      items,
      total,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async getById(id: string) {
    const record = await this.prisma.settlementRecord.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException(`정산 ${id}을(를) 찾을 수 없습니다.`);
    }
    return record;
  }

  async getSummary() {
    const [totalAgg, commissionAgg, pendingAgg, refundedAgg, processedCount, pendingCount, refundedCount, failedCount] =
      await this.prisma.$transaction([
        this.prisma.settlementRecord.aggregate({ _sum: { amount: true } }),
        this.prisma.settlementRecord.aggregate({
          where: { status: SettlementStatus.completed },
          _sum: { commission: true },
        }),
        this.prisma.settlementRecord.aggregate({
          where: { status: SettlementStatus.pending },
          _sum: { amount: true },
        }),
        this.prisma.settlementRecord.aggregate({
          where: { status: SettlementStatus.refunded },
          _sum: { amount: true },
        }),
        this.prisma.settlementRecord.count({ where: { status: SettlementStatus.completed } }),
        this.prisma.settlementRecord.count({ where: { status: SettlementStatus.pending } }),
        this.prisma.settlementRecord.count({ where: { status: SettlementStatus.refunded } }),
        this.prisma.settlementRecord.count({ where: { status: SettlementStatus.failed } }),
      ]);

    return {
      total: totalAgg._sum.amount ?? 0,
      commission: commissionAgg._sum.commission ?? 0,
      pending: pendingAgg._sum.amount ?? 0,
      refunded: refundedAgg._sum.amount ?? 0,
      processedCount,
      pendingCount,
      refundedCount,
      failedCount,
    };
  }

  async process(id: string, data: { action: string; note?: string; actor?: string }) {
    const record = await this.prisma.settlementRecord.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException(`정산 ${id}을(를) 찾을 수 없습니다.`);
    }

    let newStatus: SettlementStatus;
    let processedAt: Date | undefined = new Date();

    switch (data.action) {
      case 'approve':
        newStatus = SettlementStatus.completed;
        break;
      case 'reject':
        newStatus = SettlementStatus.failed;
        break;
      default:
        newStatus = SettlementStatus.processing;
    }

    return this.prisma.settlementRecord.update({
      where: { id },
      data: { status: newStatus, processedAt },
    });
  }

  /**
   * Creates a SettlementRecord for a completed payment.
   * Commission rate: 10%.
   */
  async recordSettlement(data: {
    type: 'match' | 'marketplace' | 'lesson';
    amount: number;
    recipientId?: string;
    sourceId: string;
  }) {
    const typeMap: Record<string, SettlementType> = {
      match: SettlementType.match,
      marketplace: SettlementType.marketplace,
      lesson: SettlementType.lesson,
    };

    const commission = computeCommission(data.amount);
    const netAmount = data.amount - commission;

    return this.prisma.settlementRecord.create({
      data: {
        type: typeMap[data.type],
        sourceId: data.sourceId,
        amount: data.amount,
        commission,
        netAmount,
        recipientId: data.recipientId ?? null,
        status: SettlementStatus.pending,
      },
    });
  }

  async markProcessed(id: string) {
    const record = await this.prisma.settlementRecord.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException(`정산 ${id}을(를) 찾을 수 없습니다.`);
    }

    return this.prisma.settlementRecord.update({
      where: { id },
      data: { status: SettlementStatus.completed, processedAt: new Date() },
    });
  }

  /**
   * Creates a marketplace SettlementRecord in `held` status.
   * Settlement is held in escrow until buyer confirms receipt or auto-release fires.
   *
   * @param orderDbId - The MarketplaceOrder.id (UUID/cuid, not the orderId string)
   * @param orderPublicId - The MarketplaceOrder.orderId (MU-MKT-... string), used as sourceId
   * @param sellerId - The recipient seller
   * @param amount - Gross transaction amount
   */
  async recordMarketplaceSettlement(
    orderDbId: string,
    orderPublicId: string,
    sellerId: string,
    amount: number,
  ) {
    const commission = computeCommission(amount);
    const netAmount = amount - commission;

    return this.prisma.settlementRecord.create({
      data: {
        type: SettlementType.marketplace,
        sourceId: orderPublicId,
        orderId: orderDbId,
        amount,
        commission,
        netAmount,
        recipientId: sellerId,
        status: SettlementStatus.held,
      },
    });
  }

  /**
   * Transitions the held SettlementRecord for a marketplace order from `held` → `completed`.
   * Called when buyer confirms receipt or auto-release fires.
   *
   * @param orderDbId - The MarketplaceOrder.id (PK) — used as orderId FK on SettlementRecord
   */
  async releaseSettlement(orderDbId: string) {
    const record = await this.prisma.settlementRecord.findFirst({
      where: { orderId: orderDbId, status: SettlementStatus.held },
    });

    if (!record) {
      // May already have been released — idempotent behaviour
      const existing = await this.prisma.settlementRecord.findFirst({ where: { orderId: orderDbId } });
      if (existing?.status === SettlementStatus.completed) return existing;
      throw new NotFoundException(`에스크로 보관 정산 레코드를 찾을 수 없습니다: orderId=${orderDbId}`);
    }

    return this.prisma.settlementRecord.update({
      where: { id: record.id },
      data: {
        status: SettlementStatus.completed,
        releasedAt: new Date(),
        processedAt: new Date(),
      },
    });
  }

  /**
   * Lists SettlementRecords in `completed` status that have not been included in a payout yet.
   * Admin-only operation for constructing payout batches.
   */
  async listReleasedSettlements(filter: { recipientId?: string; cursor?: string; limit?: number }) {
    const take = Math.min(filter.limit ?? 20, 100);
    const where = {
      status: SettlementStatus.completed,
      payoutId: null,
      ...(filter.recipientId ? { recipientId: filter.recipientId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.settlementRecord.findMany({
        where,
        orderBy: { releasedAt: 'asc' },
        take: take + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
      this.prisma.settlementRecord.count({ where }),
    ]);

    const hasMore = items.length > take;
    if (hasMore) items.pop();

    return {
      items,
      total,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  /**
   * Groups the given SettlementRecord IDs by recipientId and creates one Payout per seller.
   * All records are locked to their respective payout inside a single transaction.
   *
   * @param settlementIds - IDs of SettlementRecords to include in payouts
   * @returns Array of created Payout records
   */
  async createPayoutBatch(settlementIds: string[]) {
    if (settlementIds.length === 0) return [];

    // Load all records, verify they are releasable (completed + no existing payout)
    const records = await this.prisma.settlementRecord.findMany({
      where: { id: { in: settlementIds } },
    });

    const invalid = records.filter(
      (r) => r.status !== SettlementStatus.completed || r.payoutId !== null,
    );
    if (invalid.length > 0) {
      throw new Error(
        `일부 정산 레코드가 지급 처리 불가 상태입니다: ${invalid.map((r) => r.id).join(', ')}`,
      );
    }

    // Group by recipientId
    const grouped = new Map<string, typeof records>();
    for (const record of records) {
      if (!record.recipientId) continue;
      if (!grouped.has(record.recipientId)) grouped.set(record.recipientId, []);
      grouped.get(record.recipientId)!.push(record);
    }

    return this.prisma.$transaction(async (tx) => {
      const payouts = [];
      for (const [recipientId, group] of grouped.entries()) {
        const totalNet = group.reduce((sum, r) => sum + r.netAmount, 0);
        const payout = await tx.payout.create({
          data: {
            recipientId,
            amount: totalNet,
            status: PayoutStatus.pending,
          },
        });
        await tx.settlementRecord.updateMany({
          where: { id: { in: group.map((r) => r.id) } },
          data: { payoutId: payout.id },
        });
        payouts.push(payout);
      }
      return payouts;
    });
  }

  /**
   * Marks a pending/processing Payout as paid.
   *
   * @param payoutId - Payout record ID
   * @param note - Optional external reference or note from admin
   */
  async markPayoutPaid(payoutId: string, note?: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException(`지급 ${payoutId}을(를) 찾을 수 없습니다.`);

    if (payout.status === PayoutStatus.paid) return payout;

    return this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: PayoutStatus.paid,
        paidAt: new Date(),
        ...(note !== undefined ? { note } : {}),
      },
    });
  }
}
