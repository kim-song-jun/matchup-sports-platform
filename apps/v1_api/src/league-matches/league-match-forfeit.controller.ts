import { BadRequestException, Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { RecordLeagueForfeitDto } from './dto/league-match-forfeit.dto';
import { LeagueMatchForfeitService } from './league-match-forfeit.service';

// league-match-admin.controller.ts와 같은 예외 팩토리 컨벤션 — ParseUUIDPipe 기본
// 예외는 code 없는 영어 메시지라 INTERNAL_ERROR로 새어 나간다.
const leagueIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({ code: 'LEAGUE_ID_INVALID', message: '올바르지 않은 리그 ID예요.' }),
});
const teamMatchIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({ code: 'TEAM_MATCH_ID_INVALID', message: '올바르지 않은 경기 ID예요.' }),
});

// R11(C-6): 몰수패·부전승 결과 입력 전용 컨트롤러. `league-match-admin.controller.ts`는
// 다른 레인(F) 소유라 직접 편집하지 않고 같은 'admin/league-matches' 경로 아래 새
// 서브 라우트를 별도 파일로 추가한다(NestJS는 같은 prefix를 쓰는 여러 컨트롤러
// 클래스를 허용한다 — 라우트 경로 자체가 겹치지 않으면 충돌하지 않는다).
@Controller('admin/league-matches')
@UseGuards(V1AuthGuard)
export class LeagueMatchForfeitController {
  constructor(private readonly service: LeagueMatchForfeitService) {}

  @Post(':leagueId/fixtures/:teamMatchId/forfeit')
  recordForfeit(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', leagueIdPipe) leagueId: string,
    @Param('teamMatchId', teamMatchIdPipe) teamMatchId: string,
    @Body() dto: RecordLeagueForfeitDto,
  ) {
    return this.service.recordForfeit(user, leagueId, teamMatchId, dto);
  }
}
