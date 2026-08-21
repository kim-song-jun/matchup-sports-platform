import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { AdminContextService } from '../common/admin-context.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { resolveTeamMatchCompetitionConfig } from '../team-matches/resolve-team-match-competition-config';
import { cascadeCancelTeamMatchSchedulesInTx } from '../team-schedules/team-schedules.service';
import { LeagueCompletionProjectionService } from './league-completion-projection.service';
import { FixtureScheduleTemplate, generateRoundRobinFixtures, resolveFixtureStartAt, RoundRobinFixture } from './round-robin-schedule';
import {
  CancelLeagueFixtureDto,
  CreateLeagueMatchDto,
  GenerateLeagueFixturesDto,
  RegenerateLeagueFixturesDto,
  RevertLeagueCompletionDto,
  UpdateLeagueFixtureDto,
} from './dto/league-match.dto';

const DEFAULT_TIE_BREAK_ORDER = ['points', 'goalDifference', 'goalsFor', 'headToHead'] as const;
const DEFAULT_FIXTURE_PLACE_NAME = '장소 미정';

@Injectable()
export class LeagueMatchAdminService {
  // game-result-official-projection.service.ts와 동일한 관례 — 이 프로젝터는 DI 상태가
  // 없고 tx만 받으므로 provider로 등록하지 않고 직접 인스턴스화한다.
  private readonly leagueCompletion = new LeagueCompletionProjectionService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly games: GamesService,
  ) {}

  async create(user: V1AuthUser, dto: CreateLeagueMatchDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const startsOn = new Date(dto.startsOn);
    const endsOn = new Date(dto.endsOn);
    if (endsOn.getTime() < startsOn.getTime()) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_PERIOD_INVALID',
        message: '종료일은 시작일보다 빠를 수 없어요.',
      });
    }
    const uniqueTeamIds = [...new Set(dto.teamIds)];
    if (uniqueTeamIds.length < 2) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_TEAM_INVALID',
        message: '리그는 서로 다른 팀 2개 이상이 필요해요.',
      });
    }
    const teams = await this.prisma.v1Team.findMany({
      where: { id: { in: uniqueTeamIds }, status: 'active', deletedAt: null },
      select: { id: true, sportId: true },
    });
    if (teams.length !== uniqueTeamIds.length || teams.some((team) => team.sportId !== dto.sportId)) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_TEAM_INVALID',
        message: '리그 종목과 일치하는 활성 팀만 등록할 수 있어요.',
      });
    }
    // 팀매치 생성과 같은 조건(활성 + level 2 시·군·구)으로 regionId를 사전 검증한다 —
    // 검증 없이 진행하면 FK 위반(P2003)이 500으로 새어 나간다.
    const region = await this.prisma.v1Region.findFirst({
      where: { id: dto.regionId, isActive: true, level: 2 },
      select: { id: true },
    });
    if (region === null) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_REGION_INVALID',
        message: '활성화된 시·군·구 지역만 선택할 수 있어요.',
      });
    }

    const league = await this.prisma.$transaction(async (tx) => {
      const created = await tx.v1League.create({
        data: {
          title: dto.title,
          sportId: dto.sportId,
          regionId: dto.regionId,
          createdByAdminUserId: admin.id,
          startsOn,
          endsOn,
          tieBreakJson: { order: DEFAULT_TIE_BREAK_ORDER },
          teams: { createMany: { data: uniqueTeamIds.map((teamId) => ({ teamId })) } },
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'league_match.create',
          targetType: 'league_match',
          targetId: created.id,
          afterJson: { title: created.title, teamIds: uniqueTeamIds },
        },
        tx,
      );
      return created;
    });
    return { leagueId: league.id, title: league.title, state: league.state };
  }

  async list(user: V1AuthUser) {
    await this.adminContext.getActiveAdmin(user.id);
    const rows = await this.prisma.v1League.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { teams: true, teamMatches: true } } },
    });
    return {
      items: rows.map((row) => ({
        leagueId: row.id,
        title: row.title,
        state: row.state,
        teamCount: row._count.teams,
        fixtureCount: row._count.teamMatches,
        startsOn: row.startsOn,
        endsOn: row.endsOn,
      })),
    };
  }

  async detail(user: V1AuthUser, leagueId: string) {
    await this.adminContext.getActiveAdmin(user.id);
    const league = await this.loadLeague(leagueId);
    const teamIds = league.teams.map((entry) => entry.teamId);
    const fixtures = await this.prisma.v1TeamMatch.findMany({
      where: { leagueId },
      orderBy: { startAt: 'asc' },
      select: {
        id: true,
        title: true,
        hostTeamId: true,
        approvedApplicantTeamId: true,
        startAt: true,
        placeName: true,
        // placeAddress: 어드민 표의 주소 입력 컬럼이 기존 값을 보여주려면 조회 시점에도
        // 필요하다 — updateFixture()는 이미 이 필드를 쓰고 있었는데 조회 쪽만 빠져 있었다.
        placeAddress: true,
        status: true,
      },
    });
    // 대진을 아직 안 만든 리그에서만 필요하다(일괄 생성 폼의 "기본 장소" 추천용) —
    // 이미 대진이 있으면 관리자는 개별 행을 고치므로 이 쿼리를 건너뛴다.
    const recentVenues = fixtures.length === 0 ? await this.loadRecentVenues(teamIds) : [];
    return {
      leagueId: league.id,
      title: league.title,
      state: league.state,
      teamIds,
      recentVenues,
      fixtures: fixtures.map((fixture) => ({
        teamMatchId: fixture.id,
        title: fixture.title,
        homeTeamId: fixture.hostTeamId,
        awayTeamId: fixture.approvedApplicantTeamId,
        startAt: fixture.startAt,
        placeName: fixture.placeName,
        placeAddress: fixture.placeAddress,
        status: fixture.status,
      })),
    };
  }

  async generateFixtures(user: V1AuthUser, leagueId: string, dto: GenerateLeagueFixturesDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const league = await this.loadLeague(leagueId);
    if (league.teams.length < 2) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_TEAM_INVALID',
        message: '리그에 등록된 팀이 2개 미만이에요.',
      });
    }
    const config = await resolveTeamMatchCompetitionConfig(this.prisma, league.sportId);
    if (config === null) {
      throw new ConflictException({ code: 'COMPETITION_CONFIG_REQUIRED', message: '이 종목에 활성 경기 설정이 없어요.' });
    }
    const teamIds = league.teams.map((entry) => entry.teamId);
    const schedule = generateRoundRobinFixtures(teamIds, dto.weeksCount);

    const createdIds = await this.prisma.$transaction(async (tx) => {
      // 락은 신 테이블(v1_leagues)에 건다. 재명명 때 Prisma 델리게이트만 바꾸고 이 raw SQL
      // 문자열을 놓쳐 구 테이블을 잠그고 있었다 -- 문자열 안의 테이블명은 타입 시스템이 못 본다.
      // 구 테이블을 잠그면 두 겹으로 위험하다: ① 미러 행이 없는 리그에서는 SELECT ... FOR UPDATE
      // 가 0행이라 아무것도 잠그지 않아 동시성 보호가 조용히 사라지고, ② 수축 릴리스가 그 테이블을
      // 지우는 순간 relation does not exist 로 깨진다.
      await tx.$queryRaw`SELECT id FROM "v1_leagues" WHERE id = ${leagueId} FOR UPDATE`;
      const existingCount = await tx.v1TeamMatch.count({ where: { leagueId } });
      if (existingCount > 0) {
        throw new ConflictException({ code: 'LEAGUE_FIXTURES_EXIST', message: '이미 대진이 생성된 리그예요.' });
      }
      const teamsById = await this.loadTeamsWithMembers(tx, teamIds);
      const { ids, placeName } = await this.createFixturesInTx(tx, {
        leagueId: league.id,
        leagueTitle: league.title,
        leagueStartsOn: league.startsOn,
        sportId: league.sportId,
        regionId: league.regionId,
        adminUserId: admin.userId,
        competitionConfigId: config.id,
        teamsById,
        schedule,
        scheduleTemplate: dto.schedule,
        placeNameInput: dto.placeName,
      });
      if (ids.length > 0) {
        await tx.v1League.update({ where: { id: league.id }, data: { state: 'active' } });
      }
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'league_match.generate_fixtures',
          targetType: 'league_match',
          targetId: leagueId,
          afterJson: {
            teamMatchIds: ids,
            weeksCount: dto.weeksCount,
            schedule: dto.schedule ? { dayOfWeek: dto.schedule.dayOfWeek, time: dto.schedule.time } : null,
            // dto.placeName이 아니라 trim+기본값 폴백을 거쳐 실제로 저장된 placeName을 남긴다 —
            // 감사 로그가 요청 원문이 아니라 실제 결과와 일치해야 디버깅 시 혼선이 없다.
            placeName,
          },
        },
        tx,
      );
      return ids;
    }, {
      // 팀 수 × 주차 수만큼 팀매치·게임·참가자 행을 한 트랜잭션에서 만들어, 대형 리그는
      // Prisma 기본 timeout(5초)을 쉽게 넘긴다. 레포 선례(mock-tournament-seed 30초,
      // v1-game-operations-worker의 maxWait 명시)를 따라 넉넉히 잡는다.
      timeout: 120_000,
      maxWait: 10_000,
    });

    return { leagueId, createdCount: createdIds.length, teamMatchIds: createdIds };
  }

  // R13: 참가팀 조회 — 리그 상세(detail())의 teamIds(원시 id 배열)만으로는 운영자가 팀을
  // 식별할 수 없다. 재생성 전에 "지금 이 팀들로 다시 만든다"를 확인할 수 있도록 이름·상태·
  // 로고를 붙여 돌려준다. 등록 후 비활성화/소프트삭제된 팀도 (재생성 가드 판단에 필요하므로)
  // 숨기지 않고 status로 드러낸다.
  async listTeams(user: V1AuthUser, leagueId: string) {
    await this.adminContext.getActiveAdmin(user.id);
    const league = await this.loadLeague(leagueId);
    const teamIds = league.teams.map((entry) => entry.teamId);
    const teams = teamIds.length === 0
      ? []
      : await this.prisma.v1Team.findMany({
          where: { id: { in: teamIds } },
          select: { id: true, name: true, status: true, memberCount: true, profile: { select: { logoUrl: true } } },
        });
    const teamById = new Map(teams.map((team) => [team.id, team]));
    return {
      leagueId: league.id,
      teams: teamIds.map((teamId) => {
        const team = teamById.get(teamId);
        return {
          teamId,
          // 팀이 그 사이 소프트삭제됐으면 findMany 결과에 없다 — 운영자에게 원인을 숨기지 않는다.
          name: team?.name ?? '(삭제된 팀)',
          status: team?.status ?? null,
          memberCount: team?.memberCount ?? 0,
          logoUrl: team?.profile?.logoUrl ?? null,
        };
      }),
    };
  }

  // R12: 리그 대진 전용 취소. team-matches.service.ts의 cancel()이 호스트 자가취소 경로에서
  // 하는 동일한 후처리(상태 전이 + 신청 반려 + 일정 cascade + 감사 로그)를 어드민 액터로
  // 반복한다 — 그 경로는 leagueId 有 대진을 명시적으로 거부하므로(LEAGUE_FIXTURE_HOST_CANCEL_
  // FORBIDDEN) 재호출이 아니라 같은 후처리 함수(cascadeCancelTeamMatchSchedulesInTx)만 공유한다.
  // C-4/R8 배경: 공식 결과가 확정된 대진도 취소할 수 있어야 오심·오입력 정정이 가능하므로
  // status와 무관하게 허용한다 — league-match-public.service.ts의 standings()가 status==
  // 'cancelled'를 결과 존재 여부와 무관하게 전부 제외하도록 이미 뒤집혀 있다(Wave 1).
  async cancelFixture(user: V1AuthUser, leagueId: string, teamMatchId: string, dto: CancelLeagueFixtureDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const teamMatch = await this.prisma.v1TeamMatch.findFirst({ where: { id: teamMatchId, leagueId } });
    if (teamMatch === null) {
      throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '이 리그의 대진이 아니에요.' });
    }
    if (teamMatch.status === 'cancelled') {
      // Task 69/73의 accept/reject, revertCompletion과 동일한 alreadyProcessed 계약.
      return {
        teamMatchId: teamMatch.id,
        status: 'cancelled' as const,
        cancelledApplications: 0,
        leagueCompleted: false,
        alreadyProcessed: true,
      };
    }

    const { cancelledApplications, leagueCompleted } = await this.prisma.$transaction(async (tx) => {
      await tx.v1TeamMatch.update({
        where: { id: teamMatchId },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
      const rejected = await this.cascadeCancelFixtureInTx(tx, teamMatchId, dto.reason);
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'league_match.cancel_fixture',
          targetType: 'team_match',
          targetId: teamMatchId,
          reason: dto.reason,
          fromStatus: teamMatch.status,
          toStatus: 'cancelled',
        },
        tx,
      );
      // D-3 구멍 메우기: 취소는 "남은 대진"을 줄이는 조작이라, 이 취소로 인해 취소되지
      // 않은 대진이 전부 확정 상태가 됐을 수 있다. 결과 확정 경로와 정확히 같은 판정을
      // 같은 트랜잭션에서 다시 돌린다 -- 안 하면 마지막 미확정 대진을 취소로 끝낸 리그가
      // 완료 조건을 충족하면서도 영원히 active로 남는다(alpha 실측 재현).
      const completed = await this.leagueCompletion.settle(tx, leagueId, 'remaining_fixture_cancelled');
      return { cancelledApplications: rejected, leagueCompleted: completed };
    });

    return {
      teamMatchId: teamMatch.id,
      status: 'cancelled' as const,
      cancelledApplications,
      leagueCompleted,
      alreadyProcessed: false,
    };
  }

  // R13: 대진 재생성. generateFixtures()가 만든 팀매치는 생성 즉시 V1Game이 붙고
  // (V1Game.teamMatchId onDelete: Restrict) 이 저장소는 게임/결과 기록을 절대 하드
  // 삭제하지 않으므로, tournaments/league-fixture-generator.service.ts처럼 기존 행을
  // deleteMany로 지우고 다시 만드는 방식은 여기서 원천적으로 불가능하다(FK 위반).
  // 대신: 기존 대진을 전부 cancelFixture()와 동일한 후처리로 취소한 뒤, generateFixtures()와
  // 완전히 같은 생성 로직(createFixturesInTx)으로 새 팀매치를 만든다 — "재생성"은 곧
  // "일괄 취소 + 재생성"이다. 팀 로스터는 이 시점의 league.teams를 그대로 쓴다(사후
  // 추가·제거 자체는 이 태스크 범위 밖 — 문서 11번, 별도 후속).
  async regenerateFixtures(user: V1AuthUser, leagueId: string, dto: RegenerateLeagueFixturesDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const league = await this.loadLeague(leagueId);
    if (league.teams.length < 2) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_TEAM_INVALID',
        message: '리그에 등록된 팀이 2개 미만이에요.',
      });
    }
    const config = await resolveTeamMatchCompetitionConfig(this.prisma, league.sportId);
    if (config === null) {
      throw new ConflictException({ code: 'COMPETITION_CONFIG_REQUIRED', message: '이 종목에 활성 경기 설정이 없어요.' });
    }
    const teamIds = league.teams.map((entry) => entry.teamId);
    const schedule = generateRoundRobinFixtures(teamIds, dto.weeksCount);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "v1_leagues" WHERE id = ${leagueId} FOR UPDATE`;
      const existingFixtures = await tx.v1TeamMatch.findMany({
        where: { leagueId },
        select: { id: true, status: true, game: { select: { currentOfficialRevisionId: true } } },
      });
      // ①: 공식 결과가 한 번이라도 확정된 대진이 있으면(취소돼 순위표에서는 빠졌더라도,
      // 게임/결과 리비전 자체는 영구 보존되는 기록이므로) 전체 재생성을 거부한다. 부분
      // 재생성(확정 안 된 것만 골라 다시 만들기)은 라운드로빈 대진 번호·상대 배정이 통째로
      // 흔들려 이 태스크 범위에서 다루지 않는다.
      const hasOfficialResult = existingFixtures.some((fixture) => fixture.game?.currentOfficialRevisionId != null);
      if (hasOfficialResult) {
        throw new ConflictException({
          code: 'LEAGUE_FIXTURES_HAVE_OFFICIAL_RESULTS',
          message: '공식 결과가 확정된 대진이 있어 대진을 다시 만들 수 없어요.',
        });
      }

      let cancelledCount = 0;
      for (const fixture of existingFixtures) {
        if (fixture.status === 'cancelled') continue;
        await tx.v1TeamMatch.update({
          where: { id: fixture.id },
          data: { status: 'cancelled', cancelledAt: new Date() },
        });
        await this.cascadeCancelFixtureInTx(tx, fixture.id, dto.reason);
        cancelledCount += 1;
      }

      const teamsById = await this.loadTeamsWithMembers(tx, teamIds);
      const { ids, placeName } = await this.createFixturesInTx(tx, {
        leagueId: league.id,
        leagueTitle: league.title,
        leagueStartsOn: league.startsOn,
        sportId: league.sportId,
        regionId: league.regionId,
        adminUserId: admin.userId,
        competitionConfigId: config.id,
        teamsById,
        schedule,
        scheduleTemplate: dto.schedule,
        placeNameInput: dto.placeName,
      });
      if (ids.length > 0) {
        // completed였던 리그(전 대진 확정)라도 재생성으로 새 미확정 대진이 생겼으니
        // active로 되돌린다 — revertCompletion을 별도로 먼저 호출할 필요가 없다.
        await tx.v1League.update({ where: { id: league.id }, data: { state: 'active' } });
      }
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'league_match.regenerate_fixtures',
          targetType: 'league_match',
          targetId: leagueId,
          reason: dto.reason,
          afterJson: { cancelledCount, teamMatchIds: ids, weeksCount: dto.weeksCount, placeName },
        },
        tx,
      );
      return { cancelledCount, ids };
    }, {
      timeout: 120_000,
      maxWait: 10_000,
    });

    return { leagueId, cancelledCount: result.cancelledCount, createdCount: result.ids.length, teamMatchIds: result.ids };
  }

  async updateFixture(user: V1AuthUser, leagueId: string, teamMatchId: string, dto: UpdateLeagueFixtureDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const teamMatch = await this.prisma.v1TeamMatch.findFirst({ where: { id: teamMatchId, leagueId } });
    if (teamMatch === null) {
      throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '이 리그의 대진이 아니에요.' });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      // generateFixtures와 동일하게: 빈/공백 문자열로 지우는 요청은 "미지정"으로 되돌린다 —
      // 그대로 저장하면 loadRecentVenues distinct 집계에서 조용히 빠지는 값이 남는다.
      const trimmedPlaceName = dto.placeName === undefined ? undefined : dto.placeName.trim();
      const result = await tx.v1TeamMatch.update({
        where: { id: teamMatchId },
        data: {
          ...(dto.startsAt === undefined ? {} : { startAt: new Date(dto.startsAt) }),
          ...(trimmedPlaceName === undefined ? {} : { placeName: trimmedPlaceName ? trimmedPlaceName : DEFAULT_FIXTURE_PLACE_NAME }),
          ...(dto.placeAddress === undefined ? {} : { placeAddress: dto.placeAddress }),
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'league_match.update_fixture',
          targetType: 'team_match',
          targetId: teamMatchId,
          afterJson: { startAt: result.startAt.toISOString(), placeName: result.placeName },
        },
        tx,
      );
      return result;
    });
    return { teamMatchId: updated.id, startAt: updated.startAt, placeName: updated.placeName, placeAddress: updated.placeAddress };
  }

  // R6/D-3: 전 대진이 확정되면 리그는 자동으로 completed 전이한다(LeagueCompletionProjectionService).
  // 이 메서드는 그 결과를 정정해야 할 때(오심 정정 등)를 위한 운영자 역전이다.
  async revertCompletion(user: V1AuthUser, leagueId: string, dto: RevertLeagueCompletionDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const league = await this.prisma.v1League.findUnique({ where: { id: leagueId }, select: { id: true, state: true } });
    if (league === null) {
      throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
    }
    if (league.state === 'active') {
      // 이미 active면 멱등 처리 — Task 69/73의 accept/reject alreadyProcessed 계약과 동일.
      return { leagueId: league.id, state: 'active' as const, alreadyProcessed: true };
    }
    if (league.state !== 'completed') {
      // draft(대진조차 없는 리그)는 되돌릴 completed 상태 자체가 없다.
      throw new ConflictException({
        code: 'LEAGUE_NOT_COMPLETED',
        message: '완료된 리그만 진행중으로 되돌릴 수 있어요.',
      });
    }

    const alreadyProcessed = await this.prisma.$transaction(async (tx) => {
      // 동시 요청 대비 조건부 UPDATE — 이미 다른 요청이 되돌렸다면(또는 자동 전이 로직이
      // 마침 다시 completed로 돌려놨다면) 0행 매치로 조용히 no-op한다.
      const reverted = await tx.v1League.updateMany({
        where: { id: leagueId, state: 'completed' },
        data: { state: 'active' },
      });
      if (reverted.count === 0) return true;

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'league_match.revert_completion',
          targetType: 'league_match',
          targetId: leagueId,
          reason: dto.reason ?? null,
          fromStatus: 'completed',
          toStatus: 'active',
        },
        tx,
      );
      return false;
    });

    return { leagueId, state: 'active' as const, alreadyProcessed };
  }

  private async loadLeague(leagueId: string) {
    const league = await this.prisma.v1League.findUnique({
      where: { id: leagueId },
      // DB 반환 순서는 정렬을 보장하지 않는다(league-fixture-generator의 F1과 같은 문제).
      // 라운드로빈 커널의 홈 균형 tie-break가 입력 순서에 의존하므로 등록순(createdAt,
      // createMany 동시 등록 동률이면 teamId)으로 명시 정렬해 대진이 실행마다 흔들리지 않게 한다.
      include: {
        teams: {
          select: { teamId: true },
          orderBy: [{ createdAt: 'asc' }, { teamId: 'asc' }],
        },
      },
    });
    if (league === null) {
      throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
    }
    return league;
  }

  // 참가 팀들이 (이 리그든 다른 리그든, 일반 팀매치든) 과거에 실제로 썼던 장소를
  // 최신순으로 모아 distinct 5개까지 돌려준다 — 일괄 생성 폼의 "기본 장소" 추천 칩용.
  // v1_team_match는 리그 대진과 일반 팀매치가 같은 테이블이라 별도 이력 저장소가 필요 없다.
  private async loadRecentVenues(teamIds: string[]): Promise<string[]> {
    if (teamIds.length === 0) return [];
    const rows = await this.prisma.v1TeamMatch.findMany({
      where: {
        OR: [{ hostTeamId: { in: teamIds } }, { approvedApplicantTeamId: { in: teamIds } }],
        placeName: { notIn: ['', DEFAULT_FIXTURE_PLACE_NAME] },
      },
      orderBy: { startAt: 'desc' },
      select: { placeName: true },
      take: 30,
    });
    // 쓰기 경로는 이제 trim+폴백을 하지만, 그 이전에 만들어진 레거시 행에 앞뒤 공백이
    // 섞여 있을 수 있어 읽기 시점에도 한 번 더 trim한다(방어적 이중 처리).
    const distinct: string[] = [];
    for (const row of rows) {
      const trimmed = row.placeName?.trim();
      // DB 필터는 trim 전 원문 기준이라, '장소 미정 '처럼 trim하면 기본값과 같아지는
      // 레거시 값은 여기서 한 번 더 걸러야 한다.
      if (trimmed && trimmed !== DEFAULT_FIXTURE_PLACE_NAME && !distinct.includes(trimmed)) distinct.push(trimmed);
      if (distinct.length >= 5) break;
    }
    return distinct;
  }

  // generateFixtures()·regenerateFixtures() 공용 생성 루프. 팀매치 + Game + 자동승인
  // 신청서를 라운드로빈 페어링마다 만든다 — 두 호출부가 이 순서·필드를 어긋나지 않게 공유해야
  // "재생성한 대진"과 "처음 생성한 대진"이 동일한 계약(같은 status='matched', 같은 자동승인
  // 신청서, 같은 Game sides/participants 구성)을 갖는다.
  private async createFixturesInTx(
    tx: Prisma.TransactionClient,
    input: {
      leagueId: string;
      leagueTitle: string;
      leagueStartsOn: Date;
      sportId: string;
      regionId: string;
      adminUserId: string;
      competitionConfigId: string;
      teamsById: Map<
        string,
        {
          id: string;
          name: string;
          memberships: Array<{ id: string; user: { profile: { nickname: string | null; displayName: string | null } | null } }>;
        }
      >;
      schedule: RoundRobinFixture[];
      scheduleTemplate?: FixtureScheduleTemplate;
      placeNameInput?: string;
    },
  ): Promise<{ ids: string[]; placeName: string }> {
    // league.teams에는 남아 있어도 그 사이 비활성/소프트삭제된 팀은 teamsById 조회의 active
    // 필터에 걸려 여기 없다 — 그대로 진행하면 undefined 참조로 500이 나므로, 행을 만들기 전에
    // 도메인 오류로 거부한다(create()의 422 패턴과 동일).
    const pairings = input.schedule.map((fixture) => {
      const home = input.teamsById.get(fixture.homeTeamId);
      const away = input.teamsById.get(fixture.awayTeamId);
      if (home === undefined || away === undefined) {
        throw new UnprocessableEntityException({
          code: 'LEAGUE_TEAM_INVALID',
          message: '비활성화되었거나 삭제된 팀이 포함돼 있어요.',
        });
      }
      return { round: fixture.round, home, away };
    });
    // 빈 문자열/공백만 있는 placeName 도 "미지정"으로 취급한다 — DTO 는 @IsOptional 문자열이라
    // 통과하고, ?? 는 ''를 대체하지 않아 그대로면 recentVenues 집계에서 조용히 빠지는 값이 저장된다.
    const trimmedPlaceName = input.placeNameInput?.trim();
    const placeName = trimmedPlaceName ? trimmedPlaceName : DEFAULT_FIXTURE_PLACE_NAME;
    const ids: string[] = [];
    for (const { round, home, away } of pairings) {
      const startAt = resolveFixtureStartAt(input.leagueStartsOn, round, input.scheduleTemplate);
      const teamMatch = await tx.v1TeamMatch.create({
        data: {
          hostTeamId: home.id,
          createdByUserId: input.adminUserId,
          sportId: input.sportId,
          regionId: input.regionId,
          title: `${input.leagueTitle} ${round}주차`,
          placeName,
          startAt,
          status: 'matched',
          approvedApplicantTeamId: away.id,
          competitionConfigVersionId: input.competitionConfigId,
          leagueId: input.leagueId,
        },
      });
      await this.games.createFromSourceInTransaction(
        tx,
        {
          sourceType: V1GameSourceType.TEAM_MATCH,
          sourceId: teamMatch.id,
          competitionConfigVersionId: input.competitionConfigId,
          sides: [
            { sideKey: V1GameSideKey.HOME, teamId: home.id, displayNameSnapshot: home.name },
            { sideKey: V1GameSideKey.AWAY, teamId: away.id, displayNameSnapshot: away.name },
          ],
          participants: [
            ...home.memberships.map((m) => ({
              sourceParticipantId: m.id,
              sideKey: V1GameSideKey.HOME,
              displayNameSnapshot: m.user.profile?.nickname ?? m.user.profile?.displayName ?? '팀원',
            })),
            ...away.memberships.map((m) => ({
              sourceParticipantId: m.id,
              sideKey: V1GameSideKey.AWAY,
              displayNameSnapshot: m.user.profile?.nickname ?? m.user.profile?.displayName ?? '팀원',
            })),
          ],
        },
        {
          actor: { actorType: 'USER', actorUserId: input.adminUserId, role: 'platform_ops' },
          expectedVersion: 0,
          durableCommandId: `league-fixture-create:${teamMatch.id}`,
          payloadHash: canonicalGameCommandPayloadHash({ teamMatchId: teamMatch.id, leagueId: input.leagueId }),
        },
      );
      await tx.v1TeamMatchApplication.create({
        data: {
          teamMatchId: teamMatch.id,
          applicantTeamId: away.id,
          appliedByUserId: input.adminUserId,
          status: 'approved',
          reviewedByUserId: input.adminUserId,
          reviewedAt: new Date(),
          message: '리그 대진 자동 생성',
        },
      });
      ids.push(teamMatch.id);
    }
    return { ids, placeName };
  }

  // cancelFixture()·regenerateFixtures() 공용 취소 후처리. team-matches.service.ts의
  // cancel()이 호스트 자가취소에서 하는 것과 동일하게: 대기 중(requested) 신청을 반려하고
  // 연결된 SCHEDULED 팀일정을 cascade 취소한다(cascadeCancelTeamMatchSchedulesInTx, row는
  // 삭제하지 않는다). V1TeamMatch.status 자체의 갱신은 호출부 책임이다(단건 취소는 update
  // 하나, 재생성은 findMany로 이미 읽은 여러 행을 순회하며 update하므로 호출 지점이 다르다).
  private async cascadeCancelFixtureInTx(
    tx: Prisma.TransactionClient,
    teamMatchId: string,
    reason: string,
  ): Promise<number> {
    const rejected = await tx.v1TeamMatchApplication.updateMany({
      where: { teamMatchId, status: 'requested' },
      data: { status: 'rejected', reviewedAt: new Date() },
    });
    await cascadeCancelTeamMatchSchedulesInTx(tx, teamMatchId, reason);
    return rejected.count;
  }

  private async loadTeamsWithMembers(tx: Prisma.TransactionClient, teamIds: string[]) {
    const teams = await tx.v1Team.findMany({
      where: { id: { in: teamIds }, status: 'active', deletedAt: null },
      select: {
        id: true,
        name: true,
        memberships: {
          where: { status: 'active' },
          orderBy: { id: 'asc' },
          select: { id: true, user: { select: { profile: { select: { nickname: true, displayName: true } } } } },
        },
      },
    });
    return new Map(teams.map((team) => [team.id, team]));
  }
}
