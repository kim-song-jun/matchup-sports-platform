import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../helpers/nest-app';
import { getPrismaTestClient, disconnectPrismaTestClient } from '../helpers/prisma-test-client';
import { truncateAll } from '../helpers/db-cleanup';
import { devLoginToken } from '../helpers/auth-token';
import { PrismaClient, OAuthProvider, UserRole } from '@prisma/client';
import { createSinaro } from '../fixtures/personas';
import { createWebPushFailure } from '../fixtures/ops';

// ---------------------------------------------------------------------------
// Admin Ops integration tests
// GET /admin/ops/summary — shape + AdminGuard
// GET /admin/ops/recent-push-failures — PII guard
// POST /admin/ops/push-failures/ack — ack behaviour
// ---------------------------------------------------------------------------

describe('Admin Ops (e2e)', () => {
  let app: INestApplication;
  let request: ReturnType<typeof import('supertest')['agent']>;
  let prisma: PrismaClient;
  let closeApp: () => Promise<void>;

  let adminToken: string;
  let userToken: string;
  let adminId: string;
  let regularUserId: string;

  beforeAll(async () => {
    prisma = getPrismaTestClient();
    const testApp = await createTestApp();
    app = testApp.app;
    request = testApp.request;
    closeApp = testApp.close;
  });

  beforeEach(async () => {
    await truncateAll(prisma);

    // Create admin persona
    const admin = await prisma.user.create({
      data: {
        email: 'ops-admin@test.local',
        nickname: 'ops_admin',
        role: UserRole.admin,
        oauthProvider: OAuthProvider.email,
        oauthId: 'email_ops-admin@test.local',
        sportTypes: [],
        mannerScore: 5.0,
        locationCity: '서울',
        locationDistrict: '강남구',
      },
    });
    adminId = admin.id;
    adminToken = await devLoginToken(request, admin.nickname);

    // Create regular user
    const regular = await createSinaro(prisma);
    regularUserId = regular.id;
    userToken = await devLoginToken(request, regular.nickname);
  });

  afterAll(async () => {
    await closeApp();
    await disconnectPrismaTestClient();
  });

  // ── GET /admin/ops/summary ─────────────────────────────────────────────────

  describe('GET /api/v1/admin/ops/summary', () => {
    it('returns summary with all 6 KPI fields for admin', async () => {
      const res = await request
        .get('/api/v1/admin/ops/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        matchesInProgress: expect.any(Number),
        paymentsPending: expect.any(Number),
        disputesOpen: expect.any(Number),
        settlementsPending: expect.any(Number),
        payoutsFailed: expect.any(Number),
        pushFailures5m: expect.any(Number),
      });
    });

    it('returns 403 for non-admin user', async () => {
      const res = await request
        .get('/api/v1/admin/ops/summary')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 401 without token', async () => {
      const res = await request.get('/api/v1/admin/ops/summary');
      expect(res.status).toBe(401);
    });

    it('counts pushFailures5m from WebPushFailureLog within window', async () => {
      // Create 3 unacknowledged failures
      await createWebPushFailure(prisma, regularUserId, { statusCode: 500 });
      await createWebPushFailure(prisma, regularUserId, { statusCode: 502 });
      await createWebPushFailure(prisma, regularUserId, { statusCode: 503 });
      // Create 1 already acknowledged — should not count
      await createWebPushFailure(prisma, regularUserId, {
        statusCode: 410,
        acknowledgedAt: new Date(),
        acknowledgedBy: adminId,
      });

      const res = await request
        .get('/api/v1/admin/ops/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.pushFailures5m).toBe(3);
    });
  });

  // ── GET /admin/ops/recent-push-failures ───────────────────────────────────

  describe('GET /api/v1/admin/ops/recent-push-failures', () => {
    it('returns 403 for non-admin', async () => {
      const res = await request
        .get('/api/v1/admin/ops/recent-push-failures')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    it('returns records without userId, with userIdHash (8 hex chars) and endpointSuffix (6 chars)', async () => {
      await createWebPushFailure(prisma, regularUserId, {
        endpointSuffix: 'xyz789',
        statusCode: 410,
      });

      const res = await request
        .get('/api/v1/admin/ops/recent-push-failures')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const records = res.body.data as Array<Record<string, unknown>>;
      expect(records.length).toBeGreaterThanOrEqual(1);

      const record = records[0];
      expect(record).not.toHaveProperty('userId');
      expect(typeof record.userIdHash).toBe('string');
      expect((record.userIdHash as string)).toMatch(/^[0-9a-f]{8}$/);
      expect(typeof record.endpointSuffix).toBe('string');
      expect((record.endpointSuffix as string).length).toBe(6);
    });

    it('respects limit query param', async () => {
      for (let i = 0; i < 5; i++) {
        await createWebPushFailure(prisma, regularUserId, { statusCode: 500 });
      }

      const res = await request
        .get('/api/v1/admin/ops/recent-push-failures?limit=2')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect((res.body.data as unknown[]).length).toBeLessThanOrEqual(2);
    });
  });

  // ── POST /admin/ops/push-failures/ack ────────────────────────────────────

  describe('POST /api/v1/admin/ops/push-failures/ack', () => {
    it('returns 403 for non-admin', async () => {
      const res = await request
        .post('/api/v1/admin/ops/push-failures/ack')
        .set('Authorization', `Bearer ${userToken}`)
        .send({});

      expect(res.status).toBe(403);
    });

    it('acknowledges specific ids and returns count', async () => {
      const log1 = await createWebPushFailure(prisma, regularUserId, { statusCode: 500 });
      const log2 = await createWebPushFailure(prisma, regularUserId, { statusCode: 502 });

      const res = await request
        .post('/api/v1/admin/ops/push-failures/ack')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [log1.id, log2.id] });

      expect(res.status).toBe(200);
      expect(res.body.data.acknowledged).toBe(2);

      const updated = await prisma.webPushFailureLog.findUnique({ where: { id: log1.id } });
      expect(updated?.acknowledgedAt).not.toBeNull();
      expect(updated?.acknowledgedBy).toBe(adminId);
    });

    it('acknowledges all within window when ids is omitted', async () => {
      await createWebPushFailure(prisma, regularUserId, { statusCode: 500 });
      await createWebPushFailure(prisma, regularUserId, { statusCode: 502 });

      const res = await request
        .post('/api/v1/admin/ops/push-failures/ack')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.acknowledged).toBeGreaterThanOrEqual(2);
    });

    it('skips already acknowledged records (idempotent)', async () => {
      const alreadyAcked = await createWebPushFailure(prisma, regularUserId, {
        statusCode: 410,
        acknowledgedAt: new Date(),
        acknowledgedBy: adminId,
      });

      const res = await request
        .post('/api/v1/admin/ops/push-failures/ack')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [alreadyAcked.id] });

      expect(res.status).toBe(200);
      // Already acked → updateMany where acknowledgedAt: null → 0 updated
      expect(res.body.data.acknowledged).toBe(0);
    });
  });
});
