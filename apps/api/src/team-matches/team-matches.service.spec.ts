import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { TeamMatchesService } from './team-matches.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamMembershipService } from '../teams/team-membership.service';

describe('TeamMatchesService', () => {
  let service: TeamMatchesService;
  let prisma: PrismaService;

  // By default assertRole resolves (permission granted). Individual tests can override.
  const mockTeamMembershipService = {
    assertRole: jest.fn().mockResolvedValue({ role: 'manager' }),
  };

  const mockPrismaService = {
    teamMatch: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    teamMatchApplication: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    arrivalCheck: {
      upsert: jest.fn(),
    },
    matchEvaluation: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    teamTrustScore: {
      upsert: jest.fn(),
    },
    sportTeam: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamMatchesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TeamMembershipService, useValue: mockTeamMembershipService },
      ],
    }).compile();

    service = module.get<TeamMatchesService>(TeamMatchesService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
    // Reset assertRole to default (permit) after each clear
    mockTeamMembershipService.assertRole.mockResolvedValue({ role: 'manager' });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    const mockTeamMatches = [
      {
        id: 'tm-1',
        title: '풋살 팀 매치',
        sportType: 'FUTSAL',
        status: 'recruiting',
        matchDate: new Date('2026-04-01'),
        hostTeam: { id: 't1', name: 'FC 서울', sportType: 'FUTSAL', city: '서울', district: '강남구', level: 3, memberCount: 10 },
        _count: { applications: 2 },
      },
      {
        id: 'tm-2',
        title: '농구 팀 매치',
        sportType: 'BASKETBALL',
        status: 'recruiting',
        matchDate: new Date('2026-04-02'),
        hostTeam: { id: 't2', name: '판교 농구단', sportType: 'BASKETBALL', city: '성남', district: '분당구', level: 4, memberCount: 8 },
        _count: { applications: 0 },
      },
    ];

    it('should return paginated team matches', async () => {
      mockPrismaService.teamMatch.findMany.mockResolvedValue(mockTeamMatches);

      const result = await service.findAll({});

      expect(result).toEqual({
        items: mockTeamMatches,
        nextCursor: null,
      });
      expect(prisma.teamMatch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'recruiting' },
          take: 21,
          orderBy: { matchDate: 'asc' },
        }),
      );
    });

    it('should return nextCursor when there are more results', async () => {
      const manyMatches = Array.from({ length: 21 }, (_, i) => ({
        id: `tm-${i}`,
        title: `매치 ${i}`,
        sportType: 'FUTSAL',
        status: 'recruiting',
        matchDate: new Date(),
        hostTeam: { id: `t${i}`, name: `팀${i}`, sportType: 'FUTSAL', city: '서울', district: '강남', level: 3, memberCount: 10 },
        _count: { applications: 0 },
      }));
      mockPrismaService.teamMatch.findMany.mockResolvedValue(manyMatches);

      const result = await service.findAll({});

      expect(result.items).toHaveLength(20);
      expect(result.nextCursor).toBe('tm-19');
    });

    it('should filter by sportType', async () => {
      mockPrismaService.teamMatch.findMany.mockResolvedValue([mockTeamMatches[0]]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await service.findAll({ sportType: 'futsal' as any });

      expect(prisma.teamMatch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sportType: 'futsal' }),
        }),
      );
    });

    it('should use custom status filter', async () => {
      mockPrismaService.teamMatch.findMany.mockResolvedValue([]);

      await service.findAll({ status: 'scheduled' });

      expect(prisma.teamMatch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'scheduled' }),
        }),
      );
    });

    it('should use cursor-based pagination when cursor provided', async () => {
      mockPrismaService.teamMatch.findMany.mockResolvedValue([mockTeamMatches[1]]);

      await service.findAll({ cursor: 'tm-1' });

      expect(prisma.teamMatch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'tm-1' },
          skip: 1,
          take: 21,
        }),
      );
    });

    it('should filter by teamId as host', async () => {
      mockPrismaService.teamMatch.findMany.mockResolvedValue([mockTeamMatches[0]]);

      await service.findAll({ teamId: 't1' });

      expect(prisma.teamMatch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              {
                OR: [
                  { hostTeamId: 't1' },
                  { applications: { some: { applicantTeamId: 't1' } } },
                ],
              },
            ]),
          }),
        }),
      );
    });

    it('should include applicant team matches when filtering by teamId', async () => {
      const applicantMatch = {
        ...mockTeamMatches[1],
        id: 'tm-3',
        hostTeam: { id: 't9', name: '상대팀', sportType: 'FUTSAL', city: '서울', district: '종로구', level: 3, memberCount: 10 },
      };
      mockPrismaService.teamMatch.findMany.mockResolvedValue([applicantMatch]);

      await service.findAll({ teamId: 't2' });

      expect(prisma.teamMatch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              {
                OR: expect.arrayContaining([
                  { hostTeamId: 't2' },
                  { applications: { some: { applicantTeamId: 't2' } } },
                ]),
              },
            ]),
          }),
        }),
      );
    });

    it('should combine teamId filter with status filter', async () => {
      mockPrismaService.teamMatch.findMany.mockResolvedValue([]);

      await service.findAll({ teamId: 't1', status: 'scheduled' });

      expect(prisma.teamMatch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'scheduled',
          }),
        }),
      );
    });

    it('should scope OR to AND so city does not bleed into applicant-team branch', async () => {
      // When both city and teamId are provided, the where structure must use AND to prevent
      // hostTeam.city from being implicitly ANDed into the applicant-team OR branch.
      mockPrismaService.teamMatch.findMany.mockResolvedValue([]);

      await service.findAll({ teamId: 't1', city: '서울' });

      const [callArg] = mockPrismaService.teamMatch.findMany.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      const where = callArg.where;

      // city must NOT appear as a top-level hostTeam key — it must live inside AND
      expect(where).not.toHaveProperty('hostTeam');
      // OR must NOT appear at the top level — it must live inside AND
      expect(where).not.toHaveProperty('OR');
      // AND must contain both constraints
      expect(where).toHaveProperty('AND');
      const and = where.AND as unknown[];
      expect(and).toEqual(
        expect.arrayContaining([
          { hostTeam: { city: '서울' } },
          {
            OR: [
              { hostTeamId: 't1' },
              { applications: { some: { applicantTeamId: 't1' } } },
            ],
          },
        ]),
      );
    });

    it('should omit AND when neither city nor teamId are provided', async () => {
      mockPrismaService.teamMatch.findMany.mockResolvedValue([]);

      await service.findAll({ status: 'recruiting' });

      const [callArg] = mockPrismaService.teamMatch.findMany.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(callArg.where).not.toHaveProperty('AND');
    });
  });

  describe('findOne', () => {
    const mockMatchDetail = {
      id: 'tm-1',
      title: '풋살 팀 매치',
      sportType: 'FUTSAL',
      status: 'recruiting',
      hostTeam: {
        id: 't1',
        name: 'FC 서울',
        sportType: 'FUTSAL',
        city: '서울',
        district: '강남구',
        level: 3,
        memberCount: 10,
        description: '재미있게 합시다',
        contactInfo: '010-1234-5678',
      },
      applications: [
        {
          id: 'app-1',
          status: 'pending',
          applicantTeam: { id: 't2', name: '판교 FC', level: 3, city: '성남', memberCount: 8 },
        },
      ],
      arrivalChecks: [],
      evaluations: [],
      // task 17 meta fields
      skillGrade: 'B+',
      gameFormat: '6:6',
      matchType: 'invitation',
      proPlayerCount: 2,
      uniformColor: '파랑',
      isFreeInvitation: false,
    };

    it('should return team match with applications', async () => {
      mockPrismaService.teamMatch.findUnique.mockResolvedValue(mockMatchDetail);

      const result = await service.findOne('tm-1');

      expect(result).toEqual(mockMatchDetail);
      expect(prisma.teamMatch.findUnique).toHaveBeenCalledWith({
        where: { id: 'tm-1' },
        include: expect.objectContaining({
          hostTeam: expect.any(Object),
          applications: expect.any(Object),
          arrivalChecks: true,
          evaluations: true,
        }),
      });
    });

    it('should include task-17 meta fields in the returned match', async () => {
      mockPrismaService.teamMatch.findUnique.mockResolvedValue(mockMatchDetail);

      const result = await service.findOne('tm-1');

      expect(result).toMatchObject({
        skillGrade: 'B+',
        gameFormat: '6:6',
        matchType: 'invitation',
        proPlayerCount: 2,
        uniformColor: '파랑',
        isFreeInvitation: false,
      });
    });

    it('should throw NotFoundException when team match does not exist', async () => {
      mockPrismaService.teamMatch.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne('non-existent')).rejects.toThrow(
        '경기를 찾을 수 없습니다',
      );
    });
  });

  describe('create', () => {
    const userId = 'user-1';
    const createData = {
      hostTeamId: 'team-1',
      sportType: 'FUTSAL',
      title: '주말 풋살 팀 매치',
      matchDate: '2026-04-05',
      startTime: '14:00',
      endTime: '16:00',
      venueName: '강남 풋살장',
      venueAddress: '서울 강남구 역삼동',
      totalFee: 200000,
      opponentFee: 100000,
      quarterCount: 4,
    };

    const createdMatch = {
      id: 'tm-new',
      ...createData,
      matchDate: new Date('2026-04-05'),
      status: 'recruiting',
      totalMinutes: 120,
      hasReferee: false,
      allowMercenary: true,
      matchStyle: 'friendly',
      // task 17 meta fields
      skillGrade: null,
      gameFormat: null,
      matchType: null,
      proPlayerCount: 0,
      uniformColor: null,
      isFreeInvitation: false,
    };

    it('should create a team match', async () => {
      mockPrismaService.sportTeam.findUnique.mockResolvedValue({ id: 'team-1', ownerId: userId });
      mockPrismaService.teamMatch.create.mockResolvedValue(createdMatch);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await service.create(userId, createData as any);

      expect(result).toEqual(createdMatch);
      expect(prisma.teamMatch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hostTeamId: 'team-1',
          sportType: 'FUTSAL',
          title: '주말 풋살 팀 매치',
          venueName: '강남 풋살장',
          venueAddress: '서울 강남구 역삼동',
          quarterCount: 4,
        }),
      });
    });

    it('should generate referee schedule when hasReferee is false', async () => {
      mockPrismaService.sportTeam.findUnique.mockResolvedValue({ id: 'team-1', ownerId: userId });
      mockPrismaService.teamMatch.create.mockResolvedValue(createdMatch);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await service.create(userId, { ...createData, hasReferee: false, quarterCount: 4 } as any);

      expect(prisma.teamMatch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          refereeSchedule: { Q1: 'home', Q2: 'away', Q3: 'home', Q4: 'away' },
        }),
      });
    });

    it('should use default values for optional fields', async () => {
      const minimalData = {
        hostTeamId: 'team-1',
        sportType: 'BASKETBALL',
        title: '농구 매치',
        matchDate: '2026-04-10',
        startTime: '18:00',
        endTime: '20:00',
        venueName: '체육관',
        venueAddress: '서울시 강남구',
      };

      mockPrismaService.sportTeam.findUnique.mockResolvedValue({ id: 'team-1', ownerId: userId });
      mockPrismaService.teamMatch.create.mockResolvedValue({
        id: 'tm-min',
        ...minimalData,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await service.create(userId, minimalData as any);

      expect(prisma.teamMatch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          totalMinutes: 120,
          quarterCount: 4,
          totalFee: 0,
          opponentFee: 0,
          hasProPlayers: false,
          allowMercenary: true,
          matchStyle: 'friendly',
          hasReferee: false,
        }),
      });
    });

    it('should pass task-17 meta fields to prisma.create when provided', async () => {
      const dataWithMeta = {
        ...createData,
        skillGrade: 'A',
        gameFormat: '11:11',
        matchType: 'exchange',
        proPlayerCount: 3,
        uniformColor: '빨강',
        isFreeInvitation: true,
      };
      mockPrismaService.sportTeam.findUnique.mockResolvedValue({ id: 'team-1', ownerId: userId });
      mockPrismaService.teamMatch.create.mockResolvedValue({ id: 'tm-meta', ...dataWithMeta });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await service.create(userId, dataWithMeta as any);

      expect(prisma.teamMatch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          skillGrade: 'A',
          gameFormat: '11:11',
          matchType: 'exchange',
          proPlayerCount: 3,
          uniformColor: '빨강',
          isFreeInvitation: true,
        }),
      });
    });

    it('should use null/default values for task-17 meta fields when not provided', async () => {
      const minimalDataNoMeta = {
        hostTeamId: 'team-1',
        sportType: 'FUTSAL',
        title: '메타필드 없는 매치',
        matchDate: '2026-04-10',
        startTime: '10:00',
        endTime: '12:00',
        venueName: '테스트장',
        venueAddress: '서울시 강남구',
      };
      mockPrismaService.sportTeam.findUnique.mockResolvedValue({ id: 'team-1', ownerId: userId });
      mockPrismaService.teamMatch.create.mockResolvedValue({ id: 'tm-defaults' });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await service.create(userId, minimalDataNoMeta as any);

      expect(prisma.teamMatch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          skillGrade: null,
          gameFormat: null,
          matchType: null,
          proPlayerCount: 0,
          uniformColor: null,
          isFreeInvitation: false,
        }),
      });
    });

    it('should allow owner to create a team match', async () => {
      mockPrismaService.sportTeam.findUnique.mockResolvedValue({ id: 'team-1', ownerId: userId });
      mockPrismaService.teamMatch.create.mockResolvedValue(createdMatch);
      mockTeamMembershipService.assertRole.mockResolvedValue({ role: 'owner' });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(service.create(userId, createData as any)).resolves.toBeDefined();
      expect(mockTeamMembershipService.assertRole).toHaveBeenCalledWith('team-1', userId, 'manager');
    });

    it('should allow manager to create a team match', async () => {
      mockPrismaService.sportTeam.findUnique.mockResolvedValue({ id: 'team-1', ownerId: 'other-user' });
      mockPrismaService.teamMatch.create.mockResolvedValue(createdMatch);
      mockTeamMembershipService.assertRole.mockResolvedValue({ role: 'manager' });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(service.create(userId, createData as any)).resolves.toBeDefined();
    });

    it('should deny member from creating a team match', async () => {
      mockPrismaService.sportTeam.findUnique.mockResolvedValue({ id: 'team-1', ownerId: 'other-user' });
      mockTeamMembershipService.assertRole.mockRejectedValue(
        new ForbiddenException('팀 권한이 부족합니다'),
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(service.create(userId, createData as any)).rejects.toThrow(ForbiddenException);
      expect(prisma.teamMatch.create).not.toHaveBeenCalled();
    });
  });

  describe('apply', () => {
    const userId = 'user-2';
    const mockMatch = {
      id: 'tm-1',
      status: 'recruiting',
      hostTeamId: 'team-1',
    };

    it('should create a team match application', async () => {
      mockPrismaService.teamMatch.findUnique.mockResolvedValue(mockMatch);
      mockPrismaService.sportTeam.findUnique.mockResolvedValue({ id: 'team-2', ownerId: userId });
      mockPrismaService.teamMatchApplication.create.mockResolvedValue({
        id: 'app-new',
        teamMatchId: 'tm-1',
        applicantTeamId: 'team-2',
        status: 'pending',
        confirmedInfo: true,
        confirmedLevel: true,
        message: '좋은 경기 하겠습니다',
      });

      const result = await service.apply('tm-1', userId, {
        applicantTeamId: 'team-2',
        confirmedInfo: true,
        confirmedLevel: true,
        message: '좋은 경기 하겠습니다',
      });

      expect(result).toEqual(
        expect.objectContaining({
          teamMatchId: 'tm-1',
          applicantTeamId: 'team-2',
          status: 'pending',
        }),
      );
      expect(prisma.teamMatchApplication.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          teamMatchId: 'tm-1',
          applicantTeamId: 'team-2',
          confirmedInfo: true,
          confirmedLevel: true,
          message: '좋은 경기 하겠습니다',
        }),
      });
    });

    it('should create application with applicantTeamId', async () => {
      mockPrismaService.teamMatch.findUnique.mockResolvedValue(mockMatch);
      mockPrismaService.sportTeam.findUnique.mockResolvedValue({ id: 'team-3', ownerId: userId });
      mockPrismaService.teamMatchApplication.create.mockResolvedValue({
        id: 'app-new',
        teamMatchId: 'tm-1',
        applicantTeamId: 'team-3',
        status: 'pending',
      });

      await service.apply('tm-1', userId, { applicantTeamId: 'team-3' });

      expect(prisma.teamMatchApplication.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          applicantTeamId: 'team-3',
        }),
      });
    });

    it('should throw NotFoundException when match does not exist', async () => {
      mockPrismaService.teamMatch.findUnique.mockResolvedValue(null);

      await expect(
        service.apply('non-existent', userId, { applicantTeamId: 'team-2' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when match is not recruiting', async () => {
      mockPrismaService.teamMatch.findUnique.mockResolvedValue({
        ...mockMatch,
        status: 'scheduled',
      });

      await expect(
        service.apply('tm-1', userId, { applicantTeamId: 'team-2' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.apply('tm-1', userId, { applicantTeamId: 'team-2' }),
      ).rejects.toThrow('모집 중이 아닙니다');
    });

    it('should throw BadRequestException when no team ID provided', async () => {
      mockPrismaService.teamMatch.findUnique.mockResolvedValue(mockMatch);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(
        service.apply('tm-1', userId, {} as any),
      ).rejects.toThrow(BadRequestException);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(
        service.apply('tm-1', userId, {} as any),
      ).rejects.toThrow('팀 ID가 필요합니다');
    });

    it('should allow manager to apply on behalf of a team', async () => {
      mockPrismaService.teamMatch.findUnique.mockResolvedValue(mockMatch);
      mockPrismaService.sportTeam.findUnique.mockResolvedValue({ id: 'team-2' });
      mockPrismaService.teamMatchApplication.create.mockResolvedValue({
        id: 'app-new',
        teamMatchId: 'tm-1',
        applicantTeamId: 'team-2',
        status: 'pending',
      });
      mockTeamMembershipService.assertRole.mockResolvedValue({ role: 'manager' });

      await expect(
        service.apply('tm-1', userId, { applicantTeamId: 'team-2' }),
      ).resolves.toBeDefined();
      expect(mockTeamMembershipService.assertRole).toHaveBeenCalledWith('team-2', userId, 'manager');
    });

    it('should deny member from applying on behalf of a team', async () => {
      mockPrismaService.teamMatch.findUnique.mockResolvedValue(mockMatch);
      mockPrismaService.sportTeam.findUnique.mockResolvedValue({ id: 'team-2' });
      mockTeamMembershipService.assertRole.mockRejectedValue(
        new ForbiddenException('팀 권한이 부족합니다'),
      );

      await expect(
        service.apply('tm-1', userId, { applicantTeamId: 'team-2' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.teamMatchApplication.create).not.toHaveBeenCalled();
    });
  });

  describe('approveApplication', () => {
    it('should approve application and update match status', async () => {
      const userId = 'user-1';
      const approvedApp = {
        id: 'app-1',
        teamMatchId: 'tm-1',
        applicantTeamId: 'team-2',
        status: 'approved',
      };

      // New service selects { status, hostTeamId } (not hostTeam.ownerId)
      mockPrismaService.teamMatch.findUnique.mockResolvedValue({
        status: 'recruiting',
        hostTeamId: 'team-1',
      });

      // $transaction runs its callback inline with a tx object
      mockPrismaService.$transaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          teamMatchApplication: {
            update: jest.fn().mockResolvedValue(approvedApp),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          teamMatch: {
            update: jest.fn().mockResolvedValue({}),
          },
        }),
      );

      const result = await service.approveApplication('tm-1', 'app-1', userId);

      expect(result).toEqual(approvedApp);
    });
  });

  describe('rejectApplication', () => {
    it('should reject application', async () => {
      const userId = 'user-1';
      const rejectedApp = {
        id: 'app-1',
        teamMatchId: 'tm-1',
        applicantTeamId: 'team-2',
        status: 'rejected',
      };

      // New service selects { hostTeamId } only
      mockPrismaService.teamMatch.findUnique.mockResolvedValue({ hostTeamId: 'team-1' });
      mockPrismaService.teamMatchApplication.update.mockResolvedValue(rejectedApp);

      const result = await service.rejectApplication('tm-1', 'app-1', userId);

      expect(result).toEqual(rejectedApp);
      expect(prisma.teamMatchApplication.update).toHaveBeenCalledWith({
        where: { id: 'app-1' },
        data: { status: 'rejected' },
      });
    });
  });
});
