import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { CreateLeagueMatchDto, GenerateLeagueFixturesDto, UpdateLeagueFixtureDto } from './dto/league-match.dto';
import { LeagueMatchAdminService } from './league-match-admin.service';

// ParseUUIDPipe 기본 예외는 code 없는 영어 메시지라 AllExceptionsFilter 가 INTERNAL_ERROR 로
// 내보낸다 — 도메인 코드/해요체 계약(main.ts ValidationPipe 와 동일 컨벤션)으로 맞춘다.
const leagueIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({ code: 'LEAGUE_ID_INVALID', message: '올바르지 않은 리그 ID예요.' }),
});
const teamMatchIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({ code: 'TEAM_MATCH_ID_INVALID', message: '올바르지 않은 경기 ID예요.' }),
});

@Controller('admin/league-matches')
@UseGuards(V1AuthGuard)
export class LeagueMatchAdminController {
  constructor(private readonly service: LeagueMatchAdminService) {}

  @Get()
  list(@CurrentUser() user: V1AuthUser) {
    return this.service.list(user);
  }

  @Get(':leagueId')
  detail(@CurrentUser() user: V1AuthUser, @Param('leagueId', leagueIdPipe) leagueId: string) {
    return this.service.detail(user, leagueId);
  }

  @Post()
  create(@CurrentUser() user: V1AuthUser, @Body() dto: CreateLeagueMatchDto) {
    return this.service.create(user, dto);
  }

  @Post(':leagueId/fixtures')
  generateFixtures(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', leagueIdPipe) leagueId: string,
    @Body() dto: GenerateLeagueFixturesDto,
  ) {
    return this.service.generateFixtures(user, leagueId, dto);
  }

  @Patch(':leagueId/fixtures/:teamMatchId')
  updateFixture(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', leagueIdPipe) leagueId: string,
    @Param('teamMatchId', teamMatchIdPipe) teamMatchId: string,
    @Body() dto: UpdateLeagueFixtureDto,
  ) {
    return this.service.updateFixture(user, leagueId, teamMatchId, dto);
  }
}
