import { Body, Controller, Get, Head, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import {
  ChangeTournamentCampaignStatusDto,
  CreateTournamentCampaignDto,
  UpdateTournamentCampaignDto,
} from './dto/tournament-campaign.dto';
import { TournamentCampaignAdminService } from './tournament-campaign-admin.service';
import { TournamentCampaignReadService } from './tournament-campaign-read.service';

@Controller('tournaments/campaigns')
export class TournamentCampaignsPublicController {
  constructor(private readonly campaignReadService: TournamentCampaignReadService) {}

  @Get()
  listPublished(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('sportCode') sportCode?: string,
  ) {
    return this.campaignReadService.listPublished({
      cursor,
      limit: limit ? Number(limit) : undefined,
      sportCode,
    });
  }

  @Head(':slug/availability')
  checkPublishedAvailability(@Param('slug') slug: string): Promise<void> {
    return this.campaignReadService.assertPublishedAvailable(slug);
  }

  @Get(':slug')
  getPublished(@Param('slug') slug: string) {
    return this.campaignReadService.getPublished(slug);
  }
}

@Controller('admin/tournaments')
@UseGuards(V1AuthGuard)
export class TournamentCampaignsAdminController {
  constructor(private readonly campaignAdminService: TournamentCampaignAdminService) {}

  @Get(':tournamentId/campaign/preview')
  preview(@CurrentUser() user: V1AuthUser, @Param('tournamentId') tournamentId: string) {
    return this.campaignAdminService.preview(user, tournamentId);
  }

  @Get(':tournamentId/campaign')
  get(@CurrentUser() user: V1AuthUser, @Param('tournamentId') tournamentId: string) {
    return this.campaignAdminService.get(user, tournamentId);
  }

  @Post(':tournamentId/campaign')
  create(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: CreateTournamentCampaignDto,
  ) {
    return this.campaignAdminService.create(user, tournamentId, dto);
  }

  @Patch(':tournamentId/campaign')
  update(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: UpdateTournamentCampaignDto,
  ) {
    return this.campaignAdminService.update(user, tournamentId, dto);
  }

  @Post(':tournamentId/campaign/status')
  changeStatus(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: ChangeTournamentCampaignStatusDto,
  ) {
    return this.campaignAdminService.changeStatus(user, tournamentId, dto);
  }
}
