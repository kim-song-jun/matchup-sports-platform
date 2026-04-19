import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as supertest from 'supertest';
import { createTestApp } from '../helpers/nest-app';
import { getPrismaTestClient, disconnectPrismaTestClient } from '../helpers/prisma-test-client';
import { truncateAll } from '../helpers/db-cleanup';
import { devLoginToken } from '../helpers/auth-token';

// ---------------------------------------------------------------------------
// Integration tests: GET/PATCH /api/v1/notifications/preferences
// ---------------------------------------------------------------------------

describe('Notification Preferences (e2e)', () => {
  let app: INestApplication;
  let request: supertest.Agent;
  let prisma: PrismaClient;
  let closeApp: () => Promise<void>;
  let token: string;

  beforeAll(async () => {
    prisma = getPrismaTestClient();
    const testApp = await createTestApp();
    app = testApp.app;
    request = testApp.request;
    closeApp = testApp.close;
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    token = await devLoginToken(request, 'pref_user');
  });

  afterAll(async () => {
    await closeApp();
    await disconnectPrismaTestClient();
  });

  // ── GET defaults ──────────────────────────────────────────────────────────

  describe('GET /api/v1/notifications/preferences', () => {
    it('returns 401 without JWT', async () => {
      const res = await request.get('/api/v1/notifications/preferences');
      expect(res.status).toBe(401);
    });

    it('returns 200 with all 8 fields defaulting to true when no row exists', async () => {
      const res = await request
        .get('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const data = (res.body as { data: Record<string, unknown> }).data;
      expect(data.matchEnabled).toBe(true);
      expect(data.teamEnabled).toBe(true);
      expect(data.chatEnabled).toBe(true);
      expect(data.paymentEnabled).toBe(true);
      expect(data.teamApplicationEnabled).toBe(true);
      expect(data.matchCompletedEnabled).toBe(true);
      expect(data.eloChangedEnabled).toBe(true);
      expect(data.chatMessageEnabled).toBe(true);
    });
  });

  // ── PATCH update ──────────────────────────────────────────────────────────

  describe('PATCH /api/v1/notifications/preferences', () => {
    it('returns 401 without JWT', async () => {
      const res = await request
        .patch('/api/v1/notifications/preferences')
        .send({ chatMessageEnabled: false });
      expect(res.status).toBe(401);
    });

    it('returns 200 and reflects chatMessageEnabled=false', async () => {
      const res = await request
        .patch('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ chatMessageEnabled: false });

      expect(res.status).toBe(200);
      const data = (res.body as { data: Record<string, unknown> }).data;
      expect(data.chatMessageEnabled).toBe(false);
      // Other fields remain true (upsert creates with defaults)
      expect(data.matchEnabled).toBe(true);
      expect(data.eloChangedEnabled).toBe(true);
    });

    it('persists change — subsequent GET reflects updated value', async () => {
      await request
        .patch('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ chatMessageEnabled: false });

      const getRes = await request
        .get('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${token}`);

      expect(getRes.status).toBe(200);
      const data = (getRes.body as { data: Record<string, unknown> }).data;
      expect(data.chatMessageEnabled).toBe(false);
    });

    // Note: boolean type validation is covered in DTO unit specs; the global ValidationPipe
    // runs with { transform: true, enableImplicitConversion: true }, so integration coercion
    // behavior is config-dependent and not re-verified here.

    it('returns 400 when unknown field is sent', async () => {
      const res = await request
        .patch('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ unknownField: true });

      expect(res.status).toBe(400);
    });

    it('can update multiple granular fields in one call', async () => {
      const res = await request
        .patch('/api/v1/notifications/preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ eloChangedEnabled: false, teamApplicationEnabled: false });

      expect(res.status).toBe(200);
      const data = (res.body as { data: Record<string, unknown> }).data;
      expect(data.eloChangedEnabled).toBe(false);
      expect(data.teamApplicationEnabled).toBe(false);
      expect(data.matchEnabled).toBe(true);
    });
  });
});
