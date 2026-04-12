import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { MarketplaceService } from './marketplace.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';

class ConfirmOrderPaymentDto {
  @ApiProperty({ description: '토스페이먼츠 paymentKey' })
  @IsString()
  @IsNotEmpty()
  paymentKey!: string;
}

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
}
