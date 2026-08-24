import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  FileLeagueMatchDisputeDto,
  RejectLeagueMatchDisputeDto,
  ResolveLeagueMatchDisputeDto,
} from './dto/league-match-dispute.dto';
import { LeagueMatchDisputeService } from './league-match-dispute.service';

// league-match-forfeit.controller.ts/league-match-result-entry.controller.ts와 같은
// 예외 팩토리 컨벤션 -- ParseUUIDPipe 기본 예외는 code 없는 영어 메시지라
// AllExceptionsFilter가 INTERNAL_ERROR로 내보낸다.
const leagueIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({ code: 'LEAGUE_ID_INVALID', message: '올바르지 않은 리그 ID예요.' }),
});
const teamMatchIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({ code: 'TEAM_MATCH_ID_INVALID', message: '올바르지 않은 경기 ID예요.' }),
});
const disputeIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({ code: 'LEAGUE_RESULT_DISPUTE_ID_INVALID', message: '올바르지 않은 이의 ID예요.' }),
});

/**
 * D2 (E2): 팀(host/opponent owner/manager)이 확정된 결과에 이의를 제기하는
 * 공개(로그인) 경로. `league-match-public.controller.ts`와 같은 'league-matches'
 * prefix -- 다만 그 컨트롤러는 레인 소유가 달라 직접 편집하지 않고 새 파일로 둔다
 * (league-match-forfeit.controller.ts가 admin/league-matches에 대해 이미 쓰는 패턴).
 * 인가는 컨트롤러 가드(로그인만 확인)가 아니라 서비스 -> GamesService.resolveActor
 * 단일 지점에서 판정한다.
 */
@Controller('league-matches')
@UseGuards(V1AuthGuard)
export class LeagueMatchDisputeController {
  constructor(private readonly service: LeagueMatchDisputeService) {}

  @Post(':leagueId/fixtures/:teamMatchId/dispute')
  fileDispute(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', leagueIdPipe) leagueId: string,
    @Param('teamMatchId', teamMatchIdPipe) teamMatchId: string,
    @Body() dto: FileLeagueMatchDisputeDto,
  ) {
    return this.service.fileDispute(user, leagueId, teamMatchId, dto);
  }
}

/**
 * D2 (E4): 운영자의 이의 수락(정정/무효)·거부 + 목록. `admin/league-matches`가
 * 아니라 별도 prefix(`admin/league-match-disputes`)를 쓴다 -- `league-match-admin
 * .controller.ts`가 이미 `GET :leagueId`(단일 동적 세그먼트)를 그 prefix에 등록해
 * 뒀는데, Express 라우터는 등록 순서대로 매칭하고 Nest가 컨트롤러 간 정적/동적
 * 우선순위를 자동으로 재정렬해 주지 않는다 -- 다른 파일의 컨트롤러가 그 라우트보다
 * 먼저 등록되는지에 기대는 대신, 아예 겹치지 않는 prefix로 이 충돌 가능성 자체를
 * 없앤다(league-match-public.controller.ts의 ":leagueId 보다 위에 둔다" 주석이
 * 설명하는 것과 같은 함정을 원천 차단).
 */
@Controller('admin/league-match-disputes')
@UseGuards(V1AuthGuard)
export class LeagueMatchDisputeAdminController {
  constructor(private readonly service: LeagueMatchDisputeService) {}

  // `@UseGuards(V1AuthGuard)` 는 **로그인했다**만 증명한다 — 관리자인지는 보지 않는다.
  // 같은 컨트롤러의 resolve/reject 는 서비스 안에서 getMutationAdmin 으로 막고 있는데
  // 이 목록만 빠져 있었다(적대 리뷰 지적). 이의 본문·제기자 id·처리 메모가 실리므로
  // 로그인만 하면 남의 리그 분쟁을 전부 읽을 수 있었다. 형제 admin 목록 엔드포인트
  // (league-match-admin.service.ts list)와 같은 방식으로 서비스에서 막는다.
  @Get()
  list(
    @CurrentUser() user: V1AuthUser,
    @Query('status') status?: 'open' | 'accepted' | 'rejected',
  ) {
    return this.service.listDisputes(user, status);
  }

  @Post(':disputeId/resolve')
  resolve(
    @CurrentUser() user: V1AuthUser,
    @Param('disputeId', disputeIdPipe) disputeId: string,
    @Body() dto: ResolveLeagueMatchDisputeDto,
  ) {
    return this.service.resolveDispute(user, disputeId, dto);
  }

  @Post(':disputeId/reject')
  reject(
    @CurrentUser() user: V1AuthUser,
    @Param('disputeId', disputeIdPipe) disputeId: string,
    @Body() dto: RejectLeagueMatchDisputeDto,
  ) {
    return this.service.rejectDispute(user, disputeId, dto);
  }
}
