import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  AddPlayerDto,
  UpdatePlayerEligibilityDto,
  UpdatePlayerJerseyDto,
} from './dto/tournament-player.dto';
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

  /**
   * 등번호만 고친다 — 자격 판정(`PATCH :playerId`)과 **다른 경로**다.
   *
   * 등번호를 잘못 넣었을 때 예전엔 **선수를 지우고 다시 넣는 수밖에** 없었다
   * (2026-09-04 alpha 실측). 그 우회는 명단 잠금 전에만 되고, 되살린 행의 자격 판정이
   * `needs_review` 로 리셋되는 부작용도 있다.
   */
  @Patch(':playerId/jersey-number')
  updatePlayerJersey(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Param('registrationId') registrationId: string,
    @Param('playerId') playerId: string,
    @Body() dto: UpdatePlayerJerseyDto,
  ) {
    return this.playersService.updatePlayerJersey(
      user,
      tournamentId,
      registrationId,
      playerId,
      dto.jerseyNumber,
    );
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

  @Get('registrations/:registrationId/players')
  listPlayers(
    @CurrentUser() user: V1AuthUser,
    @Param('registrationId') registrationId: string,
  ) {
    return this.playersService.listPlayersForAdmin(user, registrationId);
  }

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

  /**
   * 어드민 명단 추가·제거. 이 두 라우트가 없어서 어드민 콘솔에서는 명단을 볼 수만 있고
   * 고칠 수 없었다 — 팀장이 없거나 마감이 지난 뒤 운영 조정이 필요한 상황을 손댈 방법이
   * 없었다는 뜻이다(2026-08-03 실사고).
   */
  /** 명단에 올릴 수 있는 팀원 목록. 어드민이 UUID 를 직접 알아낼 필요를 없앤다. */
  @Get('registrations/:registrationId/eligible-players')
  listEligiblePlayers(
    @CurrentUser() user: V1AuthUser,
    @Param('registrationId') registrationId: string,
  ) {
    return this.playersService.listEligiblePlayersForAdmin(user, registrationId);
  }

  @Post('registrations/:registrationId/players')
  addPlayer(
    @CurrentUser() user: V1AuthUser,
    @Param('registrationId') registrationId: string,
    @Body() dto: AddPlayerDto,
  ) {
    return this.playersService.addPlayerForAdmin(user, registrationId, dto);
  }

  @Delete('players/:playerId')
  removePlayer(@CurrentUser() user: V1AuthUser, @Param('playerId') playerId: string) {
    return this.playersService.removePlayerForAdmin(user, playerId);
  }
}
