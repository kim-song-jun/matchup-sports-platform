import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { ResetTournamentBracketDto } from './bracket-reset.dto';
import { BracketResetService } from './bracket-reset.service';

/** Stage-aware reset; permission and snapshot checks also run inside the write transaction. */
@Controller('admin/tournaments/:tournamentId/bracket')
@UseGuards(V1AuthGuard)
export class BracketResetController {
  constructor(private readonly resets: BracketResetService) {}

  @Get('reset-preview')
  preview(@CurrentUser() user: V1AuthUser, @Param('tournamentId', ParseUUIDPipe) id: string) {
    return this.resets.preview(user, id);
  }

  @Post('reset')
  reset(@CurrentUser() user: V1AuthUser, @Param('tournamentId', ParseUUIDPipe) id: string, @Body() dto: ResetTournamentBracketDto) {
    return this.resets.reset(user, id, dto);
  }
}
