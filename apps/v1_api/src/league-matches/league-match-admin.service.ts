import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminContextService, type V1ActiveAdmin } from '../common/admin-context.service';
import { GamesService } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { NotificationsService } from '../notifications/notifications.service';
import { resolveTeamMatchCompetitionConfig } from '../team-matches/resolve-team-match-competition-config';
import {
  cascadeCancelTeamMatchSchedulesInTx,
  syncTeamMatchScheduleInTx,
} from '../team-schedules/team-schedules.service';
import { scheduleLeagueResultEntryReminder } from '../jobs/league-reminders/league-result-entry-reminder.service';
import { LeagueCompletionProjectionService } from './league-completion-projection.service';
import {
  STATUS_BY_LEAGUE_STATE,
  leagueMirrorCreateData,
  toMirrorSource,
} from '../tournaments/league-competition-mirror';
import { buildOddTeamCountWarning, checkLeagueTeamRemovalAllowed } from './league-lifecycle-rules';
import {
  createLeagueRosterRegistration,
  findLeagueAdmissionBlocker,
  leagueAdmissionBlockerMessage,
} from './league-team-admission';
import { tierLabel } from './league-series-admin.service';
import { resolveResultStage } from './league-result-stage';
import { resolveIsForfeit } from './league-match-forfeit.service';
import { FixtureScheduleTemplate, FixtureTimingOptions, generateRoundRobinFixtures, resolveFixtureStartAt, resolveFixtureTimeSlots, RoundRobinFixture } from './round-robin-schedule';
import { createLeagueFixture, leagueFixtureTitle } from './league-fixture-creation';
import { resolveLeagueWeekNumbers } from './league-week-number';
import {
  AddLeagueTeamDto,
  CancelLeagueFixtureDto,
  CreateLeagueMatchDto,
  CreateManualLeagueFixtureDto,
  GenerateLeagueFixturesDto,
  RegenerateLeagueFixturesDto,
  OpenLeagueRegistrationDto,
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
        include: { sport: { select: { code: true } } },
      });
      // dual-write — 통합 축(V1Tournament)에 같은 리그를 비춘다. **같은 트랜잭션 안이다**:
      // 밖으로 빼면 리그만 생기고 거울이 없는 창이 열리고, 그 리그는 read-swap 뒤
      // **에러 없이 화면에서 사라진다**(운영자는 "방금 만든 리그가 안 보인다"고만 말할 수 있다).
      await tx.v1Tournament.create({ data: leagueMirrorCreateData(toMirrorSource(created)) });
      // 로스터와 짝이 되는 confirmed 등록 — **거울 create 뒤여야 한다**(등록의
      // tournamentId 가 거울 행을 가리킨다). 리그를 만들 때 함께 넣은 팀도 로스터에
      // 들어가므로 여기가 다섯 번째 경로다(addTeam·시드·승계·신청 확정과 같은 불변식).
      for (const teamId of uniqueTeamIds) {
        await createLeagueRosterRegistration(tx, { leagueId: created.id, teamId, entrySource: 'seeded' });
      }
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
            // 감사 L-E finding 4(2단계) — 운영자 정정 모달이 "현재 이 대진이 몰수로
            // 확정돼 있는지"를 알아야 몰수 의도를 표현하는 UI(기본값 승계)를 그릴 수
            // 있다. reason/outcomeReason은 여기서만 boolean 으로 환산하고(resolveIsForfeit),
            // 원문 reason은 응답에 절대 싣지 않는다(운영자가 쓴 자유 텍스트라도 다른
            // 대진의 몰수 사유가 이 화면에 노출되는 건 별개 문제).
            select: {
              gameId: true,
              homeScore: true,
              awayScore: true,
              resultRevision: { select: { reason: true, outcomeReason: true } },
            },
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
          isForfeit: fact === undefined ? false : resolveIsForfeit(fact.resultRevision),
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
        // dual-write — 거울의 status 도 같이 옮긴다. `updateMany` + `kind` 가드인 이유:
        //   · `upsert` 는 `where` 에 unique 필드만 받아 `kind` 를 못 건다 — 같은 id 의 **진짜
        //     대회**가 있으면 덮어쓴다. 그 위험을 지우려면 이 형태여야 한다.
        //   · 백필 `--apply` 전에는 거울이 아직 없어 **0행**이다. 그 구간에선 그게 정상이고,
        //     백필 이후에는 항상 1행이다(새 리그는 위 create dual-write 가 거울을 만든다).
        await tx.v1Tournament.updateMany({
          where: { id: league.id, kind: 'regular_league' },
          data: { status: STATUS_BY_LEAGUE_STATE.active },
        });
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
      // Prisma 기본 timeout(5초)을 쉽게 넘긴다.
      // **앞단 ALB idle_timeout(60초)보다 낮아야 한다.** 예전 값 120초로는 운영자가 60초에
      // 504 를 받아 "실패했다"고 믿는 동안 백엔드가 계속 돌아 **그대로 커밋**했다 —
      // 그 다음 클릭은 "이미 존재" 로 막히고 조가 잠긴다(대회 레인이 같은 이유로 이미
      // 45+5 로 내렸다: tournaments/league-fixture-generator.service.ts 의
      // TRANSACTION_TIMEOUT_MS 주석, docs/ops/alb-idle-timeout.md).
      // 45초 + maxWait 5초 = 최악 50초라 ALB 안에서 끝나고, 만료되면 열려 있던 쓰기는
      // 전부 롤백돼 운영자가 받는 실패가 실제 실패와 일치한다.
      timeout: 45_000,
      maxWait: 5_000,
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
    // 판정은 `findLeagueAdmissionBlocker` 하나를 지난다 — D7 의 참가 신청 확정 훅이 같은
    // 함수를 부르기 때문이다. 여기만 따로 검사하면 확정 경로가 이 불변식들을 우회한다.
    const blocker = await findLeagueAdmissionBlocker(this.prisma, { leagueId, teamId: dto.teamId });
    if (blocker !== null) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_TEAM_INVALID',
        message: leagueAdmissionBlockerMessage(blocker),
      });
    }

    const existingFixtureCount = await this.prisma.v1TeamMatch.count({ where: { leagueId } });
    await this.prisma.$transaction(async (tx) => {
      await tx.v1LeagueTeam.create({ data: { leagueId, teamId: dto.teamId } });
      // 로스터 행과 짝이 되는 confirmed 등록 — D7 이후 참가의 정본은 등록 쪽이다.
      // 안 만들면 백필이 세운 "로스터 행 ⟺ confirmed 등록" 불변식이 이 경로에서만 썩는다.
      await createLeagueRosterRegistration(tx, { leagueId, teamId: dto.teamId, entrySource: 'seeded' });
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

    const { cancelledFixtureCount, leagueCompleted, cancelledFixtures } = await this.prisma.$transaction(async (tx) => {
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
      // 감사 결함(index 84): 위의 "2팀 이상" 재검사와 똑같은 이유로, "공식 결과 존재" 게이트와
      // 취소 대상 대진 목록도 잠금 밖 스냅샷(teamFixtures/hasOfficialResultForTeam)을 그대로
      // 쓰면 TOCTOU다 — (a) 결과 확정 요청과 이 제거 요청이 동시에 들어오면 확정된 경기가
      // 게이트를 피해 취소되고, 그 경기가 순위표(cancelled 전부 제외)에서 사라져 상대팀이
      // 실제로 거둔 승리 기록까지 함께 지워진다. (b) 대진 대량 생성(같은 리그 행을 잠그고
      // 도는 트랜잭션, :197)이 이 요청보다 늦게 커밋되면, 잠금 밖에서 읽은 teamFixtures엔
      // 아직 없던 새 대진이 하나도 취소되지 않은 채 팀만 로스터에서 빠져 유령 대진이 남는다.
      // 잠금을 얻은 뒤 tx로 다시 읽어 두 값 다 커밋된 상태 기준으로 재검증한다.
      const freshTeamFixtures = await tx.v1TeamMatch.findMany({
        where: { leagueId, OR: [{ hostTeamId: teamId }, { approvedApplicantTeamId: teamId }] },
        select: {
          id: true,
          status: true,
          title: true,
          hostTeamId: true,
          approvedApplicantTeamId: true,
          game: { select: { currentOfficialRevisionId: true } },
        },
      });
      const freshHasOfficialResultForTeam = freshTeamFixtures.some(
        (fixture) => fixture.game?.currentOfficialRevisionId != null,
      );
      const reChecked = checkLeagueTeamRemovalAllowed({
        remainingTeamCount: remainingAfterRemoval,
        hasOfficialResultForTeam: freshHasOfficialResultForTeam,
      });
      if (reChecked === 'TEAM_COUNT_BELOW_MINIMUM') {
        throw new UnprocessableEntityException({
          code: 'LEAGUE_TEAM_INVALID',
          message: '리그는 서로 다른 팀 2개 이상이 필요해요.',
        });
      }
      if (reChecked === 'HAS_OFFICIAL_RESULT') {
        throw new ConflictException({
          code: 'LEAGUE_TEAM_HAS_OFFICIAL_RESULTS',
          message: '이 팀은 이미 확정된 경기 결과가 있어 제외할 수 없어요.',
        });
      }

      let cancelled = 0;
      // 그룹 B 감사 결함 4: 취소되는 대진마다 상대 팀(들)에게 알려야 하므로, 취소 후처리
      // (cascadeCancelFixtureInTx)와 별개로 알림 발송에 필요한 최소 필드를 tx 밖으로
      // 들고 나간다 — emitToManyDeferred는 커밋 후에 불러야 한다(notifyFixturesScheduled와
      // 동일한 관례, 이 파일 하단 주석 참고).
      const cancelledFixtures: Array<{ id: string; title: string; hostTeamId: string; approvedApplicantTeamId: string | null }> = [];
      for (const fixture of freshTeamFixtures) {
        if (fixture.status === 'cancelled') continue;
        await tx.v1TeamMatch.update({ where: { id: fixture.id }, data: { status: 'cancelled', cancelledAt: new Date() } });
        await this.cascadeCancelFixtureInTx(tx, fixture.id, TEAM_REMOVAL_CANCEL_REASON);
        cancelledFixtures.push({
          id: fixture.id,
          title: fixture.title,
          hostTeamId: fixture.hostTeamId,
          approvedApplicantTeamId: fixture.approvedApplicantTeamId,
        });
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
      return { cancelledFixtureCount: cancelled, leagueCompleted: completed, cancelledFixtures };
    });

    // 그룹 B 감사 결함 4: 제외된 팀 본인 + 상대로 배정돼 있던 팀(들) 모두에게 알린다 —
    // 이전에는 이 경로에 알림이 전혀 없어, 상대 팀은 자기 경기가 취소된 사실을 리그
    // 상세를 직접 열어보지 않는 한 알 수 없었다.
    this.notifyFixturesCancelled(leagueId, cancelledFixtures, TEAM_REMOVAL_CANCEL_REASON);

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
    // 그룹 B 감사 결함 2: 이 엔드포인트는 최초 생성 미리보기와 재생성 미리보기를 겸한다
    // (컨트롤러 주석: "미리보기가 통과했는데 실제 생성은 실패"가 없어야 한다는 불변식).
    // 그런데 regenerateFixtures가 던지는 LEAGUE_FIXTURES_HAVE_OFFICIAL_RESULTS 게이트가
    // 여기엔 없어서, 공식 결과가 확정된 대진이 있는 리그의 재생성 미리보기는 새 대진표를
    // "성공적으로" 보여준 뒤 실제 재생성 시점에야 409로 거부됐다 — 그 불변식이 이 경로에서
    // 깨져 있었다. 최초 생성(대진 0건)에서는 이 조건이 항상 거짓이라 기존 동작에 영향이 없다.
    const existingFixturesWithResult = await this.prisma.v1TeamMatch.findMany({
      where: { leagueId },
      select: { game: { select: { currentOfficialRevisionId: true } } },
    });
    if (existingFixturesWithResult.some((fixture) => fixture.game?.currentOfficialRevisionId != null)) {
      throw new ConflictException({
        code: 'LEAGUE_FIXTURES_HAVE_OFFICIAL_RESULTS',
        message: '공식 결과가 확정된 대진이 있어 대진을 다시 만들 수 없어요.',
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

    // 그룹 B 감사 결함 4: 단건 취소는 운영상 가장 자주 쓰이는 취소 경로인데도 이전에는
    // 상대 팀에게 알림이 전혀 없었다 — team-matches.service.ts의 자가취소(team_match_cancelled)는
    // leagueId가 있는 대진을 하드 거부해 절대 이 알림에 도달하지 못한다(그 경로의 599-604행).
    this.notifyFixturesCancelled(
      leagueId,
      [
        {
          id: teamMatch.id,
          title: teamMatch.title,
          hostTeamId: teamMatch.hostTeamId,
          approvedApplicantTeamId: teamMatch.approvedApplicantTeamId,
        },
      ],
      dto.reason,
    );

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
        select: {
          id: true,
          status: true,
          title: true,
          hostTeamId: true,
          approvedApplicantTeamId: true,
          game: { select: { currentOfficialRevisionId: true } },
        },
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
      // 그룹 B 감사 결함 4: 재생성으로 취소되는 옛 대진도 알림 대상이다 — 아래 notifyFixturesScheduled는
      // "새 대진이 배정됐다"만 알리지 "옛 대진이 취소됐다"는 알리지 않는다(별개 사실).
      const cancelledFixtures: Array<{ id: string; title: string; hostTeamId: string; approvedApplicantTeamId: string | null }> = [];
      for (const fixture of existingFixtures) {
        if (fixture.status === 'cancelled') continue;
        await tx.v1TeamMatch.update({
          where: { id: fixture.id },
          data: { status: 'cancelled', cancelledAt: new Date() },
        });
        await this.cascadeCancelFixtureInTx(tx, fixture.id, dto.reason);
        cancelledFixtures.push({
          id: fixture.id,
          title: fixture.title,
          hostTeamId: fixture.hostTeamId,
          approvedApplicantTeamId: fixture.approvedApplicantTeamId,
        });
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
        // dual-write — 거울의 status 도 같이 옮긴다. `updateMany` + `kind` 가드인 이유:
        //   · `upsert` 는 `where` 에 unique 필드만 받아 `kind` 를 못 건다 — 같은 id 의 **진짜
        //     대회**가 있으면 덮어쓴다. 그 위험을 지우려면 이 형태여야 한다.
        //   · 백필 `--apply` 전에는 거울이 아직 없어 **0행**이다. 그 구간에선 그게 정상이고,
        //     백필 이후에는 항상 1행이다(새 리그는 위 create dual-write 가 거울을 만든다).
        await tx.v1Tournament.updateMany({
          where: { id: league.id, kind: 'regular_league' },
          data: { status: STATUS_BY_LEAGUE_STATE.active },
        });
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
      return { cancelledCount, ids, cancelledFixtures };
    }, {
      // **앞단 ALB idle_timeout(60초)보다 낮아야 한다.** 예전 값 120초로는 운영자가 60초에
      // 504 를 받아 "실패했다"고 믿는 동안 백엔드가 계속 돌아 **그대로 커밋**했다 —
      // 그 다음 클릭은 "이미 존재" 로 막히고 조가 잠긴다(대회 레인이 같은 이유로 이미
      // 45+5 로 내렸다: tournaments/league-fixture-generator.service.ts 의
      // TRANSACTION_TIMEOUT_MS 주석, docs/ops/alb-idle-timeout.md).
      // 45초 + maxWait 5초 = 최악 50초라 ALB 안에서 끝나고, 만료되면 열려 있던 쓰기는
      // 전부 롤백돼 운영자가 받는 실패가 실제 실패와 일치한다.
      timeout: 45_000,
      maxWait: 5_000,
    });

    // 리그 감사 그룹 A / R2: 재생성도 새 대진 배정이므로 동일하게 알린다.
    if (result.ids.length > 0) this.notifyFixturesScheduled(leagueId, league.title, schedule);
    // 그룹 B 감사 결함 4: 옛 주석은 "cancelFixture 경로가 이미 team_match_cancelled를
    // 담당한다"고 적혀 있었지만 사실이 아니었다 — 리그 대진은 leagueId가 있어
    // team-matches.service.ts의 자가취소가 하드 거부하므로(599-604행) 그 알림에 절대
    // 도달할 수 없었다. 위 notifyFixturesScheduled는 "새 대진이 생겼다"만 알리므로,
    // 옛 대진이 취소됐다는 사실은 별도로 알린다.
    if (result.cancelledFixtures.length > 0) this.notifyFixturesCancelled(leagueId, result.cancelledFixtures, dto.reason);

    return {
      leagueId,
      cancelledCount: result.cancelledCount,
      createdCount: result.ids.length,
      teamMatchIds: result.ids,
      warnings: buildOddTeamCountWarning(teamIds.length),
    };
  }

  /**
   * 운영자가 **한 경기씩** 직접 넣는다 (Task 164 BE-1).
   *
   * 일괄 생성과 **같은 함수**(`createLeagueFixture`)로 만든다 — 두 경로가 각자 팀매치를
   * 만들면 한쪽에만 부수효과가 빠지는데, 실제로 그 사고가 있었다(리그 대진이 팀 일정을
   * 안 만들어 참가 팀 캘린더에 한 건도 안 떴다).
   *
   * 일괄 생성과 다른 점은 **입구 조건뿐**이다:
   *   · 일괄은 "대진이 하나도 없을 때만"(LEAGUE_FIXTURES_EXIST) — 수동은 언제든 더한다
   *   · 일괄은 라운드로빈이 짝을 정한다 — 수동은 운영자가 두 팀을 고른다
   * 그래서 **두 팀이 이 리그 소속인지**를 여기서 검증한다. 일괄 경로에는 그 검증이 없는데,
   * 짝이 `league.teams` 에서 나오므로 소속이 자명하기 때문이다.
   *
   * 그 검증은 **트랜잭션 안, 리그 행을 잠근 뒤**에 한다 — 잠금 밖 스냅샷으로 판정하면
   * 그 사이 `removeTeam` 이 커밋됐을 때 이미 빠진 팀으로 대진이 생긴다.
   */
  async createManualFixture(user: V1AuthUser, leagueId: string, dto: CreateManualLeagueFixtureDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const league = await this.loadLeague(leagueId);
    if (dto.homeTeamId === dto.awayTeamId) {
      throw new UnprocessableEntityException({
        code: 'LEAGUE_TEAM_INVALID',
        message: '같은 팀끼리 경기를 만들 수 없어요.',
      });
    }
    const config = await resolveTeamMatchCompetitionConfig(this.prisma, league.sportId);
    if (config === null) {
      throw new ConflictException({ code: 'COMPETITION_CONFIG_REQUIRED', message: '이 종목에 활성 경기 설정이 없어요.' });
    }

    const startAt = new Date(dto.startsAt);
    const trimmedPlaceName = dto.placeName?.trim();
    const trimmedTitle = dto.title?.trim();

    const teamMatchId = await this.prisma.$transaction(async (tx) => {
      // 일괄 생성과 같은 락. 같은 리그에 동시에 손대는 두 요청이 서로의 주차 계산을
      // 어긋나게 만들지 않는다 — 아래 형제 목록 조회가 이 락 안에서 일어나야 한다.
      await tx.$queryRaw`SELECT id FROM "v1_leagues" WHERE id = ${leagueId} FOR UPDATE`;
      // **잠근 뒤에** 로스터를 다시 읽는다. 잠금 밖에서 읽은 `league.teams` 로 판정하면
      // TOCTOU 다 — 그 사이 `removeTeam` 이 커밋되면 **리그에서 이미 빠진 팀으로 대진이
      // 생기고**, 그 대진은 로스터에 없는 팀을 가리킨 채 남는다(제거 경로가 취소할 대상
      // 목록을 읽을 때는 아직 없던 대진이다).
      //
      // 락 순서는 `removeTeam`(:529)·`generateFixtures`(:307)·`regenerateFixtures`(:794)와
      // 같다 — **리그 행 먼저**. 순서가 같으므로 서로 데드락하지 않는다.
      const registeredNow = await tx.v1LeagueTeam.findMany({
        where: { leagueId, teamId: { in: [dto.homeTeamId, dto.awayTeamId] } },
        select: { teamId: true },
      });
      const registeredIds = new Set(registeredNow.map((row) => row.teamId));
      if (!registeredIds.has(dto.homeTeamId) || !registeredIds.has(dto.awayTeamId)) {
        throw new UnprocessableEntityException({
          code: 'LEAGUE_TEAM_INVALID',
          message: '이 리그에 등록되지 않은 팀이에요.',
        });
      }
      const teamsById = await this.loadTeamsWithMembers(tx, [dto.homeTeamId, dto.awayTeamId]);
      const home = teamsById.get(dto.homeTeamId);
      const away = teamsById.get(dto.awayTeamId);
      if (home === undefined || away === undefined) {
        // league.teams 에는 남아 있어도 그 사이 비활성/소프트삭제된 팀은 여기 없다
        // (loadTeamsWithMembers 의 active 필터) — 일괄 생성과 같은 도메인 오류로 거부한다.
        throw new UnprocessableEntityException({
          code: 'LEAGUE_TEAM_INVALID',
          message: '비활성화되었거나 삭제된 팀이 포함돼 있어요.',
        });
      }
      return createLeagueFixture(tx, this.games, {
        leagueId: league.id,
        adminUserId: admin.userId,
        sportId: league.sportId,
        regionId: league.regionId,
        competitionConfigId: config.id,
        title: trimmedTitle ? trimmedTitle : await this.defaultManualFixtureTitle(tx, league.id, league.title, startAt),
        placeName: trimmedPlaceName ? trimmedPlaceName : DEFAULT_FIXTURE_PLACE_NAME,
        startAt,
        // `== null` 로 **null 도 미지정**으로 본다. `@IsOptional()` 은 null 을 통과시키고
        // `@Type(() => Number)` 도 null 을 숫자로 바꾸지 않아서(실측), `=== undefined` 만
        // 보면 `null * 60_000 === 0` 이 되어 **종료 = 시작인 0분 경기**가 저장된다.
        endAt: dto.durationMinutes == null ? null : new Date(startAt.getTime() + dto.durationMinutes * 60_000),
        home,
        away,
      });
    });

    return { leagueId, teamMatchId };
  }

  /**
   * 수동 대진의 기본 제목. 주차는 **화면과 같은 규칙**으로 파생한다
   * (`league-week-number.ts` — 그 리그의 서로 다른 KST 경기일을 세어 몇 번째 날인지).
   *
   * 저장된 제목을 흉내 내지 않는 이유가 그 모듈 docblock 에 있다: 재일정(`updateFixture`)은
   * `startAt` 만 바꾸고 `title` 은 그대로 둬서 저장된 주차가 **낡는다**. 그래서 세 화면이
   * 이미 `startAt` 에서 파생하고 있고, 여기서 다른 규칙을 쓰면 새로 넣은 경기만 화면과
   * 다른 주차로 불린다.
   *
   * 새로 넣을 경기의 시각도 형제 목록에 포함해서 센다 — 아직 저장 전이라 조회에 안 잡힌다.
   */
  private async defaultManualFixtureTitle(
    tx: Prisma.TransactionClient,
    leagueId: string,
    leagueTitle: string,
    startAt: Date,
  ): Promise<string> {
    const siblings = await tx.v1TeamMatch.findMany({
      // 취소된 대진도 센다 — 위 세 화면이 쓰는 조건(deletedAt: null 만)과 같아야 주차가
      // 어긋나지 않는다(league-week-number.ts 의 siblingStartAtsByLeagueId 주석).
      where: { leagueId, deletedAt: null },
      select: { startAt: true },
    });
    const targetId = 'manual-fixture-being-created';
    const week = resolveLeagueWeekNumbers(
      new Map([[leagueId, [...siblings.map((row) => row.startAt), startAt]]]),
      [{ id: targetId, leagueId, startAt }],
    ).get(targetId);
    return leagueFixtureTitle({ leagueTitle, round: week ?? 1 });
  }

  async updateFixture(user: V1AuthUser, leagueId: string, teamMatchId: string, dto: UpdateLeagueFixtureDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const teamMatch = await this.prisma.v1TeamMatch.findFirst({ where: { id: teamMatchId, leagueId } });
    if (teamMatch === null) {
      throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '이 리그의 대진이 아니에요.' });
    }
    // 감사 결함(index 9): timing으로 생성된 대진은 startAt·endAt이 한 슬롯의 시작·끝이다.
    // startAt만 바꾸고 endAt을 그대로 두면 "종료가 시작보다 이전"인 옛 값이 남는다 — 원래
    // duration(endAt-startAt, generateFixtures가 resolveFixtureTimeSlots로 채운 값)을 새
    // startAt에 그대로 적용해 유지한다. timing 없이 만들어져 endAt이 애초에 없는(null)
    // 대진은 계속 없음으로 둔다 — duration 자체가 정의되지 않으므로 임의로 만들어내지 않는다.
    const durationMs = teamMatch.endAt !== null ? teamMatch.endAt.getTime() - teamMatch.startAt.getTime() : null;
    const nextStartAt = dto.startsAt === undefined ? undefined : new Date(dto.startsAt);
    const nextEndAt = nextStartAt !== undefined && durationMs !== null ? new Date(nextStartAt.getTime() + durationMs) : undefined;
    const updated = await this.prisma.$transaction(async (tx) => {
      // generateFixtures와 동일하게: 빈/공백 문자열로 지우는 요청은 "미지정"으로 되돌린다 —
      // 그대로 저장하면 loadRecentVenues distinct 집계에서 조용히 빠지는 값이 남는다.
      const trimmedPlaceName = dto.placeName === undefined ? undefined : dto.placeName.trim();
      const result = await tx.v1TeamMatch.update({
        where: { id: teamMatchId },
        data: {
          ...(nextStartAt === undefined ? {} : { startAt: nextStartAt }),
          ...(nextEndAt === undefined ? {} : { endAt: nextEndAt }),
          ...(trimmedPlaceName === undefined ? {} : { placeName: trimmedPlaceName ? trimmedPlaceName : DEFAULT_FIXTURE_PLACE_NAME }),
          ...(dto.placeAddress === undefined ? {} : { placeAddress: dto.placeAddress }),
        },
      });
      // 사용자 확정: 시작 시각이 바뀌면 결과 미입력 리마인더도 새 시각을 따라간다 —
      // 새 세대(startAt)로 다시 스케줄할 뿐 옛 행은 건드리지 않는다(발화 시점에
      // expectedStartAt 불일치로 스스로 no-op — league-result-entry-reminder.service.ts 참고).
      if (dto.startsAt !== undefined) {
        await scheduleLeagueResultEntryReminder(tx, { teamMatchId, startAt: result.startAt });
        // 그룹 B 감사 결함 5 후속: createFixturesInTx가 이제 양 팀 스케줄을 만들어 두므로,
        // 여기서 시작 시각만 바꾸고 스케줄을 그대로 두면 캘린더 시각이 대진 시각과 어긋난다
        // (team-matches.service.ts:593의 동일 패턴). syncTeamMatchScheduleInTx는 teamMatchId
        // 기준으로 SCHEDULED 상태인 스케줄을 전부(호스트+원정 최대 2건) 갱신한다.
        await syncTeamMatchScheduleInTx(tx, teamMatchId, teamMatch.title, result.startAt, result.endAt);
      }
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'league_match.update_fixture',
          targetType: 'team_match',
          targetId: teamMatchId,
          afterJson: {
            startAt: result.startAt.toISOString(),
            endAt: result.endAt !== null ? result.endAt.toISOString() : null,
            placeName: result.placeName,
          },
        },
        tx,
      );
      return result;
    });
    return {
      teamMatchId: updated.id,
      startAt: updated.startAt,
      endAt: updated.endAt,
      placeName: updated.placeName,
      placeAddress: updated.placeAddress,
    };
  }

  // R6/D-3: 전 대진이 확정되면 리그는 자동으로 completed 전이한다(LeagueCompletionProjectionService).
  // 이 메서드는 그 결과를 정정해야 할 때(오심 정정 등)를 위한 운영자 역전이다.
  /**
   * 참가 신청을 연다 (D7) — 거울에 `status='open'` + `registrationDeadlineAt` 을 놓는다.
   *
   * ## 왜 리그 축이 아니라 거울에 쓰는가
   * 신청·제출·확정은 **대회 서비스를 그대로** 지난다(`TournamentRegistrationsService` ·
   * `AdminRegistrationsService`). 그 서비스들이 보는 것은 `V1Tournament.status === 'open'`
   * 과 `registrationDeadlineAt` 이므로, 신청을 여는 것은 곧 거울에 그 두 값을 놓는 것이다.
   * 리그 축에 `open` 을 새로 만들면 같은 뜻의 상태가 두 축에 따로 생기고, 둘이 어긋나는
   * 순간 어느 쪽이 참인지 알 수 없게 된다.
   *
   * `V1League.state` 는 `draft` 그대로 둔다 — **신청 접수는 시작이 아니다.**
   * `LEAGUE_STATE_BY_STATUS` 가 `open → draft` 로 되돌리므로 두 축의 표시가 일치한다.
   *
   * ## 닫는 액션이 따로 없는 이유
   * 마감은 `registrationDeadlineAt` 이 지나면 등록 서비스가 스스로 409
   * `REGISTRATION_DEADLINE_PASSED` 로 닫고, 대진이 짜이면 `generateFixtures` 가 거울을
   * `in_progress` 로 옮긴다. 즉 닫히는 경로가 이미 둘이라 세 번째를 만들지 않는다.
   */
  async openRegistration(user: V1AuthUser, leagueId: string, dto: OpenLeagueRegistrationDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const league = await this.prisma.v1League.findUnique({
      where: { id: leagueId },
      select: { id: true, state: true },
    });
    if (league === null) {
      throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
    }
    if (league.state !== 'draft') {
      // 이미 시작했거나 끝난 리그에 신청을 열면, 대진이 짜인 뒤 팀이 들어오는 상태가 된다.
      throw new ConflictException({
        code: 'LEAGUE_NOT_DRAFT',
        message: '아직 시작하지 않은 리그만 참가 신청을 열 수 있어요.',
      });
    }

    const deadline = new Date(dto.registrationDeadlineAt);
    if (deadline.getTime() <= Date.now()) {
      // 열자마자 닫힌 리그를 만들지 않는다 — 등록 서비스가 곧바로
      // REGISTRATION_DEADLINE_PASSED 로 막아 "열었는데 아무도 못 신청" 이 된다.
      throw new UnprocessableEntityException({
        code: 'LEAGUE_REGISTRATION_DEADLINE_PAST',
        message: '신청 마감은 지금보다 뒤여야 해요.',
      });
    }

    // `updateMany` + `kind` 가드인 이유는 이 파일의 다른 dual-write 와 같다 — `update` 는
    // `where` 에 unique 필드만 받아 `kind` 를 못 걸어서, 같은 id 의 **진짜 대회**가 있으면
    // 덮어쓴다. 거울이 아직 없으면(백필 이전) 0행이고, 그건 조용한 성공이 아니라 오류다:
    // 신청 스택이 보는 행이 없으므로 열었다고 응답하면 거짓말이 된다.
    const opened = await this.prisma.v1Tournament.updateMany({
      where: { id: leagueId, kind: 'regular_league' },
      data: { status: 'open', registrationDeadlineAt: deadline },
    });
    if (opened.count === 0) {
      throw new ConflictException({
        code: 'LEAGUE_MIRROR_MISSING',
        message: '이 리그는 아직 통합 대회 축에 올라오지 않아 신청을 열 수 없어요.',
      });
    }

    await this.adminContext.logAdminAction(admin, {
      action: 'league_match.open_registration',
      targetType: 'league_match',
      targetId: leagueId,
      reason: null,
      fromStatus: 'draft',
      toStatus: 'open',
    });

    return { leagueId, status: 'open' as const, registrationDeadlineAt: deadline.toISOString() };
  }

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
    // dual-write — 되돌리기도 거울에 반영한다. **조건부 update 의 승자만 반영해야 한다**:
    // 위 `where: { state: 'completed' }` 가 0행이면 이미 누가 되돌린 것이라 여기서 거울을
    // 건드리면 남의 전이를 덮는다. 그래서 `reverted.count` 를 먼저 본다.
    if (reverted.count > 0) {
      await tx.v1Tournament.updateMany({
        where: { id: leagueId, kind: 'regular_league' },
        data: { status: STATUS_BY_LEAGUE_STATE.active },
      });
    }
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
      ids.push(
        await createLeagueFixture(tx, this.games, {
          leagueId: input.leagueId,
          adminUserId: input.adminUserId,
          sportId: input.sportId,
          regionId: input.regionId,
          competitionConfigId: input.competitionConfigId,
          title: leagueFixtureTitle({
            leagueTitle: input.leagueTitle,
            round,
            matchday: slot?.matchday,
            orderInDay: slot?.orderInDay,
          }),
          placeName,
          startAt,
          endAt: slot !== undefined ? slot.endAt : null,
          home,
          away,
        }),
      );
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

  /**
   * 그룹 B 감사 결함 4: removeTeam·cancelFixture·regenerateFixtures 셋이 대진을 취소할
   * 때마다 관련 팀(들)의 owner/manager에게 알린다. 이전에는 이 셋 모두 알림이 전혀
   * 없었다 — 일반 팀매치 취소(team_match_cancelled)와 달리 리그 대진은 leagueId가
   * 있으면 team-matches.service.ts의 cancel()이 하드 거부해(LEAGUE_FIXTURE_HOST_CANCEL_
   * FORBIDDEN, 599-604행) 그 알림 코드에 절대 도달할 수 없었다.
   *
   * notifyFixturesScheduled와 같은 이유로 팀 단위로 묶는다 — removeTeam이 한 번에 여러
   * 대진을 취소할 수 있는데, 대진마다 알림을 쏘면 상대 팀장 알림함이 도배된다. 대진
   * 하나뿐인 cancelFixture 호출도 같은 함수를 그대로 쓴다(배열 원소 1개).
   *
   * 트랜잭션 커밋 후(호출부가 이미 그렇게 부른다)에 불러야 한다 — notifyFixturesScheduled
   * doc comment와 동일한 이유.
   */
  private notifyFixturesCancelled(
    leagueId: string,
    fixtures: Array<{ id: string; title: string; hostTeamId: string; approvedApplicantTeamId: string | null }>,
    reason: string,
  ): void {
    if (fixtures.length === 0) return;
    const fixtureCountByTeamId = new Map<string, number>();
    for (const fixture of fixtures) {
      fixtureCountByTeamId.set(fixture.hostTeamId, (fixtureCountByTeamId.get(fixture.hostTeamId) ?? 0) + 1);
      if (fixture.approvedApplicantTeamId !== null) {
        fixtureCountByTeamId.set(
          fixture.approvedApplicantTeamId,
          (fixtureCountByTeamId.get(fixture.approvedApplicantTeamId) ?? 0) + 1,
        );
      }
    }
    const body =
      fixtures.length === 1
        ? `"${fixtures[0].title}" 대진이 취소됐어요. 사유: ${reason}`
        : `리그 대진 ${fixtures.length}경기가 취소됐어요. 사유: ${reason}`;
    for (const [teamId] of fixtureCountByTeamId) {
      this.notifications.emitToManyDeferred(
        async () =>
          (
            await this.prisma.v1TeamMembership.findMany({
              where: { teamId, status: 'active', role: { in: ['owner', 'manager'] } },
              select: { userId: true },
            })
          ).map((m) => m.userId),
        'league_fixture_cancelled',
        leagueId,
        body,
      );
    }
  }
}
