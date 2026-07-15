import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { HomeQueryDto, HomeRecommendationsQueryDto } from './dto/home-query.dto';

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  async getHome(user: V1AuthUser | null, query: HomeQueryDto) {
    const [viewer, summary, recommendations, popup, notices, unreadCount, myTeamRoute] =
      await Promise.all([
        this.getViewer(user),
        this.getSummary(user),
        this.getRecommendationItems({ ...query, limit: 5 }),
        this.getActivePopup(),
        this.getRecentNotices(),
        this.getUnreadCount(user),
        this.getMyTeamRoute(user),
      ]);

    const featured = recommendations[0] ?? null;

    return {
      viewer,
      summary,
      featuredMatch: featured
        ? {
            matchId: featured.matchId,
            title: featured.title,
            reason: featured.recommendationReason,
            participantCount: featured.participantCount,
            capacity: featured.capacity,
          }
        : null,
      shortcuts: [
        { key: 'matches', enabled: true, route: '/matches', disabledReason: null },
        { key: 'team_matches', enabled: true, route: '/team-matches', disabledReason: null },
        { key: 'teams', enabled: true, route: '/teams', disabledReason: null },
        {
          key: 'my_team',
          enabled: true,
          route: myTeamRoute ?? (user ? '/my/teams' : '/login?redirect=/my/teams'),
          disabledReason: null,
        },
      ],
      recommendations: recommendations.map((item) => ({
        matchId: item.matchId,
        title: item.title,
        sportName: item.sportName,
        regionName: item.regionName,
        startsAt: item.startsAt,
      })),
      popup,
      notices,
      notifications: { unreadCount },
    };
  }

  async getRecommendations(user: V1AuthUser | null, query: HomeRecommendationsQueryDto) {
    return {
      items: await this.getRecommendationItems({
        ...query,
        limit: query.limit ?? 5,
        userId: user?.id,
      }),
      derived: true,
    };
  }

  private async getViewer(user: V1AuthUser | null) {
    if (!user) {
      return {
        authenticated: false,
        displayName: null,
        onboardingStatus: null,
      };
    }

    const profile = await this.prisma.v1UserProfile.findUnique({
      where: { userId: user.id },
      select: { displayName: true, nickname: true },
    });

    return {
      authenticated: true,
      displayName: profile?.displayName ?? profile?.nickname ?? null,
      onboardingStatus: user.onboardingStatus,
    };
  }

  private async getSummary(user: V1AuthUser | null) {
    if (!user) {
      return {
        monthlyMatches: null,
        mannerScore: null,
        trustState: 'none',
        pendingLabel: null,
      };
    }

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [monthlyMatches, reputation, pendingApplications] = await Promise.all([
      this.prisma.v1MatchParticipant.count({
        where: {
          userId: user.id,
          status: { in: ['active', 'completed'] },
          match: { startAt: { gte: monthStart } },
        },
      }),
      this.prisma.v1UserReputationSummary.findUnique({
        where: { userId: user.id },
        select: { mannerScore: true, trustState: true },
      }),
      this.prisma.v1MatchApplication.count({
        where: { applicantUserId: user.id, status: 'requested' },
      }),
    ]);

    return {
      monthlyMatches,
      mannerScore: reputation?.mannerScore ? Number(reputation.mannerScore) : null,
      trustState: reputation?.trustState ?? 'none',
      pendingLabel: pendingApplications > 0 ? `대기 중인 신청 ${pendingApplications}건` : null,
    };
  }

  private async getRecommendationItems(input: HomeRecommendationsQueryDto & { userId?: string }) {
    const limit = Math.min(Math.max(input.limit ?? 5, 1), 20);
    const where: Prisma.V1MatchWhereInput = {
      status: 'recruiting',
      deletedAt: null,
      ...(input.sportId ? { sportId: input.sportId } : {}),
      ...(input.regionId ? { regionId: input.regionId } : {}),
    };

    const matches = await this.prisma.v1Match.findMany({
      where,
      orderBy: [{ startAt: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      include: {
        sport: { select: { name: true } },
        region: { select: { name: true } },
        participants: { select: { id: true } },
        hostUser: {
          include: {
            reputationSummary: {
              select: { trustState: true },
            },
          },
        },
      },
    });

    return matches.map((match) => ({
      matchId: match.id,
      title: match.title,
      sportName: match.sport.name,
      regionName: match.region?.name ?? null,
      startsAt: match.startAt,
      participantCount: match.participants.length,
      capacity: match.maxParticipants,
      recommendationReason: input.userId ? '선호 정보 기반 추천' : '최근 모집 중인 매치',
      trustState: match.hostUser.reputationSummary?.trustState ?? 'none',
    }));
  }

  private async getActivePopup() {
    const now = new Date();
    const popup = await this.prisma.v1Popup.findFirst({
      where: {
        status: 'published',
        audience: 'public',
        AND: [
          { OR: [{ displayStartAt: null }, { displayStartAt: { lte: now } }] },
          { OR: [{ displayEndAt: null }, { displayEndAt: { gt: now } }] },
        ],
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, title: true, body: true, publishedAt: true },
    });

    return popup
      ? {
          popupId: popup.id,
          title: popup.title,
          body: popup.body,
          publishedAt: popup.publishedAt,
        }
      : null;
  }

  private async getRecentNotices() {
    const notices = await this.prisma.v1Notice.findMany({
      where: {
        status: 'published',
        audience: 'public',
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 3,
      select: { id: true, title: true, body: true, category: true, publishedAt: true },
    });

    return notices.map((notice) => ({
      noticeId: notice.id,
      title: notice.title,
      body: notice.body,
      category: notice.category,
      publishedAt: notice.publishedAt,
    }));
  }
  private async getUnreadCount(user: V1AuthUser | null) {
    if (!user) {
      return 0;
    }

    return this.prisma.v1Notification.count({
      where: { recipientUserId: user.id, readAt: null },
    });
  }

  private async getMyTeamRoute(user: V1AuthUser | null) {
    if (!user) {
      return null;
    }

    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: {
        userId: user.id,
        status: 'active',
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'desc' }],
      select: { teamId: true },
    });

    return membership ? `/teams/${membership.teamId}` : null;
  }
}
