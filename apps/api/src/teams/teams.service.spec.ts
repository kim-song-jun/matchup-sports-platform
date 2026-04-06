import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TeamsService', () => {
  let service: TeamsService;
  let prisma: PrismaService;

  // $transaction mock: executes the callback with the same mock object
  const mockTx = {
    sportTeam: { create: jest.fn() },
    teamMembership: { create: jest.fn() },
  };

  const mockPrismaService = {
    sportTeam: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    teamMembership: {
      create: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    const mockTeams = [
      {
        id: 'team-1',
        name: 'FC 서울',
        sportType: 'FUTSAL',
        city: '서울',
        isRecruiting: true,
        createdAt: new Date('2026-03-01'),
        owner: { id: 'u1', nickname: '팀장1', profileImageUrl: null },
      },
      {
        id: 'team-2',
        name: '판교 농구단',
        sportType: 'BASKETBALL',
        city: '성남',
        isRecruiting: false,
        createdAt: new Date('2026-03-02'),
        owner: { id: 'u2', nickname: '팀장2', profileImageUrl: null },
      },
    ];

    it('should return paginated teams', async () => {
      mockPrismaService.sportTeam.findMany.mockResolvedValue(mockTeams);

      const result = await service.findAll({});

      expect(result).toEqual({
        items: mockTeams,
        nextCursor: null,
      });
      expect(prisma.sportTeam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 21,
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should return nextCursor when there are more results', async () => {
      const manyTeams = Array.from({ length: 21 }, (_, i) => ({
        id: `team-${i}`,
        name: `팀 ${i}`,
        sportType: 'FUTSAL',
        createdAt: new Date(),
        owner: { id: `u${i}`, nickname: `유저${i}`, profileImageUrl: null },
      }));
      mockPrismaService.sportTeam.findMany.mockResolvedValue(manyTeams);

      const result = await service.findAll({});

      expect(result.items).toHaveLength(20);
      expect(result.nextCursor).toBe('team-19');
    });

    it('should filter by sportType', async () => {
      mockPrismaService.sportTeam.findMany.mockResolvedValue([mockTeams[0]]);

      await service.findAll({ sportType: 'FUTSAL' });

      expect(prisma.sportTeam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sportType: 'FUTSAL' }),
        }),
      );
    });

    it('should filter by city', async () => {
      mockPrismaService.sportTeam.findMany.mockResolvedValue([mockTeams[0]]);

      await service.findAll({ city: '서울' });

      expect(prisma.sportTeam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ city: '서울' }),
        }),
      );
    });

    it('should filter by recruiting status', async () => {
      mockPrismaService.sportTeam.findMany.mockResolvedValue([mockTeams[0]]);

      await service.findAll({ recruiting: 'true' });

      expect(prisma.sportTeam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isRecruiting: true }),
        }),
      );
    });

    it('should use cursor-based pagination when cursor provided', async () => {
      mockPrismaService.sportTeam.findMany.mockResolvedValue([mockTeams[1]]);

      await service.findAll({ cursor: 'team-1' });

      expect(prisma.sportTeam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'team-1' },
          skip: 1,
          take: 21,
        }),
      );
    });
  });

  describe('findById', () => {
    const mockTeamDetail = {
      id: 'team-1',
      name: 'FC 서울',
      sportType: 'FUTSAL',
      city: '서울',
      district: '강남구',
      owner: {
        id: 'u1',
        nickname: '팀장',
        profileImageUrl: null,
        mannerScore: 4.5,
      },
    };

    it('should return team with owner details', async () => {
      mockPrismaService.sportTeam.findUnique.mockResolvedValue(mockTeamDetail);

      const result = await service.findById('team-1');

      expect(result).toEqual(mockTeamDetail);
      expect(prisma.sportTeam.findUnique).toHaveBeenCalledWith({
        where: { id: 'team-1' },
        include: {
          owner: {
            select: {
              id: true,
              nickname: true,
              profileImageUrl: true,
              mannerScore: true,
            },
          },
        },
      });
    });

    it('should throw NotFoundException when team does not exist', async () => {
      mockPrismaService.sportTeam.findUnique.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findById('non-existent')).rejects.toThrow(
        '팀을 찾을 수 없습니다.',
      );
    });
  });

  describe('create', () => {
    const createData = {
      name: 'FC 새팀',
      sportType: 'FUTSAL',
      description: '즐겁게 운동해요',
      city: '서울',
      district: '강남구',
      memberCount: 5,
      level: 3,
      isRecruiting: true,
      contactInfo: '010-1234-5678',
    };

    const createdTeam = {
      id: 'team-new',
      ownerId: 'user-1',
      ...createData,
      logoUrl: undefined,
      coverImageUrl: undefined,
      createdAt: new Date(),
    };

    beforeEach(() => {
      mockTx.sportTeam.create.mockResolvedValue(createdTeam);
      mockTx.teamMembership.create.mockResolvedValue({});
    });

    it('should create a team and auto-create owner membership inside a transaction', async () => {
      const result = await service.create('user-1', createData);

      expect(result).toEqual(createdTeam);
      expect(mockTx.sportTeam.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ownerId: 'user-1',
          name: 'FC 새팀',
          sportType: 'FUTSAL',
          description: '즐겁게 운동해요',
          city: '서울',
          district: '강남구',
          memberCount: 5,
          level: 3,
          isRecruiting: true,
          contactInfo: '010-1234-5678',
        }),
      });
    });

    it('should auto-create owner membership with role=owner and status=active', async () => {
      await service.create('user-1', createData);

      expect(mockTx.teamMembership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          teamId: 'team-new',
          userId: 'user-1',
          role: 'owner',
          status: 'active',
        }),
      });
    });

    it('should use default values for optional fields', async () => {
      const minimalData = {
        name: '최소 팀',
        sportType: 'BASKETBALL',
      };

      mockTx.sportTeam.create.mockResolvedValue({
        id: 'team-min',
        ownerId: 'user-1',
        ...minimalData,
      });

      await service.create('user-1', minimalData);

      expect(mockTx.sportTeam.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ownerId: 'user-1',
          name: '최소 팀',
          memberCount: 1,
          level: 3,
          isRecruiting: true,
        }),
      });
    });
  });
});
