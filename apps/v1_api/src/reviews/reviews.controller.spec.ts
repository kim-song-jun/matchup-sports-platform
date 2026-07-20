import { Test } from '@nestjs/testing';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

const user = {
  id: 'user-1',
  email: 'reviewer@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

describe('ReviewsController', () => {
  const reviewsService = {
    list: jest.fn(),
    received: jest.fn(),
    receivedSummary: jest.fn(),
    source: jest.fn(),
    submit: jest.fn(),
  };

  let controller: ReviewsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [
        { provide: ReviewsService, useValue: reviewsService },
        { provide: PrismaService, useValue: {} },
        { provide: V1AuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = moduleRef.get(ReviewsController);
  });

  it('lists pending reviews', async () => {
    reviewsService.list.mockResolvedValue({
      items: [{ sourceType: 'match', sourceId: 'match-1', remainingCount: 2 }],
      pageInfo: { nextCursor: null, hasNext: false },
    });

    await expect(controller.list(user, { tab: 'pending', limit: 20 })).resolves.toEqual({
      items: [{ sourceType: 'match', sourceId: 'match-1', remainingCount: 2 }],
      pageInfo: { nextCursor: null, hasNext: false },
    });
    expect(reviewsService.list).toHaveBeenCalledWith(user, { tab: 'pending', limit: 20 });
  });

  it('lists received reviews', async () => {
    reviewsService.received.mockResolvedValue({
      items: [{ reviewId: 'review-1', targetType: 'team' }],
      pageInfo: { nextCursor: null, hasNext: false },
    });

    await expect(controller.received(user, { limit: 10 })).resolves.toEqual({
      items: [{ reviewId: 'review-1', targetType: 'team' }],
      pageInfo: { nextCursor: null, hasNext: false },
    });
  });

  it('GET /reviews/received/summary는 targetType 쿼리를 서비스로 그대로 전달한다', async () => {
    const summary = { bySport: [], availableMonths: [] };
    reviewsService.receivedSummary.mockResolvedValueOnce(summary);

    const result = await controller.receivedSummary(user, { targetType: 'user' });

    expect(reviewsService.receivedSummary).toHaveBeenCalledWith(user, { targetType: 'user' });
    expect(result).toBe(summary);
  });

  it('returns review source targets', async () => {
    const params = { sourceType: 'team_match' as const, sourceId: '00000000-0000-4000-8000-000000000001' };
    reviewsService.source.mockResolvedValue({
      source: params,
      reviewerTeam: { teamId: 'team-1', name: '성수 FC', role: 'owner' },
      targets: [{ targetType: 'team', targetTeamId: 'team-2' }],
    });

    await expect(controller.source(user, params)).resolves.toEqual({
      source: params,
      reviewerTeam: { teamId: 'team-1', name: '성수 FC', role: 'owner' },
      targets: [{ targetType: 'team', targetTeamId: 'team-2' }],
    });
  });

  it('submits a review', async () => {
    const dto = {
      sourceType: 'match' as const,
      sourceId: '00000000-0000-4000-8000-000000000001',
      targetType: 'user' as const,
      targetUserId: '00000000-0000-4000-8000-000000000002',
      rating: 5,
      tagCodes: ['manner', 'teamwork'],
    };
    reviewsService.submit.mockResolvedValue({
      review: { reviewId: 'review-1', rating: 5 },
      alreadySubmitted: false,
    });

    await expect(controller.submit(user, dto)).resolves.toEqual({
      review: { reviewId: 'review-1', rating: 5 },
      alreadySubmitted: false,
    });
    expect(reviewsService.submit).toHaveBeenCalledWith(user, dto);
  });
});
