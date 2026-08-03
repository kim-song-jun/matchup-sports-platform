import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { V1TournamentStaffRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import { TournamentStaffService } from '../../tournaments/staff/tournament-staff.service';
import { TournamentOperationsStaffService } from './tournament-operations-staff.service';

const tournamentId = '00000000-0000-4000-8000-000000000001';
const targetUserId = '00000000-0000-4000-8000-000000000002';
const fieldId = '00000000-0000-4000-8000-000000000003';
const fixtureId = '00000000-0000-4000-8000-000000000004';
const assignmentId = '00000000-0000-4000-8000-000000000005';
const actorUserId = 'actor-1';

const audit = (requestId: string) => ({ requestId, sourceIp: null });

async function buildHarness() {
  const bootstrapFirstDirector = jest.fn();
  const grantStaff = jest.fn().mockResolvedValue({ id: 'grant-1' });
  const revokeStaff = jest.fn().mockResolvedValue({
    id: assignmentId,
    tournamentId,
    userId: targetUserId,
    role: V1TournamentStaffRole.FIELD_OPERATOR,
    fieldId: null,
    fixtureIds: [],
    version: 2,
    expiresAt: null,
    revokedAt: new Date('2026-08-03T00:00:00.000Z'),
  });
  const count = jest.fn().mockResolvedValue(0);
  const operationAuditCreate = jest.fn().mockResolvedValue({ id: 'audit-1' });

  const prisma = {
    v1TournamentStaffAssignment: { count, findMany: jest.fn().mockResolvedValue([]) },
    v1OperationAudit: { create: operationAuditCreate },
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      TournamentOperationsStaffService,
      { provide: PrismaService, useValue: prisma },
      { provide: TournamentStaffAccessService, useValue: { assertAccess: jest.fn() } },
      {
        provide: TournamentStaffService,
        useValue: { bootstrapFirstDirector, grantStaff, revokeStaff },
      },
    ],
  }).compile();

  return {
    service: moduleRef.get(TournamentOperationsStaffService),
    moduleRef,
    bootstrapFirstDirector,
    grantStaff,
    revokeStaff,
    count,
    operationAuditCreate,
  };
}

describe('TournamentOperationsStaffService', () => {
  // Finding #10 -- the first-director bootstrap path must reject an illegal
  // field scope explicitly instead of silently dropping it, with the same
  // STAFF_SCOPE_NOT_ALLOWED contract an ordinary director grant enforces.
  it('grant() rejects a director grant carrying a fieldId before bootstrapping', async () => {
    const { service, moduleRef, bootstrapFirstDirector, count } = await buildHarness();

    try {
      await expect(
        service.grant(
          actorUserId,
          tournamentId,
          { userId: targetUserId, role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR, fieldId },
          audit('req-1'),
        ),
      ).rejects.toMatchObject({
        response: { code: 'STAFF_SCOPE_NOT_ALLOWED' },
      });

      expect(bootstrapFirstDirector).not.toHaveBeenCalled();
      // The illegal scope is rejected before even checking whether a
      // director already exists -- it must never depend on that state.
      expect(count).not.toHaveBeenCalled();
    } finally {
      await moduleRef.close();
    }
  });

  it('grant() rejects a director grant carrying fixtureIds before bootstrapping', async () => {
    const { service, moduleRef, bootstrapFirstDirector } = await buildHarness();

    try {
      await expect(
        service.grant(
          actorUserId,
          tournamentId,
          {
            userId: targetUserId,
            role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR,
            fixtureIds: [fixtureId],
          },
          audit('req-2'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(bootstrapFirstDirector).not.toHaveBeenCalled();
    } finally {
      await moduleRef.close();
    }
  });

  it('grant() still bootstraps a scope-free director grant', async () => {
    const { service, moduleRef, bootstrapFirstDirector } = await buildHarness();

    try {
      await service.grant(
        actorUserId,
        tournamentId,
        { userId: targetUserId, role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR },
        audit('req-3'),
      );

      expect(bootstrapFirstDirector).toHaveBeenCalledTimes(1);
    } finally {
      await moduleRef.close();
    }
  });

  // Finding #11 / Task 18 review P1-3 -- a contract-required revoke `reason` must be persisted
  // somewhere the audit trail can show it, not silently discarded, AND it must be forwarded into
  // the SAME revokeStaff() transaction rather than written by a separate follow-up call from this
  // lane (which could commit the revoke while losing the reason if that follow-up write failed).
  // This lane no longer touches `prisma.v1OperationAudit` directly at all for revoke -- the real,
  // atomicity-proving regression test (that the reason lands in the SAME audit row as the revoke,
  // against a real database) lives in
  // test/tournaments/tournament-operations-board.integration-spec.ts, since a mocked
  // `TournamentStaffService` here cannot exercise real transaction atomicity.
  it('revoke() forwards the reason into TournamentStaffService.revokeStaff() instead of writing a separate follow-up audit row itself', async () => {
    const { service, moduleRef, revokeStaff, operationAuditCreate } = await buildHarness();

    try {
      await service.revoke(
        actorUserId,
        tournamentId,
        assignmentId,
        { expectedVersion: 1, reason: 'no longer needed' },
        audit('req-4'),
      );

      expect(revokeStaff).toHaveBeenCalledTimes(1);
      expect(revokeStaff).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId,
          tournamentId,
          assignmentId,
          expectedVersion: 1,
          reason: 'no longer needed',
        }),
      );
      // No separate, non-atomic follow-up write from this lane anymore.
      expect(operationAuditCreate).not.toHaveBeenCalled();
    } finally {
      await moduleRef.close();
    }
  });
});
