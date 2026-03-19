import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';

@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  async findListings(filter: { sportType?: string; category?: string; condition?: string; cursor?: string }) {
    const limit = 20;
    const where: Record<string, unknown> = { status: 'active' };
    if (filter.sportType) where.sportType = filter.sportType;
    if (filter.category) where.category = filter.category;
    if (filter.condition) where.condition = filter.condition;

    const items = await this.prisma.marketplaceListing.findMany({
      where,
      include: {
        seller: { select: { id: true, nickname: true, profileImageUrl: true, mannerScore: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(filter.cursor && { cursor: { id: filter.cursor }, skip: 1 }),
    });

    const hasNext = items.length > limit;
    const result = hasNext ? items.slice(0, limit) : items;

    return {
      items: result,
      nextCursor: hasNext ? result[result.length - 1].id : null,
    };
  }

  async createListing(sellerId: string, data: Record<string, unknown>) {
    return this.prisma.marketplaceListing.create({
      data: {
        sellerId,
        title: data.title as string,
        description: data.description as string,
        sportType: data.sportType as never,
        category: data.category as string,
        condition: data.condition as never,
        price: data.price as number,
        listingType: (data.listingType as never) || 'sell',
        imageUrls: (data.imageUrls as string[]) || [],
        locationCity: data.locationCity as string | undefined,
        locationDistrict: data.locationDistrict as string | undefined,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    });
  }

  async findListing(id: string) {
    const listing = await this.prisma.marketplaceListing.findUnique({
      where: { id },
      include: {
        seller: { select: { id: true, nickname: true, profileImageUrl: true, mannerScore: true } },
      },
    });
    if (!listing) throw new NotFoundException('매물을 찾을 수 없습니다.');

    // 조회수 증가
    await this.prisma.marketplaceListing.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return listing;
  }

  async createOrder(listingId: string, buyerId: string) {
    const listing = await this.prisma.marketplaceListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException('매물을 찾을 수 없습니다.');

    const commission = Math.round(listing.price * 0.15);
    const orderId = `MK-${Date.now()}-${randomUUID().slice(0, 8)}`;

    return this.prisma.marketplaceOrder.create({
      data: {
        listingId,
        buyerId,
        sellerId: listing.sellerId,
        amount: listing.price,
        commission,
        orderId,
        status: 'pending',
      },
    });
  }
}
