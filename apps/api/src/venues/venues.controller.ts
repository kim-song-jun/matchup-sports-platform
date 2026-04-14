import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse, ApiCreatedResponse, ApiUnauthorizedResponse, ApiForbiddenResponse, ApiNotFoundResponse } from '@nestjs/swagger';
import { VenuesService } from './venues.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { CreateVenueReviewDto } from './dto/create-venue-review.dto';

@ApiTags('시설')
@Controller('venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Get()
  @ApiOperation({ summary: '시설 목록 조회' })
  @ApiOkResponse({ description: 'Paginated venue list' })
  async findAll(
    @Query('city') city?: string,
    @Query('type') type?: string,
    @Query('sportType') sportType?: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    return this.venuesService.findAll({
      city,
      type,
      sportType,
      cursor,
      take: take ? parseInt(take, 10) : undefined,
    });
  }

  @Get(':id/hub')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '시설 허브 집계 데이터' })
  @ApiOkResponse({ description: 'Venue hub aggregate data' })
  @ApiNotFoundResponse({ description: 'Venue not found' })
  async findHub(@Param('id') id: string, @CurrentUser('id') userId?: string, @CurrentUser('role') userRole?: string) {
    return this.venuesService.findHub(id, userId, userRole);
  }

  @Get(':id')
  @ApiOperation({ summary: '시설 상세 조회' })
  @ApiOkResponse({ description: 'Venue detail' })
  @ApiNotFoundResponse({ description: 'Venue not found' })
  async findOne(@Param('id') id: string) {
    return this.venuesService.findOne(id);
  }

  @Get(':id/schedule')
  @ApiOperation({ summary: '시설 예약 현황' })
  @ApiOkResponse({ description: 'Venue schedule' })
  @ApiNotFoundResponse({ description: 'Venue not found' })
  async getSchedule(@Param('id') id: string) {
    return this.venuesService.getSchedule(id);
  }

  @Post(':id/reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '시설 리뷰 작성' })
  @ApiCreatedResponse({ description: 'Venue review created' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  @ApiNotFoundResponse({ description: 'Venue not found' })
  async createReview(
    @Param('id') venueId: string,
    @CurrentUser('id') userId: string,
    @Body() body: CreateVenueReviewDto,
  ) {
    return this.venuesService.createReview(venueId, userId, body);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '시설 수정 (owner/admin)' })
  @ApiOkResponse({ description: 'Venue updated' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  @ApiForbiddenResponse({ description: 'Caller is not the venue owner or admin' })
  @ApiNotFoundResponse({ description: 'Venue not found' })
  async update(
    @Param('id') venueId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
    @Body() body: UpdateVenueDto,
  ) {
    return this.venuesService.update(venueId, userId, userRole, body);
  }
}
