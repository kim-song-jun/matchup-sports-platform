import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AdminUserAuditAction,
  AdminUserStatus,
  LessonStatus,
  MatchStatus,
  MercenaryPostStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  SettlementStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PAGINATION } from '../common/constants/pagination';
import { CreateLessonAdminDto } from './dto/create-lesson-admin.dto';
import { CreateTeamAdminDto } from './dto/create-team-admin.dto';
import { CreateVenueAdminDto, UpdateVenueAdminDto } from './dto/create-venue-admin.dto';

export interface AdminAuditEntry {
  id: string;
  action: string;
  actor: string;
  note: string | null;
  createdAt: Date;
}

const RECENT_MONTH_WINDOW = 6;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats() {
    const todayStart = this.startOfDay(new Date());

    const [
      userCount,
      matchCount,
      lessonCount,
      teamCount,
      venueCount,
      listingCount,
      todayMatches,
      todayUsers,
      activeTeams,
      totalRevenueAggregate,
      pendingReports,
      pendingSettlements,
      todayReports,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.match.count(),
      this.prisma.lesson.count(),
      this.prisma.sportTeam.count(),
      this.prisma.venue.count(),
      this.prisma.marketplaceListing.count({ where: { status: 'active' } }),
      this.prisma.match.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.user.count({ where: { createdAt: { gte: todayStart }, deletedAt: null } }),
      this.prisma.sportTeam.count({ where: { isRecruiting: true } }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.completed },
        _sum: { amount: true },
      }),
      this.prisma.report.count({ where: { status: 'pending' } }),
      this.prisma.settlementRecord.count({ where: { status: 'pending' } }),
      this.prisma.report.count({ where: { createdAt: { gte: todayStart } } }),
    ]);

    return {
      totalUsers: userCount,
      totalMatches: matchCount,
      totalLessons: lessonCount,
      totalTeams: teamCount,
      totalVenues: venueCount,
      activeListings: listingCount,
      todayMatches,
      todayNewUsers: todayUsers,
      activeTeams,
      totalRevenue: totalRevenueAggregate._sum.amount ?? 0,
      pendingReports,
      pendingSettlements,
      todayReports,
    };
  }

  async getStatisticsOverview() {
    const monthBuckets = this.buildMonthBuckets(RECENT_MONTH_WINDOW);
    const rangeStart = monthBuckets[0].start;
    const rangeEnd = monthBuckets[monthBuckets.length - 1].end;
    const thisMonthStart = this.startOfMonth(new Date());
    const lastMonthStart = this.startOfMonth(this.addMonths(thisMonthStart, -1));
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      recentMatches,
      recentPayments,
      totalUsers,
      thisMonthUsers,
      lastMonthUsers,
      totalTeams,
      activeParticipantRows,
      activeHostRows,
    ] = await Promise.all([
      this.prisma.match.findMany({
        where: { matchDate: { gte: rangeStart, lt: rangeEnd } },
        select: {
          id: true,
          sportType: true,
          matchDate: true,
          venueId: true,
          venue: {
            select: {
              id: true,
              name: true,
              city: true,
              district: true,
              rating: true,
            },
          },
        },
      }),
      this.prisma.payment.findMany({
        where: {
          status: PaymentStatus.completed,
          OR: [
            { paidAt: { gte: rangeStart, lt: rangeEnd } },
            {
              paidAt: null,
              createdAt: { gte: rangeStart, lt: rangeEnd },
            },
          ],
        },
        select: {
          id: true,
          amount: true,
          createdAt: true,
          paidAt: true,
          participant: {
            select: {
              match: {
                select: {
                  id: true,
                  venueId: true,
                  venue: {
                    select: {
                      id: true,
                      name: true,
                      city: true,
                      district: true,
                      rating: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { createdAt: { gte: thisMonthStart }, deletedAt: null } }),
      this.prisma.user.count({
        where: {
          createdAt: { gte: lastMonthStart, lt: thisMonthStart },
          deletedAt: null,
        },
      }),
      this.prisma.sportTeam.count(),
      this.prisma.matchParticipant.findMany({
        where: { joinedAt: { gte: thirtyDaysAgo } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.match.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { hostId: true },
        distinct: ['hostId'],
      }),
    ]);

    const matchTrend = monthBuckets.map((bucket) => ({ month: bucket.label, count: 0 }));
    const revenueTrend = monthBuckets.map((bucket) => ({ month: bucket.label, revenue: 0 }));
    const sportDistributionMap = new Map<string, number>();
    const venueStats = new Map<
      string,
      { name: string; city: string; matches: number; revenue: number; rating: number }
    >();

    for (const match of recentMatches) {
      const monthKey = this.monthKey(match.matchDate);
      const monthIndex = monthBuckets.findIndex((bucket) => bucket.key === monthKey);
      if (monthIndex >= 0) {
        matchTrend[monthIndex].count += 1;
      }

      sportDistributionMap.set(
        match.sportType,
        (sportDistributionMap.get(match.sportType) ?? 0) + 1,
      );

      if (match.venueId && match.venue) {
        const current = venueStats.get(match.venueId) ?? {
          name: match.venue.name,
          city: [match.venue.city, match.venue.district].filter(Boolean).join(' '),
          matches: 0,
          revenue: 0,
          rating: match.venue.rating ?? 0,
        };
        current.matches += 1;
        venueStats.set(match.venueId, current);
      }
    }

    for (const payment of recentPayments) {
      const bucketedAt = payment.paidAt ?? payment.createdAt;
      const monthKey = this.monthKey(bucketedAt);
      const monthIndex = monthBuckets.findIndex((bucket) => bucket.key === monthKey);
      if (monthIndex >= 0) {
        revenueTrend[monthIndex].revenue += payment.amount;
      }

      const venue = payment.participant.match.venue;
      const venueId = payment.participant.match.venueId;
      if (venueId && venue) {
        const current = venueStats.get(venueId) ?? {
          name: venue.name,
          city: [venue.city, venue.district].filter(Boolean).join(' '),
          matches: 0,
          revenue: 0,
          rating: venue.rating ?? 0,
        };
        current.revenue += payment.amount;
        venueStats.set(venueId, current);
      }
    }

    const activeUserIds = new Set([
      ...activeParticipantRows.map((row) => row.userId),
      ...activeHostRows.map((row) => row.hostId),
    ]);

    return {
      periodLabel: '최근 6개월',
      matchTrend,
      revenueTrend,
      sportDistribution: [...sportDistributionMap.entries()]
        .map(([sport, count]) => ({ sport, count }))
        .sort((a, b) => b.count - a.count),
      topVenues: [...venueStats.values()]
        .sort((a, b) => {
          if (b.matches !== a.matches) {
            return b.matches - a.matches;
          }
          return b.revenue - a.revenue;
        })
        .slice(0, 5),
      userGrowth: {
        totalUsers,
        thisMonth: thisMonthUsers,
        lastMonth: lastMonthUsers,
        growthRate: this.calculateGrowthRate(thisMonthUsers, lastMonthUsers),
        activeUsers: activeUserIds.size,
        teamCount: totalTeams,
      },
    };
  }

  async getUsers(filter: { search?: string; cursor?: string }) {
    const limit = PAGINATION.DEFAULT_LIMIT;
    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (filter.search) {
      where.nickname = { contains: filter.search, mode: 'insensitive' };
    }

    const items = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        nickname: true,
        email: true,
        gender: true,
        mannerScore: true,
        totalMatches: true,
        sportTypes: true,
        locationCity: true,
        oauthProvider: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });

    const hasNext = items.length > limit;
    const result = hasNext ? items.slice(0, limit) : items;
    return { items: result, nextCursor: hasNext ? result[result.length - 1].id : null };
  }

  async getUserDetail(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        nickname: true,
        email: true,
        profileImageUrl: true,
        gender: true,
        bio: true,
        mannerScore: true,
        totalMatches: true,
        locationCity: true,
        locationDistrict: true,
        createdAt: true,
        sportTypes: true,
        sportProfiles: true,
        oauthProvider: true,
        adminStatus: true,
        adminSuspensionReason: true,
        receivedAdminAuditLogs: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            action: true,
            actorLabel: true,
            note: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    const auditLog: AdminAuditEntry[] = user.receivedAdminAuditLogs.map((entry) => ({
      id: entry.id,
      action: entry.action,
      actor: entry.actorLabel,
      note: entry.note,
      createdAt: entry.createdAt,
    }));

    return {
      ...user,
      provider: user.oauthProvider,
      adminStatus: user.adminStatus,
      warningCount: auditLog.filter((entry) => entry.action === AdminUserAuditAction.warn).length,
      suspensionReason: user.adminSuspensionReason,
      adminAuditLog: auditLog,
    };
  }

  async warnUser(
    id: string,
    payload: { actorId?: string; actorLabel: string; note?: string },
  ) {
    await this.ensureUserExists(id);

    const auditEntry = await this.prisma.adminUserAuditLog.create({
      data: {
        userId: id,
        actorId: payload.actorId,
        actorLabel: payload.actorLabel,
        action: AdminUserAuditAction.warn,
        note: this.normalizeOptionalText(payload.note),
      },
    });

    const warningCount = await this.prisma.adminUserAuditLog.count({
      where: {
        userId: id,
        action: AdminUserAuditAction.warn,
      },
    });

    return {
      userId: id,
      action: AdminUserAuditAction.warn,
      warningCount,
      auditEntry: {
        id: auditEntry.id,
        action: auditEntry.action,
        actor: auditEntry.actorLabel,
        note: auditEntry.note,
        createdAt: auditEntry.createdAt,
      },
    };
  }

  async updateUserStatus(
    id: string,
    payload: { actorId?: string; actorLabel: string; status: AdminUserStatus; note?: string },
  ) {
    await this.ensureUserExists(id);

    const normalizedNote = this.normalizeOptionalText(payload.note);
    if (payload.status === AdminUserStatus.suspended && !normalizedNote) {
      throw new BadRequestException('계정 정지 사유를 입력해주세요.');
    }

    const auditAction =
      payload.status === AdminUserStatus.suspended
        ? AdminUserAuditAction.suspend
        : AdminUserAuditAction.reactivate;

    const { auditEntry } = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          adminStatus: payload.status,
          adminSuspensionReason:
            payload.status === AdminUserStatus.suspended ? normalizedNote : null,
        },
      });

      const createdAudit = await tx.adminUserAuditLog.create({
        data: {
          userId: id,
          actorId: payload.actorId,
          actorLabel: payload.actorLabel,
          action: auditAction,
          note: normalizedNote,
        },
      });

      return { auditEntry: createdAudit };
    });

    return {
      userId: id,
      status: payload.status,
      suspensionReason:
        payload.status === AdminUserStatus.suspended ? normalizedNote : null,
      auditEntry: {
        id: auditEntry.id,
        action: auditEntry.action,
        actor: auditEntry.actorLabel,
        note: auditEntry.note,
        createdAt: auditEntry.createdAt,
      },
    };
  }

  async getMatches(filter: { status?: string; cursor?: string }) {
    const limit = PAGINATION.DEFAULT_LIMIT;
    const where: Prisma.MatchWhereInput = {};
    if (filter.status) {
      where.status = filter.status as MatchStatus;
    }

    const items = await this.prisma.match.findMany({
      where,
      include: {
        host: { select: { id: true, nickname: true } },
        venue: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });

    const hasNext = items.length > limit;
    const result = hasNext ? items.slice(0, limit) : items;
    return { items: result, nextCursor: hasNext ? result[result.length - 1].id : null };
  }

  async updateMatchStatus(id: string, status: MatchStatus) {
    return this.prisma.match.update({
      where: { id },
      data: { status },
    });
  }

  async getReviews(filter: { search?: string }) {
    const where: Prisma.ReviewWhereInput = {};
    if (filter.search) {
      const query = filter.search.trim();
      where.OR = [
        { match: { title: { contains: query, mode: 'insensitive' } } },
        { author: { nickname: { contains: query, mode: 'insensitive' } } },
        { target: { nickname: { contains: query, mode: 'insensitive' } } },
      ];
    }

    const reviews = await this.prisma.review.findMany({
      where,
      include: {
        match: { select: { id: true, title: true } },
        author: { select: { id: true, nickname: true } },
        target: { select: { id: true, nickname: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: PAGINATION.ADMIN_EXPORT_LIMIT,
    });

    return reviews.map((review) => ({
      id: review.id,
      matchId: review.matchId,
      matchTitle: review.match.title,
      reviewerId: review.authorId,
      reviewerName: review.author.nickname,
      targetId: review.targetId,
      targetName: review.target.nickname,
      mannerRating: review.mannerRating,
      skillRating: review.skillRating,
      createdAt: review.createdAt,
    }));
  }

  async getLessons() {
    return this.prisma.lesson.findMany({
      include: { host: { select: { id: true, nickname: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getTeams() {
    return this.prisma.sportTeam.findMany({
      include: { owner: { select: { id: true, nickname: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getTeamDetail(id: string) {
    const team = await this.prisma.sportTeam.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            nickname: true,
            email: true,
            profileImageUrl: true,
            mannerScore: true,
          },
        },
        memberships: {
          where: { status: 'active' },
          orderBy: { joinedAt: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                nickname: true,
                email: true,
                profileImageUrl: true,
                mannerScore: true,
              },
            },
          },
        },
        teamMatches: {
          orderBy: { matchDate: 'desc' },
          take: 5,
          select: {
            id: true,
            title: true,
            matchDate: true,
            startTime: true,
            endTime: true,
            venueName: true,
            totalFee: true,
            opponentFee: true,
            status: true,
          },
        },
      },
    });

    if (!team) {
      throw new NotFoundException('팀을 찾을 수 없습니다.');
    }

    const members = team.memberships
      .map((membership) => ({
        id: membership.user.id,
        nickname: membership.user.nickname,
        email: membership.user.email,
        profileImageUrl: membership.user.profileImageUrl,
        mannerScore: membership.user.mannerScore,
        role: membership.role,
        joinedAt: membership.joinedAt,
      }))
      .sort((left, right) => this.rankTeamRole(left.role) - this.rankTeamRole(right.role));

    return {
      ...team,
      members,
      recentTeamMatches: team.teamMatches,
    };
  }

  async getMercenaryPosts(filter: { search?: string; status?: MercenaryPostStatus }) {
    const where: Prisma.MercenaryPostWhereInput = {};
    if (filter.status) {
      where.status = filter.status;
    }
    if (filter.search) {
      const query = filter.search.trim();
      where.OR = [
        { id: { contains: query, mode: 'insensitive' } },
        { position: { contains: query, mode: 'insensitive' } },
        { venue: { contains: query, mode: 'insensitive' } },
        { team: { name: { contains: query, mode: 'insensitive' } } },
      ];
    }

    const posts = await this.prisma.mercenaryPost.findMany({
      where,
      include: {
        team: { select: { id: true, name: true, sportTypes: true } },
        author: { select: { id: true, nickname: true } },
        _count: { select: { applications: true } },
      },
      orderBy: [{ matchDate: 'desc' }, { createdAt: 'desc' }],
      take: PAGINATION.ADMIN_EXPORT_LIMIT,
    });

    return posts.map(({ _count, ...post }) => ({
      ...post,
      applicationCount: _count.applications,
    }));
  }

  async deleteMercenaryPost(id: string) {
    const post = await this.prisma.mercenaryPost.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!post) {
      throw new NotFoundException('용병 모집글을 찾을 수 없습니다.');
    }

    await this.prisma.mercenaryPost.delete({ where: { id } });
    return { id };
  }

  async createLesson(data: CreateLessonAdminDto) {
    return this.prisma.lesson.create({
      data: {
        hostId: data.hostId,
        sportType: data.sportType,
        type: data.type,
        title: data.title,
        description: data.description,
        venueName: data.venueName,
        venueId: data.venueId,
        lessonDate: new Date(data.lessonDate),
        startTime: data.startTime,
        endTime: data.endTime,
        maxParticipants: data.maxParticipants,
        fee: data.fee ?? 0,
        levelMin: data.levelMin ?? 1,
        levelMax: data.levelMax ?? 5,
        coachName: data.coachName,
        coachBio: data.coachBio,
        coachImageUrl: data.coachImageUrl,
        imageUrls: data.imageUrls ?? [],
        isRecurring: data.isRecurring ?? false,
        recurringDays: data.recurringDays ?? [],
        recurringUntil: data.recurringUntil ? new Date(data.recurringUntil) : undefined,
      },
    });
  }

  async updateLessonStatus(id: string, status: LessonStatus) {
    return this.prisma.lesson.update({
      where: { id },
      data: { status },
    });
  }

  async createTeam(data: CreateTeamAdminDto) {
    // task 19 fix: admin-created teams must also get an owner TeamMembership row,
    // otherwise every TeamMembershipService.assertRole check fails on the team.
    // Mirrors TeamsService.create transactional behavior.
    return this.prisma.$transaction(async (tx) => {
      const team = await tx.sportTeam.create({
        data: {
          ownerId: data.ownerId,
          name: data.name,
          sportTypes: data.sportTypes,
          description: data.description,
          logoUrl: data.logoUrl,
          coverImageUrl: data.coverImageUrl,
          photos: data.photos ?? [],
          city: data.city,
          district: data.district,
          memberCount: data.memberCount ?? 1,
          level: data.level ?? 3,
          isRecruiting: data.isRecruiting ?? true,
          contactInfo: data.contactInfo,
          instagramUrl: data.instagramUrl,
          youtubeUrl: data.youtubeUrl,
          shortsUrl: data.shortsUrl,
          kakaoOpenChat: data.kakaoOpenChat,
          websiteUrl: data.websiteUrl,
        },
      });

      await tx.teamMembership.create({
        data: {
          teamId: team.id,
          userId: data.ownerId,
          role: 'owner',
          status: 'active',
        },
      });

      return team;
    });
  }

  async getVenues() {
    return this.prisma.venue.findMany({
      orderBy: { createdAt: 'desc' },
      take: PAGINATION.ADMIN_EXPORT_LIMIT,
    });
  }

  async getVenueDetail(id: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id },
      include: {
        venueReviews: {
          include: {
            user: { select: { id: true, nickname: true, profileImageUrl: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!venue) {
      throw new NotFoundException('시설을 찾을 수 없습니다.');
    }

    return venue;
  }

  async createVenue(data: CreateVenueAdminDto) {
    if (data.ownerId) {
      await this.ensureUserExists(data.ownerId);
    }

    return this.prisma.venue.create({
      data: {
        ownerId: data.ownerId,
        name: data.name,
        type: data.type,
        sportTypes: data.sportTypes,
        address: data.address,
        addressDetail: data.addressDetail,
        lat: data.lat,
        lng: data.lng,
        city: data.city,
        district: data.district,
        phone: data.phone,
        description: data.description,
        imageUrls: data.imageUrls ?? [],
        facilities: data.facilities ?? [],
        operatingHours: (data.operatingHours ?? {}) as Prisma.InputJsonValue,
        pricePerHour: data.pricePerHour,
        rinkSubType: data.rinkSubType,
      },
    });
  }

  async updateVenue(id: string, data: UpdateVenueAdminDto) {
    if (data.ownerId) {
      await this.ensureUserExists(data.ownerId);
    }

    return this.prisma.venue.update({
      where: { id },
      data: {
        ...(data.ownerId !== undefined ? { ownerId: data.ownerId } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.sportTypes !== undefined ? { sportTypes: data.sportTypes } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.addressDetail !== undefined ? { addressDetail: data.addressDetail } : {}),
        ...(data.lat !== undefined ? { lat: data.lat } : {}),
        ...(data.lng !== undefined ? { lng: data.lng } : {}),
        ...(data.city !== undefined ? { city: data.city } : {}),
        ...(data.district !== undefined ? { district: data.district } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.imageUrls !== undefined ? { imageUrls: data.imageUrls } : {}),
        ...(data.facilities !== undefined ? { facilities: data.facilities } : {}),
        ...(data.operatingHours !== undefined ? { operatingHours: data.operatingHours as Prisma.InputJsonValue } : {}),
        ...(data.pricePerHour !== undefined ? { pricePerHour: data.pricePerHour } : {}),
        ...(data.rinkSubType !== undefined ? { rinkSubType: data.rinkSubType } : {}),
      },
    });
  }

  async deleteVenue(id: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!venue) {
      throw new NotFoundException('시설을 찾을 수 없습니다.');
    }

    const [matchCount, lessonCount] = await Promise.all([
      this.prisma.match.count({ where: { venueId: id } }),
      this.prisma.lesson.count({ where: { venueId: id } }),
    ]);

    if (matchCount > 0 || lessonCount > 0) {
      throw new BadRequestException('연결된 경기나 강좌가 있어 시설을 삭제할 수 없습니다.');
    }

    await this.prisma.venue.delete({ where: { id } });
    return { id };
  }

  async getPayments(cursor?: string, limit?: number) {
    const take = Math.min(limit ?? PAGINATION.DEFAULT_LIMIT, PAGINATION.ADMIN_EXPORT_LIMIT);

    const items = await this.prisma.payment.findMany({
      include: {
        user: { select: { id: true, nickname: true, email: true, profileImageUrl: true } },
        participant: {
          include: {
            match: {
              include: {
                venue: { select: { id: true, name: true, address: true } },
              },
            },
          },
        },
      },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > take;
    if (hasMore) items.pop();

    return {
      items,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  /**
   * Admin force-releases escrow for a marketplace order.
   * Transitions order from any pre-completion escrow state to auto_released.
   * Releases the held settlement record atomically.
   * Does NOT issue a Toss cancellation — only use when buyer or seller has agreed.
   *
   * @param orderId - MarketplaceOrder.id (PK)
   * @param adminId - Admin user performing the operation (for audit trail)
   */
  async forceReleaseOrder(orderId: string, adminId: string) {
    const releasableStatuses: OrderStatus[] = [
      OrderStatus.escrow_held,
      OrderStatus.shipped,
      OrderStatus.delivered,
      OrderStatus.disputed,
    ];

    const order = await this.prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      select: { id: true, orderId: true, status: true, sellerId: true },
    });
    if (!order) throw new NotFoundException(`주문 ${orderId}을(를) 찾을 수 없습니다.`);
    if (!releasableStatuses.includes(order.status)) {
      throw new BadRequestException(
        `ORDER_INVALID_STATE: 현재 상태(${order.status})에서는 강제 지급할 수 없습니다.`,
      );
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.marketplaceOrder.updateMany({
        where: { id: orderId, status: { in: releasableStatuses } },
        data: { status: OrderStatus.auto_released, releasedAt: now, completedAt: now },
      });
      if (updateResult.count === 0) {
        throw new ConflictException(
          'ORDER_RACE: 주문 상태가 동시에 변경되었습니다.',
        );
      }

      // Release held settlement inside transaction
      const settlementResult = await tx.settlementRecord.updateMany({
        where: { orderId, status: SettlementStatus.held },
        data: { status: SettlementStatus.completed, releasedAt: now, processedAt: now },
      });
      if (settlementResult.count === 0) {
        // Settlement may already be completed (idempotent) — check
        const existing = await tx.settlementRecord.findFirst({
          where: { orderId, status: SettlementStatus.completed },
        });
        if (!existing) {
          throw new NotFoundException(`주문 ${orderId}의 에스크로 정산 레코드를 찾을 수 없습니다.`);
        }
      }

      return tx.marketplaceOrder.findUniqueOrThrow({ where: { id: orderId } });
    });
  }

  private async ensureUserExists(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }
  }

  private normalizeOptionalText(value?: string) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private startOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  private startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private addMonths(date: Date, delta: number) {
    return new Date(date.getFullYear(), date.getMonth() + delta, 1);
  }

  private buildMonthBuckets(count: number) {
    const currentMonthStart = this.startOfMonth(new Date());

    return Array.from({ length: count }, (_, index) => {
      const start = this.addMonths(currentMonthStart, index - (count - 1));
      const end = this.addMonths(start, 1);

      return {
        key: this.monthKey(start),
        label: `${start.getMonth() + 1}월`,
        start,
        end,
      };
    });
  }

  private monthKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private calculateGrowthRate(current: number, previous: number) {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }

    return Number((((current - previous) / previous) * 100).toFixed(1));
  }

  private rankTeamRole(role: string) {
    switch (role) {
      case 'owner':
        return 0;
      case 'manager':
        return 1;
      default:
        return 2;
    }
  }
}
