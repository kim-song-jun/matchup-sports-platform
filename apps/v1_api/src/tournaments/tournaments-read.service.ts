import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, V1CompetitionKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildPageInfo, paginationArgs } from '../common/pagination/page-args';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { TournamentStaffAccessService } from './staff/tournament-staff-access.service';
import { presentTournamentCard } from './tournament-card.presenter';
import { presentTournamentDetail } from './tournament-detail.presenter';
import { TournamentListQueryDto } from './dto/tournament-read.dto';
import { leagueProgressOf, magicNumberOf } from './league-progress';
import { COMPETITION_LIST_SURFACE } from './tournament-surface';
import { findTournamentOnSurface, ALL_COMPETITION_KINDS } from './tournament-surface-lookup';
import { hasTournamentFixtureOfficialResult } from './tournament-fixture-official-result';
import {
  PUBLIC_COMPETITION_STATUS_WHERE,
  TOURNAMENT_DETAIL_INCLUDE,
  TOURNAMENT_LIST_INCLUDE,
} from './tournaments-read.query';
import { bucketLeagueFixtures, leagueFixtureProgressInput } from '../league-matches/league-standings-source';
import {
  LEAGUE_FIXTURE_FACT_SELECT,
  LEAGUE_FIXTURE_LIST_SELECT,
  toLeagueFixtureList,
} from '../league-matches/league-fixture-list-source';
import {
  calculateLeagueStandingsWithTieBreakInfo,
  type LeagueTieBreakCriterion,
} from '../league-matches/league-standings';

/** `V1CompetitionConfigVersion.tieBreak`(Json)에 담긴 승리 승점 기본값 — 프리셋 전부가 3이다. */
const DEFAULT_WIN_POINTS = 3;

/**
 * `getOverallStandings()` 조회 결과 행의 명시적 형태.
 *
 * **주의(2026-08-17)**: `V1TournamentOverallStanding`은 Task 3에서 스키마에 추가한
 * 신규 모델이라, 이 worktree(다른 worktree와 공유하는 `node_modules/.pnpm/@prisma+client`)의
 * 생성된 Prisma client에는 아직 반영돼 있지 않다. `prisma generate`는 모노레포 전체가
 * 공유하는 산출물이라 이 worktree에서 임의로 재생성하면 같은 스키마를 다루는 다른
 * worktree의 타입이 깨진다 — 절대 실행하지 않는다. 그래서 `this.prisma.v1TournamentOverallStanding`
 * 접근 자체는 로컬 tsc에서 계속 타입 오류로 보이는 게 **기대된 상태**이며, CI의
 * "V1 migration replay + drift gate"가 client를 재생성한 뒤 실제로 검증한다. 아래 타입은
 * 그 오류와 무관하게 이 메서드 내부 콜백들이 암시적 `any`로 새지 않게 하려고 별도로
 * 선언한 것이다.
 */
type OverallStandingRow = {
  registrationId: string;
  position: number | null;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  fairPlayPoints: number;
  recalculatedAt: Date | null;
  registration: { team: { name: string } };
};

type OverallStandingsFixtureRow = {
  homeRegistrationId: string | null;
  awayRegistrationId: string | null;
  game: { currentOfficialRevision: { state: string } | null } | null;
  result: { id: string } | null;
};

@Injectable()
export class TournamentsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffAccess: TournamentStaffAccessService,
  ) {}

  /**
   * 공개 대회 목록.
   * - deletedAt=null + status in (open/closed/in_progress/completed)
   * - 각 카드에 confirmedCount(status=confirmed registration 수) 포함
   * - **두 가지 페이지네이션을 동시에 지원한다**: 모바일 무한 스크롤은 `cursor`,
   *   데스크톱 페이지 번호는 `page`. 둘 다 오면 page 가 이긴다(`paginationArgs`).
   *   응답의 `nextCursor`/`hasNext` 는 그대로라 기존 호출자는 영향받지 않는다.
   */
  async list(query: TournamentListQueryDto) {
    const limit = query.limit ?? 20;

    const where: Prisma.V1TournamentWhereInput = {
      // 어느 종류를 담을지는 **표가 정한다**(`COMPETITION_LIST_SURFACE`) — 호출부가 조건을
      // 조립하지 않는다. 기본값 `tournament` 는 지금까지의 동작 그대로다: 리그는 안 나온다.
      // `kind=all` 로 여는 것은 표면 결정이라 `v1-surface-check` 가 사용처를 세어 묶는다.
      ...COMPETITION_LIST_SURFACE[query.kind ?? 'tournament'],
      deletedAt: null,
      // 명시적으로 status 를 요청해도 **종류 경계는 그대로**다.
      //
      // `draft` 는 정규 리그에서만 의미가 있다("예정"). 대회의 `draft` 는 운영자 준비
      // 중이라 계속 감춘다 — 그래서 `status=draft` 가 와도 **리그로 좁혀서** 적용한다.
      // 이 한 줄이 없으면 `?status=draft` 하나로 대회 비공개가 통째로 열린다.
      //
      // 다른 값(open/closed/in_progress/completed)은 원래 공개 범위라 그대로 쓴다.
      // ⚠️ `AND` 에 담는다 — 펴 넣으면 위 surface 상수의 `OR` 을 덮는다(그 doc comment 참조).
      ...(query.status
        ? query.status === 'draft'
          ? { AND: [{ kind: V1CompetitionKind.regular_league, status: 'draft' as const }] }
          : { status: query.status }
        : { AND: [PUBLIC_COMPETITION_STATUS_WHERE] }),
      ...(query.sportId ? { sportId: query.sportId } : {}),
    };

    // 전체 건수는 페이지 번호를 그릴 때만 센다 — 무한 스크롤은 "다음이 있는지"만 알면
    // 되므로 매 스크롤마다 COUNT 를 한 번 더 때릴 이유가 없다.
    const wantsPageNumbers = query.page !== undefined && query.page > 0;

    const [rows, total] = await Promise.all([
      this.prisma.v1Tournament.findMany({
        where,
        // createdAt 만으로는 전순서가 아니다 — 같은 시각에 만들어진 대회들(시드·일괄
        // 생성에서 흔하다)의 상대 순서가 쿼리마다 달라지면, skip 기반 페이지에서는 행이
        // 중복되거나 통째로 빠진다. id 를 tiebreaker 로 붙여 순서를 고정한다.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...paginationArgs(query, limit),
        include: TOURNAMENT_LIST_INCLUDE,
      }),
      wantsPageNumbers ? this.prisma.v1Tournament.count({ where }) : Promise.resolve(null),
    ]);

    const hasNext = rows.length > limit;
    const pageItems = hasNext ? rows.slice(0, limit) : rows;

    const nextCursor = hasNext ? (pageItems.at(-1)?.id ?? null) : null;

    return {
      items: pageItems.map(presentTournamentCard),
      // 페이지 번호를 묻지 않은 요청에는 **예전과 똑같은 두 필드만** 돌려준다. total 을
      // 세지 않았으므로 `total: 0`/`totalPages: 0` 을 실어 보내면 "전체 0건"이라는 거짓말이
      // 되고, 커서 클라이언트가 그 값을 읽기 시작하면 조용히 틀린 화면이 나온다.
      pageInfo: wantsPageNumbers
        ? buildPageInfo({ page: query.page, limit, total, hasNext, nextCursor })
        : { nextCursor, hasNext },
    };
  }

  /**
   * 공개 대회 상세.
   * - draft/cancelled는 404(소비자에게 노출 안 함).
   * - groups(+groupTeams 팀명), fixtures(+home/away 팀명, result), standings(position 정렬), announcements(publishedAt!=null) 포함.
   * - `user`가 이 대회의 운영자·스태프(TournamentStaffAccessService)면 모집 중에도
   *   참가팀 식별 정보(팀명·로고)를 그대로 본다 — PR #389(issue #377)가 공개 경기
   *   기록에 스태프 우회를 넣은 것과 동일한 선례.
   */
  async get(tournamentId: string, user?: V1AuthUser) {
    // **문을 여는 자리.** 이 한 줄이 정규 리그 시즌을 `/tournaments/:id` 에 도달하게 한다.
    // 이 PR 의 **마지막 커밋**인 이유: 앞선 커밋들이 상세 응답에 리그 대진을 싣고(②),
    // 대진표 공개 게이트를 리그에서 빼고(③), 화면이 그것을 그리게(④⑤⑥) 만든 뒤에야
    // 열어야 한다. 순서를 뒤집으면 사용자는 404 대신 **빈 껍데기**를 본다 — 사용자가 계속
    // 말하는 "덜 된 것 같다" 가 정확히 그 인상이고, 그러면 우리가 그걸 직접 만드는 것이다.
    const row = await findTournamentOnSurface(this.prisma, ALL_COMPETITION_KINDS, {
      where: {
        // 목록만 막으면 **id 를 아는 사람은 그대로 열 수 있다** — 대회 id 는 대진·순위
        // 응답에 실려 나가므로 상세·순위에도 같은 조건을 건다(종류 조건은 헬퍼가 건다).
        id: tournamentId,
        deletedAt: null,
        // 목록과 **같은 조건**이어야 한다. 목록에만 올리면 카드는 보이는데 누르면
        // "찾을 수 없어요" 가 뜬다 — 안 보이는 것보다 나쁘다(2026-09-01 실측:
        // draft 리그가 목록 밖인데 `/schedule` 은 200 이라 경로마다 답이 달랐다).
        AND: [PUBLIC_COMPETITION_STATUS_WHERE],
      },
      include: TOURNAMENT_DETAIL_INCLUDE,
    });

    if (!row) {
      throw new NotFoundException({
        code: 'TOURNAMENT_NOT_FOUND',
        message: '대회를 찾을 수 없어요.',
      });
    }

    const staffBypass = await this.resolveStaffBypass(user, tournamentId);
    // 거울 행에는 `V1TournamentFixture` 가 하나도 없다 — 그 행을 만드는 코드가 전부
    // `TOURNAMENT_KINDS` 게이트 뒤에 있다. 그래서 대회 축 대진으로는 **빈 일정**이 나오고,
    // 화면은 "대진표 준비 중" 을 띄운다(진행 중인 리그 시즌에 뜨면 틀린 말이다).
    // 리그 축에서 같은 목록을 만들어 별도 필드로 싣는다.
    const leagueFixtures =
      row.kind === V1CompetitionKind.regular_league
        ? await this.leagueCompetitionFixtures(tournamentId)
        : [];

    return presentTournamentDetail(row, new Date(), staffBypass, leagueFixtures);
  }

  /**
   * 거울 행(`kind = 'regular_league'`, id 가 리그 id 와 같다)의 일정 목록.
   *
   * 매핑은 `league-fixture-list-source.ts` 가 한다 — 리그 자기 페이지
   * (`LeagueMatchPublicService.detail()`)와 **같은 함수**를 쓴다. 두 화면이 같은 대진을
   * 서로 다른 모양으로 보여주지 않게 하기 위해서다.
   *
   * ⚠️ 순위 쪽 소스(`league-standings-source.ts`)와 **합치지 않는다.** 그쪽은 "순위에 세는
   * 대진이 무엇인가" 에 답하느라 취소·무효를 카운터로 접고 `teamMatchId`·`startAt`·
   * `placeName` 을 버린다 — 일정은 정확히 그 버린 것들이 필요하고, **취소·무효 대진도
   * 목록에는 보여야 한다**(화면이 "취소됨"·"집계 제외" 로 적는다). 같은 테이블, 다른 질문.
   */
  private async leagueCompetitionFixtures(leagueId: string) {
    const fixtures = await this.prisma.v1TeamMatch.findMany({
      where: { leagueId },
      orderBy: { startAt: 'asc' },
      select: LEAGUE_FIXTURE_LIST_SELECT,
    });

    const revisionIds = fixtures
      .map((fixture) => fixture.game?.currentOfficialRevisionId ?? null)
      .filter((id): id is string => id !== null);
    // 대진 수만큼 반복 조회하지 않는다 — 확정 리비전 id 를 모아 단일 IN 조회로 가져온다.
    const facts =
      revisionIds.length === 0
        ? []
        : await this.prisma.v1GameOfficialFact.findMany({
            where: { revisionId: { in: revisionIds } },
            select: LEAGUE_FIXTURE_FACT_SELECT,
          });

    return toLeagueFixtureList(fixtures, new Map(facts.map((fact) => [fact.gameId, fact])));
  }

  /**
   * 통합(대회 전체) 순위 공개 조회. §6.2.
   * - `V1TournamentOverallStanding`을 position 오름차순으로 조회하고 팀 표시명만 join한다
   *   (PII 금지 — 선수 실명·연락처·생년월일은 절대 포함하지 않는다)
   * - 대회 전체 fixture로 진행률(`leagueProgressOf`)을 계산한다
   * - 팀별 잔여 경기 수를 세어 `magicNumberOf`에 넘긴다
   */
  async getOverallStandings(tournamentId: string) {
    const tournament = await findTournamentOnSurface(this.prisma, ALL_COMPETITION_KINDS, {
      where: {
        // 목록만 막으면 **id 를 아는 사람은 그대로 열 수 있다** — 대회 id 는 대진·순위
        // 응답에 실려 나가므로 상세·순위에도 같은 조건을 건다(종류 조건은 헬퍼가 건다).
        id: tournamentId,
        deletedAt: null,
        // **상세와 같은 조건이어야 한다.** 상세 화면은 이 순위를 **항상 함께** 부른다 —
        // 상세만 열고 여기를 닫으면 화면이 열리자마자 순위 섹션이 에러가 된다.
        // 실측(2026-09-01, #932 배포 전): 진행 리그는 상세·일정·통합순위가 다 200 인데
        // 예정 리그만 상세·통합순위가 404 였다. 한 화면이 부르는 경로는 하나가 아니다.
        AND: [PUBLIC_COMPETITION_STATUS_WHERE],
      },
      select: {
        id: true,
        kind: true,
        competitionConfig: { select: { tieBreak: true } },
      },
    });

    if (!tournament) {
      throw new NotFoundException({
        code: 'TOURNAMENT_NOT_FOUND',
        message: '대회를 찾을 수 없어요.',
      });
    }

    // 거울 행(정규 리그 시즌)은 조도 대진도 없어 **대회 축 계산으로는 빈 순위표**가 나온다.
    // 404 대신 빈 표를 주는 것이 더 나쁘다 — 에러가 아니라 "아직 순위가 없다" 로 읽힌다.
    // 그래서 종류로 갈라 리그 축에서 같은 모양을 만든다.
    if (tournament.kind === V1CompetitionKind.regular_league) {
      return this.leagueOverallStandings(tournamentId);
    }

    const [standingRows, fixtures]: [OverallStandingRow[], OverallStandingsFixtureRow[]] = await Promise.all([
      this.prisma.v1TournamentOverallStanding.findMany({
        where: { tournamentId },
        orderBy: { position: 'asc' },
        include: {
          registration: { include: { team: { select: { name: true } } } },
        },
      }),
      this.prisma.v1TournamentFixture.findMany({
        where: { tournamentId },
        select: {
          homeRegistrationId: true,
          awayRegistrationId: true,
          game: { select: { currentOfficialRevision: { select: { state: true } } } },
          result: { select: { id: true } },
        },
      }),
    ]);

    const progress = leagueProgressOf(
      fixtures.map((fixture) => ({
        hasResult: hasTournamentFixtureOfficialResult(fixture.game, fixture.result),
      })),
    );

    const remainingByRegistration = new Map<string, number>();
    for (const fixture of fixtures) {
      if (hasTournamentFixtureOfficialResult(fixture.game, fixture.result)) continue;
      for (const registrationId of [fixture.homeRegistrationId, fixture.awayRegistrationId]) {
        if (!registrationId) continue;
        remainingByRegistration.set(registrationId, (remainingByRegistration.get(registrationId) ?? 0) + 1);
      }
    }

    const standings = standingRows.map((row) => ({
      registrationId: row.registrationId,
      teamName: row.registration.team.name,
      position: row.position,
      points: row.points,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      fairPlayPoints: row.fairPlayPoints,
    }));

    const winPoints = this.resolveWinPoints(tournament.competitionConfig?.tieBreak);
    const magicNumber = magicNumberOf(standings, remainingByRegistration, winPoints);

    const recalculatedAt = standingRows.reduce<Date | null>((latest, row) => {
      if (!row.recalculatedAt) return latest;
      if (!latest || row.recalculatedAt > latest) return row.recalculatedAt;
      return latest;
    }, null);

    return {
      standings,
      progress,
      magicNumber,
      recalculatedAt: recalculatedAt ? recalculatedAt.toISOString() : null,
    };
  }

  /**
   * 거울 행(`kind = 'regular_league'`)의 통합 순위. **리그 축에서 계산해 대회 축 응답 모양으로**
   * 돌려준다 — 같은 화면(`LeagueStandingsTable`)이 두 축을 다 그리게 하기 위해서다.
   *
   * ⚠️ **"이 PR 이 프론트를 안 건드린다" 와 "프론트가 지금 이 응답을 읽을 수 있다" 는 다른
   * 말이다.** 앞은 맞고 뒤는 **아니다** — 아래 `registrationId` 항목 참조. 그 빚은 프론트 PR
   * 이 갚고, **문 PR(상세 조회 `get` 을 넓히는 것)보다 반드시 먼저 머지돼야 한다.**
   *
   * ## 왜 대회 축 계산을 못 쓰나
   * 거울에는 조(`V1TournamentGroup`)도 대진(`V1TournamentFixture`)도 없다 — 그 행들을 만드는
   * 세 곳이 전부 `TOURNAMENT_KINDS` 게이트 뒤라 거울은 도달하지 않는다. 그래서 기존 경로는
   * **빈 순위표**를 준다. 404 보다 나쁘다: 에러가 아니라 "아직 순위가 없다" 로 읽힌다.
   *
   * ## 모양이 다른 두 필드
   * - `registrationId` — 리그엔 참가 등록 개념이 없어 **생략하고 `teamId` 를 싣는다.** teamId 를
   *   `registrationId` 라는 이름에 담으면 값은 전달되지만 **이름이 내용과 갈린 상태**가 남고,
   *   나중에 그 값으로 등록을 조회하는 코드가 생기는 순간 터진다.
   *   프론트는 `#896` 에서 두 축을 다 읽도록 넓혔다 — `V1LeagueOverallStandingRow` 가
   *   유니온이 되어 `registrationId`(대회) / `teamId`(리그) 중 **하나는 반드시** 있고,
   *   행 key 는 `registrationId ?? teamId` 다. 그 확장이 이 문(상세 조회 게이트)보다 먼저
   *   들어갔다 — 순서가 반대였으면 사용자가 키 겹친 빈 표를 봤다.
   * - `fairPlayPoints` — 리그는 **집계 자체를 하지 않는다.** `0` 은 "감점이 없다" 로 읽히므로
   *   값이 아니라 **부재**로 둔다(optional).
   *
   * ## 진행률의 분모
   * 취소·무효 대진은 분모에서도 빠진다 — 앞으로도 치러지지 않을 경기를 "남은 경기" 로 세면
   * 진행률이 영원히 100% 에 못 닿는다. 그 분류는 `bucketLeagueFixtures` 가 한다.
   */
  private async leagueOverallStandings(leagueId: string) {
    const league = await this.prisma.v1League.findUnique({
      where: { id: leagueId },
      include: { teams: { select: { teamId: true, team: { select: { name: true } } } } },
    });
    if (league === null) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }

    const teamMatches = await this.prisma.v1TeamMatch.findMany({
      where: { leagueId },
      select: {
        id: true,
        hostTeamId: true,
        approvedApplicantTeamId: true,
        startAt: true,
        status: true,
        // `currentOfficialRevision.state` 가 없으면 무효(VOID)와 미확정이 구분되지 않는다 —
        // 둘 다 fact 가 없기 때문이다. 이 select 가 빠지면 진행률이 조용히 틀린다.
        game: {
          select: {
            id: true,
            currentOfficialRevisionId: true,
            currentOfficialRevision: { select: { state: true } },
          },
        },
      },
    });

    const revisionIds = teamMatches
      .map((teamMatch) => teamMatch.game?.currentOfficialRevisionId ?? null)
      .filter((id): id is string => id !== null);
    const facts =
      revisionIds.length === 0
        ? []
        : await this.prisma.v1GameOfficialFact.findMany({
            where: { revisionId: { in: revisionIds } },
            select: { gameId: true, homeScore: true, awayScore: true },
          });
    const factByGameId = new Map(facts.map((fact) => [fact.gameId, fact]));

    const buckets = bucketLeagueFixtures(teamMatches, factByGameId);
    const teamNameById = new Map(league.teams.map((entry) => [entry.teamId, entry.team.name]));
    const tieBreakOrder = (league.tieBreakJson as { order?: LeagueTieBreakCriterion[] }).order ?? [
      'points',
      'goalDifference',
      'goalsFor',
      'headToHead',
    ];
    const { standings: leagueStandings } = calculateLeagueStandingsWithTieBreakInfo({
      teamIds: league.teams.map((entry) => entry.teamId),
      fixtures: buckets.confirmed,
      tieBreakOrder,
    });

    return {
      standings: leagueStandings.map((row) => ({
        // `registrationId` 는 **싣지 않는다.** 리그엔 참가 등록 개념이 없다 — teamId 를 그
        // 이름으로 담으면 값을 함께 실어도 **이름이 팀 id 를 담는 상태**가 그대로 남고,
        // 나중에 그 값으로 등록을 조회하는 코드가 생기는 순간 터진다.
        // `fairPlayPoints` 와 같은 처리다: 값이 아니라 **부재**다.
        teamId: row.teamId,
        teamName: teamNameById.get(row.teamId) ?? '',
        position: row.position,
        points: row.points,
        wins: row.wins,
        draws: row.draws,
        losses: row.losses,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
      })),
      progress: leagueProgressOf(leagueFixtureProgressInput(buckets)),
      // 매직넘버는 대회 축의 잔여 경기 계산에 묶여 있다. 리그에 같은 개념을 붙이는 것은
      // 별도 판단이라 여기서 지어내지 않는다.
      magicNumber: null,
      recalculatedAt: null,
    };
  }

  /**
   * `V1CompetitionConfigVersion.tieBreak`(느슨한 Json)에서 승리 승점만 방어적으로 꺼낸다.
   * 이 조회는 익명 방문자에게도 열려 있는 공개 API라 `validateCompetitionConfig`(관리자
   * mutation 경로 전용, 실패 시 422 예외)를 그대로 재사용하지 않는다 — 형태가 예상과 다르면
   * 예외를 던지는 대신 모든 프리셋의 공통값인 기본 승점으로 조용히 대체한다.
   */
  private resolveWinPoints(tieBreak: Prisma.JsonValue | undefined): number {
    if (typeof tieBreak !== 'object' || tieBreak === null || Array.isArray(tieBreak)) {
      return DEFAULT_WIN_POINTS;
    }
    const points = (tieBreak as Record<string, unknown>).points;
    if (typeof points !== 'object' || points === null || Array.isArray(points)) {
      return DEFAULT_WIN_POINTS;
    }
    const win = (points as Record<string, unknown>).win;
    return typeof win === 'number' ? win : DEFAULT_WIN_POINTS;
  }

  /**
   * 이 대회에 배정된 운영자·스태프(플랫폼 어드민 포함)인지 판정한다 — 대회 전체
   * 단위(`{ tournamentId }`, fixtureId/fieldId 미지정) 읽기 권한으로 확인한다. 이
   * 엔드포인트는 특정 경기 하나가 아니라 대회 전체의 조/픽스처를 한 번에 내려주므로,
   * 특정 fixture/field로 좁게 배정된 FIELD_OPERATOR는(대회 전체를 볼 권한은 아니므로)
   * 자연히 우회 대상에서 제외된다 — decideTournamentStaffAccess의 기존 정책을 그대로
   * 따르는 결과이지 별도로 발명한 로직이 아니다.
   *
   * `assertAccess`는 boolean을 반환하지 않고 허용 시 principal을, 거부 시
   * ForbiddenException(STAFF_SCOPE_DENIED)만 던진다. 이 조회는 익명 방문자에게도
   * 열려 있어야 하므로(OptionalV1AuthGuard) 그 거부를 절대 그대로 전파하지 않고
   * false로 낮춰 masked 응답으로 떨어뜨린다 — 그 외 예외(DB 장애 등)는 "스태프
   * 아님"으로 조용히 재해석하지 않고 그대로 전파한다.
   */
  private async resolveStaffBypass(user: V1AuthUser | undefined, tournamentId: string): Promise<boolean> {
    if (user === undefined) return false;
    try {
      await this.staffAccess.assertAccess({ userId: user.id, action: 'read', resource: { tournamentId } });
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) return false;
      throw error;
    }
  }
}
