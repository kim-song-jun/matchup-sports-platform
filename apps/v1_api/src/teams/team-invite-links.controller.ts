import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { TeamInviteLinksService } from './team-invite-links.service';

@Controller()
export class TeamInviteLinksController {
  constructor(private readonly inviteLinks: TeamInviteLinksService) {}

  @Get('teams/:teamId/invite-link')
  @UseGuards(V1AuthGuard)
  current(@CurrentUser() user: V1AuthUser, @Param('teamId') teamId: string) {
    return this.inviteLinks.current(user, teamId);
  }

  @Post('teams/:teamId/invite-link')
  @UseGuards(V1AuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  issue(@CurrentUser() user: V1AuthUser, @Param('teamId') teamId: string) {
    return this.inviteLinks.issue(user, teamId);
  }

  @Post('teams/:teamId/invite-link/reissue')
  @UseGuards(V1AuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  reissue(@CurrentUser() user: V1AuthUser, @Param('teamId') teamId: string) {
    return this.inviteLinks.reissue(user, teamId);
  }

  @Get('team-invite-links/:token')
  @UseGuards(OptionalV1AuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  preview(@CurrentUser() user: V1AuthUser | undefined, @Param('token') token: string) {
    return this.inviteLinks.preview(user ?? null, token);
  }

  @Post('team-invite-links/:token/join-applications')
  @UseGuards(V1AuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  join(@CurrentUser() user: V1AuthUser, @Param('token') token: string) {
    return this.inviteLinks.join(user, token);
  }
}
