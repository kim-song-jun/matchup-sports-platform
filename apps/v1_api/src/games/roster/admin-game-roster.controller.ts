import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { TeamGameRosterService } from './team-game-roster.service';

@ApiTags('admin')
@Controller('admin/tournaments/:tournamentId/registrations/:registrationId')
@UseGuards(V1AuthGuard)
export class AdminGameRosterController {
  constructor(private readonly teamGameRoster: TeamGameRosterService) {}

  @Get('game-rosters')
  @ApiOperation({ summary: '참가 신청 팀의 선수 × 시작 전 경기 명단 표 — 대회·리그 공통 (어드민·그 대회 스태프)' })
  matrix(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.teamGameRoster.getRegistrationMatrix(user, tournamentId, registrationId);
  }
}
