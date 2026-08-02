import { ConflictException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ResultEscalationActionDto } from './dto/result-escalation.dto';
import { ResultEscalationAccessService } from './result-escalation-access.service';
import { escalationAuditValue, escalationView } from './result-escalation.types';

@Injectable()
export class ResultEscalationMutationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ResultEscalationAccessService,
  ) {}

  mutate(
    target: 'ACKNOWLEDGED' | 'RESOLVED',
    userId: string,
    tournamentId: string,
    escalationId: string,
    dto: ResultEscalationActionDto,
    idempotencyKey: string,
  ) {
    const reason = dto.reason.trim();
    if (reason.length === 0) {
      throw new ConflictException({
        code: 'ESCALATION_REASON_REQUIRED',
        message: 'Escalation action reason is required',
      });
    }
    const requestId = idempotencyKey;
    const action = target === 'ACKNOWLEDGED'
      ? 'RESULT_ESCALATION_ACKNOWLEDGED'
      : 'RESULT_ESCALATION_RESOLVED';
    const payloadHash = createHash('sha256')
      .update(JSON.stringify({ expectedVersion: dto.expectedVersion, reason, target }))
      .digest('hex');
    return this.prisma.$transaction(async (tx) => {
      await this.lockIdempotency(tx, userId, action, escalationId, requestId);
      const replay = await tx.v1IdempotencyRecord.findUnique({
        where: {
          actorUserId_action_resourceType_resourceId_idempotencyKey: {
            actorUserId: userId,
            action,
            resourceType: 'RESULT_ESCALATION',
            resourceId: escalationId,
            idempotencyKey: requestId,
          },
        },
        select: { payloadHash: true, responseBody: true, expiresAt: true },
      });
      if (replay !== null && replay.expiresAt > new Date()) {
        if (replay.payloadHash !== payloadHash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
            message: 'Idempotency key was already used with a different payload',
          });
        }
        return { ...(replay.responseBody as Prisma.JsonObject), replayed: true };
      }
      const role = await this.access.role(tx, userId, tournamentId);
      if (target === 'RESOLVED' && role !== 'PLATFORM_OPS') this.access.deny();
      const row = await this.access.row(tx, tournamentId, escalationId, role, true);
      this.assertTransition(row.version, row.status, dto.expectedVersion, target);
      const updated = await this.update(tx, escalationId, userId, reason, dto.expectedVersion, target);
      if (updated !== 1) {
        throw new ConflictException({
          code: 'ESCALATION_VERSION_CONFLICT',
          message: 'Escalation version changed during the action',
        });
      }
      const after = await this.access.row(tx, tournamentId, escalationId, role, false);
      await tx.v1OperationAudit.create({
        data: {
          id: randomUUID(),
          actorType: 'USER',
          actorUserId: userId,
          action,
          resourceType: 'RESULT_ESCALATION',
          resourceId: escalationId,
          requestId,
          before: escalationAuditValue(escalationView(row)),
          after: escalationAuditValue(escalationView(after)),
          reason,
          tournamentId,
        },
      });
      const response = { ...escalationView(after), replayed: false };
      await tx.v1IdempotencyRecord.create({
        data: {
          actorUserId: userId,
          action,
          resourceType: 'RESULT_ESCALATION',
          resourceId: escalationId,
          idempotencyKey: requestId,
          payloadHash,
          responseStatus: 200,
          responseBody: { ...escalationAuditValue(escalationView(after)), replayed: false },
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
        },
      });
      return response;
    });
  }

  private async lockIdempotency(
    tx: Prisma.TransactionClient,
    userId: string,
    action: string,
    escalationId: string,
    requestId: string,
  ): Promise<void> {
    const scope = JSON.stringify([userId, action, 'RESULT_ESCALATION', escalationId, requestId]);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
  }

  private assertTransition(
    version: number,
    status: string,
    expectedVersion: number,
    target: 'ACKNOWLEDGED' | 'RESOLVED',
  ): void {
    if (version !== expectedVersion) {
      throw new ConflictException({
        code: 'ESCALATION_VERSION_CONFLICT',
        message: 'Escalation version is stale',
        details: { expectedVersion, currentVersion: version },
      });
    }
    if (status === 'CLOSED' || status === 'RESOLVED') {
      throw new ConflictException({ code: 'ESCALATION_TERMINAL', message: 'Escalation is already terminal' });
    }
    if (target === 'ACKNOWLEDGED' && status !== 'PENDING') {
      throw new ConflictException({
        code: 'ESCALATION_STATE_CONFLICT',
        message: 'Only pending escalations can be acknowledged',
      });
    }
  }

  private update(
    tx: Prisma.TransactionClient,
    escalationId: string,
    userId: string,
    reason: string,
    expectedVersion: number,
    target: 'ACKNOWLEDGED' | 'RESOLVED',
  ): Promise<number> {
    return target === 'ACKNOWLEDGED'
      ? tx.$executeRaw`
          UPDATE v1_result_escalations
          SET status = 'ACKNOWLEDGED'::"V1EscalationStatus", ack_by_user_id = ${userId},
              reason = ${reason}, version = version + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${escalationId} AND version = ${expectedVersion}
        `
      : tx.$executeRaw`
          UPDATE v1_result_escalations
          SET status = 'RESOLVED'::"V1EscalationStatus", resolved_by_user_id = ${userId},
              reason = ${reason}, version = version + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${escalationId} AND version = ${expectedVersion}
        `;
  }
}
