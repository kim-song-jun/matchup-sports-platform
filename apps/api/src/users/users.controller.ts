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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
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
  async getMyProfile(@CurrentUser('id') userId: string) {
    return this.usersService.findById(userId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '프로필 수정' })
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
  async getMyInvitations(@CurrentUser('id') userId: string) {
    return this.teamsService.getMyInvitations(userId);
  }

  @Get('search')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '닉네임으로 사용자 검색 (최대 10명, 본인 제외)' })
  @ApiQuery({ name: 'q', description: '검색할 닉네임 (부분 일치)', required: true })
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

  @Get(':id')
  @ApiOperation({ summary: '사용자 프로필 조회' })
  async getProfile(@Param('id') id: string) {
    return this.usersService.getPublicProfile(id);
  }
}
