import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerService } from './scheduler.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { BadgesService } from '../badges/badges.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const prismaMock = {
  matchParticipant: {
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  notification: {
    findMany: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

const scoringMock = {
  applyNoShowPenalty: jest.fn(),
};

const badgesMock = {
  awardIfEligible: jest.fn(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SchedulerService', () => {
  let service: SchedulerService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ScoringService, useValue: scoringMock },
        { provide: BadgesService, useValue: badgesMock },
      ],
    }).compile();

    service = module.get<SchedulerService>(SchedulerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── checkNoShows ────────────────────────────────────────────────────────────

  describe('checkNoShows', () => {
    it('does nothing when no overdue participants exist', async () => {
      prismaMock.matchParticipant.findMany.mockResolvedValue([]);

      await service.checkNoShows();

      expect(scoringMock.applyNoShowPenalty).not.toHaveBeenCalled();
    });

    it('calls applyNoShowPenalty for each unpenalised participant', async () => {
      prismaMock.matchParticipant.findMany.mockResolvedValue([
        { id: 'p1', userId: 'u1' },
        { id: 'p2', userId: 'u2' },
      ]);
      prismaMock.notification.findMany.mockResolvedValue([]);
      scoringMock.applyNoShowPenalty.mockResolvedValue(undefined);

      await service.checkNoShows();

      expect(scoringMock.applyNoShowPenalty).toHaveBeenCalledTimes(2);
      expect(scoringMock.applyNoShowPenalty).toHaveBeenCalledWith('p1');
      expect(scoringMock.applyNoShowPenalty).toHaveBeenCalledWith('p2');
    });

    it('skips participants who already have a penalty notification', async () => {
      prismaMock.matchParticipant.findMany.mockResolvedValue([
        { id: 'p1', userId: 'u1' },
        { id: 'p2', userId: 'u2' },
      ]);
      // Only p1 was already penalised
      prismaMock.notification.findMany.mockResolvedValue([
        { data: { participantId: 'p1' } },
      ]);
      scoringMock.applyNoShowPenalty.mockResolvedValue(undefined);

      await service.checkNoShows();

      expect(scoringMock.applyNoShowPenalty).toHaveBeenCalledTimes(1);
      expect(scoringMock.applyNoShowPenalty).toHaveBeenCalledWith('p2');
    });

    it('does not throw on unexpected error', async () => {
      prismaMock.matchParticipant.findMany.mockRejectedValue(new Error('DB error'));

      await expect(service.checkNoShows()).resolves.not.toThrow();
    });
  });

  // ── awardBadges ─────────────────────────────────────────────────────────────

  describe('awardBadges', () => {
    it('awards match_10 badge to eligible users', async () => {
      prismaMock.matchParticipant.groupBy.mockResolvedValue([
        { userId: 'u1', _count: { id: 10 } },
      ]);
      prismaMock.$queryRaw.mockResolvedValue([]);
      badgesMock.awardIfEligible.mockResolvedValue(undefined);

      await service.awardBadges();

      expect(badgesMock.awardIfEligible).toHaveBeenCalledWith(
        'u1',
        'match_10',
        expect.objectContaining({ name: '10경기 달성' }),
      );
    });

    it('awards all three milestone badges when count >= 100', async () => {
      prismaMock.matchParticipant.groupBy.mockResolvedValue([
        { userId: 'u1', _count: { id: 100 } },
      ]);
      prismaMock.$queryRaw.mockResolvedValue([]);
      badgesMock.awardIfEligible.mockResolvedValue(undefined);

      await service.awardBadges();

      const calls = badgesMock.awardIfEligible.mock.calls.map(
        ([, type]: [string, string]) => type,
      );
      expect(calls).toContain('match_10');
      expect(calls).toContain('match_50');
      expect(calls).toContain('match_100');
    });

    it('awards no_show_free_10 badge when last 10 participations have no no-show', async () => {
      prismaMock.matchParticipant.groupBy.mockResolvedValue([]);

      // $queryRaw returns 10 rows for user u1 with arrivedAt set (no no-shows)
      const recentRows = Array.from({ length: 10 }, (_, i) => ({
        userId: 'u1',
        id: `p${i}`,
        arrivedAt: new Date(),
        rn: BigInt(i + 1),
      }));
      prismaMock.$queryRaw.mockResolvedValue(recentRows);
      prismaMock.notification.findMany.mockResolvedValue([]);
      badgesMock.awardIfEligible.mockResolvedValue(undefined);

      await service.awardBadges();

      expect(badgesMock.awardIfEligible).toHaveBeenCalledWith(
        'u1',
        'no_show_free_10',
        expect.objectContaining({ name: '무노쇼 10연속' }),
      );
    });

    it('does not award no_show_free_10 when fewer than 10 participations', async () => {
      prismaMock.matchParticipant.groupBy.mockResolvedValue([]);

      // Only 5 rows for u1 — not enough
      const recentRows = Array.from({ length: 5 }, (_, i) => ({
        userId: 'u1',
        id: `p${i}`,
        arrivedAt: new Date(),
        rn: BigInt(i + 1),
      }));
      prismaMock.$queryRaw.mockResolvedValue(recentRows);

      await service.awardBadges();

      expect(badgesMock.awardIfEligible).not.toHaveBeenCalledWith(
        'u1',
        'no_show_free_10',
        expect.anything(),
      );
    });

    it('does not throw on unexpected error', async () => {
      prismaMock.matchParticipant.groupBy.mockRejectedValue(new Error('DB error'));
      prismaMock.$queryRaw.mockResolvedValue([]);

      await expect(service.awardBadges()).resolves.not.toThrow();
    });
  });
});
