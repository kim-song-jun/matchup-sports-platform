import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AddPlayerDto, UpdatePlayerEligibilityDto } from './dto/tournament-player.dto';
import { TournamentPlayersService } from './tournament-players.service';

// ─── 소비자/팀 라우트 ──────────────────────────────────────────────────────────

@Controller('tournaments/:tournamentId/registrations/:registrationId/players')
@UseGuards(V1AuthGuard)
export class TournamentPlayersController {
  constructor(private readonly playersService: TournamentPlayersService) {}

  @Get()
  listPlayers(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.playersService.listPlayers(user, tournamentId, registrationId);
  }

  @Post()
  addPlayer(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Param('registrationId') registrationId: string,
    @Body() dto: AddPlayerDto,
  ) {
    return this.playersService.addPlayer(user, tournamentId, registrationId, dto);
  }

  @Delete(':playerId')
  removePlayer(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Param('registrationId') registrationId: string,
    @Param('playerId') playerId: string,
  ) {
    return this.playersService.removePlayer(user, tournamentId, registrationId, playerId);
  }

  @Patch(':playerId')
  updatePlayer(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Param('registrationId') registrationId: string,
    @Param('playerId') playerId: string,
    @Body() dto: UpdatePlayerEligibilityDto,
  ) {
    return this.playersService.updatePlayer(user, tournamentId, registrationId, playerId, dto);
  }
}

// ─── 어드민 라우트 ──────────────────────────────────────────────────────────────

@Controller('admin')
@UseGuards(V1AuthGuard)
export class TournamentPlayersAdminController {
  constructor(private readonly playersService: TournamentPlayersService) {}

  /**
   * PII 포함 — 어드민 게이트 필수.
   * 서비스가 {filename, csv} 를 반환하고 전역 TransformInterceptor가 {status,data,timestamp}로 래핑한다.
   * 클라이언트는 data.csv를 Blob으로 변환해 파일로 저장한다.
   */
  @Get('registrations/:registrationId/players/export')
  exportCsv(
    @CurrentUser() user: V1AuthUser,
    @Param('registrationId') registrationId: string,
  ) {
    return this.playersService.exportCsv(user, registrationId);
  }

  @Patch('players/:playerId/eligibility')
  updateEligibility(
    @CurrentUser() user: V1AuthUser,
    @Param('playerId') playerId: string,
    @Body() dto: UpdatePlayerEligibilityDto,
  ) {
    return this.playersService.updateEligibility(user, playerId, dto);
  }
}
