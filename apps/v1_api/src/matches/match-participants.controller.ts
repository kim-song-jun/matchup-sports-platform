import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { ChangeMatchParticipantDto } from './dto/match-application.dto';
import { MatchesService } from './matches.service';

@Controller('match-participants')
@UseGuards(V1AuthGuard)
export class MatchParticipantsController {
  constructor(private readonly matches: MatchesService) {}

  @Post(':participantId/cancel-approval')
  cancelApproval(@CurrentUser() user: V1AuthUser, @Param('participantId') id: string, @Body() dto: ChangeMatchParticipantDto) {
    return this.matches.changeParticipant(user, id, 'removed', dto);
  }

  @Post(':participantId/mark-cancelled')
  markCancelled(@CurrentUser() user: V1AuthUser, @Param('participantId') id: string, @Body() dto: ChangeMatchParticipantDto) {
    return this.matches.changeParticipant(user, id, 'no_show', dto);
  }
}
