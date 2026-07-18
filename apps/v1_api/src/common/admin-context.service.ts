import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type V1ActiveAdmin = {
  id: string;
  userId: string;
  adminRole: 'owner' | 'ops' | 'support';
  status: 'active';
};

/**
 * 어드민 신원 확인 + 감사 로그 공용 헬퍼.
 *
 * 신규 어드민 도메인(대회 등)이 AdminService의 private 헬퍼를 복제하지 않도록
 * go-forward 패턴으로 제공한다. V1AdminUser 조회/등급 게이트 + V1AdminActionLog
 * (+옵션 V1StatusChangeLog) 기록을 단일 경로로 묶는다.
 */
@Injectable()
export class AdminContextService {
  constructor(private readonly prisma: PrismaService) {}

  /** 관리자 권한과 연결된 사용자 계정이 모두 active일 때만 통과. */
  async getActiveAdmin(userId: string): Promise<V1ActiveAdmin> {
    const admin = await this.prisma.v1AdminUser.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        adminRole: true,
        status: true,
        user: { select: { accountStatus: true } },
      },
    });
    if (!admin || admin.status !== 'active' || admin.user.accountStatus !== 'active') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Active admin access is required' });
    }
    return {
      id: admin.id,
      userId: admin.userId,
      adminRole: admin.adminRole,
      status: 'active',
    };
  }

  /** support 등급은 mutation(생성/수정/상태변경) 불가 — ops·owner만 허용. */
  async getMutationAdmin(userId: string): Promise<V1ActiveAdmin> {
    const admin = await this.getActiveAdmin(userId);
    if (admin.adminRole === 'support') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Support admins cannot mutate' });
    }
    return admin;
  }

  /**
   * V1AdminActionLog 기록 + (toStatus 제공 시) V1StatusChangeLog 동시 기록.
   * tx를 넘기면 호출자 트랜잭션 안에서 원자적으로 기록한다.
   */
  async logAdminAction(
    admin: V1ActiveAdmin,
    input: {
      action: string;
      targetType: string;
      targetId: string;
      reason?: string | null;
      beforeJson?: Prisma.InputJsonValue;
      afterJson?: Prisma.InputJsonValue;
      fromStatus?: string | null;
      toStatus?: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<{ actionLogId: string; statusChangeLogId: string | null }> {
    const client = tx ?? this.prisma;
    const actionLog = await client.v1AdminActionLog.create({
      data: {
        adminUserId: admin.id,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason ?? null,
        beforeJson: input.beforeJson,
        afterJson: input.afterJson,
      },
    });

    let statusChangeLogId: string | null = null;
    if (input.toStatus) {
      const statusLog = await client.v1StatusChangeLog.create({
        data: {
          targetType: input.targetType,
          targetId: input.targetId,
          fromStatus: input.fromStatus ?? null,
          toStatus: input.toStatus,
          actorType: 'admin',
          adminUserId: admin.id,
          reason: input.reason ?? null,
        },
      });
      statusChangeLogId = statusLog.id;
    }

    return { actionLogId: actionLog.id, statusChangeLogId };
  }
}
