import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../helpers/nest-app';
import { getPrismaTestClient, disconnectPrismaTestClient } from '../helpers/prisma-test-client';
import { truncateAll } from '../helpers/db-cleanup';
import { devLoginToken } from '../helpers/auth-token';
import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Team matches e2e: create teams → post match → apply → approve → check-in → result → evaluate
// ---------------------------------------------------------------------------

describe('TeamMatches (e2e)', () => {
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

  async function createTeam(token: string, name: string): Promise<string> {
    const res = await request
      .post('/api/v1/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name,
        sportTypes: ['futsal'],
        city: '서울',
        district: '마포구',
        level: 3,
        isRecruiting: true,
      });
    return (res.body.data as { id: string }).id;
  }

  // ── list team matches ───────────────────────────────────────────────────────

  describe('GET /api/v1/team-matches', () => {
    it('returns empty list initially', async () => {
      const res = await request.get('/api/v1/team-matches');

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(0);
    });
  });

  // ── create team match ───────────────────────────────────────────────────────

  describe('POST /api/v1/team-matches', () => {
    it('host team owner can create a team match', async () => {
      const ownerToken = await devLoginToken(request, 'tm_owner');
      const teamId = await createTeam(ownerToken, 'Host FC');

      const res = await request
        .post('/api/v1/team-matches')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          hostTeamId: teamId,
          sportType: 'futsal',
          title: 'E2E Team Match',
          matchDate: '2026-05-10',
          startTime: '14:00',
          endTime: '16:00',
          venueName: 'Test Venue',
          venueAddress: '서울시 테스트구',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('id');
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await request
        .post('/api/v1/team-matches')
        .send({ title: 'Unauthorized' });

      expect(res.status).toBe(401);
    });
  });

  // ── apply to team match ─────────────────────────────────────────────────────

  describe('POST /api/v1/team-matches/:id/apply', () => {
    it('applicant team can apply to a recruiting match', async () => {
      const ownerToken = await devLoginToken(request, 'tm_host_owner');
      const applicantToken = await devLoginToken(request, 'tm_applicant_owner');

      const hostTeamId = await createTeam(ownerToken, 'Host Team FC');
      const applicantTeamId = await createTeam(applicantToken, 'Applicant FC');

      const createRes = await request
        .post('/api/v1/team-matches')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          hostTeamId,
          sportType: 'futsal',
          title: 'Apply Test Match',
          matchDate: '2026-05-15',
          startTime: '10:00',
          endTime: '12:00',
          venueName: 'Test Venue',
          venueAddress: '서울시 테스트구',
        });

      const teamMatchId = createRes.body.data.id as string;

      const applyRes = await request
        .post(`/api/v1/team-matches/${teamMatchId}/apply`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ applicantTeamId, message: '잘 부탁드립니다' });

      expect([200, 201]).toContain(applyRes.status);
    });
  });
});
