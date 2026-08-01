import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, V1TournamentStaffRole } from '@prisma/client';
import {
  OperationAuditWriterService,
  type OperationAuditCreateClient,
} from '../../common/audit/operation-audit-writer.service';
import type { OperationAuditActor } from '../../common/audit/operation-audit.contract';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import {
  TournamentStaffAccessService,
  type TournamentStaffPrincipal,
} from './tournament-staff-access.service';

export const TOURNAMENT_STAFF_MANAGEMENT_CLOCK = Symbol('TOURNAMENT_STAFF_MANAGEMENT_CLOCK');
export type TournamentStaffManagementClock = () => Date;

export type TournamentStaffAuditContext = {
  readonly requestId: string;
  readonly sourceIp?: string | null;
};

export type BootstrapFirstDirectorInput = {
  readonly actorUserId: string;
  readonly tournamentId: string;
  readonly targetUserId: string;
  readonly expiresAt?: Date | null;
  readonly audit: TournamentStaffAuditContext;
};

export type GrantTournamentStaffInput = {
  readonly actorUserId: string;
  readonly tournamentId: string;
  readonly targetUserId: string;
  readonly role: V1TournamentStaffRole;
  readonly fieldId?: string | null;
  readonly fixtureIds?: readonly string[];
  readonly expiresAt?: Date | null;
  readonly audit: TournamentStaffAuditContext;
};

export type RevokeTournamentStaffInput = {
  readonly actorUserId: string;
  readonly tournamentId: string;
  readonly assignmentId: string;
  readonly expectedVersion: number;
  readonly audit: TournamentStaffAuditContext;
};

export type TournamentStaffAssignmentResult = {
  readonly id: string;
  readonly tournamentId: string;
  readonly userId: string;
  readonly role: V1TournamentStaffRole;
  readonly fieldId: string | null;
  readonly fixtureIds: readonly string[];
  readonly version: number;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
};

type StaffTransaction = Prisma.TransactionClient;
type StaffAssignmentSnapshot = {
  readonly id: string;
  readonly tournamentId: string;
  readonly userId: string;
  readonly role: V1TournamentStaffRole;
  readonly fieldId: string | null;
  readonly version: number;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly fixtureScopes: readonly { readonly fixtureId: string }[];
};

const STABLE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASSIGNMENT_SELECT = {
  id: true,
  tournamentId: true,
  userId: true,
  role: true,
  fieldId: true,
  version: true,
  expiresAt: true,
  revokedAt: true,
  fixtureScopes: { select: { fixtureId: true }, orderBy: { fixtureId: 'asc' as const } },
} as const;

@Injectable()
export class TournamentStaffService {
  private readonly now: TournamentStaffManagementClock;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TournamentStaffAccessService,
    private readonly auditWriter: OperationAuditWriterService,
    private readonly realtimeGateway: RealtimeGateway,
    @Optional()
    @Inject(TOURNAMENT_STAFF_MANAGEMENT_CLOCK)
    now?: TournamentStaffManagementClock,
  ) {
    this.now = now ?? (() => new Date());
  }

  async bootstrapFirstDirector(
    input: BootstrapFirstDirectorInput,
  ): Promise<TournamentStaffAssignmentResult> {
    const normalized = this.normalizeBootstrap(input);
    const principal = await this.authorize(normalized.actorUserId, normalized.tournamentId);
    if (principal.role !== 'platform_ops') {
      this.deny('FIRST_DIRECTOR_REQUIRES_PLATFORM_OPS');
    }

    return this.prisma.$transaction(
      async (tx) => {
        await this.recheckActor(tx, principal, normalized.tournamentId, normalized.occurredAt);
        await this.assertTournamentAndTarget(tx, normalized.tournamentId, normalized.targetUserId);
        const activeDirectorCount = await this.activeDirectorCount(
          tx,
          normalized.tournamentId,
          normalized.occurredAt,
        );
        if (activeDirectorCount !== 0) {
          throw new ConflictException({
            code: 'STAFF_DIRECTOR_ALREADY_BOOTSTRAPPED',
            message: 'The tournament already has an active director',
          });
        }

        const created = await tx.v1TournamentStaffAssignment.create({
          data: {
            tournamentId: normalized.tournamentId,
            userId: normalized.targetUserId,
            role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR,
            expiresAt: normalized.expiresAt,
            grantedByUserId: normalized.actorUserId,
            createdAt: normalized.occurredAt,
          },
          select: ASSIGNMENT_SELECT,
        });
        await this.writeAudit(tx, principal, normalized.audit, normalized.occurredAt, {
          action: 'tournament.staff.bootstrap_director',
          assignment: created,
          before: null,
          after: this.auditSnapshot(created),
        });
        return this.result(created);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async grantStaff(input: GrantTournamentStaffInput): Promise<TournamentStaffAssignmentResult> {
    const normalized = this.normalizeGrant(input);
    const principal = await this.authorize(normalized.actorUserId, normalized.tournamentId);
    this.assertGrantAuthority(principal, normalized.role, normalized.tournamentId);

    return this.prisma.$transaction(
      async (tx) => {
        await this.recheckActor(tx, principal, normalized.tournamentId, normalized.occurredAt);
        await this.assertTournamentAndTarget(tx, normalized.tournamentId, normalized.targetUserId);
        if (
          normalized.role === V1TournamentStaffRole.TOURNAMENT_DIRECTOR &&
          (await this.activeDirectorCount(tx, normalized.tournamentId, normalized.occurredAt)) === 0
        ) {
          this.deny('FIRST_DIRECTOR_REQUIRES_BOOTSTRAP');
        }
        await this.assertStableScopes(
          tx,
          normalized.tournamentId,
          normalized.fieldId,
          normalized.fixtureIds,
        );

        const created = await tx.v1TournamentStaffAssignment.create({
          data: {
            tournamentId: normalized.tournamentId,
            userId: normalized.targetUserId,
            role: normalized.role,
            fieldId: normalized.fieldId,
            expiresAt: normalized.expiresAt,
            grantedByUserId: normalized.actorUserId,
            createdAt: normalized.occurredAt,
          },
          select: ASSIGNMENT_SELECT,
        });
        if (normalized.fixtureIds.length > 0) {
          await tx.v1TournamentStaffFixtureScope.createMany({
            data: normalized.fixtureIds.map((fixtureId) => ({
              assignmentId: created.id,
              fixtureId,
            })),
          });
        }
        const persisted =
          normalized.fixtureIds.length === 0
            ? created
            : await tx.v1TournamentStaffAssignment.findUnique({
                where: { id: created.id },
                select: ASSIGNMENT_SELECT,
              });
        if (persisted === null) {
          throw new ConflictException({
            code: 'STAFF_ASSIGNMENT_NOT_PERSISTED',
            message: 'The staff assignment could not be reloaded',
          });
        }
        await this.writeAudit(tx, principal, normalized.audit, normalized.occurredAt, {
          action: 'tournament.staff.grant',
          assignment: persisted,
          before: null,
          after: this.auditSnapshot(persisted),
        });
        return this.result(persisted);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async revokeStaff(input: RevokeTournamentStaffInput): Promise<TournamentStaffAssignmentResult> {
    const normalized = this.normalizeRevoke(input);
    const principal = await this.authorize(normalized.actorUserId, normalized.tournamentId);
    const result = await this.prisma.$transaction(
      async (tx) => {
        await this.recheckActor(tx, principal, normalized.tournamentId, normalized.occurredAt);
        const before = await tx.v1TournamentStaffAssignment.findUnique({
          where: { id: normalized.assignmentId },
          select: ASSIGNMENT_SELECT,
        });
        if (before === null || before.tournamentId !== normalized.tournamentId) {
          throw new NotFoundException({
            code: 'STAFF_ASSIGNMENT_NOT_FOUND',
            message: 'The staff assignment was not found in this tournament',
          });
        }
        this.assertRevokeAuthority(principal, before.role, normalized.tournamentId);
        if (before.revokedAt !== null) {
          throw new ConflictException({
            code: 'STAFF_ASSIGNMENT_ALREADY_REVOKED',
            message: 'The staff assignment is already revoked',
          });
        }

        const updated = await tx.v1TournamentStaffAssignment.updateMany({
          where: {
            id: before.id,
            tournamentId: normalized.tournamentId,
            version: normalized.expectedVersion,
            revokedAt: null,
          },
          data: { revokedAt: normalized.occurredAt, version: { increment: 1 } },
        });
        if (updated.count !== 1) {
          throw new ConflictException({
            code: 'STALE_STAFF_ASSIGNMENT_VERSION',
            message: 'The staff assignment changed before revocation',
          });
        }
        const after = await tx.v1TournamentStaffAssignment.findUnique({
          where: { id: before.id },
          select: ASSIGNMENT_SELECT,
        });
        if (after === null) {
          throw new ConflictException({
            code: 'STAFF_ASSIGNMENT_NOT_PERSISTED',
            message: 'The revoked staff assignment could not be reloaded',
          });
        }
        await this.writeAudit(tx, principal, normalized.audit, normalized.occurredAt, {
          action: 'tournament.staff.revoke',
          assignment: after,
          before: this.auditSnapshot(before),
          after: this.auditSnapshot(after),
        });
        return this.result(after);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    this.realtimeGateway.evictUserFromScopedGameRooms({
      userId: result.userId,
      tournamentId: result.tournamentId,
      assignmentVersion: result.version,
    });
    return result;
  }

  private async authorize(
    actorUserId: string,
    tournamentId: string,
  ): Promise<TournamentStaffPrincipal> {
    const principal = await this.access.assertAccess({
      userId: actorUserId,
      action: 'event_reverse',
      resource: { tournamentId },
    });
    if (principal.tournamentId !== tournamentId) {
      this.deny('CROSS_TOURNAMENT_SCOPE');
    }
    return principal;
  }

  private async recheckActor(
    tx: StaffTransaction,
    principal: TournamentStaffPrincipal,
    tournamentId: string,
    occurredAt: Date,
  ): Promise<void> {
    if (principal.role === 'platform_ops') {
      const admin = await tx.v1AdminUser.findUnique({
        where: { userId: principal.userId },
        select: {
          adminRole: true,
          status: true,
          revokedAt: true,
          user: { select: { accountStatus: true } },
        },
      });
      if (
        admin === null ||
        (admin.adminRole !== 'owner' && admin.adminRole !== 'ops') ||
        admin.status !== 'active' ||
        admin.revokedAt !== null ||
        admin.user.accountStatus !== 'active'
      ) {
        this.deny('ACTOR_AUTHORITY_CHANGED');
      }
      return;
    }

    if (
      principal.role !== 'tournament_director' ||
      principal.assignmentId === null ||
      principal.assignmentVersion === null
    ) {
      this.deny('DIRECTOR_AUTHORITY_REQUIRED');
    }
    const director = await tx.v1TournamentStaffAssignment.findFirst({
      where: {
        id: principal.assignmentId,
        tournamentId,
        userId: principal.userId,
        role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR,
        version: principal.assignmentVersion,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: occurredAt } }],
      },
      select: { id: true },
    });
    if (director === null) {
      this.deny('ACTOR_AUTHORITY_CHANGED');
    }
  }

  private assertGrantAuthority(
    principal: TournamentStaffPrincipal,
    role: V1TournamentStaffRole,
    tournamentId: string,
  ): void {
    if (principal.tournamentId !== tournamentId) {
      this.deny('CROSS_TOURNAMENT_SCOPE');
    }
    if (principal.role !== 'platform_ops' && principal.role !== 'tournament_director') {
      this.deny('DIRECTOR_AUTHORITY_REQUIRED');
    }
    if (role === V1TournamentStaffRole.PLATFORM_OPS) {
      this.deny('PLATFORM_OPS_ASSIGNMENT_FORBIDDEN');
    }
    if (
      principal.role === 'tournament_director' &&
      role === V1TournamentStaffRole.TOURNAMENT_DIRECTOR
    ) {
      this.deny('DIRECTOR_CANNOT_GRANT_DIRECTOR');
    }
  }

  private assertRevokeAuthority(
    principal: TournamentStaffPrincipal,
    role: V1TournamentStaffRole,
    tournamentId: string,
  ): void {
    if (principal.tournamentId !== tournamentId) {
      this.deny('CROSS_TOURNAMENT_SCOPE');
    }
    if (principal.role !== 'platform_ops' && principal.role !== 'tournament_director') {
      this.deny('DIRECTOR_AUTHORITY_REQUIRED');
    }
    if (role === V1TournamentStaffRole.PLATFORM_OPS) {
      this.deny('PLATFORM_OPS_ASSIGNMENT_FORBIDDEN');
    }
    if (
      principal.role === 'tournament_director' &&
      role === V1TournamentStaffRole.TOURNAMENT_DIRECTOR
    ) {
      this.deny('DIRECTOR_CANNOT_REVOKE_DIRECTOR');
    }
  }

  private async assertTournamentAndTarget(
    tx: StaffTransaction,
    tournamentId: string,
    targetUserId: string,
  ): Promise<void> {
    const [tournament, target] = await Promise.all([
      tx.v1Tournament.findUnique({ where: { id: tournamentId }, select: { id: true } }),
      tx.v1User.findUnique({
        where: { id: targetUserId },
        select: { id: true, accountStatus: true },
      }),
    ]);
    if (tournament === null) {
      throw new NotFoundException({
        code: 'TOURNAMENT_NOT_FOUND',
        message: 'The tournament was not found',
      });
    }
    if (target === null) {
      throw new NotFoundException({
        code: 'STAFF_TARGET_NOT_FOUND',
        message: 'The target user was not found',
      });
    }
    if (target.accountStatus !== 'active') {
      throw new ConflictException({
        code: 'STAFF_TARGET_INACTIVE',
        message: 'Only an active user can receive tournament staff access',
      });
    }
  }

  private async assertStableScopes(
    tx: StaffTransaction,
    tournamentId: string,
    fieldId: string | null,
    fixtureIds: readonly string[],
  ): Promise<void> {
    if (fieldId !== null) {
      const field = await tx.v1TournamentField.findUnique({
        where: { tournamentId_id: { tournamentId, id: fieldId } },
        select: { id: true },
      });
      if (field === null) {
        this.deny('CROSS_TOURNAMENT_FIELD_SCOPE');
      }
    }
    if (fixtureIds.length > 0) {
      const fixtures = await tx.v1TournamentFixture.findMany({
        where: { tournamentId, id: { in: [...fixtureIds] } },
        select: { id: true },
      });
      if (fixtures.length !== fixtureIds.length) {
        this.deny('CROSS_TOURNAMENT_FIXTURE_SCOPE');
      }
    }
  }

  private async activeDirectorCount(
    tx: StaffTransaction,
    tournamentId: string,
    occurredAt: Date,
  ): Promise<number> {
    return tx.v1TournamentStaffAssignment.count({
      where: {
        tournamentId,
        role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: occurredAt } }],
      },
    });
  }

  private async writeAudit(
    tx: StaffTransaction,
    principal: TournamentStaffPrincipal,
    audit: TournamentStaffAuditContext,
    occurredAt: Date,
    mutation: {
      readonly action: string;
      readonly assignment: StaffAssignmentSnapshot;
      readonly before: ReturnType<TournamentStaffService['auditSnapshot']> | null;
      readonly after: ReturnType<TournamentStaffService['auditSnapshot']>;
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
      targetType: 'TOURNAMENT_STAFF_ASSIGNMENT',
      targetId: mutation.assignment.id,
      occurredAt,
      before: mutation.before,
      after: mutation.after,
      tournamentId: mutation.assignment.tournamentId,
      fieldId: mutation.assignment.fieldId,
    });
  }

  private auditActor(principal: TournamentStaffPrincipal): OperationAuditActor {
    return principal.role === 'platform_ops'
      ? { type: 'PLATFORM_OPS', id: principal.userId }
      : { type: 'TOURNAMENT_STAFF', id: principal.userId };
  }

  private auditSnapshot(assignment: StaffAssignmentSnapshot) {
    return {
      assignmentId: assignment.id,
      tournamentId: assignment.tournamentId,
      userId: assignment.userId,
      role: assignment.role,
      fieldId: assignment.fieldId,
      fixtureIds: assignment.fixtureScopes.map((scope) => scope.fixtureId),
      version: assignment.version,
      expiresAt: assignment.expiresAt?.toISOString() ?? null,
      revokedAt: assignment.revokedAt?.toISOString() ?? null,
    } as const;
  }

  private result(assignment: StaffAssignmentSnapshot): TournamentStaffAssignmentResult {
    return {
      id: assignment.id,
      tournamentId: assignment.tournamentId,
      userId: assignment.userId,
      role: assignment.role,
      fieldId: assignment.fieldId,
      fixtureIds: assignment.fixtureScopes.map((scope) => scope.fixtureId),
      version: assignment.version,
      expiresAt: assignment.expiresAt,
      revokedAt: assignment.revokedAt,
    };
  }

  private normalizeBootstrap(input: BootstrapFirstDirectorInput) {
    return {
      actorUserId: this.stableId(input.actorUserId, 'actorUserId'),
      tournamentId: this.stableId(input.tournamentId, 'tournamentId'),
      targetUserId: this.stableId(input.targetUserId, 'targetUserId'),
      expiresAt: this.expiry(input.expiresAt),
      audit: this.auditContext(input.audit),
      occurredAt: this.now(),
    };
  }

  private normalizeGrant(input: GrantTournamentStaffInput) {
    const role = this.assignmentRole(input.role);
    const fieldId = input.fieldId == null ? null : this.stableId(input.fieldId, 'fieldId');
    const fixtureIds = [...new Set(input.fixtureIds ?? [])]
      .map((fixtureId) => this.stableId(fixtureId, 'fixtureId'))
      .sort();
    if (role === V1TournamentStaffRole.FIELD_OPERATOR) {
      if (fieldId === null && fixtureIds.length === 0) {
        throw new BadRequestException({
          code: 'STAFF_SCOPE_REQUIRED',
          message: 'A field operator requires a stable field or fixture scope',
        });
      }
    } else if (fieldId !== null || fixtureIds.length > 0) {
      throw new BadRequestException({
        code: 'STAFF_SCOPE_NOT_ALLOWED',
        message: 'Only field operators can receive field or fixture scopes',
      });
    }
    return {
      actorUserId: this.stableId(input.actorUserId, 'actorUserId'),
      tournamentId: this.stableId(input.tournamentId, 'tournamentId'),
      targetUserId: this.stableId(input.targetUserId, 'targetUserId'),
      role,
      fieldId,
      fixtureIds,
      expiresAt: this.expiry(input.expiresAt),
      audit: this.auditContext(input.audit),
      occurredAt: this.now(),
    };
  }

  private normalizeRevoke(input: RevokeTournamentStaffInput) {
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
      throw new BadRequestException({
        code: 'INVALID_STAFF_ASSIGNMENT_VERSION',
        message: 'expectedVersion must be a non-negative safe integer',
      });
    }
    return {
      actorUserId: this.stableId(input.actorUserId, 'actorUserId'),
      tournamentId: this.stableId(input.tournamentId, 'tournamentId'),
      assignmentId: this.stableId(input.assignmentId, 'assignmentId'),
      expectedVersion: input.expectedVersion,
      audit: this.auditContext(input.audit),
      occurredAt: this.now(),
    };
  }

  private assignmentRole(role: unknown): V1TournamentStaffRole {
    switch (role) {
      case V1TournamentStaffRole.TOURNAMENT_DIRECTOR:
      case V1TournamentStaffRole.FIELD_OPERATOR:
      case V1TournamentStaffRole.SUPPORT_READONLY:
        return role;
      case V1TournamentStaffRole.PLATFORM_OPS:
        this.deny('PLATFORM_OPS_ASSIGNMENT_FORBIDDEN');
    }
    throw new BadRequestException({
      code: 'INVALID_STAFF_ROLE',
      message: 'The tournament staff role is invalid',
    });
  }

  private expiry(value: Date | null | undefined): Date | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (!(value instanceof Date) || Number.isNaN(value.getTime()) || value <= this.now()) {
      throw new BadRequestException({
        code: 'INVALID_STAFF_EXPIRY',
        message: 'expiresAt must be a valid future instant',
      });
    }
    return new Date(value);
  }

  private auditContext(value: TournamentStaffAuditContext): TournamentStaffAuditContext {
    if (value === null || typeof value !== 'object') {
      throw new BadRequestException({ code: 'INVALID_AUDIT_CONTEXT', message: 'audit is required' });
    }
    if (typeof value.requestId !== 'string' || value.requestId.trim().length === 0) {
      throw new BadRequestException({
        code: 'INVALID_AUDIT_REQUEST_ID',
        message: 'audit.requestId is required',
      });
    }
    return { requestId: value.requestId.trim(), sourceIp: value.sourceIp };
  }

  private stableId(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || !STABLE_ID_PATTERN.test(value)) {
      throw new BadRequestException({
        code: 'INVALID_STABLE_ID',
        message: `${fieldName} must be a UUID`,
      });
    }
    return value.toLowerCase();
  }

  private deny(reason: string): never {
    throw new ForbiddenException({
      code: 'STAFF_MANAGEMENT_DENIED',
      message: 'Tournament staff management is denied',
      details: { reason },
    });
  }
}
