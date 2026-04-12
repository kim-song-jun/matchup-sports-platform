import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VenuesService } from './venues.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { UpdateVenueDto } from './dto/update-venue.dto';

@ApiTags('시설')
@Controller('venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Get()
  @ApiOperation({ summary: '시설 목록 조회' })
  async findAll(
    @Query('city') city?: string,
    @Query('type') type?: string,
    @Query('sportType') sportType?: string,
  ) {
    return this.venuesService.findAll({ city, type, sportType });
  }

  @Get(':id/hub')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '시설 허브 집계 데이터' })
  async findHub(@Param('id') id: string, @CurrentUser('id') userId?: string, @CurrentUser('role') userRole?: string) {
    return this.venuesService.findHub(id, userId, userRole);
  }

  @Get(':id')
  @ApiOperation({ summary: '시설 상세 조회' })
  async findOne(@Param('id') id: string) {
    return this.venuesService.findOne(id);
  }

  @Get(':id/schedule')
  @ApiOperation({ summary: '시설 예약 현황' })
  async getSchedule(@Param('id') id: string) {
    return this.venuesService.getSchedule(id);
  }

  @Post(':id/reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '시설 리뷰 작성' })
  async createReview(
    @Param('id') venueId: string,
    @CurrentUser('id') userId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.venuesService.createReview(venueId, userId, body);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '시설 수정 (owner/admin)' })
  async update(
    @Param('id') venueId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
    @Body() body: UpdateVenueDto,
  ) {
    return this.venuesService.update(venueId, userId, userRole, body);
  }
}
