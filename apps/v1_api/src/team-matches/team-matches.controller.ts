import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  CancelTeamMatchDto,
  CloseTeamMatchDto,
  CompleteTeamMatchDto,
  MutateTeamMatchDto,
  ReopenTeamMatchDto,
  UpdateTeamMatchDto,
} from './dto/mutate-team-match.dto';
import {
  ApproveTeamMatchApplicationDto,
  CreateTeamMatchApplicationDto,
  ListTeamMatchApplicationsQueryDto,
  RejectTeamMatchApplicationDto,
  WithdrawTeamMatchApplicationDto,
} from './dto/team-match-application.dto';
import { MyTeamMatchesQueryDto, TeamMatchEligibilityQueryDto, TeamMatchesQueryDto } from './dto/team-matches-query.dto';
import { TeamMatchesService } from './team-matches.service';

@Controller()
export class TeamMatchesController {
  constructor(private readonly teamMatchesService: TeamMatchesService) {}

  @Get('team-matches')
  @UseGuards(OptionalV1AuthGuard)
  list(@CurrentUser() user: V1AuthUser | undefined, @Query() query: TeamMatchesQueryDto) {
    return this.teamMatchesService.list(user ?? null, query);
  }

  @Post('team-matches')
  @UseGuards(V1AuthGuard)
  create(@CurrentUser() user: V1AuthUser, @Body() dto: MutateTeamMatchDto) {
    return this.teamMatchesService.create(user, dto);
  }

  @Get('team-matches/:teamMatchId/edit')
  @UseGuards(V1AuthGuard)
  edit(@CurrentUser() user: V1AuthUser, @Param('teamMatchId') teamMatchId: string) {
    return this.teamMatchesService.edit(user, teamMatchId);
  }

  @Get('team-matches/:teamMatchId')
  @UseGuards(OptionalV1AuthGuard)
  detail(@CurrentUser() user: V1AuthUser | undefined, @Param('teamMatchId') teamMatchId: string) {
    return this.teamMatchesService.detail(user ?? null, teamMatchId);
  }

  @Get('team-matches/:teamMatchId/application-eligibility')
  @UseGuards(V1AuthGuard)
  applicationEligibility(
    @CurrentUser() user: V1AuthUser,
    @Param('teamMatchId') teamMatchId: string,
    @Query() query: TeamMatchEligibilityQueryDto,
  ) {
    return this.teamMatchesService.applicationEligibility(user, teamMatchId, query);
  }

  @Patch('team-matches/:teamMatchId')
  @UseGuards(V1AuthGuard)
  update(
    @CurrentUser() user: V1AuthUser,
    @Param('teamMatchId') teamMatchId: string,
    @Body() dto: UpdateTeamMatchDto,
  ) {
    return this.teamMatchesService.update(user, teamMatchId, dto);
  }

  @Post('team-matches/:teamMatchId/cancel')
  @UseGuards(V1AuthGuard)
  cancel(
    @CurrentUser() user: V1AuthUser,
    @Param('teamMatchId') teamMatchId: string,
    @Body() dto: CancelTeamMatchDto,
  ) {
    return this.teamMatchesService.cancel(user, teamMatchId, dto);
  }

  @Post('team-matches/:teamMatchId/close')
  @UseGuards(V1AuthGuard)
  close(
    @CurrentUser() user: V1AuthUser,
    @Param('teamMatchId') teamMatchId: string,
    @Body() dto: CloseTeamMatchDto,
  ) {
    return this.teamMatchesService.close(user, teamMatchId, dto);
  }

  @Post('team-matches/:teamMatchId/reopen')
  @UseGuards(V1AuthGuard)
  reopen(
    @CurrentUser() user: V1AuthUser,
    @Param('teamMatchId') teamMatchId: string,
    @Body() dto: ReopenTeamMatchDto,
  ) {
    return this.teamMatchesService.reopen(user, teamMatchId, dto);
  }

  @Post('team-matches/:teamMatchId/complete')
  @UseGuards(V1AuthGuard)
  complete(
    @CurrentUser() user: V1AuthUser,
    @Param('teamMatchId') teamMatchId: string,
    @Body() dto: CompleteTeamMatchDto,
  ) {
    return this.teamMatchesService.complete(user, teamMatchId, dto);
  }

  @Post('team-matches/:teamMatchId/applications')
  @UseGuards(V1AuthGuard)
  createApplication(
    @CurrentUser() user: V1AuthUser,
    @Param('teamMatchId') teamMatchId: string,
    @Body() dto: CreateTeamMatchApplicationDto,
  ) {
    return this.teamMatchesService.createApplication(user, teamMatchId, dto);
  }

  @Get('team-matches/:teamMatchId/applications')
  @UseGuards(V1AuthGuard)
  applications(
    @CurrentUser() user: V1AuthUser,
    @Param('teamMatchId') teamMatchId: string,
    @Query() query: ListTeamMatchApplicationsQueryDto,
  ) {
    return this.teamMatchesService.applications(user, teamMatchId, query);
  }

  @Post('team-match-applications/:applicationId/withdraw')
  @UseGuards(V1AuthGuard)
  withdrawApplication(
    @CurrentUser() user: V1AuthUser,
    @Param('applicationId') applicationId: string,
    @Body() dto: WithdrawTeamMatchApplicationDto,
  ) {
    return this.teamMatchesService.withdrawApplication(user, applicationId, dto);
  }

  @Post('team-match-applications/:applicationId/approve')
  @UseGuards(V1AuthGuard)
  approveApplication(
    @CurrentUser() user: V1AuthUser,
    @Param('applicationId') applicationId: string,
    @Body() dto: ApproveTeamMatchApplicationDto,
  ) {
    return this.teamMatchesService.approveApplication(user, applicationId, dto);
  }

  @Post('team-match-applications/:applicationId/reject')
  @UseGuards(V1AuthGuard)
  rejectApplication(
    @CurrentUser() user: V1AuthUser,
    @Param('applicationId') applicationId: string,
    @Body() dto: RejectTeamMatchApplicationDto,
  ) {
    return this.teamMatchesService.rejectApplication(user, applicationId, dto);
  }

  @Get('me/team-matches')
  @UseGuards(V1AuthGuard)
  myTeamMatches(@CurrentUser() user: V1AuthUser, @Query() query: MyTeamMatchesQueryDto) {
    return this.teamMatchesService.myTeamMatches(user, query);
  }
}
