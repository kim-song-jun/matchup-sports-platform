import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { CreateTeamMatchSeriesDto, GenerateSeriesFixturesDto, UpdateSeriesFixtureDto } from './dto/team-match-series.dto';
import { TeamMatchSeriesAdminService } from './team-match-series-admin.service';

@Controller('admin/team-match-series')
@UseGuards(V1AuthGuard)
export class TeamMatchSeriesAdminController {
  constructor(private readonly service: TeamMatchSeriesAdminService) {}

  @Get()
  list(@CurrentUser() user: V1AuthUser) {
    return this.service.list(user);
  }

  @Get(':seriesId')
  detail(@CurrentUser() user: V1AuthUser, @Param('seriesId', new ParseUUIDPipe()) seriesId: string) {
    return this.service.detail(user, seriesId);
  }

  @Post()
  create(@CurrentUser() user: V1AuthUser, @Body() dto: CreateTeamMatchSeriesDto) {
    return this.service.create(user, dto);
  }

  @Post(':seriesId/fixtures')
  generateFixtures(
    @CurrentUser() user: V1AuthUser,
    @Param('seriesId', new ParseUUIDPipe()) seriesId: string,
    @Body() dto: GenerateSeriesFixturesDto,
  ) {
    return this.service.generateFixtures(user, seriesId, dto);
  }

  @Patch(':seriesId/fixtures/:teamMatchId')
  updateFixture(
    @CurrentUser() user: V1AuthUser,
    @Param('seriesId', new ParseUUIDPipe()) seriesId: string,
    @Param('teamMatchId', new ParseUUIDPipe()) teamMatchId: string,
    @Body() dto: UpdateSeriesFixtureDto,
  ) {
    return this.service.updateFixture(user, seriesId, teamMatchId, dto);
  }
}
