import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { TournamentPeriodSettingsService } from './tournament-period-settings.service';
import { UpdateTournamentPeriodSettingsDto } from './tournament-period-settings.dto';

@Controller('admin/tournaments')
@UseGuards(V1AuthGuard)
export class TournamentPeriodSettingsController {
  constructor(private readonly service: TournamentPeriodSettingsService) {}

  @Get(':tournamentId/periods')
  get(@CurrentUser() user: V1AuthUser, @Param('tournamentId') tournamentId: string) {
    return this.service.get(user, tournamentId);
  }

  @Patch(':tournamentId/periods')
  update(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: UpdateTournamentPeriodSettingsDto,
  ) {
    return this.service.update(user, tournamentId, dto);
  }
}
