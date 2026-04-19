import { PrismaClient, WebPushFailureLog } from '@prisma/client';

/**
 * Creates a WebPushFailureLog record in the database.
 * endpointSuffix is limited to 6 chars per schema constraint.
 */
export async function createWebPushFailure(
  prisma: PrismaClient,
  userId: string,
  overrides: Partial<{
    statusCode: number;
    errorCode: string;
    endpointSuffix: string;
    occurredAt: Date;
    acknowledgedAt: Date;
    acknowledgedBy: string;
  }> = {},
): Promise<WebPushFailureLog> {
  return prisma.webPushFailureLog.create({
    data: {
      userId,
      statusCode: overrides.statusCode ?? 500,
      errorCode: overrides.errorCode ?? null,
      endpointSuffix: (overrides.endpointSuffix ?? 'abc123').slice(0, 6),
      occurredAt: overrides.occurredAt ?? new Date(),
      acknowledgedAt: overrides.acknowledgedAt ?? null,
      acknowledgedBy: overrides.acknowledgedBy ?? null,
    },
  });
}
