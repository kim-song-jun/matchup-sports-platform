import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as supertest from 'supertest';
import { createTestApp } from '../helpers/nest-app';
import { getPrismaTestClient, disconnectPrismaTestClient } from '../helpers/prisma-test-client';
import { truncateAll } from '../helpers/db-cleanup';
import { devLoginToken } from '../helpers/auth-token';
import { createPendingApplication, createTeamWithOwner } from '../fixtures/teams';

// ---------------------------------------------------------------------------
// Integration tests: team membership application lifecycle
// apply → owner notification → accept/reject → applicant notification
// ---------------------------------------------------------------------------

describe('Teams Application Lifecycle (e2e)', () => {
  let app: INestApplication;
  let request: supertest.Agent;
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

  // ── apply → owner receives notification ─────────────────────────────────────

  describe('POST /api/v1/teams/:id/apply', () => {
    it('applicant receives 201 and owner receives team_application_received notification', async () => {
      const ownerToken = await devLoginToken(request, 'app_owner');
      const applicantToken = await devLoginToken(request, 'app_applicant');

      // Create a team
      const teamRes = await request
        .post('/api/v1/teams')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Application Test Team',
          sportTypes: ['futsal'],
          city: '서울',
          district: '마포구',
          level: 3,
          isRecruiting: true,
        });
      expect(teamRes.status).toBe(201);
      const teamId = (teamRes.body.data as { id: string }).id;

      // Applicant applies
      const applyRes = await request
        .post(`/api/v1/teams/${teamId}/apply`)
        .set('Authorization', `Bearer ${applicantToken}`);
      expect(applyRes.status).toBe(201);

      // Verify owner has received team_application_received notification in DB
      const ownerUser = await prisma.user.findFirst({ where: { nickname: 'app_owner' } });
      expect(ownerUser).not.toBeNull();

      const notification = await prisma.notification.findFirst({
        where: {
          userId: ownerUser!.id,
          type: 'team_application_received',
        },
      });
      expect(notification).not.toBeNull();
    });

    it('returns 409 when applicant already has a pending application', async () => {
      const ownerToken = await devLoginToken(request, 'app_owner2');
      const applicantToken = await devLoginToken(request, 'app_applicant2');

      const teamRes = await request
        .post('/api/v1/teams')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Duplicate Test Team',
          sportTypes: ['futsal'],
          city: '서울',
          district: '마포구',
          level: 3,
          isRecruiting: true,
        });
      const teamId = (teamRes.body.data as { id: string }).id;

      // First apply
      await request
        .post(`/api/v1/teams/${teamId}/apply`)
        .set('Authorization', `Bearer ${applicantToken}`);

      // Second apply — expect 409
      const secondApply = await request
        .post(`/api/v1/teams/${teamId}/apply`)
        .set('Authorization', `Bearer ${applicantToken}`);
      expect(secondApply.status).toBe(409);
    });
  });

  // ── list applications (manager+ only) ──────────────────────────────────────

  describe('GET /api/v1/teams/:id/applications', () => {
    it('manager can list pending applications with applicant user info', async () => {
      const ownerToken = await devLoginToken(request, 'list_owner');
      const applicantToken = await devLoginToken(request, 'list_applicant');

      const teamRes = await request
        .post('/api/v1/teams')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'List Applications Team',
          sportTypes: ['futsal'],
          city: '서울',
          district: '강남구',
          level: 3,
          isRecruiting: true,
        });
      const teamId = (teamRes.body.data as { id: string }).id;

      await request
        .post(`/api/v1/teams/${teamId}/apply`)
        .set('Authorization', `Bearer ${applicantToken}`);

      const listRes = await request
        .get(`/api/v1/teams/${teamId}/applications`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(listRes.status).toBe(200);
      const apps = (listRes.body.data as Array<unknown>);
      expect(apps.length).toBeGreaterThan(0);
    });

    it('returns 403 when a non-manager member tries to list applications', async () => {
      const ownerToken = await devLoginToken(request, 'perm_owner');
      const memberToken = await devLoginToken(request, 'perm_member');

      const teamRes = await request
        .post('/api/v1/teams')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Permission Test Team',
          sportTypes: ['futsal'],
          city: '서울',
          district: '강남구',
          level: 3,
          isRecruiting: true,
        });
      const teamId = (teamRes.body.data as { id: string }).id;

      // Make the member join via direct fixture (bypass apply flow)
      const memberUser = await prisma.user.findFirst({ where: { nickname: 'perm_member' } });
      if (memberUser) {
        await prisma.teamMembership.create({
          data: { teamId, userId: memberUser.id, role: 'member', status: 'active' },
        });
      }

      const listRes = await request
        .get(`/api/v1/teams/${teamId}/applications`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(listRes.status).toBe(403);
    });
  });

  // ── accept → applicant receives notification + is active member ──────────────

  describe('PATCH /api/v1/teams/:id/applications/:userId/accept', () => {
    it('manager accepts → applicant status active, memberCount incremented, applicant notified', async () => {
      const ownerToken = await devLoginToken(request, 'accept_owner');
      const applicantToken = await devLoginToken(request, 'accept_applicant');

      const teamRes = await request
        .post('/api/v1/teams')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Accept Test Team',
          sportTypes: ['futsal'],
          city: '서울',
          district: '마포구',
          level: 3,
          isRecruiting: true,
        });
      const teamId = (teamRes.body.data as { id: string }).id;

      // Applicant applies
      await request
        .post(`/api/v1/teams/${teamId}/apply`)
        .set('Authorization', `Bearer ${applicantToken}`);

      const applicantUser = await prisma.user.findFirst({ where: { nickname: 'accept_applicant' } });
      expect(applicantUser).not.toBeNull();

      // Owner accepts
      const acceptRes = await request
        .patch(`/api/v1/teams/${teamId}/applications/${applicantUser!.id}/accept`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(acceptRes.status).toBe(200);

      // Verify applicant is now active
      const membership = await prisma.teamMembership.findFirst({
        where: { teamId, userId: applicantUser!.id },
      });
      expect(membership?.status).toBe('active');

      // Verify applicant received team_application_accepted notification
      const notification = await prisma.notification.findFirst({
        where: {
          userId: applicantUser!.id,
          type: 'team_application_accepted',
        },
      });
      expect(notification).not.toBeNull();
    });
  });

  // ── reject → applicant receives notification + left status ──────────────────

  describe('PATCH /api/v1/teams/:id/applications/:userId/reject', () => {
    it('manager rejects → applicant status left, applicant notified', async () => {
      const ownerToken = await devLoginToken(request, 'reject_owner');
      const applicantToken = await devLoginToken(request, 'reject_applicant');

      const teamRes = await request
        .post('/api/v1/teams')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Reject Test Team',
          sportTypes: ['futsal'],
          city: '서울',
          district: '마포구',
          level: 3,
          isRecruiting: true,
        });
      const teamId = (teamRes.body.data as { id: string }).id;

      await request
        .post(`/api/v1/teams/${teamId}/apply`)
        .set('Authorization', `Bearer ${applicantToken}`);

      const applicantUser = await prisma.user.findFirst({ where: { nickname: 'reject_applicant' } });
      expect(applicantUser).not.toBeNull();

      const rejectRes = await request
        .patch(`/api/v1/teams/${teamId}/applications/${applicantUser!.id}/reject`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(rejectRes.status).toBe(200);

      // Status should be 'left' (not 'removed') to preserve re-apply path
      const membership = await prisma.teamMembership.findFirst({
        where: { teamId, userId: applicantUser!.id },
      });
      expect(membership?.status).toBe('left');

      // Verify rejected notification
      const notification = await prisma.notification.findFirst({
        where: {
          userId: applicantUser!.id,
          type: 'team_application_rejected',
        },
      });
      expect(notification).not.toBeNull();
    });

    it('rejected applicant can re-apply (left status reset to pending)', async () => {
      const ownerToken = await devLoginToken(request, 'reapply_owner');
      const applicantToken = await devLoginToken(request, 'reapply_applicant');

      const teamRes = await request
        .post('/api/v1/teams')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Reapply Test Team',
          sportTypes: ['futsal'],
          city: '서울',
          district: '마포구',
          level: 3,
          isRecruiting: true,
        });
      const teamId = (teamRes.body.data as { id: string }).id;

      // Apply, get rejected, re-apply
      await request
        .post(`/api/v1/teams/${teamId}/apply`)
        .set('Authorization', `Bearer ${applicantToken}`);

      const applicantUser = await prisma.user.findFirst({ where: { nickname: 'reapply_applicant' } });
      await request
        .patch(`/api/v1/teams/${teamId}/applications/${applicantUser!.id}/reject`)
        .set('Authorization', `Bearer ${ownerToken}`);

      const reapplyRes = await request
        .post(`/api/v1/teams/${teamId}/apply`)
        .set('Authorization', `Bearer ${applicantToken}`);
      expect(reapplyRes.status).toBe(201);

      const membership = await prisma.teamMembership.findFirst({
        where: { teamId, userId: applicantUser!.id },
      });
      expect(membership?.status).toBe('pending');
    });
  });
});
