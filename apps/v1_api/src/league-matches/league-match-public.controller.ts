import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
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
