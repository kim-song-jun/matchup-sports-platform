import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentCampaignAdminService } from './tournament-campaign-admin.service';
import { TournamentCampaignReadService } from './tournament-campaign-read.service';
import { TournamentCampaignStatusService } from './tournament-campaign-status.service';

const user = {
  id: 'user-owner',
  email: 'owner@teameet.test',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
const admin = {
  id: 'admin-owner',
  userId: user.id,
  adminRole: 'owner' as const,
  status: 'active' as const,
};
const content = {
  version: 1 as const,
  hero: { title: '여름 풋살 컵', summary: '서울 대표 8팀의 결승전' },
  intro: { title: '대회 소개', body: '모두가 즐기는 여름 대회예요.' },
  highlightsSectionTitle: '대회 하이라이트',
  highlights: [],
  faqSectionTitle: '자주 묻는 질문',
  faq: [],
};
const campaignRow = {
  id: 'campaign-1',
  tournamentId: 'tournament-1',
  slug: 'summer-futsal-cup',
  status: 'draft',
  content,
  publishedAt: null,
  archivedAt: null,
  createdAt: new Date('2026-07-13T09:00:00.000Z'),
  updatedAt: new Date('2026-07-13T09:00:00.000Z'),
};

describe('TournamentCampaignAdminService read/create/update', () => {
  const prisma = {
    v1Tournament: { findFirst: jest.fn() },
    v1TournamentCampaign: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const adminContext = {
    getActiveAdmin: jest.fn(),
    getMutationAdmin: jest.fn(),
    logAdminAction: jest.fn(),
  };
  const statusService = { changeStatus: jest.fn() };
  const readService = { getPreview: jest.fn() };
  let service: TournamentCampaignAdminService;

  beforeEach(async () => {
    jest.clearAllMocks();
    adminContext.getActiveAdmin.mockResolvedValue(admin);
    adminContext.getMutationAdmin.mockResolvedValue(admin);
    adminContext.logAdminAction.mockResolvedValue({ actionLogId: 'log-1', statusChangeLogId: null });
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    const moduleRef = await Test.createTestingModule({
      providers: [
        TournamentCampaignAdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminContextService, useValue: adminContext },
        { provide: TournamentCampaignStatusService, useValue: statusService },
        { provide: TournamentCampaignReadService, useValue: readService },
      ],
    }).compile();
    service = moduleRef.get(TournamentCampaignAdminService);
  });

  it('reads any campaign state for an active admin', async () => {
    prisma.v1TournamentCampaign.findUnique.mockResolvedValue(campaignRow);

    const result = await service.get(user, 'tournament-1');

    expect(result).toEqual({
      ...campaignRow,
      publishedAt: null,
      archivedAt: null,
      createdAt: '2026-07-13T09:00:00.000Z',
      updatedAt: '2026-07-13T09:00:00.000Z',
    });
    expect(adminContext.getActiveAdmin).toHaveBeenCalledWith(user.id);
  });

  it('returns TOURNAMENT_CAMPAIGN_NOT_FOUND for an absent admin campaign', async () => {
    prisma.v1TournamentCampaign.findUnique.mockResolvedValue(null);

    await expect(service.get(user, 'missing')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_CAMPAIGN_NOT_FOUND' },
    });
  });

  it('creates one draft campaign and writes its audit record atomically', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', status: 'open' });
    prisma.v1TournamentCampaign.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.v1TournamentCampaign.create.mockResolvedValue(campaignRow);

    const result = await service.create(user, 'tournament-1', {
      slug: 'summer-futsal-cup',
      content,
    });

    expect(result.status).toBe('draft');
    expect(adminContext.getMutationAdmin).toHaveBeenCalledWith(user.id);
    expect(prisma.v1TournamentCampaign.create).toHaveBeenCalledWith({
      data: { tournamentId: 'tournament-1', slug: 'summer-futsal-cup', status: 'draft', content },
    });
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        action: 'tournament_campaign.create',
        targetType: 'tournament_campaign',
        targetId: 'campaign-1',
        afterJson: { slug: 'summer-futsal-cup', status: 'draft' },
      }),
      prisma,
    );
  });

  it('returns TOURNAMENT_CAMPAIGN_EXISTS when the tournament already has one', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', status: 'open' });
    prisma.v1TournamentCampaign.findUnique.mockResolvedValue(campaignRow);

    await expect(
      service.create(user, 'tournament-1', { slug: 'second-campaign', content }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_CAMPAIGN_EXISTS' } });
  });

  it('returns TOURNAMENT_CAMPAIGN_SLUG_TAKEN for an existing global slug', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-2', status: 'open' });
    prisma.v1TournamentCampaign.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...campaignRow, tournamentId: 'tournament-1' });

    await expect(
      service.create(user, 'tournament-2', { slug: 'summer-futsal-cup', content }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_CAMPAIGN_SLUG_TAKEN' } });
  });

  it('maps a concurrent slug uniqueness race to TOURNAMENT_CAMPAIGN_SLUG_TAKEN', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-2', status: 'open' });
    prisma.v1TournamentCampaign.findUnique.mockResolvedValue(null);
    prisma.v1TournamentCampaign.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.2',
        meta: { target: ['slug'] },
      }),
    );

    await expect(
      service.create(user, 'tournament-2', { slug: 'summer-futsal-cup', content }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_CAMPAIGN_SLUG_TAKEN' } });
  });

  it('maps a concurrent tournament uniqueness race to TOURNAMENT_CAMPAIGN_EXISTS', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-2', status: 'open' });
    prisma.v1TournamentCampaign.findUnique.mockResolvedValue(null);
    prisma.v1TournamentCampaign.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.2',
        meta: { target: ['tournamentId'] },
      }),
    );

    await expect(
      service.create(user, 'tournament-2', { slug: 'new-campaign', content }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_CAMPAIGN_EXISTS' } });
  });

  it('locks the slug after the campaign has ever been published', async () => {
    prisma.v1TournamentCampaign.findUnique.mockResolvedValue({
      ...campaignRow,
      status: 'draft',
      publishedAt: new Date('2026-07-14T09:00:00.000Z'),
    });

    await expect(
      service.update(user, 'tournament-1', { slug: 'renamed-after-publish' }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_CAMPAIGN_SLUG_LOCKED' } });
  });

  it('updates draft content and writes before/after audit snapshots', async () => {
    const nextContent = { ...content, hero: { ...content.hero, title: '수정된 여름 컵' } };
    prisma.v1TournamentCampaign.findUnique
      .mockResolvedValueOnce(campaignRow)
      .mockResolvedValueOnce({ ...campaignRow, content: nextContent });
    prisma.v1TournamentCampaign.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.update(user, 'tournament-1', { content: nextContent });

    expect(result.content).toEqual(nextContent);
    expect(prisma.v1TournamentCampaign.updateMany).toHaveBeenCalledWith({
      where: { id: 'campaign-1' },
      data: { content: nextContent },
    });
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        action: 'tournament_campaign.update',
        beforeJson: expect.objectContaining({
          slug: 'summer-futsal-cup',
          status: 'draft',
          contentDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
        afterJson: expect.objectContaining({
          slug: 'summer-futsal-cup',
          status: 'draft',
          contentDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          changedFields: ['content'],
        }),
      }),
      prisma,
    );
  });

  it('rejects empty or identical updates instead of returning silent success', async () => {
    await expect(service.update(user, 'tournament-1', {})).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_CAMPAIGN_NO_CHANGES' },
    });

    prisma.v1TournamentCampaign.findUnique.mockResolvedValue(campaignRow);
    await expect(
      service.update(user, 'tournament-1', { slug: campaignRow.slug, content }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.v1TournamentCampaign.updateMany).not.toHaveBeenCalled();
    expect(adminContext.logAdminAction).not.toHaveBeenCalled();
  });

  it('rejects identical content after a JSONB round trip changes object key order', async () => {
    const jsonbRoundTripContent = {
      faq: [],
      version: 1,
      highlights: [],
      hero: { summary: content.hero.summary, title: content.hero.title },
      intro: { body: content.intro.body, title: content.intro.title },
      faqSectionTitle: content.faqSectionTitle,
      highlightsSectionTitle: content.highlightsSectionTitle,
    };
    prisma.v1TournamentCampaign.findUnique.mockResolvedValueOnce({ ...campaignRow, content: jsonbRoundTripContent }).mockResolvedValueOnce(campaignRow);
    prisma.v1TournamentCampaign.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.update(user, 'tournament-1', { content })).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_CAMPAIGN_NO_CHANGES' },
    });
    expect(prisma.v1TournamentCampaign.updateMany).not.toHaveBeenCalled();
    expect(adminContext.logAdminAction).not.toHaveBeenCalled();
  });

  it('atomically rejects a slug rename that loses a race with first publication', async () => {
    prisma.v1TournamentCampaign.findUnique.mockResolvedValue(campaignRow);
    prisma.v1TournamentCampaign.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update(user, 'tournament-1', { slug: 'renamed-before-publish' }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_CAMPAIGN_SLUG_LOCKED' } });
    expect(prisma.v1TournamentCampaign.updateMany).toHaveBeenCalledWith({
      where: { id: campaignRow.id, publishedAt: null },
      data: { slug: 'renamed-before-publish' },
    });
  });

  it('uses ConflictException for campaign identity conflicts', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', status: 'open' });
    prisma.v1TournamentCampaign.findUnique.mockResolvedValue(campaignRow);

    await expect(
      service.create(user, 'tournament-1', { slug: 'second-campaign', content }),
    ).rejects.toThrow(ConflictException);
  });
});
