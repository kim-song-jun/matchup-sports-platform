import type { INestApplication } from '@nestjs/common';
import { AdminService } from '../../src/admin/admin.service';
import type { V1AuthUser } from '../../src/auth/v1-auth-user';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createV1IntegrationApp } from './integration-app';

const ownerAUserId = 'integration-owner-invariant-a';
const ownerBUserId = 'integration-owner-invariant-b';
const ownerUserIds = [ownerAUserId, ownerBUserId];

describe('Admin owner access integration contract', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let adminService: AdminService;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    adminService = app.get(AdminService);
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanupFixtures();
    await prisma.v1User.createMany({
      data: [
        {
          id: ownerAUserId,
          email: 'owner-invariant-a@integration.test',
          onboardingStatus: 'completed',
        },
        {
          id: ownerBUserId,
          email: 'owner-invariant-b@integration.test',
          onboardingStatus: 'completed',
        },
      ],
    });
    await prisma.v1AdminUser.createMany({
      data: [
        { id: 'integration-owner-invariant-admin-a', userId: ownerAUserId, adminRole: 'owner' },
        { id: 'integration-owner-invariant-admin-b', userId: ownerBUserId, adminRole: 'owner' },
      ],
    });
  });

  afterEach(cleanupFixtures);
  afterAll(async () => cleanupApp?.());

  async function cleanupFixtures() {
    if (!prisma) return;
    await prisma.v1AdminActionLog.deleteMany({
      where: { adminUser: { userId: { in: ownerUserIds } } },
    });
    await prisma.v1AdminUser.deleteMany({ where: { userId: { in: ownerUserIds } } });
    await prisma.v1User.deleteMany({ where: { id: { in: ownerUserIds } } });
  }

  function authUser(id: string, email: string): V1AuthUser {
    return {
      id,
      email,
      accountStatus: 'active',
      onboardingStatus: 'completed',
    };
  }

  it('serializes two concurrent owner demotions and preserves one accessible owner', async () => {
    const results = await Promise.allSettled([
      adminService.updateAdmin(
        authUser(ownerAUserId, 'owner-invariant-a@integration.test'),
        ownerBUserId,
        { adminRole: 'ops', reason: 'concurrent integration demotion A' },
      ),
      adminService.updateAdmin(
        authUser(ownerBUserId, 'owner-invariant-b@integration.test'),
        ownerAUserId,
        { adminRole: 'ops', reason: 'concurrent integration demotion B' },
      ),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ reason: { response: { code: 'PERMISSION_DENIED' } } });

    const activeOwners = await prisma.v1AdminUser.findMany({
      where: {
        userId: { in: ownerUserIds },
        adminRole: 'owner',
        status: 'active',
        user: { accountStatus: 'active' },
      },
      select: { userId: true },
    });
    expect(activeOwners).toHaveLength(1);
  });
});
