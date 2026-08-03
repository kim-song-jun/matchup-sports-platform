import { createHash } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, V1TournamentField } from '@prisma/client';
import {
  OperationAuditWriterService,
  type OperationAuditCreateClient,
} from '../../common/audit/operation-audit-writer.service';
import type { JsonValue, OperationAuditActor } from '../../common/audit/operation-audit.contract';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TournamentStaffAccessService,
  type TournamentStaffPrincipal,
} from '../../tournaments/staff/tournament-staff-access.service';
import type {
  AssignTournamentFixtureFieldDto,
  CreateTournamentFieldDto,
  UpdateTournamentFieldDto,
} from './dto/tournament-operations-field.dto';

export type TournamentOperationsFieldAuditContext = {
  readonly requestId: string;
  readonly sourceIp?: string | null;
};

export type TournamentFieldResult = {
  readonly id: string;
  readonly tournamentId: string;
  readonly scopeKey: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly active: boolean;
  readonly version: number;
};

export type TournamentFixtureFieldResult = {
  readonly fixtureId: string;
  readonly tournamentId: string;
  readonly fieldId: string | null;
};

/**
 * Field/court CRUD + fixture-field assignment (Task 18, this lane's owned
 * scope: apps/v1_api/src/tournament-operations/fields/**).
 *
 * Authorization pattern mirrors the sibling lanes already landed in this
 * worktree (tournament-operations/staff, tournament-operations/lineups):
 * call TournamentStaffAccessService.assertAccess() directly inside the
 * service rather than the declarative TournamentStaffGuard, so this module
 * only needs V1AuthGuard at the controller to establish the authenticated
 * actor.
 *
 * Field CRUD authorization note (contract row 168: "platform_ops;
 * tournament_director read" -- director explicitly excluded from mutation):
 * TOURNAMENT_STAFF_ACTIONS has no action where allowsRoleAction() separates
 * platform_ops from tournament_director (both return true for every action).
 * So field create/update calls assertAccess({action:'event_reverse'}) first
 * (this at least excludes field_operator/support_readonly, who are denied
 * 'event_reverse'), then layers an explicit `principal.role ===
 * 'platform_ops'` check on top -- the exact reasoning TournamentStaffService
 * already documents for its own grant-authority nuances
 * (apps/v1_api/src/tournaments/staff/tournament-staff.service.ts,
 * assertGrantAuthority).
 *
 * Fixture-field assignment (PATCH/DELETE .../fixtures/:fixtureId/field) has
 * no such carve-out in the frozen contract or the plan -- it is a Task
 * 18-introduced write path (user decision 2). Sensible default: treat it as
 * an operational action available to the same principals as any other
 * 'event_reverse' action (platform_ops + tournament_director), scoped to the
 * fixture's tournamentId. This does NOT require platform_ops-only, unlike
 * literal field CRUD, because assigning an existing field to a fixture is
 * day-of-tournament operations work, not field inventory management.
 *
 * assignFixtureField()/clearFixtureField() re-derive the acting principal
 * with TournamentStaffAccessService.assertAccess() as the *first* statement
 * inside the write transaction (Task 18 review finding #8) instead of before
 * `$transaction` opens. This service does not own
 * apps/v1_api/src/tournaments/staff/ so it cannot pass the transaction
 * client into assertAccess() itself, but re-running the same authorization
 * read as late as possible -- immediately before the CAS write, in the same
 * async continuation -- closes the concrete regression the review flags
 * ("revoke the actor, resume, and expect no write"): a revoke that already
 * committed is visible to this recheck's fresh query and aborts the
 * transaction before any row is touched.
 *
 * Both fixture-field writes are also optimistic-concurrency CAS'd against
 * the exact fieldId value this request observed (`where: {..., fieldId:
 * before}`), not a blind `update()`. Postgres re-validates an UPDATE's WHERE
 * clause against the latest committed row when a concurrent transaction has
 * already changed it, so two requests that both observed the same prior
 * fieldId can never both silently win -- the loser's affected-row count is 0
 * and it gets a 409 instead of a swallowed lost update (finding #8).
 *
 * `Idempotency-Key` is enforced as real idempotency, not just an audit
 * correlation id (finding #9): every mutation locks a durable, per-actor
 * scope with `pg_advisory_xact_lock` (mirroring
 * apps/v1_api/src/game-operations/result-escalation-mutation.service.ts),
 * then looks up `V1IdempotencyRecord` (already migrated in
 * 20260729000100_v1_game_operations, no new migration needed here). A replay
 * with the same key and the same request-body hash returns the original,
 * already-committed response without re-applying the mutation; the same key
 * with a different body hash is rejected with 409
 * IDEMPOTENCY_PAYLOAD_CONFLICT instead of silently re-running.
 */
@Injectable()
export class TournamentOperationsFieldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TournamentStaffAccessService,
    private readonly auditWriter: OperationAuditWriterService,
  ) {}

  async list(
    userId: string,
    tournamentId: string,
  ): Promise<{ readonly items: readonly TournamentFieldResult[] }> {
    await this.access.assertAccess({ userId, action: 'read', resource: { tournamentId } });
    await this.assertTournamentExists(tournamentId);

    const fields = await this.prisma.v1TournamentField.findMany({
      where: { tournamentId },
      // `id` is the final tie-breaker so two fields sharing both sortOrder
      // and createdAt still resolve to one total, repeatable order instead
      // of whatever order Postgres happens to return them in (finding #16.2).
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return { items: fields.map((field) => this.serialize(field)) };
  }

  async create(
    actorUserId: string,
    tournamentId: string,
    dto: CreateTournamentFieldDto,
    audit: TournamentOperationsFieldAuditContext,
  ): Promise<TournamentFieldResult> {
    const principal = await this.authorizeFieldManagement(actorUserId, tournamentId);
    await this.assertTournamentExists(tournamentId);

    const action = 'tournament.field.create';
    const resourceType = 'TOURNAMENT_FIELD';
    // No field id exists yet before creation; scope the idempotency record to
    // the tournament instead, disambiguated by the payload hash below (a
    // reused key with a different scopeKey/name/sortOrder is a genuine
    // conflict, not a replay).
    const resourceId = tournamentId;
    const payloadHash = this.hashPayload({
      scopeKey: dto.scopeKey,
      name: dto.name,
      sortOrder: dto.sortOrder ?? 0,
    });

    return this.prisma.$transaction(async (tx) => {
      const replay = await this.consumeIdempotency<TournamentFieldResult>(
        tx,
        actorUserId,
        action,
        resourceType,
        resourceId,
        audit.requestId,
        payloadHash,
      );
      if (replay !== undefined) {
        return replay;
      }

      let field: V1TournamentField;
      try {
        field = await tx.v1TournamentField.create({
          data: {
            tournamentId,
            scopeKey: dto.scopeKey,
            name: dto.name,
            sortOrder: dto.sortOrder ?? 0,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException({
            code: 'FIELD_SCOPE_KEY_DUPLICATE',
            message: '이미 사용 중인 필드 코드예요.',
          });
        }
        throw error;
      }

      await this.writeAudit(tx, principal, audit, {
        action,
        targetType: resourceType,
        targetId: field.id,
        tournamentId,
        fieldId: field.id,
        before: null,
        after: this.auditSnapshot(field),
      });

      const response = this.serialize(field);
      await this.recordIdempotency(
        tx,
        actorUserId,
        action,
        resourceType,
        resourceId,
        audit.requestId,
        payloadHash,
        201,
        response,
      );
      return response;
    });
  }

  async update(
    actorUserId: string,
    tournamentId: string,
    fieldId: string,
    dto: UpdateTournamentFieldDto,
    audit: TournamentOperationsFieldAuditContext,
  ): Promise<TournamentFieldResult> {
    const principal = await this.authorizeFieldManagement(actorUserId, tournamentId);

    // Reject a no-op patch instead of silently manufacturing a new version
    // and audit row for a request that changes nothing (finding #16.1).
    if (dto.name === undefined && dto.sortOrder === undefined && dto.active === undefined) {
      throw new UnprocessableEntityException({
        code: 'FIELD_UPDATE_EMPTY',
        message: '변경할 값을 하나 이상 입력해주세요.',
      });
    }

    const action = 'tournament.field.update';
    const resourceType = 'TOURNAMENT_FIELD';
    const payloadHash = this.hashPayload({
      expectedVersion: dto.expectedVersion,
      name: dto.name ?? null,
      sortOrder: dto.sortOrder ?? null,
      active: dto.active ?? null,
    });

    return this.prisma.$transaction(async (tx) => {
      const replay = await this.consumeIdempotency<TournamentFieldResult>(
        tx,
        actorUserId,
        action,
        resourceType,
        fieldId,
        audit.requestId,
        payloadHash,
      );
      if (replay !== undefined) {
        return replay;
      }

      const before = await tx.v1TournamentField.findUnique({
        where: { tournamentId_id: { tournamentId, id: fieldId } },
      });
      if (before === null) {
        throw new NotFoundException({ code: 'FIELD_NOT_FOUND', message: '필드를 찾을 수 없어요.' });
      }

      const result = await tx.v1TournamentField.updateMany({
        where: { id: fieldId, tournamentId, version: dto.expectedVersion },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }),
          ...(dto.active === undefined ? {} : { active: dto.active }),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ConflictException({
          code: 'STALE_FIELD_VERSION',
          message: '필드 정보가 이미 변경됐어요. 새로고침 후 다시 시도해주세요.',
        });
      }

      const after = await tx.v1TournamentField.findUnique({
        where: { tournamentId_id: { tournamentId, id: fieldId } },
      });
      if (after === null) {
        throw new ConflictException({
          code: 'FIELD_NOT_PERSISTED',
          message: '필드 정보를 다시 불러오지 못했어요.',
        });
      }

      await this.writeAudit(tx, principal, audit, {
        action,
        targetType: resourceType,
        targetId: fieldId,
        tournamentId,
        fieldId,
        before: this.auditSnapshot(before),
        after: this.auditSnapshot(after),
      });

      const response = this.serialize(after);
      await this.recordIdempotency(
        tx,
        actorUserId,
        action,
        resourceType,
        fieldId,
        audit.requestId,
        payloadHash,
        200,
        response,
      );
      return response;
    });
  }

  async assignFixtureField(
    actorUserId: string,
    tournamentId: string,
    fixtureId: string,
    dto: AssignTournamentFixtureFieldDto,
    audit: TournamentOperationsFieldAuditContext,
  ): Promise<TournamentFixtureFieldResult> {
    const action = 'tournament.fixture.field_assign';
    const resourceType = 'TOURNAMENT_FIXTURE_FIELD';
    const payloadHash = this.hashPayload({ fieldId: dto.fieldId });

    return this.prisma.$transaction(async (tx) => {
      // Recheck as the first statement inside the transaction -- see the
      // class doc comment (finding #8). A revoke that committed before this
      // point is visible here and aborts the whole transaction before any
      // fixture row is touched.
      const principal = await this.access.assertAccess({
        userId: actorUserId,
        action: 'event_reverse',
        resource: { tournamentId, fixtureId },
      });

      const replay = await this.consumeIdempotency<TournamentFixtureFieldResult>(
        tx,
        actorUserId,
        action,
        resourceType,
        fixtureId,
        audit.requestId,
        payloadHash,
      );
      if (replay !== undefined) {
        return replay;
      }

      const fixture = await tx.v1TournamentFixture.findUnique({
        where: { tournamentId_id: { tournamentId, id: fixtureId } },
        select: { id: true, tournamentId: true, fieldId: true },
      });
      if (fixture === null) {
        throw new NotFoundException({
          code: 'TOURNAMENT_FIXTURE_NOT_FOUND',
          message: '경기를 찾을 수 없어요.',
        });
      }

      const field = await tx.v1TournamentField.findUnique({
        where: { tournamentId_id: { tournamentId, id: dto.fieldId } },
        select: { id: true },
      });
      if (field === null) {
        throw new NotFoundException({
          code: 'FIELD_NOT_FOUND',
          message: '필드를 찾을 수 없어요.',
        });
      }

      // CAS on the fieldId value this request actually observed instead of a
      // blind update, so a concurrent assignment can never be silently
      // clobbered (lost-update half of finding #8): Postgres re-evaluates
      // this WHERE clause against the latest committed row when another
      // transaction changed it first, so the loser here gets 0 affected rows
      // instead of an accepted-but-overwritten write.
      const before = fixture.fieldId;
      const cas = await tx.v1TournamentFixture.updateMany({
        where: { tournamentId, id: fixtureId, fieldId: before },
        data: { fieldId: dto.fieldId },
      });
      if (cas.count !== 1) {
        throw new ConflictException({
          code: 'FIXTURE_FIELD_ASSIGNMENT_CONFLICT',
          message: '다른 요청이 먼저 경기장을 변경했어요. 새로고침 후 다시 시도해주세요.',
        });
      }

      const after = await tx.v1TournamentFixture.findUnique({
        where: { tournamentId_id: { tournamentId, id: fixtureId } },
        select: { id: true, tournamentId: true, fieldId: true },
      });
      if (after === null) {
        throw new ConflictException({
          code: 'TOURNAMENT_FIXTURE_NOT_PERSISTED',
          message: '경기 정보를 다시 불러오지 못했어요.',
        });
      }

      await this.writeAudit(tx, principal, audit, {
        action,
        targetType: 'TOURNAMENT_FIXTURE',
        targetId: fixtureId,
        tournamentId,
        fixtureId,
        fieldId: after.fieldId,
        before: { fieldId: before },
        after: { fieldId: after.fieldId },
      });

      const response: TournamentFixtureFieldResult = {
        fixtureId: after.id,
        tournamentId: after.tournamentId,
        fieldId: after.fieldId,
      };
      await this.recordIdempotency(
        tx,
        actorUserId,
        action,
        resourceType,
        fixtureId,
        audit.requestId,
        payloadHash,
        200,
        response,
      );
      return response;
    });
  }

  async clearFixtureField(
    actorUserId: string,
    tournamentId: string,
    fixtureId: string,
    audit: TournamentOperationsFieldAuditContext,
  ): Promise<TournamentFixtureFieldResult> {
    const action = 'tournament.fixture.field_clear';
    const resourceType = 'TOURNAMENT_FIXTURE_FIELD';
    const payloadHash = this.hashPayload({ action });

    return this.prisma.$transaction(async (tx) => {
      // Same late recheck as assignFixtureField() -- see finding #8.
      const principal = await this.access.assertAccess({
        userId: actorUserId,
        action: 'event_reverse',
        resource: { tournamentId, fixtureId },
      });

      const replay = await this.consumeIdempotency<TournamentFixtureFieldResult>(
        tx,
        actorUserId,
        action,
        resourceType,
        fixtureId,
        audit.requestId,
        payloadHash,
      );
      if (replay !== undefined) {
        return replay;
      }

      const fixture = await tx.v1TournamentFixture.findUnique({
        where: { tournamentId_id: { tournamentId, id: fixtureId } },
        select: { id: true, tournamentId: true, fieldId: true },
      });
      if (fixture === null) {
        throw new NotFoundException({
          code: 'TOURNAMENT_FIXTURE_NOT_FOUND',
          message: '경기를 찾을 수 없어요.',
        });
      }

      // Same CAS discipline as assignFixtureField() (finding #8): clearing is
      // only ever a no-op race (both converge on fieldId=null), but the CAS
      // still ensures we clear the field we actually observed.
      const before = fixture.fieldId;
      const cas = await tx.v1TournamentFixture.updateMany({
        where: { tournamentId, id: fixtureId, fieldId: before },
        data: { fieldId: null },
      });
      if (cas.count !== 1) {
        throw new ConflictException({
          code: 'FIXTURE_FIELD_ASSIGNMENT_CONFLICT',
          message: '다른 요청이 먼저 경기장을 변경했어요. 새로고침 후 다시 시도해주세요.',
        });
      }

      const after = await tx.v1TournamentFixture.findUnique({
        where: { tournamentId_id: { tournamentId, id: fixtureId } },
        select: { id: true, tournamentId: true, fieldId: true },
      });
      if (after === null) {
        throw new ConflictException({
          code: 'TOURNAMENT_FIXTURE_NOT_PERSISTED',
          message: '경기 정보를 다시 불러오지 못했어요.',
        });
      }

      await this.writeAudit(tx, principal, audit, {
        action,
        targetType: 'TOURNAMENT_FIXTURE',
        targetId: fixtureId,
        tournamentId,
        fixtureId,
        fieldId: before,
        before: { fieldId: before },
        after: { fieldId: null },
      });

      const response: TournamentFixtureFieldResult = {
        fixtureId: after.id,
        tournamentId: after.tournamentId,
        fieldId: after.fieldId,
      };
      await this.recordIdempotency(
        tx,
        actorUserId,
        action,
        resourceType,
        fixtureId,
        audit.requestId,
        payloadHash,
        200,
        response,
      );
      return response;
    });
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async authorizeFieldManagement(
    actorUserId: string,
    tournamentId: string,
  ): Promise<TournamentStaffPrincipal> {
    const principal = await this.access.assertAccess({
      userId: actorUserId,
      action: 'event_reverse',
      resource: { tournamentId },
    });
    if (principal.role !== 'platform_ops') {
      throw new ForbiddenException({
        code: 'FIELD_MANAGEMENT_DENIED',
        message: '필드 관리는 플랫폼 운영자만 할 수 있어요.',
        details: { reason: 'PLATFORM_OPS_REQUIRED' },
      });
    }
    return principal;
  }

  private async assertTournamentExists(tournamentId: string): Promise<void> {
    const tournament = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
      select: { id: true },
    });
    if (tournament === null) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }
  }

  /**
   * Locks a durable, per-(actor, action, resource, key) scope for the
   * remainder of the current transaction and, if a non-expired record
   * already exists for it, returns the original committed response so the
   * caller can replay it instead of re-applying the mutation.
   *
   * The `pg_advisory_xact_lock` (not just the `findUnique` read) is what
   * makes this a durable, race-safe check rather than an application-level
   * TOCTOU: two concurrent requests carrying the same idempotency key
   * serialize on this lock, so the second one always observes whatever the
   * first one committed (or is about to commit) before deciding whether to
   * replay (finding #9).
   *
   * Throws 409 IDEMPOTENCY_PAYLOAD_CONFLICT if the same key is reused with a
   * different request body (`payloadHash` mismatch) instead of silently
   * treating it as a fresh mutation or a valid replay.
   */
  private async consumeIdempotency<T>(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    idempotencyKey: string,
    payloadHash: string,
  ): Promise<T | undefined> {
    const scope = JSON.stringify([actorUserId, action, resourceType, resourceId, idempotencyKey]);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;

    const existing = await tx.v1IdempotencyRecord.findUnique({
      where: {
        actorUserId_action_resourceType_resourceId_idempotencyKey: {
          actorUserId,
          action,
          resourceType,
          resourceId,
          idempotencyKey,
        },
      },
      select: { payloadHash: true, responseBody: true, expiresAt: true },
    });
    if (existing === null || existing.expiresAt <= new Date()) {
      return undefined;
    }
    if (existing.payloadHash !== payloadHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
        message: '같은 Idempotency-Key가 다른 요청 내용과 함께 재사용됐어요.',
      });
    }
    return existing.responseBody as unknown as T;
  }

  private async recordIdempotency(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    idempotencyKey: string,
    payloadHash: string,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void> {
    await tx.v1IdempotencyRecord.create({
      data: {
        actorUserId,
        action,
        resourceType,
        resourceId,
        idempotencyKey,
        payloadHash,
        responseStatus,
        responseBody: responseBody as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
      },
    });
  }

  private hashPayload(payload: unknown): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    principal: TournamentStaffPrincipal,
    audit: TournamentOperationsFieldAuditContext,
    mutation: {
      readonly action: string;
      readonly targetType: string;
      readonly targetId: string;
      readonly tournamentId: string;
      readonly fixtureId?: string | null;
      readonly fieldId?: string | null;
      readonly before: JsonValue;
      readonly after: JsonValue;
    },
  ): Promise<void> {
    const auditClient: OperationAuditCreateClient = {
      v1OperationAudit: {
        create: ({ data }) => tx.v1OperationAudit.create({ data, select: { id: true } }),
      },
    };
    await this.auditWriter.create(auditClient, {
      actor: this.auditActor(principal),
      requestId: audit.requestId,
      sourceIp: audit.sourceIp,
      action: mutation.action,
      targetType: mutation.targetType,
      targetId: mutation.targetId,
      occurredAt: new Date(),
      before: mutation.before,
      after: mutation.after,
      tournamentId: mutation.tournamentId,
      fixtureId: mutation.fixtureId ?? null,
      fieldId: mutation.fieldId ?? null,
    });
  }

  private auditActor(principal: TournamentStaffPrincipal): OperationAuditActor {
    return principal.role === 'platform_ops'
      ? { type: 'PLATFORM_OPS', id: principal.userId }
      : { type: 'TOURNAMENT_STAFF', id: principal.userId };
  }

  private auditSnapshot(field: V1TournamentField): JsonValue {
    return {
      id: field.id,
      tournamentId: field.tournamentId,
      scopeKey: field.scopeKey,
      name: field.name,
      sortOrder: field.sortOrder,
      active: field.active,
      version: field.version,
    } as const;
  }

  private serialize(field: V1TournamentField): TournamentFieldResult {
    return {
      id: field.id,
      tournamentId: field.tournamentId,
      scopeKey: field.scopeKey,
      name: field.name,
      sortOrder: field.sortOrder,
      active: field.active,
      version: field.version,
    };
  }
}
