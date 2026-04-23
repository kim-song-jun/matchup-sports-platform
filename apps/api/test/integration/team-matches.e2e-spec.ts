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

    it('returns 409 when the same team applies twice', async () => {
      const ownerToken = await devLoginToken(request, 'tm_host_owner_dup');
      const applicantToken = await devLoginToken(request, 'tm_applicant_owner_dup');

      const hostTeamId = await createTeam(ownerToken, 'Host Team Dup');
      const applicantTeamId = await createTeam(applicantToken, 'Applicant Dup');

      const createRes = await request
        .post('/api/v1/team-matches')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          hostTeamId,
          sportType: 'futsal',
          title: 'Duplicate Apply Match',
          matchDate: '2026-05-15',
          startTime: '10:00',
          endTime: '12:00',
          venueName: 'Test Venue',
          venueAddress: '서울시 테스트구',
        });

      const teamMatchId = createRes.body.data.id as string;

      await request
        .post(`/api/v1/team-matches/${teamMatchId}/apply`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ applicantTeamId, message: '첫 신청' })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      const duplicateRes = await request
        .post(`/api/v1/team-matches/${teamMatchId}/apply`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ applicantTeamId, message: '중복 신청' });

      expect(duplicateRes.status).toBe(409);
      expect(String(duplicateRes.body.message ?? '')).toContain('이미 신청한 팀');
    });
  });

  describe('PATCH /api/v1/team-matches/:id', () => {
    it('host team owner can update a recruiting team match', async () => {
      const ownerToken = await devLoginToken(request, 'tm_update_owner');
      const teamId = await createTeam(ownerToken, 'Update Host FC');

      const createRes = await request
        .post('/api/v1/team-matches')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          hostTeamId: teamId,
          sportType: 'futsal',
          title: 'Before Update',
          matchDate: '2026-05-20',
          startTime: '14:00',
          endTime: '16:00',
          venueName: 'Before Venue',
          venueAddress: '서울시 전',
        });

      const teamMatchId = createRes.body.data.id as string;

      const updateRes = await request
        .patch(`/api/v1/team-matches/${teamMatchId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: 'After Update',
          venueName: 'After Venue',
          totalFee: 120000,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.title).toBe('After Update');
      expect(updateRes.body.data.venueName).toBe('After Venue');
      expect(updateRes.body.data.totalFee).toBe(120000);
    });

    it('allows cancelling when the match is scheduled', async () => {
      const ownerToken = await devLoginToken(request, 'tm_cancel_owner');
      const applicantToken = await devLoginToken(request, 'tm_cancel_applicant');

      const hostTeamId = await createTeam(ownerToken, 'Cancel Host FC');
      const applicantTeamId = await createTeam(applicantToken, 'Cancel Guest FC');

      const createRes = await request
        .post('/api/v1/team-matches')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          hostTeamId,
          sportType: 'futsal',
          title: 'Cancelable Scheduled Match',
          matchDate: '2026-05-21',
          startTime: '14:00',
          endTime: '16:00',
          venueName: 'Test Venue',
          venueAddress: '서울시 테스트구',
        });

      const teamMatchId = createRes.body.data.id as string;

      const applyRes = await request
        .post(`/api/v1/team-matches/${teamMatchId}/apply`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ applicantTeamId, message: '신청' });

      const applicationId = applyRes.body.data.id as string;

      await request
        .patch(`/api/v1/team-matches/${teamMatchId}/applications/${applicationId}/approve`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send()
        .expect(200);

      const cancelRes = await request
        .patch(`/api/v1/team-matches/${teamMatchId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'cancelled' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('cancelled');
    });
  });

  describe('GET /api/v1/team-matches with status filters', () => {
    it('returns non-recruiting history when status list is provided', async () => {
      const ownerToken = await devLoginToken(request, 'tm_history_owner');
      const applicantToken = await devLoginToken(request, 'tm_history_applicant');

      const hostTeamId = await createTeam(ownerToken, 'History Host FC');
      const applicantTeamId = await createTeam(applicantToken, 'History Guest FC');

      const createRes = await request
        .post('/api/v1/team-matches')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          hostTeamId,
          sportType: 'futsal',
          title: 'History Match',
          matchDate: '2026-05-22',
          startTime: '14:00',
          endTime: '16:00',
          venueName: 'History Venue',
          venueAddress: '서울시 테스트구',
        });

      const teamMatchId = createRes.body.data.id as string;

      const applyRes = await request
        .post(`/api/v1/team-matches/${teamMatchId}/apply`)
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({ applicantTeamId, message: '신청' });

      await request
        .patch(`/api/v1/team-matches/${teamMatchId}/applications/${applyRes.body.data.id as string}/approve`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send()
        .expect(200);

      const scheduledRes = await request.get(`/api/v1/team-matches?teamId=${hostTeamId}&status=scheduled,completed,cancelled`);

      expect(scheduledRes.status).toBe(200);
      expect(scheduledRes.body.data.items).toHaveLength(1);
      expect(scheduledRes.body.data.items[0].status).toBe('scheduled');
    });
  });
});
