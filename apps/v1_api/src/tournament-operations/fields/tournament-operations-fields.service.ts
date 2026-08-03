import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
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

    const created = await this.prisma.$transaction(async (tx) => {
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
        action: 'tournament.field.create',
        targetType: 'TOURNAMENT_FIELD',
        targetId: field.id,
        tournamentId,
        fieldId: field.id,
        before: null,
        after: this.auditSnapshot(field),
      });
      return field;
    });

    return this.serialize(created);
  }

  async update(
    actorUserId: string,
    tournamentId: string,
    fieldId: string,
    dto: UpdateTournamentFieldDto,
    audit: TournamentOperationsFieldAuditContext,
  ): Promise<TournamentFieldResult> {
    const principal = await this.authorizeFieldManagement(actorUserId, tournamentId);

    const updated = await this.prisma.$transaction(async (tx) => {
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
        action: 'tournament.field.update',
        targetType: 'TOURNAMENT_FIELD',
        targetId: fieldId,
        tournamentId,
        fieldId,
        before: this.auditSnapshot(before),
        after: this.auditSnapshot(after),
      });
      return after;
    });

    return this.serialize(updated);
  }

  async assignFixtureField(
    actorUserId: string,
    tournamentId: string,
    fixtureId: string,
    dto: AssignTournamentFixtureFieldDto,
    audit: TournamentOperationsFieldAuditContext,
  ): Promise<TournamentFixtureFieldResult> {
    const principal = await this.access.assertAccess({
      userId: actorUserId,
      action: 'event_reverse',
      resource: { tournamentId, fixtureId },
    });

    const updated = await this.prisma.$transaction(async (tx) => {
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

      const before = fixture.fieldId;
      const after = await tx.v1TournamentFixture.update({
        where: { tournamentId_id: { tournamentId, id: fixtureId } },
        data: { fieldId: dto.fieldId },
        select: { id: true, tournamentId: true, fieldId: true },
      });

      await this.writeAudit(tx, principal, audit, {
        action: 'tournament.fixture.field_assign',
        targetType: 'TOURNAMENT_FIXTURE',
        targetId: fixtureId,
        tournamentId,
        fixtureId,
        fieldId: after.fieldId,
        before: { fieldId: before },
        after: { fieldId: after.fieldId },
      });
      return after;
    });

    return { fixtureId: updated.id, tournamentId: updated.tournamentId, fieldId: updated.fieldId };
  }

  async clearFixtureField(
    actorUserId: string,
    tournamentId: string,
    fixtureId: string,
    audit: TournamentOperationsFieldAuditContext,
  ): Promise<TournamentFixtureFieldResult> {
    const principal = await this.access.assertAccess({
      userId: actorUserId,
      action: 'event_reverse',
      resource: { tournamentId, fixtureId },
    });

    const updated = await this.prisma.$transaction(async (tx) => {
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

      const before = fixture.fieldId;
      const after = await tx.v1TournamentFixture.update({
        where: { tournamentId_id: { tournamentId, id: fixtureId } },
        data: { fieldId: null },
        select: { id: true, tournamentId: true, fieldId: true },
      });

      await this.writeAudit(tx, principal, audit, {
        action: 'tournament.fixture.field_clear',
        targetType: 'TOURNAMENT_FIXTURE',
        targetId: fixtureId,
        tournamentId,
        fixtureId,
        fieldId: before,
        before: { fieldId: before },
        after: { fieldId: null },
      });
      return after;
    });

    return { fixtureId: updated.id, tournamentId: updated.tournamentId, fieldId: updated.fieldId };
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
