import { NotFoundException } from '@nestjs/common';
import { ProfileService } from './profile.service';

const user = {
  id: 'user-1',
  email: 'old@teameet.test',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

describe('ProfileService identity binding', () => {
  it('clears stale verification assertions and synchronizes the password login key when email changes', async () => {
    const profile = {
      displayName: '테스트 사용자',
      nickname: '테스트닉',
      profileImageUrl: null,
      birthDate: null,
      gender: 'male',
      updatedAt: new Date(),
    };
    const prisma = {
      v1User: {
        findUnique: jest.fn().mockResolvedValue({
          email: user.email,
          phone: '01011112222',
          authIdentities: [{ provider: 'email', passwordHash: 'hash' }],
          profile,
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      v1AuthIdentity: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      v1UserProfile: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(profile),
      },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));
    const service = new ProfileService(prisma as never);

    await service.updateMe(user, {
      displayName: profile.displayName,
      nickname: profile.nickname,
      email: 'new@teameet.test',
      phone: '01033334444',
      profileImageUrl: null,
      birthDate: null,
      gender: 'male',
    });

    expect(prisma.v1User.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: {
        email: 'new@teameet.test',
        phone: '01033334444',
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
      },
    });
    expect(prisma.v1AuthIdentity.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, provider: 'email', status: 'active' },
      data: { email: 'new@teameet.test', providerUserKey: 'new@teameet.test' },
    });
  });
});

describe('ProfileService activitySummary', () => {
  it('mannerScore를 v1PostEventReview 직접 재집계 대신 V1UserReputationSummary 캐시에서 읽는다', async () => {
    const prisma = {
      v1TeamMembership: { findMany: jest.fn().mockResolvedValue([{ teamId: 'team-1' }]) },
      v1UserReputationSummary: {
        findUnique: jest.fn().mockResolvedValue({ mannerScore: { toString: () => '4.20', valueOf: () => 4.2 } }),
      },
      v1PostEventReview: { aggregate: jest.fn() },
      v1MatchParticipant: {
        count: jest.fn().mockResolvedValueOnce(7).mockResolvedValueOnce(2),
      },
    };
    const service = new ProfileService(prisma as never);

    const result = await service.activitySummary(user);

    expect(prisma.v1UserReputationSummary.findUnique).toHaveBeenCalledWith({
      where: { userId: user.id },
      select: { mannerScore: true },
    });
    expect(prisma.v1PostEventReview.aggregate).not.toHaveBeenCalled();
    expect(result.totals).toEqual({ activityCount: 7, teamCount: 1, mannerScore: 4.2 });
    expect(result.monthly).toEqual({ matchCount: 2, mannerScore: 4.2, winRate: null });
  });

  it('평판 요약이 없는 신규 사용자는 mannerScore를 null로 반환한다', async () => {
    const prisma = {
      v1TeamMembership: { findMany: jest.fn().mockResolvedValue([]) },
      v1UserReputationSummary: { findUnique: jest.fn().mockResolvedValue(null) },
      v1PostEventReview: { aggregate: jest.fn() },
      v1MatchParticipant: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new ProfileService(prisma as never);

    const result = await service.activitySummary(user);

    expect(result.totals.mannerScore).toBeNull();
    expect(result.monthly.mannerScore).toBeNull();
  });
});

describe('ProfileService public profile moderation', () => {
  it('queries only publicly available account states', async () => {
    const prisma = {
      v1User: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new ProfileService(prisma as never);

    await expect(service.publicProfile(null, 'blocked-user')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.v1User.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'blocked-user',
        deletedAt: null,
        accountStatus: 'active',
      },
      include: { profile: true, reputationSummary: true },
    });
  });
});

describe('ProfileService public profile activity summary (reveal filtering)', () => {
  const targetUserId = 'user-public-1';
  const baseUser = {
    id: targetUserId,
    deletedAt: null,
    accountStatus: 'active',
    profile: { nickname: '테스트' },
    reputationSummary: { trustState: 'sample', mannerScore: null, reviewCount: 5 },
  };

  function buildPrisma(overrides: { v1PostEventReview?: { findMany: jest.Mock } } = {}) {
    return {
      v1User: { findFirst: jest.fn().mockResolvedValue(baseUser) },
      v1MatchParticipant: { count: jest.fn().mockResolvedValue(0) },
      v1TeamMembership: { count: jest.fn().mockResolvedValue(0) },
      v1UserReputationSummary: { findUnique: jest.fn().mockResolvedValue({ reviewCount: 5 }) },
      v1PostEventReview: overrides.v1PostEventReview ?? { findMany: jest.fn().mockResolvedValue([]) },
    };
  }

  it('totals.reviewCount는 원본 count() 대신 캐시된 V1UserReputationSummary.reviewCount(공개된 리뷰만 반영)를 반환한다', async () => {
    const now = new Date('2026-08-15T12:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    try {
      const prisma = buildPrisma();
      const service = new ProfileService(prisma as never);

      const result = await service.publicProfile(null, targetUserId);

      expect(prisma.v1UserReputationSummary.findUnique).toHaveBeenCalledWith({
        where: { userId: targetUserId },
        select: { reviewCount: true },
      });
      expect(result.activitySummary.totals.reviewCount).toBe(5);
    } finally {
      jest.useRealTimers();
    }
  });

  it('monthly.reviewCount는 이번 달 제출된 리뷰 중 아직 공개(reveal)되지 않은 리뷰를 제외한다', async () => {
    const now = new Date('2026-08-15T12:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    try {
      // revealed: 상대(reviewer-a)가 이미 반대 방향 리뷰를 제출해서 즉시 공개됨
      const revealedReview = {
        sourceId: 'source-a',
        reviewerUserId: 'reviewer-a',
        targetUserId,
        submittedAt: now,
      };
      // hidden: 방금 제출됐고(72시간 미경과) 상대도 아직 제출 안 함 — 아직 비공개
      const hiddenReview = {
        sourceId: 'source-b',
        reviewerUserId: 'reviewer-b',
        targetUserId,
        submittedAt: now,
      };
      const reverseReview = { sourceId: 'source-a', reviewerUserId: targetUserId, targetUserId: 'reviewer-a' };

      const findMany = jest
        .fn()
        .mockResolvedValueOnce([revealedReview, hiddenReview])
        .mockResolvedValueOnce([reverseReview]);

      const prisma = buildPrisma({ v1PostEventReview: { findMany } });
      const service = new ProfileService(prisma as never);

      const result = await service.publicProfile(null, targetUserId);

      expect(result.activitySummary.monthly.reviewCount).toBe(1);
      expect(findMany).toHaveBeenNthCalledWith(2, {
        where: { reviewerUserId: targetUserId, sourceId: { in: ['source-a', 'source-b'] }, status: 'submitted' },
        select: { sourceId: true, reviewerUserId: true, targetUserId: true },
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
