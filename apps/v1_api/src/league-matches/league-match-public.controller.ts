import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { ListLeagueMatchesQueryDto } from './dto/league-match.dto';
import { LeagueMatchPublicService } from './league-match-public.service';

// ParseUUIDPipe 기본 예외는 code 없는 영어 메시지라 AllExceptionsFilter 가 INTERNAL_ERROR 로
// 내보낸다 — 도메인 코드/해요체 계약(main.ts ValidationPipe 와 동일 컨벤션)으로 맞춘다.
const leagueIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({ code: 'LEAGUE_ID_INVALID', message: '올바르지 않은 리그 ID예요.' }),
});

@Controller('league-matches')
@UseGuards(OptionalV1AuthGuard)
export class LeagueMatchPublicController {
  constructor(private readonly service: LeagueMatchPublicService) {}

  // R5: 공개 리그 목록 -- :leagueId 세그먼트가 없어 아래 :leagueId 계열 라우트와
  // 겹치지 않는다(NestJS는 경로 세그먼트 수로 구분).
  @Get()
  list(@Query() query: ListLeagueMatchesQueryDto) {
    return this.service.list(query);
  }

  @Get(':leagueId')
  detail(@Param('leagueId', leagueIdPipe) leagueId: string) {
    return this.service.detail(leagueId);
  }

  @Get(':leagueId/standings')
  standings(@Param('leagueId', leagueIdPipe) leagueId: string) {
    return this.service.standings(leagueId);
  }

  @Get(':leagueId/player-records')
  playerRecords(@Param('leagueId', leagueIdPipe) leagueId: string) {
    return this.service.playerRecords(leagueId);
  }
}
