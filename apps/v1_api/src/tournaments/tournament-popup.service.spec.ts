import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentPopupService } from './tournament-popup.service';

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

function popupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'popup-1',
    tournamentId: 'tournament-1',
    title: '얼리버드 신청 안내',
    body: '7/31까지 신청하면 참가비를 할인해 드려요.',
    imageUrl: null,
    status: 'draft',
    displayStartAt: null,
    displayEndAt: null,
    createdAt: new Date('2026-07-18T00:00:00.000Z'),
    updatedAt: new Date('2026-07-18T00:00:00.000Z'),
    ...overrides,
  };
}

describe('TournamentPopupService', () => {
  let service: TournamentPopupService;
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1Tournament: { findFirst: jest.Mock };
    v1TournamentPopup: {
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    v1AdminActionLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1Tournament: { findFirst: jest.fn() },
      v1TournamentPopup: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      v1AdminActionLog: {
        create: jest.fn().mockResolvedValue({ id: 'action-log-1' }),
      },
      $transaction: jest.fn(),
    };
    const p = prisma;
    prisma.$transaction.mockImplementation((cb: (tx: typeof p) => Promise<unknown>) => cb(p));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentPopupService,
        AdminContextService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TournamentPopupService);
  });

  afterEach(() => jest.clearAllMocks());

  it('listByTournament: support admin can read tournament popup rows', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    prisma.v1TournamentPopup.findMany.mockResolvedValue([popupRow()]);

    const result = await service.listByTournament(supportAuthUser, 'tournament-1');

    expect(result.items).toEqual([
      expect.objectContaining({ id: 'popup-1', tournamentId: 'tournament-1', status: 'draft' }),
    ]);
  });

  it('create: support admin cannot mutate popups', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);

    await expect(
      service.create(supportAuthUser, 'tournament-1', {
        title: '얼리버드 신청 안내',
        body: '본문',
        status: 'draft',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.v1TournamentPopup.create).not.toHaveBeenCalled();
  });

  it('create: rejects when display end is not later than display start', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });

    await expect(
      service.create(ownerAuthUser, 'tournament-1', {
        title: '얼리버드 신청 안내',
        body: '본문',
        status: 'published',
        displayStartAt: '2026-08-01T00:00:00.000Z',
        displayEndAt: '2026-07-31T00:00:00.000Z',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.v1TournamentPopup.create).not.toHaveBeenCalled();
  });

  it('create: stores popup with a trimmed body and an audit log', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentPopup.create.mockResolvedValue(
      popupRow({ status: 'published', imageUrl: 'https://cdn.teammeet.test/popup.png' }),
    );

    const result = await service.create(ownerAuthUser, 'tournament-1', {
      title: '  얼리버드 신청 안내  ',
      body: '  7/31까지 신청하면 참가비를 할인해 드려요.  ',
      imageUrl: 'https://cdn.teammeet.test/popup.png',
      status: 'published',
    });

    expect(result).toMatchObject({ id: 'popup-1', status: 'published' });
    expect(prisma.v1TournamentPopup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tournamentId: 'tournament-1',
        title: '얼리버드 신청 안내',
        body: '7/31까지 신청하면 참가비를 할인해 드려요.',
        imageUrl: 'https://cdn.teammeet.test/popup.png',
        status: 'published',
      }),
    });
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'tournament_popup.create',
          targetType: 'tournament_popup',
          targetId: 'popup-1',
        }),
      }),
    );
  });

  it('update: 404 when the popup does not belong to the tournament', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentPopup.findFirst.mockResolvedValue(null);

    await expect(
      service.update(ownerAuthUser, {
        tournamentId: 'tournament-1',
        popupId: 'ghost',
        dto: { title: 't', body: 'b', status: 'draft' },
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('delete: removes the popup and records an audit log', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentPopup.findFirst.mockResolvedValue(popupRow());
    prisma.v1TournamentPopup.delete.mockResolvedValue(popupRow());

    const result = await service.delete(ownerAuthUser, {
      tournamentId: 'tournament-1',
      popupId: 'popup-1',
    });

    expect(result).toEqual({ popupId: 'popup-1', deleted: true });
    expect(prisma.v1TournamentPopup.delete).toHaveBeenCalledWith({ where: { id: 'popup-1' } });
  });
});
