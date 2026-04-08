import { Test, TestingModule } from '@nestjs/testing';
import { BadgesService } from './badges.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const prismaMock = {
  badge: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  userBadge: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

const notificationsMock = {
  create: jest.fn(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('BadgesService', () => {
  let service: BadgesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BadgesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsMock },
      ],
    }).compile();

    service = module.get<BadgesService>(BadgesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── getBadgeTypes ───────────────────────────────────────────────────────────

  describe('getBadgeTypes', () => {
    it('returns exactly 7 badge types', () => {
      const types = service.getBadgeTypes();

      expect(types).toHaveLength(7);
    });

    it('each badge type has type, name, and description fields', () => {
      const types = service.getBadgeTypes();

      types.forEach((t) => {
        expect(t).toHaveProperty('type');
        expect(t).toHaveProperty('name');
        expect(t).toHaveProperty('description');
      });
    });

    it('includes expected badge type identifiers', () => {
      const types = service.getBadgeTypes();
      const typeIds = types.map((t) => t.type);

      expect(typeIds).toContain('manner_player');
      expect(typeIds).toContain('punctual');
      expect(typeIds).toContain('newcomer');
    });
  });

  // ── awardBadge ──────────────────────────────────────────────────────────────

  describe('awardBadge', () => {
    it('creates and returns a badge for a valid team', async () => {
      const badge = {
        id: 'badge-1',
        teamId: 'team-1',
        type: 'newcomer',
        name: '신생팀',
        description: null,
        earnedAt: new Date(),
      };
      prismaMock.badge.create.mockResolvedValue(badge);

      const result = await service.awardBadge('team-1', {
        type: 'newcomer',
        name: '신생팀',
      });

      expect(result.teamId).toBe('team-1');
      expect(result.type).toBe('newcomer');
    });
  });

  // ── awardIfEligible ─────────────────────────────────────────────────────────

  describe('awardIfEligible', () => {
    it('creates UserBadge and sends notification on first call', async () => {
      prismaMock.userBadge.findUnique.mockResolvedValue(null);
      prismaMock.userBadge.create.mockResolvedValue({ id: 'ub-1' });
      notificationsMock.create.mockResolvedValue({});

      const result = await service.awardIfEligible('user-1', 'match_10', {
        name: '10경기 달성',
        description: '10경기를 완료한 사용자',
      });

      expect(result).toBe(true);
      expect(prismaMock.userBadge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1', type: 'match_10' }),
        }),
      );
      expect(notificationsMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: 'badge_earned',
        }),
      );
    });

    it('returns false and creates nothing when UserBadge already exists', async () => {
      prismaMock.userBadge.findUnique.mockResolvedValue({ id: 'ub-existing' });

      const result = await service.awardIfEligible('user-2', 'match_10', { name: '10경기 달성' });

      expect(result).toBe(false);
      expect(prismaMock.userBadge.create).not.toHaveBeenCalled();
      expect(notificationsMock.create).not.toHaveBeenCalled();
    });

    it('awards different badge types independently for same user', async () => {
      prismaMock.userBadge.findUnique.mockResolvedValue(null);
      prismaMock.userBadge.create.mockResolvedValue({ id: 'ub-new' });
      notificationsMock.create.mockResolvedValue({});

      const r1 = await service.awardIfEligible('user-3', 'match_10', { name: '10경기 달성' });
      const r2 = await service.awardIfEligible('user-3', 'match_50', { name: '50경기 달성' });

      expect(r1).toBe(true);
      expect(r2).toBe(true);
      expect(prismaMock.userBadge.create).toHaveBeenCalledTimes(2);
      expect(notificationsMock.create).toHaveBeenCalledTimes(2);
    });

    it('uses userId_type composite key for uniqueness check', async () => {
      prismaMock.userBadge.findUnique.mockResolvedValue(null);
      prismaMock.userBadge.create.mockResolvedValue({ id: 'ub-1' });
      notificationsMock.create.mockResolvedValue({});

      await service.awardIfEligible('user-4', 'newcomer', { name: '신규 사용자' });

      expect(prismaMock.userBadge.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_type: { userId: 'user-4', type: 'newcomer' } },
        }),
      );
    });
  });

  // ── getTeamBadges ───────────────────────────────────────────────────────────

  describe('getTeamBadges', () => {
    it('returns badges for a team ordered by earnedAt desc', async () => {
      const badges = [
        { id: 'b1', teamId: 'team-1', type: 'newcomer', earnedAt: new Date('2026-03-10') },
        { id: 'b2', teamId: 'team-1', type: 'punctual', earnedAt: new Date('2026-03-05') },
      ];
      prismaMock.badge.findMany.mockResolvedValue(badges);

      const result = await service.getTeamBadges('team-1');

      expect(result).toHaveLength(2);
      expect(prismaMock.badge.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { teamId: 'team-1' },
          orderBy: { earnedAt: 'desc' },
        }),
      );
    });

    it('returns empty array when team has no badges', async () => {
      prismaMock.badge.findMany.mockResolvedValue([]);

      const result = await service.getTeamBadges('team-no-badges');

      expect(result).toHaveLength(0);
    });
  });
});
