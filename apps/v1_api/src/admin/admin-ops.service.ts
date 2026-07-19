import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService, V1ActiveAdmin } from '../common/admin-context.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

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

  async acknowledgeFailures(ids: string[], admin: V1ActiveAdmin): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // updateMany는 몇 건이 바뀌었는지(count)만 알려주고 어떤 id가 실제로 바뀌었는지는
      // 알려주지 않는다 — 감사 로그가 실제 상태 변경과 어긋나지 않도록, 대상 id를 먼저
      // 조회해 그 id들에 대해서만 업데이트+로그를 남긴다.
      const toAck = await tx.v1WebPushFailureLog.findMany({
        where: { id: { in: ids }, acknowledgedAt: null },
        select: { id: true },
      });
      if (toAck.length === 0) return;

      await tx.v1WebPushFailureLog.updateMany({
        where: { id: { in: toAck.map((row) => row.id) } },
        data: { acknowledgedAt: new Date(), acknowledgedBy: admin.userId },
      });

      // 감사 로그를 같은 트랜잭션에 묶어, 로그 기록 실패로 ack 자체가 부분 커밋된
      // 채로 500이 나는 상황(updateMany는 이미 커밋됐는데 응답만 실패)을 막는다.
      for (const { id } of toAck) {
        await this.adminContext.logAdminAction(
          admin,
          { action: 'web_push_failure_log.ack', targetType: 'web_push_failure_log', targetId: id },
          tx,
        );
      }
    });
  }

  async pushFailuresLast5Minutes(): Promise<number> {
    return this.prisma.v1WebPushFailureLog.count({
      where: { occurredAt: { gte: new Date(Date.now() - 5 * 60_000) } },
    });
  }
}
