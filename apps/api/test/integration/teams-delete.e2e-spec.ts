import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createTestApp } from '../helpers/nest-app';
import { getPrismaTestClient, disconnectPrismaTestClient } from '../helpers/prisma-test-client';
import { truncateAll } from '../helpers/db-cleanup';
import { devLoginToken } from '../helpers/auth-token';

describe('DELETE /api/v1/teams/:id (e2e)', () => {
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

    expect(res.status).toBe(201);
    return (res.body.data as { id: string }).id;
  }

  async function createTeamMatch(hostToken: string, hostTeamId: string, title: string): Promise<string> {
    const res = await request
      .post('/api/v1/team-matches')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        hostTeamId,
        sportType: 'futsal',
        title,
        matchDate: '2026-05-20',
        startTime: '10:00',
        endTime: '12:00',
        venueName: 'Delete FK Test Venue',
        venueAddress: '서울 마포구 테스트길 1',
      });

    expect(res.status).toBe(201);
    return (res.body.data as { id: string }).id;
  }

  it('soft-deletes the host team and cancels active hosted team matches', async () => {
    const ownerToken = await devLoginToken(request, 'delete_host_owner');
    const hostTeamId = await createTeam(ownerToken, 'Delete Host Team');
    const teamMatchId = await createTeamMatch(ownerToken, hostTeamId, 'Delete Blocked Host Match');

    const deleteRes = await request
      .delete(`/api/v1/teams/${hostTeamId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(deleteRes.status).toBe(204);

    const team = await prisma.sportTeam.findUnique({ where: { id: hostTeamId } });
    expect(team).not.toBeNull();
    expect(team?.deletedAt).not.toBeNull();
    expect(team?.isRecruiting).toBe(false);

    const teamMatch = await prisma.teamMatch.findUnique({ where: { id: teamMatchId } });
    expect(teamMatch?.status).toBe('cancelled');
  });

  it('soft-deletes the applicant team and withdraws pending applications', async () => {
    const hostToken = await devLoginToken(request, 'delete_apply_host');
    const applicantToken = await devLoginToken(request, 'delete_apply_applicant');

    const hostTeamId = await createTeam(hostToken, 'Delete Apply Host Team');
    const applicantTeamId = await createTeam(applicantToken, 'Delete Apply Applicant Team');
    const teamMatchId = await createTeamMatch(hostToken, hostTeamId, 'Delete Blocked Applicant Match');

    const applyRes = await request
      .post(`/api/v1/team-matches/${teamMatchId}/apply`)
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({
        applicantTeamId,
        message: '삭제 FK 재현용 신청',
      });

    expect([200, 201]).toContain(applyRes.status);

    const deleteRes = await request
      .delete(`/api/v1/teams/${applicantTeamId}`)
      .set('Authorization', `Bearer ${applicantToken}`);

    expect(deleteRes.status).toBe(204);

    const team = await prisma.sportTeam.findUnique({ where: { id: applicantTeamId } });
    expect(team).not.toBeNull();
    expect(team?.deletedAt).not.toBeNull();

    const application = await prisma.teamMatchApplication.findFirst({
      where: { teamMatchId, applicantTeamId },
    });
    expect(application?.status).toBe('withdrawn');
  });
});
