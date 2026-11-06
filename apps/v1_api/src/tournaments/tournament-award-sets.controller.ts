import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { SetTournamentAwardSetsDto, TournamentAwardSetsService } from './tournament-award-sets.service';

@Controller()
export class TournamentAwardSetsController {
  constructor(private readonly awardSetsService: TournamentAwardSetsService) {}

  @Get('admin/tournaments/:tournamentId/award-sets')
  @UseGuards(V1AuthGuard)
  async list(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.awardSetsService.listAwardSets(user, tournamentId);
  }

  @Put('admin/tournaments/:tournamentId/award-sets')
  @UseGuards(V1AuthGuard)
  async replace(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: SetTournamentAwardSetsDto,
  ) {
    return this.awardSetsService.setAwardSets(user, tournamentId, dto);
  }
}
