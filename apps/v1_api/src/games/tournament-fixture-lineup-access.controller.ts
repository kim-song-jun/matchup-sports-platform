import { Controller, Get, Param, UseGuards } from '@nestjs/common';
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
}
