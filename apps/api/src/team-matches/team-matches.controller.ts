import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TeamMatchesService } from './team-matches.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateTeamMatchDto } from './dto/create-team-match.dto';
import { ApplyTeamMatchDto } from './dto/apply-team-match.dto';
import { CheckInTeamMatchDto } from './dto/check-in-team-match.dto';
import { SubmitResultDto } from './dto/submit-result.dto';
import { EvaluateTeamMatchDto } from './dto/evaluate-team-match.dto';
import { TeamMatchQueryDto } from './dto/team-match-query.dto';

@ApiTags('팀 매칭')
@Controller('team-matches')
export class TeamMatchesController {
  constructor(private readonly service: TeamMatchesService) {}

  @Get()
  @ApiOperation({ summary: '경기 모집글 목록' })
  async findAll(@Query() query: TeamMatchQueryDto) {
    return this.service.findAll(query);
  }

  // ── me/* routes must come before :id to avoid route conflicts ──
  @Get('me/applications')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내가 속한 팀의 신청 목록 조회' })
  async getMyApplications(@CurrentUser('id') userId: string) {
    return this.service.getMyApplications(userId);
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
  async create(@CurrentUser('id') userId: string, @Body() body: CreateTeamMatchDto) {
    return this.service.create(userId, body);
  }

  // ── 신청/승인/거절 ──
  @Get(':id/applications')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '모집글의 신청 목록 조회 (호스트 전용)' })
  async getApplications(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.getApplications(id, userId);
  }

  @Post(':id/apply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '경기 신청' })
  async apply(@Param('id') matchId: string, @CurrentUser('id') userId: string, @Body() body: ApplyTeamMatchDto) {
    return this.service.apply(matchId, userId, body);
  }

  @Patch(':id/applications/:appId/approve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '경기 신청 승인' })
  async approve(@Param('id') matchId: string, @Param('appId') appId: string, @CurrentUser('id') userId: string) {
    return this.service.approveApplication(matchId, appId, userId);
  }

  @Patch(':id/applications/:appId/reject')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '경기 신청 거절' })
  async reject(@Param('id') matchId: string, @Param('appId') appId: string, @CurrentUser('id') userId: string) {
    return this.service.rejectApplication(matchId, appId, userId);
  }

  // ── 도착 인증 ──
  @Post(':id/check-in')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '도착 인증' })
  async checkIn(@Param('id') matchId: string, @CurrentUser('id') userId: string, @Body() body: CheckInTeamMatchDto) {
    return this.service.checkIn(matchId, userId, body);
  }

  // ── 경기 결과 + 평가 ──
  @Post(':id/result')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '경기 결과 입력' })
  async submitResult(@Param('id') matchId: string, @CurrentUser('id') userId: string, @Body() body: SubmitResultDto) {
    return this.service.submitResult(matchId, userId, body);
  }

  @Post(':id/evaluate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '경기 후 평가' })
  async evaluate(@Param('id') matchId: string, @CurrentUser('id') userId: string, @Body() body: EvaluateTeamMatchDto) {
    return this.service.evaluate(matchId, userId, body);
  }

  // ── 심판 배정 ──
  @Get(':id/referee-schedule')
  @ApiOperation({ summary: '심판 배정 조회' })
  async getRefereeSchedule(@Param('id') matchId: string) {
    return this.service.getRefereeSchedule(matchId);
  }
}
