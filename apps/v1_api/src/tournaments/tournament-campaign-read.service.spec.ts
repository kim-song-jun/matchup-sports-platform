import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentCampaignReadService } from './tournament-campaign-read.service';

const content = {
  version: 1,
  hero: { title: '여름 풋살 컵', summary: '서울 대표 8팀의 결승전' },
  intro: { title: '대회 소개', body: '모두가 즐기는 여름 대회예요.' },
  highlightsSectionTitle: '대회 하이라이트',
  highlights: [],
  faqSectionTitle: '자주 묻는 질문',
  faq: [],
};

const publishedRow = {
  id: 'campaign-1',
  slug: 'summer-futsal-cup',
  status: 'published',
  content,
  publishedAt: new Date('2026-07-14T09:00:00.000Z'),
  createdAt: new Date('2026-07-13T09:00:00.000Z'),
  updatedAt: new Date('2026-07-14T09:00:00.000Z'),
  tournament: {
    id: 'tournament-1',
    title: '여름 풋살 컵',
    status: 'open',
    format: 'group_knockout',
    scheduledAt: new Date('2026-08-01T09:00:00.000Z'),
    scheduledEndAt: new Date('2026-08-01T18:00:00.000Z'),
    registrationDeadlineAt: new Date('2026-07-25T09:00:00.000Z'),
    venue: '서울 풋살장',
    coverImageUrl: 'https://cdn.teammeet.test/tournaments/summer.jpg',
    teamCount: 8,
    minPlayers: 6,
    maxPlayers: 10,
    entryFee: 60000,
    rulesText: '경기 규정을 준수해 주세요.',
    refundPolicyText: '마감 전까지 전액 환불돼요.',
    prizePool: 1000000,
    prizeSummary: '우승 상금 100만원',
    prizeBreakdown: '1위 100만원',
    sport: { code: 'futsal', name: '풋살' },
    sponsors: [
      {
        id: 'sponsor-1',
        name: 'Teameet',
        description: null,
        logoUrl: '/uploads/sponsors/teameet.png',
        websiteUrl: null,
        instagramUrl: null,
        benefitText: '참가자 전원 기념품',
        boothText: null,
        eventTitle: null,
        eventDescription: null,
        eventResultText: null,
        sortOrder: 0,
      },
    ],
    registrations: [
      {
        id: 'registration-1',
        status: 'confirmed',
        confirmedAt: new Date('2026-07-14T08:00:00.000Z'),
        team: {
          id: 'team-1',
          name: '팀미트 FC',
          profile: { logoUrl: '/uploads/teams/team-1.png' },
          region: { name: '서울' },
        },
      },
      {
        id: 'registration-2',
        status: 'awaiting_payment',
        confirmedAt: null,
        team: {
          id: 'team-2',
          name: '결제 대기 FC',
          profile: null,
          region: null,
        },
      },
    ],
    _count: { registrations: 1 },
  },
};

describe('TournamentCampaignReadService', () => {
  const prisma = {
    v1TournamentCampaign: { findFirst: jest.fn() },
  };
  let service: TournamentCampaignReadService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-15T00:00:00.000Z'));
    const moduleRef = await Test.createTestingModule({
      providers: [
        TournamentCampaignReadService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(TournamentCampaignReadService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns published campaign content with safe tournament facts', async () => {
    prisma.v1TournamentCampaign.findFirst.mockResolvedValue(publishedRow);

    const result = await service.getPublished('summer-futsal-cup');

    expect(result).toEqual({
      id: 'campaign-1',
      slug: 'summer-futsal-cup',
      status: 'published',
      content,
      publishedAt: '2026-07-14T09:00:00.000Z',
      updatedAt: '2026-07-14T09:00:00.000Z',
      tournament: {
        id: 'tournament-1',
        title: '여름 풋살 컵',
        status: 'open',
        format: 'group_knockout',
        sport: { code: 'futsal', name: '풋살' },
        scheduledAt: '2026-08-01T09:00:00.000Z',
        scheduledEndAt: '2026-08-01T18:00:00.000Z',
        registrationDeadlineAt: '2026-07-25T09:00:00.000Z',
        venue: '서울 풋살장',
        coverImageUrl: 'https://cdn.teammeet.test/tournaments/summer.jpg',
        teamCount: 8,
        minPlayers: 6,
        maxPlayers: 10,
        entryFee: 60000,
        rulesText: '경기 규정을 준수해 주세요.',
        refundPolicyText: '마감 전까지 전액 환불돼요.',
        prizePool: 1000000,
        prizeSummary: '우승 상금 100만원',
        prizeBreakdown: '1위 100만원',
        sponsors: publishedRow.tournament.sponsors,
        confirmedCount: 1,
        pendingPaymentCount: 1,
        registrationAvailability: 'available',
        // 대회 status가 open(모집중)이므로 참가팀 명단은 비공개 — confirmedCount(위)는 그대로 정확하다.
        participantTeams: [],
      },
    });
    const query = prisma.v1TournamentCampaign.findFirst.mock.calls[0][0];
    expect(query.where).toEqual({
      slug: 'summer-futsal-cup',
      status: 'published',
      tournament: {
        deletedAt: null,
        status: { in: ['open', 'closed', 'in_progress', 'completed'] },
      },
    });
    expect(query.select.tournament.select.bankAccount).toBeUndefined();
    expect(query.select.tournament.select.registrations.where.status.in).toEqual([
      'confirmed',
      'waitlisted',
      'awaiting_payment',
      'payment_checking',
      'paid',
    ]);
  });

  // ─── participant privacy during recruiting (open) ───────────────────────────

  it.each(['closed', 'in_progress', 'completed'] as const)(
    'exposes participant teams once tournament status is %s (regression, unaffected by the open-only privacy gate)',
    async (status) => {
      prisma.v1TournamentCampaign.findFirst.mockResolvedValue({
        ...publishedRow,
        tournament: { ...publishedRow.tournament, status },
      });

      const result = await service.getPublished('summer-futsal-cup');

      expect(result.tournament.participantTeams).toEqual([
        {
          registrationId: 'registration-1',
          teamId: 'team-1',
          teamName: '팀미트 FC',
          teamLogoUrl: '/uploads/teams/team-1.png',
          teamRegionName: '서울',
          status: 'confirmed',
          confirmedAt: '2026-07-14T08:00:00.000Z',
        },
      ]);
      // 대회 status와 무관하게 confirmedCount는 계속 정확하다.
      expect(result.tournament.confirmedCount).toBe(1);
    },
  );

  it.each([
    {
      label: 'the registration deadline passed',
      tournament: { registrationDeadlineAt: new Date('2026-07-14T23:59:59.000Z') },
      expected: 'deadline_passed',
    },
    {
      label: 'capacity is held by confirmed and pending-payment teams',
      tournament: { teamCount: 2 },
      expected: 'full',
    },
    {
      label: 'the scheduled start passed while status is stale',
      tournament: { scheduledAt: new Date('2026-07-14T23:59:59.000Z') },
      expected: 'started',
    },
    {
      label: 'the tournament is not open',
      tournament: { status: 'closed' },
      expected: 'closed',
    },
  ])('returns a non-actionable registration state when $label', async ({ tournament, expected }) => {
    prisma.v1TournamentCampaign.findFirst.mockResolvedValue({
      ...publishedRow,
      tournament: { ...publishedRow.tournament, ...tournament },
    });

    const result = await service.getPublished('summer-futsal-cup');

    expect(result.tournament.registrationAvailability).toBe(expected);
  });

  it('returns the same safe projection with the actual archived status for admin preview', async () => {
    prisma.v1TournamentCampaign.findFirst.mockResolvedValue({
      ...publishedRow,
      status: 'archived',
      publishedAt: new Date('2026-07-14T09:00:00.000Z'),
    });
    const getPreview = Reflect.get(service, 'getPreview');

    expect(typeof getPreview).toBe('function');
    if (typeof getPreview !== 'function') return;
    const result = await getPreview.call(service, 'tournament-1');

    expect(result.status).toBe('archived');
    expect(result.content).toEqual(content);
    expect(result.tournament.id).toBe('tournament-1');
    const query = prisma.v1TournamentCampaign.findFirst.mock.calls[0][0];
    expect(query.where).toEqual({ tournamentId: 'tournament-1' });
    expect(query.select.tournament.select.bankAccount).toBeUndefined();
  });

  it('returns TOURNAMENT_CAMPAIGN_NOT_FOUND when no published active campaign matches', async () => {
    prisma.v1TournamentCampaign.findFirst.mockResolvedValue(null);

    await expect(service.getPublished('hidden-campaign')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_CAMPAIGN_NOT_FOUND' },
    });
    await expect(service.getPublished('hidden-campaign')).rejects.toThrow(NotFoundException);
  });

  it('checks published campaign availability with only the campaign id projection', async () => {
    prisma.v1TournamentCampaign.findFirst.mockResolvedValue({ id: 'campaign-1' });

    await expect(service.assertPublishedAvailable('summer-futsal-cup')).resolves.toBeUndefined();

    expect(prisma.v1TournamentCampaign.findFirst).toHaveBeenCalledWith({
      where: {
        slug: 'summer-futsal-cup',
        status: 'published',
        tournament: {
          deletedAt: null,
          status: { in: ['open', 'closed', 'in_progress', 'completed'] },
        },
      },
      select: { id: true },
    });
  });

  it('returns not found when no published public campaign is available', async () => {
    prisma.v1TournamentCampaign.findFirst.mockResolvedValue(null);

    const availability = service.assertPublishedAvailable('hidden-campaign');

    await expect(availability).rejects.toBeInstanceOf(NotFoundException);
    await expect(availability).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_CAMPAIGN_NOT_FOUND' },
    });
  });

  it('fails explicitly when persisted campaign JSON violates the versioned contract', async () => {
    prisma.v1TournamentCampaign.findFirst.mockResolvedValue({
      ...publishedRow,
      content: { version: 1, highlights: [], faq: [] },
    });

    await expect(service.getPublished('summer-futsal-cup')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_CAMPAIGN_CONTENT_INVALID' },
    });
    await expect(service.getPublished('summer-futsal-cup')).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('fails explicitly when persisted campaign JSON omits a required section title', async () => {
    const { faqSectionTitle: _faqSectionTitle, ...contentWithoutFaqSectionTitle } = content;
    prisma.v1TournamentCampaign.findFirst.mockResolvedValue({
      ...publishedRow,
      content: contentWithoutFaqSectionTitle,
    });

    await expect(service.getPublished('summer-futsal-cup')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_CAMPAIGN_CONTENT_INVALID' },
    });
  });
});
