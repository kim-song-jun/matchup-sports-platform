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

    const items = pageFixtures
      .map((fixture) => presentScheduleEntry(fixture, publicLiveEnabled, liveScoreByGameId, now))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const unscheduled = rawUnscheduled
      .map((fixture) => presentScheduleEntry(fixture, publicLiveEnabled, liveScoreByGameId, now))
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
        registration: { select: { team: { select: { id: true, name: true } } } },
      },
    });

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
      standings: standings.map((standing) => ({
        groupId: standing.groupId,
        groupName: standing.group.name,
        teamId: standing.registration.team.id,
        teamName: standing.registration.team.name,
        position: standing.position,
        points: standing.points,
        wins: standing.wins,
        draws: standing.draws,
        losses: standing.losses,
        goalsFor: standing.goalsFor,
        goalsAgainst: standing.goalsAgainst,
      })),
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
    const events = mode === 'status_only' ? [] : await this.buildEvents(fixture.game?.id ?? null, consentMap, identityAsOf);
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
    const events = await this.prisma.v1GameEvent.findMany({
      where: { gameId: { in: gameIds } },
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
      where: { gameId },
      select: { id: true, type: true, sideId: true, reversesEventId: true },
    });
    const sideKeyById = new Map(sides.map((side) => [side.id, side.sideKey] as const));
    return tallyLiveScore(events, sideKeyById);
  }

  private async buildEvents(
    gameId: string | null,
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
    return events
      .filter((event) => scoringTypes.has(event.type) && !reversedIds.has(event.id))
      .map((event) => {
        const consent = event.participantId === null ? undefined : consentMap.get(event.participantId);
        const eligible = consent !== undefined && isParticipantPubliclyEligible(consent, identityAsOf);
        return {
          type: event.type,
          sideId: event.sideId,
          participantId: eligible ? event.participantId : null,
          period: event.period,
          clockMs: event.clockMs,
        };
      });
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

function parseScore(value: Prisma.JsonValue | null | undefined): { home: number; away: number } | null {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { home?: unknown }).home === 'number' &&
    typeof (value as { away?: unknown }).away === 'number'
  ) {
    return { home: (value as { home: number }).home, away: (value as { away: number }).away };
  }
  return null;
}
