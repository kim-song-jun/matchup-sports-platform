import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiOkResponse, ApiUnauthorizedResponse, ApiNotFoundResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { TeamsService } from '../teams/teams.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('사용자')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly teamsService: TeamsService,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 프로필 조회' })
  @ApiOkResponse({ description: 'My full profile' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async getMyProfile(@CurrentUser('id') userId: string) {
    return this.usersService.findById(userId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '프로필 수정' })
  @ApiOkResponse({ description: 'Profile updated' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.update(userId, dto);
  }

  @Get('me/matches')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 매치 히스토리' })
  @ApiOkResponse({ description: 'Match history list' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async getMyMatches(
    @CurrentUser('id') userId: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.getMatchHistory(userId, { status, cursor, limit });
  }

  @Get('me/invitations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내게 온 팀 초대 목록 (pending)' })
  @ApiOkResponse({ description: 'Pending invitation list' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async getMyInvitations(@CurrentUser('id') userId: string) {
    return this.teamsService.getMyInvitations(userId);
  }

  @Get('search')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '닉네임으로 사용자 검색 (최대 10명, 본인 제외)' })
  @ApiQuery({ name: 'q', description: '검색할 닉네임 (부분 일치)', required: true })
  @ApiOkResponse({ description: 'User search results (max 10)' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  async searchUsers(
    @CurrentUser('id') userId: string,
    @Query('q') query: string,
  ) {
    if (!query || query.trim().length === 0) {
      throw new BadRequestException({
        code: 'USER_SEARCH_QUERY_REQUIRED',
        message: '검색어를 입력해주세요.',
      });
    }
    return this.usersService.searchByNickname(query.trim(), userId);
  }

  /**
   * Public endpoint (intentional, whitelisted). Returns a limited public profile
   * (nickname, profileImageUrl, gender, mannerScore, totalMatches, sportProfiles only).
   * Full profile (email, phone, etc.) is only accessible via GET /users/me with JwtAuthGuard.
   */
  @Get(':id')
  @ApiOperation({ summary: '사용자 공개 프로필 조회 (공개)' })
  @ApiOkResponse({ description: 'Limited public profile (nickname, profileImageUrl, mannerScore, sport profiles)' })
  @ApiNotFoundResponse({ description: 'User not found' })
  async getProfile(@Param('id') id: string) {
    return this.usersService.getPublicProfile(id);
  }
}
