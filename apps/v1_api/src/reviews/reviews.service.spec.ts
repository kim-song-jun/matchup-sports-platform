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
});
