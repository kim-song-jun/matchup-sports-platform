import { Test } from '@nestjs/testing';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentCampaignStatusService } from './tournament-campaign-status.service';

const user = {
  id: 'user-ops',
  email: 'ops@teameet.test',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
const admin = {
  id: 'admin-ops',
  userId: user.id,
  adminRole: 'ops' as const,
  status: 'active' as const,
};
const publishedAt = new Date('2026-07-14T09:00:00.000Z');
const campaign = {
  id: 'campaign-1',
  tournamentId: 'tournament-1',
  slug: 'summer-futsal-cup',
  status: 'draft',
  content: {
    version: 1,
    hero: { title: '여름 풋살 컵' },
    intro: { title: '대회 소개', body: '모두가 즐기는 여름 대회예요.' },
    highlightsSectionTitle: '대회 하이라이트',
    highlights: [],
    faqSectionTitle: '자주 묻는 질문',
    faq: [],
  },
  publishedAt: null,
  archivedAt: null,
  createdAt: new Date('2026-07-13T09:00:00.000Z'),
  updatedAt: new Date('2026-07-13T09:00:00.000Z'),
};

describe('TournamentCampaignStatusService', () => {
  const prisma = {
    v1Tournament: { findFirst: jest.fn() },
    v1TournamentCampaign: { findUnique: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const adminContext = {
    getMutationAdmin: jest.fn(),
    logAdminAction: jest.fn(),
  };
  let service: TournamentCampaignStatusService;

  beforeEach(async () => {
    jest.clearAllMocks();
    adminContext.getMutationAdmin.mockResolvedValue(admin);
    adminContext.logAdminAction.mockResolvedValue({ actionLogId: 'log-1', statusChangeLogId: 'status-log-1' });
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    const moduleRef = await Test.createTestingModule({
      providers: [
        TournamentCampaignStatusService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminContextService, useValue: adminContext },
      ],
    }).compile();
    service = moduleRef.get(TournamentCampaignStatusService);
  });

  it('publishes a draft only when its tournament is public and records firstPublishedAt', async () => {
    prisma.v1TournamentCampaign.findUnique
      .mockResolvedValueOnce(campaign)
      .mockResolvedValueOnce({ ...campaign, status: 'published', publishedAt });
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    prisma.v1TournamentCampaign.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.changeStatus(user, 'tournament-1', {
      status: 'published',
      reason: '캠페인 검수 완료',
    });

    expect(result.status).toBe('published');
    expect(prisma.v1TournamentCampaign.updateMany).toHaveBeenCalledWith({
      where: { id: 'campaign-1', status: 'draft' },
      data: { status: 'published', publishedAt: expect.any(Date), archivedAt: null },
    });
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        action: 'tournament_campaign.status',
        fromStatus: 'draft',
        toStatus: 'published',
        reason: '캠페인 검수 완료',
      }),
      prisma,
    );
  });

  it.each([
    ['draft', 'archived'],
    ['published', 'draft'],
    ['published', 'archived'],
    ['archived', 'draft'],
  ] as const)('allows %s to %s', async (from, to) => {
    const existing = {
      ...campaign,
      status: from,
      publishedAt: from === 'draft' ? null : publishedAt,
      archivedAt: from === 'archived' ? new Date('2026-07-14T10:00:00.000Z') : null,
    };
    const updated = {
      ...existing,
      status: to,
      archivedAt: to === 'archived' ? new Date('2026-07-14T11:00:00.000Z') : null,
    };
    prisma.v1TournamentCampaign.findUnique
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);
    prisma.v1TournamentCampaign.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.changeStatus(user, 'tournament-1', {
      status: to,
      reason: `${from}에서 ${to}로 변경`,
    });

    expect(result.status).toBe(to);
    expect(prisma.v1TournamentCampaign.updateMany).toHaveBeenCalledWith({
      where: { id: 'campaign-1', status: from },
      data:
        to === 'archived'
          ? { status: 'archived', archivedAt: expect.any(Date) }
          : { status: 'draft', archivedAt: null },
    });
  });

  it('preserves the original publishedAt when a draft is republished', async () => {
    prisma.v1TournamentCampaign.findUnique
      .mockResolvedValueOnce({ ...campaign, publishedAt })
      .mockResolvedValueOnce({ ...campaign, status: 'published', publishedAt });
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    prisma.v1TournamentCampaign.updateMany.mockResolvedValue({ count: 1 });

    await service.changeStatus(user, 'tournament-1', {
      status: 'published',
      reason: '재공개 검수 완료',
    });

    expect(prisma.v1TournamentCampaign.updateMany).toHaveBeenCalledWith({
      where: { id: 'campaign-1', status: 'draft' },
      data: { status: 'published', publishedAt, archivedAt: null },
    });
  });

  it('returns NOT_PUBLISHABLE when the tournament is deleted or outside public states', async () => {
    prisma.v1TournamentCampaign.findUnique.mockResolvedValue(campaign);
    prisma.v1Tournament.findFirst.mockResolvedValue(null);

    await expect(
      service.changeStatus(user, 'tournament-1', {
        status: 'published',
        reason: '공개 검수 완료',
      }),
    ).rejects.toMatchObject({ response: { code: 'NOT_PUBLISHABLE' } });
    expect(prisma.v1Tournament.findFirst.mock.calls[0][0].where).toEqual({
      id: 'tournament-1',
      deletedAt: null,
      status: { in: ['open', 'closed', 'in_progress', 'completed'] },
    });
  });

  it('returns NOT_PUBLISHABLE for a forbidden archived to published transition', async () => {
    prisma.v1TournamentCampaign.findUnique.mockResolvedValue({
      ...campaign,
      status: 'archived',
      publishedAt,
    });

    await expect(
      service.changeStatus(user, 'tournament-1', {
        status: 'published',
        reason: '공개 검수 완료',
      }),
    ).rejects.toMatchObject({ response: { code: 'NOT_PUBLISHABLE' } });
    expect(prisma.v1TournamentCampaign.updateMany).not.toHaveBeenCalled();
  });

  it('treats a repeated status request as an idempotent no-op', async () => {
    prisma.v1TournamentCampaign.findUnique.mockResolvedValue(campaign);

    const result = await service.changeStatus(user, 'tournament-1', {
      status: 'draft',
      reason: '이미 초안 상태 확인',
    });

    expect(result).toEqual({
      tournamentId: 'tournament-1',
      previousStatus: 'draft',
      status: 'draft',
      alreadyInStatus: true,
    });
    expect(prisma.v1TournamentCampaign.updateMany).not.toHaveBeenCalled();
    expect(adminContext.logAdminAction).not.toHaveBeenCalled();
  });

  it('rejects a transition when the expected source status changed concurrently', async () => {
    prisma.v1TournamentCampaign.findUnique.mockResolvedValue(campaign);
    prisma.v1TournamentCampaign.updateMany.mockResolvedValue({ count: 0 });
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1' });

    await expect(
      service.changeStatus(user, 'tournament-1', {
        status: 'published',
        reason: '공개 검수 완료',
      }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_CAMPAIGN_CONCURRENT_UPDATE' } });
    expect(adminContext.logAdminAction).not.toHaveBeenCalled();
  });
});
