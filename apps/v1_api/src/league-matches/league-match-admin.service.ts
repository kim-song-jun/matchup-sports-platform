import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { AdminContextService, type V1ActiveAdmin } from '../common/admin-context.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { NotificationsService } from '../notifications/notifications.service';
import { resolveTeamMatchCompetitionConfig } from '../team-matches/resolve-team-match-competition-config';
import { cascadeCancelTeamMatchSchedulesInTx } from '../team-schedules/team-schedules.service';
import { scheduleLeagueResultEntryReminder } from '../jobs/league-reminders/league-result-entry-reminder.service';
import { LeagueCompletionProjectionService } from './league-completion-projection.service';
import { buildOddTeamCountWarning, checkLeagueTeamAddAllowed, checkLeagueTeamRemovalAllowed } from './league-lifecycle-rules';
import { tierLabel } from './league-series-admin.service';
import { resolveResultStage } from './league-result-stage';
import { FixtureScheduleTemplate, FixtureTimingOptions, generateRoundRobinFixtures, resolveFixtureStartAt, resolveFixtureTimeSlots, RoundRobinFixture } from './round-robin-schedule';
import {
  AddLeagueTeamDto,
  CancelLeagueFixtureDto,
  CreateLeagueMatchDto,
  GenerateLeagueFixturesDto,
  RegenerateLeagueFixturesDto,
  RevertLeagueCompletionDto,
  UpdateLeagueFixtureDto,
} from './dto/league-match.dto';

// 그룹 B 감사 결함 1: 팀 제외로 인한 대진 취소는 운영자 개별 사유가 아니라 시스템이
// 판단한 부수효과다 — cancelFixture(운영자 사유 필수)와 구분되는 고정 사유 문자열.
const TEAM_REMOVAL_CANCEL_REASON = '리그 참가팀에서 제외돼 자동으로 취소했어요.';

const DEFAULT_TIE_BREAK_ORDER = ['points', 'goalDifference', 'goalsFor', 'headToHead'] as const;
const DEFAULT_FIXTURE_PLACE_NAME = '장소 미정';

// 총 라운드(주차 수 × 팀당 하루 경기 수) 상한. timing 없던 시절의 사실상 상한(weeksCount
// Max 52)의 2배 — 대형 리그의 트랜잭션(팀 수 × 라운드 수만큼 팀매치·게임·참가자 행 생성,
// timeout 120초)이 감당 가능한 범위로 묶는다. 52주 × 2경기까지는 허용, 그 이상은 422.
const MAX_TOTAL_ROUNDS = 104;

@Injectable()
export class LeagueMatchAdminService {
  // game-result-official-projection.service.ts와 동일한 관례 — 이 프로젝터는 DI 상태가
  // 없고 tx만 받으므로 provider로 등록하지 않고 직접 인스턴스화한다.
  private readonly leagueCompletion = new LeagueCompletionProjectionService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly games: GamesService,
    private readonly notifications: NotificationsService,
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

  /**
   * seriesId: 체계 id 로 소속 리그만, 'independent' 로 무소속(단발) 리그만 필터한다.
   * 리그 허브(B안, 2026-08-25)의 체계 칩 필터가 쓰는 파라미터 — 없으면 전체.
   */
  async list(user: V1AuthUser, seriesId?: string) {
    await this.adminContext.getActiveAdmin(user.id);
    // DTO 검증이 /i 라 'INDEPENDENT'·대문자 uuid 도 통과한다 — 소문자로 정규화해야
    // 리터럴 비교와 (소문자로 저장되는) uuid 매칭이 어긋나지 않는다.
    const normalized = seriesId?.toLowerCase();
    const rows = await this.prisma.v1League.findMany({
      where:
        normalized === 'independent'
          ? { seriesId: null }
          : normalized
            ? { seriesId: normalized }
            : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { teams: true, teamMatches: true } },
        series: { select: { title: true } },
      },
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
        seriesId: row.seriesId,
        seriesTitle: row.series?.title ?? null,
        // 단발 리그는 tier 가 null — "1부" 뱃지가 잘못 붙지 않도록 라벨도 null 로 내린다.
        tierLabel: row.tier === null ? null : tierLabel(row.tier),
        seasonNo: row.seasonNo,
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
        // 결과 진행 단계(2026-08-24). 대진 표가 지금까지 팀매치 status(matched/cancelled)만
        // 보여줘서, 운영자는 "어느 경기가 아직 결과가 없는지 / 상대팀 승인을 기다리는지"를
        // 화면에서 알 방법이 없었다. 결과 단계는 팀매치가 아니라 경기(Game) 쪽에 있다:
        // 확정본은 currentOfficialRevisionId, 진행 중인 것은 최신 리비전의 state 다.
        // 최신 1건만 가져오면 되므로 take:1 로 N+1 없이 붙인다.
        game: {
          select: {
            id: true,
            currentOfficialRevisionId: true,
            resultRevisions: { select: { state: true }, orderBy: { revision: 'desc' }, take: 1 },
          },
        },
      },
    });
    // 확정 스코어는 public 쪽(league-match-public.service.ts detail)과 같은 패턴으로
    // 확정 리비전 id 를 모아 단일 IN 조회로 가져온다 — 대진 수만큼 반복 조회하지 않는다.
    const officialRevisionIds = fixtures
      .map((fixture) => fixture.game?.currentOfficialRevisionId ?? null)
      .filter((id): id is string => id !== null);
    const facts =
      officialRevisionIds.length === 0
        ? []
        : await this.prisma.v1GameOfficialFact.findMany({
            where: { revisionId: { in: officialRevisionIds } },
            select: { gameId: true, homeScore: true, awayScore: true },
          });
    const factByGameId = new Map(facts.map((fact) => [fact.gameId, fact]));
    // 대진을 아직 안 만든 리그에서만 필요하다(일괄 생성 폼의 "기본 장소" 추천용) —
    // 이미 대진이 있으면 관리자는 개별 행을 고치므로 이 쿼리를 건너뛴다.
    const recentVenues = fixtures.length === 0 ? await this.loadRecentVenues(teamIds) : [];
    return {
      leagueId: league.id,
      title: league.title,
      state: league.state,
      // 그룹 B 감사 결함 1: 참가팀 추가 화면이 "이 리그 종목과 같은 팀만" 검색을 좁히려면
      // 종목ID가 필요하다 — 지금까지는 대진 표에서 쓸 일이 없어 응답에 없었다.
      sportId: league.sportId,
      teamIds,
      recentVenues,
      fixtures: fixtures.map((fixture) => {
        const fact = fixture.game === null ? undefined : factByGameId.get(fixture.game.id);
        return {
          teamMatchId: fixture.id,
          title: fixture.title,
          homeTeamId: fixture.hostTeamId,
          awayTeamId: fixture.approvedApplicantTeamId,
          startAt: fixture.startAt,
          placeName: fixture.placeName,
          placeAddress: fixture.placeAddress,
          status: fixture.status,
          resultStage: resolveResultStage(fixture.game),
          homeScore: fact?.homeScore ?? null,
          awayScore: fact?.awayScore ?? null,
        };
      }),
    };
  }

  // generateFixtures/previewFixtures/regenerateFixtures 공용: timing DTO를 기본값 채운
  // 계산 옵션으로 정규화하고, 총 라운드 수(주차 수 × 팀당 하루 경기 수)를 확정한다.
  // 상한 검증은 형식이 아니라 도메인 규칙이므로 DTO가 아니라 여기서 소유한다.
  private resolveFixturePlan(dto: GenerateLeagueFixturesDto): { totalRounds: number; timing?: FixtureTimingOptions } {
    const timing: FixtureTimingOptions | undefined = dto.timing
      ? {
          gameDurationMinutes: dto.timing.gameDurationMinutes,
          breakMinutes: dto.timing.breakMinutes ?? 0,
          gamesPerTeamPerDay: dto.timing.gamesPerTeamPerDay ?? 1,
        }
      : undefined;
    const totalRounds = dto.weeksCount * (timing?.gamesPerTeamPerDay ?? 1);
    if (totalRounds > MAX_TOTAL_ROUNDS) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_FIXTURE_LIMIT_EXCEEDED',
        message: `주차 수 × 팀당 하루 경기 수가 너무 커요. 총 라운드가 ${MAX_TOTAL_ROUNDS}를 넘지 않게 줄여주세요.`,
      });
    }
    return { totalRounds, timing };
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
    const { totalRounds, timing } = this.resolveFixturePlan(dto);
    const schedule = generateRoundRobinFixtures(teamIds, totalRounds);

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
        timing,
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
            // 같은 이유로 timing도 기본값(휴식 0분·팀당 1경기)까지 채워 실제 계산에 쓰인 값을
            // 남긴다. 스프레드는 Prisma InputJsonValue가 명명된 interface를 못 받아서다.
            timing: timing ? { ...timing } : null,
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

    // 리그 감사 그룹 A / R2: 대진 배정 알림 — 트랜잭션 커밋 후, 대진(수십 건)이 아니라
    // 팀 단위로 한 번씩만 보낸다. 근거는 notifyFixturesScheduled의 doc comment 참고.
    if (createdIds.length > 0) this.notifyFixturesScheduled(leagueId, league.title, schedule);

    // 그룹 B 감사 결함 2: 홀수 팀이면 매주 한 팀이 조용히 bye였다 — teamIds는 이 라운드로빈
    // 계산에 실제로 쓰인 팀 수라 여기서 판정한다(league.teams.length와 항상 같다).
    return { leagueId, createdCount: createdIds.length, teamMatchIds: createdIds, warnings: buildOddTeamCountWarning(teamIds.length) };
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

  // 그룹 B 감사 결함 1: 개설 후 참가팀 추가. create()가 강제하는 "활성 + 리그 종목 일치"
  // 규칙을 checkLeagueTeamAddAllowed()로 재사용한다. 대진이 이미 있어도 막지 않는다 —
  // V1LeagueTeam은 V1TeamMatch와 FK로 엮여 있지 않아(schema.prisma) 추가 자체는 안전하고,
  // 새 팀은 다음 regenerateFixtures 호출 때 대진에 반영된다(그때까지는 로스터에만 존재).
  // hasExistingFixtures로 그 사실을 응답에 실어 화면이 "재생성이 필요하다"를 안내하게 한다.
  async addTeam(user: V1AuthUser, leagueId: string, dto: AddLeagueTeamDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const league = await this.loadLeague(leagueId);
    const alreadyInLeague = league.teams.some((entry) => entry.teamId === dto.teamId);
    const team = await this.prisma.v1Team.findFirst({
      where: { id: dto.teamId, status: 'active', deletedAt: null },
      select: { id: true, sportId: true },
    });
    const blocked = checkLeagueTeamAddAllowed({
      alreadyInLeague,
      teamActive: team !== null,
      teamSportId: team?.sportId ?? '',
      leagueSportId: league.sportId,
    });
    if (blocked === 'ALREADY_IN_LEAGUE') {
      throw new UnprocessableEntityException({ code: 'LEAGUE_TEAM_INVALID', message: '이미 참가 중인 팀이에요.' });
    }
    if (blocked === 'TEAM_INVALID') {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_TEAM_INVALID',
        message: '리그 종목과 일치하는 활성 팀만 등록할 수 있어요.',
      });
    }

    const existingFixtureCount = await this.prisma.v1TeamMatch.count({ where: { leagueId } });
    await this.prisma.$transaction(async (tx) => {
      await tx.v1LeagueTeam.create({ data: { leagueId, teamId: dto.teamId } });
      await this.adminContext.logAdminAction(
        admin,
        { action: 'league_match.add_team', targetType: 'league_match', targetId: leagueId, afterJson: { teamId: dto.teamId } },
        tx,
      );
    });

    return {
      leagueId,
      teamId: dto.teamId,
      teamCount: league.teams.length + 1,
      hasExistingFixtures: existingFixtureCount > 0,
    };
  }

  // 그룹 B 감사 결함 1: 개설 후 참가팀 제거. checkLeagueTeamRemovalAllowed()의 두 게이트
  // (카디널리티, 공식 결과 존재)를 통과해야만 실행된다 — 근거는 그 함수의 doc comment 참고.
  // 통과하면 이 팀이 낀 미확정 대진을 cascadeCancelFixtureInTx로 함께 취소한다: V1LeagueTeam
  // 삭제만 하고 대진을 그대로 두면 취소되지 않은 예정 경기가 로스터 밖 팀을 상대로 남아
  // 어드민 화면에 "참가 안 하는 팀과의 예정 경기"라는 유령 데이터가 생긴다.
  async removeTeam(user: V1AuthUser, leagueId: string, teamId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const league = await this.loadLeague(leagueId);
    if (!league.teams.some((entry) => entry.teamId === teamId)) {
      throw new NotFoundException({ code: 'LEAGUE_TEAM_NOT_FOUND', message: '이 리그에 참가 중인 팀이 아니에요.' });
    }
    const teamFixtures = await this.prisma.v1TeamMatch.findMany({
      where: { leagueId, OR: [{ hostTeamId: teamId }, { approvedApplicantTeamId: teamId }] },
      select: { id: true, status: true, game: { select: { currentOfficialRevisionId: true } } },
    });
    const hasOfficialResultForTeam = teamFixtures.some((fixture) => fixture.game?.currentOfficialRevisionId != null);
    const blocked = checkLeagueTeamRemovalAllowed({
      remainingTeamCount: league.teams.length - 1,
      hasOfficialResultForTeam,
    });
    if (blocked === 'TEAM_COUNT_BELOW_MINIMUM') {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_TEAM_INVALID',
        message: '리그는 서로 다른 팀 2개 이상이 필요해요.',
      });
    }
    if (blocked === 'HAS_OFFICIAL_RESULT') {
      throw new ConflictException({
        code: 'LEAGUE_TEAM_HAS_OFFICIAL_RESULTS',
        message: '이 팀은 이미 확정된 경기 결과가 있어 제외할 수 없어요.',
      });
    }

    const { cancelledFixtureCount, leagueCompleted } = await this.prisma.$transaction(async (tx) => {
      // 위의 "2팀 이상" 판정은 트랜잭션 밖 스냅샷이라 그대로 두면 TOCTOU 다 — 3팀 리그에서
      // 두 제거 요청이 동시에 들어오면 둘 다 "빼도 2팀 남는다"를 보고 통과해, 결과적으로
      // 1팀만 남는 리그가 만들어진다. 1팀 리그는 대진 생성이 영구히 거부돼 시작도 종료도
      // 못 하는 죽은 리그가 되고, 승강 확정도 같은 이유로 422 로 막힌다.
      // 이 파일의 다른 파괴적 경로(:197 대진 생성, :523 재생성)와 동일하게 리그 행을 잠가
      // 동시 요청을 직렬화하고, 잠근 뒤의 **커밋된** 로스터로 다시 판정한다.
      await tx.$queryRaw`SELECT id FROM "v1_leagues" WHERE id = ${leagueId} FOR UPDATE`;
      const remainingAfterRemoval = await tx.v1LeagueTeam.count({ where: { leagueId, teamId: { not: teamId } } });
      const stillPresent = await tx.v1LeagueTeam.count({ where: { leagueId, teamId } });
      if (stillPresent === 0) {
        // 먼저 들어온 동시 요청이 이미 뺐다 — 같은 결과를 두 번 만들지 않는다.
        throw new NotFoundException({ code: 'LEAGUE_TEAM_NOT_FOUND', message: '이 리그에 참가 중인 팀이 아니에요.' });
      }
      if (checkLeagueTeamRemovalAllowed({ remainingTeamCount: remainingAfterRemoval, hasOfficialResultForTeam }) === 'TEAM_COUNT_BELOW_MINIMUM') {
        throw new UnprocessableEntityException({
          code: 'LEAGUE_TEAM_INVALID',
          message: '리그는 서로 다른 팀 2개 이상이 필요해요.',
        });
      }

      let cancelled = 0;
      for (const fixture of teamFixtures) {
        if (fixture.status === 'cancelled') continue;
        await tx.v1TeamMatch.update({ where: { id: fixture.id }, data: { status: 'cancelled', cancelledAt: new Date() } });
        await this.cascadeCancelFixtureInTx(tx, fixture.id, TEAM_REMOVAL_CANCEL_REASON);
        cancelled += 1;
      }
      await tx.v1LeagueTeam.deleteMany({ where: { leagueId, teamId } });
      // cancelFixture의 D-3 보강과 동일한 이유 — 이 제거로 마지막 미확정 대진이 사라지면
      // 리그가 자동 완료 조건을 충족할 수 있다.
      const completed = await this.leagueCompletion.settle(tx, leagueId, 'remaining_fixture_cancelled');
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'league_match.remove_team',
          targetType: 'league_match',
          targetId: leagueId,
          afterJson: { teamId, cancelledFixtureCount: cancelled },
        },
        tx,
      );
      return { cancelledFixtureCount: cancelled, leagueCompleted: completed };
    });

    return { leagueId, teamId, cancelledFixtureCount, leagueCompleted };
  }

  // 그룹 B 감사 결함 3: 최초 대진 생성 미리보기. DB를 바꾸지 않는다 — generateFixtures와
  // 완전히 같은 전제 검증을 돌려서(팀 2개 이상·활성 경기 설정·비활성/삭제 팀 없음) 미리보기가
  // 통과했는데 실제 생성이 실패하는 불일치가 없게 한다. regenerateFixtures 미리보기로도
  // 그대로 재사용된다(같은 스케줄 계산·같은 DTO).
  async previewFixtures(user: V1AuthUser, leagueId: string, dto: GenerateLeagueFixturesDto) {
    await this.adminContext.getActiveAdmin(user.id);
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
    const activeTeamCount = await this.prisma.v1Team.count({ where: { id: { in: teamIds }, status: 'active', deletedAt: null } });
    if (activeTeamCount !== teamIds.length) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_TEAM_INVALID',
        message: '비활성화되었거나 삭제된 팀이 포함돼 있어요.',
      });
    }
    const { totalRounds, timing } = this.resolveFixturePlan(dto);
    const schedule = generateRoundRobinFixtures(teamIds, totalRounds);
    const slots = timing ? resolveFixtureTimeSlots(schedule, league.startsOn, timing, dto.schedule) : undefined;
    const trimmedPlaceName = dto.placeName?.trim();
    const placeName = trimmedPlaceName ? trimmedPlaceName : DEFAULT_FIXTURE_PLACE_NAME;

    return {
      leagueId,
      rounds: schedule.length === 0 ? 0 : new Set(schedule.map((fixture) => fixture.round)).size,
      // timing이 있으면 라운드 G개가 한 매치데이(주차)로 묶이므로 rounds(라운드 수)와
      // 달라진다 — 화면의 "N주" 요약은 이 값을 써야 한다. 없으면 rounds와 같다.
      matchdayCount:
        slots !== undefined
          ? (slots.length === 0 ? 0 : slots[slots.length - 1].matchday)
          : schedule.length === 0
            ? 0
            : new Set(schedule.map((fixture) => fixture.round)).size,
      fixtureCount: schedule.length,
      placeName,
      fixtures: schedule.map((fixture, index) => ({
        round: fixture.round,
        matchday: slots !== undefined ? slots[index].matchday : fixture.round,
        orderInDay: slots !== undefined ? slots[index].orderInDay : null,
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        startAt: slots !== undefined ? slots[index].startAt : resolveFixtureStartAt(league.startsOn, fixture.round, dto.schedule),
        endAt: slots !== undefined ? slots[index].endAt : null,
      })),
      warnings: buildOddTeamCountWarning(teamIds.length),
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
  // "일괄 취소 + 재생성"이다. 팀 로스터는 이 시점의 league.teams를 그대로 쓴다 — addTeam()/
  // removeTeam()(그룹 B 감사 결함 1)으로 로스터를 먼저 바꾼 뒤 이 메서드를 호출하면 새
  // 로스터가 반영된다. 즉 "시즌 중 팀 교체"의 실제 운영 흐름은 addTeam/removeTeam으로
  // 로스터를 고치고 → regenerateFixtures로 대진표를 새 로스터에 맞게 다시 만드는 두 단계다.
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
    const { totalRounds, timing } = this.resolveFixturePlan(dto);
    const schedule = generateRoundRobinFixtures(teamIds, totalRounds);

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
        timing,
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
          afterJson: { cancelledCount, teamMatchIds: ids, weeksCount: dto.weeksCount, placeName, timing: timing ? { ...timing } : null },
        },
        tx,
      );
      return { cancelledCount, ids };
    }, {
      timeout: 120_000,
      maxWait: 10_000,
    });

    // 리그 감사 그룹 A / R2: 재생성도 새 대진 배정이므로 동일하게 알린다(취소된 옛 대진에는
    // 알리지 않는다 — cancelFixture 경로가 이미 team_match_cancelled를 담당한다).
    if (result.ids.length > 0) this.notifyFixturesScheduled(leagueId, league.title, schedule);

    return {
      leagueId,
      cancelledCount: result.cancelledCount,
      createdCount: result.ids.length,
      teamMatchIds: result.ids,
      warnings: buildOddTeamCountWarning(teamIds.length),
    };
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
      // 사용자 확정: 시작 시각이 바뀌면 결과 미입력 리마인더도 새 시각을 따라간다 —
      // 새 세대(startAt)로 다시 스케줄할 뿐 옛 행은 건드리지 않는다(발화 시점에
      // expectedStartAt 불일치로 스스로 no-op — league-result-entry-reminder.service.ts 참고).
      if (dto.startsAt !== undefined) {
        await scheduleLeagueResultEntryReminder(tx, { teamMatchId, startAt: result.startAt });
      }
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

    const alreadyProcessed = await this.prisma.$transaction((tx) =>
      this.revertCompletionInTx(tx, admin, leagueId, dto.reason ?? null),
    );

    return { leagueId, state: 'active' as const, alreadyProcessed };
  }

  /**
   * `revertCompletion`의 tx-aware 핵심 로직(completed -> active 조건부 updateMany +
   * 감사로그) — 호출자가 이미 시작한 트랜잭션 안에서 다른 작업과 원자적으로 묶기
   * 위해 공개한다. D2(리그 결과 이의 수락, `league-match-dispute.service.ts`)가
   * "정정/무효 처리 후 completed 였던 리그를 active 로 되돌린다"는 요구사항을 위해
   * 새 함수를 만들지 않고 이 메서드를 그대로 재사용한다.
   *
   * `revertCompletion`(공개 엔드포인트)과 달리 `league.state`가 active/draft 인 경우를
   * 미리 구분해 던지지 않는다 — completed 가 아니면 updateMany 가 그냥 0행 매치로
   * no-op 하고 `true`(alreadyProcessed)를 돌려준다. 호출자가 "완료된 리그일 수도,
   * 아닐 수도 있는" 상황에서 실패 없이 안전하게 부를 수 있어야 하기 때문이다
   * (이의 수락 시점의 리그가 completed 인지는 그 흐름의 관심사가 아니라 부수 조건이다).
   */
  async revertCompletionInTx(
    tx: Prisma.TransactionClient,
    admin: V1ActiveAdmin,
    leagueId: string,
    reason: string | null,
  ): Promise<boolean> {
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
        reason,
        fromStatus: 'completed',
        toStatus: 'active',
      },
      tx,
    );
    return false;
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
      timing?: FixtureTimingOptions;
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
    // timing이 있으면 "한 구장 순차 진행" 슬롯(경기별 시각·endAt·매치데이 순번)을 대진 순서
    // 그대로 미리 계산한다 — preview(previewFixtures)와 같은 함수를 쓰므로 미리보기에서 본
    // 시각이 그대로 저장된다.
    const slots = input.timing
      ? resolveFixtureTimeSlots(input.schedule, input.leagueStartsOn, input.timing, input.scheduleTemplate)
      : undefined;
    const ids: string[] = [];
    for (const [index, { round, home, away }] of pairings.entries()) {
      const slot = slots?.[index];
      const startAt = slot !== undefined ? slot.startAt : resolveFixtureStartAt(input.leagueStartsOn, round, input.scheduleTemplate);
      const teamMatch = await tx.v1TeamMatch.create({
        data: {
          hostTeamId: home.id,
          createdByUserId: input.adminUserId,
          sportId: input.sportId,
          regionId: input.regionId,
          // 하루에 여러 경기가 서면 "N주차"만으로는 팀 화면에서 같은 제목이 반복되므로
          // 그날의 경기 순번까지 제목에 담는다. timing 미지정이면 기존 제목 그대로.
          title: slot !== undefined
            ? `${input.leagueTitle} ${slot.matchday}주차 ${slot.orderInDay}경기`
            : `${input.leagueTitle} ${round}주차`,
          placeName,
          startAt,
          endAt: slot !== undefined ? slot.endAt : undefined,
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
          // 자동 로스터에는 **사람(userId)을 붙이지 않는다.** 이 목록은 팀이 이 경기를
          // 위해 작성한 명단이 아니라 대진 생성 시점의 **팀 전체 활성 멤버 스냅샷**이다
          // (loadTeamsWithMembers 의 `status: 'active'` 전원). 여기에 userId 를 실으면
          // createFromSourceInTransaction 이 그 전원에게 신원 연결(ROSTER_ASSERTED)을
          // 만드는데, 만들어진 사실이 전부 거짓이 된다:
          //   · 선수 카드가 한 경기도 안 뛴 팀원에게 "기록 공개 동의를 켜면 골·도움·출전이
          //     열려요"라고 안내한다. 정작 켜도 출전이 0이라 아무것도 열리지 않는다 —
          //     2026-08-24 alpha 실측으로 잡은 '거짓 약속' 결함이다. **이 한 줄은 2026-08-26
          //     에 카드 쪽에서 한 겹 막혔다**: 판정 필드가 옛 `hasRecordLinks`("연결이 있는가")
          //     에서 `hasUnlockableRecords`("동의를 켜면 실제로 열릴 공식 결과가 있는가")로
          //     바뀌어(games/public-records/player-card-stats.ts), 연결만 있고 공식 결과가
          //     0건이면 카드는 이제 동의가 아니라 출전을 안내한다. 회귀는
          //     profile/player-card.spec.ts 의 "동의를 켜도 열릴 기록이 없는 사용자" 블록이
          //     못박는다. **그래도 여기서 userId 를 실어도 된다는 뜻은 아니다** — 아래 근거는
          //     카드 수정과 무관하게 그대로 살아 있다.
          //   · 상호평가 대상 로스터(reviews.service.ts 의 `userId: { not: null }` 조회)가
          //     라인업이 아니라 이 행을 그대로 읽어, 뛰지 않은 팀원 전원이 평가 대상으로 뜬다.
          //     이 조회는 손대지 않았으므로 **여전히 깨진다** — 카드가 고쳐졌으니 괜찮다고
          //     읽지 말 것. 아래 본인 확인 경로 문단도 마찬가지로 유효하다.
          // 개인 기록으로 이어지는 연결은 **팀이 실제로 작성한 라인업**에서만 생긴다
          // (team-matches/team-match-lineup.service.ts 의 saveLineup — 새 리비전의 참가자
          // 행마다 팀장 이름으로 연결을 만든다). 대회 쪽(tournament-bracket.service.ts)이
          // `userId: player.userId` 를 싣는 것과 모순되지 않는다: 그 명단은 팀이 대회에
          // 등록한 선수 명단(V1TournamentRegistrationPlayer)이라 이미 팀의 작성물이다.
          //
          // 연결이 없는 채로 두는 것이 오히려 본인 확인 경로를 연다 —
          // listLeagueClaimableParticipants 는 "연결 없는 참가자"만 돌려주므로, 미리 연결을
          // 만들어 두면 선수가 자기 기록을 신청(requestIdentityLink → 팀장 승인)할 길까지
          // 함께 막힌다.
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
      // 사용자 확정: 경기 시작 +24시간에도 결과 미입력이면 운영자 리마인더 1회.
      // league-result-entry-reminder.service.ts 참고 — updateFixture()가 시작 시각을
      // 바꾸면 새 세대로 다시 스케줄한다.
      await scheduleLeagueResultEntryReminder(tx, { teamMatchId: teamMatch.id, startAt });
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
          // userId 를 일부러 읽지 않는다 — 자동 로스터 참가자에 사람을 붙이면
          // 신원 연결이 전원에게 생긴다(createFixturesInTx 의 participants 주석 참조).
          select: { id: true, user: { select: { profile: { select: { nickname: true, displayName: true } } } } },
        },
      },
    });
    return new Map(teams.map((team) => [team.id, team]));
  }

  /**
   * 리그 감사 그룹 A / R2: 대진 생성 트랜잭션 커밋 후, 참가팀 각각의 owner/manager에게
   * "리그 대진이 배정됐어요" 알림을 **팀당 정확히 한 번씩만** 보낸다.
   *
   * 라운드로빈 한 번(`generateFixtures`/`regenerateFixtures`)이 만드는 대진은 팀 수 ×
   * 주차 수만큼(수십 건)이라, 대진 하나마다 알림을 쏘면 팀장 알림함이 같은 리그로 도배된다.
   * 대신 `schedule`(대진 자체 목록, DB 재조회 없이 이미 계산돼 있는 값)에서 팀별 참가
   * 횟수만 세어 요약 한 건으로 묶는다 — team-matches.service.ts의
   * `emitNotificationToTeamManagers`가 팀매치 승인/거절/취소마다 쓰는 "팀 단위로 묶어
   * owner/manager에게 emitToManyDeferred" 패턴을 그대로 재사용한 것이고, NotificationsService
   * 쪽의 프로덕션 관례(선호도 필터·realtime emit·web push는 emitToManyDeferred 내부가
   * 전담)도 새로 만들지 않고 그대로 탄다.
   *
   * 트랜잭션 밖(커밋 후)에서 호출해야 한다 — emitToManyDeferred 자체가 detached
   * fire-and-forget이라 트랜잭션 콜백 안에서 불러도 커밋 전에 실행이 끝난다는 보장이
   * 없고, 이 서비스의 다른 알림들(cancelFixture 없음, team-matches.service.ts의 기존
   * 호출부들)도 전부 트랜잭션이 resolve된 뒤에 부른다.
   */
  private notifyFixturesScheduled(leagueId: string, leagueTitle: string, schedule: RoundRobinFixture[]): void {
    const fixtureCountByTeamId = new Map<string, number>();
    for (const fixture of schedule) {
      fixtureCountByTeamId.set(fixture.homeTeamId, (fixtureCountByTeamId.get(fixture.homeTeamId) ?? 0) + 1);
      fixtureCountByTeamId.set(fixture.awayTeamId, (fixtureCountByTeamId.get(fixture.awayTeamId) ?? 0) + 1);
    }
    for (const [teamId, fixtureCount] of fixtureCountByTeamId) {
      this.notifications.emitToManyDeferred(
        async () =>
          (
            await this.prisma.v1TeamMembership.findMany({
              where: { teamId, status: 'active', role: { in: ['owner', 'manager'] } },
              select: { userId: true },
            })
          ).map((m) => m.userId),
        'league_fixture_scheduled',
        leagueId,
        `"${leagueTitle}" 리그 대진이 확정됐어요. 이번 시즌 ${fixtureCount}경기가 배정됐어요.`,
      );
    }
  }
}
