import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { UpdateProfileDto, UpdateSettingsDto, WithdrawalRequestDto } from './dto/profile.dto';
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

  @Post('auth/logout')
  @UseGuards(V1AuthGuard)
  logout(@CurrentUser() user: V1AuthUser) {
    return this.profileService.logout(user);
  }

  @Post('me/withdrawal-request')
  @UseGuards(V1AuthGuard)
  withdrawalRequest(@CurrentUser() user: V1AuthUser, @Body() dto: WithdrawalRequestDto) {
    return this.profileService.withdrawalRequest(user, dto);
  }
}
