import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  PipeTransform,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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
// seasonNo 는 Postgres int4 컬럼(V1League.seasonNo)에 그대로 실려 나간다. ParseIntPipe 는
// 범위를 보지 않아서 3000000000 같은 값이 Prisma 까지 내려가 변환 예외 -> 500 이 됐다
// (alpha 실측). 컬럼이 담을 수 있는 범위를 파이프에서 먼저 막는다.
const SEASON_NO_MAX = 2_147_483_647;
const seasonNoPipe = [
  new ParseIntPipe({
    exceptionFactory: () =>
      new BadRequestException({ code: 'LEAGUE_SEASON_NO_INVALID', message: '올바르지 않은 시즌 번호예요.' }),
  }),
  new (class implements PipeTransform<number, number> {
    transform(value: number): number {
      if (!Number.isSafeInteger(value) || value < 1 || value > SEASON_NO_MAX) {
        throw new BadRequestException({
          code: 'LEAGUE_SEASON_NO_INVALID',
          message: '올바르지 않은 시즌 번호예요.',
        });
      }
      return value;
    }
  })(),
] as const;

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

  /**
   * 승강 후보 계산 (dry-run). DB 를 바꾸지 않는다.
   *
   * 읽기 전용이지만 이 저장소에서 손꼽히게 무거운 어드민 조회다 — 티어마다 리그 전체의
   * 팀매치·게임·공식결과를 훑어 순위표를 처음부터 계산한다(3티어면 3회). 권한도
   * getActiveAdmin(읽기 전용 support 어드민 포함)이라 쓰기 권한 없이도 무제한 호출할 수
   * 있었다. 같은 성격의 팀 자동구성 preview 에는 이미 레이트리밋이 걸려 있다.
   * V1ThrottlerGuard 는 NODE_ENV !== 'production' 이면 스킵하므로 테스트는 영향받지 않는다.
   */
  @Post(':seriesId/seasons/:seasonNo/promotions/preview')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  previewPromotions(
    @CurrentUser() user: V1AuthUser,
    @Param('seriesId', seriesIdPipe) seriesId: string,
    @Param('seasonNo', ...seasonNoPipe) seasonNo: number,
  ) {
    return this.service.previewPromotions(user, seriesId, seasonNo);
  }

  /** 최종 승인 — 이때 비로소 다음 시즌 리그와 참가 팀이 생긴다. */
  @Post(':seriesId/seasons/:seasonNo/promotions/commit')
  commitPromotions(
    @CurrentUser() user: V1AuthUser,
    @Param('seriesId', seriesIdPipe) seriesId: string,
    @Param('seasonNo', ...seasonNoPipe) seasonNo: number,
    @Body() dto: CommitPromotionsDto,
  ) {
    return this.service.commitPromotions(user, seriesId, seasonNo, dto);
  }
}
