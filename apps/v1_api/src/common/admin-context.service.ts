import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'node:crypto';
import { activeDirectorWhere, denyTournamentManagement, getActiveTournamentDirector, type TournamentManagementResource, type V1TournamentManager } from './tournament-management-access';
export type { V1TournamentManager } from './tournament-management-access';

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
  async getActiveAdmin(userId: string, tx?: Prisma.TransactionClient): Promise<V1ActiveAdmin> {
    const admin = await (tx ?? this.prisma).v1AdminUser.findUnique({
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
  async getMutationAdmin(userId: string, tx?: Prisma.TransactionClient): Promise<V1ActiveAdmin> {
    const admin = await this.getActiveAdmin(userId, tx);
    if (admin.adminRole === 'support') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Support admins cannot mutate' });
    }
    return admin;
  }

  async getTournamentAdmin(userId: string, resource: TournamentManagementResource, tx?: Prisma.TransactionClient): Promise<V1TournamentManager> {
    try { return await this.getActiveAdmin(userId, tx); }
    catch (error) { if (!(error instanceof ForbiddenException)) throw error; }
    return getActiveTournamentDirector(tx ?? this.prisma, userId, resource);
  }

  async getTournamentMutationAdmin(userId: string, resource: TournamentManagementResource, tx?: Prisma.TransactionClient): Promise<V1TournamentManager> {
    try { return await this.getMutationAdmin(userId, tx); }
    catch (error) { if (!(error instanceof ForbiddenException)) throw error; }
    return getActiveTournamentDirector(tx ?? this.prisma, userId, resource);
  }

  /** Used only by the tournament management list; platform admin entry remains unchanged. */
  async tournamentManagementWhere(userId: string): Promise<Prisma.V1TournamentWhereInput> {
    try { await this.getActiveAdmin(userId); return {}; }
    catch (error) { if (!(error instanceof ForbiddenException)) throw error; }
    const assignment = await this.prisma.v1TournamentStaffAssignment.findFirst({ where: activeDirectorWhere(userId), select: { id: true } });
    if (!assignment) denyTournamentManagement();
    return { staffAssignments: { some: activeDirectorWhere(userId) } };
  }

  /** Immutable catalogues contain no other tournament's participant or configuration assignment data. */
  async getTournamentCatalogReader(userId: string): Promise<void> {
    try { await this.getActiveAdmin(userId); return; }
    catch (error) { if (!(error instanceof ForbiddenException)) throw error; }
    const assignment = await this.prisma.v1TournamentStaffAssignment.findFirst({ where: activeDirectorWhere(userId), select: { id: true } });
    if (!assignment) throw new ForbiddenException({ code: 'STAFF_SCOPE_DENIED', message: '대회 운영자 권한이 필요해요.' });
  }

  /**
   * V1AdminActionLog 기록 + (toStatus 제공 시) V1StatusChangeLog 동시 기록.
   * tx를 넘기면 호출자 트랜잭션 안에서 원자적으로 기록한다.
   */
  async logAdminAction(
    admin: V1TournamentManager,
    input: AdminActionLogInput,
    tx?: Prisma.TransactionClient,
  ): Promise<AdminActionLogResult> {
    return writeAdminActionLog(tx ?? this.prisma, admin, input);
  }
}

export type AdminActionLogInput = {
  action: string;
  targetType: string;
  targetId: string;
  reason?: string | null;
  beforeJson?: Prisma.InputJsonValue;
  afterJson?: Prisma.InputJsonValue;
  fromStatus?: string | null;
  toStatus?: string;
};

export type AdminActionLogResult = { actionLogId: string; statusChangeLogId: string | null };

/**
 * 서비스 인스턴스 없이 호출자 client(대개 트랜잭션)에 감사 로그를 남긴다. `…InTx` 함수가 쓰고,
 * `logAdminAction` 도 이 함수에 위임하므로 기록 모양은 하나다.
 */
export async function writeAdminActionLog(
  client: Prisma.TransactionClient | PrismaService,
  admin: V1TournamentManager,
  input: AdminActionLogInput,
): Promise<AdminActionLogResult> {
  if (admin.id === null) {
    // Never impersonate a platform admin or manufacture an admin FK for a director.
    // On a transaction client this holds the grant stable until the enclosing mutation commits.
    await client.$queryRaw`SELECT id FROM v1_tournament_staff_assignments WHERE id = ${admin.assignmentId} FOR SHARE`;
    const current = await getActiveTournamentDirector(client, admin.userId, { tournamentId: admin.tournamentId });
    if (current.assignmentId !== admin.assignmentId || current.assignmentVersion !== admin.assignmentVersion) {
      throw new ForbiddenException({ code: 'STAFF_SCOPE_DENIED', message: '대회 배정이 변경됐어요. 다시 확인해 주세요.' });
    }
    const actionLog = await client.v1OperationAudit.create({ data: {
      actorType: 'USER', actorUserId: admin.userId, action: input.action,
      resourceType: input.targetType, resourceId: input.targetId, tournamentId: admin.tournamentId,
      requestId: randomUUID(), reason: input.reason ?? null,
      before: input.beforeJson,
      after: { ...(input.afterJson && typeof input.afterJson === 'object' && !Array.isArray(input.afterJson) ? input.afterJson : {}),
        _authorization: { role: 'tournament_director', assignmentId: admin.assignmentId, assignmentVersion: admin.assignmentVersion } },
    } });
    const statusLog = input.toStatus ? await client.v1StatusChangeLog.create({ data: {
      targetType: input.targetType, targetId: input.targetId, fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus, actorType: 'user', actorUserId: admin.userId, reason: input.reason ?? null,
    } }) : null;
    return { actionLogId: actionLog.id, statusChangeLogId: statusLog?.id ?? null };
  }
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
