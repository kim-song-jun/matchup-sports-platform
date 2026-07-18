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
