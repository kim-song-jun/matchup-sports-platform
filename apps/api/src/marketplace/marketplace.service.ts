import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, SportType, ItemCondition, ListingStatus, Prisma, TeamRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettlementsService } from '../settlements/settlements.service';
import { randomUUID } from 'crypto';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { PAGINATION } from '../common/constants/pagination';
import { computeCommission } from '../common/constants/commission';
import { TeamMembershipService } from '../teams/team-membership.service';

// Toss Payments confirm response shape (shared subset used here)
interface TossConfirmResponse {
  paymentKey: string;
  orderId: string;
  status: string;
  method: string;
  totalAmount: number;
  paidAt: string;
  receiptUrl?: string;
}

interface TossErrorResponse {
  code: string;
  message: string;
}

@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);
  private readonly tossEnabled: boolean;
  private readonly tossSecretKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly settlementsService: SettlementsService,
    private readonly teamMembershipService: TeamMembershipService,
  ) {
    this.tossSecretKey = process.env.TOSS_SECRET_KEY ?? '';
    this.tossEnabled = !!this.tossSecretKey;

    if (!this.tossEnabled) {
      this.logger.warn('TOSS_SECRET_KEY not set — marketplace payments running in mock mode');
    }
  }

  async findListings(filter: {
    sportType?: string;
    category?: string;
    condition?: string;
    teamId?: string;
    venueId?: string;
    cursor?: string;
    limit?: number;
  }) {
    const limit = Math.min(filter.limit ?? PAGINATION.DEFAULT_LIMIT, 100);
    const where: Prisma.MarketplaceListingWhereInput = { status: 'active' };
    if (filter.sportType) where.sportType = filter.sportType as SportType;
    if (filter.category) where.category = filter.category;
    if (filter.condition) where.condition = filter.condition as ItemCondition;
    if (filter.teamId) where.teamId = filter.teamId;
    if (filter.venueId) where.venueId = filter.venueId;

    const items = await this.prisma.marketplaceListing.findMany({
      where,
      include: {
        seller: { select: { id: true, nickname: true, profileImageUrl: true, mannerScore: true } },
        team: { select: { id: true, name: true } },
        venue: { select: { id: true, name: true } },
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

  async createListing(sellerId: string, userRole: string, data: CreateListingDto) {
    this.assertSingleAffiliation(data.teamId, data.venueId);
    await this.assertAffiliationWriteAccess(sellerId, userRole, data.teamId, data.venueId);

    return this.prisma.marketplaceListing.create({
      data: {
        sellerId,
        teamId: data.teamId,
        venueId: data.venueId,
        title: data.title,
        description: data.description,
        sportType: data.sportType,
        category: data.category,
        condition: data.condition,
        price: data.price,
        listingType: data.listingType ?? 'sell',
        imageUrls: data.imageUrls ?? [],
        locationCity: data.locationCity,
        locationDistrict: data.locationDistrict,
        rentalPricePerDay: data.rentalPricePerDay,
        rentalDeposit: data.rentalDeposit,
        groupBuyTarget: data.groupBuyTarget,
        groupBuyDeadline: data.groupBuyDeadline ? new Date(data.groupBuyDeadline) : undefined,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
      include: {
        seller: { select: { id: true, nickname: true, profileImageUrl: true, mannerScore: true } },
        team: { select: { id: true, name: true } },
        venue: { select: { id: true, name: true } },
      },
    });
  }

  async findListing(id: string) {
    const listing = await this.prisma.marketplaceListing.findUnique({
      where: { id },
      include: {
        seller: { select: { id: true, nickname: true, profileImageUrl: true, mannerScore: true } },
        team: { select: { id: true, name: true } },
        venue: { select: { id: true, name: true } },
      },
    });
    if (!listing || listing.status === 'deleted') throw new NotFoundException('매물을 찾을 수 없습니다.');

    // 조회수 증가
    await this.prisma.marketplaceListing.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return listing;
  }

  async updateListing(id: string, sellerId: string, userRole: string, data: UpdateListingDto) {
    const listing = await this.prisma.marketplaceListing.findUnique({
      where: { id },
      select: {
        id: true,
        sellerId: true,
        status: true,
        teamId: true,
        venueId: true,
      },
    });

    if (!listing) {
      throw new NotFoundException('매물을 찾을 수 없습니다.');
    }
    if (listing.sellerId !== sellerId) {
      throw new ForbiddenException('판매자만 매물을 수정할 수 있습니다.');
    }
    if (listing.status === 'deleted') {
      throw new BadRequestException('삭제된 매물은 수정할 수 없습니다.');
    }
    if (data.status === ListingStatus.deleted || data.status === ListingStatus.expired) {
      throw new BadRequestException('이 상태는 수정 API에서 직접 설정할 수 없습니다.');
    }

    const nextTeamId = data.teamId !== undefined ? data.teamId : listing.teamId;
    const nextVenueId = data.venueId !== undefined ? data.venueId : listing.venueId;
    this.assertSingleAffiliation(nextTeamId ?? undefined, nextVenueId ?? undefined);
    await this.assertAffiliationWriteAccess(sellerId, userRole, nextTeamId ?? undefined, nextVenueId ?? undefined);

    return this.prisma.marketplaceListing.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.sportType !== undefined ? { sportType: data.sportType } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.condition !== undefined ? { condition: data.condition } : {}),
        ...(data.price !== undefined ? { price: data.price } : {}),
        ...(data.listingType !== undefined ? { listingType: data.listingType } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.imageUrls !== undefined ? { imageUrls: data.imageUrls } : {}),
        ...(data.teamId !== undefined ? { teamId: data.teamId } : {}),
        ...(data.venueId !== undefined ? { venueId: data.venueId } : {}),
        ...(data.locationCity !== undefined ? { locationCity: data.locationCity } : {}),
        ...(data.locationDistrict !== undefined ? { locationDistrict: data.locationDistrict } : {}),
        ...(data.rentalPricePerDay !== undefined
          ? { rentalPricePerDay: data.rentalPricePerDay }
          : {}),
        ...(data.rentalDeposit !== undefined ? { rentalDeposit: data.rentalDeposit } : {}),
        ...(data.groupBuyTarget !== undefined ? { groupBuyTarget: data.groupBuyTarget } : {}),
        ...(data.groupBuyDeadline !== undefined
          ? {
            groupBuyDeadline: data.groupBuyDeadline
              ? new Date(data.groupBuyDeadline)
              : null,
          }
          : {}),
      },
      include: {
        seller: { select: { id: true, nickname: true, profileImageUrl: true, mannerScore: true } },
        team: { select: { id: true, name: true } },
        venue: { select: { id: true, name: true } },
      },
    });
  }

  async deleteListing(id: string, sellerId: string) {
    const listing = await this.prisma.marketplaceListing.findUnique({
      where: { id },
      select: {
        id: true,
        sellerId: true,
        status: true,
      },
    });

    if (!listing) {
      throw new NotFoundException('매물을 찾을 수 없습니다.');
    }
    if (listing.sellerId !== sellerId) {
      throw new ForbiddenException('판매자만 매물을 삭제할 수 있습니다.');
    }
    if (listing.status === 'deleted') {
      return { deleted: true };
    }

    await this.prisma.marketplaceListing.update({
      where: { id },
      data: { status: ListingStatus.deleted, expiresAt: new Date() },
    });

    return { deleted: true };
  }

  async createOrder(listingId: string, buyerId: string) {
    const listing = await this.prisma.marketplaceListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException('매물을 찾을 수 없습니다.');

    if (listing.sellerId === buyerId) {
      throw new BadRequestException('자신의 매물을 구매할 수 없습니다.');
    }

    const commission = computeCommission(listing.price);
    const orderId = `MU-MKT-${randomUUID()}`;

    const order = await this.prisma.marketplaceOrder.create({
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

    return {
      order,
      payment: {
        orderId: order.orderId,
        amount: order.amount,
      },
    };
  }

  async confirmOrderPayment(orderId: string, paymentKey: string, userId: string) {
    const order = await this.prisma.marketplaceOrder.findUnique({
      where: { orderId },
      include: {
        listing: { select: { title: true } },
        seller: { select: { id: true, nickname: true } },
        buyer: { select: { id: true } },
      },
    });

    if (!order) throw new NotFoundException('주문을 찾을 수 없습니다.');
    if (order.buyerId !== userId) throw new ForbiddenException('구매자만 결제를 확인할 수 있습니다.');
    if (order.status !== 'pending') throw new BadRequestException('이미 처리된 주문입니다.');

    if (this.tossEnabled) {
      const tossResponse = await this.callTossConfirm(paymentKey, orderId, order.amount);
      // Verify Toss response amount matches order amount to prevent tampering
      if (tossResponse.totalAmount !== order.amount) {
        this.logger.error(
          `Marketplace order ${orderId} amount mismatch: toss=${tossResponse.totalAmount}, db=${order.amount}`,
        );
        throw new BadRequestException('결제 금액이 일치하지 않습니다.');
      }
    }

    const updated = await this.prisma.marketplaceOrder.update({
      where: { orderId },
      data: {
        status: 'paid',
        paymentKey,
        paidAt: new Date(),
      },
    });

    // Notify seller
    await this.notificationsService.create({
      userId: order.sellerId,
      type: NotificationType.marketplace_order,
      title: '새 주문이 들어왔어요',
      body: `"${order.listing.title}" 상품에 주문이 접수되었습니다.`,
      data: { orderId: order.id, listingId: order.listingId },
    });

    // Fire-and-forget: settlement record for marketplace sale
    this.settlementsService
      .recordSettlement({
        type: 'marketplace',
        amount: order.amount,
        sourceId: order.id,
        recipientId: order.sellerId,
      })
      .catch((err) => this.logger.error(`Settlement record failed for marketplace order ${order.id}: ${err}`));

    return updated;
  }

  private tossAuthHeader(): string {
    const encoded = Buffer.from(`${this.tossSecretKey}:`).toString('base64');
    return `Basic ${encoded}`;
  }

  private async callTossConfirm(paymentKey: string, orderId: string, amount: number): Promise<TossConfirmResponse> {
    const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: this.tossAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as TossErrorResponse;
      this.logger.error(`Toss confirm failed for marketplace order ${orderId}: ${err.code} — ${err.message}`);

      await this.prisma.marketplaceOrder.update({
        where: { orderId },
        data: { status: 'cancelled' },
      });

      throw new InternalServerErrorException(`결제 승인 실패: ${err.message ?? '알 수 없는 오류'}`);
    }

    return response.json() as Promise<TossConfirmResponse>;
  }

  private assertSingleAffiliation(teamId?: string, venueId?: string) {
    if (teamId && venueId) {
      throw new BadRequestException('팀과 장소 소속을 동시에 지정할 수 없습니다.');
    }
  }

  private async assertAffiliationWriteAccess(
    userId: string,
    userRole: string,
    teamId?: string,
    venueId?: string,
  ) {
    if (teamId) {
      await this.teamMembershipService.assertRole(teamId, userId, TeamRole.manager);
      return;
    }

    if (!venueId) return;
    if (userRole === 'admin') return;

    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true, ownerId: true },
    });
    if (!venue) {
      throw new NotFoundException('시설을 찾을 수 없습니다.');
    }
    if (!venue.ownerId || venue.ownerId !== userId) {
      throw new ForbiddenException('해당 시설 소속 매물을 등록할 권한이 없습니다.');
    }
  }
}
