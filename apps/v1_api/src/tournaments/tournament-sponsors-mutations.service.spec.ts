import { NotFoundException } from '@nestjs/common';
import { TournamentSponsorsService } from './tournament-sponsors.service';

const ownerUser = {
  id: 'owner-user-id',
  email: 'admin@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const ownerAdmin = {
  id: 'owner-admin-id',
  userId: ownerUser.id,
  adminRole: 'owner' as const,
  status: 'active' as const,
};

const tournamentId = 'tournament-1';
const sponsorId = 'sponsor-1';

describe('TournamentSponsorsService sponsor mutations', () => {
  it('update: stores edited sponsor details and audit log', async () => {
    const { prisma, service } = serviceFixture();
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: tournamentId, deletedAt: null });
    prisma.v1TournamentSponsor.findFirst.mockResolvedValue(sponsorRow());
    prisma.v1TournamentSponsor.update.mockResolvedValue(
      sponsorRow({ name: '서울 스포츠랩 리뉴얼', isActive: false, sortOrder: 5 }),
    );

    const result = await service.update(ownerUser, {
      tournamentId,
      sponsorId,
      dto: {
        name: ' 서울 스포츠랩 리뉴얼 ',
        benefitText: '',
        isActive: false,
        sortOrder: 5,
      },
    });

    expect(result).toMatchObject({ id: sponsorId, name: '서울 스포츠랩 리뉴얼', isActive: false, sortOrder: 5 });
    expect(prisma.v1TournamentSponsor.update).toHaveBeenCalledWith({
      where: { id: sponsorId },
      data: expect.objectContaining({
        name: '서울 스포츠랩 리뉴얼',
        benefitText: null,
        isActive: false,
        sortOrder: 5,
      }),
    });
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'tournament_sponsor.update',
          targetId: sponsorId,
        }),
      }),
    );
  });

  it('deactivate: hides sponsor exposure without deleting the record', async () => {
    const { prisma, service } = serviceFixture();
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: tournamentId, deletedAt: null });
    prisma.v1TournamentSponsor.findFirst.mockResolvedValue(sponsorRow());
    prisma.v1TournamentSponsor.update.mockResolvedValue(sponsorRow({ isActive: false }));

    const result = await service.deactivate(ownerUser, { tournamentId, sponsorId });

    expect(result).toMatchObject({ id: sponsorId, isActive: false });
    expect(prisma.v1TournamentSponsor.update).toHaveBeenCalledWith({
      where: { id: sponsorId },
      data: { isActive: false },
    });
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'tournament_sponsor.deactivate',
          targetId: sponsorId,
        }),
      }),
    );
  });

  it('update: rejects sponsors outside the tournament', async () => {
    const { prisma, service } = serviceFixture();
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: tournamentId, deletedAt: null });
    prisma.v1TournamentSponsor.findFirst.mockResolvedValue(null);

    await expect(
      service.update(ownerUser, {
        tournamentId,
        sponsorId,
        dto: { name: '서울 스포츠랩' },
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.v1TournamentSponsor.update).not.toHaveBeenCalled();
  });
});

function serviceFixture() {
  const prisma = {
    v1Tournament: { findFirst: jest.fn() },
    v1TournamentSponsor: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma));
  const adminContext = {
    getMutationAdmin: jest.fn().mockResolvedValue(ownerAdmin),
    logAdminAction: jest.fn((admin, input, tx) => tx.v1AdminActionLog.create({ data: input })),
  };
  const service = new TournamentSponsorsService(prisma as never, adminContext as never);
  return { prisma, service };
}

function sponsorRow(overrides: Partial<ReturnType<typeof sponsorRowBase>> = {}) {
  return { ...sponsorRowBase(), ...overrides };
}

function sponsorRowBase() {
  return {
    id: sponsorId,
    tournamentId,
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
  };
}
