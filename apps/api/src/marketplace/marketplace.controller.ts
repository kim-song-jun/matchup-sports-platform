import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MarketplaceService } from './marketplace.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

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
    @Query('cursor') cursor?: string,
  ) {
    return this.marketplaceService.findListings({ sportType, category, condition, cursor });
  }

  @Post('listings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '매물 등록' })
  async createListing(@CurrentUser('id') userId: string, @Body() body: Record<string, unknown>) {
    return this.marketplaceService.createListing(userId, body);
  }

  @Get('listings/:id')
  @ApiOperation({ summary: '매물 상세' })
  async findListing(@Param('id') id: string) {
    return this.marketplaceService.findListing(id);
  }

  @Post('listings/:id/order')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '주문/구매' })
  async createOrder(
    @Param('id') listingId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.marketplaceService.createOrder(listingId, userId);
  }
}
