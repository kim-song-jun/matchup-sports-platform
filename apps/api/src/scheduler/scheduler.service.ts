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
    const users = await this.prisma.user.findMany({
      select: { id: true },
    });

    for (const user of users) {
      const recentParticipations = await this.prisma.matchParticipant.findMany({
        where: {
          userId: user.id,
          status: 'confirmed',
          match: { status: 'completed' },
        },
        orderBy: { joinedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          arrivedAt: true,
        },
      });

      if (recentParticipations.length < 10) {
        continue;
      }

      // Check whether any of the last 10 completed participations have a no-show penalty notification
      const penaltyNotifications = await this.prisma.notification.findMany({
        where: {
          userId: user.id,
          type: 'no_show_penalty',
        },
        select: { data: true },
      });

      const penalisedIds = new Set<string>(
        penaltyNotifications
          .map((n) => (n.data as Record<string, unknown> | null)?.['participantId'] as string | undefined)
          .filter((id): id is string => typeof id === 'string'),
      );

      const hasNoShow = recentParticipations.some(
        (p) => penalisedIds.has(p.id) || p.arrivedAt === null,
      );

      if (!hasNoShow) {
        await this.badges.awardIfEligible(user.id, NO_SHOW_BADGE.type, {
          name: NO_SHOW_BADGE.name,
          description: NO_SHOW_BADGE.description,
        });
      }
    }
  }
}
