import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const safeUser = (overrides = {}) => ({
  id: 'user-1',
  email: 'test@example.com',
  nickname: 'tester',
  role: 'user',
  profileImageUrl: null,
  phone: null,
  gender: null,
  birthYear: null,
  bio: null,
  sportTypes: ['futsal'],
  locationCity: '서울',
  locationDistrict: '마포구',
  mannerScore: 3.5,
  totalMatches: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  sportProfiles: [],
  ...overrides,
});

const publicUser = (overrides = {}) => ({
  id: 'user-1',
  nickname: 'tester',
  profileImageUrl: null,
  gender: null,
  mannerScore: 3.5,
  totalMatches: 0,
  sportProfiles: [],
  ...overrides,
});

const prismaMock = {
  user: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  matchParticipant: {
    findMany: jest.fn(),
  },
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── findById ────────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns user without passwordHash field', async () => {
      prismaMock.user.findFirst.mockResolvedValue(safeUser());

      const result = await service.findById('user-1');

      expect(result).not.toHaveProperty('passwordHash');
      expect(result.id).toBe('user-1');
    });

    it('throws NotFoundException for non-existent user', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      await expect(service.findById('no-such-id')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for soft-deleted user (deletedAt set)', async () => {
      // Prisma filters deletedAt: null, so findFirst returns null for deleted users
      prismaMock.user.findFirst.mockResolvedValue(null);

      await expect(service.findById('deleted-user')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getPublicProfile ────────────────────────────────────────────────────────

  describe('getPublicProfile', () => {
    it('returns public profile without passwordHash (security regression)', async () => {
      prismaMock.user.findFirst.mockResolvedValue(publicUser());

      const result = await service.getPublicProfile('user-1');

      // Critical: passwordHash must never appear in public profile
      expect(result).not.toHaveProperty('passwordHash');
      // Also must not expose sensitive fields
      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('phone');
      expect(result.nickname).toBe('tester');
    });

    it('throws NotFoundException when user not found', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      await expect(service.getPublicProfile('no-such-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates and returns user without passwordHash', async () => {
      const updated = safeUser({ nickname: 'new-nickname' });
      prismaMock.user.update.mockResolvedValue(updated);

      const result = await service.update('user-1', { nickname: 'new-nickname' });

      expect(result.nickname).toBe('new-nickname');
      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  // ── getMatchHistory ─────────────────────────────────────────────────────────

  describe('getMatchHistory', () => {
    const mockMatch = {
      id: 'match-1',
      title: 'Test Match',
      sportType: 'futsal',
      status: 'completed',
      venue: { id: 'venue-1', name: 'Test Venue', city: '서울' },
      host: { id: 'user-2', nickname: 'host', profileImageUrl: null },
    };

    it('returns matches for a user', async () => {
      const participants = [
        { id: 'p-1', match: mockMatch },
        { id: 'p-2', match: { ...mockMatch, id: 'match-2' } },
      ];
      prismaMock.matchParticipant.findMany.mockResolvedValue(participants);

      const result = await service.getMatchHistory('user-1', {});

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });

    it('returns empty items and null nextCursor when no matches', async () => {
      prismaMock.matchParticipant.findMany.mockResolvedValue([]);

      const result = await service.getMatchHistory('user-1', {});

      expect(result.items).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });

    it('returns nextCursor when there are more items than limit', async () => {
      // limit=2, Prisma returns 3 → hasNext=true
      const participants = [
        { id: 'p-1', match: mockMatch },
        { id: 'p-2', match: { ...mockMatch, id: 'match-2' } },
        { id: 'p-3', match: { ...mockMatch, id: 'match-3' } },
      ];
      prismaMock.matchParticipant.findMany.mockResolvedValue(participants);

      const result = await service.getMatchHistory('user-1', { limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('p-2');
    });

    it('passes cursor to Prisma when provided', async () => {
      prismaMock.matchParticipant.findMany.mockResolvedValue([]);

      await service.getMatchHistory('user-1', { cursor: 'p-1' });

      expect(prismaMock.matchParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'p-1' },
          skip: 1,
        }),
      );
    });
  });
});
