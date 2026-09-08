import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { GamesService } from './games.service';

/**
 * **라우트가 넷이다** — 파일 이름이 그중 하나(`lineup-access`)를 가리켜서, 그 하나의 웹
 * 소비가 사라지면 컨트롤러 전체가 쓰이지 않는 것처럼 읽힌다. 실제로 그렇게 오해한 적이
 * 있다. 넷의 소비처는 이렇다:
 *
 * ```
 * claimable-participants  화면이 쓴다 — "이 기록은 제 것입니다"(use-v1-api.ts)
 * my-fixtures             화면이 쓴다 — 대진표·일정 탭의 내 팀 경기 강조
 * lineup-access           웹 소비 없음 · scripts/seed_alpha_lineup_ops_tournaments.mjs 가 부른다
 * lineup-roster           웹 소비 없음 · scripts/verify-alpha-card-suspension.mjs 가 부른다
 * ```
 *
 * 뒤의 둘은 **화면이 `my-fixtures` 로 옮겨간 것이지 기능이 죽은 게 아니다**(경위:
 * `apps/v1_api/CHANGELOG.md` — 경기마다 `lineup-access` 를 따로 부르지 않으려고
 * `my-fixtures` 를 추가했다). 지금 유일한 소비자는 alpha 운영 스크립트이고, 시드의 라인업
 * 진입 검증과 카드 정지 검증이 이 라우트들의 200 응답에 의존한다 — **지우면 그 스크립트가
 * 멈춘다.**
 *
 * ⚠️ 웹 grep 으로 소비처를 셀 때 `apps/v1_web/.next/` 를 제외해야 한다(빌드 산출물이 결과를
 * 오염시킨다). 그리고 이 저장소의 네이티브 셸(`v1_android`·`v1_ios`)은 WebView 래퍼라
 * 대부분의 API 를 직접 부르지 않지만 **완전히 안 부르는 것은 아니다** — 직접 호출은
 * `notifications/push-devices` 두 라우트뿐이고(`apps/v1_android/.../PushRegistrationClient.java` ·
 * `apps/v1_ios/Teameet/Push/PushDeviceClient.swift`), 그쪽은 웹 grep 이 0이어도 이미 설치된
 * 앱이 조용히 깨진다. 재확인:
 *
 * ```
 * grep -rhoE '"/api/v1/[^"]*"' apps/v1_android/app/src/main apps/v1_ios/Teameet
 * ```
 *
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
   * "이 기록은 제 것입니다" 화면이 쓰는 미연결 참가자 목록 (Task 154 P0-5).
   * 인가는 신청 자격과 같은 스코프라, 볼 수만 있고 신청은 못 하는 사람이 생기지 않는다.
   */
  @Get('claimable-participants')
  claimableParticipants(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Param('fixtureId') fixtureId: string,
  ) {
    return this.gamesService.listClaimableParticipants(user, tournamentId, fixtureId);
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
    @Query('sideId') sideId?: string,
  ) {
    // sideId 없이 내려보내면 Prisma가 `id: undefined` 를 **필터 없음**으로 해석해
    // 그 경기의 아무 사이드나 집어 든다 — 요청하지 않은 팀의 명단을 조용히 돌려주는
    // 셈이라, 없는 값은 여기서 잘라낸다(Copilot 리뷰 지적).
    if (sideId === undefined || sideId.trim() === '') {
      throw new BadRequestException({
        code: 'GAME_SIDE_ID_REQUIRED',
        message: '어느 팀의 명단인지 지정해 주세요.',
      });
    }
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
