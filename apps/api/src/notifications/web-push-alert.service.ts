import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  PUSH_ALERT_WINDOW_MS,
  PUSH_ALERT_COUNT_THRESHOLD,
  PUSH_ALERT_CRON_DISABLED_ENV,
} from '../common/constants/ops';

@Injectable()
export class WebPushAlertService implements OnModuleInit {
  private readonly logger = new Logger(WebPushAlertService.name);
  private webhookUrl: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.webhookUrl = this.config.get<string>('OPS_ALERT_WEBHOOK_URL') ?? undefined;
  }

  /**
   * Runs every minute. Counts web push failures in the rolling window and
   * fires an external alert when the threshold is exceeded.
   *
   * Disable by setting env var: DISABLE_OPS_ALERT_CRON=true
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkAndAlert(): Promise<void> {
    if (process.env[PUSH_ALERT_CRON_DISABLED_ENV] === 'true') {
      return;
    }

    const windowStart = new Date(Date.now() - PUSH_ALERT_WINDOW_MS);

    const [failureCount, ackedCount] = await Promise.all([
      this.prisma.webPushFailureLog.count({
        where: { occurredAt: { gte: windowStart } },
      }),
      this.prisma.webPushFailureLog.count({
        where: {
          occurredAt: { gte: windowStart },
          acknowledgedAt: { not: null },
        },
      }),
    ]);

    if (failureCount < PUSH_ALERT_COUNT_THRESHOLD) {
      return;
    }

    // If any failure in this window has already been acknowledged, suppress duplicate alert
    if (ackedCount > 0) {
      return;
    }

    await this.sendAlert(failureCount);
  }

  private async sendAlert(failureCount: number): Promise<void> {
    const message = `web push failure burst: ${failureCount}/5min (threshold ${PUSH_ALERT_COUNT_THRESHOLD})`;

    if (this.webhookUrl) {
      try {
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: message }),
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
          this.logger.error(`Slack webhook returned non-2xx status: ${response.status}`);
        }
      } catch (err) {
        // Webhook delivery failure must not throw — log and fall back to logger
        this.logger.error(`Slack webhook delivery failed: ${err instanceof Error ? err.message : String(err)}`);
        this.logger.error(message);
      }
    } else {
      this.logger.error(`${message} — set OPS_ALERT_WEBHOOK_URL for external alert`);
    }
  }
}
