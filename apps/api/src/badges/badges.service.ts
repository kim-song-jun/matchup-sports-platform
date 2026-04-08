import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';

const BADGE_TYPES = [
  {
    type: 'manner_player',
    name: '매너 플레이어',
    description: '상대팀에게 높은 매너 점수를 받은 팀',
  },
  {
    type: 'punctual',
    name: '시간 엄수',
    description: '경기 시간을 항상 잘 지키는 팀',
  },
  {
    type: 'referee_hero',
    name: '심판 영웅',
    description: '자체 심판으로 다수 참여한 팀',
  },
  {
    type: 'honest_team',
    name: '정직한 팀',
    description: '팀 정보를 정확하게 기재하는 팀',
  },
  {
    type: 'newcomer',
    name: '신생팀',
    description: '플랫폼에 새로 가입한 팀',
  },
  {
    type: 'winning_streak',
    name: '연승 행진',
    description: '5연승 이상 달성한 팀',
  },
  {
    type: 'community_star',
    name: '커뮤니티 스타',
    description: '활발한 커뮤니티 활동을 하는 팀',
  },
];

@Injectable()
export class BadgesService {
  private readonly logger = new Logger(BadgesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  getBadgeTypes() {
    return BADGE_TYPES;
  }

  /**
   * Award a user-level badge if not already granted.
   * Uses the Notification table as the source of truth for awarded badges,
   * since the current Badge model is team-scoped. A dedicated UserBadge model
   * would be preferred long-term.
   */
  async awardIfEligible(
    userId: string,
    type: string,
    meta: { name: string; description?: string },
  ): Promise<boolean> {
    // Check notification history for prior award of this badge type
    const existing = await this.prisma.notification.findFirst({
      where: {
        userId,
        type: NotificationType.badge_earned,
        data: { path: ['badgeType'], equals: type },
      },
      select: { id: true },
    });
    if (existing) return false;

    await this.notifications.create({
      userId,
      type: NotificationType.badge_earned,
      title: `뱃지 획득: ${meta.name}`,
      body: meta.description ?? '',
      data: { badgeType: type },
    });
    this.logger.log(`Badge awarded: user=${userId} type=${type}`);
    return true;
  }

  async getTeamBadges(teamId: string) {
    return this.prisma.badge.findMany({
      where: { teamId },
      orderBy: { earnedAt: 'desc' },
    });
  }

  async awardBadge(
    teamId: string,
    data: { type: string; name: string; description?: string },
  ) {
    return this.prisma.badge.create({
      data: {
        teamId,
        type: data.type,
        name: data.name,
        description: data.description,
      },
    });
  }
}
