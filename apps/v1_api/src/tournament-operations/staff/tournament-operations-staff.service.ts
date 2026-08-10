import { BadRequestException, Injectable } from '@nestjs/common';
import { V1TournamentStaffRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TournamentStaffAccessService,
} from '../../tournaments/staff/tournament-staff-access.service';
import {
  TournamentStaffService,
  type TournamentStaffAssignmentResult,
  type TournamentStaffAuditContext,
} from '../../tournaments/staff/tournament-staff.service';
import type { GrantTournamentStaffDto } from './dto/grant-tournament-staff.dto';
import type { RevokeTournamentStaffDto } from './dto/revoke-tournament-staff.dto';

export type TournamentStaffAssignmentListItem = TournamentStaffAssignmentResult & {
  readonly grantedByUserId: string | null;
  readonly createdAt: Date;
};

const STAFF_LIST_SELECT = {
  id: true,
  tournamentId: true,
  userId: true,
  role: true,
  fieldId: true,
  version: true,
  expiresAt: true,
  revokedAt: true,
  grantedByUserId: true,
  createdAt: true,
  fixtureScopes: { select: { fixtureId: true }, orderBy: { fixtureId: 'asc' as const } },
  // 표가 담당자를 userId 앞 8자로만 보여주고 있었다 — 누가 누구인지 알 수 없다는 뜻이다.
  // 공개 신원으로 쓸 수 있는 값은 닉네임뿐이므로(D-03/D-11) 그것만 함께 읽는다.
  user: { select: { profile: { select: { nickname: true } } } },
} as const;

/**
 * List/grant/revoke orchestration for tournament staff assignments (Task 18).
 *
 * Reuses Task 7's TournamentStaffAccessService (read authorization) and
 * TournamentStaffService (grant/revoke/bootstrap -- already transactional,
 * CAS'd, and audited) wholesale. This lane does not own
 * apps/v1_api/src/tournaments/staff/, so `listStaff` is implemented here as a
 * local read against PrismaService directly rather than as an addition to
 * TournamentStaffService, per the plan's guidance.
 */
@Injectable()
export class TournamentOperationsStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TournamentStaffAccessService,
    private readonly staffService: TournamentStaffService,
  ) {}

  async list(
    userId: string,
    tournamentId: string,
  ): Promise<{ readonly items: readonly TournamentStaffAssignmentListItem[] }> {
    await this.access.assertAccess({
      userId,
      action: 'read',
      resource: { tournamentId },
    });

    const assignments = await this.prisma.v1TournamentStaffAssignment.findMany({
      where: { tournamentId },
      select: STAFF_LIST_SELECT,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return {
      items: assignments.map((assignment) => ({
        id: assignment.id,
        tournamentId: assignment.tournamentId,
        userId: assignment.userId,
        role: assignment.role,
        fieldId: assignment.fieldId,
        fixtureIds: assignment.fixtureScopes.map((scope) => scope.fixtureId),
        version: assignment.version,
        expiresAt: assignment.expiresAt,
        revokedAt: assignment.revokedAt,
        grantedByUserId: assignment.grantedByUserId,
        createdAt: assignment.createdAt,
        nickname: assignment.user?.profile?.nickname ?? null,
      })),
    };
  }

  async grant(
    actorUserId: string,
    tournamentId: string,
    dto: GrantTournamentStaffDto,
    audit: TournamentStaffAuditContext,
  ): Promise<TournamentStaffAssignmentResult> {
    const expiresAt = dto.expiresAt === undefined ? null : new Date(dto.expiresAt);

    // Decision #3 default: the frozen contract exposes a single POST route
    // for staff grants with no separate "bootstrap" endpoint, yet
    // TournamentStaffService.grantStaff() *always* throws
    // FIRST_DIRECTOR_REQUIRES_BOOTSTRAP when granting TOURNAMENT_DIRECTOR
    // while the tournament has zero active directors (by design -- see Task
    // 7). So a director grant while the tournament has none is routed to
    // bootstrapFirstDirector() instead. This is a pre-check only: both
    // target methods re-verify the active-director invariant themselves
    // inside a Serializable transaction, so a race between this check and
    // the call still fails closed with the correct 409/403 from the
    // authoritative method -- this branch never bypasses that invariant.
    if (dto.role === V1TournamentStaffRole.TOURNAMENT_DIRECTOR) {
      // bootstrapFirstDirector() (Task 7, apps/v1_api/src/tournaments/staff/,
      // not this lane) has no fieldId/fixtureIds parameters at all -- a
      // director grant can never legitimately carry a field or fixture
      // scope. Reject that explicitly, with the same STAFF_SCOPE_NOT_ALLOWED
      // contract normalizeGrant() uses for an ordinary director grant,
      // *before* branching on activeDirectorCount. Previously this branch
      // just dropped dto.fieldId/dto.fixtureIds on the floor by never
      // forwarding them, so an illegal scope silently "succeeded" only while
      // the tournament had zero active directors and started failing the
      // instant a director existed (Task 18 review finding #10).
      if (dto.fieldId !== undefined || (dto.fixtureIds !== undefined && dto.fixtureIds.length > 0)) {
        throw new BadRequestException({
          code: 'STAFF_SCOPE_NOT_ALLOWED',
          message: 'Only field operators can receive field or fixture scopes',
        });
      }

      const activeDirectorCount = await this.prisma.v1TournamentStaffAssignment.count({
        where: {
          tournamentId,
          role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (activeDirectorCount === 0) {
        return this.staffService.bootstrapFirstDirector({
          actorUserId,
          tournamentId,
          targetUserId: dto.userId,
          expiresAt,
          audit,
        });
      }
    }

    return this.staffService.grantStaff({
      actorUserId,
      tournamentId,
      targetUserId: dto.userId,
      role: dto.role,
      fieldId: dto.fieldId ?? null,
      fixtureIds: dto.fixtureIds ?? [],
      expiresAt,
      audit,
    });
  }

  /**
   * Task 18 review P1-3 (fix): the frozen contract requires `reason` in this endpoint's body, and
   * it MUST be persisted atomically with the revocation itself -- not as a separate follow-up
   * write after `revokeStaff()`'s own transaction has already committed (that was the pre-fix
   * behavior here: a failure in the follow-up write left the assignment revoked with the
   * contract-required reason silently lost, with no way to retry just the reason since the
   * revocation itself was already consumed). `dto.reason` is now passed straight into
   * `TournamentStaffService.revokeStaff()`, which writes it onto the SAME `V1OperationAudit` row
   * as the revoke, inside the SAME transaction (see that method's `writeAudit()` doc comment) --
   * this lane no longer performs its own separate `v1OperationAudit.create()` for it at all.
   */
  async revoke(
    actorUserId: string,
    tournamentId: string,
    assignmentId: string,
    dto: RevokeTournamentStaffDto,
    audit: TournamentStaffAuditContext,
  ): Promise<TournamentStaffAssignmentResult> {
    return this.staffService.revokeStaff({
      actorUserId,
      tournamentId,
      assignmentId,
      expectedVersion: dto.expectedVersion,
      audit,
      reason: dto.reason,
    });
  }
}
