import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { CreateTournamentPopupDto, UpdateTournamentPopupDto } from './dto/tournament-popup.dto';
import { TournamentPopupService } from './tournament-popup.service';

@Controller()
@UseGuards(V1AuthGuard)
export class TournamentPopupController {
  constructor(private readonly popupService: TournamentPopupService) {}

  @Get('admin/tournaments/:tournamentId/popups')
  list(@CurrentUser() user: V1AuthUser, @Param('tournamentId') tournamentId: string) {
    return this.popupService.listByTournament(user, tournamentId);
  }

  @Post('admin/tournaments/:tournamentId/popups')
  create(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: CreateTournamentPopupDto,
  ) {
    return this.popupService.create(user, tournamentId, dto);
  }

  @Patch('admin/tournaments/:tournamentId/popups/:popupId')
  update(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Param('popupId') popupId: string,
    @Body() dto: UpdateTournamentPopupDto,
  ) {
    return this.popupService.update(user, { tournamentId, popupId, dto });
  }

  @Delete('admin/tournaments/:tournamentId/popups/:popupId')
  delete(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Param('popupId') popupId: string,
  ) {
    return this.popupService.delete(user, { tournamentId, popupId });
  }
}
