import { ForbiddenException } from '@nestjs/common';
import { OperationAuditWriterService } from '../../common/audit/operation-audit-writer.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { TournamentStaffAccessService } from './tournament-staff-access.service';
import { TournamentStaffService } from './tournament-staff.service';

const ID = {
  sport: '71000000-0000-4000-8000-000000000001',
  config: '11111111-1111-4111-8111-111111111111',
  tournament: '71000000-0000-4000-8000-000000000003',
  otherTournament: '71000000-0000-4000-8000-000000000004',
  field: '71000000-0000-4000-8000-000000000005',
  otherField: '71000000-0000-4000-8000-000000000006',
  fixture: '71000000-0000-4000-8000-000000000007',
  otherFixture: '71000000-0000-4000-8000-000000000008',
  ops: '72000000-0000-4000-8000-000000000001',
  director: '72000000-0000-4000-8000-000000000002',
  operator: '72000000-0000-4000-8000-000000000003',
  rollbackTarget: '72000000-0000-4000-8000-000000000004',
  laterDirector: '72000000-0000-4000-8000-000000000005',
  admin: '73000000-0000-4000-8000-000000000001',
} as const;
const NOW = new Date('2026-08-01T06:00:00.000Z');

describe('TournamentStaffService PostgreSQL contract', () => {
  const prisma = new PrismaService();
  const auditWriter = new OperationAuditWriterService();
  const realtime = { forceDisconnectUser: jest.fn() };
  const access = new TournamentStaffAccessService(prisma, () => NOW);
  const service = new TournamentStaffService(
    prisma,
    access,
    auditWriter,
    realtime as unknown as RealtimeGateway,
    () => NOW,
  );

  beforeAll(async () => {
    await prisma.$connect();
    await seed();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists bootstrap, director-limited stable scopes, atomic audit, and immediate revoke', async () => {
    const beforeFirstDirectorAttempt = await counts();
    await expect(
      service.grantStaff({
        actorUserId: ID.ops,
        tournamentId: ID.tournament,
        targetUserId: ID.director,
        role: 'TOURNAMENT_DIRECTOR',
        audit: { requestId: 'task7-pg-direct-first-director', sourceIp: '203.0.113.42' },
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'STAFF_MANAGEMENT_DENIED',
        details: { reason: 'FIRST_DIRECTOR_REQUIRES_BOOTSTRAP' },
      },
    });
    expect(await counts()).toEqual(beforeFirstDirectorAttempt);
    expect(
      await prisma.v1TournamentStaffAssignment.count({
        where: { tournamentId: ID.tournament, userId: ID.director },
      }),
    ).toBe(0);
    expect(
      await prisma.v1OperationAudit.count({ where: { requestId: 'task7-pg-direct-first-director' } }),
    ).toBe(0);

    const director = await service.bootstrapFirstDirector({
      actorUserId: ID.ops,
      tournamentId: ID.tournament,
      targetUserId: ID.director,
      audit: { requestId: 'task7-pg-bootstrap', sourceIp: '203.0.113.42' },
    });
    const laterDirector = await service.grantStaff({
      actorUserId: ID.ops,
      tournamentId: ID.tournament,
      targetUserId: ID.laterDirector,
      role: 'TOURNAMENT_DIRECTOR',
      audit: { requestId: 'task7-pg-later-director', sourceIp: '203.0.113.42' },
    });
    const operator = await service.grantStaff({
      actorUserId: ID.director,
      tournamentId: ID.tournament,
      targetUserId: ID.operator,
      role: 'FIELD_OPERATOR',
      fieldId: ID.field,
      fixtureIds: [ID.fixture],
      audit: { requestId: 'task7-pg-grant', sourceIp: '203.0.113.42' },
    });
    const beforeDenied = await counts();

    await expect(
      service.grantStaff({
        actorUserId: ID.director,
        tournamentId: ID.tournament,
        targetUserId: ID.rollbackTarget,
        role: 'FIELD_OPERATOR',
        fieldId: ID.otherField,
        fixtureIds: [ID.otherFixture],
        audit: { requestId: 'task7-pg-cross-scope', sourceIp: '203.0.113.42' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await counts()).toEqual(beforeDenied);

    const revoked = await service.revokeStaff({
      actorUserId: ID.director,
      tournamentId: ID.tournament,
      assignmentId: operator.id,
      expectedVersion: operator.version,
      audit: { requestId: 'task7-pg-revoke', sourceIp: '203.0.113.42' },
    });
    const [persisted, audits] = await Promise.all([
      prisma.v1TournamentStaffAssignment.findUniqueOrThrow({ where: { id: operator.id } }),
      prisma.v1OperationAudit.findMany({
        where: {
          requestId: {
            in: [
              'task7-pg-bootstrap',
              'task7-pg-later-director',
              'task7-pg-grant',
              'task7-pg-revoke',
            ],
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    expect(director.role).toBe('TOURNAMENT_DIRECTOR');
    expect(laterDirector).toMatchObject({
      userId: ID.laterDirector,
      role: 'TOURNAMENT_DIRECTOR',
    });
    expect(operator).toMatchObject({ fieldId: ID.field, fixtureIds: [ID.fixture] });
    expect(persisted).toMatchObject({ revokedAt: NOW, version: 1 });
    expect(revoked).toMatchObject({ revokedAt: NOW, version: 1 });
    expect(audits).toHaveLength(4);
    expect(audits.every((audit) => audit.maskedSourceIp === '203.0.113.0')).toBe(true);
    expect(realtime.forceDisconnectUser).toHaveBeenCalledTimes(1);
    expect(realtime.forceDisconnectUser).toHaveBeenCalledWith(ID.operator);
  });

  it('rolls back assignment and audit together when audit persistence fails', async () => {
    const failingAudit = {
      create: async (...args: Parameters<OperationAuditWriterService['create']>) => {
        await auditWriter.create(...args);
        throw new Error('forced audit transaction failure');
      },
    };
    const failingService = new TournamentStaffService(
      prisma,
      access,
      failingAudit as OperationAuditWriterService,
      realtime as unknown as RealtimeGateway,
      () => NOW,
    );
    const before = await counts();

    await expect(
      failingService.grantStaff({
        actorUserId: ID.director,
        tournamentId: ID.tournament,
        targetUserId: ID.rollbackTarget,
        role: 'SUPPORT_READONLY',
        audit: { requestId: 'task7-pg-forced-rollback', sourceIp: '203.0.113.42' },
      }),
    ).rejects.toThrow('forced audit transaction failure');

    expect(await counts()).toEqual(before);
    expect(
      await prisma.v1OperationAudit.count({ where: { requestId: 'task7-pg-forced-rollback' } }),
    ).toBe(0);
    expect(
      await prisma.v1TournamentStaffAssignment.count({
        where: { tournamentId: ID.tournament, userId: ID.rollbackTarget },
      }),
    ).toBe(0);
  });

  async function counts() {
    const [assignments, audits] = await Promise.all([
      prisma.v1TournamentStaffAssignment.count({ where: { tournamentId: ID.tournament } }),
      prisma.v1OperationAudit.count({ where: { tournamentId: ID.tournament } }),
    ]);
    return { assignments, audits };
  }

  async function seed() {
    await prisma.v1Sport.create({ data: { id: ID.sport, code: 'football', name: 'Task 7 Staff' } });
    await prisma.v1User.createMany({
      data: [ID.ops, ID.director, ID.operator, ID.rollbackTarget, ID.laterDirector].map((id) => ({
        id,
        accountStatus: 'active' as const,
        onboardingStatus: 'completed' as const,
      })),
    });
    await prisma.v1AdminUser.create({
      data: { id: ID.admin, userId: ID.ops, adminRole: 'ops' },
    });
    await prisma.v1Tournament.createMany({
      data: [
        { id: ID.tournament, sportId: ID.sport, title: 'Task 7', competitionConfigVersionId: ID.config },
        { id: ID.otherTournament, sportId: ID.sport, title: 'Task 7 Other', competitionConfigVersionId: ID.config },
      ],
    });
    await prisma.v1TournamentField.createMany({
      data: [
        { id: ID.field, tournamentId: ID.tournament, scopeKey: 'court-a', name: 'Court A' },
        { id: ID.otherField, tournamentId: ID.otherTournament, scopeKey: 'court-b', name: 'Court B' },
      ],
    });
    await prisma.v1TournamentFixture.createMany({
      data: [
        {
          id: ID.fixture,
          tournamentId: ID.tournament,
          round: 'group',
          fixtureNumber: 1,
          competitionConfigVersionId: ID.config,
        },
        {
          id: ID.otherFixture,
          tournamentId: ID.otherTournament,
          round: 'group',
          fixtureNumber: 1,
          competitionConfigVersionId: ID.config,
        },
      ],
    });
  }

});
