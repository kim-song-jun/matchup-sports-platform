import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface PushFailureSummary {
  id: string;
  userIdHash: string;
  endpointSuffix: string;
  statusCode: number | null;
  occurredAt: Date;
  acknowledgedAt: Date | null;
}

@Injectable()
export class AdminOpsService {
  constructor(private readonly prisma: PrismaService) {}

  async recentPushFailures(limit: number): Promise<PushFailureSummary[]> {
    const failures = await this.prisma.v1WebPushFailureLog.findMany({
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });

    return failures.map((failure) => ({
      id: failure.id,
      userIdHash: createHash('sha256').update(failure.userId).digest('hex').slice(0, 8),
      endpointSuffix: failure.endpointSuffix.slice(-6),
      statusCode: failure.statusCode,
      occurredAt: failure.occurredAt,
      acknowledgedAt: failure.acknowledgedAt,
    }));
  }

  async acknowledgeFailures(ids: string[], acknowledgedBy: string): Promise<void> {
    await this.prisma.v1WebPushFailureLog.updateMany({
      where: { id: { in: ids }, acknowledgedAt: null },
      data: { acknowledgedAt: new Date(), acknowledgedBy },
    });
  }

  async pushFailuresLast5Minutes(): Promise<number> {
    return this.prisma.v1WebPushFailureLog.count({
      where: { occurredAt: { gte: new Date(Date.now() - 5 * 60_000) } },
    });
  }
}
