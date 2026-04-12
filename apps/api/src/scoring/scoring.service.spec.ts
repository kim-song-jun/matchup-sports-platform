import { Test, TestingModule } from '@nestjs/testing';
import { ScoringService } from './scoring.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const prismaMock = {
  match: { findUnique: jest.fn() },
  matchParticipant: { findUnique: jest.fn() },
  userSportProfile: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  $executeRaw: jest.fn(),
  $transaction: jest.fn(),
};

const notificationsMock = {
  create: jest.fn(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('ScoringService', () => {
  let service: ScoringService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: $transaction resolves all operations
    prismaMock.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return arg(prismaMock);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoringService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsMock },
      ],
    }).compile();

    service = module.get<ScoringService>(ScoringService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── calculateElo ────────────────────────────────────────────────────────────

  describe('calculateElo', () => {
    it('returns higher rating for winner with equal starting ratings', () => {
      const [newWinner, newLoser] = service.calculateElo(1000, 1000);

      expect(newWinner).toBeGreaterThan(1000);
      expect(newLoser).toBeLessThan(1000);
    });

    it('total points are conserved (sum unchanged)', () => {
      const [newWinner, newLoser] = service.calculateElo(1000, 1000);

      expect(newWinner + newLoser).toBe(2000);
    });

    it('underdog winner gains more points than a favourite winner', () => {
      const [underdogWinner] = service.calculateElo(900, 1100);
      const [favouriteWinner] = service.calculateElo(1100, 900);

      const underdogGain = underdogWinner - 900;
      const favouriteGain = favouriteWinner - 1100;

      expect(underdogGain).toBeGreaterThan(favouriteGain);
    });

    it('respects custom kFactor', () => {
      const [winner16] = service.calculateElo(1000, 1000, 16);
      const [winner32] = service.calculateElo(1000, 1000, 32);

      expect(winner32 - 1000).toBeGreaterThan(winner16 - 1000);
    });

    it('returns integers', () => {
      const [w, l] = service.calculateElo(1234, 876);

      expect(Number.isInteger(w)).toBe(true);
      expect(Number.isInteger(l)).toBe(true);
    });
  });

  // ── updateEloAfterMatch ─────────────────────────────────────────────────────

  describe('updateEloAfterMatch', () => {
    it('does nothing when match is not found', async () => {
      prismaMock.match.findUnique.mockResolvedValue(null);

      await service.updateEloAfterMatch('non-existent');

      expect(prismaMock.userSportProfile.update).not.toHaveBeenCalled();
    });

    it('does nothing when match has no confirmed participants', async () => {
      prismaMock.match.findUnique.mockResolvedValue({
        sportType: 'futsal',
        participants: [],
        reviews: [],
      });

      await service.updateEloAfterMatch('match-1');

      expect(prismaMock.userSportProfile.update).not.toHaveBeenCalled();
    });

    it('does nothing when only one team is present', async () => {
      prismaMock.match.findUnique.mockResolvedValue({
        sportType: 'futsal',
        participants: [{ id: 'p1', userId: 'u1', teamId: 'team-1' }],
        reviews: [],
      });

      await service.updateEloAfterMatch('match-1');

      expect(prismaMock.userSportProfile.update).not.toHaveBeenCalled();
    });

    it('updates ELO for participants across two teams', async () => {
      prismaMock.match.findUnique.mockResolvedValue({
        sportType: 'futsal',
        participants: [
          { id: 'p1', userId: 'u1', teamId: 'team-a' },
          { id: 'p2', userId: 'u2', teamId: 'team-b' },
        ],
        reviews: [
          { targetId: 'u1', skillRating: 4.5 },
          { targetId: 'u2', skillRating: 3.0 },
        ],
      });

      prismaMock.userSportProfile.findMany.mockResolvedValue([
        { userId: 'u1', eloRating: 1000 },
        { userId: 'u2', eloRating: 1000 },
      ]);
      prismaMock.userSportProfile.update.mockResolvedValue({});
      notificationsMock.create.mockResolvedValue({});

      await service.updateEloAfterMatch('match-1');

      // $transaction is called once with all updates batched
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('does not throw on unexpected error (fire-and-forget safety)', async () => {
      prismaMock.match.findUnique.mockRejectedValue(new Error('DB error'));

      await expect(service.updateEloAfterMatch('match-1')).resolves.not.toThrow();
    });
  });

  // ── applyNoShowPenalty ──────────────────────────────────────────────────────

  describe('applyNoShowPenalty', () => {
    it('does nothing when participant is not found', async () => {
      prismaMock.matchParticipant.findUnique.mockResolvedValue(null);

      await service.applyNoShowPenalty('unknown-participant');

      expect(prismaMock.userSportProfile.updateMany).not.toHaveBeenCalled();
    });

    it('decrements ELO by 30 and sends penalty notification', async () => {
      prismaMock.matchParticipant.findUnique.mockResolvedValue({
        userId: 'u1',
        match: { sportType: 'futsal' },
      });
      prismaMock.userSportProfile.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.$executeRaw.mockResolvedValue(1);
      notificationsMock.create.mockResolvedValue({});

      await service.applyNoShowPenalty('participant-1');

      // All 3 DB operations run inside a single $transaction
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.userSportProfile.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1', sportType: 'futsal' },
          data: { eloRating: { decrement: 30 } },
        }),
      );
    });

    it('sends no_show_penalty notification', async () => {
      prismaMock.matchParticipant.findUnique.mockResolvedValue({
        userId: 'u1',
        match: { sportType: 'futsal' },
      });
      prismaMock.userSportProfile.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.$executeRaw.mockResolvedValue(1);
      notificationsMock.create.mockResolvedValue({});

      await service.applyNoShowPenalty('participant-1');

      expect(notificationsMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          type: 'no_show_penalty',
        }),
      );
    });
  });
});
