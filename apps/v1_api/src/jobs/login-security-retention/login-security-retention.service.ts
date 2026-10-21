import type { Prisma } from '@prisma/client';
import { LOGIN_SECURITY_POLICY } from '../../auth/login-security/login-security.policy';
import type { PrismaService } from '../../prisma/prisma.service';
import type { GameOperationHandler } from '../v1-game-operations-worker.service';

export const LOGIN_SECURITY_RETENTION_SCAN_TYPE = 'LOGIN_SECURITY_RETENTION_SCAN';

const SCAN_INTERVAL_MS = 6 * 60 * 60_000;

/**
 * Keeps the login-hardening tables bounded: attempt rows after 30 days, step-up challenges 7 days after
 * they expired. Self-rescheduling like the other worker scans, so no second scheduler is involved.
 */
export class LoginSecurityRetentionService {
  constructor(private readonly prisma: PrismaService) {}

  /** The next slot is committed in its own transaction first, so a failing purge cannot break the chain. */
  readonly scanHandler: GameOperationHandler = async (_claim, tx) => {
    const now = new Date();
    await this.prisma.$transaction((scheduleTx) => scheduleNextLoginSecurityRetentionScan(scheduleTx, now));
    await purgeLoginSecurityRecords(tx, now);
  };
}

export async function purgeLoginSecurityRecords(
  tx: Prisma.TransactionClient,
  now: Date,
): Promise<{ attempts: number; challenges: number }> {
  const attempts = await tx.v1LoginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - LOGIN_SECURITY_POLICY.attemptRetentionMs) } },
  });
  const challenges = await tx.v1LoginStepUpChallenge.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - LOGIN_SECURITY_POLICY.challengeRetentionMs) } },
  });
  return { attempts: attempts.count, challenges: challenges.count };
}

/** Same slot key means one row, so worker restarts and replicas never multiply the chain. */
export async function scheduleNextLoginSecurityRetentionScan(tx: Prisma.TransactionClient, now: Date): Promise<void> {
  const nextSlot = new Date(Math.floor(now.getTime() / SCAN_INTERVAL_MS) * SCAN_INTERVAL_MS + SCAN_INTERVAL_MS);
  await tx.v1OutboxEvent.createMany({
    data: [
      {
        businessKey: `login-security-retention-scan:${nextSlot.toISOString()}`,
        aggregateType: 'SECURITY',
        aggregateId: 'login-security-retention-scan',
        type: LOGIN_SECURITY_RETENTION_SCAN_TYPE,
        payload: { scheduledFor: nextSlot.toISOString() },
        availableAt: nextSlot,
      },
    ],
    skipDuplicates: true,
  });
}
