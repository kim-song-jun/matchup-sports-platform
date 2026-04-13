import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { RedisCacheService } from '../redis/redis-cache.service';

const VENUES_LIST_TTL = 300; // 5 minutes

@Injectable()
export class VenuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  async findAll(params?: { city?: string; type?: string; sportType?: string; cursor?: string; take?: number }) {
    const take = params?.take ?? 50;
    const where: Record<string, unknown> = {};
    if (params?.city) where.city = params.city;
    if (params?.type) where.type = params.type;
    if (params?.sportType) where.sportTypes = { has: params.sportType as never };

    const cacheKey = `venues:list:${JSON.stringify({ ...where, cursor: params?.cursor, take })}`;
    const cached = await this.cache.get<{ items: unknown[]; nextCursor: string | null }>(cacheKey);
    if (cached) return cached;

    const items = await this.prisma.venue.findMany({
      where,
      orderBy: { rating: 'desc' },
      take: take + 1,
      ...(params?.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > take;
    if (hasMore) items.pop();
    const result = { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };

    await this.cache.set(cacheKey, result, VENUES_LIST_TTL);
    return result;
  }

  async findOne(id: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, nickname: true, profileImageUrl: true },
        },
        venueReviews: {
          include: { user: { select: { id: true, nickname: true, profileImageUrl: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!venue) throw new NotFoundException('시설을 찾을 수 없습니다.');
    return venue;
  }

  async findHub(venueId: string, viewerId?: string, viewerRole?: string) {
    const [venue, goods, passes, events, schedule] = await Promise.all([
      this.findOne(venueId),
      this.prisma.marketplaceListing.findMany({
        where: {
          venueId,
          status: 'active',
        },
        include: {
          seller: {
            select: { id: true, nickname: true, profileImageUrl: true, mannerScore: true },
          },
          team: {
            select: { id: true, name: true },
          },
          venue: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 4,
      }),
      this.prisma.lesson.findMany({
        where: {
          venueId,
          status: 'open',
        },
        include: {
          host: {
            select: { id: true, nickname: true, profileImageUrl: true },
          },
          team: {
            select: { id: true, name: true },
          },
          ticketPlans: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              lessonId: true,
              name: true,
              type: true,
              price: true,
              originalPrice: true,
              totalSessions: true,
              validDays: true,
              description: true,
              isActive: true,
              sortOrder: true,
            },
          },
        },
        orderBy: { lessonDate: 'asc' },
        take: 4,
      }),
      this.prisma.tournament.findMany({
        where: {
          venueId,
          status: { in: ['recruiting', 'full', 'ongoing'] },
        },
        include: {
          organizer: {
            select: { id: true, nickname: true, profileImageUrl: true },
          },
          team: {
            select: { id: true, name: true, sportTypes: true, logoUrl: true },
          },
          venue: {
            select: { id: true, name: true, city: true, district: true, address: true },
          },
        },
        orderBy: { startDate: 'asc' },
        take: 4,
      }),
      this.getSchedule(venueId),
    ]);

    const [goodsCount, passesCount, eventsCount] = await Promise.all([
      this.prisma.marketplaceListing.count({
        where: { venueId, status: 'active' },
      }),
      this.prisma.lesson.count({
        where: { venueId, status: 'open' },
      }),
      this.prisma.tournament.count({
        where: { venueId, status: { in: ['recruiting', 'full', 'ongoing'] } },
      }),
    ]);

    const isAdmin = viewerRole === 'admin';
    const isOwner = !!viewerId && venue.ownerId === viewerId;
    const venueSummary = { id: venue.id, name: venue.name };

    return {
      venue,
      sections: {
        goodsCount,
        passesCount,
        eventsCount,
        scheduleCount: schedule.length,
        reviewCount: venue.reviewCount,
      },
      goods,
      passes: passes.map((pass) => ({
        ...pass,
        venue: venueSummary,
      })),
      events: events.map((event) => ({
        ...event,
        eventDate: event.startDate,
        venueName: event.venue?.name ?? null,
      })),
      capabilities: {
        canEditProfile: isAdmin || isOwner,
        canManageGoods: isAdmin || isOwner,
        canManagePasses: isAdmin || isOwner,
        canManageEvents: isAdmin || isOwner,
      },
    };
  }

  async getSchedule(venueId: string) {
    const now = new Date();
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    return this.prisma.match.findMany({
      where: {
        venueId,
        matchDate: { gte: now, lte: weekLater },
        status: { in: ['recruiting', 'full', 'in_progress'] as never[] },
      },
      select: { id: true, title: true, matchDate: true, startTime: true, endTime: true, sportType: true, status: true },
      orderBy: { matchDate: 'asc' },
    });
  }

  async createReview(venueId: string, userId: string, data: Record<string, unknown>) {
    const review = await this.prisma.venueReview.create({
      data: {
        venueId,
        userId,
        rating: data.rating as number,
        facilityRating: data.facilityRating as number,
        accessRating: data.accessRating as number,
        costRating: data.costRating as number,
        iceQuality: data.iceQuality as number | undefined,
        comment: data.comment as string | undefined,
        imageUrls: (data.imageUrls as string[]) || [],
      },
    });

    // 시설 평균 평점 업데이트
    const aggregate = await this.prisma.venueReview.aggregate({
      where: { venueId },
      _avg: { rating: true },
      _count: true,
    });

    await this.prisma.venue.update({
      where: { id: venueId },
      data: {
        rating: aggregate._avg.rating || 0,
        reviewCount: aggregate._count,
      },
    });

    await this.cache.delPattern('venues:*');

    return review;
  }

  async update(venueId: string, userId: string, userRole: string, data: UpdateVenueDto) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true, ownerId: true },
    });
    if (!venue) throw new NotFoundException('시설을 찾을 수 없습니다.');

    const isAdmin = userRole === 'admin';
    const isOwner = venue.ownerId != null && venue.ownerId === userId;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('시설을 수정할 권한이 없습니다.');
    }

    const updated = await this.prisma.venue.update({
      where: { id: venueId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.city !== undefined ? { city: data.city } : {}),
        ...(data.district !== undefined ? { district: data.district } : {}),
        ...(data.addressDetail !== undefined ? { addressDetail: data.addressDetail } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.imageUrls !== undefined ? { imageUrls: data.imageUrls } : {}),
        ...(data.facilities !== undefined ? { facilities: data.facilities } : {}),
        ...(data.operatingHours !== undefined
          ? { operatingHours: data.operatingHours as Prisma.InputJsonValue }
          : {}),
        ...(data.pricePerHour !== undefined ? { pricePerHour: data.pricePerHour } : {}),
      },
      include: {
        owner: {
          select: { id: true, nickname: true, profileImageUrl: true },
        },
      },
    });

    await this.cache.delPattern('venues:*');

    return updated;
  }
}
