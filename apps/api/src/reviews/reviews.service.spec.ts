import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsService } from './reviews.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    review: {
      create: jest.fn(),
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
    matchParticipant: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const reviewData = {
      matchId: 'match-1',
      targetId: 'user-2',
      skillRating: 4,
      mannerRating: 5,
      comment: '매너가 좋은 플레이어입니다.',
    };

    const createdReview = {
      id: 'review-1',
      matchId: 'match-1',
      authorId: 'user-1',
      targetId: 'user-2',
      skillRating: 4,
      mannerRating: 5,
      comment: '매너가 좋은 플레이어입니다.',
    };

    it('should create a review and update user manner score', async () => {
      mockPrismaService.review.create.mockResolvedValue(createdReview);
      mockPrismaService.review.aggregate.mockResolvedValue({
        _avg: { mannerRating: 4.5 },
      });
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.create('user-1', reviewData);

      expect(result).toEqual(createdReview);

      expect(prisma.review.create).toHaveBeenCalledWith({
        data: {
          matchId: 'match-1',
          authorId: 'user-1',
          targetId: 'user-2',
          skillRating: 4,
          mannerRating: 5,
          comment: '매너가 좋은 플레이어입니다.',
        },
      });

      expect(prisma.review.aggregate).toHaveBeenCalledWith({
        where: { targetId: 'user-2' },
        _avg: { mannerRating: true },
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-2' },
        data: { mannerScore: 4.5 },
      });
    });

    it('should create a review without comment', async () => {
      const dataWithoutComment = {
        matchId: 'match-1',
        targetId: 'user-2',
        skillRating: 3,
        mannerRating: 3,
      };

      const reviewNoComment = {
        id: 'review-2',
        matchId: 'match-1',
        authorId: 'user-1',
        targetId: 'user-2',
        skillRating: 3,
        mannerRating: 3,
        comment: undefined,
      };

      mockPrismaService.review.create.mockResolvedValue(reviewNoComment);
      mockPrismaService.review.aggregate.mockResolvedValue({
        _avg: { mannerRating: 3.0 },
      });
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.create('user-1', dataWithoutComment);

      expect(result).toEqual(reviewNoComment);
      expect(prisma.review.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          comment: undefined,
        }),
      });
    });

    it('should not update manner score when aggregate avg is null', async () => {
      mockPrismaService.review.create.mockResolvedValue(createdReview);
      mockPrismaService.review.aggregate.mockResolvedValue({
        _avg: { mannerRating: null },
      });

      await service.create('user-1', reviewData);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should handle duplicate review (Prisma unique constraint error)', async () => {
      const prismaUniqueError = Object.assign(
        new Error(
          'Unique constraint failed on the fields: (`matchId`,`authorId`,`targetId`)',
        ),
        { code: 'P2002' },
      );

      mockPrismaService.review.create.mockRejectedValue(prismaUniqueError);

      await expect(service.create('user-1', reviewData)).rejects.toThrow();
    });
  });

  describe('getPending', () => {
    it('should return unreviewed participants from completed matches', async () => {
      const completedParticipations = [
        {
          matchId: 'match-1',
          userId: 'user-1',
          match: {
            title: '주말 풋살',
            participants: [
              {
                userId: 'user-2',
                user: {
                  id: 'user-2',
                  nickname: '플레이어2',
                  profileImageUrl: null,
                },
              },
              {
                userId: 'user-3',
                user: {
                  id: 'user-3',
                  nickname: '플레이어3',
                  profileImageUrl: 'https://img.jpg',
                },
              },
            ],
          },
        },
      ];

      const existingReviews = [
        { matchId: 'match-1', targetId: 'user-2' },
      ];

      mockPrismaService.matchParticipant.findMany.mockResolvedValue(
        completedParticipations,
      );
      mockPrismaService.review.findMany.mockResolvedValue(existingReviews);

      const result = await service.getPending('user-1');

      // user-2 was already reviewed, only user-3 should remain
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        matchId: 'match-1',
        matchTitle: '주말 풋살',
        target: {
          id: 'user-3',
          nickname: '플레이어3',
          profileImageUrl: 'https://img.jpg',
        },
      });

      expect(prisma.matchParticipant.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          match: { status: 'completed' },
        },
        include: {
          match: {
            include: {
              participants: {
                where: { userId: { not: 'user-1' } },
                include: {
                  user: {
                    select: {
                      id: true,
                      nickname: true,
                      profileImageUrl: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      expect(prisma.review.findMany).toHaveBeenCalledWith({
        where: { authorId: 'user-1' },
        select: { matchId: true, targetId: true },
      });
    });

    it('should return empty array when all participants have been reviewed', async () => {
      const completedParticipations = [
        {
          matchId: 'match-1',
          userId: 'user-1',
          match: {
            title: '주말 풋살',
            participants: [
              {
                userId: 'user-2',
                user: {
                  id: 'user-2',
                  nickname: '플레이어2',
                  profileImageUrl: null,
                },
              },
            ],
          },
        },
      ];

      const existingReviews = [
        { matchId: 'match-1', targetId: 'user-2' },
      ];

      mockPrismaService.matchParticipant.findMany.mockResolvedValue(
        completedParticipations,
      );
      mockPrismaService.review.findMany.mockResolvedValue(existingReviews);

      const result = await service.getPending('user-1');

      expect(result).toHaveLength(0);
    });

    it('should return empty array when user has no completed matches', async () => {
      mockPrismaService.matchParticipant.findMany.mockResolvedValue([]);
      mockPrismaService.review.findMany.mockResolvedValue([]);

      const result = await service.getPending('user-1');

      expect(result).toEqual([]);
    });

    it('should handle multiple completed matches with pending reviews', async () => {
      const completedParticipations = [
        {
          matchId: 'match-1',
          userId: 'user-1',
          match: {
            title: '풋살 매치',
            participants: [
              {
                userId: 'user-2',
                user: {
                  id: 'user-2',
                  nickname: '플레이어2',
                  profileImageUrl: null,
                },
              },
            ],
          },
        },
        {
          matchId: 'match-2',
          userId: 'user-1',
          match: {
            title: '농구 매치',
            participants: [
              {
                userId: 'user-3',
                user: {
                  id: 'user-3',
                  nickname: '플레이어3',
                  profileImageUrl: null,
                },
              },
              {
                userId: 'user-4',
                user: {
                  id: 'user-4',
                  nickname: '플레이어4',
                  profileImageUrl: null,
                },
              },
            ],
          },
        },
      ];

      mockPrismaService.matchParticipant.findMany.mockResolvedValue(
        completedParticipations,
      );
      mockPrismaService.review.findMany.mockResolvedValue([]);

      const result = await service.getPending('user-1');

      // All 3 participants across 2 matches should be pending
      expect(result).toHaveLength(3);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            matchId: 'match-1',
            matchTitle: '풋살 매치',
            target: expect.objectContaining({ id: 'user-2' }),
          }),
          expect.objectContaining({
            matchId: 'match-2',
            matchTitle: '농구 매치',
            target: expect.objectContaining({ id: 'user-3' }),
          }),
          expect.objectContaining({
            matchId: 'match-2',
            matchTitle: '농구 매치',
            target: expect.objectContaining({ id: 'user-4' }),
          }),
        ]),
      );
    });
  });
});
