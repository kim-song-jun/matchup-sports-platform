import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
    const service = new ProfileService(prisma as unknown as PrismaService);

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
  it('mannerScore를 V1UserReputationSummary 캐시 대신 v1PostEventReview를 매번 live로 재집계한다 (reveal 필터 적용)', async () => {
    const now = new Date('2026-08-15T12:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    try {
      // revealed: 상대(reviewer-a)가 반대 방향 리뷰를 이미 제출해서 즉시 공개됨
      const revealedReview = {
        sourceId: 'source-a',
        reviewerUserId: 'reviewer-a',
        targetUserId: user.id,
        rating: 5,
        submittedAt: now,
      };
      // hidden: 방금 제출됐고(72시간 미경과) 상대도 아직 제출 안 함 — 아직 비공개, 평균 계산에서 제외돼야 함
      const hiddenReview = {
        sourceId: 'source-b',
        reviewerUserId: 'reviewer-b',
        targetUserId: user.id,
        rating: 1,
        submittedAt: now,
      };
      const reverseReview = { sourceId: 'source-a', reviewerUserId: user.id, targetUserId: 'reviewer-a' };

      const findMany = jest
        .fn()
        .mockResolvedValueOnce([revealedReview, hiddenReview])
        .mockResolvedValueOnce([reverseReview]);

      const prisma = {
        v1TeamMembership: { findMany: jest.fn().mockResolvedValue([{ teamId: 'team-1' }]) },
        v1PostEventReview: { findMany },
        v1MatchParticipant: {
          count: jest.fn().mockResolvedValueOnce(7).mockResolvedValueOnce(2),
        },
      };
      const service = new ProfileService(prisma as never);

      const result = await service.activitySummary(user);

      expect(findMany).toHaveBeenNthCalledWith(1, {
        where: { targetUserId: user.id, targetType: 'user', status: 'submitted' },
        select: { sourceId: true, reviewerUserId: true, targetUserId: true, rating: true, submittedAt: true },
      });
      expect(findMany).toHaveBeenNthCalledWith(2, {
        where: { reviewerUserId: user.id, sourceId: { in: ['source-a', 'source-b'] }, status: 'submitted' },
        select: { sourceId: true, reviewerUserId: true, targetUserId: true },
      });
      expect(result.totals).toEqual({ activityCount: 7, teamCount: 1, mannerScore: 5 });
      expect(result.monthly).toEqual({ matchCount: 2, mannerScore: 5, winRate: null });
    } finally {
      jest.useRealTimers();
    }
  });

  it('상대가 반대 방향 리뷰를 제출하지 않았고 72시간도 경과하지 않은 리뷰는 제외한다 (전부 비공개)', async () => {
    const now = new Date('2026-08-15T12:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    try {
      const hiddenReview = {
        sourceId: 'source-c',
        reviewerUserId: 'reviewer-c',
        targetUserId: user.id,
        rating: 3,
        submittedAt: now,
      };
      const findMany = jest.fn().mockResolvedValueOnce([hiddenReview]).mockResolvedValueOnce([]);
      const prisma = {
        v1TeamMembership: { findMany: jest.fn().mockResolvedValue([]) },
        v1PostEventReview: { findMany },
        v1MatchParticipant: { count: jest.fn().mockResolvedValue(0) },
      };
      const service = new ProfileService(prisma as never);

      const result = await service.activitySummary(user);

      expect(result.totals.mannerScore).toBeNull();
      expect(result.monthly.mannerScore).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('72시간이 경과했지만 그 이후 새 리뷰 이벤트가 전혀 없었던 리뷰도 캐시 갱신 트리거 없이 매 요청마다 포함된다', async () => {
    // 이번 수정의 핵심 시나리오: 캐시(V1UserReputationSummary)는 submitPersonalReview/submitTeamReview
    // 안에서만 갱신되므로, 리뷰 R 하나를 받은 뒤 새 리뷰가 전혀 없으면 R이 72시간 경과로 reveal 가능해져도
    // 캐시는 영원히 갱신 안 될 수 있다. 이 메서드는 캐시를 읽지 않고 매번 live로 재계산하므로 정상 반영돼야 한다.
    const submittedAt = new Date('2026-08-01T00:00:00Z');
    const now = new Date('2026-08-15T12:00:00Z'); // submittedAt으로부터 72시간 훨씬 이상 경과
    jest.useFakeTimers().setSystemTime(now);

    try {
      const staleRevealedReview = {
        sourceId: 'source-stale',
        reviewerUserId: 'reviewer-stale',
        targetUserId: user.id,
        rating: 4,
        submittedAt,
      };
      // reverse 조회 결과는 비어있음 — 상대가 끝까지 반대 방향 리뷰를 제출하지 않았지만, 시간 경과만으로 공개됨
      const findMany = jest.fn().mockResolvedValueOnce([staleRevealedReview]).mockResolvedValueOnce([]);
      const prisma = {
        v1TeamMembership: { findMany: jest.fn().mockResolvedValue([]) },
        v1PostEventReview: { findMany },
        v1MatchParticipant: { count: jest.fn().mockResolvedValue(0) },
      };
      const service = new ProfileService(prisma as never);

      const result = await service.activitySummary(user);

      expect(result.totals.mannerScore).toBe(4);
      expect(result.monthly.mannerScore).toBe(4);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ProfileService public profile moderation', () => {
  it('queries only publicly available account states', async () => {
    const prisma = {
      v1User: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new ProfileService(prisma as unknown as PrismaService);

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

  // where.targetType 존재 여부로 candidates 쿼리(전체 기간 또는 이번 달 한정)와 reverse 쿼리를 구분하고,
  // candidates 쿼리는 where.submittedAt 존재 여부로 "전체 기간(totals)"과 "이번 달(monthly)"을 구분한다.
  // 각 테스트는 한쪽 candidates를 빈 배열로 둬서 그쪽의 reverse 호출 자체가 발생하지 않도록 해 순서 의존을 없앤다.
  function buildPrisma(config: {
    allTimeCandidates?: unknown[];
    monthlyCandidates?: unknown[];
    reverse?: unknown[];
  } = {}) {
    const allTimeCandidates = config.allTimeCandidates ?? [];
    const monthlyCandidates = config.monthlyCandidates ?? [];
    const reverse = config.reverse ?? [];

    const findMany = jest.fn().mockImplementation((args: { where: Record<string, unknown> }) => {
      const { where } = args;
      if ('targetType' in where) {
        return Promise.resolve(where.submittedAt ? monthlyCandidates : allTimeCandidates);
      }
      return Promise.resolve(reverse);
    });

    return {
      v1User: { findFirst: jest.fn().mockResolvedValue(baseUser) },
      v1MatchParticipant: { count: jest.fn().mockResolvedValue(0) },
      v1TeamMembership: { count: jest.fn().mockResolvedValue(0) },
      v1PostEventReview: { findMany },
    };
  }

  it('totals.reviewCount는 캐시(V1UserReputationSummary) 대신 reveal 필터를 통과한 리뷰만 live로 재계산해 반환한다', async () => {
    const now = new Date('2026-08-15T12:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    try {
      // revealed-by-partner: 상대가 반대 방향 리뷰를 제출해서 즉시 공개됨
      const revealedByPartner = {
        sourceId: 'source-a',
        reviewerUserId: 'reviewer-a',
        targetUserId,
        rating: 5,
        submittedAt: now,
      };
      // hidden: 방금 제출됐고 상대도 아직 제출 안 함 — 72시간 미경과라 아직 비공개, count에서 제외돼야 함
      const hidden = {
        sourceId: 'source-b',
        reviewerUserId: 'reviewer-b',
        targetUserId,
        rating: 1,
        submittedAt: now,
      };
      const reverse = [{ sourceId: 'source-a', reviewerUserId: targetUserId, targetUserId: 'reviewer-a' }];

      const prisma = buildPrisma({ allTimeCandidates: [revealedByPartner, hidden], reverse });
      const service = new ProfileService(prisma as never);

      const result = await service.publicProfile(null, targetUserId);

      expect(result.activitySummary.totals.reviewCount).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('72시간이 경과했지만 그 이후 새 리뷰 이벤트가 전혀 없었던 리뷰도 totals.reviewCount에 포함된다 (캐시 갱신 트리거 부재 대응)', async () => {
    const submittedAt = new Date('2026-08-01T00:00:00Z');
    const now = new Date('2026-08-15T12:00:00Z'); // 72시간 훨씬 이상 경과
    jest.useFakeTimers().setSystemTime(now);

    try {
      const staleRevealed = {
        sourceId: 'source-stale',
        reviewerUserId: 'reviewer-stale',
        targetUserId,
        rating: 4,
        submittedAt,
      };
      // reverse가 비어있어도(상대가 끝까지 반대 방향 리뷰를 제출하지 않아도) 시간 경과만으로 공개돼야 한다
      const prisma = buildPrisma({ allTimeCandidates: [staleRevealed], reverse: [] });
      const service = new ProfileService(prisma as never);

      const result = await service.publicProfile(null, targetUserId);

      expect(result.activitySummary.totals.reviewCount).toBe(1);
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

      const prisma = buildPrisma({
        monthlyCandidates: [revealedReview, hiddenReview],
        reverse: [reverseReview],
      });
      const service = new ProfileService(prisma as never);

      const result = await service.publicProfile(null, targetUserId);

      expect(result.activitySummary.monthly.reviewCount).toBe(1);
      expect(prisma.v1PostEventReview.findMany).toHaveBeenCalledWith({
        where: { reviewerUserId: targetUserId, sourceId: { in: ['source-a', 'source-b'] }, status: 'submitted' },
        select: { sourceId: true, reviewerUserId: true, targetUserId: true },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('reputation.mannerScore/reviewCount는 캐시(reputationSummary) 값이 아니라 reveal 필터를 통과한 live 재계산 값을 반환한다', async () => {
    const now = new Date('2026-08-15T12:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    try {
      // baseUser.reputationSummary(캐시)는 reviewCount: 5, mannerScore: null — 이번 테스트는 이 캐시값이
      // 무시되고 live 재계산 결과(revealed 리뷰 1건, 평점 5)가 반환되는지 검증한다.
      const revealedByPartner = {
        sourceId: 'source-a',
        reviewerUserId: 'reviewer-a',
        targetUserId,
        rating: 5,
        submittedAt: now,
      };
      const reverse = [{ sourceId: 'source-a', reviewerUserId: targetUserId, targetUserId: 'reviewer-a' }];
      const prisma = buildPrisma({ allTimeCandidates: [revealedByPartner], reverse });
      const service = new ProfileService(prisma as never);

      const result = await service.publicProfile(null, targetUserId);

      expect(result.reputation.reviewCount).toBe(1);
      expect(result.reputation.mannerScore).toBe(5);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ProfileService withdrawal admin lockout', () => {
  function createPrisma(activeAdmin: { id: string } | null) {
    const prisma = {
      v1User: {
        findUnique: jest.fn().mockResolvedValue({ accountStatus: 'active' }),
        update: jest.fn().mockResolvedValue({
          id: user.id,
          accountStatus: 'withdrawal_pending',
          updatedAt: new Date('2026-07-19T00:00:00.000Z'),
        }),
      },
      v1AdminUser: {
        findUnique: jest.fn().mockResolvedValue(activeAdmin ? { status: 'active' } : null),
      },
      v1MatchParticipant: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      v1TeamMembership: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'status-log-1' }) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));
    return prisma;
  }

  it('fails closed with a stable error before mutating an active admin account', async () => {
    const prisma = createPrisma({ id: 'admin-record-1' });
    const service = new ProfileService(prisma as unknown as PrismaService);
    const request = service.withdrawalRequest(user, { reason: 'leave' });

    await expect(request).rejects.toBeInstanceOf(ForbiddenException);
    await expect(request).rejects.toMatchObject({
      response: { code: 'ADMIN_WITHDRAWAL_FORBIDDEN' },
    });
    expect(prisma.v1AdminUser.findUnique).toHaveBeenCalledWith({
      where: { userId: user.id },
      select: { status: true },
    });
    expect(prisma.v1User.update).not.toHaveBeenCalled();
    expect(prisma.v1StatusChangeLog.create).not.toHaveBeenCalled();
  });

  it('allows a non-admin active user to request withdrawal after the locked-state check', async () => {
    const prisma = createPrisma(null);
    const service = new ProfileService(prisma as unknown as PrismaService);

    await expect(service.withdrawalRequest(user, { reason: 'leave' })).resolves.toMatchObject({
      userId: user.id,
      accountStatus: 'withdrawal_pending',
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.v1User.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { accountStatus: 'withdrawal_pending' },
    });
  });

  it('rejects when the transaction-time account status is no longer active', async () => {
    const prisma = createPrisma(null);
    prisma.v1User.findUnique.mockResolvedValue({ accountStatus: 'suspended' });
    const service = new ProfileService(prisma as unknown as PrismaService);

    await expect(service.withdrawalRequest(user, { reason: 'stale auth' })).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    expect(prisma.v1AdminUser.findUnique).not.toHaveBeenCalled();
    expect(prisma.v1User.update).not.toHaveBeenCalled();
    expect(prisma.v1StatusChangeLog.create).not.toHaveBeenCalled();
  });

  it('진행 중인 매치가 있으면 409 WITHDRAWAL_BLOCKED_ACTIVE_MATCH — 트랜잭션 진입 전 차단, soft-delete된 매치는 제외 조회', async () => {
    const prisma = createPrisma(null);
    prisma.v1MatchParticipant.findFirst.mockResolvedValue({ id: 'participant-1' });
    const service = new ProfileService(prisma as unknown as PrismaService);

    await expect(service.withdrawalRequest(user, { reason: 'leave' })).rejects.toMatchObject({
      status: 409,
      response: { code: 'WITHDRAWAL_BLOCKED_ACTIVE_MATCH' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.v1User.update).not.toHaveBeenCalled();
    expect(prisma.v1MatchParticipant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          match: expect.objectContaining({ deletedAt: null }),
        }),
      }),
    );
  });

  it('운영 중인 팀(owner/manager)이 있으면 409 WITHDRAWAL_BLOCKED_TEAM_AUTHORITY — 트랜잭션 진입 전 차단, soft-delete/비활성 팀은 제외 조회', async () => {
    const prisma = createPrisma(null);
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'membership-1' });
    const service = new ProfileService(prisma as unknown as PrismaService);

    await expect(service.withdrawalRequest(user, { reason: 'leave' })).rejects.toMatchObject({
      status: 409,
      response: { code: 'WITHDRAWAL_BLOCKED_TEAM_AUTHORITY' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.v1User.update).not.toHaveBeenCalled();
    expect(prisma.v1TeamMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          team: { status: 'active', deletedAt: null },
        }),
      }),
    );
  });
});
