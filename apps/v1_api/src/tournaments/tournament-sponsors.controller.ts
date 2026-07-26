import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { CreateTournamentSponsorDto, UpdateTournamentSponsorDto } from './dto/tournament-sponsor.dto';
import { TournamentSponsorsService } from './tournament-sponsors.service';

@Controller()
@UseGuards(V1AuthGuard)
export class TournamentSponsorsController {
  constructor(private readonly sponsorsService: TournamentSponsorsService) {}

  @Get('admin/tournaments/:tournamentId/sponsors')
  list(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.sponsorsService.listByTournament(user, tournamentId);
  }

  @Post('admin/tournaments/:tournamentId/sponsors')
  create(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: CreateTournamentSponsorDto,
  ) {
    return this.sponsorsService.create(user, tournamentId, dto);
  }

  @Patch('admin/tournaments/:tournamentId/sponsors/:sponsorId')
  update(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Param('sponsorId') sponsorId: string,
    @Body() dto: UpdateTournamentSponsorDto,
  ) {
    return this.sponsorsService.update(user, { tournamentId, sponsorId, dto });
  }

  @Post('admin/tournaments/:tournamentId/sponsors/:sponsorId/deactivate')
  deactivate(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Param('sponsorId') sponsorId: string,
  ) {
    return this.sponsorsService.deactivate(user, { tournamentId, sponsorId });
  }
}
