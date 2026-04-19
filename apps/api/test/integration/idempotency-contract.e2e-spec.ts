import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as supertest from 'supertest';
import { createTestApp } from '../helpers/nest-app';
import { getPrismaTestClient, disconnectPrismaTestClient } from '../helpers/prisma-test-client';
import { truncateAll } from '../helpers/db-cleanup';
import { devLoginToken } from '../helpers/auth-token';
import { createMatch } from '../fixtures/matches';
import { createMercenaryPost } from '../fixtures/mercenary';
import { createTeamWithOwner, createPendingApplication } from '../fixtures/teams';

// ---------------------------------------------------------------------------
// Integration tests: idempotency contract for terminal-state endpoints
//
// These tests are written against the agreed response shapes from Task 73:
//   mercenary close  → { post, alreadyClosed: boolean }
//   mercenary cancel → { post, alreadyCancelled: boolean }
//   matches complete → { match, alreadyCompleted: boolean }
//   matches cancel   → { match, alreadyCancelled: boolean }
//   matches close    → { match, alreadyClosed: boolean }
//   reviews create   → { review, alreadySubmitted: boolean }
//   teams accept     → { application, alreadyProcessed: boolean }
//   teams reject     → { application, alreadyProcessed: boolean }
//
// NOTE: These tests will RED until backend-data-dev merges the service-layer
// idempotency changes (Track A+B of Task 73). Services currently throw
// BadRequestException on repeated calls instead of returning alreadyXxx: true.
// ---------------------------------------------------------------------------

jest.setTimeout(90000);

describe('Idempotency contract (e2e)', () => {
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

  // ── Helper: create a completed match with two confirmed participants ──────

  async function setupCompletedMatchContext(hostNickname: string, participantNickname: string) {
    const hostToken = await devLoginToken(request, hostNickname);
    await devLoginToken(request, participantNickname); // ensure user exists in DB

    const hostUser = await prisma.user.findFirstOrThrow({ where: { nickname: hostNickname } });
    const participantUser = await prisma.user.findFirstOrThrow({ where: { nickname: participantNickname } });

    // Create a confirmed match (not yet completed — so complete() can run)
    const match = await createMatch(prisma, hostUser.id, { status: 'confirmed' });
    await prisma.matchParticipant.createMany({
      data: [
        { matchId: match.id, userId: hostUser.id, status: 'confirmed', paymentStatus: 'completed' },
        { matchId: match.id, userId: participantUser.id, status: 'confirmed', paymentStatus: 'completed' },
      ],
      skipDuplicates: true,
    });

    return { hostToken, hostUser, participantUser, match };
  }

  // ── Helper: create a recruiting match (for cancel/close tests) ──────────

  async function setupRecruitingMatch(hostNickname: string) {
    const hostToken = await devLoginToken(request, hostNickname);
    const hostUser = await prisma.user.findFirstOrThrow({ where: { nickname: hostNickname } });
    const match = await createMatch(prisma, hostUser.id, { status: 'recruiting' });
    return { hostToken, hostUser, match };
  }

  // ── Helper: ensure a team with its owner token ───────────────────────────

  async function setupTeamContext(ownerNickname: string, applicantNickname: string) {
    const ownerToken = await devLoginToken(request, ownerNickname);
    await devLoginToken(request, applicantNickname);

    const ownerUser = await prisma.user.findFirstOrThrow({ where: { nickname: ownerNickname } });
    const applicantUser = await prisma.user.findFirstOrThrow({ where: { nickname: applicantNickname } });

    const { team } = await createTeamWithOwner(prisma, ownerUser.id);
    await createPendingApplication(prisma, team.id, applicantUser.id);

    return { ownerToken, ownerUser, applicantUser, team };
  }

  // ── Helper: ensure a mercenary post for a team owner ─────────────────────

  async function setupMercenaryContext(authorNickname: string) {
    const authorToken = await devLoginToken(request, authorNickname);
    const authorUser = await prisma.user.findFirstOrThrow({ where: { nickname: authorNickname } });

    // Create a team owned by this user (required for mercenary post)
    const { team } = await createTeamWithOwner(prisma, authorUser.id);
    const post = await createMercenaryPost(prisma, team.id, authorUser.id);

    return { authorToken, authorUser, team, post };
  }

  // =========================================================================
  // 1. Mercenary: close post
  // =========================================================================

  describe('POST /api/v1/mercenary/:id/close — idempotency', () => {
    it('first call returns 200 + alreadyClosed=false; second call returns 200 + alreadyClosed=true', async () => {
      const { authorToken, post } = await setupMercenaryContext('merc_close_author');

      const first = await request
        .post(`/api/v1/mercenary/${post.id}/close`)
        .set('Authorization', `Bearer ${authorToken}`);

      expect(first.status).toBe(200);
      expect((first.body.data as { alreadyClosed: boolean }).alreadyClosed).toBe(false);

      const second = await request
        .post(`/api/v1/mercenary/${post.id}/close`)
        .set('Authorization', `Bearer ${authorToken}`);

      expect(second.status).toBe(200);
      expect((second.body.data as { alreadyClosed: boolean }).alreadyClosed).toBe(true);

      // DB invariant: status remains 'closed', not duplicated
      const dbPost = await prisma.mercenaryPost.findUniqueOrThrow({ where: { id: post.id } });
      expect(dbPost.status).toBe('closed');
    });

    it('returns 401 without token (auth error takes precedence)', async () => {
      const { post } = await setupMercenaryContext('merc_close_noauth');
      const res = await request.post(`/api/v1/mercenary/${post.id}/close`);
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 2. Mercenary: cancel post
  // =========================================================================

  describe('POST /api/v1/mercenary/:id/cancel — idempotency', () => {
    it('first call returns 200 + alreadyCancelled=false; second call returns 200 + alreadyCancelled=true', async () => {
      const { authorToken, post } = await setupMercenaryContext('merc_cancel_author');

      const first = await request
        .post(`/api/v1/mercenary/${post.id}/cancel`)
        .set('Authorization', `Bearer ${authorToken}`);

      expect(first.status).toBe(200);
      expect((first.body.data as { alreadyCancelled: boolean }).alreadyCancelled).toBe(false);

      const second = await request
        .post(`/api/v1/mercenary/${post.id}/cancel`)
        .set('Authorization', `Bearer ${authorToken}`);

      expect(second.status).toBe(200);
      expect((second.body.data as { alreadyCancelled: boolean }).alreadyCancelled).toBe(true);

      // DB invariant: status remains 'cancelled'
      const dbPost = await prisma.mercenaryPost.findUniqueOrThrow({ where: { id: post.id } });
      expect(dbPost.status).toBe('cancelled');
    });
  });

  // =========================================================================
  // 3. Match: complete
  // =========================================================================

  describe('POST /api/v1/matches/:id/complete — idempotency', () => {
    it('first call returns 200 + alreadyCompleted=false; second call returns 200 + alreadyCompleted=true, no duplicate notifications', async () => {
      const { hostToken, hostUser, participantUser, match } =
        await setupCompletedMatchContext('match_complete_host', 'match_complete_participant');

      // Snapshot notification counts before any call
      const notifCountBefore = await prisma.notification.count({
        where: {
          userId: { in: [hostUser.id, participantUser.id] },
          type: { in: ['match_completed', 'review_pending'] },
        },
      });

      const first = await request
        .post(`/api/v1/matches/${match.id}/complete`)
        .set('Authorization', `Bearer ${hostToken}`);

      expect(first.status).toBe(200);
      expect((first.body.data as { alreadyCompleted: boolean }).alreadyCompleted).toBe(false);

      const notifCountAfterFirst = await prisma.notification.count({
        where: {
          userId: { in: [hostUser.id, participantUser.id] },
          type: { in: ['match_completed', 'review_pending'] },
        },
      });
      // At least match_completed + review_pending notifications were created
      expect(notifCountAfterFirst).toBeGreaterThan(notifCountBefore);

      // Snapshot badge count BEFORE second call (fire-and-forget writes are stable at this point)
      const badgesBeforeSecond = await prisma.userBadge.count({
        where: { userId: { in: [hostUser.id, participantUser.id] } },
      });

      const second = await request
        .post(`/api/v1/matches/${match.id}/complete`)
        .set('Authorization', `Bearer ${hostToken}`);

      expect(second.status).toBe(200);
      expect((second.body.data as { alreadyCompleted: boolean }).alreadyCompleted).toBe(true);

      // No new notifications created on second call
      const notifCountAfterSecond = await prisma.notification.count({
        where: {
          userId: { in: [hostUser.id, participantUser.id] },
          type: { in: ['match_completed', 'review_pending'] },
        },
      });
      expect(notifCountAfterSecond).toBe(notifCountAfterFirst);

      // No new UserBadge rows created on second call
      const badgesAfterSecond = await prisma.userBadge.count({
        where: { userId: { in: [hostUser.id, participantUser.id] } },
      });
      expect(badgesAfterSecond).toBe(badgesBeforeSecond);

      // DB invariant: match status remains 'completed'
      const dbMatch = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
      expect(dbMatch.status).toBe('completed');
    });

    it('returns 401 without token', async () => {
      const { match } = await setupCompletedMatchContext('match_complete_noauth_h', 'match_complete_noauth_p');
      const res = await request.post(`/api/v1/matches/${match.id}/complete`);
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 4. Match: cancel
  // =========================================================================

  describe('POST /api/v1/matches/:id/cancel — idempotency', () => {
    it('first call returns 200 + alreadyCancelled=false; second call returns 200 + alreadyCancelled=true', async () => {
      const { hostToken, match } = await setupRecruitingMatch('match_cancel_host');

      const first = await request
        .post(`/api/v1/matches/${match.id}/cancel`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ reason: 'Test cancellation' });

      expect(first.status).toBe(200);
      expect((first.body.data as { alreadyCancelled: boolean }).alreadyCancelled).toBe(false);

      const second = await request
        .post(`/api/v1/matches/${match.id}/cancel`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ reason: 'Test cancellation' });

      expect(second.status).toBe(200);
      expect((second.body.data as { alreadyCancelled: boolean }).alreadyCancelled).toBe(true);

      // DB invariant: match status remains 'cancelled'
      const dbMatch = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
      expect(dbMatch.status).toBe('cancelled');
    });
  });

  // =========================================================================
  // 5. Match: close (recruiting → confirmed)
  // =========================================================================

  describe('POST /api/v1/matches/:id/close — idempotency', () => {
    it('first call returns 200 + alreadyClosed=false; second call returns 200 + alreadyClosed=true', async () => {
      const { hostToken, match } = await setupRecruitingMatch('match_close_host');

      const first = await request
        .post(`/api/v1/matches/${match.id}/close`)
        .set('Authorization', `Bearer ${hostToken}`);

      expect(first.status).toBe(200);
      expect((first.body.data as { alreadyClosed: boolean }).alreadyClosed).toBe(false);

      const second = await request
        .post(`/api/v1/matches/${match.id}/close`)
        .set('Authorization', `Bearer ${hostToken}`);

      expect(second.status).toBe(200);
      expect((second.body.data as { alreadyClosed: boolean }).alreadyClosed).toBe(true);

      // DB invariant: match status is 'confirmed' (closed == recruiting → confirmed)
      const dbMatch = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
      expect(dbMatch.status).toBe('confirmed');
    });
  });

  // =========================================================================
  // 6. Reviews: create (duplicate submission)
  // =========================================================================

  describe('POST /api/v1/reviews — idempotency (duplicate submission)', () => {
    it('second call returns same review id + alreadySubmitted=true; exactly one Review row in DB', async () => {
      const hostToken = await devLoginToken(request, 'review_author');
      await devLoginToken(request, 'review_target');

      const authorUser = await prisma.user.findFirstOrThrow({ where: { nickname: 'review_author' } });
      const targetUser = await prisma.user.findFirstOrThrow({ where: { nickname: 'review_target' } });

      // Create a completed match with both participants (no pre-written review)
      const match = await createMatch(prisma, authorUser.id, { status: 'completed' });
      await prisma.matchParticipant.createMany({
        data: [
          { matchId: match.id, userId: authorUser.id, status: 'confirmed', paymentStatus: 'completed' },
          { matchId: match.id, userId: targetUser.id, status: 'confirmed', paymentStatus: 'completed' },
        ],
        skipDuplicates: true,
      });

      const payload = {
        matchId: match.id,
        targetId: targetUser.id,
        skillRating: 4,
        mannerRating: 5,
        comment: 'Great player',
      };

      const first = await request
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${hostToken}`)
        .send(payload);

      expect(first.status).toBe(201);
      expect((first.body.data as { alreadySubmitted: boolean }).alreadySubmitted).toBe(false);
      const firstReviewId = (first.body.data as { review: { id: string } }).review.id;
      expect(firstReviewId).toBeDefined();

      const second = await request
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${hostToken}`)
        .send(payload);

      // NestJS POST controllers return 201 by default; duplicate path also returns 201
      // (backend-data-dev service returns { review, alreadySubmitted: true } on duplicate)
      expect(second.status).toBe(201);
      expect((second.body.data as { alreadySubmitted: boolean }).alreadySubmitted).toBe(true);
      const secondReviewId = (second.body.data as { review: { id: string } }).review.id;

      // Same review is returned
      expect(secondReviewId).toBe(firstReviewId);

      // DB invariant: exactly one review for this author+target+match
      const reviewCount = await prisma.review.count({
        where: { matchId: match.id, authorId: authorUser.id, targetId: targetUser.id },
      });
      expect(reviewCount).toBe(1);
    });

    it('returns 401 without token', async () => {
      const res = await request.post('/api/v1/reviews').send({
        matchId: 'some-id',
        targetId: 'some-target',
        skillRating: 4,
        mannerRating: 4,
      });
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 7. Teams: accept application
  // =========================================================================

  describe('PATCH /api/v1/teams/:id/applications/:userId/accept — idempotency', () => {
    it('first call returns 200 + alreadyProcessed=false; second call returns 200 + alreadyProcessed=true; memberCount unchanged on 2nd call', async () => {
      const { ownerToken, applicantUser, team } =
        await setupTeamContext('team_accept_owner', 'team_accept_applicant');

      const first = await request
        .patch(`/api/v1/teams/${team.id}/applications/${applicantUser.id}/accept`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(first.status).toBe(200);
      expect((first.body.data as { alreadyProcessed: boolean }).alreadyProcessed).toBe(false);

      const membershipAfterFirst = await prisma.teamMembership.findFirstOrThrow({
        where: { teamId: team.id, userId: applicantUser.id },
      });
      expect(membershipAfterFirst.status).toBe('active');

      const teamAfterFirst = await prisma.sportTeam.findUniqueOrThrow({ where: { id: team.id } });
      const memberCountAfterFirst = teamAfterFirst.memberCount;
      const updatedAtAfterFirst = membershipAfterFirst.updatedAt;

      const second = await request
        .patch(`/api/v1/teams/${team.id}/applications/${applicantUser.id}/accept`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(second.status).toBe(200);
      expect((second.body.data as { alreadyProcessed: boolean }).alreadyProcessed).toBe(true);

      // memberCount MUST NOT increase on second call
      const teamAfterSecond = await prisma.sportTeam.findUniqueOrThrow({ where: { id: team.id } });
      expect(teamAfterSecond.memberCount).toBe(memberCountAfterFirst);

      // membership.updatedAt MUST NOT change on second call
      const membershipAfterSecond = await prisma.teamMembership.findFirstOrThrow({
        where: { teamId: team.id, userId: applicantUser.id },
      });
      expect(membershipAfterSecond.updatedAt.getTime()).toBe(updatedAtAfterFirst.getTime());
    });

    it('returns 401 without token', async () => {
      const { applicantUser, team } = await setupTeamContext('team_accept_noauth_o', 'team_accept_noauth_a');
      const res = await request.patch(`/api/v1/teams/${team.id}/applications/${applicantUser.id}/accept`);
      expect(res.status).toBe(401);
    });

    it('returns 403 when caller is a non-manager member (auth error takes precedence over idempotency)', async () => {
      const { team, applicantUser } = await setupTeamContext('team_accept_perm_o', 'team_accept_perm_a');

      // Create a plain member
      const memberToken = await devLoginToken(request, 'team_accept_perm_m');
      const memberUser = await prisma.user.findFirstOrThrow({ where: { nickname: 'team_accept_perm_m' } });
      await prisma.teamMembership.create({
        data: { teamId: team.id, userId: memberUser.id, role: 'member', status: 'active' },
      });

      const res = await request
        .patch(`/api/v1/teams/${team.id}/applications/${applicantUser.id}/accept`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(403);
    });

    it('error precedence: reject then accept returns 400 APPLICATION_NOT_PENDING (not 200 alreadyProcessed)', async () => {
      const ownerToken = await devLoginToken(request, 'team_reject_then_accept_o');
      await devLoginToken(request, 'team_reject_then_accept_a');

      const ownerUser = await prisma.user.findFirstOrThrow({ where: { nickname: 'team_reject_then_accept_o' } });
      const applicantUser = await prisma.user.findFirstOrThrow({ where: { nickname: 'team_reject_then_accept_a' } });

      const { team } = await createTeamWithOwner(prisma, ownerUser.id);
      await createPendingApplication(prisma, team.id, applicantUser.id);

      // First: reject the application
      const rejectRes = await request
        .patch(`/api/v1/teams/${team.id}/applications/${applicantUser.id}/reject`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(rejectRes.status).toBe(200);

      // Then: attempt to accept the now-rejected (left) application
      const acceptAfterReject = await request
        .patch(`/api/v1/teams/${team.id}/applications/${applicantUser.id}/accept`)
        .set('Authorization', `Bearer ${ownerToken}`);

      // Must be 400 APPLICATION_NOT_PENDING — this is a state machine violation, not idempotency.
      // AllExceptionsFilter emits { status, statusCode, message, code?, timestamp } at root level.
      expect(acceptAfterReject.status).toBe(400);
      expect((acceptAfterReject.body as { code?: string }).code).toBe('APPLICATION_NOT_PENDING');
    });
  });

  // =========================================================================
  // 8. Teams: reject application
  // =========================================================================

  describe('PATCH /api/v1/teams/:id/applications/:userId/reject — idempotency', () => {
    it('first call returns 200 + alreadyProcessed=false; second call returns 200 + alreadyProcessed=true', async () => {
      const { ownerToken, applicantUser, team } =
        await setupTeamContext('team_reject_owner', 'team_reject_applicant');

      const first = await request
        .patch(`/api/v1/teams/${team.id}/applications/${applicantUser.id}/reject`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(first.status).toBe(200);
      expect((first.body.data as { alreadyProcessed: boolean }).alreadyProcessed).toBe(false);

      const membershipAfterFirst = await prisma.teamMembership.findFirstOrThrow({
        where: { teamId: team.id, userId: applicantUser.id },
      });
      expect(membershipAfterFirst.status).toBe('left');

      const second = await request
        .patch(`/api/v1/teams/${team.id}/applications/${applicantUser.id}/reject`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(second.status).toBe(200);
      expect((second.body.data as { alreadyProcessed: boolean }).alreadyProcessed).toBe(true);

      // DB invariant: status remains 'left'
      const membershipAfterSecond = await prisma.teamMembership.findFirstOrThrow({
        where: { teamId: team.id, userId: applicantUser.id },
      });
      expect(membershipAfterSecond.status).toBe('left');
    });

    it('returns 401 without token', async () => {
      const { applicantUser, team } = await setupTeamContext('team_reject_noauth_o', 'team_reject_noauth_a');
      const res = await request.patch(`/api/v1/teams/${team.id}/applications/${applicantUser.id}/reject`);
      expect(res.status).toBe(401);
    });
  });
});
