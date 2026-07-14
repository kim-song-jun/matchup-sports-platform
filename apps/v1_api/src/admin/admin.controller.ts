import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  AdminListQueryDto,
  AdminLogsQueryDto,
  AdminInquiryListQueryDto,
  AdminMatchListQueryDto,
  AdminOverviewQueryDto,
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
  DeleteAdminUserDto,
  GrantAdminDto,
  ReplyInquiryDto,
  UpdateAdminNoticeDto,
  UpdateAdminDto,
} from './dto/admin.dto';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(V1AuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('me')
  me(@CurrentUser() user: V1AuthUser) {
    return this.adminService.me(user);
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

  // ─── Notices ──────────────────────────────────────────────────────────────

  @Get('notices')
  listNotices(@CurrentUser() user: V1AuthUser, @Query() query: AdminNoticeListQueryDto) {
    return this.adminService.listNotices(user, query);
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

  @Patch('inquiries/:inquiryId/replies/:replyId')
  updateInquiryReply(
    @CurrentUser() user: V1AuthUser,
    @Param('inquiryId') inquiryId: string,
    @Param('replyId') replyId: string,
    @Body() dto: ReplyInquiryDto,
  ) {
    return this.adminService.updateInquiryReply(user, inquiryId, replyId, dto);
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
