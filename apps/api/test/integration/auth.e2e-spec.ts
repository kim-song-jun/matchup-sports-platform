import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../helpers/nest-app';
import { getPrismaTestClient, disconnectPrismaTestClient } from '../helpers/prisma-test-client';
import { truncateAll } from '../helpers/db-cleanup';
import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Full auth flow: register → login → me → refresh → withdraw
// ---------------------------------------------------------------------------

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let request: ReturnType<typeof import('supertest')['agent']>;
  let prisma: PrismaClient;
  let closeApp: () => Promise<void>;

  beforeAll(async () => {
    prisma = getPrismaTestClient();
    const testApp = await createTestApp();
    app = testApp.app;
    request = testApp.request;
    closeApp = testApp.close;
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await closeApp();
    await disconnectPrismaTestClient();
  });

  // ── register ───────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/register', () => {
    it('registers a new user and returns tokens', async () => {
      const res = await request
        .post('/api/v1/auth/register')
        .send({ email: 'new@test.local', password: 'pass1234', nickname: 'newuser' });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.user).not.toHaveProperty('passwordHash');
    });

    it('returns 409 for duplicate email', async () => {
      await request
        .post('/api/v1/auth/register')
        .send({ email: 'dup@test.local', password: 'pass1234', nickname: 'user1' });

      const res = await request
        .post('/api/v1/auth/register')
        .send({ email: 'dup@test.local', password: 'pass1234', nickname: 'user2' });

      expect(res.status).toBe(409);
    });
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('returns tokens for valid credentials', async () => {
      await request
        .post('/api/v1/auth/register')
        .send({ email: 'login@test.local', password: 'pass1234', nickname: 'loginuser' });

      const res = await request
        .post('/api/v1/auth/login')
        .send({ email: 'login@test.local', password: 'pass1234' });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('accessToken');
    });

    it('returns 400 for wrong password', async () => {
      await request
        .post('/api/v1/auth/register')
        .send({ email: 'wp@test.local', password: 'correct', nickname: 'wpuser' });

      const res = await request
        .post('/api/v1/auth/login')
        .send({ email: 'wp@test.local', password: 'wrong' });

      expect(res.status).toBe(400);
    });
  });

  // ── me ─────────────────────────────────────────────────────────────────────

  describe('GET /api/v1/auth/me', () => {
    it('returns current user without passwordHash', async () => {
      const registerRes = await request
        .post('/api/v1/auth/register')
        .send({ email: 'me@test.local', password: 'pass1234', nickname: 'meuser' });

      const { accessToken } = registerRes.body.data;

      const res = await request
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).not.toHaveProperty('passwordHash');
      expect(res.body.data.nickname).toBe('meuser');
    });

    it('returns 401 without token', async () => {
      const res = await request.get('/api/v1/auth/me');

      expect(res.status).toBe(401);
    });
  });

  // ── refresh ────────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/refresh', () => {
    it('returns new tokens for a valid refresh token', async () => {
      const registerRes = await request
        .post('/api/v1/auth/register')
        .send({ email: 'refresh@test.local', password: 'pass1234', nickname: 'refreshuser' });

      const { refreshToken } = registerRes.body.data;

      const res = await request
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('accessToken');
    });

    it('returns 401 for invalid refresh token', async () => {
      const res = await request
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'not-a-valid-token' });

      expect(res.status).toBe(401);
    });
  });

  // ── withdraw ───────────────────────────────────────────────────────────────

  describe('DELETE /api/v1/auth/withdraw', () => {
    it('soft-deletes the user and subsequent me call returns 401', async () => {
      const registerRes = await request
        .post('/api/v1/auth/register')
        .send({ email: 'del@test.local', password: 'pass1234', nickname: 'deluser' });

      const { accessToken } = registerRes.body.data;

      const withdrawRes = await request
        .delete('/api/v1/auth/withdraw')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(withdrawRes.status).toBe(200);

      // After withdraw, findById throws NotFoundException → guard returns 401
      const meRes = await request
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect([401, 404]).toContain(meRes.status);
    });
  });

  // ── dev-login production guard ──────────────────────────────────────────────
  //
  // The production block is enforced at the controller level (AuthController.devLogin)
  // by checking process.env.NODE_ENV === 'production' and throwing ForbiddenException.
  // AuthService.devLogin itself does not contain the env guard — see auth.service.spec.ts.

  describe('POST /api/v1/auth/dev-login', () => {
    it('returns tokens in non-production environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      const res = await request
        .post('/api/v1/auth/dev-login')
        .send({ nickname: 'dev_tester' });

      process.env.NODE_ENV = originalEnv;

      expect(res.status).not.toBe(403);
      expect(res.body.data).toHaveProperty('accessToken');
    });

    it('returns 403 when NODE_ENV is production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const res = await request
        .post('/api/v1/auth/dev-login')
        .send({ nickname: 'prod_tester' });

      process.env.NODE_ENV = originalEnv;

      expect(res.status).toBe(403);
    });
  });
});
