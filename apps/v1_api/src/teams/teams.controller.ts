import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { CreatorProfileGuard } from '../profile/creator-profile.guard';
import { CreateTeamInvitationDto } from './dto/create-team-invitation.dto';
import {
  ChangeTeamMembershipRoleDto,
  MutateTeamDto,
  RemoveTeamMembershipDto,
  TeamMembersQueryDto,
  UpdateTeamDto,
} from './dto/mutate-team.dto';
import {
  ApproveTeamJoinApplicationDto,
  CreateTeamJoinApplicationDto,
  ListTeamJoinApplicationsQueryDto,
  RejectTeamJoinApplicationDto,
  WithdrawTeamJoinApplicationDto,
} from './dto/team-join-application.dto';
import { MyTeamsQueryDto, TeamsQueryDto } from './dto/teams-query.dto';
import { TeamsService } from './teams.service';

@Controller()
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get('teams')
  @UseGuards(OptionalV1AuthGuard)
  list(@CurrentUser() user: V1AuthUser | undefined, @Query() query: TeamsQueryDto) {
    return this.teamsService.list(user ?? null, query);
  }

  @Get('teams/:teamId')
  @UseGuards(OptionalV1AuthGuard)
  detail(@CurrentUser() user: V1AuthUser | undefined, @Param('teamId') teamId: string) {
    return this.teamsService.detail(user ?? null, teamId);
  }

  @Post('teams')
  @UseGuards(V1AuthGuard, CreatorProfileGuard)
  create(@CurrentUser() user: V1AuthUser, @Body() dto: MutateTeamDto) {
    return this.teamsService.create(user, dto);
  }

  @Patch('teams/:teamId')
  @UseGuards(V1AuthGuard)
  update(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teamsService.update(user, teamId, dto);
  }

  @Get('teams/:teamId/join-eligibility')
  @UseGuards(V1AuthGuard)
  joinEligibility(@CurrentUser() user: V1AuthUser, @Param('teamId') teamId: string) {
    return this.teamsService.joinEligibility(user, teamId);
  }

  @Get('teams/:teamId/members')
  @UseGuards(OptionalV1AuthGuard)
  members(
    @CurrentUser() user: V1AuthUser | undefined,
    @Param('teamId') teamId: string,
    @Query() query: TeamMembersQueryDto,
  ) {
    return this.teamsService.members(user ?? null, teamId, query);
  }

  @Post('teams/:teamId/join-applications')
  @UseGuards(V1AuthGuard)
  createJoinApplication(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Body() dto: CreateTeamJoinApplicationDto,
  ) {
    return this.teamsService.createJoinApplication(user, teamId, dto);
  }

  @Get('teams/:teamId/join-applications')
  @UseGuards(V1AuthGuard)
  joinApplications(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Query() query: ListTeamJoinApplicationsQueryDto,
  ) {
    return this.teamsService.joinApplications(user, teamId, query);
  }

  @Get('me/teams')
  @UseGuards(V1AuthGuard)
  myTeams(@CurrentUser() user: V1AuthUser, @Query() query: MyTeamsQueryDto) {
    return this.teamsService.myTeams(user, query);
  }

  @Patch('team-memberships/:membershipId/role')
  @UseGuards(V1AuthGuard)
  changeMembershipRole(
    @CurrentUser() user: V1AuthUser,
    @Param('membershipId') membershipId: string,
    @Body() dto: ChangeTeamMembershipRoleDto,
  ) {
    return this.teamsService.changeMembershipRole(user, membershipId, dto);
  }

  @Post('team-memberships/:membershipId/remove')
  @UseGuards(V1AuthGuard)
  removeMembership(
    @CurrentUser() user: V1AuthUser,
    @Param('membershipId') membershipId: string,
    @Body() dto: RemoveTeamMembershipDto,
  ) {
    return this.teamsService.removeMembership(user, membershipId, dto);
  }

  @Post('team-join-applications/:applicationId/withdraw')
  @UseGuards(V1AuthGuard)
  withdrawJoinApplication(
    @CurrentUser() user: V1AuthUser,
    @Param('applicationId') applicationId: string,
    @Body() dto: WithdrawTeamJoinApplicationDto,
  ) {
    return this.teamsService.withdrawJoinApplication(user, applicationId, dto);
  }

  @Post('team-join-applications/:applicationId/approve')
  @UseGuards(V1AuthGuard)
  approveJoinApplication(
    @CurrentUser() user: V1AuthUser,
    @Param('applicationId') applicationId: string,
    @Body() dto: ApproveTeamJoinApplicationDto,
  ) {
    return this.teamsService.approveJoinApplication(user, applicationId, dto);
  }

  @Post('team-join-applications/:applicationId/reject')
  @UseGuards(V1AuthGuard)
  rejectJoinApplication(
    @CurrentUser() user: V1AuthUser,
    @Param('applicationId') applicationId: string,
    @Body() dto: RejectTeamJoinApplicationDto,
  ) {
    return this.teamsService.rejectJoinApplication(user, applicationId, dto);
  }

  // ── 팀 초대 (이메일 기반) ────────────────────────────────────────────

  @Post('teams/:teamId/invitations')
  @UseGuards(V1AuthGuard)
  createInvitation(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Body() dto: CreateTeamInvitationDto,
  ) {
    return this.teamsService.createInvitation(user, teamId, dto);
  }

  @Get('teams/:teamId/invitations')
  @UseGuards(V1AuthGuard)
  listInvitations(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
  ) {
    return this.teamsService.listInvitations(user, teamId);
  }

  @Post('teams/:teamId/invitations/:invitationId/cancel')
  @UseGuards(V1AuthGuard)
  cancelInvitation(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.teamsService.cancelInvitation(user, teamId, invitationId);
  }

  @Get('me/invitations')
  @UseGuards(V1AuthGuard)
  myInvitations(@CurrentUser() user: V1AuthUser) {
    return this.teamsService.myInvitations(user);
  }

  @Post('team-invitations/:invitationId/accept')
  @UseGuards(V1AuthGuard)
  acceptInvitation(
    @CurrentUser() user: V1AuthUser,
    @Param('invitationId') invitationId: string,
  ) {
    return this.teamsService.acceptInvitation(user, invitationId);
  }

  @Post('team-invitations/:invitationId/decline')
  @UseGuards(V1AuthGuard)
  declineInvitation(
    @CurrentUser() user: V1AuthUser,
    @Param('invitationId') invitationId: string,
  ) {
    return this.teamsService.declineInvitation(user, invitationId);
  }
}
