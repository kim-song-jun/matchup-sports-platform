import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LOGIN_SECURITY_POLICY,
  LOGIN_SPRAY_ANOMALY_KIND,
  SECURITY_LOGIN_ANOMALY_TYPE,
  loginEmailKey,
  type LoginAttemptKeys,
} from './login-security.policy';

type LoginAttemptResultValue = 'success' | 'failed' | 'step_up_issued';

export interface SprayDetectionOutcome {
  detected: boolean;
  /** True only when this call opened a new anomaly (and queued the Slack alert). */
  opened: boolean;
}

export interface LoginAnomalyOutboxPayload {
  anomalyId: string;
  startedAt: string;
  failedCount: number;
  accountCount: number;
  ipCount: number;
  windowMinutes: number;
}

/**
 * Records email-login attempts and answers the two questions that decide whether a login needs an email
 * code: is this email accumulating failures, and is a spray attack in progress.
 */
@Injectable()
export class LoginSecurityService implements OnApplicationShutdown {
  private readonly logger = new Logger(LoginSecurityService.name);
  private readonly inFlightDetections = new Set<Promise<unknown>>();

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([...this.inFlightDetections]);
  }

  async record(result: LoginAttemptResultValue, keys: LoginAttemptKeys, now = new Date()): Promise<void> {
    await this.prisma.v1LoginAttempt.create({
      data: { emailKey: keys.emailKey, ipKey: keys.ipKey, result, createdAt: now },
    });
  }

  /**
   * Drops everything that restricts this email's login: failure streak, step-up send count and open
   * challenges. Called when the owner proves the mailbox and sets a new password, so someone who knows the
   * old password cannot keep the owner out by burning the daily send cap. An active spray attack is not
   * per-email state and stays in force.
   */
  async forgetEmail(normalizedEmail: string): Promise<void> {
    const emailKey = loginEmailKey(normalizedEmail);
    await this.prisma.$transaction([
      this.prisma.v1LoginAttempt.deleteMany({ where: { emailKey } }),
      this.prisma.v1LoginStepUpChallenge.deleteMany({ where: { emailKey } }),
    ]);
  }

  /** Both conditions are always queried so the check costs the same whichever one decides. */
  async isStepUpRequired(emailKey: string, now = new Date()): Promise<boolean> {
    const accountWindowStart = new Date(now.getTime() - LOGIN_SECURITY_POLICY.accountFailureWindowMs);
    const [lastSuccess, attackActive] = await Promise.all([
      this.prisma.v1LoginAttempt.findFirst({
        where: { emailKey, result: 'success', createdAt: { gt: accountWindowStart } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.isAttackActive(now),
    ]);
    // A completed login ends the account's failure streak.
    const failuresSince = lastSuccess?.createdAt ?? accountWindowStart;
    const failures = await this.prisma.v1LoginAttempt.count({
      where: { emailKey, result: 'failed', createdAt: { gt: failuresSince } },
    });
    return failures >= LOGIN_SECURITY_POLICY.accountFailureThreshold || attackActive;
  }

  async isAttackActive(now = new Date()): Promise<boolean> {
    const active = await this.prisma.v1SecurityAnomaly.findFirst({
      where: {
        kind: LOGIN_SPRAY_ANOMALY_KIND,
        lastDetectedAt: { gt: new Date(now.getTime() - LOGIN_SECURITY_POLICY.sprayActiveMs) },
      },
      select: { id: true },
    });
    return active !== null;
  }

  /**
   * Fire-and-forget: detection must not add time to the login response, and a failure here must not
   * turn a wrong password into a 500. Errors are logged, never swallowed silently.
   */
  scheduleSprayDetection(): void {
    const detection = this.detectSpray().catch((error: unknown) => {
      this.logger.error(`spray detection failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    this.inFlightDetections.add(detection);
    void detection.finally(() => this.inFlightDetections.delete(detection));
  }

  async detectSpray(now = new Date()): Promise<SprayDetectionOutcome> {
    const since = new Date(now.getTime() - LOGIN_SECURITY_POLICY.sprayWindowMs);
    const [row] = await this.prisma.$queryRaw<Array<{ failed: number; accounts: number; ips: number }>>(Prisma.sql`
      SELECT count(*)::int AS failed,
             count(DISTINCT email_key)::int AS accounts,
             count(DISTINCT ip_key)::int AS ips
      FROM v1_login_attempts
      WHERE result = 'failed' AND created_at > ${since}
    `);
    if (
      !row ||
      row.failed < LOGIN_SECURITY_POLICY.sprayFailureThreshold ||
      row.accounts < LOGIN_SECURITY_POLICY.sprayAccountThreshold
    ) {
      return { detected: false, opened: false };
    }

    const opened = await this.prisma.$transaction(async (tx) => {
      // Serializes concurrent detections so one attack opens exactly one anomaly and one alert.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'login-spray-anomaly'}, 0))`;
      const ongoing = await tx.v1SecurityAnomaly.findFirst({
        where: {
          kind: LOGIN_SPRAY_ANOMALY_KIND,
          lastDetectedAt: { gt: new Date(now.getTime() - LOGIN_SECURITY_POLICY.sprayActiveMs) },
        },
        orderBy: { lastDetectedAt: 'desc' },
        select: { id: true },
      });
      const counts = { failedCount: row.failed, accountCount: row.accounts, ipCount: row.ips };
      if (ongoing) {
        await tx.v1SecurityAnomaly.update({ where: { id: ongoing.id }, data: { lastDetectedAt: now, ...counts } });
        return false;
      }
      const anomaly = await tx.v1SecurityAnomaly.create({
        data: { kind: LOGIN_SPRAY_ANOMALY_KIND, startedAt: now, lastDetectedAt: now, ...counts },
      });
      const payload: LoginAnomalyOutboxPayload = {
        anomalyId: anomaly.id,
        startedAt: now.toISOString(),
        failedCount: row.failed,
        accountCount: row.accounts,
        ipCount: row.ips,
        windowMinutes: LOGIN_SECURITY_POLICY.sprayWindowMs / 60_000,
      };
      await tx.v1OutboxEvent.create({
        data: {
          businessKey: `security:login-anomaly:${anomaly.id}:slack`,
          aggregateType: 'SECURITY_ANOMALY',
          aggregateId: anomaly.id,
          type: SECURITY_LOGIN_ANOMALY_TYPE,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
      return true;
    });
    return { detected: true, opened };
  }
}
