import { Test, TestingModule } from '@nestjs/testing';
import { BadgesService } from './badges.service';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const prismaMock = {
  badge: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
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
