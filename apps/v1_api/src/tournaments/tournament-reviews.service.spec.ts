/**
 * tournament-reviews.service.spec.ts
 *
 * Contract tests for the tournament awards admin gate (security fix).
 * Verifies: non-admin authenticated users get 403 on both listAwards (GET)
 * and setAwards (PUT), support-role admins cannot mutate via setAwards,
 * and a legitimate admin can still read/write awards end-to-end.
 * Asserts observable behaviour only — no mock-for-mock assertions.
 */
import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService } from '../common/admin-context.service';
import { TournamentReviewsService } from './tournament-reviews.service';

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
const plainUser = {
  id: 'plain-user-id',
  email: 'user@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const ownerAdminRecord = {
  id: 'owner-admin-id',
  userId: 'owner-user-id',
  adminRole: 'owner' as const,
  status: 'active' as const,
};
const supportAdminRecord = {
  id: 'support-admin-id',
  userId: 'support-user-id',
  adminRole: 'support' as const,
  status: 'active' as const,
};

function awardRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'award-1',
    tournamentId: 'tournament-1',
    awardType: 'mvp',
    awardLabel: 'MVP',
    recipientName: '김철수',
    teamName: '레알마드리드',
    note: null,
    sortOrder: 0,
    createdAt: new Date('2026-06-14T00:00:00.000Z'),
    ...overrides,
  };
}

describe('TournamentReviewsService — awards admin gate', () => {
  let service: TournamentReviewsService;
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1Tournament: { findFirst: jest.Mock };
    v1TournamentAward: {
      findMany: jest.Mock;
      deleteMany: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1Tournament: { findFirst: jest.fn() },
      v1TournamentAward: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentReviewsService,
        AdminContextService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TournamentReviewsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listAwards (GET) ───────────────────────────────────────────────────

  it('listAwards: non-admin authenticated user → 403 PERMISSION_DENIED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);

    await expect(
      service.listAwards(plainUser, 'tournament-1'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.v1TournamentAward.findMany).not.toHaveBeenCalled();
  });

  it('listAwards: support admin can read (read-only gate)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);
    prisma.v1TournamentAward.findMany.mockResolvedValue([awardRow()]);

    const result = await service.listAwards(supportAuthUser, 'tournament-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'award-1', awardType: 'mvp' });
  });

  it('listAwards: owner admin can read', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1TournamentAward.findMany.mockResolvedValue([]);

    const result = await service.listAwards(ownerAuthUser, 'tournament-1');

    expect(result).toEqual([]);
  });

  // ─── setAwards (PUT) ────────────────────────────────────────────────────

  it('setAwards: non-admin authenticated user → 403 PERMISSION_DENIED, no data mutated', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);

    await expect(
      service.setAwards(plainUser, 'tournament-1', { awards: [] }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.v1Tournament.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('setAwards: support admin cannot mutate → 403 PERMISSION_DENIED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);

    await expect(
      service.setAwards(supportAuthUser, 'tournament-1', { awards: [] }),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('setAwards: owner admin replaces awards and returns the updated list', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentAward.deleteMany.mockResolvedValue({ count: 1 });
    prisma.v1TournamentAward.create.mockResolvedValue(awardRow());
    prisma.v1TournamentAward.findMany.mockResolvedValue([awardRow()]);

    const result = await service.setAwards(ownerAuthUser, 'tournament-1', {
      awards: [
        {
          awardType: 'mvp',
          awardLabel: 'MVP',
          recipientName: '김철수',
          teamName: '레알마드리드',
        },
      ],
    });

    expect(prisma.v1TournamentAward.deleteMany).toHaveBeenCalledWith({
      where: { tournamentId: 'tournament-1' },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ awardType: 'mvp', recipientName: '김철수' });
  });

  it('setAwards: unknown tournament → 404 TOURNAMENT_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(null);

    await expect(
      service.setAwards(ownerAuthUser, 'ghost', { awards: [] }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
