import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentSponsorsService } from './tournament-sponsors.service';

const ownerAuthUser = {
  id: 'owner-user-id',
  email: 'admin@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const supportAuthUser = {
  id: 'support-user-id',
  email: 'support@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const ownerAdminRecord = {
  id: 'owner-admin-id',
  userId: 'owner-user-id',
  adminRole: 'owner' as const,
  status: 'active' as const,
  user: { accountStatus: 'active' as const },
};

const supportAdminRecord = {
  id: 'support-admin-id',
  userId: 'support-user-id',
  adminRole: 'support' as const,
  status: 'active' as const,
  user: { accountStatus: 'active' as const },
};

function sponsorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sponsor-1',
    tournamentId: 'tournament-1',
    name: '서울 스포츠랩',
    description: '풋살 장비 파트너',
    logoUrl: null,
    websiteUrl: 'https://sportslab.example.com',
    instagramUrl: null,
    benefitText: '리뷰 참여자에게 풋살공 제공',
    boothText: '본부석 옆 체험 부스 운영',
    eventTitle: '매너 리뷰 이벤트',
    eventDescription: '상대팀 리뷰를 남긴 참가팀 중 추첨으로 협찬품을 지급해요.',
    eventResultText: null,
    sortOrder: 0,
    isActive: true,
    createdAt: new Date('2026-06-14T00:00:00.000Z'),
    updatedAt: new Date('2026-06-14T00:00:00.000Z'),
    ...overrides,
  };
}

describe('TournamentSponsorsService', () => {
  let service: TournamentSponsorsService;
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1Tournament: { findFirst: jest.Mock };
    v1TournamentSponsor: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
    v1AdminActionLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1Tournament: { findFirst: jest.fn() },
      v1TournamentSponsor: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      v1AdminActionLog: {
        create: jest.fn().mockResolvedValue({ id: 'action-log-1' }),
      },
      $transaction: jest.fn(),
    };
    const p = prisma;
    prisma.$transaction.mockImplementation(
      (cb: (tx: typeof p) => Promise<unknown>) => cb(p),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentSponsorsService,
        AdminContextService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TournamentSponsorsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('listByTournament: support admin can read tournament sponsor rows', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    prisma.v1TournamentSponsor.findMany.mockResolvedValue([sponsorRow()]);

    const result = await service.listByTournament(supportAuthUser, 'tournament-1');

    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'sponsor-1',
        tournamentId: 'tournament-1',
        name: '서울 스포츠랩',
        eventTitle: '매너 리뷰 이벤트',
        isActive: true,
      }),
    ]);
    expect(prisma.v1TournamentSponsor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournamentId: 'tournament-1' },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    );
  });

  it('create: support admin cannot mutate sponsors', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);

    await expect(
      service.create(supportAuthUser, 'tournament-1', {
        name: '서울 스포츠랩',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.v1TournamentSponsor.create).not.toHaveBeenCalled();
  });

  it('create: stores sponsor exposure, benefits, booth, and event details with an audit log', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentSponsor.create.mockResolvedValue(
      sponsorRow({ logoUrl: 'https://cdn.teammeet.test/sponsors/sportslab.png', sortOrder: 3 }),
    );

    const result = await service.create(ownerAuthUser, 'tournament-1', {
      name: '서울 스포츠랩',
      description: '풋살 장비 파트너',
      logoUrl: 'https://cdn.teammeet.test/sponsors/sportslab.png',
      websiteUrl: 'https://sportslab.example.com',
      benefitText: '리뷰 참여자에게 풋살공 제공',
      boothText: '본부석 옆 체험 부스 운영',
      eventTitle: '매너 리뷰 이벤트',
      eventDescription: '상대팀 리뷰를 남긴 참가팀 중 추첨으로 협찬품을 지급해요.',
      sortOrder: 3,
    });

    expect(result).toMatchObject({
      id: 'sponsor-1',
      name: '서울 스포츠랩',
      logoUrl: 'https://cdn.teammeet.test/sponsors/sportslab.png',
      sortOrder: 3,
    });
    expect(prisma.v1TournamentSponsor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tournamentId: 'tournament-1',
        name: '서울 스포츠랩',
        benefitText: '리뷰 참여자에게 풋살공 제공',
        boothText: '본부석 옆 체험 부스 운영',
        eventTitle: '매너 리뷰 이벤트',
        sortOrder: 3,
        isActive: true,
      }),
    });
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'tournament_sponsor.create',
          targetType: 'tournament_sponsor',
          targetId: 'sponsor-1',
        }),
      }),
    );
  });
});
