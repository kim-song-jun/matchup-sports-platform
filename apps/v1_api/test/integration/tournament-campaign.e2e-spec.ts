import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request = require('supertest');
import { AdminContextService } from '../../src/common/admin-context.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { TournamentCampaignAdminService } from '../../src/tournaments/tournament-campaign-admin.service';
import { createV1IntegrationApp } from './integration-app';

const ownerUserId = 'integration-campaign-owner';
const supportUserId = 'integration-campaign-support';
const sportId = 'integration-campaign-sport';
const tournamentId = 'integration-campaign-tournament-1';
const secondTournamentId = 'integration-campaign-tournament-2';
const content = {
  version: 1 as const,
  hero: { title: '통합 테스트 풋살 컵', imageUrl: '/uploads/tournaments/campaign.jpg' },
  intro: { title: '대회 소개', body: '실제 HTTP와 PostgreSQL 계약을 확인해요.' },
  highlightsSectionTitle: '대회 하이라이트',
  highlights: [],
  faqSectionTitle: '자주 묻는 질문',
  faq: [],
};

describe('Tournament campaign integration contract', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanupFixtures();
    await prisma.v1User.createMany({
      data: [
        { id: ownerUserId, email: 'campaign-owner@integration.test', onboardingStatus: 'completed' },
        { id: supportUserId, email: 'campaign-support@integration.test', onboardingStatus: 'completed' },
      ],
    });
    const termsService = app.get(ManagedTermsRuntimeService);
    const currentSignupTerms = await termsService.currentSignupTerms();
    const requiredDocumentIds = currentSignupTerms.items
      .filter((item) => item.requirement === 'required')
      .map((item) => item.documentId);
    await Promise.all([
      termsService.acceptSignupTerms(ownerUserId, requiredDocumentIds),
      termsService.acceptSignupTerms(supportUserId, requiredDocumentIds),
    ]);
    await prisma.v1AdminUser.createMany({
      data: [
        { id: 'integration-admin-owner', userId: ownerUserId, adminRole: 'owner' },
        { id: 'integration-admin-support', userId: supportUserId, adminRole: 'support' },
      ],
    });
    await prisma.v1Sport.create({ data: { id: sportId, code: 'integration-futsal', name: '풋살' } });
    await prisma.v1Tournament.createMany({
      data: [
        { id: tournamentId, sportId, title: '통합 테스트 풋살 컵', status: 'open' },
        { id: secondTournamentId, sportId, title: '두 번째 풋살 컵', status: 'open' },
      ],
    });
  });

  afterEach(cleanupFixtures);
  afterAll(async () => cleanupApp?.());

  async function cleanupFixtures() {
    if (!prisma) return;
    await prisma.v1StatusChangeLog.deleteMany({ where: { targetType: 'tournament_campaign' } });
    await prisma.v1AdminActionLog.deleteMany({ where: { targetType: 'tournament_campaign' } });
    await prisma.v1TournamentCampaign.deleteMany({
      where: { tournamentId: { in: [tournamentId, secondTournamentId] } },
    });
    await prisma.v1Tournament.deleteMany({
      where: { id: { in: [tournamentId, secondTournamentId] } },
    });
    await prisma.v1AdminUser.deleteMany({ where: { userId: { in: [ownerUserId, supportUserId] } } });
    await prisma.v1ManagedTermsConsentEvent.deleteMany({
      where: { userId: { in: [ownerUserId, supportUserId] } },
    });
    await prisma.v1User.deleteMany({ where: { id: { in: [ownerUserId, supportUserId] } } });
    await prisma.v1Sport.deleteMany({ where: { id: sportId } });
  }

  it('enforces strict HTTP validation, role gates, visibility, timestamps, and retention', async () => {
    for (const invalidQuery of ['limit=0', 'limit=51', 'limit=not-a-number']) {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/tournaments/campaigns?${invalidQuery}`)
        .expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }

    for (const malformed of [
      { slug: 'integration-cup' },
      { slug: 'integration-cup', content: { ...content, hero: undefined } },
      { slug: 'integration-cup', content: { ...content, intro: undefined } },
    ]) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/tournaments/${tournamentId}/campaign`)
        .set('x-v1-user-id', ownerUserId)
        .send(malformed)
        .expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }

    const created = await request(app.getHttpServer())
      .post(`/api/v1/admin/tournaments/${tournamentId}/campaign`)
      .set('x-v1-user-id', ownerUserId)
      .send({ slug: 'integration-cup', content })
      .expect(201);
    expect(created.body.data).toMatchObject({ status: 'draft', archivedAt: null });

    await request(app.getHttpServer()).get('/api/v1/tournaments/campaigns/integration-cup').expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/admin/tournaments/${tournamentId}/campaign`)
      .set('x-v1-user-id', supportUserId)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/tournaments/${tournamentId}/campaign`)
      .set('x-v1-user-id', supportUserId)
      .send({ content })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/tournaments/${tournamentId}/campaign/status`)
      .set('x-v1-user-id', ownerUserId)
      .send({ status: 'published' })
      .expect(400);

    const published = await request(app.getHttpServer())
      .post(`/api/v1/admin/tournaments/${tournamentId}/campaign/status`)
      .set('x-v1-user-id', ownerUserId)
      .send({ status: 'published', reason: '통합 테스트 공개 검수' })
      .expect(201);
    expect(published.body.data).toMatchObject({ status: 'published', archivedAt: null });
    expect(published.body.data.publishedAt).toEqual(expect.any(String));

    const publicCampaign = await request(app.getHttpServer())
      .get('/api/v1/tournaments/campaigns/integration-cup')
      .expect(200);
    expect(publicCampaign.body.data).toMatchObject({
      slug: 'integration-cup',
      tournament: { id: tournamentId, rulesText: null, sponsors: [], confirmedCount: 0 },
    });
    const publishedPreview = await request(app.getHttpServer())
      .get(`/api/v1/admin/tournaments/${tournamentId}/campaign/preview`)
      .set('x-v1-user-id', supportUserId)
      .expect(200);
    expect(publishedPreview.body.data.status).toBe('published');
    expect(publishedPreview.body.data.tournament).toEqual(publicCampaign.body.data.tournament);
    const list = await request(app.getHttpServer()).get('/api/v1/tournaments').expect(200);
    expect(list.body.data.items[0].campaignSlug).toBe('integration-cup');
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/tournaments/${tournamentId}`)
      .expect(200);
    expect(detail.body.data.campaignSlug).toBe('integration-cup');

    const locked = await request(app.getHttpServer())
      .patch(`/api/v1/admin/tournaments/${tournamentId}/campaign`)
      .set('x-v1-user-id', ownerUserId)
      .send({ slug: 'renamed-after-publication' })
      .expect(409);
    expect(locked.body.code).toBe('TOURNAMENT_CAMPAIGN_SLUG_LOCKED');

    const archived = await request(app.getHttpServer())
      .post(`/api/v1/admin/tournaments/${tournamentId}/campaign/status`)
      .set('x-v1-user-id', ownerUserId)
      .send({ status: 'archived', reason: '이벤트 종료 보관' })
      .expect(201);
    expect(archived.body.data.archivedAt).toEqual(expect.any(String));
    await request(app.getHttpServer()).get('/api/v1/tournaments/campaigns/integration-cup').expect(404);

    const restored = await request(app.getHttpServer())
      .post(`/api/v1/admin/tournaments/${tournamentId}/campaign/status`)
      .set('x-v1-user-id', ownerUserId)
      .send({ status: 'draft', reason: '수정용 초안 복귀' })
      .expect(201);
    expect(restored.body.data).toMatchObject({ status: 'draft', archivedAt: null });
    expect(restored.body.data.publishedAt).toBe(published.body.data.publishedAt);
    expect(await prisma.v1TournamentCampaign.count({ where: { tournamentId } })).toBe(1);
  });

  it.each([
    { status: 'draft' as const, archivedAt: null },
    { status: 'archived' as const, archivedAt: new Date('2026-07-14T10:00:00.000Z') },
  ])('allows support preview for $status while public read stays hidden', async ({ status, archivedAt }) => {
    await prisma.v1TournamentCampaign.create({
      data: { tournamentId, slug: `${status}-preview-cup`, status, archivedAt, content },
    });

    const preview = await request(app.getHttpServer())
      .get(`/api/v1/admin/tournaments/${tournamentId}/campaign/preview`)
      .set('x-v1-user-id', supportUserId)
      .expect(200);

    expect(preview.body.data).toMatchObject({
      status,
      content: {
        highlightsSectionTitle: '대회 하이라이트',
        faqSectionTitle: '자주 묻는 질문',
      },
      tournament: { id: tournamentId },
    });
    expect(preview.body.data.tournament.bankAccount).toBeUndefined();
    await request(app.getHttpServer())
      .get(`/api/v1/tournaments/campaigns/${status}-preview-cup`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/tournaments/${tournamentId}/campaign`)
      .set('x-v1-user-id', supportUserId)
      .send({ content })
      .expect(403);
  });

  it('proves real uniqueness metadata, audit rollback, and concurrent mutation invariants', async () => {
    await prisma.v1TournamentCampaign.create({
      data: { tournamentId, slug: 'constraint-cup', content },
    });
    const tournamentError = await capturePrismaError(() =>
      prisma.v1TournamentCampaign.create({
        data: { tournamentId, slug: 'different-slug', content },
      }),
    );
    expect(JSON.stringify(tournamentError.meta?.target)).toContain('tournament_id');
    const slugError = await capturePrismaError(() =>
      prisma.v1TournamentCampaign.create({
        data: { tournamentId: secondTournamentId, slug: 'constraint-cup', content },
      }),
    );
    expect(JSON.stringify(slugError.meta?.target)).toContain('slug');

    const adminContext = app.get(AdminContextService);
    const auditFailure = jest
      .spyOn(adminContext, 'logAdminAction')
      .mockRejectedValueOnce(new Error('forced integration audit failure'));
    const campaignService = app.get(TournamentCampaignAdminService);
    const authUser = {
      id: ownerUserId,
      email: 'campaign-owner@integration.test',
      accountStatus: 'active' as const,
      onboardingStatus: 'completed' as const,
    };
    await expect(
      campaignService.create(authUser, secondTournamentId, {
        slug: 'rollback-cup',
        content,
      }),
    ).rejects.toThrow('forced integration audit failure');
    auditFailure.mockRestore();
    expect(
      await prisma.v1TournamentCampaign.findUnique({ where: { tournamentId: secondTournamentId } }),
    ).toBeNull();

    await campaignService.create(authUser, secondTournamentId, {
      slug: 'concurrent-cup',
      content,
    });
    const results = await Promise.allSettled([
      campaignService.update(authUser, secondTournamentId, { slug: 'concurrent-renamed-cup' }),
      campaignService.changeStatus(authUser, secondTournamentId, {
        status: 'published',
        reason: '동시 공개 검수',
      }),
    ]);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    const final = await prisma.v1TournamentCampaign.findUniqueOrThrow({
      where: { tournamentId: secondTournamentId },
    });
    if (final.status !== 'published') {
      await campaignService.changeStatus(authUser, secondTournamentId, {
        status: 'published',
        reason: '충돌 후 공개 검수',
      });
    }
    await expect(
      campaignService.update(authUser, secondTournamentId, { slug: 'forbidden-final-rename' }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_CAMPAIGN_SLUG_LOCKED' } });
  });
});

async function capturePrismaError(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return error;
    throw error;
  }
  throw new Error('Expected Prisma P2002 unique constraint failure.');
}
