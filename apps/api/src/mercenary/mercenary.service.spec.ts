import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { MercenaryService } from './mercenary.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamMembershipService } from '../teams/team-membership.service';
import { CreateMercenaryPostDto } from './dto/create-mercenary-post.dto';
import { ApplyMercenaryDto } from './dto/apply-mercenary.dto';
import { MercenaryQueryDto } from './dto/mercenary-query.dto';
import { SportType } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockPost = (overrides = {}) => ({
  id: 'post-1',
  teamId: 'team-1',
  authorId: 'user-1',
  sportType: 'FUTSAL' as SportType,
  matchDate: new Date('2026-04-10T14:00:00Z'),
  venue: '강남 풋살파크',
  position: '공격수',
  count: 2,
  level: 3,
  fee: 10000,
  notes: null,
  status: 'open',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const mockApp = (overrides = {}) => ({
  id: 'app-1',
  postId: 'post-1',
  userId: 'user-99',
  message: null,
  status: 'pending',
  appliedAt: new Date(),
  decidedAt: null,
  decidedBy: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const prismaMock = {
  mercenaryPost: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  mercenaryApplication: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
};

const teamMembershipMock = {
  assertRole: jest.fn(),
  getMembership: jest.fn(),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('MercenaryService', () => {
  let service: MercenaryService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MercenaryService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TeamMembershipService, useValue: teamMembershipMock },
      ],
    }).compile();

    service = module.get<MercenaryService>(MercenaryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // findAll
  // -------------------------------------------------------------------------
  describe('findAll', () => {
    it('returns items and null nextCursor when result fits within limit', async () => {
      const posts = [mockPost({ id: 'p1' }), mockPost({ id: 'p2' })];
      prismaMock.mercenaryPost.findMany.mockResolvedValue(posts);

      const query: MercenaryQueryDto = { limit: 20 };
      const result = await service.findAll(query);

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });

    it('returns nextCursor when there are more items than limit', async () => {
      // limit=2, but prisma returns 3 (limit+1) items → hasMore=true
      const posts = [
        mockPost({ id: 'p1' }),
        mockPost({ id: 'p2' }),
        mockPost({ id: 'p3' }),
      ];
      prismaMock.mercenaryPost.findMany.mockResolvedValue(posts);

      const query: MercenaryQueryDto = { limit: 2 };
      const result = await service.findAll(query);

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('p2');
    });

    it('passes sportType and status filters to prisma', async () => {
      prismaMock.mercenaryPost.findMany.mockResolvedValue([]);

      await service.findAll({ sportType: 'FUTSAL' as SportType, status: 'open' as any });

      expect(prismaMock.mercenaryPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sportType: 'FUTSAL',
            status: 'open',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------
  describe('create', () => {
    const dto: CreateMercenaryPostDto = {
      teamId: 'team-1',
      sportType: 'FUTSAL' as SportType,
      matchDate: '2026-04-10T14:00:00Z',
      venue: '강남 풋살파크',
      position: '공격수',
      count: 2,
      level: 3,
      fee: 10000,
    };

    it('creates post successfully when user is manager+', async () => {
      teamMembershipMock.assertRole.mockResolvedValue({ role: 'manager' });
      prismaMock.mercenaryPost.create.mockResolvedValue(mockPost());

      const result = await service.create('user-1', dto);

      expect(teamMembershipMock.assertRole).toHaveBeenCalledWith('team-1', 'user-1', 'manager');
      expect(prismaMock.mercenaryPost.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('throws ForbiddenException when user is not manager+', async () => {
      teamMembershipMock.assertRole.mockRejectedValue(
        new ForbiddenException('팀 권한이 부족합니다'),
      );

      await expect(service.create('user-99', dto)).rejects.toThrow(ForbiddenException);
      expect(prismaMock.mercenaryPost.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // apply
  // -------------------------------------------------------------------------
  describe('apply', () => {
    const dto: ApplyMercenaryDto = { message: '잘 부탁드립니다' };

    it('creates application successfully when post is open and user is not a team member', async () => {
      prismaMock.mercenaryPost.findUnique.mockResolvedValue(mockPost({ status: 'open' }));
      teamMembershipMock.getMembership.mockResolvedValue(null);
      prismaMock.mercenaryApplication.findUnique.mockResolvedValue(null);
      prismaMock.mercenaryApplication.create.mockResolvedValue(mockApp());

      const result = await service.apply('post-1', 'user-99', dto);

      expect(result).toBeDefined();
      expect(prismaMock.mercenaryApplication.create).toHaveBeenCalled();
    });

    it('throws ConflictException on duplicate application', async () => {
      prismaMock.mercenaryPost.findUnique.mockResolvedValue(mockPost({ status: 'open' }));
      teamMembershipMock.getMembership.mockResolvedValue(null);
      prismaMock.mercenaryApplication.findUnique.mockResolvedValue(mockApp());

      await expect(service.apply('post-1', 'user-99', dto)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when user is a member of the host team', async () => {
      prismaMock.mercenaryPost.findUnique.mockResolvedValue(mockPost({ status: 'open' }));
      teamMembershipMock.getMembership.mockResolvedValue({ role: 'member' });

      await expect(service.apply('post-1', 'user-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when post is not open', async () => {
      prismaMock.mercenaryPost.findUnique.mockResolvedValue(mockPost({ status: 'filled' }));

      await expect(service.apply('post-1', 'user-99', dto)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when post does not exist', async () => {
      prismaMock.mercenaryPost.findUnique.mockResolvedValue(null);

      await expect(service.apply('non-existent', 'user-99', dto)).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // acceptApplication
  // -------------------------------------------------------------------------
  describe('acceptApplication', () => {
    it('accepts application and marks post as filled when count is reached', async () => {
      const post = mockPost({ count: 1 });
      prismaMock.mercenaryPost.findUnique.mockResolvedValue(post);
      teamMembershipMock.assertRole.mockResolvedValue({ role: 'manager' });
      prismaMock.mercenaryApplication.findFirst.mockResolvedValue(mockApp());
      prismaMock.mercenaryApplication.update.mockResolvedValue(mockApp({ status: 'accepted' }));
      prismaMock.mercenaryApplication.count.mockResolvedValue(1); // equals post.count
      prismaMock.mercenaryPost.update.mockResolvedValue({ ...post, status: 'filled' });

      const result = await service.acceptApplication('post-1', 'app-1', 'user-1');

      expect(result.status).toBe('accepted');
      expect(prismaMock.mercenaryPost.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'filled' } }),
      );
    });

    it('does not mark post as filled when count is not yet reached', async () => {
      const post = mockPost({ count: 3 });
      prismaMock.mercenaryPost.findUnique.mockResolvedValue(post);
      teamMembershipMock.assertRole.mockResolvedValue({ role: 'manager' });
      prismaMock.mercenaryApplication.findFirst.mockResolvedValue(mockApp());
      prismaMock.mercenaryApplication.update.mockResolvedValue(mockApp({ status: 'accepted' }));
      prismaMock.mercenaryApplication.count.mockResolvedValue(1); // less than post.count

      await service.acceptApplication('post-1', 'app-1', 'user-1');

      expect(prismaMock.mercenaryPost.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when user is not manager+', async () => {
      prismaMock.mercenaryPost.findUnique.mockResolvedValue(mockPost());
      teamMembershipMock.assertRole.mockRejectedValue(new ForbiddenException('팀 권한이 부족합니다'));

      await expect(service.acceptApplication('post-1', 'app-1', 'user-99')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // rejectApplication
  // -------------------------------------------------------------------------
  describe('rejectApplication', () => {
    it('rejects application successfully when user is manager+', async () => {
      prismaMock.mercenaryPost.findUnique.mockResolvedValue(mockPost());
      teamMembershipMock.assertRole.mockResolvedValue({ role: 'manager' });
      prismaMock.mercenaryApplication.findFirst.mockResolvedValue(mockApp());
      prismaMock.mercenaryApplication.update.mockResolvedValue(mockApp({ status: 'rejected' }));

      const result = await service.rejectApplication('post-1', 'app-1', 'user-1');

      expect(result.status).toBe('rejected');
      expect(prismaMock.mercenaryApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'rejected' }) }),
      );
    });

    it('throws ForbiddenException when user is not manager+', async () => {
      prismaMock.mercenaryPost.findUnique.mockResolvedValue(mockPost());
      teamMembershipMock.assertRole.mockRejectedValue(new ForbiddenException('팀 권한이 부족합니다'));

      await expect(service.rejectApplication('post-1', 'app-1', 'user-99')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // withdrawApplication
  // -------------------------------------------------------------------------
  describe('withdrawApplication', () => {
    it('withdraws own pending application successfully', async () => {
      prismaMock.mercenaryApplication.findUnique.mockResolvedValue(mockApp({ status: 'pending' }));
      prismaMock.mercenaryApplication.update.mockResolvedValue(mockApp({ status: 'withdrawn' }));

      const result = await service.withdrawApplication('post-1', 'user-99');

      expect(result.status).toBe('withdrawn');
    });

    it('throws NotFoundException when application does not exist', async () => {
      prismaMock.mercenaryApplication.findUnique.mockResolvedValue(null);

      await expect(service.withdrawApplication('post-1', 'user-99')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when application is not pending', async () => {
      prismaMock.mercenaryApplication.findUnique.mockResolvedValue(mockApp({ status: 'accepted' }));

      await expect(service.withdrawApplication('post-1', 'user-99')).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // findMyApplications
  // -------------------------------------------------------------------------
  describe('findMyApplications', () => {
    it('returns all applications for a user without status filter', async () => {
      const apps = [mockApp({ userId: 'user-99' }), mockApp({ id: 'app-2', userId: 'user-99', status: 'accepted' })];
      prismaMock.mercenaryApplication.findMany.mockResolvedValue(apps);

      const result = await service.findMyApplications('user-99');

      expect(result).toHaveLength(2);
      expect(prismaMock.mercenaryApplication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-99' } }),
      );
    });

    it('filters by status when provided', async () => {
      prismaMock.mercenaryApplication.findMany.mockResolvedValue([mockApp({ status: 'accepted' })]);

      await service.findMyApplications('user-99', 'accepted' as any);

      expect(prismaMock.mercenaryApplication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-99', status: 'accepted' },
        }),
      );
    });
  });
});
