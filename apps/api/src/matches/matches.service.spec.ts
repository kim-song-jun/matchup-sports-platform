import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { MatchesService, computeParticipantHash } from './matches.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MatchingEngineService } from './matching-engine.service';
import { BadgesService } from '../badges/badges.service';
import { TeamBalancingService } from './team-balancing.service';
import { SportType } from '@prisma/client';

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
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    userSportProfile: {
      findMany: jest.fn(),
    },
    team: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockNotificationsService = {
    create: jest.fn(),
  };

  const mockMatchingEngineService = {
    calculateMatchScore: jest.fn().mockReturnValue(80),
    calculateReasons: jest.fn().mockReturnValue([
      { type: 'level', label: '내 레벨에 맞는 경기' },
    ]),
  };

  const mockBadgesService = {
    awardIfEligible: jest.fn().mockResolvedValue(false),
  };

  const mockTeamBalancingService = {
    balance: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: MatchingEngineService, useValue: mockMatchingEngineService },
        { provide: BadgesService, useValue: mockBadgesService },
        { provide: TeamBalancingService, useValue: mockTeamBalancingService },
      ],
    }).compile();

    service = module.get<MatchesService>(MatchesService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
    mockNotificationsService.create.mockResolvedValue({});
    mockBadgesService.awardIfEligible.mockResolvedValue(false);
    mockPrismaService.matchParticipant.findMany.mockResolvedValue([]);
    mockMatchingEngineService.calculateMatchScore.mockReturnValue(80);
    mockMatchingEngineService.calculateReasons.mockReturnValue([
      { type: 'level', label: '내 레벨에 맞는 경기' },
    ]);
    mockTeamBalancingService.balance.mockReturnValue({
      teams: [],
      metrics: { maxEloGap: 0, variance: 0, stdDev: 0, teamAvgElos: [], coldStartCount: 0 },
      seed: 42,
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRecommended', () => {
    const candidateMatch = {
      id: 'match-1',
      hostId: 'host-1',
      sportType: SportType.futsal,
      title: '주말 풋살',
      description: null,
      venueId: 'venue-1',
      matchDate: new Date(Date.now() + 86_400_000 * 2),
      startTime: '18:00',
      endTime: '20:00',
      maxPlayers: 10,
      currentPlayers: 5,
      fee: 0,
      levelMin: 1,
      levelMax: 5,
      gender: 'any',
      status: 'recruiting',
      teamConfig: null,
      createdAt: new Date(),
      venue: {
        id: 'venue-1',
        name: '서울 풋살장',
        city: '서울',
        district: '강남구',
        imageUrls: [],
        lat: 37.5,
        lng: 127.0,
      },
      host: { id: 'host-1', nickname: '호스트', profileImageUrl: null },
    };

    it('should return scored matches for authenticated user', async () => {
      mockPrismaService.match.findMany.mockResolvedValue([candidateMatch]);
      mockPrismaService.user.findUnique.mockResolvedValue({
        locationLat: 37.5,
        locationLng: 127.0,
        locationCity: '서울',
        locationDistrict: '강남구',
        sportTypes: [SportType.futsal],
      });
      mockPrismaService.userSportProfile.findMany.mockResolvedValue([
        { sportType: SportType.futsal, level: 3 },
      ]);

      const results = await service.getRecommended('user-1');

      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('score');
      expect(results[0]).toHaveProperty('reasons');
      expect(mockMatchingEngineService.calculateMatchScore).toHaveBeenCalledTimes(1);
      expect(mockMatchingEngineService.calculateReasons).toHaveBeenCalledTimes(1);
    });

    it('should return urgency-sorted matches for unauthenticated user (null userId)', async () => {
      const almostFullMatch = { ...candidateMatch, currentPlayers: 9, maxPlayers: 10 };
      const halfFullMatch = { ...candidateMatch, id: 'match-2', currentPlayers: 5, maxPlayers: 10 };
      mockPrismaService.match.findMany.mockResolvedValue([halfFullMatch, almostFullMatch]);

      const results = await service.getRecommended(null);

      expect(results).toHaveLength(2);
      // almost-full match should rank first
      expect(results[0].id).toBe('match-1'); // almostFullMatch was first in sorted order
    });

    it('should fall back gracefully when user is not found in DB', async () => {
      mockPrismaService.match.findMany.mockResolvedValue([candidateMatch]);
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.userSportProfile.findMany.mockResolvedValue([]);

      const results = await service.getRecommended('ghost-user');

      expect(results).toHaveLength(1);
      // No score/reasons when user not found
      expect(results[0]).not.toHaveProperty('score');
    });

    it('should return at most 10 matches', async () => {
      const manyMatches = Array.from({ length: 20 }, (_, i) => ({
        ...candidateMatch,
        id: `match-${i}`,
      }));
      mockPrismaService.match.findMany.mockResolvedValue(manyMatches);
      mockPrismaService.user.findUnique.mockResolvedValue({
        locationLat: null,
        locationLng: null,
        locationCity: '서울',
        locationDistrict: '강남구',
        sportTypes: [SportType.futsal],
      });
      mockPrismaService.userSportProfile.findMany.mockResolvedValue([]);

      const results = await service.getRecommended('user-1');

      expect(results.length).toBeLessThanOrEqual(10);
    });
  });

  describe('findAll', () => {
    const mockMatches = [
      {
        id: 'match-1',
        title: '주말 풋살',
        sportType: SportType.futsal,
        status: 'recruiting',
        matchDate: new Date('2026-04-01'),
        venue: { id: 'v1', name: '서울 풋살장', city: '서울', district: '강남구' },
        host: { id: 'u1', nickname: '호스트', profileImageUrl: null },
      },
      {
        id: 'match-2',
        title: '농구 한 판',
        sportType: SportType.basketball,
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
          orderBy: [{ matchDate: 'asc' }, { startTime: 'asc' }],
        }),
      );
    });

    it('should return nextCursor when there are more results', async () => {
      // Simulate more results than limit by creating limit+1 items
      const manyMatches = Array.from({ length: 6 }, (_, i) => ({
        id: `match-${i}`,
        title: `매치 ${i}`,
        sportType: SportType.futsal,
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

      await service.findAll({ sportType: SportType.futsal });

      expect(prisma.match.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sportType: SportType.futsal,
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
            venue: { is: { city: { contains: '서울', mode: 'insensitive' } } },
          }),
        }),
      );
    });

    it('should filter by search query across title, description, and venue fields', async () => {
      mockPrismaService.match.findMany.mockResolvedValue([mockMatches[0]]);

      await service.findAll({ q: '풋살' });

      expect(prisma.match.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { title: { contains: '풋살', mode: 'insensitive' } },
              { description: { contains: '풋살', mode: 'insensitive' } },
              { venue: { is: { name: { contains: '풋살', mode: 'insensitive' } } } },
              { venue: { is: { city: { contains: '풋살', mode: 'insensitive' } } } },
              { venue: { is: { district: { contains: '풋살', mode: 'insensitive' } } } },
            ]),
          }),
        }),
      );
    });

    it('should filter by district and recruiting availability', async () => {
      mockPrismaService.match.findMany.mockResolvedValue([mockMatches[0]]);

      await service.findAll({ district: '강남구', availableOnly: true });

      expect(prisma.match.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'recruiting',
            venue: { is: { district: { contains: '강남구', mode: 'insensitive' } } },
          }),
        }),
      );
    });

    it('should filter free matches and sort by deadline when requested', async () => {
      mockPrismaService.match.findMany.mockResolvedValue([mockMatches[0]]);

      await service.findAll({ freeOnly: true, sort: 'deadline' });

      expect(prisma.match.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            fee: 0,
          }),
          orderBy: [
            { currentPlayers: 'desc' },
            { maxPlayers: 'asc' },
            { matchDate: 'asc' },
            { startTime: 'asc' },
          ],
        }),
      );
    });

    it('should filter beginner friendly matches via level ceiling', async () => {
      mockPrismaService.match.findMany.mockResolvedValue([mockMatches[0]]);

      await service.findAll({ beginnerFriendly: true });

      expect(prisma.match.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            levelMax: { lte: 2 },
          }),
        }),
      );
    });

    it('should sort by latest when requested', async () => {
      mockPrismaService.match.findMany.mockResolvedValue([mockMatches[0]]);

      await service.findAll({ sort: 'latest' });

      expect(prisma.match.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'desc' }],
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
      sportType: SportType.futsal,
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
      expect(prisma.match.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'match-1' },
          select: expect.objectContaining({
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
          }),
        }),
      );
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
      sportType: SportType.futsal,
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
      sportType: SportType.futsal,
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
      expect(prisma.match.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hostId: 'user-1',
            title: '주말 풋살',
            sportType: SportType.futsal,
            venueId: 'venue-1',
            maxPlayers: 10,
            fee: 15000,
            currentPlayers: 1,
          }),
          select: expect.objectContaining({
            id: true,
            title: true,
            sportType: true,
            status: true,
          }),
        }),
      );
      expect(prisma.matchParticipant.create).toHaveBeenCalledWith({
        data: {
          matchId: 'match-new',
          userId: 'user-1',
          status: 'confirmed',
          paymentStatus: 'completed',
        },
      });
      expect(mockNotificationsService.create).toHaveBeenCalledWith({
        userId: 'user-1',
        type: 'match_created',
        title: '매치 등록 완료',
        body: '"주말 풋살" 매치를 등록했어요.',
        data: {
          matchId: 'match-new',
          sportType: SportType.futsal,
        },
      });
    });

    it('should use default values for optional fields', async () => {
      const minimalDto = {
        title: '농구 게임',
        sportType: SportType.basketball,
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

      expect(prisma.match.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fee: 0,
            levelMin: 1,
            levelMax: 5,
            gender: 'any',
          }),
          select: expect.objectContaining({
            id: true,
            title: true,
            sportType: true,
            status: true,
          }),
        }),
      );
    });
  });

  describe('join', () => {
    const mockMatch = {
      id: 'match-1',
      title: '주말 풋살',
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
        select: { id: true },
        data: {
          currentPlayers: 4,
          status: 'recruiting',
        },
      });
      expect(mockNotificationsService.create).toHaveBeenCalledWith({
        userId: 'host-user',
        type: 'player_joined',
        title: '새 참가 신청',
        body: '"주말 풋살" 매치에 새로운 참가 신청이 도착했어요.',
        data: {
          matchId: 'match-1',
          participantId: 'p-new',
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
        select: { id: true },
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

  describe('update', () => {
    const hostMatch = {
      id: 'match-1',
      hostId: 'host-1',
      title: '원본 매치',
      status: 'recruiting',
      currentPlayers: 4,
      maxPlayers: 10,
    };

    const updatedMatch = {
      ...hostMatch,
      title: '수정된 매치',
      maxPlayers: 12,
      status: 'recruiting',
    };

    it('should update editable fields for host', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(hostMatch);
      mockPrismaService.match.update.mockResolvedValue(updatedMatch);

      const result = await service.update('match-1', 'host-1', {
        title: '수정된 매치',
        maxPlayers: 12,
      });

      expect(result).toEqual(updatedMatch);
      expect(prisma.match.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'match-1' },
          data: expect.objectContaining({
            title: '수정된 매치',
            maxPlayers: 12,
            status: 'recruiting',
          }),
        }),
      );
    });

    it('should notify participants with match_reminder on update', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(hostMatch);
      mockPrismaService.match.update.mockResolvedValue(updatedMatch);
      mockPrismaService.matchParticipant.findMany.mockResolvedValue([
        { userId: 'user-3' },
      ]);

      await service.update('match-1', 'host-1', { title: '수정된 매치' });

      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-3',
          type: 'match_updated',
          title: '매치 정보가 수정되었어요',
        }),
      );
    });

    it('should reject update by non-host user', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(hostMatch);

      await expect(
        service.update('match-1', 'other-user', { title: '실패' }),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.update('match-1', 'other-user', { title: '실패' }),
      ).rejects.toThrow('호스트만 매치를 수정할 수 있습니다.');
    });

    it('should reject update when reducing maxPlayers below currentPlayers', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(hostMatch);

      await expect(
        service.update('match-1', 'host-1', { maxPlayers: 3 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update('match-1', 'host-1', { maxPlayers: 3 }),
      ).rejects.toThrow('현재 참가 인원보다 최대 인원을 낮출 수 없습니다.');
    });

    it('should reject update when match is completed', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue({
        ...hostMatch,
        status: 'completed',
      });

      await expect(
        service.update('match-1', 'host-1', { title: '변경' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update('match-1', 'host-1', { title: '변경' }),
      ).rejects.toThrow('종료된 매치는 수정할 수 없습니다.');
    });

    it('should reject update when match is cancelled', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue({
        ...hostMatch,
        status: 'cancelled',
      });

      await expect(
        service.update('match-1', 'host-1', { title: '변경' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update('match-1', 'host-1', { title: '변경' }),
      ).rejects.toThrow('종료된 매치는 수정할 수 없습니다.');
    });

    it('should reject update when match is in_progress', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue({
        ...hostMatch,
        status: 'in_progress',
      });

      await expect(
        service.update('match-1', 'host-1', { title: '변경' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update('match-1', 'host-1', { title: '변경' }),
      ).rejects.toThrow('진행 중인 매치는 수정할 수 없습니다.');
    });

    it('should resolve status to full when currentPlayers meets nextMaxPlayers', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue({
        ...hostMatch,
        currentPlayers: 4,
        maxPlayers: 6,
        status: 'recruiting',
      });
      mockPrismaService.match.update.mockResolvedValue({
        ...hostMatch,
        maxPlayers: 4,
        status: 'full',
      });

      await service.update('match-1', 'host-1', { maxPlayers: 4 });

      expect(prisma.match.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            maxPlayers: 4,
            status: 'full',
          }),
        }),
      );
    });
  });

  describe('cancelMatch', () => {
    const hostMatch = {
      id: 'match-1',
      hostId: 'host-1',
      title: '원본 매치',
      status: 'recruiting',
    };

    it('should cancel a recruiting match and notify participants', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(hostMatch);
      mockPrismaService.match.update.mockResolvedValue({
        ...hostMatch,
        status: 'cancelled',
      });
      mockPrismaService.matchParticipant.findMany.mockResolvedValue([
        { userId: 'user-3' },
      ]);

      await service.cancelMatch('match-1', 'host-1');

      expect(prisma.match.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'match-1' },
          data: { status: 'cancelled' },
        }),
      );
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-3',
          type: 'match_cancelled',
          title: '매치가 취소되었어요',
        }),
      );
    });

    it('should include reason in notification body when provided', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(hostMatch);
      mockPrismaService.match.update.mockResolvedValue({
        ...hostMatch,
        status: 'cancelled',
      });
      mockPrismaService.matchParticipant.findMany.mockResolvedValue([
        { userId: 'user-3' },
      ]);

      await service.cancelMatch('match-1', 'host-1', { reason: '비 예보로 취소' });

      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('비 예보로 취소'),
        }),
      );
    });

    it('should throw ForbiddenException when non-host cancels', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(hostMatch);

      await expect(
        service.cancelMatch('match-1', 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when match is already cancelled', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue({
        ...hostMatch,
        status: 'cancelled',
      });

      await expect(
        service.cancelMatch('match-1', 'host-1'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.cancelMatch('match-1', 'host-1'),
      ).rejects.toThrow('이미 종료된 매치입니다.');
    });

    it('should throw BadRequestException when match is already completed', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue({
        ...hostMatch,
        status: 'completed',
      });

      await expect(
        service.cancelMatch('match-1', 'host-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when match does not exist', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(null);

      await expect(
        service.cancelMatch('non-existent', 'host-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('closeMatch', () => {
    const hostMatch = {
      id: 'match-1',
      hostId: 'host-1',
      title: '원본 매치',
      status: 'recruiting',
    };

    it('should close recruiting — sets status to confirmed', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(hostMatch);
      mockPrismaService.match.update.mockResolvedValue({
        ...hostMatch,
        status: 'confirmed',
      });

      const result = await service.closeMatch('match-1', 'host-1');

      expect(prisma.match.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'match-1' },
          data: { status: 'confirmed' },
        }),
      );
      expect(result).toEqual(expect.objectContaining({ status: 'confirmed' }));
    });

    it('should throw ForbiddenException when non-host closes', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(hostMatch);

      await expect(
        service.closeMatch('match-1', 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when match is not recruiting', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue({
        ...hostMatch,
        status: 'full',
      });

      await expect(
        service.closeMatch('match-1', 'host-1'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.closeMatch('match-1', 'host-1'),
      ).rejects.toThrow('모집 중인 매치만 마감할 수 있습니다.');
    });

    it('should throw NotFoundException when match does not exist', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(null);

      await expect(
        service.closeMatch('non-existent', 'host-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('leave', () => {
    const mockMatch = {
      id: 'match-1',
      hostId: 'host-user',
      title: '주말 풋살',
      status: 'recruiting',
      currentPlayers: 5,
      maxPlayers: 10,
    };

    it('should remove participant, decrement player count, and notify host', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(mockMatch);
      mockPrismaService.matchParticipant.findUnique.mockResolvedValue({
        id: 'participant-1',
      });
      mockPrismaService.matchParticipant.delete.mockResolvedValue({});
      mockPrismaService.match.update.mockResolvedValue({});

      const result = await service.leave('match-1', 'user-2');

      expect(result).toEqual({ message: '매치에서 탈퇴했습니다.' });
      expect(prisma.matchParticipant.delete).toHaveBeenCalledWith({
        where: { matchId_userId: { matchId: 'match-1', userId: 'user-2' } },
      });
      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: 'match-1' },
        select: { id: true },
        data: {
          currentPlayers: 4,
          status: 'recruiting',
        },
      });
      expect(mockNotificationsService.create).toHaveBeenCalledWith({
        userId: 'host-user',
        type: 'player_left',
        title: '참가자가 나갔어요',
        body: '"주말 풋살" 매치에서 참가 취소가 발생했어요.',
        data: {
          matchId: 'match-1',
        },
      });
    });

    it('should preserve manually closed full status on leave', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue({
        ...mockMatch,
        status: 'full',
        currentPlayers: 6,
        maxPlayers: 8,
      });
      mockPrismaService.matchParticipant.findUnique.mockResolvedValue({
        id: 'participant-1',
      });
      mockPrismaService.matchParticipant.delete.mockResolvedValue({});
      mockPrismaService.match.update.mockResolvedValue({});

      await service.leave('match-1', 'user-2');

      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: 'match-1' },
        select: { id: true },
        data: {
          currentPlayers: 5,
          status: 'full',
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

    it('should reject leave for completed match', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue({
        ...mockMatch,
        status: 'completed',
      });

      await expect(service.leave('match-1', 'user-2')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.leave('match-1', 'user-2')).rejects.toThrow(
        '종료된 매치에서는 탈퇴할 수 없습니다.',
      );
    });

    it('should reject leave for in-progress match', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue({
        ...mockMatch,
        status: 'in_progress',
      });

      await expect(service.leave('match-1', 'user-2')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.leave('match-1', 'user-2')).rejects.toThrow(
        '진행 중인 매치에서는 탈퇴할 수 없습니다.',
      );
    });

    it('should reject leave when user is not a participant', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(mockMatch);
      mockPrismaService.matchParticipant.findUnique.mockResolvedValue(null);

      await expect(service.leave('match-1', 'user-2')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.leave('match-1', 'user-2')).rejects.toThrow(
        '참가 중인 매치가 아닙니다.',
      );
    });
  });

  describe('complete', () => {
    const hostMatch = {
      id: 'match-1',
      hostId: 'host-1',
      title: '주말 매치',
      status: 'recruiting',
    };

    it('should complete the match and notify participants', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(hostMatch);
      mockPrismaService.match.update.mockResolvedValue({
        ...hostMatch,
        status: 'completed',
      });
      mockPrismaService.matchParticipant.findMany.mockResolvedValue([
        { userId: 'user-3' },
      ]);

      await service.complete('match-1', 'host-1');

      expect(prisma.match.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'match-1' },
          data: { status: 'completed' },
        }),
      );
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-3',
          type: 'match_completed',
          title: '매치가 종료되었어요',
        }),
      );
    });

    it('should also fan-out review_pending to all participants after completion', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(hostMatch);
      mockPrismaService.match.update.mockResolvedValue({ ...hostMatch, status: 'completed' });
      mockPrismaService.matchParticipant.findMany.mockResolvedValue([
        { userId: 'user-3' },
        { userId: 'user-4' },
      ]);

      await service.complete('match-1', 'host-1');

      // 2 participants × 2 notification types = 4 calls total
      expect(mockNotificationsService.create).toHaveBeenCalledTimes(4);
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'review_pending' }),
      );
    });

    it('should call awardIfEligible for each participant after completion', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(hostMatch);
      mockPrismaService.match.update.mockResolvedValue({ ...hostMatch, status: 'completed' });
      mockPrismaService.matchParticipant.findMany.mockResolvedValue([
        { userId: 'user-3' },
      ]);

      await service.complete('match-1', 'host-1');
      // Allow fire-and-forget badge awards to settle
      await new Promise((r) => setImmediate(r));

      expect(mockBadgesService.awardIfEligible).toHaveBeenCalledWith(
        'user-3',
        'first_match_completed',
        expect.any(Object),
      );
    });

    it('should throw ForbiddenException when non-host completes', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(hostMatch);

      await expect(service.complete('match-1', 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException when match is already completed', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue({
        ...hostMatch,
        status: 'completed',
      });

      await expect(service.complete('match-1', 'host-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when match does not exist', async () => {
      mockPrismaService.match.findUnique.mockResolvedValue(null);

      await expect(service.complete('non-existent', 'host-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── computeParticipantHash helper ────────────────────────────────────────

  describe('computeParticipantHash', () => {
    it('returns a 64-char lowercase hex string', () => {
      const hash = computeParticipantHash([{ userId: 'user-a' }, { userId: 'user-b' }]);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('is deterministic for the same participant set', () => {
      const participants = [{ userId: 'user-a' }, { userId: 'user-b' }, { userId: 'user-c' }];
      expect(computeParticipantHash(participants)).toBe(computeParticipantHash(participants));
    });

    it('produces different hashes for different participant sets', () => {
      const hashA = computeParticipantHash([{ userId: 'user-a' }, { userId: 'user-b' }]);
      const hashB = computeParticipantHash([{ userId: 'user-a' }, { userId: 'user-x' }]);
      expect(hashA).not.toBe(hashB);
    });

    it('is order-independent: same userId set in different order yields same hash', () => {
      const hashAB = computeParticipantHash([{ userId: 'user-a' }, { userId: 'user-b' }]);
      const hashBA = computeParticipantHash([{ userId: 'user-b' }, { userId: 'user-a' }]);
      expect(hashAB).toBe(hashBA);
    });
  });

  // ─── previewTeams ──────────────────────────────────────────────────────────

  describe('previewTeams', () => {
    const eligibleMatch = {
      id: 'match-1',
      hostId: 'host-1',
      sportType: SportType.futsal,
      status: 'recruiting',
      teamConfig: null,
    };

    const mockParticipants = [
      {
        id: 'p1',
        userId: 'user-a',
        user: { id: 'user-a', nickname: 'A', profileImageUrl: null },
      },
      {
        id: 'p2',
        userId: 'user-b',
        user: { id: 'user-b', nickname: 'B', profileImageUrl: null },
      },
    ];

    const mockDistribution = {
      teams: [
        {
          index: 0,
          name: 'A팀',
          color: '#FF0000',
          avgElo: 1000,
          members: [{ participantId: 'p1', userId: 'user-a', nickname: 'A', profileImageUrl: null, eloRating: 1000, hasProfile: false }],
        },
        {
          index: 1,
          name: 'B팀',
          color: '#0000FF',
          avgElo: 1000,
          members: [{ participantId: 'p2', userId: 'user-b', nickname: 'B', profileImageUrl: null, eloRating: 1000, hasProfile: false }],
        },
      ],
      metrics: { maxEloGap: 0, variance: 0, stdDev: 0, teamAvgElos: [1000, 1000], coldStartCount: 2 },
      seed: 42,
    };

    beforeEach(() => {
      mockPrismaService.match.findUnique.mockResolvedValue(eligibleMatch);
      mockPrismaService.matchParticipant.findMany.mockResolvedValue(mockParticipants);
      mockPrismaService.userSportProfile.findMany.mockResolvedValue([]);
      mockTeamBalancingService.balance.mockReturnValue(mockDistribution);
    });

    it('returns participantHash as a 64-char hex string', async () => {
      const result = await service.previewTeams('match-1', 'host-1', {});
      expect(result).toHaveProperty('participantHash');
      expect(result.participantHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('returns the same participantHash for the same participant set on repeated calls', async () => {
      const r1 = await service.previewTeams('match-1', 'host-1', {});
      const r2 = await service.previewTeams('match-1', 'host-1', {});
      expect(r1.participantHash).toBe(r2.participantHash);
    });

    it('returns a different participantHash when the participant set changes', async () => {
      const r1 = await service.previewTeams('match-1', 'host-1', {});

      // Simulate one participant leaving
      mockPrismaService.matchParticipant.findMany.mockResolvedValue([mockParticipants[0]]);
      const r2 = await service.previewTeams('match-1', 'host-1', {});

      expect(r1.participantHash).not.toBe(r2.participantHash);
    });

    it('hash is order-independent: different findMany return order yields same hash', async () => {
      const r1 = await service.previewTeams('match-1', 'host-1', {});

      // Reverse participant order in the mock
      mockPrismaService.matchParticipant.findMany.mockResolvedValue([...mockParticipants].reverse());
      const r2 = await service.previewTeams('match-1', 'host-1', {});

      expect(r1.participantHash).toBe(r2.participantHash);
    });

    it('includes teams and metrics from the balancing service alongside participantHash', async () => {
      const result = await service.previewTeams('match-1', 'host-1', {});
      expect(result.teams).toEqual(mockDistribution.teams);
      expect(result.metrics).toEqual(mockDistribution.metrics);
      expect(result.seed).toBe(mockDistribution.seed);
    });
  });

  // ─── generateTeams ─────────────────────────────────────────────────────────

  describe('generateTeams', () => {
    const eligibleMatch = {
      id: 'match-1',
      hostId: 'host-1',
      sportType: SportType.futsal,
      status: 'recruiting',
      teamConfig: null,
    };

    const mockParticipants = [
      {
        id: 'p1',
        userId: 'user-a',
        user: { id: 'user-a', nickname: 'A', profileImageUrl: null },
      },
      {
        id: 'p2',
        userId: 'user-b',
        user: { id: 'user-b', nickname: 'B', profileImageUrl: null },
      },
    ];

    const mockDistribution = {
      teams: [
        {
          index: 0,
          name: 'A팀',
          color: '#FF0000',
          avgElo: 1000,
          members: [{ participantId: 'p1', userId: 'user-a', nickname: 'A', profileImageUrl: null, eloRating: 1000, hasProfile: false }],
        },
        {
          index: 1,
          name: 'B팀',
          color: '#0000FF',
          avgElo: 1000,
          members: [{ participantId: 'p2', userId: 'user-b', nickname: 'B', profileImageUrl: null, eloRating: 1000, hasProfile: false }],
        },
      ],
      metrics: { maxEloGap: 0, variance: 0, stdDev: 0, teamAvgElos: [1000, 1000], coldStartCount: 2 },
      seed: 42,
    };

    const createdTeamA = { id: 'team-a' };
    const createdTeamB = { id: 'team-b' };

    // A txMock that simulates the transaction callbacks
    const txMock = {
      matchParticipant: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      team: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn()
          .mockResolvedValueOnce(createdTeamA)
          .mockResolvedValueOnce(createdTeamB),
      },
    };

    beforeEach(() => {
      mockPrismaService.match.findUnique.mockResolvedValue(eligibleMatch);
      mockPrismaService.matchParticipant.findMany.mockResolvedValue(mockParticipants);
      mockPrismaService.userSportProfile.findMany.mockResolvedValue([]);
      mockTeamBalancingService.balance.mockReturnValue(mockDistribution);
      txMock.team.create
        .mockResolvedValueOnce(createdTeamA)
        .mockResolvedValueOnce(createdTeamB);
      mockPrismaService.$transaction.mockImplementation(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock));
    });

    it('succeeds when a matching participantHash is provided', async () => {
      // Compute the hash that will match (user-a,user-b sorted)
      const validHash = computeParticipantHash(mockParticipants);
      await expect(service.generateTeams('match-1', 'host-1', { participantHash: validHash })).resolves.toBeDefined();
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException with PARTICIPANTS_CHANGED code when hash is stale', async () => {
      const staleHash = 'a'.repeat(64); // valid format but wrong content
      await expect(
        service.generateTeams('match-1', 'host-1', { participantHash: staleHash }),
      ).rejects.toThrow(ConflictException);

      try {
        await service.generateTeams('match-1', 'host-1', { participantHash: staleHash });
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const body = (err as ConflictException).getResponse();
        expect(body).toMatchObject({ code: 'PARTICIPANTS_CHANGED', message: '참가자가 변경되었어요' });
      }

      // Transaction must NOT be called when hash is stale
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('succeeds without participantHash and emits a legacy-client warn log', async () => {
      const warnSpy = jest.spyOn((service as unknown as { logger: { warn: jest.Mock } }).logger, 'warn');
      await expect(service.generateTeams('match-1', 'host-1', {})).resolves.toBeDefined();
      expect(warnSpy).toHaveBeenCalledWith(
        'generateTeams called without participantHash (legacy client)',
        { matchId: 'match-1' },
      );
      warnSpy.mockRestore();
    });

    it('does NOT call $transaction when hash check fails', async () => {
      const staleHash = 'b'.repeat(64);
      await expect(
        service.generateTeams('match-1', 'host-1', { participantHash: staleHash }),
      ).rejects.toThrow(ConflictException);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });
});
