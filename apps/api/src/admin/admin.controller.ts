import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateLessonAdminDto,
  CreateTeamAdminDto,
  CreateVenueAdminDto,
  UpdateVenueAdminDto,
  UpdateMatchStatusDto,
  UpdateLessonStatusDto,
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
    @CurrentUser('nickname') actor: string,
    @Body('note') note?: string,
  ) {
    return this.adminService.warnUser(id, { actor: actor || 'admin', note });
  }

  @Patch('users/:id/status')
  @ApiOperation({ summary: '사용자 상태 변경' })
  async updateUserStatus(
    @Param('id') id: string,
    @CurrentUser('nickname') actor: string,
    @Body('status') status: 'active' | 'suspended',
    @Body('note') note?: string,
  ) {
    return this.adminService.updateUserStatus(id, {
      actor: actor || 'admin',
      status,
      note,
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

  @Get('payments')
  @ApiOperation({ summary: '결제 목록 (전체)' })
  async getPayments() {
    return this.adminService.getPayments();
  }
}
