import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VenuesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: { city?: string; type?: string; sportType?: string }) {
    const where: Record<string, unknown> = {};
    if (filter.city) where.city = filter.city;
    if (filter.type) where.type = filter.type;
    if (filter.sportType) where.sportTypes = { has: filter.sportType as never };

    return this.prisma.venue.findMany({ where, orderBy: { rating: 'desc' } });
  }

  async findOne(id: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id },
      include: {
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

    return review;
  }
}
