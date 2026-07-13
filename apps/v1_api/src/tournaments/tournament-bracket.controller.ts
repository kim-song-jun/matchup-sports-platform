import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  CreateFixtureDto,
  CreateGroupDto,
  CreateGroupTeamDto,
  RecordResultDto,
} from './dto/admin-bracket.dto';
import { TournamentBracketService } from './tournament-bracket.service';

/**
 * 대진(조/픽스처/결과/순위) 어드민 컨트롤러.
 *
 * 모든 엔드포인트는 어드민 전용. 인증은 V1AuthGuard(JWT Bearer) + 서비스 계층의
 * AdminContextService.getMutationAdmin / getActiveAdmin 이중 게이트로 보호한다.
 */
@Controller()
@UseGuards(V1AuthGuard)
export class TournamentBracketController {
  constructor(private readonly bracketService: TournamentBracketService) {}

  /** POST /admin/tournaments/:tournamentId/groups — 조 생성 */
  @Post('admin/tournaments/:tournamentId/groups')
  createGroup(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.bracketService.createGroup(user, tournamentId, dto);
  }

  /**
   * POST /admin/tournaments/:tournamentId/group-teams — 조 팀 배정
   * registrationId는 confirmed 상태 팀만 허용, 같은 group 내 중복 배정 금지.
   */
  @Post('admin/tournaments/:tournamentId/group-teams')
  createGroupTeam(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: CreateGroupTeamDto,
  ) {
    return this.bracketService.createGroupTeam(user, tournamentId, dto);
  }

  /**
   * POST /admin/tournaments/:tournamentId/fixtures — 픽스처 생성
   * home/awayRegistrationId, parentFixtureId는 미배정 가능(nullable).
   * 4강 합산 자동 계산은 미지원 — parentFixtureId 연결만 수행한다.
   */
  @Post('admin/tournaments/:tournamentId/fixtures')
  createFixture(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: CreateFixtureDto,
  ) {
    return this.bracketService.createFixture(user, tournamentId, dto);
  }

  /**
   * POST /admin/fixtures/:fixtureId/result — 경기 결과 기록 (upsert)
   * fixture.status → completed. hasPenalty=true 시 양측 penalty 점수 필수.
   */
  @Post('admin/fixtures/:fixtureId/result')
  recordResult(
    @CurrentUser() user: V1AuthUser,
    @Param('fixtureId') fixtureId: string,
    @Body() dto: RecordResultDto,
  ) {
    return this.bracketService.recordResult(user, fixtureId, dto);
  }

  /**
   * POST /admin/tournaments/:tournamentId/standings/recalculate
   * phase='group' 그룹의 completed 픽스처를 집계해 V1TournamentStanding upsert.
   * 승부차기(hasPenalty) 경기는 정규 스코어 기준으로 집계(조별리그 무승부 처리).
   */
  @Post('admin/tournaments/:tournamentId/standings/recalculate')
  recalculateStandings(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.bracketService.recalculateStandings(user, tournamentId);
  }

  /**
   * GET /admin/tournaments/:tournamentId/bracket
   * 조/픽스처/순위 전체 조회 (어드민 운영 화면용).
   * groups[]+fixtures[]+standings[] 반환.
   */
  @Get('admin/tournaments/:tournamentId/bracket')
  getBracket(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.bracketService.getBracket(user, tournamentId);
  }
}
