import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLessonAdminDto } from './dto/create-lesson-admin.dto';
import { CreateTeamAdminDto } from './dto/create-team-admin.dto';
import { CreateVenueAdminDto, UpdateVenueAdminDto } from './dto/create-venue-admin.dto';
import { SportType, LessonType, VenueType, MatchStatus, LessonStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const prismaMock = {
  user: {
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  match: {
    count: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  lesson: {
    count: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  sportTeam: {
    count: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
  venue: {
    count: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  marketplaceListing: {
    count: jest.fn(),
  },
  payment: {
    findMany: jest.fn(),
  },
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── getDashboardStats ───────────────────────────────────────────────────────

  describe('getDashboardStats', () => {
    it('returns accurate counts from all domains', async () => {
      prismaMock.user.count
        .mockResolvedValueOnce(100)  // totalUsers
        .mockResolvedValueOnce(5);   // todayNewUsers
      prismaMock.match.count
        .mockResolvedValueOnce(200)  // totalMatches
        .mockResolvedValueOnce(3);   // todayMatches
      prismaMock.lesson.count.mockResolvedValue(50);
      prismaMock.sportTeam.count.mockResolvedValue(30);
      prismaMock.venue.count.mockResolvedValue(20);
      prismaMock.marketplaceListing.count.mockResolvedValue(15);

      const result = await service.getDashboardStats();

      expect(result.totalUsers).toBe(100);
      expect(result.totalMatches).toBe(200);
      expect(result.totalLessons).toBe(50);
      expect(result.totalTeams).toBe(30);
      expect(result.totalVenues).toBe(20);
      expect(result.activeListings).toBe(15);
      expect(result.todayMatches).toBe(3);
      expect(result.todayNewUsers).toBe(5);
    });
  });

  // ── getUsers ────────────────────────────────────────────────────────────────

  describe('getUsers', () => {
    const mockUsers = [
      { id: 'u1', nickname: 'alice', email: 'alice@test.com', createdAt: new Date() },
      { id: 'u2', nickname: 'bob', email: 'bob@test.com', createdAt: new Date() },
    ];

    it('returns paginated user list', async () => {
      prismaMock.user.findMany.mockResolvedValue(mockUsers);

      const result = await service.getUsers({});

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });

    it('returns nextCursor when there are more than 20 results', async () => {
      const manyUsers = Array.from({ length: 21 }, (_, i) => ({
        id: `u${i}`,
        nickname: `user${i}`,
        createdAt: new Date(),
      }));
      prismaMock.user.findMany.mockResolvedValue(manyUsers);

      const result = await service.getUsers({});

      expect(result.items).toHaveLength(20);
      expect(result.nextCursor).toBe('u19');
    });

    it('passes search filter to Prisma', async () => {
      prismaMock.user.findMany.mockResolvedValue([mockUsers[0]]);

      await service.getUsers({ search: 'alice' });

      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            nickname: expect.objectContaining({ contains: 'alice' }),
          }),
        }),
      );
    });

    it('uses cursor-based pagination when cursor provided', async () => {
      prismaMock.user.findMany.mockResolvedValue([mockUsers[1]]);

      await service.getUsers({ cursor: 'u1' });

      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'u1' },
          skip: 1,
        }),
      );
    });
  });

  describe('getUserDetail', () => {
    it('returns moderation metadata with audit defaults', async () => {
      prismaMock.user.findFirst.mockResolvedValue({
        id: 'u1',
        nickname: 'alice',
        email: 'alice@test.com',
        profileImageUrl: null,
        gender: null,
        bio: null,
        mannerScore: 4.8,
        totalMatches: 12,
        locationCity: 'Seoul',
        locationDistrict: 'Mapo',
        createdAt: new Date(),
        sportTypes: ['futsal'],
        sportProfiles: [],
        oauthProvider: 'kakao',
      });

      const result = await service.getUserDetail('u1');

      expect(result.adminStatus).toBe('active');
      expect(result.warningCount).toBe(0);
      expect(result.adminAuditLog).toEqual([]);
    });
  });

  describe('moderation actions', () => {
    beforeEach(() => {
      prismaMock.user.findFirst.mockResolvedValue({ id: 'u1' });
    });

    it('records warning actions', async () => {
      const result = await service.warnUser('u1', { actor: 'admin', note: 'repeat no-show' });

      expect(result.action).toBe('warn');
      expect(result.warningCount).toBe(1);
      expect(result.auditEntry.note).toBe('repeat no-show');
    });

    it('updates user status and returns audit entry', async () => {
      const result = await service.updateUserStatus('u1', {
        actor: 'admin',
        status: 'suspended',
        note: 'abusive language',
      });

      expect(result.status).toBe('suspended');
      expect(result.suspensionReason).toBe('abusive language');
      expect(result.auditEntry.action).toBe('suspend');
    });
  });

  // ── updateMatchStatus ───────────────────────────────────────────────────────

  describe('updateMatchStatus', () => {
    it('updates match status successfully', async () => {
      const updated = { id: 'match-1', status: MatchStatus.cancelled };
      prismaMock.match.update.mockResolvedValue(updated);

      const result = await service.updateMatchStatus('match-1', MatchStatus.cancelled);

      expect(result.status).toBe(MatchStatus.cancelled);
      expect(prismaMock.match.update).toHaveBeenCalledWith({
        where: { id: 'match-1' },
        data: { status: MatchStatus.cancelled },
      });
    });
  });

  // ── createLesson ────────────────────────────────────────────────────────────

  describe('createLesson', () => {
    const validDto: CreateLessonAdminDto = {
      hostId: 'host-uuid-1',
      sportType: SportType.futsal,
      type: LessonType.group_lesson,
      title: '풋살 기초 강좌',
      lessonDate: '2026-06-01',
      startTime: '10:00',
      endTime: '12:00',
      maxParticipants: 10,
    };

    it('creates a lesson with typed DTO', async () => {
      const created = { id: 'lesson-1', ...validDto };
      prismaMock.lesson.create.mockResolvedValue(created);

      const result = await service.createLesson(validDto);

      expect(result.id).toBe('lesson-1');
      expect(prismaMock.lesson.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hostId: 'host-uuid-1',
            sportType: SportType.futsal,
            type: LessonType.group_lesson,
            title: '풋살 기초 강좌',
            maxParticipants: 10,
            fee: 0,
            levelMin: 1,
            levelMax: 5,
          }),
        }),
      );
    });

    it('applies default values for optional numeric fields', async () => {
      prismaMock.lesson.create.mockResolvedValue({ id: 'lesson-2' });

      await service.createLesson(validDto);

      expect(prismaMock.lesson.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fee: 0, levelMin: 1, levelMax: 5 }),
        }),
      );
    });
  });

  // ── updateLessonStatus ──────────────────────────────────────────────────────

  describe('updateLessonStatus', () => {
    it('updates lesson status with typed enum', async () => {
      const updated = { id: 'lesson-1', status: LessonStatus.cancelled };
      prismaMock.lesson.update.mockResolvedValue(updated);

      const result = await service.updateLessonStatus('lesson-1', LessonStatus.cancelled);

      expect(result.status).toBe(LessonStatus.cancelled);
      expect(prismaMock.lesson.update).toHaveBeenCalledWith({
        where: { id: 'lesson-1' },
        data: { status: LessonStatus.cancelled },
      });
    });
  });

  // ── createTeam ──────────────────────────────────────────────────────────────

  describe('createTeam', () => {
    const validDto: CreateTeamAdminDto = {
      ownerId: 'owner-uuid-1',
      name: '서울 풋살 FC',
      sportType: SportType.futsal,
    };

    it('creates a team with typed DTO', async () => {
      const created = { id: 'team-1', ...validDto };
      prismaMock.sportTeam.create.mockResolvedValue(created);

      const result = await service.createTeam(validDto);

      expect(result.id).toBe('team-1');
      expect(prismaMock.sportTeam.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerId: 'owner-uuid-1',
            name: '서울 풋살 FC',
            sportType: SportType.futsal,
            memberCount: 1,
            level: 3,
            isRecruiting: true,
          }),
        }),
      );
    });
  });

  // ── createVenue ─────────────────────────────────────────────────────────────

  describe('createVenue', () => {
    const validDto: CreateVenueAdminDto = {
      name: '마포 풋살파크',
      type: VenueType.futsal_court,
      sportTypes: [SportType.futsal],
      address: '서울시 마포구 월드컵로 1',
      lat: 37.57,
      lng: 126.88,
      city: '서울',
      district: '마포구',
    };

    it('creates a venue with typed DTO and defaults', async () => {
      const created = { id: 'venue-1', ...validDto };
      prismaMock.venue.create.mockResolvedValue(created);

      const result = await service.createVenue(validDto);

      expect(result.id).toBe('venue-1');
      expect(prismaMock.venue.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: '마포 풋살파크',
            type: VenueType.futsal_court,
            sportTypes: [SportType.futsal],
            lat: 37.57,
            lng: 126.88,
            imageUrls: [],
            facilities: [],
            operatingHours: {},
          }),
        }),
      );
    });
  });

  // ── updateVenue ─────────────────────────────────────────────────────────────

  describe('updateVenue', () => {
    it('updates only provided fields (partial)', async () => {
      const dto: UpdateVenueAdminDto = { name: '새 이름', phone: '02-1234-5678' };
      prismaMock.venue.update.mockResolvedValue({ id: 'venue-1', name: '새 이름' });

      await service.updateVenue('venue-1', dto);

      expect(prismaMock.venue.update).toHaveBeenCalledWith({
        where: { id: 'venue-1' },
        data: expect.objectContaining({ name: '새 이름', phone: '02-1234-5678' }),
      });
    });

    it('does not include undefined fields in update data', async () => {
      const dto: UpdateVenueAdminDto = { name: '이름만 변경' };
      prismaMock.venue.update.mockResolvedValue({ id: 'venue-1' });

      await service.updateVenue('venue-1', dto);

      const callArg = prismaMock.venue.update.mock.calls[0][0];
      expect(callArg.data).not.toHaveProperty('phone');
      expect(callArg.data).not.toHaveProperty('lat');
    });
  });

  // ── getPayments ─────────────────────────────────────────────────────────────

  describe('getPayments', () => {
    it('returns payment list with user info', async () => {
      const payments = [
        {
          id: 'pay-1',
          amount: 15000,
          status: 'completed',
          user: { id: 'u1', nickname: 'alice' },
        },
      ];
      prismaMock.payment.findMany.mockResolvedValue(payments);

      const result = await service.getPayments();

      expect(result).toHaveLength(1);
      expect(result[0].user).toBeDefined();
    });
  });
});
