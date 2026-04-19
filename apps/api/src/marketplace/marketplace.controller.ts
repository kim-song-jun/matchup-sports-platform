import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { MarketplaceService } from './marketplace.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { ConfirmOrderPaymentDto } from './dto/confirm-order-payment.dto';
import { FileDisputeDto } from './dto/file-dispute.dto';

@ApiTags('장터')
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get('listings')
  @ApiOperation({ summary: '매물 목록' })
  async findListings(
    @Query('sportType') sportType?: string,
    @Query('category') category?: string,
    @Query('condition') condition?: string,
    @Query('teamId') teamId?: string,
    @Query('venueId') venueId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? parseInt(limit, 10) : undefined;
    const safeLimit = parsed !== undefined
      ? Math.min(Math.max(1, Number.isNaN(parsed) ? 20 : parsed), 100)
      : undefined;
    return this.marketplaceService.findListings({
      sportType,
      category,
      condition,
      teamId,
      venueId,
      cursor,
      limit: safeLimit,
    });
  }

  @Post('listings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '매물 등록' })
  async createListing(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
    @Body() body: CreateListingDto,
  ) {
    return this.marketplaceService.createListing(userId, userRole, body);
  }

  @Get('listings/:id')
  @ApiOperation({ summary: '매물 상세' })
  async findListing(@Param('id') id: string) {
    return this.marketplaceService.findListing(id);
  }

  @Patch('listings/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '매물 수정' })
  async updateListing(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
    @Body() body: UpdateListingDto,
  ) {
    return this.marketplaceService.updateListing(id, userId, userRole, body);
  }

  @Delete('listings/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '매물 삭제 (soft delete)' })
  async deleteListing(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.marketplaceService.deleteListing(id, userId);
  }

  @Post('listings/:id/order')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '주문/구매 (결제 prepare — orderId + amount 반환)' })
  async createOrder(
    @Param('id') listingId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.marketplaceService.createOrder(listingId, userId);
  }

  @Get('orders/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 주문 목록 (커서 기반 페이지네이션)' })
  @ApiResponse({ status: 200, description: '주문 목록 (items + nextCursor)' })
  async listMyOrders(
    @CurrentUser('id') userId: string,
    @Query('role') role?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? parseInt(limit, 10) : undefined;
    const safeLimit =
      parsed !== undefined && !Number.isNaN(parsed)
        ? Math.min(Math.max(1, parsed), 100)
        : undefined;
    const safeRole = role === 'seller' ? 'seller' : 'buyer';
    return this.marketplaceService.listMyOrders(userId, safeRole, cursor, safeLimit);
  }

  @Get('orders/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '주문 상세 조회 — 구매자 또는 판매자만 접근 가능' })
  @ApiResponse({ status: 200, description: '주문 상세' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — 구매자 또는 판매자 본인만 가능' })
  @ApiResponse({ status: 404, description: 'ORDER_NOT_FOUND' })
  async getOrder(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.marketplaceService.getOrderForUser(id, userId);
  }

  @Post('orders/:orderId/confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '장터 주문 결제 확인 (Toss 승인 후 호출)' })
  async confirmOrderPayment(
    @Param('orderId') orderId: string,
    @Body() body: ConfirmOrderPaymentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.marketplaceService.confirmOrderPayment(orderId, body.paymentKey, userId);
  }

  @Post('orders/:id/ship')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '발송 처리 — 판매자가 배송 시작을 기록' })
  @ApiResponse({ status: 200, description: '발송 처리 완료' })
  @ApiResponse({ status: 400, description: 'ORDER_STATUS_INVALID — 발송 불가 상태' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — 판매자 본인만 가능' })
  @ApiResponse({ status: 404, description: 'ORDER_NOT_FOUND' })
  async shipOrder(
    @Param('id') orderId: string,
    @CurrentUser('id') sellerId: string,
  ) {
    return this.marketplaceService.shipOrder(orderId, sellerId);
  }

  @Post('orders/:id/deliver')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '배송 완료 처리 — 판매자 또는 시스템이 배달 완료 기록' })
  @ApiResponse({ status: 200, description: '배송 완료 처리 완료' })
  @ApiResponse({ status: 400, description: 'ORDER_STATUS_INVALID — 배송 완료 처리 불가 상태' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — 판매자 본인만 가능' })
  @ApiResponse({ status: 404, description: 'ORDER_NOT_FOUND' })
  async deliverOrder(
    @Param('id') orderId: string,
    @CurrentUser('id') sellerId: string,
  ) {
    return this.marketplaceService.deliverOrder(orderId, sellerId);
  }

  @Post('orders/:id/confirm-receipt')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '구매 확정 — 구매자가 수령 확인 후 에스크로 지급 해제 트리거' })
  @ApiResponse({ status: 200, description: '구매 확정 완료, 에스크로 지급 예약' })
  @ApiResponse({ status: 400, description: 'ORDER_STATUS_INVALID — 구매 확정 불가 상태' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — 구매자 본인만 가능' })
  @ApiResponse({ status: 404, description: 'ORDER_NOT_FOUND' })
  async confirmReceipt(
    @Param('id') orderId: string,
    @CurrentUser('id') buyerId: string,
  ) {
    return this.marketplaceService.confirmReceipt(orderId, buyerId);
  }

  @Post('orders/:id/dispute')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '분쟁 신청 — 구매자가 에스크로 보류 요청' })
  @ApiResponse({ status: 201, description: '분쟁 접수 완료' })
  @ApiResponse({ status: 400, description: 'DISPUTE_WINDOW_CLOSED — 신청 가능 기간 초과' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — 구매자 본인만 가능' })
  @ApiResponse({ status: 404, description: 'ORDER_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'DISPUTE_ALREADY_EXISTS — 이미 분쟁 진행 중' })
  async fileDispute(
    @Param('id') orderId: string,
    @Body() body: FileDisputeDto,
    @CurrentUser('id') buyerId: string,
  ) {
    return this.marketplaceService.fileDispute(orderId, buyerId, body);
  }
}
