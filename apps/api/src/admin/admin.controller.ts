import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminUserStatus, MercenaryPostStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminService } from './admin.service';
import {
  CreateLessonAdminDto,
  CreateTeamAdminDto,
  CreateVenueAdminDto,
  UpdateLessonStatusDto,
  UpdateMatchStatusDto,
  UpdateUserStatusAdminDto,
  UpdateVenueAdminDto,
  WarnUserAdminDto,
} from './dto';

@ApiTags('관리자')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: '대시보드 통계' })
  async getStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('statistics')
  @ApiOperation({ summary: '관리자 통계 개요' })
  async getStatisticsOverview() {
    return this.adminService.getStatisticsOverview();
  }

  @Get('users')
  @ApiOperation({ summary: '사용자 목록' })
  async getUsers(@Query('search') search?: string, @Query('cursor') cursor?: string) {
    return this.adminService.getUsers({ search, cursor });
  }

  @Get('users/:id')
  @ApiOperation({ summary: '사용자 상세' })
  async getUserDetail(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  @Post('users/:id/warn')
  @ApiOperation({ summary: '사용자 경고 부여' })
  async warnUser(
    @Param('id') id: string,
    @CurrentUser('id') actorId: string,
    @CurrentUser('nickname') actorLabel: string,
    @Body() body: WarnUserAdminDto,
  ) {
    return this.adminService.warnUser(id, {
      actorId,
      actorLabel: actorLabel || 'admin',
      note: body.note,
    });
  }

  @Patch('users/:id/status')
  @ApiOperation({ summary: '사용자 상태 변경' })
  async updateUserStatus(
    @Param('id') id: string,
    @CurrentUser('id') actorId: string,
    @CurrentUser('nickname') actorLabel: string,
    @Body() body: UpdateUserStatusAdminDto,
  ) {
    return this.adminService.updateUserStatus(id, {
      actorId,
      actorLabel: actorLabel || 'admin',
      status: body.status as AdminUserStatus,
      note: body.note,
    });
  }

  @Get('matches')
  @ApiOperation({ summary: '매치 목록 (전체)' })
  async getMatches(@Query('status') status?: string, @Query('cursor') cursor?: string) {
    return this.adminService.getMatches({ status, cursor });
  }

  @Patch('matches/:id/status')
  @ApiOperation({ summary: '매치 상태 변경' })
  async updateMatchStatus(@Param('id') id: string, @Body() body: UpdateMatchStatusDto) {
    return this.adminService.updateMatchStatus(id, body.status);
  }

  @Get('reviews')
  @ApiOperation({ summary: '평가 목록' })
  async getReviews(@Query('search') search?: string) {
    return this.adminService.getReviews({ search });
  }

  @Get('mercenary')
  @ApiOperation({ summary: '용병 모집글 목록' })
  async getMercenaryPosts(
    @Query('search') search?: string,
    @Query('status') status?: MercenaryPostStatus,
  ) {
    return this.adminService.getMercenaryPosts({ search, status });
  }

  @Delete('mercenary/:id')
  @ApiOperation({ summary: '관리자 용병 모집글 삭제' })
  async deleteMercenaryPost(@Param('id') id: string) {
    return this.adminService.deleteMercenaryPost(id);
  }

  @Get('lessons')
  @ApiOperation({ summary: '강좌 목록 (전체)' })
  async getLessons() {
    return this.adminService.getLessons();
  }

  @Post('lessons')
  @ApiOperation({ summary: '강좌 생성 (관리자)' })
  async createLesson(@Body() body: CreateLessonAdminDto) {
    return this.adminService.createLesson(body);
  }

  @Patch('lessons/:id/status')
  @ApiOperation({ summary: '강좌 상태 변경' })
  async updateLessonStatus(@Param('id') id: string, @Body() body: UpdateLessonStatusDto) {
    return this.adminService.updateLessonStatus(id, body.status);
  }

  @Get('teams')
  @ApiOperation({ summary: '팀 목록' })
  async getTeams() {
    return this.adminService.getTeams();
  }

  @Get('teams/:id')
  @ApiOperation({ summary: '팀 상세 (관리자)' })
  async getTeamDetail(@Param('id') id: string) {
    return this.adminService.getTeamDetail(id);
  }

  @Post('teams')
  @ApiOperation({ summary: '팀 생성 (관리자)' })
  async createTeam(@Body() body: CreateTeamAdminDto) {
    return this.adminService.createTeam(body);
  }

  @Get('venues')
  @ApiOperation({ summary: '시설 목록 (전체)' })
  async getVenues() {
    return this.adminService.getVenues();
  }

  @Get('venues/:id')
  @ApiOperation({ summary: '시설 상세 (관리자)' })
  async getVenueDetail(@Param('id') id: string) {
    return this.adminService.getVenueDetail(id);
  }

  @Post('venues')
  @ApiOperation({ summary: '시설 등록 (관리자)' })
  async createVenue(@Body() body: CreateVenueAdminDto) {
    return this.adminService.createVenue(body);
  }

  @Patch('venues/:id')
  @ApiOperation({ summary: '시설 수정 (관리자)' })
  async updateVenue(@Param('id') id: string, @Body() body: UpdateVenueAdminDto) {
    return this.adminService.updateVenue(id, body);
  }

  @Delete('venues/:id')
  @ApiOperation({ summary: '시설 삭제 (관리자)' })
  async deleteVenue(@Param('id') id: string) {
    return this.adminService.deleteVenue(id);
  }

  @Get('payments')
  @ApiOperation({ summary: '결제 목록 (전체)' })
  async getPayments() {
    return this.adminService.getPayments();
  }
}
