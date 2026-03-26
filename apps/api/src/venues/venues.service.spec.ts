import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { VenuesService } from './venues.service';
import { PrismaService } from '../prisma/prisma.service';

describe('VenuesService', () => {
  let service: VenuesService;
  let prisma: PrismaService;

  const mockPrismaService = {
    venue: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    venueReview: {
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    match: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VenuesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<VenuesService>(VenuesService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    const mockVenues = [
      {
        id: 'venue-1',
        name: '서울 풋살파크',
        city: '서울',
        district: '강남구',
        sportTypes: ['futsal'],
        rating: 4.5,
        reviewCount: 10,
      },
      {
        id: 'venue-2',
        name: '부산 체육관',
        city: '부산',
        district: '해운대구',
        sportTypes: ['basketball', 'badminton'],
        rating: 4.2,
        reviewCount: 8,
      },
    ];

    it('should return all venues with no filter', async () => {
      mockPrismaService.venue.findMany.mockResolvedValue(mockVenues);

      const result = await service.findAll({});

      expect(result).toEqual(mockVenues);
      expect(prisma.venue.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { rating: 'desc' },
      });
    });

    it('should filter venues by sportType', async () => {
      const futsalVenues = [mockVenues[0]];
      mockPrismaService.venue.findMany.mockResolvedValue(futsalVenues);

      const result = await service.findAll({ sportType: 'futsal' });

      expect(result).toEqual(futsalVenues);
      expect(prisma.venue.findMany).toHaveBeenCalledWith({
        where: { sportTypes: { has: 'futsal' } },
        orderBy: { rating: 'desc' },
      });
    });

    it('should filter venues by city', async () => {
      const seoulVenues = [mockVenues[0]];
      mockPrismaService.venue.findMany.mockResolvedValue(seoulVenues);

      const result = await service.findAll({ city: '서울' });

      expect(result).toEqual(seoulVenues);
      expect(prisma.venue.findMany).toHaveBeenCalledWith({
        where: { city: '서울' },
        orderBy: { rating: 'desc' },
      });
    });

    it('should filter venues by both city and sportType', async () => {
      mockPrismaService.venue.findMany.mockResolvedValue([mockVenues[0]]);

      const result = await service.findAll({
        city: '서울',
        sportType: 'futsal',
      });

      expect(result).toEqual([mockVenues[0]]);
      expect(prisma.venue.findMany).toHaveBeenCalledWith({
        where: { city: '서울', sportTypes: { has: 'futsal' } },
        orderBy: { rating: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    const mockVenueWithReviews = {
      id: 'venue-1',
      name: '서울 풋살파크',
      city: '서울',
      district: '강남구',
      rating: 4.5,
      venueReviews: [
        {
          id: 'review-1',
          rating: 5,
          comment: '시설 좋아요',
          user: {
            id: 'user-1',
            nickname: '축구왕',
            profileImageUrl: null,
          },
        },
        {
          id: 'review-2',
          rating: 4,
          comment: '깔끔합니다',
          user: {
            id: 'user-2',
            nickname: '운동맨',
            profileImageUrl: null,
          },
        },
      ],
    };

    it('should return a venue with reviews', async () => {
      mockPrismaService.venue.findUnique.mockResolvedValue(
        mockVenueWithReviews,
      );

      const result = await service.findOne('venue-1');

      expect(result).toEqual(mockVenueWithReviews);
      expect(prisma.venue.findUnique).toHaveBeenCalledWith({
        where: { id: 'venue-1' },
        include: {
          venueReviews: {
            include: {
              user: {
                select: {
                  id: true,
                  nickname: true,
                  profileImageUrl: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });
    });

    it('should throw NotFoundException when venue does not exist', async () => {
      mockPrismaService.venue.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        '시설을 찾을 수 없습니다.',
      );
    });
  });

  describe('createReview', () => {
    const mockReview = {
      id: 'review-1',
      venueId: 'venue-1',
      userId: 'user-1',
      rating: 4,
      facilityRating: 5,
      accessRating: 3,
      costRating: 4,
      iceQuality: undefined,
      comment: '좋은 시설입니다',
      imageUrls: [],
    };

    it('should create a review and update venue rating', async () => {
      mockPrismaService.venueReview.create.mockResolvedValue(mockReview);
      mockPrismaService.venueReview.aggregate.mockResolvedValue({
        _avg: { rating: 4.3 },
        _count: 5,
      });
      mockPrismaService.venue.update.mockResolvedValue({});

      const reviewData = {
        rating: 4,
        facilityRating: 5,
        accessRating: 3,
        costRating: 4,
        comment: '좋은 시설입니다',
      };

      const result = await service.createReview(
        'venue-1',
        'user-1',
        reviewData,
      );

      expect(result).toEqual(mockReview);

      expect(prisma.venueReview.create).toHaveBeenCalledWith({
        data: {
          venueId: 'venue-1',
          userId: 'user-1',
          rating: 4,
          facilityRating: 5,
          accessRating: 3,
          costRating: 4,
          iceQuality: undefined,
          comment: '좋은 시설입니다',
          imageUrls: [],
        },
      });

      expect(prisma.venueReview.aggregate).toHaveBeenCalledWith({
        where: { venueId: 'venue-1' },
        _avg: { rating: true },
        _count: true,
      });

      expect(prisma.venue.update).toHaveBeenCalledWith({
        where: { id: 'venue-1' },
        data: {
          rating: 4.3,
          reviewCount: 5,
        },
      });
    });

    it('should handle review with image URLs', async () => {
      const reviewWithImages = {
        ...mockReview,
        imageUrls: ['https://img1.jpg', 'https://img2.jpg'],
      };
      mockPrismaService.venueReview.create.mockResolvedValue(reviewWithImages);
      mockPrismaService.venueReview.aggregate.mockResolvedValue({
        _avg: { rating: 4.0 },
        _count: 1,
      });
      mockPrismaService.venue.update.mockResolvedValue({});

      const reviewData = {
        rating: 4,
        facilityRating: 5,
        accessRating: 3,
        costRating: 4,
        imageUrls: ['https://img1.jpg', 'https://img2.jpg'],
      };

      const result = await service.createReview(
        'venue-1',
        'user-1',
        reviewData,
      );

      expect(result).toEqual(reviewWithImages);
      expect(prisma.venueReview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            imageUrls: ['https://img1.jpg', 'https://img2.jpg'],
          }),
        }),
      );
    });

    it('should set rating to 0 when aggregate avg is null', async () => {
      mockPrismaService.venueReview.create.mockResolvedValue(mockReview);
      mockPrismaService.venueReview.aggregate.mockResolvedValue({
        _avg: { rating: null },
        _count: 0,
      });
      mockPrismaService.venue.update.mockResolvedValue({});

      await service.createReview('venue-1', 'user-1', {
        rating: 4,
        facilityRating: 5,
        accessRating: 3,
        costRating: 4,
      });

      expect(prisma.venue.update).toHaveBeenCalledWith({
        where: { id: 'venue-1' },
        data: {
          rating: 0,
          reviewCount: 0,
        },
      });
    });
  });
});
