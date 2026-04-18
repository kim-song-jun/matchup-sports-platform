import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MarketplaceService } from './marketplace.service';
import { DisputeStatus, OrderStatus } from '@prisma/client';

/** Terminal dispute statuses — orders with only these (or no) disputes are eligible for auto-release. */
const RESOLVED_DISPUTE_STATUSES: DisputeStatus[] = [
  DisputeStatus.resolved_refund,
  DisputeStatus.resolved_release,
  DisputeStatus.resolved_partial,
  DisputeStatus.dismissed,
];

@Injectable()
export class MarketplaceCron {
  private readonly logger = new Logger(MarketplaceCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketplaceService: MarketplaceService,
  ) {}

  /**
   * Runs every 10 minutes. Finds orders whose auto-release deadline has passed
   * and no open (unresolved) dispute blocks them, then releases escrow.
   *
   * Disable by setting env var: DISABLE_MARKETPLACE_CRON=true
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async autoReleaseEscrow() {
    if (process.env.DISABLE_MARKETPLACE_CRON === 'true') {
      return;
    }

    const now = new Date();

    // Find orders eligible for auto-release:
    //   - status is escrow_held, shipped, or delivered
    //   - autoReleaseAt <= now (deadline has passed)
    //   - no open dispute (disputes that are NOT in a resolved/dismissed terminal state)
    const candidates = await this.prisma.marketplaceOrder.findMany({
      where: {
        status: { in: [OrderStatus.escrow_held, OrderStatus.shipped, OrderStatus.delivered] },
        autoReleaseAt: { lte: now },
        disputes: {
          none: {
            status: { notIn: RESOLVED_DISPUTE_STATUSES },
          },
        },
      },
      select: { id: true, orderId: true },
    });

    if (candidates.length === 0) return;

    this.logger.log(`Auto-release sweeper: ${candidates.length} candidates`);

    for (const order of candidates) {
      try {
        await this.marketplaceService.autoRelease(order.id);
        this.logger.log(`Auto-released order ${order.orderId}`);
      } catch (err) {
        this.logger.error(`Auto-release failed for order ${order.orderId}: ${err}`);
      }
    }
  }
}
