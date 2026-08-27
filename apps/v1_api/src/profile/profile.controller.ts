import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { V1SessionLogoutInterceptor } from '../auth/v1-session.interceptor';
import {
  UpdateMyPreferencesDto,
  UpdateMyRecordConsentDto,
  UpdateMyRegionsDto,
  UpdateProfileDto,
  UpdateSettingsDto,
  UpdatePlayerCardHiddenDto,
  UpdatePlayerCardShapeDto,
  UpdateTournamentRealNameVisibilityDto,
  WithdrawalRequestDto,
} from './dto/profile.dto';
import { ProfileService } from './profile.service';

@Controller()
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me/profile')
  @UseGuards(V1AuthGuard)
  me(@CurrentUser() user: V1AuthUser) {
    return this.profileService.me(user);
  }

  @Get('me/activity-summary')
  @UseGuards(V1AuthGuard)
  activitySummary(@CurrentUser() user: V1AuthUser) {
    return this.profileService.activitySummary(user);
  }

  @Patch('me/profile')
  @UseGuards(V1AuthGuard)
  updateMe(@CurrentUser() user: V1AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateMe(user, dto);
  }

  @Get('users/:userId/public-profile')
  @UseGuards(OptionalV1AuthGuard)
  publicProfile(@CurrentUser() user: V1AuthUser | undefined, @Param('userId') userId: string) {
    return this.profileService.publicProfile(user ?? null, userId);
  }

  @Get('me/settings')
  @UseGuards(V1AuthGuard)
  settings(@CurrentUser() user: V1AuthUser) {
    return this.profileService.settings(user);
  }

  @Patch('me/settings')
  @UseGuards(V1AuthGuard)
  updateSettings(@CurrentUser() user: V1AuthUser, @Body() dto: UpdateSettingsDto) {
    return this.profileService.updateSettings(user, dto);
  }

  @Patch('me/regions')
  @UseGuards(V1AuthGuard)
  updateMyRegions(@CurrentUser() user: V1AuthUser, @Body() dto: UpdateMyRegionsDto) {
    return this.profileService.updateMyRegions(user, dto);
  }

  @Patch('me/preferences')
  @UseGuards(V1AuthGuard)
  updateMyPreferences(@CurrentUser() user: V1AuthUser, @Body() dto: UpdateMyPreferencesDto) {
    return this.profileService.updateMyPreferences(user, dto);
  }

  @Get('me/record-consent')
  @UseGuards(V1AuthGuard)
  myRecordConsent(@CurrentUser() user: V1AuthUser) {
    return this.profileService.myRecordConsent(user);
  }

  @Put('me/record-consent')
  @UseGuards(V1AuthGuard)
  updateMyRecordConsent(@CurrentUser() user: V1AuthUser, @Body() dto: UpdateMyRecordConsentDto) {
    return this.profileService.updateMyRecordConsent(user, dto);
  }

  /** 선수 카드 숨김 토글 (Task 155). 컬럼만 있고 쓰는 경로가 없던 것을 연다. */
  @Get('me/player-card-hidden')
  @UseGuards(V1AuthGuard)
  myPlayerCardHidden(@CurrentUser() user: V1AuthUser) {
    return this.profileService.myPlayerCardHidden(user);
  }

  @Patch('me/player-card-hidden')
  @UseGuards(V1AuthGuard)
  updateMyPlayerCardHidden(@CurrentUser() user: V1AuthUser, @Body() dto: UpdatePlayerCardHiddenDto) {
    return this.profileService.updateMyPlayerCardHidden(user, dto);
  }

  /** 선수 카드 모양 (코스메틱 업적). 잠금 판정은 서버가 하고, 화면은 결과만 그린다. */
  @Get('me/player-card-shape')
  @UseGuards(V1AuthGuard)
  myPlayerCardShape(@CurrentUser() user: V1AuthUser) {
    return this.profileService.myPlayerCardShape(user);
  }

  @Patch('me/player-card-shape')
  @UseGuards(V1AuthGuard)
  updateMyPlayerCardShape(@CurrentUser() user: V1AuthUser, @Body() dto: UpdatePlayerCardShapeDto) {
    return this.profileService.updateMyPlayerCardShape(user, dto);
  }

  @Get('me/tournament-real-name-visibility')
  @UseGuards(V1AuthGuard)
  myTournamentRealNameVisibility(@CurrentUser() user: V1AuthUser) {
    return this.profileService.myTournamentRealNameVisibility(user);
  }

  @Patch('me/tournament-real-name-visibility')
  @UseGuards(V1AuthGuard)
  updateMyTournamentRealNameVisibility(
    @CurrentUser() user: V1AuthUser,
    @Body() dto: UpdateTournamentRealNameVisibilityDto,
  ) {
    return this.profileService.updateMyTournamentRealNameVisibility(user, dto);
  }

  @Post('auth/logout')
  @UseGuards(OptionalV1AuthGuard)
  @UseInterceptors(V1SessionLogoutInterceptor)
  logout(@CurrentUser() user: V1AuthUser | undefined) {
    return this.profileService.logout(user);
  }

  @Post('me/withdrawal-request')
  @UseGuards(V1AuthGuard)
  withdrawalRequest(@CurrentUser() user: V1AuthUser, @Body() dto: WithdrawalRequestDto) {
    return this.profileService.withdrawalRequest(user, dto);
  }
}
