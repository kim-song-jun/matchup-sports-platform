import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../helpers/nest-app';
import { getPrismaTestClient, disconnectPrismaTestClient } from '../helpers/prisma-test-client';
import { truncateAll } from '../helpers/db-cleanup';
import { devLoginToken } from '../helpers/auth-token';
import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Matches e2e: dev-login → create match → join → assign teams → complete
// ---------------------------------------------------------------------------

describe('Matches (e2e)', () => {
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

  async function ensureVenueId(): Promise<string> {
    const venue = await prisma.venue.create({
      data: {
        name: 'E2E Venue',
        type: 'futsal_court',
        sportTypes: ['futsal'],
        address: '서울시 테스트구',
        lat: 37.5,
        lng: 126.9,
        city: '서울',
        district: '마포구',
        operatingHours: {},
        imageUrls: [],
        facilities: [],
      },
    });
    return venue.id;
  }

  // ── list matches ────────────────────────────────────────────────────────────

  describe('GET /api/v1/matches', () => {
    it('returns empty list initially', async () => {
      const res = await request.get('/api/v1/matches');

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(0);
    });
  });

  // ── create match ────────────────────────────────────────────────────────────

  describe('POST /api/v1/matches', () => {
    it('creates a match when authenticated', async () => {
      const token = await devLoginToken(request, 'host_user');
      const venueId = await ensureVenueId();

      const res = await request
        .post('/api/v1/matches')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sportType: 'futsal',
          title: 'E2E Test Match',
          venueId,
          matchDate: '2026-05-01',
          startTime: '10:00',
          endTime: '12:00',
          maxPlayers: 10,
          fee: 0,
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.title).toBe('E2E Test Match');
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await request
        .post('/api/v1/matches')
        .send({ title: 'Unauthorized Match' });

      expect(res.status).toBe(401);
    });
  });

  // ── get single match ────────────────────────────────────────────────────────

  describe('GET /api/v1/matches/:id', () => {
    it('returns match detail', async () => {
      const token = await devLoginToken(request, 'host_user2');
      const venueId = await ensureVenueId();

      const createRes = await request
        .post('/api/v1/matches')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sportType: 'futsal',
          title: 'Detail Test Match',
          venueId,
          matchDate: '2026-05-02',
          startTime: '14:00',
          endTime: '16:00',
          maxPlayers: 10,
          fee: 5000,
        });

      const matchId = createRes.body.data.id as string;

      const res = await request.get(`/api/v1/matches/${matchId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(matchId);
    });
  });

  // ── join match ──────────────────────────────────────────────────────────────

  describe('POST /api/v1/matches/:id/join', () => {
    it('allows a different user to join a match', async () => {
      const hostToken = await devLoginToken(request, 'e2e_host');
      const participantToken = await devLoginToken(request, 'e2e_participant');
      const venueId = await ensureVenueId();

      const createRes = await request
        .post('/api/v1/matches')
        .set('Authorization', `Bearer ${hostToken}`)
        .send({
          sportType: 'futsal',
          title: 'Join Test Match',
          venueId,
          matchDate: '2026-05-03',
          startTime: '10:00',
          endTime: '12:00',
          maxPlayers: 10,
          fee: 0,
        });

      const matchId = createRes.body.data.id as string;

      const joinRes = await request
        .post(`/api/v1/matches/${matchId}/join`)
        .set('Authorization', `Bearer ${participantToken}`);

      expect([200, 201]).toContain(joinRes.status);
    });
  });
});
