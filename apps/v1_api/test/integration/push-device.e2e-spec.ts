import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from './integration-app';

const ids = {
  userA: '9a560000-0000-4000-8000-000000000001',
  userB: '9a560000-0000-4000-8000-000000000002',
  installationA: '9a560000-0000-4000-8000-000000000011',
  installationB: '9a560000-0000-4000-8000-000000000012',
} as const;

describe('Android push-device HTTP lifecycle', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  const originalPushEnvironment = process.env.V1_PUSH_ENVIRONMENT;
  const originalFirebase = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
  };

  beforeAll(async () => {
    process.env.V1_PUSH_ENVIRONMENT = 'alpha';
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);

    await prisma.v1User.createMany({
      data: [ids.userA, ids.userB].map((id) => ({
        id,
        email: `${id}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
        phoneVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      })),
    });
    const termsService = app.get(ManagedTermsRuntimeService);
    const requiredDocumentIds = (await termsService.currentSignupTerms()).items
      .filter((item) => item.requirement === 'required')
      .map((item) => item.documentId);
    await Promise.all(
      [ids.userA, ids.userB].map((id) => termsService.acceptSignupTerms(id, requiredDocumentIds)),
    );
  });

  afterAll(async () => {
    try {
      await cleanupApp?.();
    } finally {
      if (originalPushEnvironment === undefined) delete process.env.V1_PUSH_ENVIRONMENT;
      else process.env.V1_PUSH_ENVIRONMENT = originalPushEnvironment;
      for (const [name, value] of Object.entries({
        FIREBASE_PROJECT_ID: originalFirebase.projectId,
        FIREBASE_CLIENT_EMAIL: originalFirebase.clientEmail,
        FIREBASE_PRIVATE_KEY: originalFirebase.privateKey,
      })) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it('requires authentication and the real DTO validation pipeline', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/notifications/push-devices')
      .send({ installationId: ids.installationA, token: 'registration-token-long-enough' })
      .expect(401);

    const invalid = await request(app.getHttpServer())
      .post('/api/v1/notifications/push-devices')
      .set('x-v1-user-id', ids.userA)
      .send({ installationId: 'not-a-uuid', token: 'short', environment: 'production' })
      .expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
  });

  it('registers, refreshes, and returns no registration token', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/notifications/push-devices')
      .set('x-v1-user-id', ids.userA)
      .send({
        installationId: ids.installationA,
        token: 'alpha-registration-token-version-one',
        appVersion: '0.1.0-alpha',
        deviceModel: 'Test Android',
      })
      .expect(201);
    expect(created.body.data).toMatchObject({
      installationId: ids.installationA,
      platform: 'android',
      environment: 'alpha',
      revokedAt: null,
    });
    expect(JSON.stringify(created.body)).not.toContain('alpha-registration-token-version-one');

    await request(app.getHttpServer())
      .post('/api/v1/notifications/push-devices')
      .set('x-v1-user-id', ids.userA)
      .send({
        installationId: ids.installationA,
        token: 'alpha-registration-token-version-two',
      })
      .expect(201);

    const row = await prisma.v1PushDevice.findUniqueOrThrow({
      where: {
        environment_installationId: {
          environment: 'alpha',
          installationId: ids.installationA,
        },
      },
    });
    expect(row.token).toBe('alpha-registration-token-version-two');
  });

  it('keeps multiple installations and prevents another user from revoking them', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/notifications/push-devices')
      .set('x-v1-user-id', ids.userA)
      .send({
        installationId: ids.installationB,
        token: 'alpha-registration-token-device-two',
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/notifications/push-devices/${ids.installationB}`)
      .set('x-v1-user-id', ids.userB)
      .expect(204);
    expect(
      await prisma.v1PushDevice.count({
        where: { userId: ids.userA, environment: 'alpha', revokedAt: null },
      }),
    ).toBe(2);
  });

  it('revokes only the current user installation and isolates environments server-side', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/notifications/push-devices/${ids.installationA}`)
      .set('x-v1-user-id', ids.userA)
      .expect(204);
    const alpha = await prisma.v1PushDevice.findUniqueOrThrow({
      where: {
        environment_installationId: {
          environment: 'alpha',
          installationId: ids.installationA,
        },
      },
    });
    expect(alpha.revokedAt).not.toBeNull();

    process.env.V1_PUSH_ENVIRONMENT = 'production';
    await request(app.getHttpServer())
      .post('/api/v1/notifications/push-devices')
      .set('x-v1-user-id', ids.userA)
      .send({
        installationId: ids.installationA,
        token: 'production-registration-token-device-one',
      })
      .expect(201);
    process.env.V1_PUSH_ENVIRONMENT = 'alpha';

    expect(
      await prisma.v1PushDevice.count({ where: { installationId: ids.installationA } }),
    ).toBe(2);
  });
});
