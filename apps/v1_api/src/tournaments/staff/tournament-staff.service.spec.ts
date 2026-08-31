import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { OperationAuditWriterService } from '../../common/audit/operation-audit-writer.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { TournamentStaffAccessService } from './tournament-staff-access.service';
import { TournamentStaffService } from './tournament-staff.service';
import { kindAwareFindFirst } from '../../../test/helpers/kind-aware-find-first';

const IDS = {
  tournament: '10000000-0000-4000-8000-000000000001',
  otherTournament: '10000000-0000-4000-8000-000000000002',
  assignment: '20000000-0000-4000-8000-000000000001',
  directorAssignment: '20000000-0000-4000-8000-000000000002',
  actor: '30000000-0000-4000-8000-000000000001',
  target: '30000000-0000-4000-8000-000000000002',
  fixture: '40000000-0000-4000-8000-000000000001',
  field: '50000000-0000-4000-8000-000000000001',
} as const;
const NOW = new Date('2026-08-01T05:00:00.000Z');
const AUDIT = { requestId: 'request-task-7-001', sourceIp: '203.0.113.42' } as const;

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: IDS.assignment,
    tournamentId: IDS.tournament,
    userId: IDS.target,
    role: 'FIELD_OPERATOR',
    fieldId: IDS.field,
    version: 0,
    expiresAt: null,
    revokedAt: null,
    grantedByUserId: IDS.actor,
    createdAt: NOW,
    updatedAt: NOW,
    fixtureScopes: [{ fixtureId: IDS.fixture }],
    ...overrides,
  };
}

function setup() {
  const tx = {
    v1AdminUser: { findUnique: jest.fn() },
    v1Tournament: { findFirst: jest.fn().mockResolvedValue({ id: IDS.tournament }) },
    v1User: {
      findUnique: jest.fn().mockResolvedValue({ id: IDS.target, accountStatus: 'active' }),
    },
    v1TournamentField: { findUnique: jest.fn().mockResolvedValue({ id: IDS.field }) },
    v1TournamentFixture: {
      findMany: jest.fn().mockResolvedValue([{ id: IDS.fixture }]),
    },
    v1TournamentStaffAssignment: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue(assignment()),
      findUnique: jest.fn().mockResolvedValue(assignment()),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    v1TournamentStaffFixtureScope: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    v1OperationAudit: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const access = { assertAccess: jest.fn() };
  const auditWriter = { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
  const realtime = {
    evictUserFromScopedGameRooms: jest.fn(),
    forceDisconnectUser: jest.fn(),
  };
  const service = new TournamentStaffService(
    prisma as unknown as PrismaService,
    access as unknown as TournamentStaffAccessService,
    auditWriter as unknown as OperationAuditWriterService,
    realtime as unknown as RealtimeGateway,
    () => NOW,
  );
  return { service, prisma, tx, access, auditWriter, realtime };
}

describe('TournamentStaffService', () => {
  it('allows only platform_ops to bootstrap the first tournament director', async () => {
    const context = setup();
    context.access.assertAccess.mockResolvedValue({
      userId: IDS.actor,
      role: 'tournament_director',
      tournamentId: IDS.tournament,
      assignmentId: 'director-assignment',
      assignmentVersion: 0,
    });

    await expect(
      context.service.bootstrapFirstDirector({
        actorUserId: IDS.actor,
        tournamentId: IDS.tournament,
        targetUserId: IDS.target,
        audit: AUDIT,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(context.prisma.$transaction).not.toHaveBeenCalled();
    expect(context.tx.v1TournamentStaffAssignment.create).not.toHaveBeenCalled();
    expect(context.auditWriter.create).not.toHaveBeenCalled();
  });

  // **되돌리기 창을 닫는 자리다.** `V1TournamentStaffAssignment` 는 백필 행을 `Restrict` 로
  // 참조하는 세 관계 중 하나라, 리그 행에 스태프가 한 명이라도 붙으면 백필 88행을
  // **더 이상 지울 수 없다**(docs/ops/read-swap-preflight.md).
  // 그래서 404 만이 아니라 **배정 행이 만들어지지 않는 것**까지 단언한다.
  it('리그 id 에는 스태프를 배정할 수 없다 — 배정 행이 만들어지지 않는다', async () => {
    const context = setup();
    context.access.assertAccess.mockResolvedValue({
      userId: IDS.actor,
      role: 'platform_ops',
      tournamentId: IDS.tournament,
      assignmentId: null,
      assignmentVersion: null,
    });
    context.tx.v1AdminUser.findUnique.mockResolvedValue({
      adminRole: 'ops', status: 'active', revokedAt: null, user: { accountStatus: 'active' },
    });
    context.tx.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst({ id: IDS.tournament, kind: 'regular_league' }),
    );
    // 봉쇄가 없으면 실제로 성공하도록 채운다 — 비워 두면 아래 단언이 게이트가 아니라
    // 깨진 mock 덕에 통과한다.
    context.tx.v1TournamentStaffAssignment.create.mockResolvedValue(
      assignment({ id: IDS.directorAssignment, role: 'TOURNAMENT_DIRECTOR', fieldId: null, fixtureScopes: [] }),
    );

    await expect(
      context.service.bootstrapFirstDirector({
        actorUserId: IDS.actor,
        tournamentId: IDS.tournament,
        targetUserId: IDS.target,
        audit: AUDIT,
      }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });

    expect(context.tx.v1TournamentStaffAssignment.create).not.toHaveBeenCalled();
  });

  it('persists the bootstrap operation timestamp as the first director assignment start time', async () => {
    const context = setup();
    const director = assignment({
      id: IDS.directorAssignment,
      role: 'TOURNAMENT_DIRECTOR',
      fieldId: null,
      fixtureScopes: [],
    });
    context.access.assertAccess.mockResolvedValue({
      userId: IDS.actor,
      role: 'platform_ops',
      tournamentId: IDS.tournament,
      assignmentId: null,
      assignmentVersion: null,
    });
    context.tx.v1AdminUser.findUnique.mockResolvedValue({
      adminRole: 'ops', status: 'active', revokedAt: null, user: { accountStatus: 'active' },
    });
    context.tx.v1TournamentStaffAssignment.create.mockResolvedValue(director);

    await expect(
      context.service.bootstrapFirstDirector({
        actorUserId: IDS.actor,
        tournamentId: IDS.tournament,
        targetUserId: IDS.target,
        audit: AUDIT,
      }),
    ).resolves.toMatchObject({ id: IDS.directorAssignment, role: 'TOURNAMENT_DIRECTOR' });

    expect(context.tx.v1TournamentStaffAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ createdAt: NOW }) }),
    );
  });

  it.each([
    { role: 'PLATFORM_OPS' as const, tournamentId: IDS.tournament },
    { role: 'FIELD_OPERATOR' as const, tournamentId: IDS.otherTournament },
  ])('denies director grant $role / $tournamentId with zero writes', async ({ role, tournamentId }) => {
    const context = setup();
    context.access.assertAccess.mockResolvedValue({
      userId: IDS.actor,
      role: 'tournament_director',
      tournamentId: IDS.tournament,
      assignmentId: 'director-assignment',
      assignmentVersion: 3,
    });

    await expect(
      context.service.grantStaff({
        actorUserId: IDS.actor,
        tournamentId,
        targetUserId: IDS.target,
        role,
        fieldId: role === 'FIELD_OPERATOR' ? IDS.field : undefined,
        audit: AUDIT,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(context.prisma.$transaction).not.toHaveBeenCalled();
    expect(context.tx.v1TournamentStaffAssignment.create).not.toHaveBeenCalled();
    expect(context.auditWriter.create).not.toHaveBeenCalled();
  });

  it('denies a same-tournament director escalation after a valid director authority preflight with zero writes', async () => {
    const context = setup();
    context.access.assertAccess.mockResolvedValue({
      userId: IDS.actor,
      role: 'tournament_director',
      tournamentId: IDS.tournament,
      assignmentId: IDS.directorAssignment,
      assignmentVersion: 4,
    });
    context.tx.v1TournamentStaffAssignment.findFirst.mockResolvedValue({
      id: IDS.directorAssignment,
    });

    await expect(
      context.service.grantStaff({
        actorUserId: IDS.actor,
        tournamentId: IDS.tournament,
        targetUserId: IDS.target,
        role: 'TOURNAMENT_DIRECTOR',
        audit: AUDIT,
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'STAFF_MANAGEMENT_DENIED',
        details: { reason: 'DIRECTOR_CANNOT_GRANT_DIRECTOR' },
      },
    });

    expect(context.prisma.$transaction).not.toHaveBeenCalled();
    expect(context.tx.v1TournamentStaffAssignment.create).not.toHaveBeenCalled();
    expect(context.auditWriter.create).not.toHaveBeenCalled();
    expect(context.realtime.forceDisconnectUser).not.toHaveBeenCalled();
  });

  it('denies a platform operator direct first-director grant inside the transaction with zero writes', async () => {
    const context = setup();
    context.access.assertAccess.mockResolvedValue({
      userId: IDS.actor,
      role: 'platform_ops',
      tournamentId: IDS.tournament,
      assignmentId: null,
      assignmentVersion: null,
    });
    context.tx.v1AdminUser.findUnique.mockResolvedValue({
      adminRole: 'ops', status: 'active', revokedAt: null, user: { accountStatus: 'active' },
    });

    await expect(
      context.service.grantStaff({
        actorUserId: IDS.actor,
        tournamentId: IDS.tournament,
        targetUserId: IDS.target,
        role: 'TOURNAMENT_DIRECTOR',
        audit: AUDIT,
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'STAFF_MANAGEMENT_DENIED',
        details: { reason: 'FIRST_DIRECTOR_REQUIRES_BOOTSTRAP' },
      },
    });

    expect(context.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(context.tx.v1TournamentStaffAssignment.count).toHaveBeenCalledTimes(1);
    expect(context.tx.v1TournamentStaffAssignment.create).not.toHaveBeenCalled();
    expect(context.auditWriter.create).not.toHaveBeenCalled();
    expect(context.realtime.forceDisconnectUser).not.toHaveBeenCalled();
  });

  it('allows a platform operator to add a director after bootstrap already established one', async () => {
    const context = setup();
    const laterDirector = assignment({
      id: IDS.directorAssignment,
      role: 'TOURNAMENT_DIRECTOR',
      fieldId: null,
      fixtureScopes: [],
    });
    context.access.assertAccess.mockResolvedValue({
      userId: IDS.actor,
      role: 'platform_ops',
      tournamentId: IDS.tournament,
      assignmentId: null,
      assignmentVersion: null,
    });
    context.tx.v1AdminUser.findUnique.mockResolvedValue({
      adminRole: 'ops', status: 'active', revokedAt: null, user: { accountStatus: 'active' },
    });
    context.tx.v1TournamentStaffAssignment.count.mockResolvedValue(1);
    context.tx.v1TournamentStaffAssignment.create.mockResolvedValue(laterDirector);

    await expect(
      context.service.grantStaff({
        actorUserId: IDS.actor,
        tournamentId: IDS.tournament,
        targetUserId: IDS.target,
        role: 'TOURNAMENT_DIRECTOR',
        audit: AUDIT,
      }),
    ).resolves.toMatchObject({ id: IDS.directorAssignment, role: 'TOURNAMENT_DIRECTOR' });

    expect(context.tx.v1TournamentStaffAssignment.count).toHaveBeenCalledTimes(1);
    expect(context.tx.v1TournamentStaffAssignment.create).toHaveBeenCalledTimes(1);
    expect(context.auditWriter.create).toHaveBeenCalledTimes(1);
  });

  it('evicts only the revoked tournament scope after persisted revocation and audit commit', async () => {
    const context = setup();
    const order: string[] = [];
    let persistedAssignment = assignment();
    const persistedAudits: Array<Record<string, unknown>> = [];
    const actualAuditWriter = new OperationAuditWriterService();
    const service = new TournamentStaffService(
      context.prisma as unknown as PrismaService,
      context.access as unknown as TournamentStaffAccessService,
      actualAuditWriter,
      context.realtime as unknown as RealtimeGateway,
      () => NOW,
    );
    context.access.assertAccess.mockResolvedValue({
      userId: IDS.actor,
      role: 'tournament_director',
      tournamentId: IDS.tournament,
      assignmentId: 'director-assignment',
      assignmentVersion: 4,
    });
    context.tx.v1TournamentStaffAssignment.findFirst.mockResolvedValue({
      id: 'director-assignment',
    });
    context.tx.v1TournamentStaffAssignment.updateMany.mockImplementation(async () => {
      order.push('assignment');
      persistedAssignment = assignment({ version: 1, revokedAt: NOW, updatedAt: NOW });
      return { count: 1 };
    });
    context.tx.v1TournamentStaffAssignment.findUnique.mockImplementation(async () => persistedAssignment);
    context.tx.v1OperationAudit.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      order.push('audit');
      persistedAudits.push(data);
      return { id: 'audit-1' };
    });
    context.prisma.$transaction.mockImplementation(async (callback: (client: typeof context.tx) => unknown) => {
      const result = await callback(context.tx);
      order.push('commit');
      return result;
    });
    context.realtime.evictUserFromScopedGameRooms.mockImplementation(() => order.push('scoped-eviction'));

    const result = await service.revokeStaff({
      actorUserId: IDS.actor,
      tournamentId: IDS.tournament,
      assignmentId: IDS.assignment,
      expectedVersion: 0,
      audit: AUDIT,
    });

    expect(result).toMatchObject({ id: IDS.assignment, version: 1, revokedAt: NOW });
    expect(persistedAssignment).toMatchObject({
      id: IDS.assignment,
      version: 1,
      revokedAt: NOW,
    });
    expect(persistedAudits).toHaveLength(1);
    expect(persistedAudits[0]).toMatchObject({
      action: 'tournament.staff.revoke',
      requestId: AUDIT.requestId,
      maskedSourceIp: '203.0.113.0',
      resourceId: IDS.assignment,
    });
    expect(order).toEqual(['assignment', 'audit', 'commit', 'scoped-eviction']);
    expect(context.realtime.evictUserFromScopedGameRooms).toHaveBeenCalledWith({
      userId: IDS.target,
      tournamentId: IDS.tournament,
      assignmentVersion: 1,
    });
    expect(context.realtime.forceDisconnectUser).not.toHaveBeenCalled();
  });

  it('Task 8 revokes staff scope with selective room eviction after commit and no whole-user disconnect', async () => {
    const context = setup();
    const order: string[] = [];
    context.access.assertAccess.mockResolvedValue({
      userId: IDS.actor,
      role: 'tournament_director',
      tournamentId: IDS.tournament,
      assignmentId: 'director-assignment',
      assignmentVersion: 4,
    });
    context.tx.v1TournamentStaffAssignment.findFirst.mockResolvedValue({
      id: 'director-assignment',
    });
    context.tx.v1TournamentStaffAssignment.updateMany.mockImplementation(async () => {
      order.push('assignment');
      return { count: 1 };
    });
    context.tx.v1TournamentStaffAssignment.findUnique
      .mockResolvedValueOnce(assignment())
      .mockResolvedValueOnce(assignment({ version: 1, revokedAt: NOW, updatedAt: NOW }));
    context.auditWriter.create.mockImplementation(async () => {
      order.push('audit');
      return { id: 'audit-1' };
    });
    context.prisma.$transaction.mockImplementation(async (callback: (client: typeof context.tx) => unknown) => {
      const result = await callback(context.tx);
      order.push('commit');
      return result;
    });
    context.realtime.evictUserFromScopedGameRooms.mockImplementation(() => order.push('scoped-eviction'));
    context.realtime.forceDisconnectUser.mockImplementation(() => order.push('disconnect'));

    await context.service.revokeStaff({
      actorUserId: IDS.actor,
      tournamentId: IDS.tournament,
      assignmentId: IDS.assignment,
      expectedVersion: 0,
      audit: AUDIT,
    });

    try {
      expect(order).toEqual(['assignment', 'audit', 'commit', 'scoped-eviction']);
    } catch (error) {
      throw new Error(
        `evictUserFromScopedGameRooms must run after the committed revoke audit: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    expect(context.realtime.evictUserFromScopedGameRooms).toHaveBeenCalledWith({
      userId: IDS.target,
      tournamentId: IDS.tournament,
      assignmentVersion: 1,
    });
    expect(context.realtime.forceDisconnectUser).not.toHaveBeenCalled();
  });

  it('Task 8 permission revoked passes the committed revoked assignment version to scoped eviction', async () => {
    const context = setup();
    context.access.assertAccess.mockResolvedValue({
      userId: IDS.actor,
      role: 'tournament_director',
      tournamentId: IDS.tournament,
      assignmentId: 'director-assignment',
      assignmentVersion: 4,
    });
    context.tx.v1TournamentStaffAssignment.findFirst.mockResolvedValue({ id: 'director-assignment' });
    context.tx.v1TournamentStaffAssignment.updateMany.mockResolvedValue({ count: 1 });
    context.tx.v1TournamentStaffAssignment.findUnique
      .mockResolvedValueOnce(assignment())
      .mockResolvedValueOnce(assignment({ version: 1, revokedAt: NOW, updatedAt: NOW }));

    await context.service.revokeStaff({
      actorUserId: IDS.actor,
      tournamentId: IDS.tournament,
      assignmentId: IDS.assignment,
      expectedVersion: 0,
      audit: AUDIT,
    });

    expect(context.realtime.evictUserFromScopedGameRooms).toHaveBeenCalledWith({
      userId: IDS.target,
      tournamentId: IDS.tournament,
      assignmentVersion: 1,
    });
  });

  it('does not disconnect or leave an audit when the revoke transaction fails', async () => {
    const context = setup();
    context.access.assertAccess.mockResolvedValue({
      userId: IDS.actor,
      role: 'platform_ops',
      tournamentId: IDS.tournament,
      assignmentId: null,
      assignmentVersion: null,
    });
    context.tx.v1AdminUser.findUnique.mockResolvedValue({
      adminRole: 'ops', status: 'active', revokedAt: null, user: { accountStatus: 'active' },
    });
    context.tx.v1TournamentStaffAssignment.findUnique.mockResolvedValue(assignment());
    context.tx.v1TournamentStaffAssignment.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      context.service.revokeStaff({
        actorUserId: IDS.actor,
        tournamentId: IDS.tournament,
        assignmentId: IDS.assignment,
        expectedVersion: 99,
        audit: AUDIT,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(context.auditWriter.create).not.toHaveBeenCalled();
    expect(context.realtime.forceDisconnectUser).not.toHaveBeenCalled();
  });

  it('does not disconnect when audit persistence aborts the revoke transaction', async () => {
    const context = setup();
    context.access.assertAccess.mockResolvedValue({
      userId: IDS.actor,
      role: 'platform_ops',
      tournamentId: IDS.tournament,
      assignmentId: null,
      assignmentVersion: null,
    });
    context.tx.v1AdminUser.findUnique.mockResolvedValue({
      adminRole: 'ops', status: 'active', revokedAt: null, user: { accountStatus: 'active' },
    });
    context.tx.v1TournamentStaffAssignment.findUnique
      .mockResolvedValueOnce(assignment())
      .mockResolvedValueOnce(assignment({ version: 1, revokedAt: NOW }));
    context.auditWriter.create.mockRejectedValue(new Error('audit persistence failed'));

    await expect(
      context.service.revokeStaff({
        actorUserId: IDS.actor,
        tournamentId: IDS.tournament,
        assignmentId: IDS.assignment,
        expectedVersion: 0,
        audit: AUDIT,
      }),
    ).rejects.toThrow('audit persistence failed');

    expect(context.auditWriter.create).toHaveBeenCalledTimes(1);
    expect(context.realtime.forceDisconnectUser).not.toHaveBeenCalled();
  });

  it.each([
    { fieldId: IDS.field, fixtureIds: ['not-a-stable-id'] },
    { fieldId: 'not-a-stable-id', fixtureIds: [IDS.fixture] },
    { fieldId: undefined, fixtureIds: [] },
  ])('rejects malformed field/fixture scope before assignment or audit: %j', async (scope) => {
    const context = setup();

    await expect(
      context.service.grantStaff({
        actorUserId: IDS.actor,
        tournamentId: IDS.tournament,
        targetUserId: IDS.target,
        role: 'FIELD_OPERATOR',
        ...scope,
        audit: AUDIT,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(context.prisma.$transaction).not.toHaveBeenCalled();
    expect(context.tx.v1TournamentStaffAssignment.create).not.toHaveBeenCalled();
    expect(context.auditWriter.create).not.toHaveBeenCalled();
  });

  it('rejects a fixture-only cross-tournament scope with zero assignment, audit, and disconnect writes', async () => {
    const context = setup();
    context.access.assertAccess.mockResolvedValue({
      userId: IDS.actor,
      role: 'platform_ops',
      tournamentId: IDS.tournament,
      assignmentId: null,
      assignmentVersion: null,
    });
    context.tx.v1AdminUser.findUnique.mockResolvedValue({
      adminRole: 'ops', status: 'active', revokedAt: null, user: { accountStatus: 'active' },
    });
    context.tx.v1TournamentFixture.findMany.mockResolvedValue([]);

    await expect(
      context.service.grantStaff({
        actorUserId: IDS.actor,
        tournamentId: IDS.tournament,
        targetUserId: IDS.target,
        role: 'FIELD_OPERATOR',
        fixtureIds: [IDS.fixture],
        audit: AUDIT,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(context.tx.v1TournamentStaffAssignment.create).not.toHaveBeenCalled();
    expect(context.auditWriter.create).not.toHaveBeenCalled();
    expect(context.realtime.forceDisconnectUser).not.toHaveBeenCalled();
  });

  it('denies a director whose authority changed after access preflight with zero assignment, audit, and disconnect writes', async () => {
    const context = setup();
    context.access.assertAccess.mockResolvedValue({
      userId: IDS.actor,
      role: 'tournament_director',
      tournamentId: IDS.tournament,
      assignmentId: IDS.directorAssignment,
      assignmentVersion: 4,
    });
    context.tx.v1TournamentStaffAssignment.findFirst.mockResolvedValue(null);

    await expect(
      context.service.grantStaff({
        actorUserId: IDS.actor,
        tournamentId: IDS.tournament,
        targetUserId: IDS.target,
        role: 'FIELD_OPERATOR',
        fieldId: IDS.field,
        audit: AUDIT,
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'STAFF_MANAGEMENT_DENIED',
        details: { reason: 'ACTOR_AUTHORITY_CHANGED' },
      },
    });

    expect(context.tx.v1TournamentStaffAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: IDS.directorAssignment }) }),
    );
    expect(context.tx.v1TournamentStaffAssignment.create).not.toHaveBeenCalled();
    expect(context.auditWriter.create).not.toHaveBeenCalled();
    expect(context.realtime.forceDisconnectUser).not.toHaveBeenCalled();
  });

  it('manual lifecycle: bootstrap -> grant scoped field_operator -> revoke', async () => {
    const context = setup();
    const committedAudits: Array<Record<string, unknown>> = [];
    const actualAuditWriter = new OperationAuditWriterService();
    const service = new TournamentStaffService(
      context.prisma as unknown as PrismaService,
      context.access as unknown as TournamentStaffAccessService,
      actualAuditWriter,
      context.realtime as unknown as RealtimeGateway,
      () => NOW,
    );
    context.access.assertAccess.mockResolvedValue({
      userId: IDS.actor,
      role: 'platform_ops',
      tournamentId: IDS.tournament,
      assignmentId: null,
      assignmentVersion: null,
    });
    context.tx.v1AdminUser.findUnique.mockResolvedValue({
      adminRole: 'ops', status: 'active', revokedAt: null, user: { accountStatus: 'active' },
    });
    context.tx.v1OperationAudit.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      committedAudits.push(data);
      return { id: `audit-${committedAudits.length}` };
    });
    const director = assignment({
      id: IDS.directorAssignment,
      role: 'TOURNAMENT_DIRECTOR',
      fieldId: null,
      fixtureScopes: [],
    });
    const fieldOperator = assignment({ fixtureScopes: [] });
    const revokedFieldOperator = assignment({ fixtureScopes: [], version: 1, revokedAt: NOW });
    context.tx.v1TournamentStaffAssignment.create
      .mockResolvedValueOnce(director)
      .mockResolvedValueOnce(fieldOperator);
    context.tx.v1TournamentStaffAssignment.findUnique
      .mockResolvedValueOnce(fieldOperator)
      .mockResolvedValueOnce(revokedFieldOperator);

    await service.bootstrapFirstDirector({
      actorUserId: IDS.actor,
      tournamentId: IDS.tournament,
      targetUserId: IDS.target,
      audit: { requestId: 'task7-bootstrap', sourceIp: AUDIT.sourceIp },
    });
    await service.grantStaff({
      actorUserId: IDS.actor,
      tournamentId: IDS.tournament,
      targetUserId: IDS.target,
      role: 'FIELD_OPERATOR',
      fieldId: IDS.field,
      audit: { requestId: 'task7-grant', sourceIp: AUDIT.sourceIp },
    });
    const revoked = await service.revokeStaff({
      actorUserId: IDS.actor,
      tournamentId: IDS.tournament,
      assignmentId: IDS.assignment,
      expectedVersion: 0,
      audit: { requestId: 'task7-revoke', sourceIp: AUDIT.sourceIp },
    });

    expect(committedAudits).toHaveLength(3);
    expect(committedAudits.map((audit) => audit['requestId'])).toEqual([
      'task7-bootstrap',
      'task7-grant',
      'task7-revoke',
    ]);
    expect(committedAudits.every((audit) => audit['maskedSourceIp'] === '203.0.113.0')).toBe(true);
    expect(JSON.stringify(committedAudits)).not.toContain(AUDIT.sourceIp);
    expect(revoked).toMatchObject({ version: 1, revokedAt: NOW });
    expect(context.realtime.evictUserFromScopedGameRooms).toHaveBeenCalledTimes(1);
    expect(context.realtime.evictUserFromScopedGameRooms).toHaveBeenCalledWith({
      userId: IDS.target,
      tournamentId: IDS.tournament,
      assignmentVersion: 1,
    });
    expect(context.realtime.forceDisconnectUser).not.toHaveBeenCalled();
    console.log(
      'TASK7_STAFF_MANAGEMENT=PASS bootstrap=platform_ops grants=limited revocation=immediate court=stable audit=atomic deniedWrites=0',
    );
  });
});
