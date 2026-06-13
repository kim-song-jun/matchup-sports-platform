import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { CreateAnnouncementDto } from './dto/tournament-read.dto';
import { TournamentAnnouncementsService } from './tournament-announcements.service';

@Controller()
@UseGuards(V1AuthGuard)
export class TournamentAnnouncementsController {
  constructor(
    private readonly announcementsService: TournamentAnnouncementsService,
  ) {}

  /** POST /admin/tournaments/:tournamentId/announcements */
  @Post('admin/tournaments/:tournamentId/announcements')
  create(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.announcementsService.create(user, tournamentId, dto);
  }

  /** PATCH /admin/announcements/:announcementId/publish */
  @Patch('admin/announcements/:announcementId/publish')
  publish(
    @CurrentUser() user: V1AuthUser,
    @Param('announcementId') announcementId: string,
  ) {
    return this.announcementsService.publish(user, announcementId);
  }
}
