import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { V1VisibilityMode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isMinuteUnknown,
  isPeriodUnknown,
  parseTournamentFixtureRevisionGoals,
  parseTournamentFixtureOfficialScore,
  resolveGoalDisplaySideId,
} from '../../tournaments/tournament-fixture-official-result';
import { TeamRecordsQueryDto } from './dto/public-records-query.dto';
import { decodeRecordCursor, encodeRecordCursor, type RecordCursor } from './public-cursor';
import { loadParticipantConsentEligibility, type ParticipantConsentEligibility } from './public-consent';
import { effectivePublicVisibilityMode } from './public-visibility';
import {
  byUnknownLast,
  isTournamentParticipantNameGatingReverted,
  loadParticipantNameProfiles,
  parseCardColor,
  resolveParticipantDisplayName,
  resolveParticipantNameEligible,
  resolveParticipantProfileHref,
} from './participant-name-gating';
import { classifyTeamRecordCategory, type TeamRecordCategory } from './team-record-category';

type GameSideRow = { readonly id: string; readonly sideKey: 'HOME' | 'AWAY'; readonly teamId: string | null };
type GameParticipantRow = {
  readonly id: string;
  readonly sideId: string;
  readonly userId: string | null;
  readonly displayNameSnapshot: string;
  readonly jerseyNumber: number | null;
};

interface TeamRecordFactRow {
  readonly id: string;
  readonly revisionId: string;
  readonly gameId: string;
  readonly opponentTeamId: string | null;
  readonly tournamentId: string | null;
  readonly result: string;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly playedAt: Date;
  readonly resultRevision: {
    readonly score: Prisma.JsonValue;
    readonly goalEvents: Prisma.JsonValue | null;
    readonly game: {
      readonly currentOfficialRevisionId: string | null;
      readonly teamMatchId: string | null;
      readonly sides: readonly GameSideRow[];
      readonly participants: readonly GameParticipantRow[];
      /** finding #40 -- 정책 row 가 없는 경기는 fail-closed 로 hidden 취급한다 (형제 서비스와 동일). */
      readonly visibilityPolicy: { readonly mode: V1VisibilityMode } | null;
    };
  };
}

/** 승부차기까지 간 경기만 채워지는 팀 관점 페널티 스코어 -- 없었던 경기는 항상 null. */
type TeamPenalties = { readonly for: number; readonly against: number };

/** 팀 전적 한 건에 실리는 골/카드 이벤트 -- 시간순(period asc, clockMs asc) 정렬. */
type TeamRecordEventRow = {
  readonly id: string;
  readonly type: 'GOAL' | 'OWN_GOAL' | 'CARD';
  readonly side: 'own' | 'opponent';
  readonly participantName: string | null;
  readonly jerseyNumber: number | null;
  /** 공개 프로필 경로 -- 열어도 되는지까지 서버가 판단한 값(`resolveParticipantProfileHref`). */
  readonly profileHref: string | null;
  readonly period: number | null;
  readonly clockMs: number | null;
  readonly cardColor: 'YELLOW' | 'RED' | null;
};

/**
 * Task 24 -- `GET /teams/:id/records`. Team aggregates never need consent
 * gating (D-03: "unlinked guest contributes only team aggregates" -- i.e.
 * team-level facts are always public regardless of any player's link/consent
 * state); the only privacy-shaped rule here is the same "only the game's
 * *current* official revision counts" rule the void-projection comment
 * documents, so a corrected or voided result is never double-counted or
 * shown stale.
 *
 * `penalties`/`events`는 대회 경기 기록(`public-tournament-records.service.ts`)이
 * 이미 검증한 규칙을 그대로 재사용한다 -- 이름 게이팅이 갈리면 팀 전적에서만
 * 실명이 더 노출되는 개인정보 사고가 되므로, 판정 함수 자체를
 * `./participant-name-gating`에서 공유한다(D-03의 "팀 집계는 동의 무관하게
 * 공개"와는 별개 축: 그건 goalsFor/goalsAgainst 같은 *집계 숫자*에만 적용되고,
 * *득점자 실명*은 대회 기록과 동일하게 게이팅된다).
 *
 * **감사 finding #40 수정**: 위 문단은 원래 "이 화면의 유일한 프라이버시 규칙은
 * 현재 공식 리비전 규칙뿐"이라고 적어 D-06(`V1GameVisibilityPolicy` ->
 * `effectivePublicVisibilityMode`) 게이팅을 아예 빠뜨리고 있었다. 형제 서비스
 * (`public-tournament-records.service.ts`의 `getMatch`/`getLeagueFixtureRecord`)는
 * 이 게이팅을 항상 적용한다 -- `mode==='hidden'`이면 그 경기를 목록/집계에서
 * 완전히 제외하고, `mode==='status_only'`면 스코어·승부차기·이벤트만 가리고
 * 팀명/일자 같은 lifecycle 정보는 그대로 남긴다. 이 파일도 동일 규칙을
 * `rowVisibilityMode`(아래)로 통일한다.
 */
@Injectable()
export class PublicTeamRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRecords(teamId: string, query: TeamRecordsQueryDto) {
    const team = await this.prisma.v1Team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true, profile: { select: { logoUrl: true } } },
    });
    if (team === null) {
      throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: 'Team was not found' });
    }

    const limit = query.limit ?? 20;
    const cursor = decodeRecordCursor(query.cursor);
    const seasonRange = seasonBounds(query.season);

    // finding #40: mode 계산은 페이지 쿼리보다 먼저 필요하다 -- `fetchSummary`의
    // raw SQL 집계가 hidden/status_only 경기를 승-무-패·득실 합산에서 빼야 하므로
    // (랭킹 필터와 동일 이유, participant-name-gating 문서 참고) 그 쿼리에도
    // `publicLiveEnabled`를 넘겨야 한다.
    const publicLiveEnabled = await this.isPublicLiveEnabled();

    // 집계(summary/byType)는 `type` 필터와 무관하게 항상 전체 기준이다 -- 필터는
    // items 목록에만 적용된다(과제 지시: "페이지네이션과 집계를 섞지 마라"). 종류별
    // 뱃지·탭을 동시에 보여주려면 요약이 필터에 따라 흔들리면 안 된다.
    //
    // `availableSeasons`도 같은 이유로 `season`/`type` 둘 다와 무관하게 항상 팀
    // 전체 기준이다 -- 한 시즌을 고른 상태에서 드롭다운을 다시 열어도 선택지 자체가
    // 줄어들면 안 된다(그 시즌만 있는 것처럼 보이는 함정).
    const [rawFacts, summary, availableSeasons] = await Promise.all([
      this.fetchRawFacts(teamId, limit, cursor, seasonRange, query.type),
      this.fetchSummary(teamId, seasonRange, publicLiveEnabled),
      this.fetchAvailableSeasons(teamId),
    ]);

    const hasMore = rawFacts.length > limit;
    const pageRows = rawFacts.slice(0, limit);
    const currentRows = pageRows.filter(
      (row) => row.resultRevision.game.currentOfficialRevisionId === row.revisionId,
    );

    // finding #40: 형제 공개 라우트(public-tournament-records.service.ts)와 동일한
    // hidden -> status_only -> live/official_only 우선순위(D-06). 정책 row 가
    // 없으면 fail-closed 로 'HIDDEN' 취급한다(`effectivePublicVisibilityMode`).
    const rowVisibilityMode = (row: TeamRecordFactRow) =>
      effectivePublicVisibilityMode(row.resultRevision.game.visibilityPolicy?.mode ?? 'HIDDEN', publicLiveEnabled);
    // hidden 경기는 존재 자체를 숨긴다 -- 목록에서 완전히 제외.
    const visibleRows = currentRows.filter((row) => rowVisibilityMode(row) !== 'hidden');
    // status_only 경기는 팀명/일자 같은 lifecycle 정보는 보여주되 스코어·이벤트는
    // 가린다 -- 아래 events 배치 조회 대상에서부터 제외해 애초에 이벤트가 만들어지지
    // 않게 한다(형제 서비스의 `mode === 'status_only' ? [] : buildEvents(...)`와 동일).
    const scoredRows = visibleRows.filter((row) => rowVisibilityMode(row) !== 'status_only');

    const opponentTeamIds = Array.from(
      new Set(visibleRows.map((row) => row.opponentTeamId).filter((id): id is string => id !== null)),
    );
    const tournamentIds = Array.from(
      new Set(visibleRows.map((row) => row.tournamentId).filter((id): id is string => id !== null)),
    );
    const teamMatchIds = Array.from(
      new Set(
        visibleRows
          .map((row) => row.resultRevision.game.teamMatchId)
          .filter((id): id is string => id !== null),
      ),
    );
    const [opponentTeams, tournaments, teamMatches, eventsByGameId] = await Promise.all([
      opponentTeamIds.length === 0
        ? []
        : this.prisma.v1Team.findMany({
            where: { id: { in: opponentTeamIds } },
            select: { id: true, name: true, profile: { select: { logoUrl: true } } },
          }),
      tournamentIds.length === 0
        ? []
        : this.prisma.v1Tournament.findMany({ where: { id: { in: tournamentIds } }, select: { id: true, title: true } }),
      // 리그 맥락(leagueId/leagueTitle)은 tournamentId 처럼 fact 에 직접 실려 있지
      // 않는다 -- 팀매치를 거쳐야만 얻어진다(game.teamMatchId -> V1TeamMatch.leagueId).
      // tournamentId 조회와 같은 "단일 IN 조회로 제목을 붙이는" 패턴을 그대로
      // 따르되, 이쪽은 leagueId 를 얻기 위한 조회가 한 단계 더 필요하다(아래 leagues).
      teamMatchIds.length === 0
        ? []
        : this.prisma.v1TeamMatch.findMany({
            where: { id: { in: teamMatchIds } },
            select: { id: true, leagueId: true },
          }),
      this.loadEvents(scoredRows, teamId),
    ]);
    const opponentNameById = new Map(opponentTeams.map((row) => [row.id, row.name]));
    const opponentLogoById = new Map(opponentTeams.map((row) => [row.id, row.profile?.logoUrl ?? null]));
    const tournamentTitleById = new Map(tournaments.map((row) => [row.id, row.title]));
    const leagueIdByTeamMatchId = new Map(teamMatches.map((row) => [row.id, row.leagueId]));
    const leagueIds = Array.from(
      new Set(Array.from(leagueIdByTeamMatchId.values()).filter((id): id is string => id !== null)),
    );
    const leagues =
      leagueIds.length === 0
        ? []
        : await this.prisma.v1League.findMany({ where: { id: { in: leagueIds } }, select: { id: true, title: true } });
    const leagueTitleById = new Map(leagues.map((row) => [row.id, row.title]));

    const items = visibleRows.map((row) => {
      const teamMatchId = row.resultRevision.game.teamMatchId;
      const leagueId = teamMatchId === null ? null : (leagueIdByTeamMatchId.get(teamMatchId) ?? null);
      // finding #40: status_only 는 이 경기가 있었다는 사실(팀명·대회·일자)은 보여주되
      // 스코어·승부차기·이벤트는 형제 서비스의 `getMatch`(mode==='status_only' ? null : ...)
      // 와 동일하게 가린다.
      const isStatusOnly = rowVisibilityMode(row) === 'status_only';
      return {
        gameId: row.gameId,
        // exactly-one-source: a game is either tournament-sourced (tournamentId set) or
        // team-match-sourced (teamMatchId set), never both -- see V1Game's CHECK constraint.
        teamMatchId,
        tournamentId: row.tournamentId,
        tournamentTitle: row.tournamentId === null ? null : (tournamentTitleById.get(row.tournamentId) ?? null),
        leagueId,
        leagueTitle: leagueId === null ? null : (leagueTitleById.get(leagueId) ?? null),
        type: classifyTeamRecordCategory({ tournamentId: row.tournamentId, leagueId }),
        opponentTeamId: row.opponentTeamId,
        opponentTeamName: row.opponentTeamId === null ? null : (opponentNameById.get(row.opponentTeamId) ?? null),
        opponentTeamLogoUrl: row.opponentTeamId === null ? null : (opponentLogoById.get(row.opponentTeamId) ?? null),
        result: isStatusOnly ? null : row.result,
        // 정규시간 스코어 그대로 -- 승부차기로 덮어쓰지 않는다(계약). 승부차기는 아래
        // penalties 필드에서 별도로 실린다.
        goalsFor: isStatusOnly ? null : row.goalsFor,
        goalsAgainst: isStatusOnly ? null : row.goalsAgainst,
        penalties: isStatusOnly
          ? null
          : resolveTeamPenalties(row.resultRevision.score, row.resultRevision.game.sides, teamId),
        events: isStatusOnly ? [] : (eventsByGameId.get(row.gameId) ?? []),
        playedAt: row.playedAt.toISOString(),
      };
    });

    const lastPageRow = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && lastPageRow !== undefined
        ? encodeRecordCursor({ key: lastPageRow.playedAt.toISOString(), id: lastPageRow.id })
        : null;

    return {
      teamId: team.id,
      teamName: team.name,
      teamLogoUrl: team.profile?.logoUrl ?? null,
      summary,
      availableSeasons,
      items,
      nextCursor,
    };
  }

  /**
   * 시즌 드롭다운의 선택지 소스 -- 팀에 공식 경기가 있었던 연도(`playedAt` 4자리 연도)만,
   * 하드코딩 없이 실데이터 기준으로 내려준다. `fetchSummary`/`fetchRawFacts`와 동일하게
   * "그 게임의 현재 공식 리비전"만 센다(취소·구버전 리비전은 시즌 목록에 유령 연도를
   * 남기지 않는다). 내림차순(최신 시즌 먼저) -- 드롭다운 첫 항목이 최근 시즌이 되도록.
   */
  private async fetchAvailableSeasons(teamId: string): Promise<readonly string[]> {
    // finding #21: `played_at`(TIMESTAMP(3), without time zone)에는 UTC 벽시계 값이
    // 그대로 저장된다. 화면(`formatTournamentDateShort`)은 브라우저 로컬(KST)로
    // 날짜를 렌더하므로, 연도 집계도 KST 캘린더 연도 기준이어야 화면에서 보는
    // 날짜와 시즌 드롭다운이 어긋나지 않는다. `AT TIME ZONE 'UTC'`로 저장된 값을
    // 먼저 진짜 UTC 인스턴트로 인식시킨 뒤 `AT TIME ZONE 'Asia/Seoul'`로 KST
    // 벽시계 값으로 변환한다(Postgres의 이중 AT TIME ZONE 관용구).
    const rows = await this.prisma.$queryRaw<{ readonly season: string }[]>(Prisma.sql`
      SELECT DISTINCT to_char(trf.played_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul', 'YYYY') AS season
      FROM v1_team_record_facts trf
      INNER JOIN v1_games g ON g.id = trf.game_id AND g.current_official_revision_id = trf.revision_id
      -- 목록 본문은 hidden 경기를 통째로 빼는데(위 visibleRows) 시즌 후보만 빼지 않으면,
      -- 그 해 경기가 전부 hidden 인 시즌이 드롭다운에 남아 "고르면 빈 목록"이 된다 —
      -- 숨긴 경기의 존재 자체를 드러내는 간접 노출이다. 정책 row 가 없는 경기는
      -- effectivePublicVisibilityMode 와 같은 기준으로 fail-closed(=hidden) 취급해야
      -- 하므로 INNER JOIN 이고, 미래에 enum 값이 추가돼도 새 값이 조용히 노출되지
      -- 않도록 부정(<> 'HIDDEN')이 아니라 허용 목록으로 적는다.
      INNER JOIN v1_game_visibility_policies vp
        ON vp.game_id = g.id
       AND vp.mode IN ('LIVE', 'STATUS_ONLY', 'OFFICIAL_ONLY')
      WHERE trf.team_id = ${teamId}
      ORDER BY season DESC
    `);
    return rows.map((row) => row.season);
  }

  private async fetchRawFacts(
    teamId: string,
    limit: number,
    cursor: RecordCursor | null,
    seasonRange: { readonly gte: Date; readonly lt: Date } | null,
    typeFilter: TeamRecordCategory | undefined,
  ): Promise<TeamRecordFactRow[]> {
    type PageKeyRow = { readonly id: string; readonly playedAt: Date };
    const seasonSql = seasonRange
      ? Prisma.sql`AND trf.played_at >= ${seasonRange.gte} AND trf.played_at < ${seasonRange.lt}`
      : Prisma.empty;
    const cursorSql = cursor
      ? Prisma.sql`AND (trf.played_at < ${new Date(cursor.key)} OR (trf.played_at = ${new Date(cursor.key)} AND trf.id < ${cursor.id}))`
      : Prisma.empty;
    // `tm`(v1_team_matches) 은 leagueId 판정에만 쓴다 -- tournamentId 는 이미
    // trf 자체 컬럼이라 조인이 필요 없다. `classifyTeamRecordCategory` 와 동일한
    // 우선순위(tournamentId 우선)를 SQL에서도 그대로 지킨다.
    const typeSql =
      typeFilter === undefined
        ? Prisma.empty
        : typeFilter === 'tournament'
          ? Prisma.sql`AND trf.tournament_id IS NOT NULL`
          : typeFilter === 'league'
            ? Prisma.sql`AND trf.tournament_id IS NULL AND tm.league_id IS NOT NULL`
            : Prisma.sql`AND trf.tournament_id IS NULL AND tm.league_id IS NULL`;
    const pageKeys = await this.prisma.$queryRaw<PageKeyRow[]>(Prisma.sql`
      SELECT trf.id, trf.played_at AS "playedAt"
      FROM v1_team_record_facts trf
      INNER JOIN v1_games game
        ON game.id = trf.game_id
       AND game.current_official_revision_id = trf.revision_id
      LEFT JOIN v1_team_matches tm ON tm.id = game.team_match_id
      WHERE trf.team_id = ${teamId}
      ${seasonSql}
      ${cursorSql}
      ${typeSql}
      ORDER BY trf.played_at DESC, trf.id DESC
      LIMIT ${limit + 1}
    `);
    if (pageKeys.length === 0) return [];

    const rows = await this.prisma.v1TeamRecordFact.findMany({
      where: { id: { in: pageKeys.map(({ id }) => id) } },
      select: {
        id: true,
        revisionId: true,
        gameId: true,
        opponentTeamId: true,
        tournamentId: true,
        result: true,
        goalsFor: true,
        goalsAgainst: true,
        playedAt: true,
        resultRevision: {
          select: {
            score: true,
            goalEvents: true,
            game: {
              select: {
                currentOfficialRevisionId: true,
                teamMatchId: true,
                // 승부차기(penalties)의 home/away를 이 팀 관점 for/against로 뒤집으려면
                // 이 경기에서 이 팀이 home/away 어느 쪽이었는지가 필요하다 -- 이벤트
                // 요약의 own/opponent 판정도 같은 sides를 재사용한다(loadEvents).
                sides: { select: { id: true, sideKey: true, teamId: true } },
                // 이벤트 요약(loadEvents)이 이름/등번호를 붙이는 데 쓴다 -- 이미 같은
                // 메인 쿼리로 불러오므로 gameId별 추가 조회가 필요 없다(N+1 금지).
                participants: { select: { id: true, sideId: true, userId: true, displayNameSnapshot: true, jerseyNumber: true } },
                // finding #40: 공개 표면 게이팅(D-06) -- 형제 서비스와 동일하게
                // 이 경기가 hidden/status_only 인지 판정하는 데 쓴다.
                visibilityPolicy: { select: { mode: true } },
              },
            },
          },
        },
      },
    });
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const orderedRows: TeamRecordFactRow[] = [];
    for (const { id } of pageKeys) {
      const row = rowById.get(id);
      if (row !== undefined) orderedRows.push(row);
    }
    return orderedRows;
  }

  /**
   * 페이지에 실린 gameId 전부를 한 번의 배치 쿼리로 읽는다(N+1 금지) --
   * `public-tournament-records.service.ts`의 `buildEvents`/`loadScheduleEvents`와
   * 동일한 패턴: CORRECTION으로 취소된 이벤트는 `reversesEventId`로 걸러내고,
   * GOAL/CARD만 남기고, 백필이 남긴 "모른다" 표식(`isPeriodUnknown`/`isMinuteUnknown`)을
   * null로 접은 뒤 `byUnknownLast`로 정렬한다.
   *
   * 이름 게이팅은 대회 기록과 완전히 동일해야 한다(`resolveParticipantNameEligible`/
   * `resolveParticipantDisplayName` 공유) -- 팀 전적 화면엔 스태프 우회 개념이 없으므로
   * `isStaffBypass`는 항상 false다(일정 카드 득점자 요약과 동일한 이유).
   */
  private async loadEvents(
    currentRows: readonly TeamRecordFactRow[],
    teamId: string,
  ): Promise<ReadonlyMap<string, readonly TeamRecordEventRow[]>> {
    const gameIds = Array.from(new Set(currentRows.map((row) => row.gameId)));
    if (gameIds.length === 0) return new Map();

    const events = await this.prisma.v1GameEvent.findMany({
      // 화면에 그리는 건 GOAL/CARD 뿐이지만 취소 이벤트도 함께 읽어야 한다 -- 아래
      // `reversedIds` 가 그 `reversesEventId` 로 취소된 골·카드를 걸러내기 때문에,
      // 타입만으로 좁히면 취소 사실 자체가 사라져 이미 취소된 골이 되살아난다.
      // 타입을 열거(CORRECTION)하는 대신 `reversesEventId` 유무로 잡는 건
      // `public-tournament-records.service.ts` 의 같은 쿼리들과 맞춘 것이다 -- 취소가
      // 어떤 타입으로 기록되든 걸린다. PERIOD_START/FOUL/SUBSTITUTION 등은 이 단계에서
      // 아예 읽지 않는다(페이지 단위로 여러 경기를 한 번에 읽으므로 payload 까지 딸려온다).
      where: {
        gameId: { in: gameIds },
        OR: [{ type: { in: ['GOAL', 'OWN_GOAL', 'CARD'] } }, { reversesEventId: { not: null } }],
      },
      orderBy: [{ period: 'asc' }, { clockMs: 'asc' }, { sequence: 'asc' }],
      select: {
        id: true,
        gameId: true,
        type: true,
        sideId: true,
        participantId: true,
        payload: true,
        period: true,
        clockMs: true,
        reversesEventId: true,
      },
    });
    const reversedIds = new Set(
      events.map((event) => event.reversesEventId).filter((id): id is string => id !== null),
    );
    const eventsByGame = new Map<string, typeof events>();
    for (const event of events) {
      if (event.type !== 'GOAL' && event.type !== 'OWN_GOAL' && event.type !== 'CARD') continue;
      if (reversedIds.has(event.id)) continue;
      const list = eventsByGame.get(event.gameId) ?? [];
      list.push(event);
      eventsByGame.set(event.gameId, list);
    }

    // 공식 리비전의 goalEvents(JSON) 는 `V1GameEvent` 행이 아니다 -- 백필된 골은 그쪽에만
    // 있다. 아래 렌더 루프가 그 participantId 로도 `consentMap` 을 조회하므로, 여기서 함께
    // 모으지 않으면 그런 골에는 `profileHref` 가 영영 붙지 않는다(Copilot 리뷰 지적).
    // 이름 게이팅에서는 이 구멍이 드러나지 않았다 -- 정책 공개 기본값에서
    // `resolveParticipantNameEligible` 이 consent 를 보지 않고 항상 true 를 돌려주기 때문에,
    // 프로필 링크가 처음으로 이 경로를 실제로 사용하게 됐다.
    //
    // 파싱 결과를 Map 에 담아 아래 루프가 재사용한다 -- 같은 JSON 을 두 번 파싱하지 않는다.
    const revisionGoalsByGameId = new Map(
      currentRows.map((row) => [row.gameId, parseTournamentFixtureRevisionGoals(row.resultRevision.goalEvents)] as const),
    );
    const scorerParticipantIds = [
      ...Array.from(eventsByGame.values())
        .flat()
        .map((event) => event.participantId),
      ...Array.from(revisionGoalsByGameId.values()).flatMap((goals) =>
        (goals ?? []).map((goal) => goal.participantId),
      ),
    ].filter((id): id is string => id !== null);
    // **항상 조회한다.** 이름 게이팅(되돌린 상태에서만 동작)에는 쓰이지 않지만, 프로필
    // 링크(`resolveParticipantProfileHref`)는 정책 공개 기본값에서도 동의를 확인해야 하기
    // 때문이다 -- 게이팅 플래그로 감싸 두면 기본 운영 설정에서 이 맵이 비어 `profileHref`
    // 가 항상 null 이 된다(#707 에서 getMatch 가 바로 그 결함으로 리뷰에 걸렸다).
    // 이 화면은 관전자 폴링 경로가 아니라(`usePublicTeamRecords` 에 refetchInterval 없음)
    // 매 요청 조회 비용도 문제되지 않는다 -- 폴링되는 일정 카드가 이 맵을 여전히 게이팅
    // 뒤에 두는 이유와 대비된다.
    const consentMap = await loadParticipantConsentEligibility(this.prisma, scorerParticipantIds);
    const nameProfileByUserId = await loadParticipantNameProfiles(
      this.prisma,
      currentRows.flatMap((row) => row.resultRevision.game.participants.map((participant) => participant.userId)),
    );

    const result = new Map<string, TeamRecordEventRow[]>();
    for (const row of currentRows) {
      const sides = row.resultRevision.game.sides;
      const ownSideKey = sides.find((side) => side.teamId === teamId)?.sideKey ?? null;
      const sideKeyBySideId = new Map(sides.map((side) => [side.id, side.sideKey] as const));
      const participantById = new Map(
        row.resultRevision.game.participants.map((participant) => [participant.id, participant] as const),
      );
      const participantSideIdById = new Map(
        row.resultRevision.game.participants.map((participant) => [participant.id, participant.sideId] as const),
      );

      const revisionGoals = revisionGoalsByGameId.get(row.gameId) ?? null;
      const rows = (eventsByGame.get(row.gameId) ?? [])
        .filter((event) => revisionGoals === null || event.type === 'CARD')
        .map((event) => {
          const consent = event.participantId === null ? undefined : consentMap.get(event.participantId);
          const eligible = resolveParticipantNameEligible(false, consent);
          const participant = event.participantId === null ? undefined : participantById.get(event.participantId);
          const displaySideId = resolveGoalDisplaySideId(
            event.sideId ?? '',
            event.participantId,
            event.type === 'OWN_GOAL',
            participantSideIdById,
          );
          const eventSideKey = sideKeyBySideId.get(displaySideId) ?? null;
          return {
            id: event.id,
            type:
              event.type === 'CARD'
                ? ('CARD' as const)
                : event.type === 'OWN_GOAL'
                  ? ('OWN_GOAL' as const)
                  : ('GOAL' as const),
            // sideId/ownSideKey가 둘 다 nullable 방어(스키마상 GOAL/CARD엔 항상 붙지만) --
            // 알 수 없으면 이 팀 소속으로 잘못 세지 않도록 보수적으로 'opponent'로 접는다
            // (buildEvents의 side fail-safe와 동일한 원칙).
            side: (eventSideKey !== null && eventSideKey === ownSideKey ? 'own' : 'opponent') as 'own' | 'opponent',
            participantName: eligible ? resolveParticipantDisplayName(participant, nameProfileByUserId) : null,
            jerseyNumber: eligible ? (participant?.jerseyNumber ?? null) : null,
            // 이름이 보일 때만 링크를 건다 -- '비공개 선수'에 링크를 걸면 안 된다.
            profileHref: eligible ? resolveParticipantProfileHref(participant?.userId ?? null, consent) : null,
            period: isPeriodUnknown(event.payload) ? null : event.period,
            clockMs: isMinuteUnknown(event.payload) ? null : event.clockMs,
            cardColor: event.type === 'CARD' ? parseCardColor(event.payload) : null,
          };
        })
        .sort(byUnknownLast);
      if (revisionGoals !== null) {
        rows.push(
          ...revisionGoals.map((event) => {
            const consent =
              event.participantId === null ? undefined : consentMap.get(event.participantId);
            const eligible = resolveParticipantNameEligible(false, consent);
            const participant =
              event.participantId === null ? undefined : participantById.get(event.participantId);
            const displaySideId = resolveGoalDisplaySideId(
              event.sideId,
              event.participantId,
              event.ownGoal,
              participantSideIdById,
            );
            const eventSideKey = sideKeyBySideId.get(displaySideId) ?? null;
            return {
              id: event.id,
              type: event.ownGoal ? ('OWN_GOAL' as const) : ('GOAL' as const),
              side: (eventSideKey !== null && eventSideKey === ownSideKey
                ? 'own'
                : 'opponent') as 'own' | 'opponent',
              participantName: eligible
                ? resolveParticipantDisplayName(participant, nameProfileByUserId)
                : null,
              jerseyNumber: eligible ? (participant?.jerseyNumber ?? null) : null,
              profileHref: eligible ? resolveParticipantProfileHref(participant?.userId ?? null, consent) : null,
              period: event.period,
              clockMs: event.minute === null ? null : event.minute * 60000,
              cardColor: null,
            };
          }),
        );
        rows.sort(byUnknownLast);
      }
      result.set(row.gameId, rows);
    }
    return result;
  }

  /**
   * 전체 요약 + 종류별(리그/대회/친선) 구간 집계를 **한 번의 GROUP BY 쿼리**로 얻는다.
   * 페이지(limit/cursor)와는 완전히 무관하다 -- season 필터만 적용되고, 나머지는
   * 팀의 전체 전적 기준이다(과제 지시: "집계는 페이지가 아니라 전체 기준이어야 한다").
   * overall 은 별도 쿼리를 새로 만들지 않고 category 행들을 합산해서 얻는다 -- 두
   * 쿼리가 서로 다른 값을 낼 여지 자체를 없앤다.
   */
  private async fetchSummary(
    teamId: string,
    seasonRange: { readonly gte: Date; readonly lt: Date } | null,
    publicLiveEnabled: boolean,
  ): Promise<{
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    byType: Record<TeamRecordCategory, TeamRecordSummaryTotals>;
  }> {
    type CategorySummaryRow = TeamRecordSummaryTotals & { category: TeamRecordCategory };
    const seasonSql = seasonRange
      ? Prisma.sql`AND trf.played_at >= ${seasonRange.gte} AND trf.played_at < ${seasonRange.lt}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<CategorySummaryRow[]>(Prisma.sql`
      SELECT
        CASE
          WHEN trf.tournament_id IS NOT NULL THEN 'tournament'
          WHEN tm.league_id IS NOT NULL THEN 'league'
          ELSE 'friendly'
        END AS category,
        COUNT(*)::int AS played,
        COUNT(*) FILTER (WHERE trf.result = 'WON')::int AS won,
        COUNT(*) FILTER (WHERE trf.result = 'DRAWN')::int AS drawn,
        COUNT(*) FILTER (WHERE trf.result = 'LOST')::int AS lost,
        COALESCE(SUM(trf.goals_for), 0)::int AS "goalsFor",
        COALESCE(SUM(trf.goals_against), 0)::int AS "goalsAgainst"
      FROM v1_team_record_facts trf
      INNER JOIN v1_games g ON g.id = trf.game_id AND g.current_official_revision_id = trf.revision_id
      -- finding #40: 랭킹 필터(getPlayerRecords, 241-250줄)와 동일한 규칙 --
      -- hidden(정책 row 없음 포함, fail-closed)·status_only 경기는 승-무-패·득실
      -- 합산에서도 빼야 한다. 그 값 자체가 숨긴 경기의 결과를 간접 노출하기 때문.
      INNER JOIN v1_game_visibility_policies vp ON vp.game_id = g.id
      LEFT JOIN v1_team_matches tm ON tm.id = g.team_match_id
      WHERE trf.team_id = ${teamId}
      ${seasonSql}
      AND (vp.mode = 'OFFICIAL_ONLY' OR (vp.mode = 'LIVE' AND ${publicLiveEnabled}))
      GROUP BY category
    `);

    const zero: TeamRecordSummaryTotals = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
    const byType: Record<TeamRecordCategory, TeamRecordSummaryTotals> = {
      league: { ...zero },
      tournament: { ...zero },
      friendly: { ...zero },
    };
    const overall: { -readonly [K in keyof TeamRecordSummaryTotals]: number } = { ...zero };
    for (const row of rows) {
      const totals: TeamRecordSummaryTotals = {
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
      };
      byType[row.category] = totals;
      overall.played += totals.played;
      overall.won += totals.won;
      overall.drawn += totals.drawn;
      overall.lost += totals.lost;
      overall.goalsFor += totals.goalsFor;
      overall.goalsAgainst += totals.goalsAgainst;
    }

    return { ...overall, byType };
  }

  /**
   * finding #40: D-06 게이팅의 런타임 축(`PUBLIC_LIVE` 운영 킬스위치) --
   * `public-tournament-records.service.ts`의 동일 이름 private 메서드와 완전히
   * 같은 조회다. 플래그 row 가 없으면(마이그레이션에 seed 가 없다) fail-closed 로
   * off 취급한다 -- `effectivePublicVisibilityMode`가 그 경우 LIVE 를 status_only 로
   * 강등시킨다. 두 서비스가 공유 가능한 헬퍼로 뽑혀 있지 않은 이유는 이 배치의
   * 수정 범위가 이 파일 하나로 한정돼 있기 때문(needsOwnerElsewhere 참고) --
   * `public-visibility.ts`에 옮기는 리팩터는 별도 후속 작업이다.
   */
  private async isPublicLiveEnabled(): Promise<boolean> {
    const flag = await this.prisma.v1GameOperationFlag.findUnique({
      where: { key: 'PUBLIC_LIVE' },
      select: { value: true },
    });
    return flag?.value === 'on';
  }
}

/** `fetchSummary`의 승-무-패-득실 한 구간. 전체 요약과 `byType`의 각 항목이 공유하는 모양. */
type TeamRecordSummaryTotals = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
};

/**
 * `resultRevision.score`(정규시간 + 선택적 승부차기)를 이 팀 관점 for/against로
 * 뒤집는다. `v1_game_result_revisions.score`에는 서로 다른 두 형태가 공존한다 —
 * 평평한 형태는 `penalties`(복수), 레거시 백필이 남긴 중첩 형태는 `penalty`(단수,
 * `regulation`의 형제 필드). `parseTournamentFixtureOfficialScore`
 * (`tournaments/tournament-fixture-official-result.ts`)가 이미 두 형태를 함께
 * 읽도록 검증된 단일 파서라 여기서도 그걸 그대로 재사용한다 — 한쪽만 읽는 별도
 * 파서를 새로 만들면 `public-tournament-records.service.ts`의 `parseScore()`,
 * 이 리비전 백필 마이그레이션(`20260818160000_v1_team_record_facts_penalty_result`)
 * 의 `COALESCE(score->'penalties', score->'penalty')`와 또 갈라지는 함정을
 * 반복한다(이 저장소에서 이미 반복된 패턴). 파싱이 실패하거나(`null`) 승부차기
 * 값이 없으면 그 한 행 때문에 목록 전체를 500으로 죽이지 않고 "승부차기 정보
 * 없음"(null)으로 접는다(값을 지어내지 않는다).
 */
function resolveTeamPenalties(
  scoreJson: Prisma.JsonValue,
  sides: readonly GameSideRow[],
  teamId: string,
): TeamPenalties | null {
  const score = parseTournamentFixtureOfficialScore(scoreJson);
  if (score === null || score.homePenaltyScore === null || score.awayPenaltyScore === null) return null;
  const ownSideKey = sides.find((side) => side.teamId === teamId)?.sideKey;
  if (ownSideKey === undefined) return null;
  return ownSideKey === 'HOME'
    ? { for: score.homePenaltyScore, against: score.awayPenaltyScore }
    : { for: score.awayPenaltyScore, against: score.homePenaltyScore };
}

/** KST(UTC+9)는 서머타임이 없어 연중 상수 오프셋 -- `fetchAvailableSeasons`의 이중 `AT TIME ZONE` 변환과 짝을 이루는 상수. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * finding #21: `season`(KST 캘린더 연도 문자열)의 경계를 그 연도의 KST 자정
 * 인스턴트로 계산한 뒤, `played_at`(TIMESTAMP(3) without time zone -- UTC 벽시계
 * 값이 그대로 저장됨)과 직접 비교 가능하도록 UTC 로 변환한다. 이전 코드는
 * `Date.UTC(year,0,1,...)`를 그대로 썼는데, 이는 "UTC 1/1 00:00"을 경계로 삼는
 * 것이라 KST 1/1 00:00~08:59 에 킥오프한 경기가 전년도 UTC 값(예: 2027 KST 1/1
 * 08:00 킥오프 -> 저장값 2026-12-31 23:00)을 갖게 되어 화면(브라우저 로컬=KST
 * 렌더)이 보여주는 연도와 시즌 필터가 어긋났다(`formatTournamentDateShort`).
 */
function seasonBounds(season: string | undefined): { readonly gte: Date; readonly lt: Date } | null {
  if (season === undefined) return null;
  const year = Number.parseInt(season, 10);
  return {
    gte: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0) - KST_OFFSET_MS),
    lt: new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0) - KST_OFFSET_MS),
  };
}
