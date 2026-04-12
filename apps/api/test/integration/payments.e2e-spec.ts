import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../helpers/nest-app';
import { getPrismaTestClient, disconnectPrismaTestClient } from '../helpers/prisma-test-client';
import { truncateAll } from '../helpers/db-cleanup';
import { devLoginToken } from '../helpers/auth-token';
import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Payments e2e: prepare → confirm → refund state machine
// ---------------------------------------------------------------------------

describe('Payments (e2e)', () => {
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
        name: 'Payment E2E Venue',
        type: 'futsal_court',
        sportTypes: ['futsal'],
        address: '서울시 결제테스트구',
        lat: 37.5,
        lng: 126.9,
        city: '서울',
        district: '강남구',
        operatingHours: {},
        imageUrls: [],
        facilities: [],
      },
    });
    return venue.id;
  }

  // ── get my payments (empty) ─────────────────────────────────────────────────

  describe('GET /api/v1/payments/me', () => {
    it('returns empty list for a new user', async () => {
      const token = await devLoginToken(request, 'pay_user');

      const res = await request
        .get('/api/v1/payments/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      // GET /payments/me returns paginated response { items, nextCursor }
      expect(res.body.data.items).toHaveLength(0);
      expect(res.body.data.nextCursor).toBeNull();
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await request.get('/api/v1/payments/me');

      expect(res.status).toBe(401);
    });
  });

  // ── prepare → confirm state machine ────────────────────────────────────────

  describe('prepare → confirm → refund', () => {
    it('follows the full payment lifecycle', async () => {
      const hostToken = await devLoginToken(request, 'pay_host');
      const participantToken = await devLoginToken(request, 'pay_participant');
      const venueId = await ensureVenueId();

      // 1. Create a match with a fee
      const matchRes = await request
        .post('/api/v1/matches')
        .set('Authorization', `Bearer ${hostToken}`)
        .send({
          sportType: 'futsal',
          title: 'Paid Match',
          venueId,
          matchDate: '2026-05-20',
          startTime: '10:00',
          endTime: '12:00',
          maxPlayers: 10,
          fee: 15000,
        });
      const matchId = matchRes.body.data.id as string;

      // 2. Participant joins
      const joinRes = await request
        .post(`/api/v1/matches/${matchId}/join`)
        .set('Authorization', `Bearer ${participantToken}`);
      expect([200, 201]).toContain(joinRes.status);
      const participantId = joinRes.body.data.id as string;

      // 3. Prepare payment
      const prepareRes = await request
        .post('/api/v1/payments/prepare')
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ participantId, amount: 15000 });

      expect(prepareRes.status).toBe(201);
      expect(prepareRes.body.data).toHaveProperty('paymentId');
      expect(prepareRes.body.data).toHaveProperty('orderId');

      const { orderId, paymentId } = prepareRes.body.data as {
        orderId: string;
        paymentId: string;
      };

      // 4. Confirm payment (simulate PG callback)
      const confirmRes = await request
        .post('/api/v1/payments/confirm')
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ orderId, paymentKey: 'test-pk-12345', amount: 15000 });

      expect(confirmRes.status).toBe(201);
      expect(confirmRes.body.data.status).toBe('completed');

      // 5. Refund
      const refundRes = await request
        .post(`/api/v1/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ reason: 'match cancelled' });

      expect(refundRes.status).toBe(201);
      expect(refundRes.body.data.status).toBe('refunded');
    });
  });
});
