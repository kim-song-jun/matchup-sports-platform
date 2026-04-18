import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PayoutStatus, SettlementStatus, SettlementType } from '@prisma/client';
import { randomUUID } from 'crypto';
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

  /**
   * Processes a pending settlement record.
   * Only transitions from `pending` status — throws 409 if already finalized.
   *
   * Actions: 'approve' → completed, 'reject' → failed, other → processing.
   */
  async process(id: string, data: { action: string; note?: string; actor?: string }) {
    const record = await this.prisma.settlementRecord.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException(`정산 ${id}을(를) 찾을 수 없습니다.`);
    }

    let newStatus: SettlementStatus;
    const processedAt: Date = new Date();

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

    // Atomic guard: only process from pending to prevent double-finalization
    const result = await this.prisma.settlementRecord.updateMany({
      where: { id, status: SettlementStatus.pending },
      data: { status: newStatus, processedAt },
    });
    if (result.count === 0) {
      throw new ConflictException(
        `SETTLEMENT_ALREADY_FINALIZED: 정산 ${id}이(가) 이미 처리 완료되었습니다. 현재 상태: ${record.status}`,
      );
    }

    return this.prisma.settlementRecord.findUniqueOrThrow({ where: { id } });
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
   * @param tx - Optional Prisma transaction client for atomicity with caller's transaction
   */
  async recordMarketplaceSettlement(
    orderDbId: string,
    orderPublicId: string,
    sellerId: string,
    amount: number,
    tx?: Prisma.TransactionClient,
  ) {
    const commission = computeCommission(amount);
    const netAmount = amount - commission;
    const db = tx ?? this.prisma;

    return db.settlementRecord.create({
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
   * Lists all Payout records with optional filtering.
   */
  async findAllPayouts(filter: {
    status?: PayoutStatus;
    recipientId?: string;
    batchId?: string;
    cursor?: string;
    limit?: number;
  }) {
    const take = Math.min(filter.limit ?? 20, 100);
    const where = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.recipientId ? { recipientId: filter.recipientId } : {}),
      ...(filter.batchId ? { batchId: filter.batchId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.payout.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: take + 1,
        include: {
          recipient: { select: { id: true, nickname: true } },
        },
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
      this.prisma.payout.count({ where }),
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
   * A shared batchId is generated for the entire batch run.
   *
   * Race safety: updateMany with `payoutId: null` filter is the atomic claim.
   * If another batch linked any record before us, count < group.length → ConflictException.
   *
   * @param settlementIds - IDs of SettlementRecords to include in payouts
   * @param adminNote - Optional note to attach to each payout
   * @returns Array of created Payout records
   */
  async createPayoutBatch(settlementIds: string[], adminNote?: string) {
    if (settlementIds.length === 0) {
      throw new BadRequestException('PAYOUT_BATCH_EMPTY: 최소 1개 이상의 정산 ID를 지정해야 합니다.');
    }

    // Load all records; verify they are releasable (completed + no existing payout) for early UX error
    const records = await this.prisma.settlementRecord.findMany({
      where: { id: { in: settlementIds } },
    });

    const invalid = records.filter(
      (r) => r.status !== SettlementStatus.completed || r.payoutId !== null,
    );
    if (invalid.length > 0) {
      throw new ConflictException(
        `SETTLEMENT_ALREADY_BATCHED: 일부 정산 레코드가 지급 처리 불가 상태입니다: ${invalid.map((r) => r.id).join(', ')}`,
      );
    }

    // Group by recipientId
    const grouped = new Map<string, typeof records>();
    for (const record of records) {
      if (!record.recipientId) continue;
      if (!grouped.has(record.recipientId)) grouped.set(record.recipientId, []);
      grouped.get(record.recipientId)!.push(record);
    }

    // Shared batch identifier for this admin batch run
    const batchId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const payouts = [];
      for (const [recipientId, group] of grouped.entries()) {
        const grossAmount = group.reduce((sum, r) => sum + r.amount, 0);
        const platformFee = group.reduce((sum, r) => sum + r.commission, 0);
        const netAmount = group.reduce((sum, r) => sum + r.netAmount, 0);

        const payout = await tx.payout.create({
          data: {
            batchId,
            recipientId,
            grossAmount,
            platformFee,
            netAmount,
            status: PayoutStatus.pending,
            ...(adminNote ? { note: adminNote } : {}),
          },
        });

        // Atomic claim: only link records that are still unlinked.
        // count < group.length means a concurrent batch already claimed some.
        const linkResult = await tx.settlementRecord.updateMany({
          where: {
            id: { in: group.map((r) => r.id) },
            status: SettlementStatus.completed,
            payoutId: null,
          },
          data: { payoutId: payout.id },
        });
        if (linkResult.count !== group.length) {
          throw new ConflictException(
            `SETTLEMENT_ALREADY_BATCHED: 일부 정산 레코드가 다른 배치에서 이미 처리되었습니다. (recipientId=${recipientId})`,
          );
        }

        payouts.push(payout);
      }
      return payouts;
    });
  }

  /**
   * Marks a pending/processing Payout as paid.
   * Race guard: uses updateMany to ensure status hasn't changed concurrently.
   * Cascades: marks all linked SettlementRecords as processedAt=now.
   *
   * @param payoutId - Payout record ID
   * @param adminId - Admin user ID making the change (optional for backwards compat)
   * @param note - Optional external reference or note from admin
   */
  async markPayoutPaid(payoutId: string, adminId?: string, note?: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException(`지급 ${payoutId}을(를) 찾을 수 없습니다.`);

    if (payout.status === PayoutStatus.paid) return payout;

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.payout.updateMany({
        where: { id: payoutId, status: { in: [PayoutStatus.pending, PayoutStatus.processing] } },
        data: {
          status: PayoutStatus.paid,
          paidAt: new Date(),
          processedAt: new Date(),
          ...(adminId ? { markedPaidByAdminId: adminId } : {}),
          ...(note !== undefined ? { note } : {}),
        },
      });
      if (result.count === 0) {
        throw new ConflictException(
          `PAYOUT_RACE: 지급 ${payoutId} 상태가 동시에 변경되었습니다. 현재 상태: ${payout.status}`,
        );
      }
      // Cascade: mark all linked settlements as processedAt
      await tx.settlementRecord.updateMany({
        where: { payoutId },
        data: { processedAt: new Date() },
      });
      return tx.payout.findUniqueOrThrow({
        where: { id: payoutId },
        include: { recipient: { select: { id: true, nickname: true } } },
      });
    });
  }

  /**
   * Marks a pending/processing Payout as failed.
   * Race guard: only transitions from pending or processing.
   *
   * @param payoutId - Payout record ID
   * @param reason - Required failure reason
   * @param note - Optional additional note
   * @param adminId - Optional admin user ID making the change
   */
  async markPayoutFailed(payoutId: string, reason: string, note?: string, adminId?: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException(`지급 ${payoutId}을(를) 찾을 수 없습니다.`);

    if (payout.status === PayoutStatus.failed) return payout;

    const result = await this.prisma.payout.updateMany({
      where: { id: payoutId, status: { in: [PayoutStatus.pending, PayoutStatus.processing] } },
      data: {
        status: PayoutStatus.failed,
        failureReason: reason,
        processedAt: new Date(),
        ...(adminId ? { markedPaidByAdminId: adminId } : {}),
        ...(note !== undefined ? { note } : {}),
      },
    });
    if (result.count === 0) {
      throw new ConflictException(
        `PAYOUT_RACE: 지급 ${payoutId} 상태가 동시에 변경되었습니다. 현재 상태: ${payout.status}`,
      );
    }

    return this.prisma.payout.findUniqueOrThrow({
      where: { id: payoutId },
      include: { recipient: { select: { id: true, nickname: true } } },
    });
  }
}
