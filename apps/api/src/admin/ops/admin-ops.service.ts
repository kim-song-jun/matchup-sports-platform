import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  DisputeStatus,
  MatchStatus,
  PaymentStatus,
  PayoutStatus,
  SettlementStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PUSH_ALERT_WINDOW_MS } from '../../common/constants/ops';
import { AdminOpsSummaryDto } from './dto/admin-ops-summary.dto';
import { RecentPushFailureDto } from './dto/recent-push-failure.dto';

/** Hashes a userId to an 8-char hex string for safe external display. */
function hashUserId(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 8);
}

@Injectable()
export class AdminOpsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns all 6 KPI counters in parallel via Promise.all. */
  async getSummary(): Promise<AdminOpsSummaryDto> {
    const windowStart = new Date(Date.now() - PUSH_ALERT_WINDOW_MS);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      matchesInProgress,
      paymentsPending,
      disputesOpen,
      settlementsPending,
      payoutsFailed,
      pushFailures5m,
    ] = await Promise.all([
      this.prisma.match.count({
        where: { status: MatchStatus.in_progress },
      }),
      this.prisma.payment.count({
        where: {
          status: PaymentStatus.pending,
          createdAt: { gt: yesterday },
        },
      }),
      this.prisma.dispute.count({
        where: {
          status: {
            in: [
              DisputeStatus.filed,
              DisputeStatus.seller_responded,
              DisputeStatus.admin_reviewing,
            ],
          },
        },
      }),
      this.prisma.settlementRecord.count({
        where: {
          status: { in: [SettlementStatus.pending, SettlementStatus.held] },
          payoutId: null,
        },
      }),
      this.prisma.payout.count({
        where: { status: PayoutStatus.failed },
      }),
      this.prisma.webPushFailureLog.count({
        where: {
          occurredAt: { gt: windowStart },
          acknowledgedAt: null,
        },
      }),
    ]);

    return {
      matchesInProgress,
      paymentsPending,
      disputesOpen,
      settlementsPending,
      payoutsFailed,
      pushFailures5m,
    };
  }

  /** Returns recent push failure records with PII stripped. */
  async getRecentPushFailures(limit = 20): Promise<RecentPushFailureDto[]> {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const rows = await this.prisma.webPushFailureLog.findMany({
      orderBy: { occurredAt: 'desc' },
      take: safeLimit,
      select: {
        id: true,
        userId: true,
        endpointSuffix: true,
        statusCode: true,
        errorCode: true,
        occurredAt: true,
        acknowledgedAt: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      endpointSuffix: row.endpointSuffix,
      userIdHash: hashUserId(row.userId),
      statusCode: row.statusCode,
      errorCode: row.errorCode,
      occurredAt: row.occurredAt,
      acknowledgedAt: row.acknowledgedAt,
    }));
  }

  /**
   * Acknowledges push failure log entries.
   * If ids is provided, acknowledges only those records.
   * If ids is absent or empty, acknowledges all unacknowledged records within the alert window.
   */
  async ackPushFailures(
    adminId: string,
    ids?: string[],
  ): Promise<{ acknowledged: number }> {
    const now = new Date();
    const windowStart = new Date(Date.now() - PUSH_ALERT_WINDOW_MS);

    const where =
      ids && ids.length > 0
        ? { id: { in: ids }, acknowledgedAt: null }
        : { occurredAt: { gt: windowStart }, acknowledgedAt: null };

    const result = await this.prisma.webPushFailureLog.updateMany({
      where,
      data: { acknowledgedAt: now, acknowledgedBy: adminId },
    });

    return { acknowledged: result.count };
  }

}
