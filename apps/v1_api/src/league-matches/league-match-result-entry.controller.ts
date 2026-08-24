import { BadRequestException, Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { RecordLeagueResultDto } from './dto/league-match-result-entry.dto';
import { LeagueMatchResultEntryService } from './league-match-result-entry.service';

// league-match-forfeit.controller.ts와 같은 예외 팩토리 컨벤션 — ParseUUIDPipe 기본
// 예외는 code 없는 영어 메시지라 INTERNAL_ERROR로 새어 나간다.
const leagueIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({ code: 'LEAGUE_ID_INVALID', message: '올바르지 않은 리그 ID예요.' }),
});
const teamMatchIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({ code: 'TEAM_MATCH_ID_INVALID', message: '올바르지 않은 경기 ID예요.' }),
});

// D1-a: 운영자가 리그 결과를 직접 입력·정정하는 전용 컨트롤러.
// league-match-forfeit.controller.ts 와 같은 이유(레인 F 소유의
// league-match-admin.controller.ts를 직접 편집하지 않기 위해)로 같은
// 'admin/league-matches' prefix 아래 별도 파일로 추가한다. 인가는 여기서 끝나지
// 않는다 -- 컨트롤러는 V1AuthGuard(로그인만 확인)만 걸려 있고, 실제 권한 판정은
// LeagueMatchResultEntryService -> AdminContextService.getMutationAdmin() 이
// 서비스 계층에서 수행한다.
@Controller('admin/league-matches')
@UseGuards(V1AuthGuard)
export class LeagueMatchResultEntryController {
  constructor(private readonly service: LeagueMatchResultEntryService) {}

  @Post(':leagueId/fixtures/:teamMatchId/result')
  recordResult(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', leagueIdPipe) leagueId: string,
    @Param('teamMatchId', teamMatchIdPipe) teamMatchId: string,
    @Body() dto: RecordLeagueResultDto,
  ) {
    return this.service.recordResult(user, leagueId, teamMatchId, dto);
  }

  @Post(':leagueId/fixtures/:teamMatchId/result/correct')
  correctResult(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', leagueIdPipe) leagueId: string,
    @Param('teamMatchId', teamMatchIdPipe) teamMatchId: string,
    @Body() dto: RecordLeagueResultDto,
  ) {
    return this.service.correctResult(user, leagueId, teamMatchId, dto);
  }
}
