import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType, SportType } from '@prisma/client';

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Calculates new ELO ratings for winner and loser.
   * Returns [newWinnerRating, newLoserRating].
   */
  calculateElo(
    winnerRating: number,
    loserRating: number,
    kFactor = 32,
  ): [number, number] {
    const expectedWinner =
      1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
    const expectedLoser = 1 - expectedWinner;

    const newWinnerRating = Math.round(
      winnerRating + kFactor * (1 - expectedWinner),
    );
    const newLoserRating = Math.round(
      loserRating + kFactor * (0 - expectedLoser),
    );

    return [newWinnerRating, newLoserRating];
  }

  /**
   * Updates ELO ratings for all participants after a match completes.
   * Winner is determined by higher average skillRating in reviews.
   * Fire-and-forget safe — logs errors instead of throwing.
   */
  async updateEloAfterMatch(matchId: string): Promise<void> {
    try {
      const match = await this.prisma.match.findUnique({
        where: { id: matchId },
        select: {
          sportType: true,
          participants: {
            where: { status: 'confirmed' },
            select: {
              id: true,
              userId: true,
              teamId: true,
            },
          },
          reviews: {
            select: {
              targetId: true,
              skillRating: true,
            },
          },
        },
      });

      if (!match || match.participants.length === 0) {
        return;
      }

      // Build average skill rating per user from reviews
      const ratingMap = new Map<string, { total: number; count: number }>();
      for (const review of match.reviews) {
        const entry = ratingMap.get(review.targetId) ?? { total: 0, count: 0 };
        entry.total += review.skillRating;
        entry.count += 1;
        ratingMap.set(review.targetId, entry);
      }

      // Group participants by team; fall back to splitting by index when no teams
      const teamGroups = new Map<string, string[]>();
      for (const p of match.participants) {
        const key = p.teamId ?? (match.participants.indexOf(p) % 2 === 0 ? '__a' : '__b');
        const group = teamGroups.get(key) ?? [];
        group.push(p.userId);
        teamGroups.set(key, group);
      }

      const teams = Array.from(teamGroups.entries());
      if (teams.length < 2) {
        // Single-team match — no ELO update needed
        return;
      }

      // Determine winner team by average skillRating
      const teamAvgRating = (userIds: string[]): number => {
        let total = 0;
        let count = 0;
        for (const uid of userIds) {
          const r = ratingMap.get(uid);
          if (r && r.count > 0) {
            total += r.total / r.count;
            count += 1;
          }
        }
        return count > 0 ? total / count : 0;
      };

      const [teamAKey, teamAUsers] = teams[0];
      const [teamBKey, teamBUsers] = teams[1];
      void teamAKey;
      void teamBKey;

      const avgA = teamAvgRating(teamAUsers);
      const avgB = teamAvgRating(teamBUsers);

      const winnerUsers = avgA >= avgB ? teamAUsers : teamBUsers;
      const loserUsers = avgA >= avgB ? teamBUsers : teamAUsers;

      const sportType = match.sportType;

      await this.applyEloUpdates(sportType, winnerUsers, loserUsers, matchId);
    } catch (err) {
      this.logger.error(`updateEloAfterMatch failed for match ${matchId}`, err);
    }
  }

  /**
   * Applies ELO -30 and manner -0.5 penalty to a no-show participant.
   */
  async applyNoShowPenalty(participantId: string): Promise<void> {
    const participant = await this.prisma.matchParticipant.findUnique({
      where: { id: participantId },
      select: {
        userId: true,
        match: { select: { sportType: true } },
      },
    });

    if (!participant) {
      return;
    }

    const { userId } = participant;
    const sportType = participant.match.sportType;

    // Apply ELO decrement and manner score penalty atomically
    await this.prisma.$transaction(async (tx) => {
      // Decrement ELO by 30 (floor at 0)
      await tx.userSportProfile.updateMany({
        where: { userId, sportType },
        data: { eloRating: { decrement: 30 } },
      });

      // Clamp eloRating to minimum 0
      await tx.$executeRaw`
        UPDATE user_sport_profiles
        SET elo_rating = GREATEST(elo_rating, 0)
        WHERE user_id = ${userId}
          AND sport_type = ${sportType}::"SportType"
      `;

      // Decrement manner score by 0.5 (floor at 0)
      await tx.$executeRaw`
        UPDATE users
        SET manner_score = GREATEST(manner_score - 0.5, 0)
        WHERE id = ${userId}
      `;
    });

    void this.notifications.create({
      userId,
      type: NotificationType.no_show_penalty,
      title: '노쇼 패널티가 적용되었어요',
      body: 'ELO -30, 매너 점수 -0.5가 적용되었습니다.',
      data: { participantId },
    });
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async applyEloUpdates(
    sportType: SportType,
    winnerUserIds: string[],
    loserUserIds: string[],
    matchId: string,
  ): Promise<void> {
    const allUserIds = [...winnerUserIds, ...loserUserIds];

    // Fetch all sport profiles in a single query
    const profiles = await this.prisma.userSportProfile.findMany({
      where: { userId: { in: allUserIds }, sportType },
      select: { userId: true, eloRating: true },
    });

    const profileMap = new Map(profiles.map((p) => [p.userId, p.eloRating]));

    // Compute deltas in memory
    const opponentRating = 1000;
    const updates: Array<{ userId: string; newRating: number; isWinner: boolean }> = [];

    for (const uid of winnerUserIds) {
      const current = profileMap.get(uid);
      if (current === undefined) continue;
      const [newWinner] = this.calculateElo(current, opponentRating);
      updates.push({ userId: uid, newRating: newWinner, isWinner: true });
    }

    for (const uid of loserUserIds) {
      const current = profileMap.get(uid);
      if (current === undefined) continue;
      const [, newLoser] = this.calculateElo(opponentRating, current);
      updates.push({ userId: uid, newRating: newLoser, isWinner: false });
    }

    if (updates.length === 0) return;

    // Apply all rating updates in a single transaction
    await this.prisma.$transaction(
      updates.map(({ userId, newRating }) =>
        this.prisma.userSportProfile.update({
          where: { userId_sportType: { userId, sportType } },
          data: { eloRating: newRating },
        }),
      ),
    );

    // Fire-and-forget ELO notifications for all updated users
    for (const { userId, newRating, isWinner } of updates) {
      const current = profileMap.get(userId) ?? newRating;
      const delta = newRating - current;
      void this.notifications.create({
        userId,
        type: NotificationType.elo_changed,
        title: isWinner ? 'ELO가 올랐어요!' : 'ELO가 내려갔어요',
        body: `ELO ${delta > 0 ? '+' : ''}${delta} (현재: ${newRating})`,
        data: { matchId, delta, newRating },
      });
    }
  }
}
