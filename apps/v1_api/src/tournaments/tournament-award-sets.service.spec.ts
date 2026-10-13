import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentAwardSetDto, TournamentAwardSetsService } from './tournament-award-sets.service';

const adminUser = {
  id: 'admin-user-id',
  email: 'admin@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
const adminRecord = {
  id: 'admin-id',
  userId: adminUser.id,
  adminRole: 'owner' as const,
  status: 'active' as const,
  user: { accountStatus: 'active' as const },
};

describe('TournamentAwardSetsService', () => {
  let service: TournamentAwardSetsService;
  let prisma: {
    v1Tournament: { findFirst: jest.Mock };
    v1TournamentAwardSet: { findMany: jest.Mock; deleteMany: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let adminContext: { getActiveAdmin: jest.Mock; getMutationAdmin: jest.Mock; logAdminAction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      v1Tournament: { findFirst: jest.fn() },
      v1TournamentAwardSet: { findMany: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
      $transaction: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(0),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(prisma),
    );
    adminContext = {
      getActiveAdmin: jest.fn().mockResolvedValue(adminRecord),
      getMutationAdmin: jest.fn().mockResolvedValue(adminRecord),
      logAdminAction: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentAwardSetsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminContextService, useValue: adminContext },
      ],
    }).compile();
    service = module.get(TournamentAwardSetsService);
  });

  it('DTO accepts only upper/lower and permits nullable editable fields', () => {
    const valid = plainToInstance(TournamentAwardSetDto, {
      bracketTrack: 'upper',
      prizePool: null,
      prizeSummary: null,
      prizeBreakdown: null,
    });
    expect(validateSync(valid, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);

    const invalid = plainToInstance(TournamentAwardSetDto, { bracketTrack: 'overall' });
    expect(validateSync(invalid, { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(0);

    const overflow = plainToInstance(TournamentAwardSetDto, { bracketTrack: 'upper', prizePool: 2147483648 });
    expect(validateSync(overflow, { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(0);
  });

  it('saves both team award sets in one replacement and records the audit in the transaction', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null, kind: 'regular_tournament' });
    prisma.v1TournamentAwardSet.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'set-upper', tournamentId: 'tournament-1', bracketTrack: 'upper', prizePool: 100000, prizeSummary: '상위 우승' },
        { id: 'set-lower', tournamentId: 'tournament-1', bracketTrack: 'lower', prizePool: 50000, prizeSummary: '하위 우승' },
      ]);
    prisma.v1TournamentAwardSet.deleteMany.mockResolvedValue({ count: 0 });
    prisma.v1TournamentAwardSet.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `set-${data.bracketTrack}`,
      tournamentId: 'tournament-1',
      ...data,
    }));

    const result = await service.setAwardSets(adminUser, 'tournament-1', {
      awardSets: [
        { bracketTrack: 'upper', prizePool: 100000, prizeSummary: '상위 우승' },
        { bracketTrack: 'lower', prizePool: 50000, prizeSummary: '하위 우승' },
      ],
    });

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ bracketTrack: 'upper', prizePool: 100000 }),
      expect.objectContaining({ bracketTrack: 'lower', prizePool: 50000 }),
    ]));
    expect(prisma.v1TournamentAwardSet.deleteMany).toHaveBeenCalledWith({ where: { tournamentId: 'tournament-1' } });
    expect(prisma.v1TournamentAwardSet.create).toHaveBeenCalledTimes(2);
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(
      adminRecord,
      expect.objectContaining({
        action: 'tournament.award_sets_replace',
        targetType: 'tournament',
        targetId: 'tournament-1',
      }),
      prisma,
    );
  });

  it('rejects duplicate tracks and never mutates data', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null, kind: 'regular_tournament' });
    await expect(service.setAwardSets(adminUser, 'tournament-1', {
      awardSets: [
        { bracketTrack: 'upper', prizeSummary: '한쪽' },
        { bracketTrack: 'upper', prizeSummary: '중복' },
      ],
    })).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects non-tournament ids and never mutates data', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(null);
    await expect(service.setAwardSets(adminUser, 'league-1', { awardSets: [] })).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a legacy null-kind tournament before changing split announcements', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'legacy-1', deletedAt: null, kind: null });
    prisma.v1TournamentAwardSet.findMany.mockResolvedValue([]);
    await expect(service.setAwardSets(adminUser, 'legacy-1', { awardSets: [] })).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
