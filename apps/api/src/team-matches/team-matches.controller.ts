import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TeamMatchesService } from './team-matches.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('팀 매칭')
@Controller('team-matches')
export class TeamMatchesController {
  constructor(private readonly service: TeamMatchesService) {}

  @Get()
  @ApiOperation({ summary: '경기 모집글 목록' })
  async findAll(
    @Query('sportType') sportType?: string,
    @Query('city') city?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.findAll({ sportType, city, status, cursor });
  }

  @Get(':id')
  @ApiOperation({ summary: '경기 모집글 상세' })
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '경기 모집글 등록' })
  async create(@Body() body: Record<string, unknown>) {
    return this.service.create(body);
  }

  // ── 신청/승인/거절 ──
  @Post(':id/apply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '경기 신청' })
  async apply(@Param('id') matchId: string, @Body() body: Record<string, unknown>) {
    return this.service.apply(matchId, body);
  }

  @Patch(':id/applications/:appId/approve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '경기 신청 승인' })
  async approve(@Param('id') matchId: string, @Param('appId') appId: string) {
    return this.service.approveApplication(matchId, appId);
  }

  @Patch(':id/applications/:appId/reject')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '경기 신청 거절' })
  async reject(@Param('id') matchId: string, @Param('appId') appId: string) {
    return this.service.rejectApplication(matchId, appId);
  }

  // ── 도착 인증 ──
  @Post(':id/check-in')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '도착 인증' })
  async checkIn(@Param('id') matchId: string, @Body() body: Record<string, unknown>) {
    return this.service.checkIn(matchId, body);
  }

  // ── 경기 결과 + 평가 ──
  @Post(':id/result')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '경기 결과 입력' })
  async submitResult(@Param('id') matchId: string, @Body() body: Record<string, unknown>) {
    return this.service.submitResult(matchId, body);
  }

  @Post(':id/evaluate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '경기 후 평가' })
  async evaluate(@Param('id') matchId: string, @Body() body: Record<string, unknown>) {
    return this.service.evaluate(matchId, body);
  }

  // ── 심판 배정 ──
  @Get(':id/referee-schedule')
  @ApiOperation({ summary: '심판 배정 조회' })
  async getRefereeSchedule(@Param('id') matchId: string) {
    return this.service.getRefereeSchedule(matchId);
  }
}
