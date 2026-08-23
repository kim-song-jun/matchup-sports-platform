import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  AddLeagueTeamDto,
  CancelLeagueFixtureDto,
  CreateLeagueMatchDto,
  GenerateLeagueFixturesDto,
  RegenerateLeagueFixturesDto,
  RevertLeagueCompletionDto,
  UpdateLeagueFixtureDto,
} from './dto/league-match.dto';
import { LeagueMatchAdminService } from './league-match-admin.service';

// ParseUUIDPipe 기본 예외는 code 없는 영어 메시지라 AllExceptionsFilter 가 INTERNAL_ERROR 로
// 내보낸다 — 도메인 코드/해요체 계약(main.ts ValidationPipe 와 동일 컨벤션)으로 맞춘다.
const leagueIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({ code: 'LEAGUE_ID_INVALID', message: '올바르지 않은 리그 ID예요.' }),
});
const teamMatchIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({ code: 'TEAM_MATCH_ID_INVALID', message: '올바르지 않은 경기 ID예요.' }),
});
const teamIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({ code: 'LEAGUE_TEAM_ID_INVALID', message: '올바르지 않은 팀 ID예요.' }),
});

@Controller('admin/league-matches')
@UseGuards(V1AuthGuard)
export class LeagueMatchAdminController {
  constructor(private readonly service: LeagueMatchAdminService) {}

  @Get()
  list(@CurrentUser() user: V1AuthUser) {
    return this.service.list(user);
  }

  @Get(':leagueId')
  detail(@CurrentUser() user: V1AuthUser, @Param('leagueId', leagueIdPipe) leagueId: string) {
    return this.service.detail(user, leagueId);
  }

  @Post()
  create(@CurrentUser() user: V1AuthUser, @Body() dto: CreateLeagueMatchDto) {
    return this.service.create(user, dto);
  }

  // R13: 참가팀 조회. 재생성 확인 모달에서 "지금 이 팀들로 다시 만든다"를 보여주는 용도.
  @Get(':leagueId/teams')
  listTeams(@CurrentUser() user: V1AuthUser, @Param('leagueId', leagueIdPipe) leagueId: string) {
    return this.service.listTeams(user, leagueId);
  }

  // 그룹 B 감사 결함 1: 개설 후 참가팀 추가. 로스터 변경 자체는 언제나 허용하고(대진에
  // 즉시 반영되지는 않는다 — 서비스 응답의 hasExistingFixtures 참고), create()와 동일한
  // "활성 + 리그 종목과 일치" 규칙을 재사용한다.
  @Post(':leagueId/teams')
  addTeam(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', leagueIdPipe) leagueId: string,
    @Body() dto: AddLeagueTeamDto,
  ) {
    return this.service.addTeam(user, leagueId, dto);
  }

  // 그룹 B 감사 결함 1: 개설 후 참가팀 제거. 이 팀이 낀 대진에 공식 결과가 확정돼 있으면
  // 서비스가 409로 거부한다(league-lifecycle-rules.checkLeagueTeamRemovalAllowed 참고 —
  // standings 계산이 로스터 기준으로 팀을 필터링해 데이터 손상으로 이어지기 때문).
  // 허용되면 이 팀이 낀 미확정 대진을 cancelFixture와 동일한 후처리로 함께 취소한다.
  @Delete(':leagueId/teams/:teamId')
  removeTeam(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', leagueIdPipe) leagueId: string,
    @Param('teamId', teamIdPipe) teamId: string,
  ) {
    return this.service.removeTeam(user, leagueId, teamId);
  }

  // 그룹 B 감사 결함 3: 최초 대진 생성 전 미리보기. DB를 바꾸지 않는다 — 팀 자동구성
  // preview(matches/:id/teams/preview)와 같은 dry-run 패턴. generateFixtures와 완전히
  // 같은 전제 검증(팀 2개 이상·활성 경기 설정·비활성/삭제 팀 없음)을 그대로 돌려서
  // "미리보기는 통과했는데 실제 생성은 실패"가 나지 않게 한다.
  @Post(':leagueId/fixtures/preview')
  previewFixtures(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', leagueIdPipe) leagueId: string,
    @Body() dto: GenerateLeagueFixturesDto,
  ) {
    return this.service.previewFixtures(user, leagueId, dto);
  }

  @Post(':leagueId/fixtures')
  generateFixtures(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', leagueIdPipe) leagueId: string,
    @Body() dto: GenerateLeagueFixturesDto,
  ) {
    return this.service.generateFixtures(user, leagueId, dto);
  }

  // R13: 대진 재생성 — 기존 대진 전부를 취소하고 같은 팀 로스터로 새 라운드로빈 대진을 만든다.
  // 파괴적 조작이라 사유가 필수이고(RegenerateLeagueFixturesDto), 공식 결과가 확정된 대진이
  // 하나라도 있으면 서비스가 409 LEAGUE_FIXTURES_HAVE_OFFICIAL_RESULTS로 거부한다.
  // 정적 세그먼트('regenerate')를 :leagueId/fixtures 뒤에 붙이는 라우트라
  // POST :leagueId/fixtures(대진 생성)와 경로 세그먼트 수가 달라 충돌하지 않는다.
  @Post(':leagueId/fixtures/regenerate')
  regenerateFixtures(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', leagueIdPipe) leagueId: string,
    @Body() dto: RegenerateLeagueFixturesDto,
  ) {
    return this.service.regenerateFixtures(user, leagueId, dto);
  }

  @Patch(':leagueId/fixtures/:teamMatchId')
  updateFixture(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', leagueIdPipe) leagueId: string,
    @Param('teamMatchId', teamMatchIdPipe) teamMatchId: string,
    @Body() dto: UpdateLeagueFixtureDto,
  ) {
    return this.service.updateFixture(user, leagueId, teamMatchId, dto);
  }

  // R12: 리그 대진 전용 취소. idempotent — 이미 cancelled면 alreadyProcessed: true.
  // POST :id/cancel 컨벤션(matches/mercenary/marketplace orders 전역 패턴)을 그대로 따른다.
  @Post(':leagueId/fixtures/:teamMatchId/cancel')
  @HttpCode(200)
  cancelFixture(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', leagueIdPipe) leagueId: string,
    @Param('teamMatchId', teamMatchIdPipe) teamMatchId: string,
    @Body() dto: CancelLeagueFixtureDto,
  ) {
    return this.service.cancelFixture(user, leagueId, teamMatchId, dto);
  }

  // R6: 전 대진 확정 시 자동으로 completed 전이한 리그를, 결과 정정 등을 위해
  // 운영자가 다시 active로 되돌리는 액션. idempotent — 이미 active면 alreadyProcessed: true.
  //
  // POST 다 — 바로 위 cancelFixture 주석이 밝히듯 이 저장소의 멱등 액션 컨벤션은
  // `POST :id/<action>` 이다(matches/mercenary/marketplace orders 전역 패턴). 이 라우트만
  // PATCH 였던 탓에 재감사 중 POST 로 호출했다가 404 INTERNAL_ERROR 를 받았다 — 한
  // 컨트롤러 안에서 같은 성격의 액션이 서로 다른 메서드를 쓰면 호출부가 매번 파일을
  // 열어봐야 한다. @HttpCode(200) 도 cancelFixture 와 맞춘다(생성이 아니라 상태 전이).
  @Post(':leagueId/revert-completion')
  @HttpCode(200)
  revertCompletion(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', leagueIdPipe) leagueId: string,
    @Body() dto: RevertLeagueCompletionDto,
  ) {
    return this.service.revertCompletion(user, leagueId, dto);
  }
}
