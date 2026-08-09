import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const actorIds = {
  owner: 'task7-admin-boundary-owner',
  ops: 'task7-admin-boundary-ops',
  support: 'task7-admin-boundary-support',
  inactiveAdmin: 'task7-admin-boundary-inactive-admin',
  authenticated: 'task7-admin-boundary-authenticated',
  tournamentDirector: 'task7-admin-boundary-tournament-director',
  fieldOperator: 'task7-admin-boundary-field-operator',
  teamManager: 'task7-admin-boundary-team-manager',
  staleAdmin: 'task7-admin-boundary-stale-admin',
} as const;

const allUserIds = Object.values(actorIds);
const sportId = 'task7-admin-boundary-sport';
const regionId = 'task7-admin-boundary-region';
const teamId = 'task7-admin-boundary-team';
const tournamentFieldId = 'task7-admin-boundary-field';
const ownerFailureId = 'task7-admin-boundary-owner-failure';
const opsFailureId = 'task7-admin-boundary-ops-failure';
const deniedFailureId = 'task7-admin-boundary-denied-failure';
const malformedFailureId = 'task7-admin-boundary-malformed-failure';
const failureIds = [ownerFailureId, opsFailureId, deniedFailureId, malformedFailureId];

type AuthenticatedDeniedActor = {
  readonly label:
    | 'support'
    | 'inactive_admin'
    | 'authenticated_user'
    | 'tournament_director'
    | 'field_operator'
    | 'team_manager';
  readonly userId: string;
};

const authenticatedDeniedActors: readonly AuthenticatedDeniedActor[] = [
  { label: 'support', userId: actorIds.support },
  { label: 'inactive_admin', userId: actorIds.inactiveAdmin },
  { label: 'authenticated_user', userId: actorIds.authenticated },
  { label: 'tournament_director', userId: actorIds.tournamentDirector },
  { label: 'field_operator', userId: actorIds.fieldOperator },
  { label: 'team_manager', userId: actorIds.teamManager },
];

describe('Task 7 /admin platform_ops boundary characterization', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanupFixtures();
    await seedFixtures();
  });

  afterEach(cleanupFixtures);
  afterAll(async () => cleanupApp?.());

  it('keeps /admin mutations inside active owner/ops while support reads and every non-ops actor leaves no write', async () => {
    const supportRead = await request(app.getHttpServer())
      .get('/api/v1/admin/ops/recent-push-failures?limit=10')
      .set('x-v1-user-id', actorIds.support)
      .expect(200);
    expect(supportRead.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: deniedFailureId })]),
    );

    for (const allowed of [
      { label: 'owner', userId: actorIds.owner, failureId: ownerFailureId },
      { label: 'ops', userId: actorIds.ops, failureId: opsFailureId },
    ] as const) {
      const auditBefore = await prisma.v1AdminActionLog.count({
        where: { targetType: 'web_push_failure_log', targetId: allowed.failureId },
      });

      await request(app.getHttpServer())
        .post('/api/v1/admin/ops/push-failures/ack')
        .set('x-v1-user-id', allowed.userId)
        .send({ ids: [allowed.failureId] })
        .expect(201);

      const [failure, auditRows] = await Promise.all([
        prisma.v1WebPushFailureLog.findUniqueOrThrow({ where: { id: allowed.failureId } }),
        prisma.v1AdminActionLog.findMany({
          where: { targetType: 'web_push_failure_log', targetId: allowed.failureId },
          include: { adminUser: { select: { userId: true, adminRole: true } } },
        }),
      ]);
      expect(failure.acknowledgedAt).toBeInstanceOf(Date);
      expect(failure.acknowledgedBy).toBe(allowed.userId);
      expect(auditRows).toHaveLength(auditBefore + 1);
      expect(auditRows.at(-1)).toMatchObject({
        action: 'web_push_failure_log.ack',
        adminUser: { userId: allowed.userId, adminRole: allowed.label },
      });
    }

    for (const actor of authenticatedDeniedActors) {
      await expectDeniedWithoutWrite(actor.userId, 403);
    }

    await expectDeniedWithoutWrite(undefined, 401);

    await expectDeniedWithoutWrite(actorIds.staleAdmin, 403);

    const malformedBefore = await snapshotFailure(malformedFailureId);
    const malformedResponse = await request(app.getHttpServer())
      .post('/api/v1/admin/ops/push-failures/ack')
      .set('x-v1-user-id', actorIds.owner)
      .send({ ids: [malformedFailureId], tournamentId: 'forged-cross-tournament' })
      .expect(400);
    expect(malformedResponse.body.code).toBe('VALIDATION_ERROR');
    expect(await snapshotFailure(malformedFailureId)).toEqual(malformedBefore);

    console.log('TASK7_ADMIN_BOUNDARY_PIN=PASS allowed=2 denied=6 audit=1 deniedWrites=0');
  });

  async function expectDeniedWithoutWrite(userId: string | undefined, status: 401 | 403) {
    const before = await snapshotFailure(deniedFailureId);
    let operation = request(app.getHttpServer())
      .post('/api/v1/admin/ops/push-failures/ack')
      .send({ ids: [deniedFailureId] });
    if (userId) operation = operation.set('x-v1-user-id', userId);

    const response = await operation.expect(status);
    expect(response.body.code).toBe(status === 401 ? 'UNAUTHENTICATED' : 'PERMISSION_DENIED');
    expect(await snapshotFailure(deniedFailureId)).toEqual(before);
  }

  async function snapshotFailure(failureId: string) {
    const [failure, auditCount] = await Promise.all([
      prisma.v1WebPushFailureLog.findUniqueOrThrow({
        where: { id: failureId },
        select: { acknowledgedAt: true, acknowledgedBy: true },
      }),
      prisma.v1AdminActionLog.count({
        where: { targetType: 'web_push_failure_log', targetId: failureId },
      }),
    ]);
    return {
      acknowledgedAt: failure.acknowledgedAt?.toISOString() ?? null,
      acknowledgedBy: failure.acknowledgedBy,
      auditCount,
    };
  }

  async function seedFixtures() {
    await prisma.v1User.createMany({
      data: allUserIds.map((id) => ({
        id,
        email: `${id}@integration.test`,
        onboardingStatus: 'completed',
        phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        accountStatus: id === actorIds.staleAdmin ? 'suspended' : 'active',
      })),
    });

    const termsService = app.get(ManagedTermsRuntimeService);
    const signupTerms = await termsService.currentSignupTerms();
    const requiredDocumentIds = signupTerms.items
      .filter((item) => item.requirement === 'required')
      .map((item) => item.documentId);
    await Promise.all(
      allUserIds.map((userId) => termsService.acceptSignupTerms(userId, requiredDocumentIds)),
    );

    await prisma.v1AdminUser.createMany({
      data: [
        { id: 'task7-admin-boundary-owner-admin', userId: actorIds.owner, adminRole: 'owner' },
        { id: 'task7-admin-boundary-ops-admin', userId: actorIds.ops, adminRole: 'ops' },
        { id: 'task7-admin-boundary-support-admin', userId: actorIds.support, adminRole: 'support' },
        {
          id: 'task7-admin-boundary-inactive-admin-record',
          userId: actorIds.inactiveAdmin,
          adminRole: 'ops',
          status: 'suspended',
        },
        {
          id: 'task7-admin-boundary-stale-admin-record',
          userId: actorIds.staleAdmin,
          adminRole: 'ops',
        },
      ],
    });

    await prisma.v1TournamentField.create({
      data: {
        id: tournamentFieldId,
        tournamentId: 'task7-admin-boundary-tournament-b',
        scopeKey: 'task7-admin-boundary-court',
        name: 'Task 7 boundary court',
      },
    });
    await prisma.v1TournamentStaffAssignment.createMany({
      data: [
        {
          id: 'task7-admin-boundary-director-assignment',
          tournamentId: 'task7-admin-boundary-tournament-a',
          userId: actorIds.tournamentDirector,
          role: 'TOURNAMENT_DIRECTOR',
          grantedByUserId: actorIds.owner,
        },
        {
          id: 'task7-admin-boundary-field-assignment',
          tournamentId: 'task7-admin-boundary-tournament-b',
          userId: actorIds.fieldOperator,
          role: 'FIELD_OPERATOR',
          fieldId: tournamentFieldId,
          grantedByUserId: actorIds.owner,
        },
      ],
    });

    await prisma.v1Sport.create({ data: { id: sportId, code: sportId, name: 'Task 7 sport' } });
    await prisma.v1Region.create({ data: { id: regionId, code: regionId, name: 'Task 7 region', level: 1 } });
    await prisma.v1Team.create({
      data: {
        id: teamId,
        ownerUserId: actorIds.authenticated,
        sportId,
        regionId,
        name: 'Task 7 boundary team',
      },
    });
    await prisma.v1TeamMembership.create({
      data: {
        id: 'task7-admin-boundary-manager-membership',
        teamId,
        userId: actorIds.teamManager,
        role: 'manager',
        status: 'active',
      },
    });

    await prisma.v1WebPushFailureLog.createMany({
      data: failureIds.map((id) => ({
        id,
        userId: actorIds.authenticated,
        statusCode: 503,
        errorCode: 'TASK7_BOUNDARY_PROBE',
        endpointSuffix: id.slice(-12),
      })),
    });
  }

  async function cleanupFixtures() {
    if (!prisma) return;
    await prisma.v1AdminActionLog.deleteMany({
      where: { targetType: 'web_push_failure_log', targetId: { in: failureIds } },
    });
    await prisma.v1WebPushFailureLog.deleteMany({ where: { id: { in: failureIds } } });
    await prisma.v1TeamMembership.deleteMany({ where: { teamId } });
    await prisma.v1Team.deleteMany({ where: { id: teamId } });
    await prisma.v1TournamentStaffFixtureScope.deleteMany({
      where: {
        assignmentId: {
          in: [
            'task7-admin-boundary-director-assignment',
            'task7-admin-boundary-field-assignment',
          ],
        },
      },
    });
    await prisma.v1TournamentStaffAssignment.deleteMany({
      where: {
        id: {
          in: [
            'task7-admin-boundary-director-assignment',
            'task7-admin-boundary-field-assignment',
          ],
        },
      },
    });
    await prisma.v1TournamentField.deleteMany({ where: { id: tournamentFieldId } });
    await prisma.v1AdminUser.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.v1ManagedTermsConsentEvent.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.v1User.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.v1Region.deleteMany({ where: { id: regionId } });
    await prisma.v1Sport.deleteMany({ where: { id: sportId } });
  }
});
