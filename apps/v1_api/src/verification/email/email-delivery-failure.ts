import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OtpEmailPurpose } from './otp-email-template';

/** Outbox event type the worker turns into a Slack message. */
export const EMAIL_DELIVERY_FAILED_TYPE = 'EMAIL_DELIVERY_FAILED';

/**
 * Failures inside one window share a single alert, so a broken mail setup pages once an hour, not once per request.
 * Windows are fixed UTC hours: a burst across :00 yields two alerts, and failures after the worker claimed an
 * event are not counted.
 */
export const EMAIL_FAILURE_WINDOW_MS = 60 * 60_000;

/** The alert waits this long after the window's first failure so a burst is counted in one message. */
export const EMAIL_FAILURE_ALERT_DELAY_MS = 60_000;

export interface EmailDeliveryFailedPayload {
  windowStart: string;
  failureCount: number;
  /** Error class name of the window's first failure, e.g. `AccessDeniedException`. Never the message. */
  errorName: string;
  /** Failures per mail purpose. */
  purposes: Partial<Record<OtpEmailPurpose, number>>;
}

const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/;

/** Only a plain identifier reaches Slack; anything else (a message-like name, an address) becomes `UnknownError`. */
export function emailFailureErrorName(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  return SAFE_ERROR_NAME.test(name) ? name : 'UnknownError';
}

/**
 * Counts one failed mail send into the current window's outbox event, creating it on the window's first
 * failure. Later failures only raise the counters while the event is still waiting; once the worker has
 * claimed it they are folded away silently. The advisory lock serializes concurrent failures the way
 * login-spray detection does, so two requests cannot both create or overwrite each other's counts.
 */
export async function recordEmailDeliveryFailure(
  prisma: Pick<PrismaService, '$transaction'>,
  input: { purpose: OtpEmailPurpose; error: unknown; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  const windowStart = new Date(Math.floor(now.getTime() / EMAIL_FAILURE_WINDOW_MS) * EMAIL_FAILURE_WINDOW_MS);
  const businessKey = `email-delivery-failed:${windowStart.toISOString()}`;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${businessKey}, 0))`;
    const existing = await tx.v1OutboxEvent.findUnique({
      where: { businessKey },
      select: { id: true, status: true, payload: true },
    });

    if (!existing) {
      const payload: EmailDeliveryFailedPayload = {
        windowStart: windowStart.toISOString(),
        failureCount: 1,
        errorName: emailFailureErrorName(input.error),
        purposes: { [input.purpose]: 1 },
      };
      await tx.v1OutboxEvent.create({
        data: {
          businessKey,
          aggregateType: 'EMAIL_DELIVERY',
          aggregateId: payload.windowStart,
          type: EMAIL_DELIVERY_FAILED_TYPE,
          payload: payload as unknown as Prisma.InputJsonValue,
          availableAt: new Date(now.getTime() + EMAIL_FAILURE_ALERT_DELAY_MS),
        },
      });
      return;
    }

    if (existing.status !== 'PENDING') return;
    const current = existing.payload as unknown as EmailDeliveryFailedPayload;
    const next: EmailDeliveryFailedPayload = {
      ...current,
      failureCount: current.failureCount + 1,
      purposes: { ...current.purposes, [input.purpose]: (current.purposes[input.purpose] ?? 0) + 1 },
    };
    await tx.v1OutboxEvent.updateMany({
      where: { id: existing.id, status: 'PENDING' },
      data: { payload: next as unknown as Prisma.InputJsonValue },
    });
  });
}
