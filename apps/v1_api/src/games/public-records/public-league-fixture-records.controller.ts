import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../../auth/optional-v1-auth.guard';
import { PublicTournamentRecordsService } from './public-tournament-records.service';

/**
 * 리그 경기 공개 기록 — `GET /league-matches/:leagueId/fixtures/:teamMatchId/record`
 * (public, no auth required).
 *
 * `PublicTournamentRecordsController` 와 같은 이유로 league-matches 모듈에 접지 않고
 * 이 소유권 디렉터리에 sibling `@Controller('league-matches')` 로 둔다 — 프로젝션의
 * 실체는 대회가 아니라 게임(V1Game) 공개 기록이고, 그 규칙(visibility·동의 게이팅·
 * 이벤트 정렬)의 단일 소유자가 이 디렉터리다. 경로 접미사(`/record`)가 달라
 * `league-match-public.controller.ts` 와 충돌하지 않는다.
 */
@Controller('league-matches')
@UseGuards(OptionalV1AuthGuard)
export class PublicLeagueFixtureRecordsController {
  constructor(private readonly records: PublicTournamentRecordsService) {}

  @Get(':leagueId/fixtures/:teamMatchId/record')
  getFixtureRecord(@Param('leagueId') leagueId: string, @Param('teamMatchId') teamMatchId: string) {
    return this.records.getLeagueFixtureRecord(leagueId, teamMatchId);
  }
}
