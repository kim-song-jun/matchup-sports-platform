import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  AdminListQueryDto,
  AdminLogsQueryDto,
  AdminInquiryListQueryDto,
  AdminMatchListQueryDto,
  AdminOverviewQueryDto,
  AdminPopupListQueryDto,
  AdminTeamListQueryDto,
  AdminTeamMatchListQueryDto,
  AdminNoticeListQueryDto,
  AdminUserListQueryDto,
  ChangeMatchStatusDto,
  ChangeInquiryStatusDto,
  ChangeTeamMatchStatusDto,
  ChangeTeamStatusDto,
  ChangeUserStatusDto,
  CreateAdminNoticeDto,
  CreateAdminPopupDto,
  DeleteAdminUserDto,
  GrantAdminDto,
  ReplyInquiryDto,
  UpdateAdminNoticeDto,
  UpdateAdminPopupDto,
  UpdateAdminDto,
} from './dto/admin.dto';
import { AdminService } from './admin.service';
import { UploadsService } from '../uploads/uploads.service';
import '../uploads/multer.types';

@Controller('admin')
@UseGuards(V1AuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('me')
  me(@CurrentUser() user: V1AuthUser) {
    return this.adminService.me(user);
  }

  @Post('content-assets')
  @UseInterceptors(FilesInterceptor('files', 1, {
    dest: UploadsService.UPLOAD_BASE,
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  }))
  createContentAsset(
    @CurrentUser() user: V1AuthUser,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.adminService.createContentAsset(user, files ?? []);
  }

  @Delete('content-assets/:assetId')
  deleteContentAsset(@CurrentUser() user: V1AuthUser, @Param('assetId') assetId: string) {
    return this.adminService.deleteContentAsset(user, assetId);
  }

  @Get('overview')
  overview(@CurrentUser() user: V1AuthUser, @Query() query: AdminOverviewQueryDto) {
    return this.adminService.overview(user, query);
  }

  @Post('users/:userId/status')
  changeUserStatus(
    @CurrentUser() user: V1AuthUser,
    @Param('userId') userId: string,
    @Body() dto: ChangeUserStatusDto,
  ) {
    return this.adminService.changeUserStatus(user, userId, dto);
  }

  @Post('matches/:matchId/status')
  changeMatchStatus(
    @CurrentUser() user: V1AuthUser,
    @Param('matchId') matchId: string,
    @Body() dto: ChangeMatchStatusDto,
  ) {
    return this.adminService.changeMatchStatus(user, matchId, dto);
  }

  @Post('teams/:teamId/status')
  changeTeamStatus(
    @CurrentUser() user: V1AuthUser,
    @Param('teamId') teamId: string,
    @Body() dto: ChangeTeamStatusDto,
  ) {
    return this.adminService.changeTeamStatus(user, teamId, dto);
  }

  @Post('team-matches/:teamMatchId/status')
  changeTeamMatchStatus(
    @CurrentUser() user: V1AuthUser,
    @Param('teamMatchId') teamMatchId: string,
    @Body() dto: ChangeTeamMatchStatusDto,
  ) {
    return this.adminService.changeTeamMatchStatus(user, teamMatchId, dto);
  }

  @Get('action-logs')
  actionLogs(@CurrentUser() user: V1AuthUser, @Query() query: AdminLogsQueryDto) {
    return this.adminService.actionLogs(user, query);
  }

  @Get('status-change-logs')
  statusChangeLogs(@CurrentUser() user: V1AuthUser, @Query() query: AdminLogsQueryDto) {
    return this.adminService.statusChangeLogs(user, query);
  }

  // ─── Users ────────────────────────────────────────────────────────────────

  @Get('users')
  listUsers(@CurrentUser() user: V1AuthUser, @Query() query: AdminUserListQueryDto) {
    return this.adminService.listUsers(user, query);
  }

  @Get('users/:userId')
  getUser(@CurrentUser() user: V1AuthUser, @Param('userId') userId: string) {
    return this.adminService.getUser(user, userId);
  }

  @Delete('users/:userId')
  deleteUser(
    @CurrentUser() user: V1AuthUser,
    @Param('userId') userId: string,
    @Body() dto: DeleteAdminUserDto,
  ) {
    return this.adminService.deleteUser(user, userId, dto);
  }

  // ─── Matches ──────────────────────────────────────────────────────────────

  @Get('matches')
  listMatches(@CurrentUser() user: V1AuthUser, @Query() query: AdminMatchListQueryDto) {
    return this.adminService.listMatches(user, query);
  }

  @Get('matches/:matchId')
  getMatch(@CurrentUser() user: V1AuthUser, @Param('matchId') matchId: string) {
    return this.adminService.getMatch(user, matchId);
  }

  // ─── Teams ────────────────────────────────────────────────────────────────

  @Get('teams')
  listTeams(@CurrentUser() user: V1AuthUser, @Query() query: AdminTeamListQueryDto) {
    return this.adminService.listTeams(user, query);
  }

  @Get('teams/:teamId')
  getTeam(@CurrentUser() user: V1AuthUser, @Param('teamId') teamId: string) {
    return this.adminService.getTeam(user, teamId);
  }

  // ─── Popups ───────────────────────────────────────────────────────────────

  @Get('popups')
  listPopups(@CurrentUser() user: V1AuthUser, @Query() query: AdminPopupListQueryDto) {
    return this.adminService.listPopups(user, query);
  }

  @Get('popups/:popupId')
  getPopup(@CurrentUser() user: V1AuthUser, @Param('popupId') popupId: string) {
    return this.adminService.getPopup(user, popupId);
  }

  @Post('popups')
  createPopup(@CurrentUser() user: V1AuthUser, @Body() dto: CreateAdminPopupDto) {
    return this.adminService.createPopup(user, dto);
  }

  @Patch('popups/:popupId')
  updatePopup(
    @CurrentUser() user: V1AuthUser,
    @Param('popupId') popupId: string,
    @Body() dto: UpdateAdminPopupDto,
  ) {
    return this.adminService.updatePopup(user, popupId, dto);
  }

  @Delete('popups/:popupId')
  deletePopup(@CurrentUser() user: V1AuthUser, @Param('popupId') popupId: string) {
    return this.adminService.deletePopup(user, popupId);
  }
  // ─── Notices ──────────────────────────────────────────────────────────────

  @Get('notices')
  listNotices(@CurrentUser() user: V1AuthUser, @Query() query: AdminNoticeListQueryDto) {
    return this.adminService.listNotices(user, query);
  }

  @Get('notices/:noticeId')
  getNotice(@CurrentUser() user: V1AuthUser, @Param('noticeId') noticeId: string) {
    return this.adminService.getNotice(user, noticeId);
  }

  @Post('notices')
  createNotice(@CurrentUser() user: V1AuthUser, @Body() dto: CreateAdminNoticeDto) {
    return this.adminService.createNotice(user, dto);
  }

  @Patch('notices/:noticeId')
  updateNotice(
    @CurrentUser() user: V1AuthUser,
    @Param('noticeId') noticeId: string,
    @Body() dto: UpdateAdminNoticeDto,
  ) {
    return this.adminService.updateNotice(user, noticeId, dto);
  }

  @Delete('notices/:noticeId')
  deleteNotice(@CurrentUser() user: V1AuthUser, @Param('noticeId') noticeId: string) {
    return this.adminService.deleteNotice(user, noticeId);
  }

  // ─── Inquiries ─────────────────────────────────────────────────────────────

  @Get('inquiries')
  listInquiries(@CurrentUser() user: V1AuthUser, @Query() query: AdminInquiryListQueryDto) {
    return this.adminService.listInquiries(user, query);
  }

  @Get('inquiries/:inquiryId')
  getInquiry(@CurrentUser() user: V1AuthUser, @Param('inquiryId') inquiryId: string) {
    return this.adminService.getInquiry(user, inquiryId);
  }

  @Post('inquiries/:inquiryId/replies')
  replyInquiry(
    @CurrentUser() user: V1AuthUser,
    @Param('inquiryId') inquiryId: string,
    @Body() dto: ReplyInquiryDto,
  ) {
    return this.adminService.replyInquiry(user, inquiryId, dto);
  }

  @Post('inquiries/:inquiryId/status')
  changeInquiryStatus(
    @CurrentUser() user: V1AuthUser,
    @Param('inquiryId') inquiryId: string,
    @Body() dto: ChangeInquiryStatusDto,
  ) {
    return this.adminService.changeInquiryStatus(user, inquiryId, dto);
  }

  // ─── Team Matches ─────────────────────────────────────────────────────────

  @Get('team-matches')
  listTeamMatches(@CurrentUser() user: V1AuthUser, @Query() query: AdminTeamMatchListQueryDto) {
    return this.adminService.listTeamMatches(user, query);
  }

  // ─── Admin management (owner-only) ────────────────────────────────────────

  @Get('admins')
  listAdmins(@CurrentUser() user: V1AuthUser, @Query() query: AdminListQueryDto) {
    return this.adminService.listAdmins(user, query);
  }

  @Post('admins')
  grantAdmin(@CurrentUser() user: V1AuthUser, @Body() dto: GrantAdminDto) {
    return this.adminService.grantAdmin(user, dto);
  }

  @Patch('admins/:userId')
  updateAdmin(
    @CurrentUser() user: V1AuthUser,
    @Param('userId') userId: string,
    @Body() dto: UpdateAdminDto,
  ) {
    return this.adminService.updateAdmin(user, userId, dto);
  }
}
