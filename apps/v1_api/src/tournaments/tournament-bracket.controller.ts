import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  CreateFixtureDto,
  CreateGroupDto,
  CreateGroupTeamDto,
  RecordResultDto,
  UpdateFixtureDto,
  UpdateGroupDto,
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

  /** PATCH /admin/fixtures/:fixtureId — 경기 일정·장소·대진 수정 (결과 있으면 팀 변경 409) */
  @Patch('admin/fixtures/:fixtureId')
  updateFixture(
    @CurrentUser() user: V1AuthUser,
    @Param('fixtureId') fixtureId: string,
    @Body() dto: UpdateFixtureDto,
  ) {
    return this.bracketService.updateFixture(user, fixtureId, dto);
  }

  /** DELETE /admin/fixtures/:fixtureId — 경기 삭제 (결과 있으면 409) */
  @Delete('admin/fixtures/:fixtureId')
  deleteFixture(@CurrentUser() user: V1AuthUser, @Param('fixtureId') fixtureId: string) {
    return this.bracketService.deleteFixture(user, fixtureId);
  }

  /** DELETE /admin/fixtures/:fixtureId/result — 결과 삭제 (오입력 복구, status → scheduled) */
  @Delete('admin/fixtures/:fixtureId/result')
  deleteFixtureResult(@CurrentUser() user: V1AuthUser, @Param('fixtureId') fixtureId: string) {
    return this.bracketService.deleteFixtureResult(user, fixtureId);
  }

  /** PATCH /admin/groups/:groupId — 조 이름·진출 팀 수 수정 */
  @Patch('admin/groups/:groupId')
  updateGroup(
    @CurrentUser() user: V1AuthUser,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.bracketService.updateGroup(user, groupId, dto);
  }

  /** DELETE /admin/groups/:groupId — 조 삭제 (팀 배정·경기 있으면 409) */
  @Delete('admin/groups/:groupId')
  deleteGroup(@CurrentUser() user: V1AuthUser, @Param('groupId') groupId: string) {
    return this.bracketService.deleteGroup(user, groupId);
  }

  /** DELETE /admin/group-teams/:groupTeamId — 조 팀 배정 해제 (해당 순위 행 정리) */
  @Delete('admin/group-teams/:groupTeamId')
  removeGroupTeam(@CurrentUser() user: V1AuthUser, @Param('groupTeamId') groupTeamId: string) {
    return this.bracketService.removeGroupTeam(user, groupTeamId);
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
