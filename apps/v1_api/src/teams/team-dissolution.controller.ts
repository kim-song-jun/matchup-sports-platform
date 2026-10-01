import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { DissolveTeamDto } from './dto/team-dissolution.dto';
import { TeamDissolutionService } from './team-dissolution.service';

@Controller()
@UseGuards(V1AuthGuard)
export class TeamDissolutionController {
  constructor(private readonly dissolution: TeamDissolutionService) {}

  @Get('teams/:teamId/dissolution-preview')
  preview(@CurrentUser() user: V1AuthUser, @Param('teamId') teamId: string) {
    return this.dissolution.preview(user, teamId);
  }

  @Post('teams/:teamId/dissolve')
  dissolve(@CurrentUser() user: V1AuthUser, @Param('teamId') teamId: string, @Body() dto: DissolveTeamDto) {
    return this.dissolution.dissolve(user, teamId, dto);
  }

  @Post('teams/:teamId/restore')
  restore(@CurrentUser() user: V1AuthUser, @Param('teamId') teamId: string) {
    return this.dissolution.restore(user, teamId);
  }

  @Get('me/dissolved-teams')
  myDissolvedTeams(@CurrentUser() user: V1AuthUser) {
    return this.dissolution.myDissolvedTeams(user);
  }
}
