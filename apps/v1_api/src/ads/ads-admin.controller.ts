import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AdsAdminService } from './ads-admin.service';
import {
  AdminAdCampaignListQueryDto,
  PublishAdCampaignDto,
  SaveAdCampaignDto,
  UpdateAdCampaignDto,
} from './dto/ad-campaign.dto';

/** Owner-only; the service re-checks the role, so the guard only establishes who is calling. */
@Controller('admin/ad-campaigns')
@UseGuards(V1AuthGuard)
export class AdsAdminController {
  constructor(private readonly ads: AdsAdminService) {}

  @Get()
  list(@CurrentUser() user: V1AuthUser, @Query() query: AdminAdCampaignListQueryDto) {
    return this.ads.list(user, query);
  }

  @Get(':campaignId')
  detail(@CurrentUser() user: V1AuthUser, @Param('campaignId') campaignId: string) {
    return this.ads.detail(user, campaignId);
  }

  @Post()
  create(@CurrentUser() user: V1AuthUser, @Body() dto: SaveAdCampaignDto) {
    return this.ads.create(user, dto);
  }

  @Put(':campaignId')
  update(@CurrentUser() user: V1AuthUser, @Param('campaignId') campaignId: string, @Body() dto: UpdateAdCampaignDto) {
    return this.ads.update(user, campaignId, dto);
  }

  @Post(':campaignId/publish')
  publish(@CurrentUser() user: V1AuthUser, @Param('campaignId') campaignId: string, @Body() dto: PublishAdCampaignDto) {
    return this.ads.publish(user, campaignId, dto);
  }

  @Post(':campaignId/stop')
  stop(@CurrentUser() user: V1AuthUser, @Param('campaignId') campaignId: string) {
    return this.ads.stop(user, campaignId);
  }
}
