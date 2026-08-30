import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildPageInfo, paginationArgs } from '../common/pagination/page-args';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { TournamentStaffAccessService } from './staff/tournament-staff-access.service';
import { presentTournamentCard } from './tournament-card.presenter';
import { presentTournamentDetail } from './tournament-detail.presenter';
import { TournamentListQueryDto } from './dto/tournament-read.dto';
import { leagueProgressOf, magicNumberOf } from './league-progress';
import { TOURNAMENT_SURFACE_KIND } from './tournament-surface';
import { hasTournamentFixtureOfficialResult } from './tournament-fixture-official-result';
import {
  PUBLIC_TOURNAMENT_STATUS_FILTER,
  TOURNAMENT_DETAIL_INCLUDE,
  TOURNAMENT_LIST_INCLUDE,
} from './tournaments-read.query';

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
      // 정규 리그 시즌은 대회 목록에 나오지 않는다 — 근거는 상수 쪽 주석.
      ...TOURNAMENT_SURFACE_KIND,
      deletedAt: null,
      status: query.status ? query.status : PUBLIC_TOURNAMENT_STATUS_FILTER,
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
    const row = await this.prisma.v1Tournament.findFirst({
      where: {
        // 목록만 막으면 **id 를 아는 사람은 그대로 열 수 있다** — 대회 id 는 대진·순위
        // 응답에 실려 나가므로 상세·순위에도 같은 조건을 건다.
        ...TOURNAMENT_SURFACE_KIND,
        id: tournamentId,
        deletedAt: null,
        status: PUBLIC_TOURNAMENT_STATUS_FILTER,
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

    return presentTournamentDetail(row, new Date(), staffBypass);
  }

  /**
   * 통합(대회 전체) 순위 공개 조회. §6.2.
   * - `V1TournamentOverallStanding`을 position 오름차순으로 조회하고 팀 표시명만 join한다
   *   (PII 금지 — 선수 실명·연락처·생년월일은 절대 포함하지 않는다)
   * - 대회 전체 fixture로 진행률(`leagueProgressOf`)을 계산한다
   * - 팀별 잔여 경기 수를 세어 `magicNumberOf`에 넘긴다
   */
  async getOverallStandings(tournamentId: string) {
    const tournament = await this.prisma.v1Tournament.findFirst({
      where: {
        // 목록만 막으면 **id 를 아는 사람은 그대로 열 수 있다** — 대회 id 는 대진·순위
        // 응답에 실려 나가므로 상세·순위에도 같은 조건을 건다.
        ...TOURNAMENT_SURFACE_KIND,
        id: tournamentId,
        deletedAt: null,
        status: PUBLIC_TOURNAMENT_STATUS_FILTER,
      },
      select: {
        id: true,
        competitionConfig: { select: { tieBreak: true } },
      },
    });

    if (!tournament) {
      throw new NotFoundException({
        code: 'TOURNAMENT_NOT_FOUND',
        message: '대회를 찾을 수 없어요.',
      });
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
