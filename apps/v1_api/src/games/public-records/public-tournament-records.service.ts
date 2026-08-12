import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, V1GameEventType, V1GameResultRevisionState, V1VisibilityMode } from '@prisma/client';
import type { GameScore } from '../games.types';
import { PrismaService } from '../../prisma/prisma.service';
import { isBracketPublished } from '../../tournaments/tournament-detail.presenter';
import { decodeRecordCursor, encodeRecordCursor } from './public-cursor';
import {
  isParticipantPubliclyEligible,
  loadParticipantConsentEligibility,
  type ParticipantConsentEligibility,
} from './public-consent';
import { resolveLiveClock, type PublicGameClock } from './public-clock';
import { tallyLiveScore } from './public-live-score';
import { effectivePublicVisibilityMode, isLineupPublished, publicFixtureStatus, resolveResultState } from './public-visibility';
import type { PublicTournamentScheduleQueryDto } from './dto/public-records-query.dto';

/**
 * A fixture/match this route never returns individually and never lists in
 * the schedule: the bracket has not been published yet, or the game's own
 * `V1GameVisibilityPolicy` resolves to `hidden`. Both collapse to the exact
 * same not-found response so a caller cannot distinguish "does not exist"
 * from "exists but hidden" -- the fail-closed default the todo requires.
 */
const NOT_FOUND = { code: 'TOURNAMENT_MATCH_NOT_FOUND', message: '경기 정보를 찾을 수 없어요.' } as const;

const FIXTURE_SCHEDULE_SELECT = {
  id: true,
  round: true,
  fixtureNumber: true,
  legNumber: true,
  groupId: true,
  scheduledAt: true,
  venue: true,
  status: true,
  homeRegistrationId: true,
  awayRegistrationId: true,
  homeRegistration: { select: { team: { select: { id: true, name: true } } } },
  awayRegistration: { select: { team: { select: { id: true, name: true } } } },
  group: { select: { name: true } },
  field: { select: { name: true } },
  videos: { select: { id: true } },
  game: {
    select: {
      id: true,
      state: true,
      visibilityPolicy: { select: { mode: true, lineupAt: true } },
      currentOfficialRevision: { select: { state: true, supersedesId: true, officialAt: true, score: true } },
      // Lane 1 addition -- `sides`/`periods` back the live-score tally and the
      // elapsed-clock projection for a fixture that is genuinely LIVE and has
      // no official revision yet (see `public-live-score.ts`/`public-clock.ts`).
      sides: { select: { id: true, sideKey: true } },
      periods: { select: { number: true, state: true, startedAt: true, pausedTotalMs: true, pausedAt: true } },
      // 일정 카드 득점자 요약(loadScorers)이 이름/등번호를 붙이는 데 쓴다 --
      // getMatch의 buildEvents/buildLineup과 동일한 원본 필드.
      participants: { select: { id: true, sideId: true, displayNameSnapshot: true, jerseyNumber: true } },
    },
  },
} satisfies Prisma.V1TournamentFixtureSelect;

type FixtureScheduleRow = Prisma.V1TournamentFixtureGetPayload<{ select: typeof FIXTURE_SCHEDULE_SELECT }>;

const FIXTURE_MATCH_SELECT = {
  id: true,
  tournamentId: true,
  round: true,
  fixtureNumber: true,
  legNumber: true,
  groupId: true,
  scheduledAt: true,
  venue: true,
  status: true,
  homeRegistrationId: true,
  awayRegistrationId: true,
  homeRegistration: { select: { team: { select: { id: true, name: true } } } },
  awayRegistration: { select: { team: { select: { id: true, name: true } } } },
  group: { select: { name: true } },
  field: { select: { name: true } },
  videos: { select: { id: true, title: true, url: true }, orderBy: { sortOrder: 'asc' } },
  game: {
    select: {
      id: true,
      state: true,
      visibilityPolicy: { select: { mode: true, lineupAt: true } },
      sides: { select: { id: true, sideKey: true } },
      participants: {
        select: { id: true, sideId: true, displayNameSnapshot: true, jerseyNumber: true, position: true },
      },
      currentOfficialRevision: {
        select: { state: true, supersedesId: true, officialAt: true, score: true, mvpParticipantId: true },
      },
      // Lane 1 addition -- see FIXTURE_SCHEDULE_SELECT above.
      periods: { select: { number: true, state: true, startedAt: true, pausedTotalMs: true, pausedAt: true } },
    },
  },
} satisfies Prisma.V1TournamentFixtureSelect;

type FixtureMatchRow = Prisma.V1TournamentFixtureGetPayload<{ select: typeof FIXTURE_MATCH_SELECT }>;

type EffectiveMode = 'status_only' | 'live' | 'official_only';

@Injectable()
export class PublicTournamentRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSchedule(tournamentId: string, query: PublicTournamentScheduleQueryDto) {
    const tournament = await this.prisma.v1Tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, title: true, bracketPublishedAt: true, bracketPublishScheduledAt: true },
    });
    if (tournament === null) {
      throw new NotFoundException(NOT_FOUND);
    }
    const bracketPublished = isBracketPublished(tournament.bracketPublishedAt, tournament.bracketPublishScheduledAt);
    if (!bracketPublished) {
      return {
        tournamentId: tournament.id,
        tournamentTitle: tournament.title,
        bracketPublished: false,
        items: [],
        unscheduled: [],
        standings: [],
        nextCursor: null,
      };
    }

    const publicLiveEnabled = await this.isPublicLiveEnabled();
    const limit = query.limit ?? 20;
    const cursor = decodeRecordCursor(query.cursor);

    const rawFixtures = await this.prisma.v1TournamentFixture.findMany({
      where: {
        tournamentId,
        scheduledAt: { not: null },
        ...(query.round ? { round: query.round } : {}),
        ...(query.groupId ? { groupId: query.groupId } : {}),
        ...(cursor
          ? {
              OR: [
                { scheduledAt: { gt: new Date(cursor.key) } },
                { scheduledAt: new Date(cursor.key), id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      select: FIXTURE_SCHEDULE_SELECT,
    });
    const hasMore = rawFixtures.length > limit;
    const pageFixtures = rawFixtures.slice(0, limit);

    const rawUnscheduled = await this.prisma.v1TournamentFixture.findMany({
      where: {
        tournamentId,
        scheduledAt: null,
        ...(query.round ? { round: query.round } : {}),
        ...(query.groupId ? { groupId: query.groupId } : {}),
      },
      orderBy: [{ round: 'asc' }, { fixtureNumber: 'asc' }],
      select: FIXTURE_SCHEDULE_SELECT,
    });

    // Lane 1 fix -- one batched query for every currently-LIVE/PAUSED game on
    // this page (both cursor-paginated and unscheduled), never a per-fixture
    // query. See `loadLiveScores` below.
    // PUBLIC_LIVE 가 꺼져 있으면 effectivePublicVisibilityMode() 가 live 를
    // status_only 로 강등해 이 값이 어차피 화면에 안 나간다 — 그런데도 매 요청마다
    // 이벤트를 긁어오면 관전자 트래픽만큼 헛일이 쌓인다. 플래그가 켜졌을 때만 읽는다.
    const liveScoreByGameId = publicLiveEnabled
      ? await this.loadLiveScores([...pageFixtures, ...rawUnscheduled])
      : new Map<string, GameScore>();
    const now = new Date();

    // 득점자 요약(일정 카드) -- `official_only` 모드는 PUBLIC_LIVE 플래그와
    // 무관하게 항상 노출되므로(effectivePublicVisibilityMode), liveScoreByGameId와
    // 달리 플래그로 게이팅하지 않는다. `status_only`는 presentScheduleEntry가
    // 결과 자체를 숨기므로 거기서 걸러진다.
    const allPageFixtures = [...pageFixtures, ...rawUnscheduled];
    const scorersByGameId = await this.loadScorers(allPageFixtures);
    const scorerParticipantIds = allPageFixtures.flatMap((fixture) =>
      (fixture.game?.participants ?? []).map((participant) => participant.id),
    );
    const consentMap = await loadParticipantConsentEligibility(this.prisma, scorerParticipantIds);

    const items = pageFixtures
      .map((fixture) => presentScheduleEntry(fixture, publicLiveEnabled, liveScoreByGameId, scorersByGameId, consentMap, now))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const unscheduled = rawUnscheduled
      .map((fixture) => presentScheduleEntry(fixture, publicLiveEnabled, liveScoreByGameId, scorersByGameId, consentMap, now))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const standings = await this.prisma.v1TournamentStanding.findMany({
      where: { group: { tournamentId } },
      orderBy: [{ groupId: 'asc' }, { position: 'asc' }],
      select: {
        groupId: true,
        points: true,
        wins: true,
        draws: true,
        losses: true,
        goalsFor: true,
        goalsAgainst: true,
        position: true,
        group: { select: { name: true } },
        registration: {
          select: { team: { select: { id: true, name: true, profile: { select: { logoUrl: true } } } } },
        },
      },
    });

    // #374 — 순위 행(V1TournamentStanding)은 첫 결과가 OFFICIAL이 될 때(또는 어드민
    // 재계산 때) 비로소 생긴다. 그래서 경기 기록이 0건인 대회는 위 조회가 빈 배열을
    // 돌려주고, 화면은 순위표 섹션 자체를 감춰 버렸다 — 조 편성은 공개됐는데 어느 팀이
    // 우리 조인지 볼 수 없는 상태. 순위 행이 아직 하나도 없는 조별(phase=group) 조는
    // 편성된 팀을 전 지표 0인 기준선 행으로 내려 준다. 첫 결과가 들어오면 그 조에 실제
    // 순위 행이 생겨 `standings: { none: {} }` 조건에서 빠지므로 기준선은 자동으로 사라진다
    // (재계산은 항상 그 조의 전 팀을 한꺼번에 upsert 하므로 "일부만 집계된" 중간 상태가 없다).
    const baselineGroups = await this.prisma.v1TournamentGroup.findMany({
      where: { tournamentId, phase: 'group', standings: { none: {} } },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        groupTeams: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: {
            registration: {
              select: { team: { select: { id: true, name: true, profile: { select: { logoUrl: true } } } } },
            },
          },
        },
      },
    });
    const baselineStandings = baselineGroups.flatMap((group) =>
      group.groupTeams.map((groupTeam, index) => ({
        groupId: group.id,
        groupName: group.name,
        teamId: groupTeam.registration.team.id,
        teamName: groupTeam.registration.team.name,
        teamLogoUrl: groupTeam.registration.team.profile?.logoUrl ?? null,
        // 편성 순서일 뿐 성적 순위가 아니다. 표가 전부 0이면 프론트(TournamentStandingsTable)가
        // 메달 색·진출 강조를 스스로 끄고 "아직 경기 기록이 없어요" 안내를 붙인다.
        position: index + 1,
        points: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
      })),
    );

    const lastFixture = pageFixtures[pageFixtures.length - 1];
    const nextCursor: string | null =
      hasMore && lastFixture !== undefined && lastFixture.scheduledAt !== null
        ? encodeRecordCursor({ key: lastFixture.scheduledAt.toISOString(), id: lastFixture.id })
        : null;

    return {
      tournamentId: tournament.id,
      tournamentTitle: tournament.title,
      bracketPublished: true,
      items,
      unscheduled,
      standings: [
        ...standings.map((standing) => ({
          groupId: standing.groupId,
          groupName: standing.group.name,
          teamId: standing.registration.team.id,
          teamName: standing.registration.team.name,
          teamLogoUrl: standing.registration.team.profile?.logoUrl ?? null,
          position: standing.position,
          points: standing.points,
          wins: standing.wins,
          draws: standing.draws,
          losses: standing.losses,
          goalsFor: standing.goalsFor,
          goalsAgainst: standing.goalsAgainst,
        })),
        ...baselineStandings,
      ],
      nextCursor,
    };
  }

  async getMatch(tournamentId: string, fixtureId: string) {
    const tournament = await this.prisma.v1Tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, title: true, bracketPublishedAt: true, bracketPublishScheduledAt: true },
    });
    if (
      tournament === null ||
      !isBracketPublished(tournament.bracketPublishedAt, tournament.bracketPublishScheduledAt)
    ) {
      throw new NotFoundException(NOT_FOUND);
    }

    const fixture = await this.prisma.v1TournamentFixture.findFirst({
      where: { id: fixtureId, tournamentId },
      select: FIXTURE_MATCH_SELECT,
    });
    if (fixture === null) {
      throw new NotFoundException(NOT_FOUND);
    }

    const publicLiveEnabled = await this.isPublicLiveEnabled();
    const policyMode: V1VisibilityMode = fixture.game?.visibilityPolicy?.mode ?? 'HIDDEN';
    const mode = effectivePublicVisibilityMode(policyMode, publicLiveEnabled);
    if (mode === 'hidden') {
      throw new NotFoundException(NOT_FOUND);
    }

    const currentRevisionState = normalizeRevisionState(fixture.game?.currentOfficialRevision?.state);
    const resultState = resolveResultState({
      currentRevisionState,
      supersedesId: fixture.game?.currentOfficialRevision?.supersedesId ?? null,
    });
    const status = publicFixtureStatus({ gameState: fixture.game?.state ?? null, fixtureStatus: fixture.status });

    const officialScore = parseScore(fixture.game?.currentOfficialRevision?.score);
    const officialAt = fixture.game?.currentOfficialRevision?.officialAt ?? null;
    const showOfficialResult = currentRevisionState === 'OFFICIAL' && officialScore !== null && officialAt !== null;
    // Lane 1 fix (관중 라이브 스코어): see `presentScheduleEntry`'s twin comment
    // -- `currentOfficialRevision` alone silently hides the score for the
    // entire duration a tournament fixture is actually being played.
    const liveScore =
      !showOfficialResult && mode === 'live' && status === 'live' && fixture.game !== null
        ? await this.computeLiveScore(fixture.game.id, fixture.game.sides)
        : null;
    const scoreStatus: 'unavailable' | 'live' | 'official' = showOfficialResult
      ? 'official'
      : liveScore !== null
        ? 'live'
        : 'unavailable';
    const score = mode === 'status_only' ? null : showOfficialResult ? officialScore : liveScore;
    const clock: PublicGameClock | null =
      mode === 'live' && !showOfficialResult ? resolveLiveClock(fixture.game?.periods ?? [], new Date()) : null;

    const participantIds = (fixture.game?.participants ?? []).map((participant) => participant.id);
    const consentMap = await loadParticipantConsentEligibility(this.prisma, participantIds);
    const identityAsOf = officialAt ?? new Date();

    const lineup = buildLineup(fixture, mode, consentMap, identityAsOf);
    const events =
      mode === 'status_only'
        ? []
        : await this.buildEvents(
            fixture.game?.id ?? null,
            fixture.game?.sides ?? [],
            fixture.game?.participants ?? [],
            consentMap,
            identityAsOf,
          );
    const mvp = buildMvp(fixture, mode, currentRevisionState, consentMap, identityAsOf);

    const history =
      fixture.game === null
        ? []
        : await this.prisma.v1GameResultRevision.findMany({
            where: { gameId: fixture.game.id, state: { in: ['OFFICIAL', 'VOID'] } },
            orderBy: { revision: 'asc' },
            select: { revision: true, state: true, officialAt: true, reason: true, supersedesId: true },
          });

    const nextMatch = await this.findNextMatch(fixture);

    return {
      tournamentId: tournament.id,
      tournamentTitle: tournament.title,
      fixtureId: fixture.id,
      gameId: fixture.game?.id ?? null,
      round: fixture.round,
      fixtureNumber: fixture.fixtureNumber,
      legNumber: fixture.legNumber,
      groupId: fixture.groupId,
      groupName: fixture.group?.name ?? null,
      scheduledAt: fixture.scheduledAt?.toISOString() ?? null,
      venue: fixture.venue,
      fieldName: fixture.field?.name ?? null,
      home: presentSide(fixture.homeRegistrationId, fixture.homeRegistration),
      away: presentSide(fixture.awayRegistrationId, fixture.awayRegistration),
      visibilityMode: mode,
      status,
      resultState,
      scoreStatus,
      score,
      clock,
      lineup,
      events,
      mvp,
      pendingProjection: mode === 'live' && resultState === 'pending' && (status === 'live' || status === 'ended'),
      history: history.map((revision) => ({
        revision: revision.revision,
        state: revision.state,
        officialAt: revision.officialAt?.toISOString() ?? null,
        reason: revision.reason,
        isCorrection: revision.supersedesId !== null,
      })),
      videos: fixture.videos.map((video) => ({ id: video.id, title: video.title, url: video.url })),
      nextMatch,
    };
  }

  private async isPublicLiveEnabled(): Promise<boolean> {
    const flag = await this.prisma.v1GameOperationFlag.findUnique({
      where: { key: 'PUBLIC_LIVE' },
      select: { value: true },
    });
    return flag?.value === 'on';
  }

  /**
   * Lane 1 (관중 라이브 스코어) -- one batched `V1GameEvent` query for every
   * fixture on this page whose game is currently `LIVE`/`PAUSED`, never a
   * per-fixture query (a schedule page can list dozens of fixtures; only a
   * handful are ever concurrently live). Fixtures whose game has already
   * ended or hasn't started are skipped entirely -- `presentScheduleEntry`
   * only consults this map while `status === 'live'` anyway, so scoring them
   * here would be wasted work. See `public-live-score.ts`.
   */
  private async loadLiveScores(
    fixtures: readonly FixtureScheduleRow[],
  ): Promise<ReadonlyMap<string, GameScore>> {
    const liveFixtures = fixtures.filter(
      (fixture): fixture is FixtureScheduleRow & { game: NonNullable<FixtureScheduleRow['game']> } =>
        fixture.game !== null && (fixture.game.state === 'LIVE' || fixture.game.state === 'PAUSED'),
    );
    if (liveFixtures.length === 0) return new Map();

    const gameIds = liveFixtures.map((fixture) => fixture.game.id);
    // 스코어 집계에 필요한 건 GOAL 과 "무언가를 되돌린 이벤트" 둘뿐이다
    // (tallyLiveScore 는 reversesEventId 로 취소된 골을 빼고 GOAL 만 센다).
    // 관전자 폴링으로 반복 호출되는 경로라 카드·교체·파울까지 전부 읽으면
    // 그만큼 DB/네트워크 비용이 그대로 쌓인다.
    const events = await this.prisma.v1GameEvent.findMany({
      where: { gameId: { in: gameIds }, OR: [{ type: 'GOAL' }, { reversesEventId: { not: null } }] },
      select: { id: true, gameId: true, type: true, sideId: true, reversesEventId: true },
    });
    const eventsByGame = new Map<string, typeof events>();
    for (const event of events) {
      const list = eventsByGame.get(event.gameId) ?? [];
      list.push(event);
      eventsByGame.set(event.gameId, list);
    }

    const scores = new Map<string, GameScore>();
    for (const fixture of liveFixtures) {
      const sideKeyById = new Map(fixture.game.sides.map((side) => [side.id, side.sideKey] as const));
      scores.set(fixture.game.id, tallyLiveScore(eventsByGame.get(fixture.game.id) ?? [], sideKeyById));
    }
    return scores;
  }

  /** Single-match twin of `loadLiveScores` above, for `getMatch`'s one fixture. */
  private async computeLiveScore(
    gameId: string,
    sides: readonly { id: string; sideKey: 'HOME' | 'AWAY' }[],
  ): Promise<GameScore> {
    const events = await this.prisma.v1GameEvent.findMany({
      // loadLiveScores 와 같은 이유로 범위를 좁힌다 — 단일 경기 조회라도 관전자
      // 폴링으로 반복 호출된다.
      where: { gameId, OR: [{ type: 'GOAL' }, { reversesEventId: { not: null } }] },
      select: { id: true, type: true, sideId: true, reversesEventId: true },
    });
    const sideKeyById = new Map(sides.map((side) => [side.id, side.sideKey] as const));
    return tallyLiveScore(events, sideKeyById);
  }

  private async buildEvents(
    gameId: string | null,
    sides: readonly { id: string; sideKey: 'HOME' | 'AWAY' }[],
    participants: readonly { id: string; displayNameSnapshot: string; jerseyNumber: number | null }[],
    consentMap: Map<string, ParticipantConsentEligibility>,
    identityAsOf: Date,
  ) {
    if (gameId === null) return [];
    const events = await this.prisma.v1GameEvent.findMany({
      where: { gameId },
      orderBy: { sequence: 'asc' },
      select: {
        id: true,
        type: true,
        sideId: true,
        participantId: true,
        period: true,
        clockMs: true,
        reversesEventId: true,
      },
    });
    const reversedIds = new Set(
      events.map((event) => event.reversesEventId).filter((id): id is string => id !== null),
    );
    const scoringTypes: ReadonlySet<V1GameEventType> = new Set(['GOAL', 'CARD']);
    const participantById = new Map(participants.map((participant) => [participant.id, participant] as const));
    // 홈/원정 매핑을 이 자리에서 서버가 직접 해준다 -- `sideId` 는 클라이언트에서
    // 재구성할 수 없는 내부 id 라서, 라인업(lineup)이 아직 공개되지 않은 경기라도
    // (아래 참고: 이름/등번호가 라인업 게이트와 독립인 것과 같은 이유로) 타임라인을
    // 홈/원정으로 나눠 보여줄 수 있어야 한다.
    const sideKeyById = new Map(sides.map((side) => [side.id, side.sideKey] as const));
    return events
      .filter((event) => scoringTypes.has(event.type) && !reversedIds.has(event.id))
      .map((event) => {
        const consent = event.participantId === null ? undefined : consentMap.get(event.participantId);
        const eligible = consent !== undefined && isParticipantPubliclyEligible(consent, identityAsOf);
        // 이름/등번호는 buildLineup 과 동일한 방식(participant.displayNameSnapshot,
        // participant.jerseyNumber)으로 뽑되, buildLineup 의 lineupAt(라인업 공개
        // 시각) 게이트는 따르지 않는다 -- 그 게이트는 "경기 전 선발 명단 노출"을 막는
        // 규칙이고, 골/카드 이벤트는 경기가 시작된 뒤에만 발생하므로 득점자를
        // 보여주는 것이 선발 명단을 미리 흘리는 것이 아니다. 대신 동의(consent)
        // 게이트는 lineup과 정확히 동일하게 적용한다 -- eligible 이 false 면
        // participantId 와 마찬가지로 이름/등번호도 null.
        const participant = event.participantId === null ? undefined : participantById.get(event.participantId);
        return {
          type: event.type,
          sideId: event.sideId,
          // `sideId`는 스키마상 nullable(`String?`)이지만 GOAL/CARD 이벤트는 게임
          // 로직상 항상 한쪽 사이드에 귀속되므로 실질적으로는 null이 되지 않는다 --
          // 그래도 타입 안전을 위해 null이면 'away'로 접지(fail-safe)한다.
          side: sideKeyById.get(event.sideId ?? '') === 'HOME' ? ('home' as const) : ('away' as const),
          participantId: eligible ? event.participantId : null,
          participantName: eligible ? (participant?.displayNameSnapshot ?? null) : null,
          jerseyNumber: eligible ? (participant?.jerseyNumber ?? null) : null,
          period: event.period,
          clockMs: event.clockMs,
        };
      });
  }

  /**
   * 일정 카드 득점자 요약(D-24 확장) -- 페이지에 실린 모든 픽스처(예정/미정 전부)의
   * GOAL 이벤트를 한 번에 배치 조회한다. `loadLiveScores`와 같은 이유로 픽스처별
   * 쿼리를 피한다. `official_only`로 이미 끝난 경기도 득점자를 보여줘야 하므로
   * (schema 상 PUBLIC_LIVE 플래그는 LIVE 정책만 강등시킨다 -- `effectivePublicVisibilityMode`
   * 참고) `loadLiveScores`와 달리 이 메서드는 플래그로 게이팅하지 않고 항상 실행한다.
   * 이름/등번호로의 해석과 동의(consent) 게이팅은 호출자(`presentScheduleEntry`)가
   * `getMatch`의 `buildEvents`와 동일한 규칙으로 수행한다 -- 라인업 게이트와
   * 독립이라는 계약도 동일하게 유지된다.
   */
  private async loadScorers(
    fixtures: readonly FixtureScheduleRow[],
  ): Promise<ReadonlyMap<string, readonly { side: 'home' | 'away'; participantId: string | null; clockMs: number | null }[]>> {
    const fixturesWithGame = fixtures.filter(
      (fixture): fixture is FixtureScheduleRow & { game: NonNullable<FixtureScheduleRow['game']> } =>
        fixture.game !== null,
    );
    if (fixturesWithGame.length === 0) return new Map();

    const gameIds = fixturesWithGame.map((fixture) => fixture.game.id);
    // WHERE 에 type:'GOAL' 을 걸면 안 된다. 취소를 나타내는 행은 GOAL 이 아니라
    // CORRECTION 이고 `reversesEventId` 를 그 CORRECTION 행이 들고 있어서, GOAL 만
    // 읽으면 reversedIds 가 항상 비어 취소된 골이 그대로 남는다(알파 실측: 골 2개인
    // 경기에서 GOAL 4행 중 2행이 CORRECTION 으로 취소됐는데 요약에 4개가 다 떴다).
    // 같은 파일의 buildEvents 는 전체를 읽고 *나중에* 타입을 거르는데, 여기만
    // 쿼리에서 걸러 규칙이 갈라졌던 것이다 — buildEvents 와 같은 순서로 맞춘다.
    const events = await this.prisma.v1GameEvent.findMany({
      where: { gameId: { in: gameIds } },
      orderBy: { sequence: 'asc' },
      select: { id: true, gameId: true, type: true, sideId: true, participantId: true, clockMs: true, reversesEventId: true },
    });
    const reversedIds = new Set(
      events.map((event) => event.reversesEventId).filter((id): id is string => id !== null),
    );
    const eventsByGame = new Map<string, typeof events>();
    for (const event of events) {
      if (event.type !== 'GOAL') continue;
      if (reversedIds.has(event.id)) continue;
      const list = eventsByGame.get(event.gameId) ?? [];
      list.push(event);
      eventsByGame.set(event.gameId, list);
    }

    const result = new Map<string, { side: 'home' | 'away'; participantId: string | null; clockMs: number | null }[]>();
    for (const fixture of fixturesWithGame) {
      const sideKeyById = new Map(fixture.game.sides.map((side) => [side.id, side.sideKey] as const));
      const rows = (eventsByGame.get(fixture.game.id) ?? []).map((event) => ({
        // sideId nullable 방어(위 buildEvents와 동일한 fail-safe 규칙).
        side: (sideKeyById.get(event.sideId ?? '') === 'HOME' ? 'home' : 'away') as 'home' | 'away',
        participantId: event.participantId,
        clockMs: event.clockMs,
      }));
      result.set(fixture.game.id, rows);
    }
    return result;
  }

  private async findNextMatch(fixture: FixtureMatchRow) {
    if (fixture.scheduledAt === null) return null;
    const registrationIds = [fixture.homeRegistrationId, fixture.awayRegistrationId].filter(
      (id): id is string => id !== null,
    );
    if (registrationIds.length === 0) return null;
    const next = await this.prisma.v1TournamentFixture.findFirst({
      where: {
        tournamentId: fixture.tournamentId,
        id: { not: fixture.id },
        scheduledAt: { gt: fixture.scheduledAt },
        OR: [{ homeRegistrationId: { in: registrationIds } }, { awayRegistrationId: { in: registrationIds } }],
      },
      orderBy: { scheduledAt: 'asc' },
      select: {
        id: true,
        round: true,
        scheduledAt: true,
        homeRegistration: { select: { team: { select: { id: true, name: true } } } },
        awayRegistration: { select: { team: { select: { id: true, name: true } } } },
      },
    });
    if (next === null) return null;
    return {
      fixtureId: next.id,
      round: next.round,
      scheduledAt: next.scheduledAt?.toISOString() ?? null,
      home: next.homeRegistration
        ? { teamId: next.homeRegistration.team.id, teamName: next.homeRegistration.team.name }
        : null,
      away: next.awayRegistration
        ? { teamId: next.awayRegistration.team.id, teamName: next.awayRegistration.team.name }
        : null,
    };
  }
}

function normalizeRevisionState(state: V1GameResultRevisionState | undefined): 'OFFICIAL' | 'VOID' | null {
  return state === 'OFFICIAL' || state === 'VOID' ? state : null;
}

function presentSide(
  registrationId: string | null,
  registration: { team: { id: string; name: string } } | null,
): { registrationId: string; teamId: string; teamName: string } | null {
  if (registrationId === null || registration === null) return null;
  return { registrationId, teamId: registration.team.id, teamName: registration.team.name };
}

function presentScheduleEntry(
  fixture: FixtureScheduleRow,
  publicLiveEnabled: boolean,
  liveScoreByGameId: ReadonlyMap<string, GameScore>,
  scorersByGameId: ReadonlyMap<string, readonly { side: 'home' | 'away'; participantId: string | null; clockMs: number | null }[]>,
  consentMap: Map<string, ParticipantConsentEligibility>,
  now: Date,
) {
  const policyMode: V1VisibilityMode = fixture.game?.visibilityPolicy?.mode ?? 'HIDDEN';
  const mode = effectivePublicVisibilityMode(policyMode, publicLiveEnabled);
  if (mode === 'hidden') return null;

  const currentRevisionState = normalizeRevisionState(fixture.game?.currentOfficialRevision?.state);
  const officialScore = parseScore(fixture.game?.currentOfficialRevision?.score);
  const showOfficialResult = currentRevisionState === 'OFFICIAL' && officialScore !== null;
  const status = publicFixtureStatus({ gameState: fixture.game?.state ?? null, fixtureStatus: fixture.status });
  // Lane 1 fix (관중 라이브 스코어): while genuinely LIVE and no official
  // revision exists yet, use the GOAL-event tally instead of leaving the score
  // null -- see `public-live-score.ts`'s doc comment for why
  // `currentOfficialRevision` alone silently hid every in-progress score.
  // Gated to `mode === 'live'` only: `official_only` deliberately withholds any
  // numeric score before officialization (frozen visibility matrix).
  const liveScore =
    !showOfficialResult && mode === 'live' && status === 'live' && fixture.game !== null
      ? (liveScoreByGameId.get(fixture.game.id) ?? null)
      : null;
  const scoreStatus: 'unavailable' | 'live' | 'official' = showOfficialResult
    ? 'official'
    : liveScore !== null
      ? 'live'
      : 'unavailable';
  const clock: PublicGameClock | null =
    mode === 'live' && !showOfficialResult ? resolveLiveClock(fixture.game?.periods ?? [], now) : null;

  // 득점자 요약 -- `status_only`는 결과 자체를 숨기므로 골 요약도 함께 숨긴다.
  // 이름/등번호 노출 규칙은 getMatch의 buildEvents와 정확히 동일하다: 동의
  // (consent)가 eligible일 때만 이름을 채우고, 아니면 시간만 남긴다.
  const officialAt = fixture.game?.currentOfficialRevision?.officialAt ?? null;
  const identityAsOf = officialAt ?? now;
  const participantById = new Map((fixture.game?.participants ?? []).map((p) => [p.id, p] as const));
  const scorers =
    mode === 'status_only' || fixture.game === null
      ? []
      : (scorersByGameId.get(fixture.game.id) ?? []).map((raw) => {
          const consent = raw.participantId === null ? undefined : consentMap.get(raw.participantId);
          const eligible = consent !== undefined && isParticipantPubliclyEligible(consent, identityAsOf);
          const participant = raw.participantId === null ? undefined : participantById.get(raw.participantId);
          return {
            side: raw.side,
            participantName: eligible ? (participant?.displayNameSnapshot ?? null) : null,
            jerseyNumber: eligible ? (participant?.jerseyNumber ?? null) : null,
            clockMs: raw.clockMs,
          };
        });

  return {
    fixtureId: fixture.id,
    round: fixture.round,
    fixtureNumber: fixture.fixtureNumber,
    legNumber: fixture.legNumber,
    groupId: fixture.groupId,
    groupName: fixture.group?.name ?? null,
    scheduledAt: fixture.scheduledAt?.toISOString() ?? null,
    venue: fixture.venue,
    fieldName: fixture.field?.name ?? null,
    home: presentSide(fixture.homeRegistrationId, fixture.homeRegistration),
    away: presentSide(fixture.awayRegistrationId, fixture.awayRegistration),
    visibilityMode: mode as EffectiveMode,
    status,
    resultState: resolveResultState({
      currentRevisionState,
      supersedesId: fixture.game?.currentOfficialRevision?.supersedesId ?? null,
    }),
    scoreStatus,
    score: mode === 'status_only' ? null : showOfficialResult ? officialScore : liveScore,
    clock,
    scorers,
    hasVideo: fixture.videos.length > 0,
  };
}

function buildLineup(
  fixture: FixtureMatchRow,
  mode: EffectiveMode,
  consentMap: Map<string, ParticipantConsentEligibility>,
  identityAsOf: Date,
) {
  if (fixture.game === null) return null;
  if (mode === 'status_only') return null;
  if (
    mode === 'live' &&
    !isLineupPublished(
      { lineupAt: fixture.game.visibilityPolicy?.lineupAt ?? null, scheduledAt: fixture.scheduledAt },
      new Date(),
    )
  ) {
    return null;
  }

  type ParticipantRow = NonNullable<FixtureMatchRow['game']>['participants'][number];
  const bySide = new Map<string, ParticipantRow[]>();
  for (const participant of fixture.game.participants) {
    const list = bySide.get(participant.sideId) ?? [];
    list.push(participant);
    bySide.set(participant.sideId, list);
  }
  const home = fixture.game.sides.find((side) => side.sideKey === 'HOME') ?? null;
  const away = fixture.game.sides.find((side) => side.sideKey === 'AWAY') ?? null;

  const present = (sideId: string | undefined) =>
    (sideId ? (bySide.get(sideId) ?? []) : []).map((participant) => {
      const consent = consentMap.get(participant.id);
      const eligible = consent !== undefined && isParticipantPubliclyEligible(consent, identityAsOf);
      return {
        participantId: participant.id,
        displayName: eligible ? participant.displayNameSnapshot : null,
        jerseyNumber: participant.jerseyNumber,
        position: participant.position,
      };
    });

  return { home: present(home?.id), away: present(away?.id) };
}

function buildMvp(
  fixture: FixtureMatchRow,
  mode: EffectiveMode,
  currentRevisionState: 'OFFICIAL' | 'VOID' | null,
  consentMap: Map<string, ParticipantConsentEligibility>,
  identityAsOf: Date,
) {
  if (mode === 'status_only' || currentRevisionState !== 'OFFICIAL') return null;
  const mvpParticipantId = fixture.game?.currentOfficialRevision?.mvpParticipantId ?? null;
  if (mvpParticipantId === null) return null;
  const consent = consentMap.get(mvpParticipantId);
  if (consent === undefined || !isParticipantPubliclyEligible(consent, identityAsOf)) return null;
  const participant = (fixture.game?.participants ?? []).find((row) => row.id === mvpParticipantId);
  if (participant === undefined) return null;
  return { participantId: participant.id, displayName: participant.displayNameSnapshot };
}

/**
 * `v1_game_result_revisions.score` 에는 **서로 다른 두 형태**가 들어 있다. 둘 다
 * 정상적으로 생산된 값이라 리더가 양쪽을 다 읽어야 한다.
 *
 *   1) 평평한 형태 — 실시간 결과 확정 경로가 쓴다
 *      (`tournament-result-review.service.ts` 의 `score: { home, away, penalties? }`)
 *        `{ "home": 2, "away": 0 }`
 *   2) 중첩 형태 — 레거시 결과 백필이 쓴다
 *      (`games/migration/game-result-backfill.ts` 의 `ScoreSnapshot`)
 *        `{ "regulation": { "home": 3, "away": 0 }, "penalty": ..., "goals": [...],
 *           "incomplete": false, "provenance": "TOURNAMENT_FIXTURE_RESULT" }`
 *
 * 예전엔 1)만 인식해서, 백필로 넘어온 완료 경기가 전부 `scoreStatus: 'unavailable'`
 * 로 보였다(알파 실측: 21경기 전원). 저장된 값을 마이그레이션으로 한 형태로 통일하는
 * 방법도 있지만, 이미 두 형태가 공존하는 이력 데이터라 리더가 받아주는 쪽이 안전하다
 * — 통일은 별도 마이그레이션 과제로 남긴다.
 *
 * `regulation` 이 명시적으로 `null` 인 경우(완료됐지만 스코어가 기록되지 않은 소스,
 * `incomplete: true`)는 점수를 지어내지 않고 `null` 을 돌려준다.
 */
function parseScore(value: Prisma.JsonValue | null | undefined): { home: number; away: number } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const flat = readHomeAway(value);
  if (flat !== null) return flat;

  const regulation = (value as { regulation?: unknown }).regulation;
  if (typeof regulation === 'object' && regulation !== null && !Array.isArray(regulation)) {
    return readHomeAway(regulation);
  }
  return null;
}

function readHomeAway(value: object): { home: number; away: number } | null {
  const home = (value as { home?: unknown }).home;
  const away = (value as { away?: unknown }).away;
  if (typeof home !== 'number' || typeof away !== 'number') return null;
  return { home, away };
}
