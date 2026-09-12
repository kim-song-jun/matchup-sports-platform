import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { GamesService } from './games.service';

/** Authenticated identity-claim entry point for friendly canonical TeamMatches. */
@Controller('team-matches/:teamMatchId')
@UseGuards(V1AuthGuard)
export class TeamMatchClaimableParticipantsController {
  constructor(private readonly gamesService: GamesService) {}

  @Get('claimable-participants')
  claimableParticipants(
    @CurrentUser() user: V1AuthUser,
    @Param('teamMatchId') teamMatchId: string,
  ) {
    return this.gamesService.listTeamMatchClaimableParticipants(user, teamMatchId);
  }
}
