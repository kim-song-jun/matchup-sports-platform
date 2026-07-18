import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { CreatorProfileGuard } from '../profile/creator-profile.guard';
import { MatchesQueryDto } from './dto/matches-query.dto';
import {
  CreateMatchApplicationDto,
  ListMatchApplicationsQueryDto,
} from './dto/match-application.dto';
import { CancelMatchDto, MutateMatchDto, UpdateMatchDto } from './dto/mutate-match.dto';
import { MatchesService } from './matches.service';

@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  @UseGuards(OptionalV1AuthGuard)
  list(@CurrentUser() user: V1AuthUser | undefined, @Query() query: MatchesQueryDto) {
    return this.matchesService.list(user ?? null, query);
  }

  @Post()
  @UseGuards(V1AuthGuard, CreatorProfileGuard)
  create(@CurrentUser() user: V1AuthUser, @Body() dto: MutateMatchDto) {
    return this.matchesService.create(user, dto);
  }

  @Get(':matchId/edit')
  @UseGuards(V1AuthGuard)
  edit(@CurrentUser() user: V1AuthUser, @Param('matchId') matchId: string) {
    return this.matchesService.edit(user, matchId);
  }

  @Get(':matchId')
  @UseGuards(OptionalV1AuthGuard)
  detail(@CurrentUser() user: V1AuthUser | undefined, @Param('matchId') matchId: string) {
    return this.matchesService.detail(user ?? null, matchId);
  }

  @Get(':matchId/application-eligibility')
  @UseGuards(V1AuthGuard)
  applicationEligibility(
    @CurrentUser() user: V1AuthUser,
    @Param('matchId') matchId: string,
  ) {
    return this.matchesService.applicationEligibility(user, matchId);
  }

  @Post(':matchId/applications')
  @UseGuards(V1AuthGuard)
  createApplication(
    @CurrentUser() user: V1AuthUser,
    @Param('matchId') matchId: string,
    @Body() dto: CreateMatchApplicationDto,
  ) {
    return this.matchesService.createApplication(user, matchId, dto);
  }

  @Get(':matchId/applications')
  @UseGuards(V1AuthGuard)
  listApplications(
    @CurrentUser() user: V1AuthUser,
    @Param('matchId') matchId: string,
    @Query() query: ListMatchApplicationsQueryDto,
  ) {
    return this.matchesService.listApplications(user, matchId, query);
  }

  @Patch(':matchId')
  @UseGuards(V1AuthGuard)
  update(
    @CurrentUser() user: V1AuthUser,
    @Param('matchId') matchId: string,
    @Body() dto: UpdateMatchDto,
  ) {
    return this.matchesService.update(user, matchId, dto);
  }

  @Post(':matchId/cancel')
  @UseGuards(V1AuthGuard)
  cancel(
    @CurrentUser() user: V1AuthUser,
    @Param('matchId') matchId: string,
    @Body() dto: CancelMatchDto,
  ) {
    return this.matchesService.cancel(user, matchId, dto);
  }
}
