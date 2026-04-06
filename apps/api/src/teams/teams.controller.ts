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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TeamsService } from './teams.service';
import { TeamMembershipService } from './team-membership.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AddMemberDto, UpdateMemberRoleDto, TransferOwnershipDto } from './dto/membership.dto';
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
  async findAll(
    @Query('sportType') sportType?: string,
    @Query('city') city?: string,
    @Query('recruiting') recruiting?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.teamsService.findAll({ sportType, city, recruiting, cursor });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내가 속한 팀 목록 (역할 포함)' })
  async findMine(@CurrentUser('id') userId: string) {
    return this.teamMembershipService.listUserTeams(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: '팀 상세' })
  async findById(@Param('id') id: string) {
    return this.teamsService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '팀 생성' })
  async create(@CurrentUser('id') userId: string, @Body() body: Record<string, unknown>) {
    return this.teamsService.create(userId, body);
  }

  // ─── Membership Endpoints ─────────────────────────────────────────────

  @Get(':id/members')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '팀 멤버 목록 (member+ 접근 가능)' })
  async listMembers(@Param('id') teamId: string, @CurrentUser('id') userId: string) {
    await this.teamMembershipService.assertRole(teamId, userId, TeamRole.member);
    return this.teamMembershipService.listTeamMembers(teamId);
  }

  @Post(':id/members')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '팀 멤버 추가 (manager+ 전용)' })
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
  async removeMember(
    @Param('id') teamId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.teamMembershipService.assertRole(teamId, userId, TeamRole.owner);
    await this.teamMembershipService.removeMember(teamId, targetUserId);
  }

  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '팀 자진 탈퇴 (owner 불가)' })
  async leaveTeam(@Param('id') teamId: string, @CurrentUser('id') userId: string) {
    await this.teamMembershipService.leaveTeam(teamId, userId);
  }

  @Post(':id/transfer-ownership')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '팀 소유권 이전 (owner 전용)' })
  async transferOwnership(
    @Param('id') teamId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: TransferOwnershipDto,
  ) {
    await this.teamMembershipService.assertRole(teamId, userId, TeamRole.owner);
    await this.teamMembershipService.transferOwnership(teamId, userId, dto.toUserId, dto.demoteTo);
  }
}
