import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { CreateTeamLineupPresetDto, UpdateTeamLineupPresetDto } from './dto/team-lineup-preset.dto';
import { TeamLineupHistoryService } from './team-lineup-history.service';
import { TeamLineupPresetService } from './team-lineup-preset.service';
import { TeamUpcomingGamesService } from './team-upcoming-games.service';

const DEFAULT_HISTORY_LIMIT = 10;
const MAX_HISTORY_LIMIT = 20;

/**
 * 팀 스코프 라인업 재사용 자산 — 과거 경기 라인업(히스토리)과 이름 붙인 프리셋.
 * 두 라인업 화면(팀 매치·대회 경기)이 "이전 라인업 불러오기"에 쓴다.
 */
@Controller('teams/:teamId')
@UseGuards(V1AuthGuard)
export class TeamLineupsController {
  constructor(
    private readonly historyService: TeamLineupHistoryService,
    private readonly presetService: TeamLineupPresetService,
    private readonly upcomingGamesService: TeamUpcomingGamesService,
  ) {}

  @Get('lineup-history')
  lineupHistory(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number.parseInt(limit ?? '', 10);
    const bounded = Number.isNaN(parsed)
      ? DEFAULT_HISTORY_LIMIT
      : Math.min(Math.max(parsed, 1), MAX_HISTORY_LIMIT);
    return this.historyService.list(user, teamId, bounded);
  }

  /**
   * 그 팀의 다가오는 경기 — 전술보드 진입점이 쓴다.
   *
   * 라인업 할 일 목록(`GET /me/lineup-todos`)과 **같은 수집 경로**를 쓰지만 완료된
   * 라인업도 돌려준다. 할 일 규칙을 그대로 쓰면 라인업을 제출한 순간 그 경기의
   * 전술보드에 다시 못 들어가기 때문이다(전술은 제출 후에도 계속 고친다).
   *
   * 활성 팀원이면 누구나 본다 — 전술보드 읽기 권한과 같은 선이다.
   */
  @Get('upcoming-games')
  upcomingGames(@CurrentUser() user: V1AuthUser, @Param('teamId') teamId: string) {
    return this.upcomingGamesService.listForTeam(user, teamId);
  }

  @Get('lineup-presets')
  listPresets(@CurrentUser() user: V1AuthUser, @Param('teamId') teamId: string) {
    return this.presetService.list(user, teamId);
  }

  @Post('lineup-presets')
  createPreset(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Body() dto: CreateTeamLineupPresetDto,
  ) {
    return this.presetService.create(user, teamId, dto);
  }

  @Patch('lineup-presets/:presetId')
  updatePreset(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('presetId') presetId: string,
    @Body() dto: UpdateTeamLineupPresetDto,
  ) {
    return this.presetService.update(user, teamId, presetId, dto);
  }

  @Delete('lineup-presets/:presetId')
  removePreset(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('presetId') presetId: string,
  ) {
    return this.presetService.remove(user, teamId, presetId);
  }
}
