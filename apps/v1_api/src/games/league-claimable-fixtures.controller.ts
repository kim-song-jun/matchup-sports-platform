import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { LeagueClaimableFixturesService } from './league-claimable-fixtures.service';

/**
 * 리그 상세 화면의 "내 기록 연결" 배너 진입점 (F8, 2026-08-26).
 *
 * 대진 하나짜리 목록(`LeagueFixtureClaimAccessController`)은 이미 있었지만, 리그 상세에서
 * **어느 대진으로 가야 하는지**를 알려주는 경로가 없었다. 이 엔드포인트가 그 목록이다.
 * 인가·필터 근거는 `LeagueClaimableFixturesService` 헤더 참조 — 새 인가 규칙을 만들지
 * 않고 `participant_identity` 스코프(두 참가팀 활성 멤버)를 그대로 좁혀 쓴다.
 *
 * 신청·승인은 game 경로(`/games/:gameId/...`)가 소스 불문 처리하므로 여기엔 없다.
 */
@Controller('league-matches/:leagueId')
@UseGuards(V1AuthGuard)
export class LeagueClaimableFixturesController {
  constructor(private readonly leagueClaimableFixtures: LeagueClaimableFixturesService) {}

  @Get('claimable-fixtures')
  claimableFixtures(@CurrentUser() user: V1AuthUser, @Param('leagueId') leagueId: string) {
    return this.leagueClaimableFixtures.listClaimableFixtures(user, leagueId);
  }
}
