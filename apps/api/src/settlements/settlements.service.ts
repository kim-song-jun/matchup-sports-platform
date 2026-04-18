import { Injectable, NotFoundException } from '@nestjs/common';
import { SettlementStatus, SettlementType } from '@prisma/client';
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
}
