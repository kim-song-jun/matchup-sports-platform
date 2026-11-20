import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import {
  CreateInternalMatchDto,
  InternalMatchListQueryDto,
  InternalMatchPreviewDto,
  RecordInternalMatchResultDto,
} from './dto/team-internal-match.dto';
import { TeamInternalMatchesService } from './team-internal-matches.service';

/** 팀 내 경기(자체전). 전부 로그인 필수 — 읽기는 팀원, 쓰기는 팀장·매니저(서비스가 검증). */
@Controller('teams/:teamId/internal-matches')
@UseGuards(V1AuthGuard)
export class TeamInternalMatchesController {
  constructor(private readonly matches: TeamInternalMatchesService) {}

  @Get()
  list(@CurrentUser() user: V1AuthUser, @Param('teamId') teamId: string, @Query() query: InternalMatchListQueryDto) {
    return this.matches.list(user, teamId, query);
  }

  @Post('preview')
  preview(@CurrentUser() user: V1AuthUser, @Param('teamId') teamId: string, @Body() dto: InternalMatchPreviewDto) {
    return this.matches.preview(user, teamId, dto);
  }

  @Post()
  create(@CurrentUser() user: V1AuthUser, @Param('teamId') teamId: string, @Body() dto: CreateInternalMatchDto) {
    return this.matches.create(user, teamId, dto);
  }

  @Get(':matchId')
  detail(@CurrentUser() user: V1AuthUser, @Param('teamId') teamId: string, @Param('matchId') matchId: string) {
    return this.matches.detail(user, teamId, matchId);
  }

  @Put(':matchId/result')
  recordResult(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('matchId') matchId: string,
    @Body() dto: RecordInternalMatchResultDto,
  ) {
    return this.matches.recordResult(user, teamId, matchId, dto);
  }

  @Delete(':matchId')
  remove(@CurrentUser() user: V1AuthUser, @Param('teamId') teamId: string, @Param('matchId') matchId: string) {
    return this.matches.remove(user, teamId, matchId);
  }
}
