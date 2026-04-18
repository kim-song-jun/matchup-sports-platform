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
  ApiConflictResponse,
} from '@nestjs/swagger';
import { MatchesService } from './matches.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ArriveMatchDto, CancelMatchDto, ComposeTeamsDto, CreateMatchDto, MatchFilterDto, PreviewTeamsResponseDto, UpdateMatchDto } from './dto/match.dto';

@ApiTags('매치')
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  @ApiOperation({ summary: '매치 목록 조회' })
  @ApiOkResponse({ description: '매치 목록 반환 (cursor 페이지네이션)' })
  async findAll(@Query() filter: MatchFilterDto) {
    return this.matchesService.findAll(filter);
  }

  @Get('recommended')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'AI 추천 매치' })
  @ApiOkResponse({ description: 'AI 점수 기반 추천 매치 목록 반환' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  async getRecommended(@CurrentUser('id') userId: string) {
    return this.matchesService.getRecommended(userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '매치 생성' })
  @ApiCreatedResponse({ description: '매치 생성 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateMatchDto,
  ) {
    return this.matchesService.create(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '매치 상세 조회' })
  @ApiOkResponse({ description: '매치 상세 반환' })
  @ApiNotFoundResponse({ description: '매치 없음' })
  async findOne(@Param('id') id: string) {
    return this.matchesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '매치 수정 및 상태 변경' })
  @ApiOkResponse({ description: '매치 수정 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '호스트 전용' })
  @ApiNotFoundResponse({ description: '매치 없음' })
  async update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateMatchDto,
  ) {
    return this.matchesService.update(id, userId, dto);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '매치 취소 (host 전용)' })
  @ApiOkResponse({ description: '매치 취소 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '호스트 전용' })
  async cancel(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CancelMatchDto,
  ) {
    return this.matchesService.cancelMatch(id, userId, dto);
  }

  @Post(':id/close')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '모집 마감 (host 전용, recruiting → confirmed)' })
  @ApiOkResponse({ description: '모집 마감 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '호스트 전용' })
  async close(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.matchesService.closeMatch(id, userId);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '매치 참가' })
  @ApiCreatedResponse({ description: '매치 참가 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiNotFoundResponse({ description: '매치 없음' })
  async join(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.matchesService.join(id, userId);
  }

  @Delete(':id/leave')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '매치 탈퇴' })
  @ApiOkResponse({ description: '매치 탈퇴 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '참가자 본인 전용' })
  async leave(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.matchesService.leave(id, userId);
  }

  @Post(':id/teams/preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '팀 자동 구성 미리보기 (dry-run, DB 변경 없음)' })
  @ApiOkResponse({ description: '팀 배정 preview — DB를 변경하지 않음', type: PreviewTeamsResponseDto })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '호스트 전용 (MATCH_NOT_HOST)' })
  @ApiNotFoundResponse({ description: '매치 없음 (MATCH_NOT_FOUND)' })
  @ApiConflictResponse({ description: '팀 배정 불가 상태 (MATCH_NOT_OPEN_FOR_TEAM_ASSIGNMENT)' })
  async previewTeams(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ComposeTeamsDto,
  ) {
    return this.matchesService.previewTeams(id, userId, dto);
  }

  @Post(':id/teams')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '팀 자동 구성 및 확정 (ELO snake-draft, $transaction 원자성)' })
  @ApiCreatedResponse({ description: '팀 구성 성공 — teams/metrics/seed 반환' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '호스트 전용 (MATCH_NOT_HOST)' })
  @ApiNotFoundResponse({ description: '매치 없음 (MATCH_NOT_FOUND)' })
  @ApiConflictResponse({ description: '팀 배정 불가 상태 (MATCH_NOT_OPEN_FOR_TEAM_ASSIGNMENT)' })
  async generateTeams(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ComposeTeamsDto,
  ) {
    return this.matchesService.generateTeams(id, userId, dto);
  }

  @Post(':id/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '매치 완료' })
  @ApiOkResponse({ description: '매치 완료 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '호스트 전용' })
  async complete(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.matchesService.complete(id, userId);
  }

  @Post(':id/arrive')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '도착 인증 (참가자 전용)' })
  @ApiCreatedResponse({ description: '도착 인증 성공' })
  @ApiUnauthorizedResponse({ description: 'JWT required' })
  @ApiForbiddenResponse({ description: '참가자 전용' })
  async arrive(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ArriveMatchDto,
  ) {
    return this.matchesService.arrive(id, userId, dto);
  }
}
