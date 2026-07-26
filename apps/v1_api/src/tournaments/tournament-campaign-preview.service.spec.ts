import { Test } from '@nestjs/testing';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentCampaignAdminService } from './tournament-campaign-admin.service';
import { TournamentCampaignReadService } from './tournament-campaign-read.service';
import { TournamentCampaignStatusService } from './tournament-campaign-status.service';

const supportUser = {
  id: 'user-support',
  email: 'support@teameet.test',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
const previewProjection = {
  id: 'campaign-1',
  slug: 'summer-futsal-cup',
  status: 'archived',
  content: {
    version: 1,
    hero: { title: '여름 풋살 컵' },
    intro: { title: '대회 소개', body: '모두가 즐기는 여름 대회예요.' },
    highlightsSectionTitle: '대회 하이라이트',
    highlights: [],
    faqSectionTitle: '자주 묻는 질문',
    faq: [],
  },
  tournament: { id: 'tournament-1', title: '여름 풋살 컵' },
};

describe('TournamentCampaignAdminService preview permission', () => {
  const adminContext = {
    getActiveAdmin: jest.fn(),
    getMutationAdmin: jest.fn(),
  };
  const readService = { getPreview: jest.fn() };
  let service: TournamentCampaignAdminService;

  beforeEach(async () => {
    jest.clearAllMocks();
    adminContext.getActiveAdmin.mockResolvedValue({
      id: 'admin-support',
      userId: supportUser.id,
      adminRole: 'support',
      status: 'active',
    });
    readService.getPreview.mockResolvedValue(previewProjection);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TournamentCampaignAdminService,
        { provide: PrismaService, useValue: {} },
        { provide: AdminContextService, useValue: adminContext },
        { provide: TournamentCampaignStatusService, useValue: {} },
        { provide: TournamentCampaignReadService, useValue: readService },
      ],
    }).compile();
    service = moduleRef.get(TournamentCampaignAdminService);
  });

  it('returns the public-safe projection to active support without mutation permission', async () => {
    await expect(service.preview(supportUser, 'tournament-1')).resolves.toEqual(previewProjection);
    expect(adminContext.getActiveAdmin).toHaveBeenCalledWith(supportUser.id);
    expect(adminContext.getMutationAdmin).not.toHaveBeenCalled();
    expect(readService.getPreview).toHaveBeenCalledWith('tournament-1');
  });
});
