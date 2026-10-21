// apps/v1_api/src/tournaments/slots/tournament-slot-standings.controller.ts
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { FinalistAssignmentDto } from './dto/finalist-assignment.dto';
import { FillFromStandingsDto } from './dto/fill-from-standings.dto';
import { CrossGroupRound12Dto } from './dto/cross-group-round12.dto';
import { TournamentSlotService } from './tournament-slot.service';

/** 조 순위로 결선 GROUP_RANK 자리 채우기 — 어드민 전용(권한은 서비스의 getActiveAdmin/getMutationAdmin). */
@Controller()
@UseGuards(V1AuthGuard)
export class TournamentSlotStandingsController {
  constructor(private readonly slots: TournamentSlotService) {}

  @Get('admin/tournaments/:tournamentId/bracket/finalist-preview')
  finalistPreview(@CurrentUser() user: V1AuthUser, @Param('tournamentId') tournamentId: string) {
    return this.slots.finalistPreview(user, tournamentId);
  }

  @Post('admin/tournaments/:tournamentId/bracket/finalist-assignments')
  finalistApply(@CurrentUser() user: V1AuthUser, @Param('tournamentId') tournamentId: string, @Body() dto: FinalistAssignmentDto) {
    return this.slots.finalistApply(user, tournamentId, dto);
  }

  @Get('admin/tournaments/:tournamentId/bracket/round12-preview')
  round12Preview(@CurrentUser() user: V1AuthUser, @Param('tournamentId') tournamentId: string) {
    return this.slots.round12Preview(user, tournamentId);
  }

  @Post('admin/tournaments/:tournamentId/bracket/round12-assignments')
  round12Apply(@CurrentUser() user: V1AuthUser, @Param('tournamentId') tournamentId: string, @Body() dto: CrossGroupRound12Dto) {
    return this.slots.round12Apply(user, tournamentId, dto);
  }

  @Get('admin/tournaments/:tournamentId/slots/standings-preview')
  standingsPreview(@CurrentUser() user: V1AuthUser, @Param('tournamentId') tournamentId: string) {
    return this.slots.standingsPreview(user, tournamentId);
  }

  @Post('admin/tournaments/:tournamentId/slots/fill-from-standings')
  fillFromStandings(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: FillFromStandingsDto,
  ) {
    return this.slots.fillFromStandings(user, tournamentId, dto.overrides ?? []);
  }
}
