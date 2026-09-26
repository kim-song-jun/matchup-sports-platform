import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/tournament-read.dto';
import { TournamentAnnouncementsService } from './tournament-announcements.service';

@Controller()
@UseGuards(V1AuthGuard)
export class TournamentAnnouncementsController {
  constructor(
    private readonly announcementsService: TournamentAnnouncementsService,
  ) {}

  /** GET /admin/tournaments/:tournamentId/announcements
   * 대회별 전체 공지 목록 (초안+공개, createdAt 내림차순).
   * active admin이면 조회 가능(support 포함).
   */
  @Get('admin/tournaments/:tournamentId/announcements')
  list(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.announcementsService.listByTournament(user, tournamentId);
  }

  /** GET /tournaments/:tournamentId/announcements/me
   * 신청자 본인이 볼 수 있는 공개 상세용 공지 목록 — audience='public' 공지 + 본인의
   * 신청 상태가 대상에 해당하는 targeted 공지(confirmed_only/waitlist/all_registered).
   * 로그인만 하면 누구나 호출 가능하고, 신청 이력이 없으면 public 공지만 돌아온다
   * (참가팀만 볼 수 있는 targeted 공지를 관리자 라우트 없이 노출하지 않기 위함).
   */
  @Get('tournaments/:tournamentId/announcements/me')
  listForMe(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.announcementsService.listForParticipant(user, tournamentId);
  }

  /** POST /admin/tournaments/:tournamentId/announcements */
  @Post('admin/tournaments/:tournamentId/announcements')
  create(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.announcementsService.create(user, tournamentId, dto);
  }

  /** PATCH /admin/announcements/:announcementId */
  @Patch('admin/announcements/:announcementId')
  update(
    @CurrentUser() user: V1AuthUser,
    @Param('announcementId') announcementId: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.announcementsService.update(user, announcementId, dto);
  }

  /** PATCH /admin/announcements/:announcementId/publish */
  @Patch('admin/announcements/:announcementId/publish')
  publish(
    @CurrentUser() user: V1AuthUser,
    @Param('announcementId') announcementId: string,
  ) {
    return this.announcementsService.publish(user, announcementId);
  }

  /** DELETE /admin/announcements/:announcementId */
  @Delete('admin/announcements/:announcementId')
  remove(
    @CurrentUser() user: V1AuthUser,
    @Param('announcementId') announcementId: string,
  ) {
    return this.announcementsService.remove(user, announcementId);
  }
}
