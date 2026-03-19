import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MatchesService } from './matches.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateMatchDto, MatchFilterDto } from './dto/match.dto';

@ApiTags('매치')
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  @ApiOperation({ summary: '매치 목록 조회' })
  async findAll(@Query() filter: MatchFilterDto) {
    return this.matchesService.findAll(filter);
  }

  @Get('recommended')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'AI 추천 매치' })
  async getRecommended(@CurrentUser('id') userId: string) {
    return this.matchesService.getRecommended(userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '매치 생성' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateMatchDto,
  ) {
    return this.matchesService.create(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '매치 상세 조회' })
  async findOne(@Param('id') id: string) {
    return this.matchesService.findOne(id);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '매치 참가' })
  async join(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.matchesService.join(id, userId);
  }

  @Delete(':id/leave')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '매치 탈퇴' })
  async leave(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.matchesService.leave(id, userId);
  }

  @Post(':id/teams')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '팀 자동 구성' })
  async generateTeams(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.matchesService.generateTeams(id, userId);
  }

  @Post(':id/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '매치 완료' })
  async complete(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.matchesService.complete(id, userId);
  }
}
