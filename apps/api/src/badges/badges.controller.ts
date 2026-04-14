import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse, ApiCreatedResponse, ApiUnauthorizedResponse, ApiForbiddenResponse, ApiNotFoundResponse } from '@nestjs/swagger';
import { BadgesService } from './badges.service';
import { AwardBadgeDto } from './dto/award-badge.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

@ApiTags('뱃지')
@Controller('badges')
export class BadgesController {
  constructor(private readonly badgesService: BadgesService) {}

  /** Public: badge type catalogue is intentionally open (no auth required). */
  @Get()
  @ApiOperation({ summary: '뱃지 타입 목록' })
  @ApiOkResponse({ description: 'Badge type catalogue' })
  async getBadgeTypes() {
    return this.badgesService.getBadgeTypes();
  }

  /** Public: team badge list is intentionally open so profile pages can display badges without login. */
  @Get('team/:teamId')
  @ApiOperation({ summary: '팀 뱃지 조회' })
  @ApiOkResponse({ description: 'Team badge list' })
  @ApiNotFoundResponse({ description: 'Team not found' })
  async getTeamBadges(@Param('teamId') teamId: string) {
    return this.badgesService.getTeamBadges(teamId);
  }

  @Post('team/:teamId')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '팀 뱃지 부여 (관리자 전용)' })
  @ApiCreatedResponse({ description: 'Badge awarded to team' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  @ApiForbiddenResponse({ description: 'Admin role required' })
  @ApiNotFoundResponse({ description: 'Team not found' })
  async awardBadge(
    @Param('teamId') teamId: string,
    @Body() dto: AwardBadgeDto,
  ) {
    return this.badgesService.awardBadge(teamId, dto);
  }
}
