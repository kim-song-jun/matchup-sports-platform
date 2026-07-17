import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
  UpdateMyRegionsDto,
  UpdateProfileDto,
  UpdateSettingsDto,
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

  @Post('auth/logout')
  @UseInterceptors(V1SessionLogoutInterceptor)
  logout() {
    return this.profileService.logout();
  }

  @Post('me/withdrawal-request')
  @UseGuards(V1AuthGuard)
  withdrawalRequest(@CurrentUser() user: V1AuthUser, @Body() dto: WithdrawalRequestDto) {
    return this.profileService.withdrawalRequest(user, dto);
  }
}
