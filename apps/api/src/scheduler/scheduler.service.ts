import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { BadgesService } from '../badges/badges.service';

const BADGE_MATCH_MILESTONES = [
  { count: 10, type: 'match_10', name: '10경기 달성', description: '10경기를 완료한 사용자' },
  { count: 50, type: 'match_50', name: '50경기 달성', description: '50경기를 완료한 사용자' },
  { count: 100, type: 'match_100', name: '100경기 달성', description: '100경기를 완료한 사용자' },
];

const NO_SHOW_BADGE = {
  type: 'no_show_free_10',
  name: '무노쇼 10연속',
  description: '노쇼 없이 10경기를 연속 완료한 사용자',
};

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
    private readonly badges: BadgesService,
  ) {}

  /**
   * Every 10 minutes: find confirmed participants who haven't checked in
   * 30 minutes after match start and apply the no-show penalty.
   * Idempotency: skips participants who already have a no_show_penalty notification.
   */
  @Cron('0 */10 * * * *')
  async checkNoShows(): Promise<void> {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    try {
      const overdueParticipants = await this.prisma.matchParticipant.findMany({
        where: {
          arrivedAt: null,
          status: 'confirmed',
          match: {
            status: 'in_progress',
            matchDate: { lte: thirtyMinutesAgo },
          },
        },
        select: {
          id: true,
          userId: true,
        },
      });

      if (overdueParticipants.length === 0) {
        return;
      }

      // Filter out participants who already received the penalty
      const alreadyPenalised = await this.prisma.notification.findMany({
        where: {
          type: 'no_show_penalty',
          userId: { in: overdueParticipants.map((p) => p.userId) },
          data: {
            path: ['participantId'],
            string_contains: overdueParticipants.map((p) => p.id).join(','),
          },
        },
        select: { data: true },
      });

      const penalisedParticipantIds = new Set<string>(
        alreadyPenalised
          .map((n) => (n.data as Record<string, unknown> | null)?.['participantId'] as string | undefined)
          .filter((id): id is string => typeof id === 'string'),
      );

      const toProcess = overdueParticipants.filter(
        (p) => !penalisedParticipantIds.has(p.id),
      );

      if (toProcess.length === 0) {
        return;
      }

      this.logger.log(`Processing ${toProcess.length} no-show participant(s)`);

      for (const participant of toProcess) {
        await this.scoring.applyNoShowPenalty(participant.id);
      }
    } catch (err) {
      this.logger.error('checkNoShows failed', err);
    }
  }

  /**
   * Every day at midnight: award milestone and no-show-streak badges.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async awardBadges(): Promise<void> {
    try {
      await this.awardMatchMilestoneBadges();
      await this.awardNoShowStreakBadges();
    } catch (err) {
      this.logger.error('awardBadges failed', err);
    }
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private async awardMatchMilestoneBadges(): Promise<void> {
    const completionCounts = await this.prisma.matchParticipant.groupBy({
      by: ['userId'],
      where: { status: 'confirmed', match: { status: 'completed' } },
      _count: { id: true },
    });

    for (const row of completionCounts) {
      const total = row._count.id;
      for (const milestone of BADGE_MATCH_MILESTONES) {
        if (total >= milestone.count) {
          await this.badges.awardIfEligible(row.userId, milestone.type, {
            name: milestone.name,
            description: milestone.description,
          });
        }
      }
    }
  }

  private async awardNoShowStreakBadges(): Promise<void> {
    // Fetch the last 10 completed participations per user in a single aggregated query.
    // Using $queryRaw to rank rows per user and filter to rank <= 10 efficiently.
    const recentRows = await this.prisma.$queryRaw<
      Array<{ userId: string; id: string; arrivedAt: Date | null; rn: bigint }>
    >`
      SELECT "userId", id, "arrivedAt", rn FROM (
        SELECT user_id AS "userId", id, arrived_at AS "arrivedAt", row_number() OVER (
          PARTITION BY user_id ORDER BY joined_at DESC
        ) AS rn
        FROM match_participants mp
        WHERE mp.status = 'confirmed'
          AND EXISTS (
            SELECT 1 FROM matches m WHERE m.id = mp.match_id AND m.status = 'completed'
          )
      ) ranked WHERE rn <= 10
    `;

    // Group by user; only keep users who have at least 10 recent participations
    const byUser = new Map<string, Array<{ id: string; arrivedAt: Date | null }>>();
    for (const row of recentRows) {
      if (Number(row.rn) > 10) continue;
      const list = byUser.get(row.userId) ?? [];
      list.push({ id: row.id, arrivedAt: row.arrivedAt });
      byUser.set(row.userId, list);
    }

    const eligibleUserIds = Array.from(byUser.entries())
      .filter(([, parts]) => parts.length >= 10)
      .map(([userId]) => userId);

    if (eligibleUserIds.length === 0) return;

    // Fetch all no-show penalty notifications for eligible users in one query
    const penaltyNotifications = await this.prisma.notification.findMany({
      where: {
        userId: { in: eligibleUserIds },
        type: 'no_show_penalty',
      },
      select: { userId: true, data: true },
    });

    // Build per-user set of penalised participant IDs
    const penalisedByUser = new Map<string, Set<string>>();
    for (const n of penaltyNotifications) {
      const participantId = (n.data as Record<string, unknown> | null)?.['participantId'];
      if (typeof participantId !== 'string') continue;
      const set = penalisedByUser.get(n.userId) ?? new Set<string>();
      set.add(participantId);
      penalisedByUser.set(n.userId, set);
    }

    for (const userId of eligibleUserIds) {
      const participations = byUser.get(userId) ?? [];
      const penalisedIds = penalisedByUser.get(userId) ?? new Set<string>();

      const hasNoShow = participations.some(
        (p) => penalisedIds.has(p.id) || p.arrivedAt === null,
      );

      if (!hasNoShow) {
        await this.badges.awardIfEligible(userId, NO_SHOW_BADGE.type, {
          name: NO_SHOW_BADGE.name,
          description: NO_SHOW_BADGE.description,
        });
      }
    }
  }
}
