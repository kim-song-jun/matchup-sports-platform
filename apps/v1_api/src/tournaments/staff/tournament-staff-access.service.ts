import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import type { V1TournamentStaffRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  decideTournamentStaffAccess,
  type TournamentStaffAction,
  type TournamentStaffDecisionReason,
  type TournamentStaffRole,
} from './tournament-staff-policy';

export const TOURNAMENT_STAFF_CLOCK = Symbol('TOURNAMENT_STAFF_CLOCK');
export type TournamentStaffClock = () => Date;

export type TournamentStaffResource = {
  readonly tournamentId: string;
  readonly fixtureId?: string;
  readonly fieldId?: string;
  readonly courtId?: string;
};

export type TournamentStaffAccessInput = {
  readonly userId: string;
  readonly action: TournamentStaffAction;
  readonly resource: TournamentStaffResource;
  readonly expectedAssignmentVersion?: number;
};

export type TournamentStaffPrincipal = {
  readonly userId: string;
  readonly role: Exclude<TournamentStaffRole, 'public' | 'team_manager'>;
  readonly tournamentId: string;
  readonly fixtureId: string | null;
  readonly fieldOrCourtId: string | null;
  readonly authorizationSubject: string;
  readonly assignmentId: string | null;
  readonly assignmentVersion: number | null;
};

export type TournamentStaffRuntimeDenialReason =
  | Exclude<TournamentStaffDecisionReason, 'ALLOWED'>
  | 'STALE_ASSIGNMENT_VERSION';

type AssignmentRecord = {
  readonly id: string;
  readonly tournamentId: string;
  readonly role: V1TournamentStaffRole;
  readonly fieldId: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly fixtureScopes: readonly { readonly fixtureId: string }[];
};

@Injectable()
export class TournamentStaffAccessService {
  private readonly now: TournamentStaffClock;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(TOURNAMENT_STAFF_CLOCK) now?: TournamentStaffClock,
  ) {
    this.now = now ?? (() => new Date());
  }

  async assertAccess(input: TournamentStaffAccessInput): Promise<TournamentStaffPrincipal> {
    const now = this.now();
    const admin = await this.prisma.v1AdminUser.findUnique({
      where: { userId: input.userId },
      select: {
        adminRole: true,
        status: true,
        revokedAt: true,
        updatedAt: true,
        user: { select: { accountStatus: true } },
      },
    });
    if (
      admin !== null &&
      admin.status === 'active' &&
      admin.revokedAt === null &&
      admin.user.accountStatus === 'active' &&
      (admin.adminRole === 'owner' || admin.adminRole === 'ops')
    ) {
      const decision = decideTournamentStaffAccess({
        role: 'platform_ops',
        action: input.action,
        now: now.toISOString(),
        resource: input.resource,
      });
      if (!decision.allowed) {
        this.deny(decision.reason);
      }
      return this.principal(input, {
        role: 'platform_ops',
        authorizationSubject: `platform_ops:${input.userId}@${admin.updatedAt.getTime()}`,
        assignmentId: null,
        assignmentVersion: null,
      });
    }

    const assignments: readonly AssignmentRecord[] =
      await this.prisma.v1TournamentStaffAssignment.findMany({
        where: {
          tournamentId: input.resource.tournamentId,
          userId: input.userId,
        },
        select: {
          id: true,
          tournamentId: true,
          role: true,
          fieldId: true,
          version: true,
          createdAt: true,
          expiresAt: true,
          revokedAt: true,
          fixtureScopes: { select: { fixtureId: true } },
        },
      });

    if (
      input.expectedAssignmentVersion !== undefined &&
      !assignments.some((assignment) => assignment.version === input.expectedAssignmentVersion)
    ) {
      this.deny('STALE_ASSIGNMENT_VERSION');
    }

    let denialReason: TournamentStaffRuntimeDenialReason = 'ASSIGNMENT_REQUIRED';
    for (const assignment of assignments) {
      if (
        input.expectedAssignmentVersion !== undefined &&
        assignment.version !== input.expectedAssignmentVersion
      ) {
        continue;
      }
      const role = this.role(assignment.role);
      const decision = decideTournamentStaffAccess({
        role,
        action: input.action,
        now: now.toISOString(),
        resource: input.resource,
        assignment: {
          role,
          tournamentId: assignment.tournamentId,
          startsAt: assignment.createdAt.toISOString(),
          expiresAt: assignment.expiresAt?.toISOString() ?? null,
          revokedAt: assignment.revokedAt?.toISOString() ?? null,
          fixtureIds: assignment.fixtureScopes.map((scope) => scope.fixtureId),
          ...(assignment.fieldId === null ? {} : { fieldId: assignment.fieldId }),
        },
      });
      if (decision.allowed) {
        return this.principal(input, {
          role,
          authorizationSubject: `assignment:${assignment.id}@${assignment.version}`,
          assignmentId: assignment.id,
          assignmentVersion: assignment.version,
        });
      }
      denialReason = decision.reason;
    }
    this.deny(denialReason);
  }

  private role(role: V1TournamentStaffRole): Extract<
    TournamentStaffRole,
    'field_operator' | 'support_readonly' | 'tournament_director'
  > {
    switch (role) {
      case 'FIELD_OPERATOR':
        return 'field_operator';
      case 'SUPPORT_READONLY':
        return 'support_readonly';
      case 'TOURNAMENT_DIRECTOR':
        return 'tournament_director';
      case 'PLATFORM_OPS':
        throw new ForbiddenException({
          code: 'STAFF_SCOPE_DENIED',
          message: 'Platform operations access requires an active admin grant',
          details: { reason: 'ASSIGNMENT_ROLE_MISMATCH' },
        });
    }
  }

  private principal(
    input: TournamentStaffAccessInput,
    authority: Pick<
      TournamentStaffPrincipal,
      'role' | 'authorizationSubject' | 'assignmentId' | 'assignmentVersion'
    >,
  ): TournamentStaffPrincipal {
    return {
      userId: input.userId,
      role: authority.role,
      tournamentId: input.resource.tournamentId,
      fixtureId: input.resource.fixtureId ?? null,
      fieldOrCourtId: input.resource.fieldId ?? input.resource.courtId ?? null,
      authorizationSubject: authority.authorizationSubject,
      assignmentId: authority.assignmentId,
      assignmentVersion: authority.assignmentVersion,
    };
  }

  private deny(reason: TournamentStaffRuntimeDenialReason): never {
    throw new ForbiddenException({
      code: 'STAFF_SCOPE_DENIED',
      message: 'Tournament staff scope is denied',
      details: { reason },
    });
  }
}
