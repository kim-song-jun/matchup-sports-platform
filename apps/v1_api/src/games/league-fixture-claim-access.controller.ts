import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { GamesService } from './games.service';

/**
 * "이 기록은 제 것입니다" 화면의 **리그 판** 진입점 (2026-08-25 대회 패리티 후속).
 * 대회 쪽 `TournamentFixtureLineupAccessController.claimableParticipants` 와 같은
 * 목록을 리그 대진(teamMatchId)에 대해 돌려준다 — 공개 기록 경로
 * (`/league-matches/:id/fixtures/:id/record`)와 달리 인증 전용이고, 인가는
 * `participant_identity` 스코프(두 참가팀 활성 멤버)를 그대로 태운다.
 * 신청·승인은 game 경로(`/games/:gameId/...`)가 소스 불문 처리하므로 여기엔 없다.
 */
@Controller('league-matches/:leagueId/fixtures/:teamMatchId')
@UseGuards(V1AuthGuard)
export class LeagueFixtureClaimAccessController {
  constructor(private readonly gamesService: GamesService) {}

  @Get('claimable-participants')
  claimableParticipants(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId') leagueId: string,
    @Param('teamMatchId') teamMatchId: string,
  ) {
    return this.gamesService.listLeagueClaimableParticipants(user, leagueId, teamMatchId);
  }
}
