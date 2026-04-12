import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BadgesService } from './badges.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

@ApiTags('뱃지')
@Controller('badges')
export class BadgesController {
  constructor(private readonly badgesService: BadgesService) {}

  @Get()
  @ApiOperation({ summary: '뱃지 타입 목록' })
  async getBadgeTypes() {
    return this.badgesService.getBadgeTypes();
  }

  @Get('team/:teamId')
  @ApiOperation({ summary: '팀 뱃지 조회' })
  async getTeamBadges(@Param('teamId') teamId: string) {
    return this.badgesService.getTeamBadges(teamId);
  }

  @Post('team/:teamId')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '팀 뱃지 부여 (관리자 전용)' })
  async awardBadge(
    @Param('teamId') teamId: string,
    @Body() body: { type: string; name: string; description?: string },
  ) {
    return this.badgesService.awardBadge(teamId, body);
  }
}
