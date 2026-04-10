import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, SportType, ItemCondition, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettlementsService } from '../settlements/settlements.service';
import { randomUUID } from 'crypto';
import { CreateListingDto } from './dto/create-listing.dto';
import { PAGINATION } from '../common/constants/pagination';

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
  ) {
    this.tossSecretKey = process.env.TOSS_SECRET_KEY ?? '';
    this.tossEnabled = !!this.tossSecretKey;

    if (!this.tossEnabled) {
      this.logger.warn('TOSS_SECRET_KEY not set — marketplace payments running in mock mode');
    }
  }

  async findListings(filter: { sportType?: string; category?: string; condition?: string; cursor?: string; limit?: number }) {
    const limit = Math.min(filter.limit ?? PAGINATION.DEFAULT_LIMIT, 100);
    const where: Prisma.MarketplaceListingWhereInput = { status: 'active' };
    if (filter.sportType) where.sportType = filter.sportType as SportType;
    if (filter.category) where.category = filter.category;
    if (filter.condition) where.condition = filter.condition as ItemCondition;

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

  async createListing(sellerId: string, data: CreateListingDto) {
    return this.prisma.marketplaceListing.create({
      data: {
        sellerId,
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

    if (listing.sellerId === buyerId) {
      throw new BadRequestException('자신의 매물을 구매할 수 없습니다.');
    }

    const commission = Math.round(listing.price * 0.10);
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
}
