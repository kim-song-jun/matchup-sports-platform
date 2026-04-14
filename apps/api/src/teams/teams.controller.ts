import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiNoContentResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';
import { TeamsService } from './teams.service';
import { TeamMembershipService } from './team-membership.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { AddMemberDto, UpdateMemberRoleDto, TransferOwnershipDto, InviteMemberDto } from './dto/membership.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamFilterDto } from './dto/team-filter.dto';
import { TeamRole } from '@prisma/client';

@ApiTags('팀/클럽')
@Controller('teams')
export class TeamsController {
  constructor(
    private readonly teamsService: TeamsService,
    private readonly teamMembershipService: TeamMembershipService,
  ) {}

  @Get()
  @ApiOperation({ summary: '팀 목록' })
  @ApiOkResponse({ description: '팀 목록 반환 (cursor 페이지네이션)' })
  async findAll(@Query() filter: TeamFilterDto) {
    return this.teamsService.findAll({
      sportType: filter.sportType,
      city: filter.city,
      recruiting: filter.recruiting,
      cursor: filter.cursor,
      limit: filter.limit,
      search: filter.search,
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내가 속한 팀 목록 (역할 포함)' })
  @ApiOkResponse({ description: '소속 팀 목록 반환' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  async findMine(@CurrentUser('id') userId: string) {
    return this.teamMembershipService.listUserTeams(userId);
  }

  @Get(':id/hub')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '팀 허브 집계 데이터' })
  @ApiOkResponse({ description: '팀 허브 데이터 반환' })
  @ApiNotFoundResponse({ description: '팀 없음' })
  async findHub(
    @Param('id') id: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.teamsService.findHub(id, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: '팀 상세' })
  @ApiOkResponse({ description: '팀 상세 반환' })
  @ApiNotFoundResponse({ description: '팀 없음' })
  async findById(@Param('id') id: string) {
    return this.teamsService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '팀 생성' })
  @ApiCreatedResponse({ description: '팀 생성 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  async create(@CurrentUser('id') userId: string, @Body() body: CreateTeamDto) {
    return this.teamsService.create(userId, body);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '팀 수정 (manager+)' })
  @ApiOkResponse({ description: '팀 수정 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '팀 매니저+ 권한 필요' })
  async update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() body: UpdateTeamDto,
  ) {
    return this.teamsService.update(id, userId, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '팀 삭제 (owner 전용)' })
  @ApiNoContentResponse({ description: '팀 삭제 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '팀 owner 권한 필요' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.teamsService.remove(id, userId);
  }

  // ─── Membership Endpoints ─────────────────────────────────────────────

  @Get(':id/members')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '팀 멤버 목록 (member+ 접근 가능)' })
  @ApiOkResponse({ description: '팀 멤버 목록 반환' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '팀 멤버 이상 권한 필요' })
  async listMembers(@Param('id') teamId: string, @CurrentUser('id') userId: string) {
    await this.teamMembershipService.assertRole(teamId, userId, TeamRole.member);
    return this.teamMembershipService.listTeamMembers(teamId);
  }

  @Post(':id/members')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '팀 멤버 추가 (manager+ 전용)' })
  @ApiCreatedResponse({ description: '멤버 추가 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '팀 매니저+ 권한 필요' })
  async addMember(
    @Param('id') teamId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddMemberDto,
  ) {
    await this.teamMembershipService.assertRole(teamId, userId, TeamRole.manager);
    const role = dto.role ?? TeamRole.member;
    return this.teamMembershipService.addMember(teamId, dto.userId, role, userId);
  }

  @Patch(':id/members/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '팀 멤버 역할 변경 (owner 전용)' })
  @ApiOkResponse({ description: '역할 변경 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '팀 owner 권한 필요' })
  async updateMemberRole(
    @Param('id') teamId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    await this.teamMembershipService.assertRole(teamId, userId, TeamRole.owner);
    return this.teamMembershipService.updateRole(teamId, targetUserId, dto.role);
  }

  @Delete(':id/members/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '팀 멤버 강제 탈퇴 (owner 전용)' })
  @ApiNoContentResponse({ description: '멤버 탈퇴 처리 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '팀 owner 권한 필요' })
  async removeMember(
    @Param('id') teamId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.teamMembershipService.assertRole(teamId, userId, TeamRole.owner);
    await this.teamMembershipService.removeMember(teamId, targetUserId);
  }

  @Post(':id/apply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '팀 가입 신청 (비멤버 전용)' })
  @ApiCreatedResponse({ description: '팀 가입 신청 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiConflictResponse({ description: '이미 신청했거나 멤버임' })
  async applyToTeam(
    @Param('id') teamId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.teamsService.applyToTeam(teamId, userId);
  }

  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '팀 자진 탈퇴 (owner 불가)' })
  @ApiNoContentResponse({ description: '팀 탈퇴 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: 'owner는 탈퇴 불가 (소유권 이전 필요)' })
  async leaveTeam(@Param('id') teamId: string, @CurrentUser('id') userId: string) {
    await this.teamMembershipService.leaveTeam(teamId, userId);
  }

  @Post(':id/transfer-ownership')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '팀 소유권 이전 (owner 전용)' })
  @ApiNoContentResponse({ description: '소유권 이전 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '팀 owner 권한 필요' })
  async transferOwnership(
    @Param('id') teamId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: TransferOwnershipDto,
  ) {
    await this.teamMembershipService.assertRole(teamId, userId, TeamRole.owner);
    await this.teamMembershipService.transferOwnership(teamId, userId, dto.toUserId, dto.demoteTo);
  }

  // ─── Invitation Endpoints ──────────────────────────────────────────────────

  @Post(':id/invitations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '팀 멤버 초대 (manager 이상)' })
  @ApiCreatedResponse({ description: '초대 전송 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '팀 매니저+ 권한 필요' })
  async inviteMember(
    @Param('id') teamId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.teamsService.inviteMember(teamId, userId, dto.inviteeId, dto.role);
  }

  @Get(':id/invitations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '팀 초대 목록 (manager 이상)' })
  @ApiOkResponse({ description: '초대 목록 반환' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '팀 매니저+ 권한 필요' })
  async getTeamInvitations(
    @Param('id') teamId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.teamsService.getTeamInvitations(teamId, userId);
  }

  @Patch(':id/invitations/:invitationId/accept')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '초대 수락 (초대받은 본인)' })
  @ApiOkResponse({ description: '초대 수락 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '초대받은 본인 전용' })
  async acceptInvitation(
    @Param('id') teamId: string,
    @Param('invitationId') invitationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.teamsService.acceptInvitation(teamId, invitationId, userId);
  }

  @Patch(':id/invitations/:invitationId/decline')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '초대 거절 (초대받은 본인)' })
  @ApiOkResponse({ description: '초대 거절 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '초대받은 본인 전용' })
  async declineInvitation(
    @Param('id') teamId: string,
    @Param('invitationId') invitationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.teamsService.declineInvitation(teamId, invitationId, userId);
  }
}
