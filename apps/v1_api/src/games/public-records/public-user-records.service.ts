import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveTeamRecordResult } from '../../game-operations/team-record-result';
import { parseTournamentFixtureOfficialScore } from '../../tournaments/tournament-fixture-official-result';
import { PublicRecordsQueryDto } from './dto/public-records-query.dto';
import { decodeRecordCursor, encodeRecordCursor, isAfterCursor, type RecordCursor } from './public-cursor';
import { isParticipantPubliclyEligible, loadParticipantConsentEligibility } from './public-consent';

interface EligibleResultRow {
  readonly participantResultId: string;
  readonly resultRevisionId: string;
  readonly participantId: string;
  readonly gameId: string;
  readonly sourceType: string;
  readonly tournamentFixtureId: string | null;
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

  async getRecords(userId: string, query: PublicRecordsQueryDto, viewerId?: string) {
    const user = await this.prisma.v1User.findUnique({
      where: { id: userId },
      select: { id: true, profile: { select: { nickname: true } } },
    });
    if (user === null) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User was not found' });
    }

    const viewerIsOwner = viewerId !== undefined && viewerId === userId;

    // 동의 행은 본인 조회일 때만 읽는다 -- 타인 조회에서는 응답에 싣지도 않으므로
    // (아래 `consentGranted` 주석 참고) 공개 라우트의 hot path 에 쓸모없는 왕복이 하나
    // 붙는 셈이었다. 개별 참가 기록의 동의 판정은 `loadEligibleRows` 가 자체적으로
    // (`loadParticipantConsentEligibility`) 하므로 이 조회와 무관하다.
    const [eligibleRows, consent] = await Promise.all([
      this.loadEligibleRows(userId, query.season, viewerIsOwner),
      viewerIsOwner
        ? this.prisma.v1UserRecordConsent.findUnique({ where: { userId }, select: { state: true } })
        : Promise.resolve(null),
    ]);
    const cursor = decodeRecordCursor(query.cursor);
    const limit = query.limit ?? 20;

    const ordered = eligibleRows
      .slice()
      .sort((a, b) => rowCursorOf(b).key.localeCompare(rowCursorOf(a).key) || rowCursorOf(b).id.localeCompare(rowCursorOf(a).id));
    const afterCursor =
      cursor === null ? ordered : ordered.filter((row) => isAfterCursor(rowCursorOf(row), cursor, 'desc'));
    const page = afterCursor.slice(0, limit);
    const hasMore = afterCursor.length > limit;

    const detail = await this.hydrate(page);

    // 파울 누적치는 공개 응답에 싣지 않는다. 카드(경고/퇴장)는 경기 서사로서
    // 공개하지만, 일반 파울 개수는 선수 개인 프로필에 낙인으로 남을 뿐
    // 관전자에게 주는 정보가 없다. DB(`V1GameResultParticipant.fouls`)와
    // 운영 콘솔의 팀 파울 카운터는 그대로 유지된다.
    const summary = {
      appearances: eligibleRows.length,
      goals: eligibleRows.reduce((sum, row) => sum + row.goals, 0),
      assists: eligibleRows.reduce((sum, row) => sum + row.assists, 0),
      yellowCards: eligibleRows.reduce((sum, row) => sum + row.cardsYellow, 0),
      redCards: eligibleRows.reduce((sum, row) => sum + row.cardsRed, 0),
      mvpCount: eligibleRows.filter((row) => row.isMvp).length,
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
      items: detail,
      nextCursor,
    };
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
              select: { sourceType: true, tournamentFixtureId: true, currentOfficialRevisionId: true },
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
        if (consent.linkedUserId === null) continue;
        if (consent.latestParticipantSnapshotState === 'REVOKED') continue;
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

  private async hydrate(rows: readonly EligibleResultRow[]) {
    if (rows.length === 0) return [];

    const gameIds = Array.from(new Set(rows.map((row) => row.gameId)));
    const fixtureIds = Array.from(
      new Set(rows.map((row) => row.tournamentFixtureId).filter((id): id is string => id !== null)),
    );

    const [sides, fixtures] = await Promise.all([
      this.prisma.v1GameSide.findMany({
        where: { gameId: { in: gameIds } },
        select: { id: true, gameId: true, sideKey: true, teamId: true, displayNameSnapshot: true },
      }),
      fixtureIds.length === 0
        ? []
        : this.prisma.v1TournamentFixture.findMany({
            where: { id: { in: fixtureIds } },
            select: { id: true, tournamentId: true, round: true },
          }),
    ]);

    const sidesByGame = new Map<string, typeof sides>();
    for (const side of sides) {
      const list = sidesByGame.get(side.gameId) ?? [];
      list.push(side);
      sidesByGame.set(side.gameId, list);
    }
    const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));

    const teamIds = Array.from(
      new Set(sides.map((side) => side.teamId).filter((id): id is string => id !== null)),
    );
    const tournamentIds = Array.from(
      new Set(fixtures.map((fixture) => fixture.tournamentId)),
    );
    const [teams, tournaments] = await Promise.all([
      teamIds.length === 0
        ? []
        : this.prisma.v1Team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } }),
      tournamentIds.length === 0
        ? []
        : this.prisma.v1Tournament.findMany({ where: { id: { in: tournamentIds } }, select: { id: true, title: true } }),
    ]);
    const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
    const tournamentTitleById = new Map(tournaments.map((tournament) => [tournament.id, tournament.title]));

    return rows.map((row) => {
      const gameSides = sidesByGame.get(row.gameId) ?? [];
      const ownSide = gameSides.find((side) => side.id === row.sideId) ?? null;
      const opponentSide = gameSides.find((side) => side.id !== row.sideId) ?? null;
      const fixture = row.tournamentFixtureId === null ? null : (fixtureById.get(row.tournamentFixtureId) ?? null);

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
        matchType: row.sourceType === 'TOURNAMENT_FIXTURE' ? ('tournament' as const) : ('team_match' as const),
        tournamentId: fixture?.tournamentId ?? null,
        tournamentTitle: fixture ? (tournamentTitleById.get(fixture.tournamentId) ?? null) : null,
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
