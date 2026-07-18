import { ReviewsService } from './reviews.service';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'reviewer@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const sourceId = '00000000-0000-4000-8000-000000000010';
const targetUserId = '00000000-0000-4000-8000-000000000002';
const submittedAt = new Date('2026-06-02T12:00:00.000Z');

const teamSourceId = '00000000-0000-4000-8000-000000000030';
const hostTeamId = '00000000-0000-4000-8000-000000000031';
const awayTeamId = '00000000-0000-4000-8000-000000000032';

describe('ReviewsService', () => {
  it('returns an idempotent duplicate response when personal review create hits the unique constraint', async () => {
    const existingReview = {
      id: 'review-1',
      sourceType: 'match',
      sourceId,
      targetType: 'user',
      targetUser: { id: targetUserId, profile: { nickname: '민준', profileImageUrl: null } },
      targetTeam: null,
      reviewerUser: { id: user.id, profile: { nickname: '송준', profileImageUrl: null } },
      reviewerTeam: null,
      rating: 5,
      tags: [{ tagCode: 'manner', labelSnapshot: '매너가 좋아요', createdAt: submittedAt }],
      status: 'submitted',
      submittedAt,
    };
    const prisma = {
      v1Match: {
        findUnique: jest.fn().mockResolvedValue({
          id: sourceId,
          title: '성수 풋살파크 개인 매치',
          status: 'completed',
          completedAt: submittedAt,
          startAt: submittedAt,
          participants: [
            { userId: user.id, user: { id: user.id, profile: { nickname: '송준', profileImageUrl: null } } },
            { userId: targetUserId, user: { id: targetUserId, profile: { nickname: '민준', profileImageUrl: null } } },
          ],
        }),
      },
      v1PostEventReview: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(existingReview),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
        v1PostEventReview: {
          create: jest.fn().mockRejectedValue({ code: 'P2002' }),
        },
      })),
    };
    const tournamentFixtureReviews = {
      pending: jest.fn(),
      source: jest.fn(),
      submit: jest.fn(),
      sourceSummaries: jest.fn(),
    };
    const service = new ReviewsService(prisma as never, tournamentFixtureReviews as never);

    await expect(service.submit(user, {
      sourceType: 'match',
      sourceId,
      targetType: 'user',
      targetUserId,
      rating: 5,
      tagCodes: ['manner'],
    })).resolves.toMatchObject({
      alreadySubmitted: true,
      review: {
        reviewId: 'review-1',
        targetUser: { userId: targetUserId, name: '민준' },
        rating: 5,
      },
    });
    expect(prisma.v1PostEventReview.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { reviewerUserId: user.id, sourceType: 'match', sourceId, targetUserId },
    }));
  });

  it('submitPersonalReview: 리뷰 생성 시 매치의 sportId를 스냅샷으로 저장한다', async () => {
    const createMock = jest.fn().mockResolvedValue({
      id: 'review-2',
      sourceType: 'match',
      sourceId,
      targetType: 'user',
      targetUser: { id: targetUserId, profile: { nickname: '민준', profileImageUrl: null } },
      targetTeam: null,
      reviewerUser: { id: user.id, profile: { nickname: '송준', profileImageUrl: null } },
      reviewerTeam: null,
      rating: 5,
      sportId: 'sport-futsal',
      tags: [],
      status: 'submitted',
      submittedAt,
    });
    const prisma = {
      v1Match: {
        findUnique: jest.fn().mockResolvedValue({
          id: sourceId,
          title: '성수 풋살파크 개인 매치',
          status: 'completed',
          completedAt: submittedAt,
          startAt: submittedAt,
          sportId: 'sport-futsal',
          participants: [
            { userId: user.id, user: { id: user.id, profile: { nickname: '송준', profileImageUrl: null } } },
            { userId: targetUserId, user: { id: targetUserId, profile: { nickname: '민준', profileImageUrl: null } } },
          ],
        }),
      },
      v1PostEventReview: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
        v1PostEventReview: {
          create: createMock,
          aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 5 }, _count: { _all: 1 } }),
        },
        v1UserReputationSummary: {
          upsert: jest.fn().mockResolvedValue({}),
        },
      })),
    };
    const tournamentFixtureReviews = {
      pending: jest.fn(),
      source: jest.fn(),
      submit: jest.fn(),
      sourceSummaries: jest.fn(),
    };
    const service = new ReviewsService(prisma as never, tournamentFixtureReviews as never);

    await service.submit(user, {
      sourceType: 'match',
      sourceId,
      targetType: 'user',
      targetUserId,
      rating: 5,
      tagCodes: ['manner'],
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sportId: 'sport-futsal' }) }),
    );
  });

  it('submitTeamReview: 리뷰 생성 시 팀 매치의 sportId를 스냅샷으로 저장한다', async () => {
    const createMock = jest.fn().mockResolvedValue({
      id: 'review-3',
      sourceType: 'team_match',
      sourceId: teamSourceId,
      targetType: 'team',
      targetUser: null,
      targetTeam: { id: awayTeamId, name: '원정팀', profile: { logoUrl: null } },
      reviewerUser: { id: user.id, profile: { nickname: '송준', profileImageUrl: null } },
      reviewerTeam: { id: hostTeamId, name: '홈팀', profile: { logoUrl: null } },
      rating: 5,
      sportId: 'sport-futsal',
      tags: [],
      status: 'submitted',
      submittedAt,
    });
    const prisma = {
      v1TeamMatch: {
        findUnique: jest.fn().mockResolvedValue({
          id: teamSourceId,
          title: '성수 풋살파크 팀 매치',
          status: 'completed',
          completedAt: submittedAt,
          startAt: submittedAt,
          sportId: 'sport-futsal',
          hostTeamId,
          approvedApplicantTeamId: awayTeamId,
          hostTeam: { id: hostTeamId, name: '홈팀', profile: { logoUrl: null } },
          approvedApplicantTeam: { id: awayTeamId, name: '원정팀', profile: { logoUrl: null } },
        }),
      },
      v1TeamMembership: {
        findMany: jest.fn().mockResolvedValue([
          { teamId: hostTeamId, role: 'manager', team: { name: '홈팀' } },
        ]),
      },
      v1PostEventReview: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
        v1PostEventReview: {
          create: createMock,
          aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 5 }, _count: { _all: 1 } }),
        },
        v1TeamMatch: {
          count: jest.fn().mockResolvedValue(1),
        },
        v1TeamTrustScore: {
          upsert: jest.fn().mockResolvedValue({}),
        },
      })),
    };
    const tournamentFixtureReviews = {
      pending: jest.fn(),
      source: jest.fn(),
      submit: jest.fn(),
      sourceSummaries: jest.fn(),
    };
    const service = new ReviewsService(prisma as never, tournamentFixtureReviews as never);

    await service.submit(user, {
      sourceType: 'team_match',
      sourceId: teamSourceId,
      targetType: 'team',
      targetTeamId: awayTeamId,
      rating: 5,
      tagCodes: ['manner'],
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sportId: 'sport-futsal',
          sourceType: 'team_match',
          reviewerTeamId: hostTeamId,
          targetTeamId: awayTeamId,
        }),
      }),
    );
  });

  describe('receivedSummary', () => {
    it('sportId가 없는(레거시) 리뷰는 집계에서 제외하고, 공개되지 않은 리뷰도 제외한다', async () => {
      const now = new Date('2026-08-01T00:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      try {
        const findManyMock = jest
          .fn()
          .mockResolvedValueOnce([
            // 대상 x가 받은 리뷰들
            { id: 'r1', sourceId: 'm1', reviewerUserId: 'a', targetUserId: 'x', rating: 5, sportId: 'futsal', submittedAt: new Date('2026-07-30T00:00:00Z'), tags: [{ tagCode: 'manner', labelSnapshot: '매너가 좋아요' }] },
            { id: 'r2', sourceId: 'm2', reviewerUserId: 'b', targetUserId: 'x', rating: 3, sportId: null, submittedAt: new Date('2026-07-01T00:00:00Z'), tags: [] }, // 레거시(sportId null) — 집계 제외
            { id: 'r3', sourceId: 'm3', reviewerUserId: 'c', targetUserId: 'x', rating: 4, sportId: 'futsal', submittedAt: new Date('2026-07-31T23:00:00Z'), tags: [] }, // 71시간 미만, 상대도 미제출 — 비공개
          ])
          .mockResolvedValueOnce([
            // x가 쓴 리뷰들(reverse pair 확인용) — r1의 짝(a→x)에 대응하는 x→a가 존재해야 즉시 공개
            { sourceId: 'm1', reviewerUserId: 'x', targetUserId: 'a' },
          ]);

        const prisma = {
          v1PostEventReview: {
            findMany: findManyMock,
          },
        };
        const tournamentFixtureReviews = {
          pending: jest.fn(),
          source: jest.fn(),
          submit: jest.fn(),
          sourceSummaries: jest.fn(),
        };
        const service = new ReviewsService(prisma as never, tournamentFixtureReviews as never);

        const result = await service.receivedSummary(
          { id: 'x', email: 'x@teameet.v1', accountStatus: 'active', onboardingStatus: 'completed' },
          { targetType: 'user' },
        );

        expect(result.bySport).toEqual([
          { sportId: 'futsal', ratingAvg: 5, ratingCount: 1, tagRates: [{ tagCode: 'manner', label: '매너가 좋아요', rate: 1, count: 1 }] },
        ]);
        expect(findManyMock).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('team 타깃: 상대 팀이 이미 반대 방향 리뷰를 제출했으면 72시간 이내여도 즉시 공개한다', async () => {
      const submittedAt = new Date('2026-08-01T00:00:00Z');
      const now = new Date('2026-08-01T01:00:00Z'); // 72시간 미경과
      jest.useFakeTimers().setSystemTime(now);

      try {
        const reviewFindManyMock = jest
          .fn()
          .mockResolvedValueOnce([
            // team-a(개인 user-p가 제출)가 team-x로부터 받은 리뷰
            { sourceId: 'tm1', reviewerUserId: 'user-p', reviewerTeamId: 'team-a', targetUserId: null, targetTeamId: 'team-x', rating: 5, sportId: 'futsal', submittedAt, tags: [] },
          ])
          .mockResolvedValueOnce([
            // team-x가 team-a에게 이미 제출한 반대 방향 리뷰(reverseTeamReviews select 형태)
            { sourceId: 'tm1', reviewerTeamId: 'team-x', targetTeamId: 'team-a' },
          ]);

        const prisma = {
          v1PostEventReview: { findMany: reviewFindManyMock },
          v1TeamMembership: {
            findMany: jest.fn().mockResolvedValue([{ teamId: 'team-a' }]),
          },
        };
        const tournamentFixtureReviews = {
          pending: jest.fn(),
          source: jest.fn(),
          submit: jest.fn(),
          sourceSummaries: jest.fn(),
        };
        const service = new ReviewsService(prisma as never, tournamentFixtureReviews as never);

        const result = await service.receivedSummary(
          { id: 'user-p', email: 'user-p@teameet.v1', accountStatus: 'active', onboardingStatus: 'completed' },
          { targetType: 'team' },
        );

        expect(result.bySport).toEqual([
          { sportId: 'futsal', ratingAvg: 5, ratingCount: 1, tagRates: [] },
        ]);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
