import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  CommitPromotionsDto,
  CreateLeagueSeriesDto,
  SeedSeasonDto,
  UpdateLeagueSeriesDto,
} from './dto/league-series.dto';
import { LeagueSeriesAdminService } from './league-series-admin.service';

const seriesIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({ code: 'LEAGUE_SERIES_ID_INVALID', message: '올바르지 않은 리그 체계 ID예요.' }),
});
const seasonNoPipe = new ParseIntPipe({
  exceptionFactory: () =>
    new BadRequestException({ code: 'LEAGUE_SEASON_NO_INVALID', message: '올바르지 않은 시즌 번호예요.' }),
});

@Controller('admin/league-series')
@UseGuards(V1AuthGuard)
export class LeagueSeriesAdminController {
  constructor(private readonly service: LeagueSeriesAdminService) {}

  @Get()
  list(@CurrentUser() user: V1AuthUser) {
    return this.service.list(user);
  }

  @Get(':seriesId')
  detail(@CurrentUser() user: V1AuthUser, @Param('seriesId', seriesIdPipe) seriesId: string) {
    return this.service.detail(user, seriesId);
  }

  @Post()
  create(@CurrentUser() user: V1AuthUser, @Body() dto: CreateLeagueSeriesDto) {
    return this.service.create(user, dto);
  }

  @Patch(':seriesId')
  update(
    @CurrentUser() user: V1AuthUser,
    @Param('seriesId', seriesIdPipe) seriesId: string,
    @Body() dto: UpdateLeagueSeriesDto,
  ) {
    return this.service.update(user, seriesId, dto);
  }

  /** 시즌 1 시딩 — 티어별 팀 배정은 어드민 수동이다. */
  @Post(':seriesId/seasons/seed')
  seedSeason(
    @CurrentUser() user: V1AuthUser,
    @Param('seriesId', seriesIdPipe) seriesId: string,
    @Body() dto: SeedSeasonDto,
  ) {
    return this.service.seedSeason(user, seriesId, dto);
  }

  /** 승강 후보 계산 (dry-run). DB 를 바꾸지 않는다. */
  @Post(':seriesId/seasons/:seasonNo/promotions/preview')
  previewPromotions(
    @CurrentUser() user: V1AuthUser,
    @Param('seriesId', seriesIdPipe) seriesId: string,
    @Param('seasonNo', seasonNoPipe) seasonNo: number,
  ) {
    return this.service.previewPromotions(user, seriesId, seasonNo);
  }

  /** 최종 승인 — 이때 비로소 다음 시즌 리그와 참가 팀이 생긴다. */
  @Post(':seriesId/seasons/:seasonNo/promotions/commit')
  commitPromotions(
    @CurrentUser() user: V1AuthUser,
    @Param('seriesId', seriesIdPipe) seriesId: string,
    @Param('seasonNo', seasonNoPipe) seasonNo: number,
    @Body() dto: CommitPromotionsDto,
  ) {
    return this.service.commitPromotions(user, seriesId, seasonNo, dto);
  }
}
