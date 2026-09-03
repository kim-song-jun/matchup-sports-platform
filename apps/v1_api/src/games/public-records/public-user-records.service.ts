import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveTeamRecordResult } from '../../game-operations/team-record-result';
import { parseTournamentFixtureOfficialScore } from '../../tournaments/tournament-fixture-official-result';
import { UserRecordsQueryDto } from './dto/public-records-query.dto';
import { classifyTeamRecordCategory, type TeamRecordCategory } from './team-record-category';
import { decodeRecordCursor, encodeRecordCursor, isAfterCursor, type RecordCursor } from './public-cursor';
import {
  isParticipantOwnerVisible,
  isParticipantPubliclyEligible,
  loadParticipantConsentEligibility,
} from './public-consent';

interface EligibleResultRow {
  readonly participantResultId: string;
  readonly resultRevisionId: string;
  readonly participantId: string;
  readonly gameId: string;
  readonly sourceType: string;
  readonly tournamentFixtureId: string | null;
  readonly teamMatchId: string | null;
  readonly sideId: string;
  readonly goals: number;
  readonly assists: number;
  readonly cardsYellow: number;
  readonly cardsRed: number;
  readonly minutesPlayed: number | null;
  readonly started: boolean;
  readonly goalkeeper: boolean;
  readonly officialAt: Date;
  readonly isMvp: boolean;
  /**
   * 정규시간 스코어 + (승부차기까지 간 경기만) 페널티 스코어. 페널티는 `goals`/득실에
   * 절대 합산하지 않고 오직 승패 판정(`result`)에만 쓴다 -- 팀 전적(`v1_team_record_facts`)
   * 과 같은 계약이다.
   */
  readonly score: { home: number; away: number; penalties?: { home: number; away: number } } | null;
}

/**
 * Task 24, 사용자 단위 동의로 재정의(2026-08-13) -- `GET /users/:id/records`.
 * 이 라우트가 동의 게이트가 실제로 힘을 갖는 유일한 곳이다: `V1GameResultParticipant`
 * 행은 (a) 게임의 *현재* 공식 리비전을 거쳐 도달했고(void/superseded 리비전은
 * 애초에 경로가 없다 -- `GameResultVoidProjectionService`의 주석 참고) (b) 그
 * participant 행이 `isParticipantPubliclyEligible`(사용자 단위 동의 GRANTED +
 * participant 단위 최신 스냅샷이 REVOKED 아님)를 통과할 때만 여기 반영된다.
 * 미연동 게스트, 사용자 단위 동의가 없는/철회된 연동, 개별 스냅샷으로 숨긴 참가
 * 기록은 전부 (b)에서 걸러져 조용히 빠진다 -- placeholder/error 행 없음("no
 * `PENDING_IDENTITY` row is created").
 *
 * **본인 조회 우회(2026-08-18 사용자 결정)**: 조회자(`viewerId`, 서버 세션 기준 --
 * `OptionalV1AuthGuard` + `@CurrentUser()`)가 조회 대상 `userId`와 같으면(self-view)
 * `isParticipantPubliclyEligible`의 **사용자 단위 동의 조건만** 건너뛴다. 신원 연결
 * (`linkedUserId !== null`) 조건은 그대로 요구한다 -- 연결 자체가 없는 참가 기록은
 * 남의 것일 수 있어서다. participant 단위 개별 숨김(최신 스냅샷 `REVOKED`)도 본인
 * 화면에서 그대로 존중한다 -- 이건 사용자 단위 동의와 별개로 "이 경기 하나만 숨기고
 * 싶다"는 명시적 선택이므로, 동의를 다시 켜도 이 개별 override는 유지돼야 의도와
 * 맞는다. 판별은 쿼리 파라미터/헤더가 아니라 반드시 서버 세션(`viewerId`)으로만 한다.
 */
@Injectable()
export class PublicUserRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRecords(userId: string, query: UserRecordsQueryDto, viewerId?: string) {
    // profile.service.ts의 publicProfile과 동일한 게이트(`deletedAt: null, accountStatus: 'active'`).
    // 탈퇴 계정은 profile.nickname이 내부 삭제 식별자(`deleted_xxxxxxxx`)로 덮여 있고
    // (admin.service.ts deleteUser), 그 값을 그대로 공개 응답에 실으면 SEO 인덱싱되는
    // 페이지 제목에 그대로 노출된다 -- 자매 라우트인 public-profile은 이미 404를 던지는데
    // 이 라우트만 계정 상태를 보지 않아 비대칭이 생겼던 것을 바로잡는다. 정지/차단/탈퇴대기
    // 중인 계정도 같은 이유로 함께 막는다(publicProfile과 정확히 같은 기준).
    const user = await this.prisma.v1User.findFirst({
      where: { id: userId, deletedAt: null, accountStatus: 'active' },
      select: { id: true, profile: { select: { nickname: true } } },
    });
    if (user === null) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User was not found' });
    }

    const viewerIsOwner = viewerId !== undefined && viewerId === userId;

    const [eligibleRows, consent] = await Promise.all([
      this.loadEligibleRows(userId, query.season, viewerIsOwner),
      this.prisma.v1UserRecordConsent.findUnique({ where: { userId }, select: { state: true } }),
    ]);
    const tournamentAwards =
      viewerIsOwner || consent?.state === 'GRANTED'
        ? await this.loadTournamentAwards(userId, query.season)
        : [];
    // Task 166 BE-4: 리그/대회/친선 분류를 **전체 행**에 대해 한 번 구한다 — 필터와
    // `summary.byType` 둘 다 페이지가 아니라 전체를 봐야 한다.
    const { categoryByResultId, tournamentIdByFixtureId, leagueIdByTeamMatchId } =
      await this.classifyRows(eligibleRows);
    const categoryOf = (row: EligibleResultRow): TeamRecordCategory =>
      categoryByResultId.get(row.participantResultId) ?? 'friendly';
    const typedRows =
      query.type === undefined ? eligibleRows : eligibleRows.filter((row) => categoryOf(row) === query.type);

    const cursor = decodeRecordCursor(query.cursor);
    const limit = query.limit ?? 20;

    const ordered = typedRows
      .slice()
      .sort((a, b) => rowCursorOf(b).key.localeCompare(rowCursorOf(a).key) || rowCursorOf(b).id.localeCompare(rowCursorOf(a).id));
    const afterCursor =
      cursor === null ? ordered : ordered.filter((row) => isAfterCursor(rowCursorOf(row), cursor, 'desc'));
    const page = afterCursor.slice(0, limit);
    const hasMore = afterCursor.length > limit;

    const detail = await this.hydrate(page, { tournamentIdByFixtureId, leagueIdByTeamMatchId });

    // 파울 누적치는 공개 응답에 싣지 않는다. 카드(경고/퇴장)는 경기 서사로서
    // 공개하지만, 일반 파울 개수는 선수 개인 프로필에 낙인으로 남을 뿐
    // 관전자에게 주는 정보가 없다. DB(`V1GameResultParticipant.fouls`)와
    // 운영 콘솔의 팀 파울 카운터는 그대로 유지된다.
    const matchMvpCount = eligibleRows.filter((row) => row.isMvp).length;
    // `summary` 는 **필터와 무관하게 전체 기준**이다(팀 전적과 같은 계약) — 화면이
    // 탭을 바꿀 때마다 KPI 를 다시 받지 않고 `byType[탭]` 을 읽는다.
    const totalsOf = (rows: readonly EligibleResultRow[]) => ({
      appearances: rows.length,
      goals: rows.reduce((sum, row) => sum + row.goals, 0),
      assists: rows.reduce((sum, row) => sum + row.assists, 0),
      yellowCards: rows.reduce((sum, row) => sum + row.cardsYellow, 0),
      redCards: rows.reduce((sum, row) => sum + row.cardsRed, 0),
      mvpCount: rows.filter((row) => row.isMvp).length,
    });
    const byType: Record<TeamRecordCategory, ReturnType<typeof totalsOf>> = {
      league: totalsOf(eligibleRows.filter((row) => categoryOf(row) === 'league')),
      tournament: totalsOf(eligibleRows.filter((row) => categoryOf(row) === 'tournament')),
      friendly: totalsOf(eligibleRows.filter((row) => categoryOf(row) === 'friendly')),
    };
    const summary = {
      appearances: eligibleRows.length,
      goals: eligibleRows.reduce((sum, row) => sum + row.goals, 0),
      assists: eligibleRows.reduce((sum, row) => sum + row.assists, 0),
      yellowCards: eligibleRows.reduce((sum, row) => sum + row.cardsYellow, 0),
      redCards: eligibleRows.reduce((sum, row) => sum + row.cardsRed, 0),
      byType,
      matchMvpCount,
      // 구 Web 클라이언트 호환용 별칭. 신규 화면은 matchMvpCount를 사용한다.
      mvpCount: matchMvpCount,
      tournamentAwardCount: tournamentAwards.length,
    };

    const lastRow = page[page.length - 1];
    const nextCursor = hasMore && lastRow !== undefined ? encodeRecordCursor(rowCursorOf(lastRow)) : null;

    return {
      userId: user.id,
      nickname: user.profile?.nickname ?? null,
      viewerIsOwner,
      // 타인이 조회할 땐 이 필드를 아예 싣지 않는다(계약 변경, 아래 참고) -- 본인 조회일
      // 때만 boolean으로 채운다.
      //
      // 원래 계약(task doc)은 이 필드를 항상 내려보내는 것이었다. 검토 결과 items가
      // 비어 있을 때(=REVOKED 스냅샷으로 전부 숨겨졌거나, 아직 대회 라인업에 한 번도
      // 연결된 적이 없거나) consentGranted 값만으로 "이 사용자가 공개 동의를 켰는지"가
      // items 존재 여부와 별개로 드러난다 -- items가 이미 알려주는 정보(공개된 기록이
      // 있는지)와 다른, 새로 새는 신호다. 프론트(`user-records-content.tsx`)도 타인
      // 조회 시 이 값을 전혀 읽지 않으므로(빈 상태 문구가 신원 연결/동의 두 원인을
      // 구분하지 않고 함께 안내) 기능 손실 없이 막을 수 있다.
      ...(viewerIsOwner ? { consentGranted: consent?.state === 'GRANTED' } : {}),
      summary,
      tournamentAwards,
      items: detail,
      nextCursor,
    };
  }

  private async loadTournamentAwards(userId: string, season: string | undefined) {
    const awards = await this.prisma.v1TournamentAward.findMany({
      where: { recipientUserId: userId },
      orderBy: [{ tournament: { scheduledEndAt: 'desc' } }, { sortOrder: 'asc' }],
      select: {
        id: true,
        tournamentId: true,
        awardType: true,
        awardLabel: true,
        iconKey: true,
        teamName: true,
        note: true,
        createdAt: true,
        tournament: {
          select: { title: true, scheduledEndAt: true, updatedAt: true },
        },
      },
    });
    const seasonRange = seasonBounds(season);
    return awards
      .map((award) => {
        const awardedAt = award.tournament.scheduledEndAt ?? award.tournament.updatedAt ?? award.createdAt;
        return {
          id: award.id,
          tournamentId: award.tournamentId,
          tournamentTitle: award.tournament.title,
          awardType: award.awardType,
          awardLabel: award.awardLabel,
          iconKey: award.iconKey,
          teamName: award.teamName,
          note: award.note,
          awardedAt: awardedAt.toISOString(),
        };
      })
      .filter(
        (award) =>
          seasonRange === null ||
          (new Date(award.awardedAt) >= seasonRange.gte && new Date(award.awardedAt) < seasonRange.lt),
      );
  }

  private async loadEligibleRows(
    userId: string,
    season: string | undefined,
    viewerIsOwner: boolean,
  ): Promise<EligibleResultRow[]> {
    const links = await this.prisma.v1ParticipantIdentityLinkCurrent.findMany({
      where: { userId },
      select: { participantId: true },
    });
    if (links.length === 0) return [];
    const participantIds = links.map((link) => link.participantId);

    const eligibility = await loadParticipantConsentEligibility(this.prisma, participantIds);

    const resultRows = await this.prisma.v1GameResultParticipant.findMany({
      where: { participantId: { in: participantIds } },
      select: {
        id: true,
        resultRevisionId: true,
        participantId: true,
        sideId: true,
        started: true,
        minutesPlayed: true,
        goals: true,
        assists: true,
        cards: true,
        goalkeeper: true,
        resultRevision: {
          select: {
            id: true,
            gameId: true,
            officialAt: true,
            mvpParticipantId: true,
            score: true,
            game: {
              select: {
                sourceType: true,
                tournamentFixtureId: true,
                // 리그 맥락은 게임에 직접 실려 있지 않다 -- 팀매치를 거쳐야만 얻어진다
                // (game.teamMatchId -> V1TeamMatch.leagueId -> V1League.title). 팀 전적
                // (`public-team-records.service.ts`)이 쓰는 것과 같은 사슬이다.
                teamMatchId: true,
                currentOfficialRevisionId: true,
              },
            },
          },
        },
      },
    });

    const seasonRange = seasonBounds(season);
    const eligible: EligibleResultRow[] = [];
    for (const row of resultRows) {
      const revision = row.resultRevision;
      const isCurrent = revision.game.currentOfficialRevisionId === revision.id;
      if (!isCurrent || revision.officialAt === null) continue;

      const consent = eligibility.get(row.participantId);
      if (consent === undefined) continue;
      if (viewerIsOwner) {
        // 본인 조회: 사용자 단위 동의(GRANTED)는 우회한다 -- 신원 연결은 그대로 요구하고
        // (이론상 항상 참이다. 위 links 쿼리가 이미 userId로 필터링했으므로), participant
        // 단위 개별 숨김(REVOKED 스냅샷)은 본인이 "이 경기 하나만 숨기겠다"고 명시적으로
        // 끈 것이므로 본인 화면에서도 그대로 존중한다.
        //
        // 이 판정은 `countOwnerVisibleParticipations`("지금 동의를 켜면 공개될 경기 수",
        // 동의 유도 UI 가 쓴다)와 **반드시 같아야** 하므로 조건을 여기 인라인으로 두지
        // 않고 `isParticipantOwnerVisible` 하나를 양쪽이 공유한다.
        if (!isParticipantOwnerVisible(consent)) continue;
      } else if (!isParticipantPubliclyEligible(consent)) {
        continue;
      }

      if (seasonRange && (revision.officialAt < seasonRange.gte || revision.officialAt >= seasonRange.lt)) {
        continue;
      }

      const cards = parseCards(row.cards);
      eligible.push({
        participantResultId: row.id,
        resultRevisionId: revision.id,
        participantId: row.participantId,
        gameId: revision.gameId,
        sourceType: revision.game.sourceType,
        tournamentFixtureId: revision.game.tournamentFixtureId,
        teamMatchId: revision.game.teamMatchId,
        sideId: row.sideId,
        goals: row.goals,
        assists: row.assists,
        cardsYellow: cards.yellow,
        cardsRed: cards.red,
        minutesPlayed: row.minutesPlayed,
        started: row.started,
        goalkeeper: row.goalkeeper,
        officialAt: revision.officialAt,
        isMvp: revision.mvpParticipantId === row.participantId,
        score: parseScore(revision.score),
      });
    }
    return eligible;
  }

  /**
   * 모든 eligible 행을 리그/대회/친선으로 분류한다 (Task 166 BE-4).
   *
   * **페이지가 아니라 전체를 본다.** `?type=` 필터와 `summary.byType` 은 둘 다 사용자의
   * *모든* 기록을 대상으로 해야 한다 — `hydrate` 는 그 페이지의 맥락만 붙이므로 여기에
   * 쓸 수 없다. 조회 두 개(대진 → tournamentId, 팀매치 → leagueId)는 `hydrate` 와 같은
   * "단일 IN 조회" 패턴이다(행마다 조회하면 N+1).
   *
   * 분류 자체는 팀 전적과 **같은 함수**(`classifyTeamRecordCategory`)를 지난다 — 두 화면이
   * 같은 경기를 다르게 부르지 않게 하는 것이 그 함수가 존재하는 이유다.
   */
  private async classifyRows(rows: readonly EligibleResultRow[]): Promise<{
    readonly categoryByResultId: ReadonlyMap<string, TeamRecordCategory>;
    /** `hydrate` 가 **다시 조회하지 않도록** 그대로 넘긴다 — 같은 IN 조회를 두 번 내면
     *  N+1 방지 스펙이 잡는다(실제로 잡혔다). */
    readonly tournamentIdByFixtureId: ReadonlyMap<string, string>;
    readonly leagueIdByTeamMatchId: ReadonlyMap<string, string | null>;
  }> {
    const byResultId = new Map<string, TeamRecordCategory>();
    if (rows.length === 0) {
      return { categoryByResultId: byResultId, tournamentIdByFixtureId: new Map(), leagueIdByTeamMatchId: new Map() };
    }

    const fixtureIds = Array.from(
      new Set(rows.map((row) => row.tournamentFixtureId).filter((id): id is string => id !== null)),
    );
    const teamMatchIds = Array.from(
      new Set(rows.map((row) => row.teamMatchId).filter((id): id is string => id !== null)),
    );
    const [fixtures, teamMatches] = await Promise.all([
      fixtureIds.length === 0
        ? []
        : this.prisma.v1TournamentFixture.findMany({
            where: { id: { in: fixtureIds } },
            select: { id: true, tournamentId: true },
          }),
      teamMatchIds.length === 0
        ? []
        : this.prisma.v1TeamMatch.findMany({
            where: { id: { in: teamMatchIds } },
            select: { id: true, leagueId: true },
          }),
    ]);
    const tournamentIdByFixtureId = new Map(fixtures.map((f) => [f.id, f.tournamentId]));
    const leagueIdByTeamMatchId = new Map(teamMatches.map((t) => [t.id, t.leagueId]));

    for (const row of rows) {
      byResultId.set(
        row.participantResultId,
        classifyTeamRecordCategory({
          tournamentId:
            row.tournamentFixtureId === null
              ? null
              : (tournamentIdByFixtureId.get(row.tournamentFixtureId) ?? null),
          leagueId:
            row.teamMatchId === null ? null : (leagueIdByTeamMatchId.get(row.teamMatchId) ?? null),
        }),
      );
    }
    return { categoryByResultId: byResultId, tournamentIdByFixtureId, leagueIdByTeamMatchId };
  }

  private async hydrate(
    rows: readonly EligibleResultRow[],
    /** `classifyRows` 가 **이미 조회한** 맵. 여기서 다시 조회하면 같은 IN 쿼리가 두 번
     *  나가고 N+1 방지 스펙이 잡는다. `round` 만 이 화면 전용이라 따로 가져온다. */
    prefetched: {
      readonly tournamentIdByFixtureId: ReadonlyMap<string, string>;
      readonly leagueIdByTeamMatchId: ReadonlyMap<string, string | null>;
    },
  ) {
    if (rows.length === 0) return [];

    const gameIds = Array.from(new Set(rows.map((row) => row.gameId)));
    const fixtureIds = Array.from(
      new Set(rows.map((row) => row.tournamentFixtureId).filter((id): id is string => id !== null)),
    );

    const [sides, fixtureRounds] = await Promise.all([
      this.prisma.v1GameSide.findMany({
        where: { gameId: { in: gameIds } },
        select: { id: true, gameId: true, sideKey: true, teamId: true, displayNameSnapshot: true },
      }),
      fixtureIds.length === 0
        ? []
        : this.prisma.v1TournamentFixture.findMany({
            where: { id: { in: fixtureIds } },
            select: { id: true, round: true },
          }),
    ]);
    const fixtures = fixtureRounds.map((row) => ({
      id: row.id,
      round: row.round,
      tournamentId: prefetched.tournamentIdByFixtureId.get(row.id) ?? '',
    }));

    const sidesByGame = new Map<string, typeof sides>();
    for (const side of sides) {
      const list = sidesByGame.get(side.gameId) ?? [];
      list.push(side);
      sidesByGame.set(side.gameId, list);
    }
    const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
    const leagueIdByTeamMatchId = prefetched.leagueIdByTeamMatchId;

    const teamIds = Array.from(
      new Set(sides.map((side) => side.teamId).filter((id): id is string => id !== null)),
    );
    const tournamentIds = Array.from(
      new Set(fixtures.map((fixture) => fixture.tournamentId)),
    );
    const leagueIds = Array.from(
      new Set(Array.from(leagueIdByTeamMatchId.values()).filter((id): id is string => id !== null)),
    );
    const [teams, tournaments, leagues] = await Promise.all([
      teamIds.length === 0
        ? []
        : this.prisma.v1Team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } }),
      tournamentIds.length === 0
        ? []
        : this.prisma.v1Tournament.findMany({ where: { id: { in: tournamentIds } }, select: { id: true, title: true } }),
      leagueIds.length === 0
        ? []
        : this.prisma.v1League.findMany({ where: { id: { in: leagueIds } }, select: { id: true, title: true } }),
    ]);
    const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
    const tournamentTitleById = new Map(tournaments.map((tournament) => [tournament.id, tournament.title]));
    const leagueTitleById = new Map(leagues.map((league) => [league.id, league.title]));

    return rows.map((row) => {
      const gameSides = sidesByGame.get(row.gameId) ?? [];
      const ownSide = gameSides.find((side) => side.id === row.sideId) ?? null;
      const opponentSide = gameSides.find((side) => side.id !== row.sideId) ?? null;
      const fixture = row.tournamentFixtureId === null ? null : (fixtureById.get(row.tournamentFixtureId) ?? null);
      const tournamentId = fixture?.tournamentId ?? null;
      const leagueId = row.teamMatchId === null ? null : (leagueIdByTeamMatchId.get(row.teamMatchId) ?? null);

      let result: 'WON' | 'LOST' | 'DRAWN' | null = null;
      if (row.score !== null && ownSide !== null) {
        const isHome = ownSide.sideKey === 'HOME';
        const own = isHome ? row.score.home : row.score.away;
        const opponent = isHome ? row.score.away : row.score.home;
        // 정규시간이 동점이고 승부차기로 결판난 경기를 개인 전적에서만 '무'로 보여주던
        // 버그를 막는다 -- 팀 전적(GameResultOfficialFactsService)이 쓰는 것과 **같은**
        // 판정 함수를 그대로 호출한다(같은 문장을 두 곳에 따로 적으면 반드시 갈린다).
        result = resolveTeamRecordResult(
          own,
          opponent,
          isHome ? row.score.penalties?.home : row.score.penalties?.away,
          isHome ? row.score.penalties?.away : row.score.penalties?.home,
        );
      }

      return {
        id: row.participantResultId,
        gameId: row.gameId,
        // `type` 이 화면이 읽는 정본 분류다 -- 팀 전적(`public-team-records.service.ts`)과
        // **같은 함수**(`classifyTeamRecordCategory`)를 그대로 호출해 두 화면이 같은
        // 경기를 다르게 부르지 않게 한다(리그 경기가 친선과 뭉뚱그려지던 F6 결함).
        type: classifyTeamRecordCategory({ tournamentId, leagueId }),
        // 구 클라이언트 호환용 별칭 -- 게임의 *소스 타입* 이분법(대회 픽스처/팀매치)일
        // 뿐이라 리그를 구분하지 못한다. 신규 화면은 위 `type` 을 쓴다(같은 파일의
        // `mvpCount` -> `matchMvpCount` 별칭과 같은 이유·같은 방식).
        matchType: row.sourceType === 'TOURNAMENT_FIXTURE' ? ('tournament' as const) : ('team_match' as const),
        tournamentId,
        tournamentTitle: tournamentId === null ? null : (tournamentTitleById.get(tournamentId) ?? null),
        leagueId,
        leagueTitle: leagueId === null ? null : (leagueTitleById.get(leagueId) ?? null),
        round: fixture?.round ?? null,
        teamId: ownSide?.teamId ?? null,
        teamName: ownSide ? (ownSide.teamId ? (teamNameById.get(ownSide.teamId) ?? null) : ownSide.displayNameSnapshot) : null,
        opponentTeamId: opponentSide?.teamId ?? null,
        opponentTeamName: opponentSide
          ? (opponentSide.teamId ? (teamNameById.get(opponentSide.teamId) ?? null) : opponentSide.displayNameSnapshot)
          : null,
        result,
        goals: row.goals,
        cards: { yellow: row.cardsYellow, red: row.cardsRed },
        minutesPlayed: row.minutesPlayed,
        started: row.started,
        goalkeeper: row.goalkeeper,
        mvp: row.isMvp,
        officialAt: row.officialAt.toISOString(),
      };
    });
  }
}

function rowCursorOf(row: EligibleResultRow): RecordCursor {
  return { key: row.officialAt.toISOString(), id: row.resultRevisionId };
}

function parseCards(value: Prisma.JsonValue): { yellow: number; red: number } {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { yellow?: unknown }).yellow === 'number' &&
    typeof (value as { red?: unknown }).red === 'number'
  ) {
    return { yellow: (value as { yellow: number }).yellow, red: (value as { red: number }).red };
  }
  return { yellow: 0, red: 0 };
}

/**
 * `v1_game_result_revisions.score`는 두 형태가 공존한다 -- 평평한
 * `{ home, away, penalties? }`와 레거시 백필이 남긴 중첩
 * `{ regulation, penalty? }`. 여기서 따로 파서를 두면 팀 전적
 * (`public-team-records.service.ts`)·대회 화면과 또 갈라지므로, 이미 두 형태를
 * 함께 읽도록 검증된 단일 파서를 그대로 재사용한다.
 */
function parseScore(
  value: Prisma.JsonValue,
): { home: number; away: number; penalties?: { home: number; away: number } } | null {
  const score = parseTournamentFixtureOfficialScore(value);
  if (score === null) return null;
  const penalties =
    score.homePenaltyScore === null || score.awayPenaltyScore === null
      ? undefined
      : { home: score.homePenaltyScore, away: score.awayPenaltyScore };
  return {
    home: score.homeScore,
    away: score.awayScore,
    ...(penalties === undefined ? {} : { penalties }),
  };
}

function seasonBounds(season: string | undefined): { readonly gte: Date; readonly lt: Date } | null {
  if (season === undefined) return null;
  const year = Number.parseInt(season, 10);
  return {
    gte: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    lt: new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)),
  };
}
