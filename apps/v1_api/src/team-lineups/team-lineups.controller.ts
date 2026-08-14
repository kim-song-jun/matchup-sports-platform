import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { CreateTeamLineupPresetDto, UpdateTeamLineupPresetDto } from './dto/team-lineup-preset.dto';
import { TeamLineupHistoryService } from './team-lineup-history.service';
import { TeamLineupPresetService } from './team-lineup-preset.service';

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
