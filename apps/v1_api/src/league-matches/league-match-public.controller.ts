import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { ListLeagueMatchesQueryDto } from './dto/league-match.dto';
import { LeagueMatchPublicService } from './league-match-public.service';

// ParseUUIDPipe 기본 예외는 code 없는 영어 메시지라 AllExceptionsFilter 가 INTERNAL_ERROR 로
// 내보낸다 — 도메인 코드/해요체 계약(main.ts ValidationPipe 와 동일 컨벤션)으로 맞춘다.
const leagueIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({ code: 'LEAGUE_ID_INVALID', message: '올바르지 않은 리그 ID예요.' }),
});

// 가드는 **메서드별**로 건다. 이 컨트롤러는 원래 클래스 레벨 OptionalV1AuthGuard 하나였는데,
// R4 로 로그인 전용 라우트(/me)가 하나 생기면서 그 위에 V1AuthGuard 를 얹으면 두 가드가
// 겹쳐 세션을 두 번 해석하게 된다. matches/team-schedules/terms 컨트롤러가 이미 쓰는
// "라우트마다 필요한 가드만" 형태로 맞춘다.
@Controller('league-matches')
export class LeagueMatchPublicController {
  constructor(private readonly service: LeagueMatchPublicService) {}

  // R5: 공개 리그 목록 -- :leagueId 세그먼트가 없어 아래 :leagueId 계열 라우트와
  // 겹치지 않는다(NestJS는 경로 세그먼트 수로 구분).
  @Get()
  @UseGuards(OptionalV1AuthGuard)
  list(@Query() query: ListLeagueMatchesQueryDto) {
    return this.service.list(query);
  }

  // R4: 내 리그. 정적 세그먼트라 :leagueId 와 겹치지 않는다 -- NestJS 는 선언 순서대로
  // 매칭하므로 반드시 :leagueId 보다 위에 둔다(matches.controller 의 'me/recent-venues'
  // 와 같은 배치). 이 라우트만 로그인이 필요하다.
  @Get('me')
  @UseGuards(V1AuthGuard)
  listMine(@CurrentUser() user: V1AuthUser) {
    return this.service.listMine(user.id);
  }

  @Get(':leagueId')
  @UseGuards(OptionalV1AuthGuard)
  detail(@Param('leagueId', leagueIdPipe) leagueId: string) {
    return this.service.detail(leagueId);
  }

  @Get(':leagueId/standings')
  @UseGuards(OptionalV1AuthGuard)
  standings(@Param('leagueId', leagueIdPipe) leagueId: string) {
    return this.service.standings(leagueId);
  }

  @Get(':leagueId/player-records')
  @UseGuards(OptionalV1AuthGuard)
  playerRecords(@Param('leagueId', leagueIdPipe) leagueId: string) {
    return this.service.playerRecords(leagueId);
  }
}
