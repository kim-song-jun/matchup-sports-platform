import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiUnauthorizedResponse, ApiOkResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { TournamentQueryDto } from './dto/tournament-query.dto';
import { TournamentsService } from './tournaments.service';

@ApiTags('대회')
@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  /** Public: tournament listing is intentionally open. */
  @Get()
  @ApiOperation({ summary: '대회 목록' })
  @ApiOkResponse({ description: 'Paginated tournament list' })
  async findAll(@Query() query: TournamentQueryDto) {
    return this.tournamentsService.findAll(query);
  }

  /** Public: tournament detail is intentionally open. */
  @Get(':id')
  @ApiOperation({ summary: '대회 상세' })
  @ApiOkResponse({ description: 'Tournament detail' })
  @ApiNotFoundResponse({ description: 'Tournament not found' })
  async findById(@Param('id') id: string) {
    return this.tournamentsService.findById(id);
  }

  /**
   * Tournament creation is guarded by JwtAuthGuard only (not AdminGuard).
   * The service layer enforces the actual authorization:
   *  - team-affiliated: caller must be a team manager+ (assertRole)
   *  - venue-affiliated: caller must be the venue owner OR admin
   * AdminGuard is intentionally absent here — it would block team managers and venue owners.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '대회 생성 (팀 관리자 또는 구장 소유자/관리자)' })
  @ApiCreatedResponse({ description: 'Tournament created successfully' })
  @ApiUnauthorizedResponse({ description: 'JWT token missing or invalid' })
  @ApiForbiddenResponse({ description: 'Caller is not a team manager/venue owner/admin' })
  async create(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
    @Body() body: CreateTournamentDto,
  ) {
    return this.tournamentsService.create(userId, userRole, body);
  }
}
