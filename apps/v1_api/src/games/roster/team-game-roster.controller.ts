import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { CreateMemberUnavailabilityDto, GameRosterBatchDto } from './dto/team-game-roster.dto';
import { MemberUnavailabilityService } from './member-unavailability.service';
import { TeamGameRosterService } from './team-game-roster.service';

@ApiTags('games')
@Controller('teams/:teamId')
@UseGuards(V1AuthGuard)
export class TeamGameRosterController {
  constructor(
    private readonly teamGameRoster: TeamGameRosterService,
    private readonly unavailability: MemberUnavailabilityService,
  ) {}

  @Get('game-rosters')
  @ApiOperation({ summary: '선수 × 시작 전 대회·리그 경기 명단 표 (팀 owner·manager·플랫폼 운영자)' })
  matrix(@CurrentUser() user: V1AuthUser, @Param('teamId') teamId: string) {
    return this.teamGameRoster.getTeamMatrix(user, teamId);
  }

  @Post('game-rosters/batch')
  @HttpCode(200)
  @ApiOperation({ summary: '여러 경기 빼기·되돌리기를 한 번에 — 시작된 경기가 섞이면 전부 409 (경기마다 그 사이드 권한)' })
  batch(@CurrentUser() user: V1AuthUser, @Param('teamId') teamId: string, @Body() dto: GameRosterBatchDto) {
    return this.teamGameRoster.applyBatch(user, teamId, dto);
  }

  @Get('members/:userId/unavailability')
  @ApiOperation({ summary: '팀원 결장 기간 목록(취소 포함) (팀 활성 멤버·플랫폼 운영자)' })
  listUnavailability(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
  ) {
    return this.unavailability.list(user, teamId, userId);
  }

  @Post('members/:userId/unavailability')
  @ApiOperation({ summary: '팀원 결장 기간 등록 — 기간 안 시작 전 대회·리그 경기에서 빠진다 (owner·manager·운영자, 본인 불가)' })
  createUnavailability(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
    @Body() dto: CreateMemberUnavailabilityDto,
  ) {
    return this.unavailability.create(user, teamId, userId, dto);
  }

  @Delete('members/:userId/unavailability/:unavailabilityId')
  @ApiOperation({ summary: '팀원 결장 기간 취소 — 이미 취소면 alreadyApplied (owner·manager·운영자, 본인 불가)' })
  revokeUnavailability(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
    @Param('unavailabilityId') unavailabilityId: string,
  ) {
    return this.unavailability.revoke(user, teamId, userId, unavailabilityId);
  }
}
