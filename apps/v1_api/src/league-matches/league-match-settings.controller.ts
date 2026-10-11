import { BadRequestException, Body, Controller, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { UpdateLeagueCoverImageDto } from './dto/league-cover-image.dto';
import { UpdateLeagueVenueDto } from './dto/league-venue.dto';
import { CloseLeagueRegistrationDto } from './dto/league-registration-close.dto';
import { LeagueCoverImageService } from './league-cover-image.service';
import { LeagueRegistrationCloseService } from './league-registration-close.service';
import { LeagueVenueService } from './league-venue.service';

const leagueIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({ code: 'LEAGUE_ID_INVALID', message: '올바르지 않은 리그 ID예요.' }),
});

/** 리그 신청 즉시 마감(#35) · 대표 이미지(#37) · 기본 장소. 참가비는 LeagueEntryFeeController. */
@Controller('admin/league-matches')
@UseGuards(V1AuthGuard)
export class LeagueMatchSettingsController {
  constructor(
    private readonly registrationClose: LeagueRegistrationCloseService,
    private readonly coverImage: LeagueCoverImageService,
    private readonly venue: LeagueVenueService,
  ) {}

  @Post(':leagueId/close-registration')
  @HttpCode(200)
  closeRegistration(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', leagueIdPipe) leagueId: string,
    @Body() dto: CloseLeagueRegistrationDto,
  ) {
    return this.registrationClose.close(user, leagueId, dto);
  }

  @Patch(':leagueId/cover-image')
  updateCoverImage(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', leagueIdPipe) leagueId: string,
    @Body() dto: UpdateLeagueCoverImageDto,
  ) {
    return this.coverImage.update(user, leagueId, dto);
  }

  @Patch(':leagueId/venue')
  updateVenue(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', leagueIdPipe) leagueId: string,
    @Body() dto: UpdateLeagueVenueDto,
  ) {
    return this.venue.update(user, leagueId, dto);
  }
}
