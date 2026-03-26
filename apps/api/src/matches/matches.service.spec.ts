import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { MatchesService } from './matches.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MatchesService', () => {
  let service: MatchesService;
  let prisma: PrismaService;

  const mockPrismaService = {
    match: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    matchParticipant: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<MatchesService>(MatchesService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    const mockMatches = [
      {
        id: 'match-1',
        title: '주말 풋살',
        sportType: 'futsal',
        status: 'recruiting',
        matchDate: new Date('2026-04-01'),
        venue: { id: 'v1', name: '서울 풋살장', city: '서울', district: '강남구' },
        host: { id: 'u1', nickname: '호스트', profileImageUrl: null },
      },
      {
        id: 'match-2',
        title: '농구 한 판',
        sportType: 'basketball',
        status: 'recruiting',
        matchDate: new Date('2026-04-02'),
        venue: { id: 'v2', name: '부산 체육관', city: '부산', district: '해운대구' },
        host: { id: 'u2', nickname: '농구왕', profileImageUrl: null },
      },
    ];

    it('should return paginated matches with default limit', async () => {
      mockPrismaService.match.findMany.mockResolvedValue(mockMatches);

      const result = await service.findAll({});

      expect(result).toEqual({
        items: mockMatches,
        nextCursor: null,
      });
      expect(prisma.match.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 21, // default limit(20) + 1
          orderBy: { matchDate: 'asc' },
        }),
      );
    });

    it('should return nextCursor when there are more results', async () => {
      // Simulate more results than limit by creating limit+1 items
      const manyMatches = Array.from({ length: 6 }, (_, i) => ({
        id: `match-${i}`,
        title: `매치 ${i}`,
        sportType: 'futsal',
        status: 'recruiting',
        matchDate: new Date('2026-04-01'),
        venue: { id: 'v1', name: '시설', city: '서울', district: '강남' },
        host: { id: 'u1', nickname: '호스트', profileImageUrl: null },
      }));
      mockPrismaService.match.findMany.mockResolvedValue(manyMatches);

      const result = await service.findAll({ limit: 5 });

      expect(result.items).toHaveLength(5);
      expect(result.nextCursor).toBe('match-4');
    });

    it('should filter by sportType', async () => {
      mockPrismaService.match.findMany.mockResolvedValue([mockMatches[0]]);

      await service.findAll({ sportType: 'futsal' });

      expect(prisma.match.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sportType: 'futsal',
          }),
        }),
      );
    });

    it('should filter by city via venue relation', async () => {
      mockPrismaService.match.findMany.mockResolvedValue([mockMatches[0]]);

      await service.findAll({ city: '서울' });

      expect(prisma.match.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            venue: { city: '서울' },
          }),
        }),
      );
    });

    it('should use cursor-based pagination when cursor provided', async () => {
      mockPrismaService.match.findMany.mockResolvedValue([mockMatches[1]]);

      await service.findAll({ cursor: 'match-1', limit: 10 });

      expect(prisma.match.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'match-1' },
          skip: 1,
          take: 11,
        }),
      );
    });
  });

  describe('findOne', () => {
    const mockMatchDetail = {
      id: 'match-1',
      title: '주말 풋살',
      sportType: 'futsal',
      status: 'recruiting',
      venue: { id: 'v1', name: '서울 풋살장' },
      host: {
        id: 'u1',
        nickname: '호스트',
        profileImageUrl: null,
        mannerScore: 4.5,
      },
      participants: [
        {
          id: 'p1',
          user: { id: 'u1', nickname: '호스트', profileImageUrl: null },
        },
      ],
      teams: [],
    };

    it('should return match with participants', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(mockMatchDetail);

      const result = await service.findOne('match-1');

      expect(result).toEqual(mockMatchDetail);
      expect(prisma.match.findUnique).toHaveBeenCalledWith({
        where: { id: 'match-1' },
        include: {
          venue: true,
          host: {
            select: {
              id: true,
              nickname: true,
              profileImageUrl: true,
              mannerScore: true,
            },
          },
          participants: {
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
          teams: true,
        },
      });
    });

    it('should throw NotFoundException when match does not exist', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne('non-existent')).rejects.toThrow(
        '매치를 찾을 수 없습니다.',
      );
    });
  });

  describe('create', () => {
    const createDto = {
      title: '주말 풋살',
      sportType: 'futsal',
      venueId: 'venue-1',
      matchDate: '2026-04-05',
      startTime: '18:00',
      endTime: '20:00',
      maxPlayers: 10,
      fee: 15000,
    };

    const createdMatch = {
      id: 'match-new',
      hostId: 'user-1',
      title: '주말 풋살',
      sportType: 'futsal',
      venueId: 'venue-1',
      matchDate: new Date('2026-04-05'),
      startTime: '18:00',
      endTime: '20:00',
      maxPlayers: 10,
      fee: 15000,
      levelMin: 1,
      levelMax: 5,
      gender: 'any',
      currentPlayers: 1,
    };

    it('should create a new match and add host as participant', async () => {
      mockPrismaService.match.create.mockResolvedValue(createdMatch);
      mockPrismaService.matchParticipant.create.mockResolvedValue({
        id: 'p1',
        matchId: 'match-new',
        userId: 'user-1',
        status: 'confirmed',
        paymentStatus: 'completed',
      });

      const result = await service.create('user-1', createDto);

      expect(result).toEqual(createdMatch);
      expect(prisma.match.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hostId: 'user-1',
          title: '주말 풋살',
          sportType: 'futsal',
          venueId: 'venue-1',
          maxPlayers: 10,
          fee: 15000,
          currentPlayers: 1,
        }),
      });
      expect(prisma.matchParticipant.create).toHaveBeenCalledWith({
        data: {
          matchId: 'match-new',
          userId: 'user-1',
          status: 'confirmed',
          paymentStatus: 'completed',
        },
      });
    });

    it('should use default values for optional fields', async () => {
      const minimalDto = {
        title: '농구 게임',
        sportType: 'basketball',
        venueId: 'venue-2',
        matchDate: '2026-04-06',
        startTime: '10:00',
        endTime: '12:00',
        maxPlayers: 10,
      };

      mockPrismaService.match.create.mockResolvedValue({
        id: 'match-2',
        ...minimalDto,
      });
      mockPrismaService.matchParticipant.create.mockResolvedValue({});

      await service.create('user-1', minimalDto);

      expect(prisma.match.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fee: 0,
          levelMin: 1,
          levelMax: 5,
          gender: 'any',
        }),
      });
    });
  });

  describe('join', () => {
    const mockMatch = {
      id: 'match-1',
      status: 'recruiting',
      currentPlayers: 3,
      maxPlayers: 10,
      fee: 15000,
      hostId: 'host-user',
    };

    it('should add participant to the match', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(mockMatch);
      mockPrismaService.matchParticipant.findUnique.mockResolvedValue(null);
      mockPrismaService.matchParticipant.create.mockResolvedValue({
        id: 'p-new',
        matchId: 'match-1',
        userId: 'user-2',
        status: 'pending',
        paymentStatus: 'pending',
      });
      mockPrismaService.match.update.mockResolvedValue({});

      const result = await service.join('match-1', 'user-2');

      expect(result).toEqual(
        expect.objectContaining({
          matchId: 'match-1',
          userId: 'user-2',
          status: 'pending',
          paymentStatus: 'pending',
        }),
      );

      expect(prisma.matchParticipant.create).toHaveBeenCalledWith({
        data: {
          matchId: 'match-1',
          userId: 'user-2',
          status: 'pending',
          paymentStatus: 'pending',
        },
      });

      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: 'match-1' },
        data: {
          currentPlayers: 4,
          status: 'recruiting',
        },
      });
    });

    it('should set paymentStatus to completed when fee is 0', async () => {
      const freeMatch = { ...mockMatch, fee: 0 };
      mockPrismaService.match.findUnique.mockResolvedValue(freeMatch);
      mockPrismaService.matchParticipant.findUnique.mockResolvedValue(null);
      mockPrismaService.matchParticipant.create.mockResolvedValue({
        id: 'p-new',
        matchId: 'match-1',
        userId: 'user-2',
        status: 'pending',
        paymentStatus: 'completed',
      });
      mockPrismaService.match.update.mockResolvedValue({});

      await service.join('match-1', 'user-2');

      expect(prisma.matchParticipant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          paymentStatus: 'completed',
        }),
      });
    });

    it('should update status to full when match reaches maxPlayers', async () => {
      const almostFullMatch = {
        ...mockMatch,
        currentPlayers: 9,
        maxPlayers: 10,
      };
      mockPrismaService.match.findUnique.mockResolvedValue(almostFullMatch);
      mockPrismaService.matchParticipant.findUnique.mockResolvedValue(null);
      mockPrismaService.matchParticipant.create.mockResolvedValue({
        id: 'p-new',
        matchId: 'match-1',
        userId: 'user-10',
        status: 'pending',
        paymentStatus: 'pending',
      });
      mockPrismaService.match.update.mockResolvedValue({});

      await service.join('match-1', 'user-10');

      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: 'match-1' },
        data: {
          currentPlayers: 10,
          status: 'full',
        },
      });
    });

    it('should throw BadRequestException when match is full', async () => {
      const fullMatch = {
        ...mockMatch,
        currentPlayers: 10,
        maxPlayers: 10,
      };
      mockPrismaService.match.findUnique.mockResolvedValue(fullMatch);

      await expect(service.join('match-1', 'user-new')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.join('match-1', 'user-new')).rejects.toThrow(
        '정원이 가득 찼습니다.',
      );
    });

    it('should throw BadRequestException when match is not recruiting', async () => {
      const completedMatch = { ...mockMatch, status: 'completed' };
      mockPrismaService.match.findUnique.mockResolvedValue(completedMatch);

      await expect(service.join('match-1', 'user-new')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.join('match-1', 'user-new')).rejects.toThrow(
        '모집 중인 매치가 아닙니다.',
      );
    });

    it('should throw NotFoundException when match does not exist', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(null);

      await expect(service.join('non-existent', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when user already joined', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(mockMatch);
      mockPrismaService.matchParticipant.findUnique.mockResolvedValue({
        id: 'existing',
        matchId: 'match-1',
        userId: 'user-2',
      });

      await expect(service.join('match-1', 'user-2')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.join('match-1', 'user-2')).rejects.toThrow(
        '이미 참가한 매치입니다.',
      );
    });
  });

  describe('leave', () => {
    const mockMatch = {
      id: 'match-1',
      hostId: 'host-user',
      status: 'recruiting',
      currentPlayers: 5,
      maxPlayers: 10,
    };

    it('should remove participant and decrement player count', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(mockMatch);
      mockPrismaService.matchParticipant.delete.mockResolvedValue({});
      mockPrismaService.match.update.mockResolvedValue({});

      const result = await service.leave('match-1', 'user-2');

      expect(result).toEqual({ message: '매치에서 탈퇴했습니다.' });

      expect(prisma.matchParticipant.delete).toHaveBeenCalledWith({
        where: { matchId_userId: { matchId: 'match-1', userId: 'user-2' } },
      });

      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: 'match-1' },
        data: {
          currentPlayers: { decrement: 1 },
          status: 'recruiting',
        },
      });
    });

    it('should throw ForbiddenException when host tries to leave', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(mockMatch);

      await expect(service.leave('match-1', 'host-user')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.leave('match-1', 'host-user')).rejects.toThrow(
        '호스트는 매치를 떠날 수 없습니다.',
      );
    });

    it('should throw NotFoundException when match does not exist', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(null);

      await expect(service.leave('non-existent', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
