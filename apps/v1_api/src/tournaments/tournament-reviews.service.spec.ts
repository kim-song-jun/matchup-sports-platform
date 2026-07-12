/**
 * tournament-reviews.service.spec.ts
 *
 * Contract tests for the tournament awards admin gate (security fix)
 * and the roster-only recipient enforcement.
 * Verifies: non-admin authenticated users get 403 on both listAwards (GET)
 * and setAwards (PUT), support-role admins cannot mutate via setAwards,
 * a legitimate admin can still read/write awards end-to-end, and setAwards
 * rejects recipients/teams that are not in the tournament roster
 * (400 AWARD_RECIPIENT_NOT_IN_ROSTER, no mutation executed).
 * Asserts observable behaviour only — no mock-for-mock assertions.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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

/** confirmed 등록 1건 — 팀 '레알마드리드', 로스터: 김철수·이영희 */
const confirmedRegistrationRows = [
  {
    team: { name: '레알마드리드' },
    players: [{ realName: '김철수' }, { realName: '이영희' }],
  },
];

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
    v1TournamentRegistration: { findMany: jest.Mock };
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
      v1TournamentRegistration: { findMany: jest.fn() },
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
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);
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

  // ─── setAwards 로스터 전용 강제 ─────────────────────────────────────────

  it('setAwards: recipient not in tournament roster → 400 AWARD_RECIPIENT_NOT_IN_ROSTER, no mutation', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);

    const attempt = service.setAwards(ownerAuthUser, 'tournament-1', {
      awards: [
        { awardType: 'mvp', awardLabel: 'MVP', recipientName: '외부인' },
      ],
    });

    await expect(attempt).rejects.toThrow(BadRequestException);
    await expect(attempt).rejects.toMatchObject({
      response: { code: 'AWARD_RECIPIENT_NOT_IN_ROSTER' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.v1TournamentAward.deleteMany).not.toHaveBeenCalled();
  });

  it('setAwards: teamName not among confirmed registrations → 400 AWARD_RECIPIENT_NOT_IN_ROSTER, no mutation', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);

    await expect(
      service.setAwards(ownerAuthUser, 'tournament-1', {
        awards: [
          {
            awardType: 'mvp',
            awardLabel: 'MVP',
            recipientName: '김철수',
            teamName: '미참가팀',
          },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'AWARD_RECIPIENT_NOT_IN_ROSTER' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.v1TournamentAward.deleteMany).not.toHaveBeenCalled();
  });

  it('setAwards: roster recipient without teamName passes validation', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);
    prisma.v1TournamentAward.deleteMany.mockResolvedValue({ count: 0 });
    prisma.v1TournamentAward.create.mockResolvedValue(
      awardRow({ recipientName: '이영희', teamName: null }),
    );
    prisma.v1TournamentAward.findMany.mockResolvedValue([
      awardRow({ recipientName: '이영희', teamName: null }),
    ]);

    const result = await service.setAwards(ownerAuthUser, 'tournament-1', {
      awards: [{ awardType: 'mvp', awardLabel: 'MVP', recipientName: '이영희' }],
    });

    expect(result[0]).toMatchObject({ recipientName: '이영희', teamName: null });
  });

  it('setAwards: roster is scoped to confirmed registrations of the tournament', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', deletedAt: null });
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(confirmedRegistrationRows);
    prisma.v1TournamentAward.deleteMany.mockResolvedValue({ count: 0 });
    prisma.v1TournamentAward.create.mockResolvedValue(awardRow());
    prisma.v1TournamentAward.findMany.mockResolvedValue([awardRow()]);

    await service.setAwards(ownerAuthUser, 'tournament-1', {
      awards: [{ awardType: 'mvp', awardLabel: 'MVP', recipientName: '김철수' }],
    });

    expect(prisma.v1TournamentRegistration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournamentId: 'tournament-1', status: 'confirmed' },
      }),
    );
  });
});
