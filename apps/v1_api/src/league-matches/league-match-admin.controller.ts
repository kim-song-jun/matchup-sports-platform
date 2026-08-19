import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { CreateLeagueMatchDto, GenerateLeagueFixturesDto, UpdateLeagueFixtureDto } from './dto/league-match.dto';
import { LeagueMatchAdminService } from './league-match-admin.service';

@Controller('admin/league-matches')
@UseGuards(V1AuthGuard)
export class LeagueMatchAdminController {
  constructor(private readonly service: LeagueMatchAdminService) {}

  @Get()
  list(@CurrentUser() user: V1AuthUser) {
    return this.service.list(user);
  }

  @Get(':leagueId')
  detail(@CurrentUser() user: V1AuthUser, @Param('leagueId', new ParseUUIDPipe()) leagueId: string) {
    return this.service.detail(user, leagueId);
  }

  @Post()
  create(@CurrentUser() user: V1AuthUser, @Body() dto: CreateLeagueMatchDto) {
    return this.service.create(user, dto);
  }

  @Post(':leagueId/fixtures')
  generateFixtures(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', new ParseUUIDPipe()) leagueId: string,
    @Body() dto: GenerateLeagueFixturesDto,
  ) {
    return this.service.generateFixtures(user, leagueId, dto);
  }

  @Patch(':leagueId/fixtures/:teamMatchId')
  updateFixture(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', new ParseUUIDPipe()) leagueId: string,
    @Param('teamMatchId', new ParseUUIDPipe()) teamMatchId: string,
    @Body() dto: UpdateLeagueFixtureDto,
  ) {
    return this.service.updateFixture(user, leagueId, teamMatchId, dto);
  }
}
