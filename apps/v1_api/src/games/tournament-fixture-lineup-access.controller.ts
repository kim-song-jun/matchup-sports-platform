import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { GamesService } from './games.service';

/**
 * 참가팀이 자기 대회 경기의 gameId·자기 sideId를 알아내는 전용 진입점.
 * `/tournaments/:id/matches/:fixtureId`(공개 기록)는 visibilityPolicy에 걸려
 * 있어 팀이 사전에 라인업을 준비하는 용도로 쓸 수 없다 — 그 정책과 완전히
 * 분리된 인증 전용 경로. 실제 인가는 GamesService.resolveActor를 그대로
 * 재사용한다(resolveFixtureLineupAccess 참고).
 */
@Controller('tournaments/:tournamentId/fixtures/:fixtureId')
@UseGuards(V1AuthGuard)
export class TournamentFixtureLineupAccessController {
  constructor(private readonly gamesService: GamesService) {}

  @Get('lineup-access')
  lineupAccess(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Param('fixtureId') fixtureId: string,
  ) {
    return this.gamesService.resolveFixtureLineupAccess(user, tournamentId, fixtureId);
  }

  /**
   * 라인업 편집기가 쓰는 참가 등록 명단. `sideId`로 어느 팀 명단인지 지정한다 —
   * 스태프는 양 팀 중 하나를 골라 대신 짤 수 있어서 "내 팀"만으로는 정해지지 않는다.
   */
  @Get('lineup-roster')
  lineupRoster(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Param('fixtureId') fixtureId: string,
    @Query('sideId') sideId: string,
  ) {
    return this.gamesService.resolveFixtureLineupRoster(user, tournamentId, fixtureId, sideId);
  }
}

/**
 * 대회 일정 화면이 "내 팀 경기"를 표시하기 위한 진입점. 공개 일정 응답
 * (`/tournaments/:id/schedule`)은 인증이 없어 누가 보든 같은 내용이라, 로그인한 팀장에게
 * 자기 팀 경기를 알려주려면 이 인증 전용 경로가 따로 필요하다.
 */
@Controller('tournaments/:tournamentId')
@UseGuards(V1AuthGuard)
export class MyTournamentFixturesController {
  constructor(private readonly gamesService: GamesService) {}

  @Get('my-fixtures')
  myFixtures(@CurrentUser() user: V1AuthUser, @Param('tournamentId') tournamentId: string) {
    return this.gamesService.listMyTournamentFixtures(user, tournamentId);
  }
}
