import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats() {
    const [userCount, matchCount, lessonCount, teamCount, venueCount, listingCount] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.match.count(),
      this.prisma.lesson.count(),
      this.prisma.sportTeam.count(),
      this.prisma.venue.count(),
      this.prisma.marketplaceListing.count({ where: { status: 'active' } }),
    ]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayMatches, todayUsers] = await Promise.all([
      this.prisma.match.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.user.count({ where: { createdAt: { gte: todayStart }, deletedAt: null } }),
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
    };
  }

  async getUsers(filter: { search?: string; cursor?: string }) {
    const limit = 20;
    const where: Record<string, unknown> = { deletedAt: null };
    if (filter.search) {
      where.nickname = { contains: filter.search, mode: 'insensitive' };
    }

    const items = await this.prisma.user.findMany({
      where,
      select: {
        id: true, nickname: true, email: true, gender: true,
        mannerScore: true, totalMatches: true, sportTypes: true,
        locationCity: true, oauthProvider: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(filter.cursor && { cursor: { id: filter.cursor }, skip: 1 }),
    });

    const hasNext = items.length > limit;
    const result = hasNext ? items.slice(0, limit) : items;
    return { items: result, nextCursor: hasNext ? result[result.length - 1].id : null };
  }

  async getMatches(filter: { status?: string; cursor?: string }) {
    const limit = 20;
    const where: Record<string, unknown> = {};
    if (filter.status) where.status = filter.status;

    const items = await this.prisma.match.findMany({
      where,
      include: {
        host: { select: { id: true, nickname: true } },
        venue: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(filter.cursor && { cursor: { id: filter.cursor }, skip: 1 }),
    });

    const hasNext = items.length > limit;
    const result = hasNext ? items.slice(0, limit) : items;
    return { items: result, nextCursor: hasNext ? result[result.length - 1].id : null };
  }

  async updateMatchStatus(id: string, status: string) {
    return this.prisma.match.update({
      where: { id },
      data: { status: status as never },
    });
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

  async createLesson(data: Record<string, unknown>) {
    return this.prisma.lesson.create({
      data: {
        hostId: data.hostId as string,
        sportType: data.sportType as never,
        type: data.type as never,
        title: data.title as string,
        description: data.description as string | undefined,
        venueName: data.venueName as string | undefined,
        venueId: data.venueId as string | undefined,
        lessonDate: new Date(data.lessonDate as string),
        startTime: data.startTime as string,
        endTime: data.endTime as string,
        maxParticipants: data.maxParticipants as number,
        fee: (data.fee as number) || 0,
        levelMin: (data.levelMin as number) || 1,
        levelMax: (data.levelMax as number) || 5,
        coachName: data.coachName as string | undefined,
        coachBio: data.coachBio as string | undefined,
        imageUrls: (data.imageUrls as string[]) || [],
      },
    });
  }

  async updateLessonStatus(id: string, status: string) {
    return this.prisma.lesson.update({
      where: { id },
      data: { status: status as never },
    });
  }

  async createTeam(data: Record<string, unknown>) {
    return this.prisma.sportTeam.create({
      data: {
        ownerId: data.ownerId as string,
        name: data.name as string,
        sportType: data.sportType as never,
        description: data.description as string | undefined,
        logoUrl: data.logoUrl as string | undefined,
        coverImageUrl: data.coverImageUrl as string | undefined,
        city: data.city as string | undefined,
        district: data.district as string | undefined,
        memberCount: (data.memberCount as number) || 1,
        level: (data.level as number) || 3,
        isRecruiting: data.isRecruiting !== false,
        contactInfo: data.contactInfo as string | undefined,
      },
    });
  }

  async getVenues() {
    return this.prisma.venue.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createVenue(data: Record<string, unknown>) {
    return this.prisma.venue.create({
      data: {
        name: data.name as string,
        type: data.type as never,
        sportTypes: (data.sportTypes as never[]) || [],
        address: data.address as string,
        addressDetail: data.addressDetail as string | undefined,
        lat: (data.lat as number) || 37.5,
        lng: (data.lng as number) || 127.0,
        city: data.city as string,
        district: data.district as string,
        phone: data.phone as string | undefined,
        description: data.description as string | undefined,
        imageUrls: (data.imageUrls as string[]) || [],
        facilities: (data.facilities as string[]) || [],
        operatingHours: data.operatingHours as never || {},
        pricePerHour: data.pricePerHour as number | undefined,
      },
    });
  }

  async updateVenue(id: string, data: Record<string, unknown>) {
    return this.prisma.venue.update({
      where: { id },
      data: data as never,
    });
  }

  async getPayments() {
    return this.prisma.payment.findMany({
      include: {
        user: { select: { id: true, nickname: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
