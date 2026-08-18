import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, V1GameEventType, V1GameResultRevisionState, V1VisibilityMode } from '@prisma/client';
import type { GameScore } from '../games.types';
import { PrismaService } from '../../prisma/prisma.service';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { isBracketPublished, shouldHideParticipantIdentity } from '../../tournaments/tournament-detail.presenter';
// 골 이벤트 백필이 복원한 골의 "모르는 값" 판정 -- 대진표 쪽
// (`deriveTournamentFixtureOfficialGoals`)과 공개 기록 쪽이 같은 규칙을 써야 같은 골이
// 화면마다 다르게(0분 vs 표시 없음 / 전반 vs 기타) 보이지 않는다.
import { isMinuteUnknown, isPeriodUnknown } from '../../tournaments/tournament-fixture-official-result';
import {
  TournamentStaffAccessService,
  type TournamentStaffResource,
} from '../../tournaments/staff/tournament-staff-access.service';
import { decodeRecordCursor, encodeRecordCursor } from './public-cursor';
import {
  isParticipantPubliclyEligible,
  loadParticipantConsentEligibility,
  type ParticipantConsentEligibility,
} from './public-consent';
import { resolveLiveClock, resolvePeriodBreak, type PublicGameClock, type PublicPeriodBreak } from './public-clock';
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
      // 일정 카드 이벤트 요약(loadScheduleEvents)이 이름/등번호를 붙이는 데 쓴다 --
      // getMatch의 buildEvents/buildLineup과 동일한 원본 필드. `userId`는 표시 이름
      // 해석(resolveParticipantDisplayName)이 V1UserProfile을 조인하는 키다 --
      // getMatch의 FIXTURE_MATCH_SELECT와 동일한 이유로 추가했다.
      participants: { select: { id: true, sideId: true, userId: true, displayNameSnapshot: true, jerseyNumber: true } },
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
  // `fieldId` (issue #377) -- the scalar FK, not just the display-only
  // `field` relation below. Needed to build the same
  // `{ tournamentId, fixtureId, fieldId }` resource shape
  // `TournamentFixtureLineupService.authorizeAndResolveGameId` already uses,
  // so a field_operator's staff bypass here is scoped to their own field.
  fieldId: true,
  field: { select: { name: true } },
  videos: { select: { id: true, title: true, url: true }, orderBy: { sortOrder: 'asc' } },
  game: {
    select: {
      id: true,
      state: true,
      visibilityPolicy: { select: { mode: true, lineupAt: true } },
      sides: { select: { id: true, sideKey: true } },
      lineups: {
        select: { id: true, sideId: true, revision: true },
      },
      // `userId`는 표시 이름 해석(resolveParticipantDisplayName)이 V1UserProfile을
      // 조인하는 키다 -- 대회 등록 명단 연결용 신원(주석 위 V1GameParticipant.userId
      // 참고)과 동일한 컬럼을 재사용한다.
      participants: {
        select: {
          id: true,
          sideId: true,
          lineupId: true,
          userId: true,
          displayNameSnapshot: true,
          jerseyNumber: true,
          position: true,
        },
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

/** `loadParticipantNameProfiles`가 배치 조회하는 V1UserProfile 투영 -- 이름 표시
 * 해석(`resolveParticipantDisplayName`)에 필요한 4개 필드로 좁혀져 있다. */
type ParticipantNameProfileRow = {
  userId: string;
  realName: string | null;
  displayName: string | null;
  nickname: string;
  tournamentRealNameVisible: boolean;
};

/**
 * 일정 카드 요약에 실리는 한 건의 경기 이벤트 -- 골이거나 카드(경고/퇴장)다.
 * `loadScheduleEvents`가 DB 행에서 만들고 `presentScheduleEntry`가 동의(consent)
 * 게이팅을 거쳐 `scorers`/`cards` 두 배열로 갈라 응답에 싣는다. 이름/등번호가
 * 아직 붙어 있지 않은 중간 형태라 `participantId`만 들고 있다.
 */
type ScheduleEventRow = {
  type: 'GOAL' | 'CARD';
  cardColor: 'YELLOW' | 'RED' | null;
  side: 'home' | 'away';
  participantId: string | null;
  period: number | null;
  clockMs: number | null;
};

/**
 * DB의 `orderBy: [period, clockMs, sequence]`는 백필이 넣은 `period: 1`/`clockMs: 0`
 * 플레이스홀더를 진짜 값으로 믿고 정렬한다 -- 그래서 위 매핑이 그 둘을 null("모름")로
 * 내리고 나면 정렬 결과가 그 판단과 어긋난다. "몇 분인지 모른다"고 선언한 골이 정렬에서는
 * 맨 앞, 즉 "그 경기의 첫 골"이라는 또 다른 시각 주장을 하게 되는 것이다(실제 12분·55분
 * 골보다 위에 렌더된다).
 *
 * 그래서 매핑 뒤에 모르는 값을 뒤로 보낸다. 프론트가 이 순서를 그대로 믿는 쪽
 * (`match-detail-content.tsx`는 "서버가 이미 정렬해 내려주므로 버킷 안에서 절대 다시
 * 정렬하지 않는다")과 자기가 다시 정렬하는 쪽(`schedule-content.tsx`의
 * `clockMs ?? MAX_SAFE_INTEGER`)이 공존하는데, 후자가 이미 null을 뒤로 보내므로 서버가
 * 같은 규칙을 쓰지 않으면 **같은 골이 두 화면에서 정반대 위치**에 나타난다.
 *
 * `Array.prototype.sort`는 안정 정렬이라 알려진 값들 사이의 기존 순서(= DB가 준
 * period/clockMs/sequence 순서)는 그대로 보존된다.
 */
function byUnknownLast(
  a: { period: number | null; clockMs: number | null },
  b: { period: number | null; clockMs: number | null },
): number {
  const period = (a.period ?? Number.MAX_SAFE_INTEGER) - (b.period ?? Number.MAX_SAFE_INTEGER);
  if (period !== 0) return period;
  return (a.clockMs ?? Number.MAX_SAFE_INTEGER) - (b.clockMs ?? Number.MAX_SAFE_INTEGER);
}

@Injectable()
export class PublicTournamentRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TournamentStaffAccessService,
  ) {}

  async getSchedule(tournamentId: string, query: PublicTournamentScheduleQueryDto, user?: V1AuthUser) {
    const tournament = await this.prisma.v1Tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, title: true, status: true, bracketPublishedAt: true, bracketPublishScheduledAt: true },
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

    // 참가팀 공개 정책 통일(fix/v1-publish) -- 모집 중(open)에는 이 대회의 조 편성/
    // 일정 안 팀명도 participantTeams·TournamentsReadService의 groups/fixtures와
    // 동일한 조건으로 가린다("조별일정은 왜 그대로 보이나"가 이 정책 통일의 발단).
    // 이 조회는 특정 fixture 하나가 아니라 대회 전체 일정을 한 번에 내려주므로,
    // 스태프 우회는 fixture/field 단위가 아니라 대회 전체 단위(`{ tournamentId }`)로
    // 판정한다 -- TournamentsReadService.get()과 동일한 스코프 선택.
    const staffBypass = await this.resolveTournamentStaffBypass(user, tournamentId);
    const hideIdentity = shouldHideParticipantIdentity(tournament.status, staffBypass);

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
    const eventsByGameId = await this.loadScheduleEvents(allPageFixtures);
    const scorerParticipantIds = allPageFixtures.flatMap((fixture) =>
      (fixture.game?.participants ?? []).map((participant) => participant.id),
    );
    // 정책 공개(기본값)에서는 참가자 이름이 동의와 무관하게 항상 보이므로 이 맵을 아예
    // 채울 필요가 없다 -- 관전자 폴링으로 반복 호출되는 경로라 불필요한 조회 두 방을
    // 매 요청마다 던지지 않는다(loadLiveScores의 publicLiveEnabled 게이팅과 같은 이유).
    const consentMap = isTournamentParticipantNameGatingReverted()
      ? await loadParticipantConsentEligibility(this.prisma, scorerParticipantIds)
      : new Map<string, ParticipantConsentEligibility>();
    // 위 consentMap과 달리 이건 게이팅하지 않는다 -- "이름이 보이는가"가 아니라 "보이면
    // 어떤 이름인가"를 결정하는 조회라서 정책 공개 기본값에서도 매 요청 필요하다
    // (resolveParticipantDisplayName 위 doc comment 참고).
    const nameProfileByUserId = await this.loadParticipantNameProfiles(
      allPageFixtures.flatMap((fixture) => (fixture.game?.participants ?? []).map((participant) => participant.userId)),
    );

    const items = pageFixtures
      .map((fixture) =>
        presentScheduleEntry(
          fixture,
          publicLiveEnabled,
          liveScoreByGameId,
          eventsByGameId,
          consentMap,
          nameProfileByUserId,
          now,
          hideIdentity,
        ),
      )
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const unscheduled = rawUnscheduled
      .map((fixture) =>
        presentScheduleEntry(
          fixture,
          publicLiveEnabled,
          liveScoreByGameId,
          eventsByGameId,
          consentMap,
          nameProfileByUserId,
          now,
          hideIdentity,
        ),
      )
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const standings = await this.prisma.v1TournamentStanding.findMany({
      where: { group: { tournamentId } },
      orderBy: [{ groupId: 'asc' }, { position: 'asc' }],
      select: {
        groupId: true,
        // 팀명·로고가 hideIdentity로 가려질 때도 행마다 고유한 키가 남아야 한다
        // (teamId가 전부 null이 되면 React key가 충돌한다) — registrationId는 그
        // 재식별 경로가 없는 안전한 안정 키(위 presentSide 주석과 동일 근거).
        registrationId: true,
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
            registrationId: true,
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
        registrationId: groupTeam.registrationId,
        teamId: hideIdentity ? null : groupTeam.registration.team.id,
        teamName: hideIdentity ? null : groupTeam.registration.team.name,
        teamLogoUrl: hideIdentity ? null : (groupTeam.registration.team.profile?.logoUrl ?? null),
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
          registrationId: standing.registrationId,
          teamId: hideIdentity ? null : standing.registration.team.id,
          teamName: hideIdentity ? null : standing.registration.team.name,
          teamLogoUrl: hideIdentity ? null : (standing.registration.team.profile?.logoUrl ?? null),
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

  async getMatch(tournamentId: string, fixtureId: string, user: V1AuthUser | undefined) {
    const tournament = await this.prisma.v1Tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, title: true, status: true, bracketPublishedAt: true, bracketPublishScheduledAt: true },
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
    const score: PublicScoreValue | null =
      mode === 'status_only' ? null : showOfficialResult ? officialScore : liveScoreToPublicScore(liveScore);
    const clock: PublicGameClock | null =
      mode === 'live' && !showOfficialResult ? resolveLiveClock(fixture.game?.periods ?? [], new Date()) : null;
    // `clock`과 달리 `status === 'live'` 게이트가 하나 더 필요하다: `resolveLiveClock`은
    // LIVE 피리어드가 없으면 구조적으로 `null`이라 종료된 경기에서 게이트 없이도 값이
    // 생기지 않지만, `resolvePeriodBreak`는 피리어드가 전부 ENDED면 'regulation_ended'를
    // 반환한다 -- 게이트가 없으면 이미 `status === 'ended'`로 끝난 경기 응답에 "정규 시간
    // 종료"가 실려 `liveScore`(위 367행)의 게이트와 계약이 어긋난다.
    const periodBreak: PublicPeriodBreak | null =
      mode === 'live' && !showOfficialResult && status === 'live'
        ? resolvePeriodBreak(fixture.game?.periods ?? [])
        : null;

    const participantIds = (fixture.game?.participants ?? []).map((participant) => participant.id);
    // 정책 공개(기본값)에서는 이 맵이 쓰이지 않는다 -- 위 getSchedule과 동일한 이유로
    // 되돌린 상태(V1_TOURNAMENT_PARTICIPANT_NAMES_CONSENT_GATE=true)일 때만 조회한다.
    const consentMap = isTournamentParticipantNameGatingReverted()
      ? await loadParticipantConsentEligibility(this.prisma, participantIds)
      : new Map<string, ParticipantConsentEligibility>();
    // 위 consentMap과 달리 이건 게이팅하지 않는다 -- getSchedule과 동일한 이유
    // (resolveParticipantDisplayName 위 doc comment 참고).
    const nameProfileByUserId = await this.loadParticipantNameProfiles(
      (fixture.game?.participants ?? []).map((participant) => participant.userId),
    );
    const isStaffBypass = await this.resolveStaffBypass(user, tournamentId, fixtureId, fixture.fieldId);
    // 참가팀 공개 정책 통일(fix/v1-publish) — 이 경기의 home/away 팀명도 모집 중(open)엔
    // 가린다. 이 페이지는 fixture 하나만 다루므로 위에서 이미 계산한 fixture/field
    // 스코프 스태프 우회(isStaffBypass, 참가자 실명 우회와 동일)를 그대로 재사용한다.
    const hideIdentity = shouldHideParticipantIdentity(tournament.status, isStaffBypass);

    const lineup = buildLineup(fixture, mode, consentMap, nameProfileByUserId, isStaffBypass);
    const events =
      mode === 'status_only'
        ? []
        : await this.buildEvents(
            fixture.game?.id ?? null,
            fixture.game?.sides ?? [],
            fixture.game?.participants ?? [],
            consentMap,
            nameProfileByUserId,
            isStaffBypass,
          );
    const mvp = buildMvp(fixture, mode, currentRevisionState, consentMap, nameProfileByUserId, isStaffBypass);

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
      home: presentSide(fixture.homeRegistrationId, fixture.homeRegistration, hideIdentity),
      away: presentSide(fixture.awayRegistrationId, fixture.awayRegistration, hideIdentity),
      visibilityMode: mode,
      status,
      resultState,
      scoreStatus,
      score,
      clock,
      periodBreak,
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

  /**
   * Issue #377 -- a logged-in caller who is this exact fixture's assigned
   * tournament staff (not merely "staff of this tournament somewhere") sees
   * real participant names in `lineup`/`events`/`mvp` below, bypassing the
   * public consent gate the same way the operator's own authenticated
   * lineup/ops-console routes already do (`games.service.ts`'s
   * `listLineups`/`listOperationsLineups` return raw `displayNameSnapshot`
   * with no consent filter at all -- this route is the one PUBLIC surface
   * that still applied that filter even to staff, since `getMatch` never
   * threaded an actor through to the gate at all).
   *
   * Reuses `TournamentStaffAccessService.assertAccess` -- the exact same
   * authority `TournamentFixtureLineupService.authorizeAndResolveGameId`
   * already relies on for the ops lineup routes -- with the identical
   * `{ tournamentId, fixtureId, fieldId }` resource shape, so a
   * `FIELD_OPERATOR` scoped to one field is authorized here if and only if
   * they would also be authorized to read that field's lineup through the
   * ops console. This is deliberately a fixture/field-scoped check, never a
   * tournamentId-only one -- a field operator for Field B must still see
   * `WITHHELD_IDENTITY_LABEL` on a Field A fixture of the same tournament.
   *
   * `assertAccess` never returns a boolean -- it either resolves with a
   * `TournamentStaffPrincipal` (authorized) or throws `ForbiddenException`
   * (`STAFF_SCOPE_DENIED`, its only failure mode). This route is reachable
   * by an anonymous visitor (`OptionalV1AuthGuard`) and by an authenticated
   * fan with no staff assignment at all, so both of those must fall through
   * to the exact same redacted response an anonymous visitor gets -- never
   * a 403. `user === undefined` (anonymous) skips the check entirely rather
   * than calling `assertAccess` with a placeholder id; any other thrown
   * error is not this method's `STAFF_SCOPE_DENIED` denial and is left to
   * propagate (an infra/DB failure must not be silently reinterpreted as
   * "not staff").
   */
  private async resolveStaffBypass(
    user: V1AuthUser | undefined,
    tournamentId: string,
    fixtureId: string,
    fieldId: string | null,
  ): Promise<boolean> {
    if (user === undefined) return false;
    const resource: TournamentStaffResource =
      fieldId === null ? { tournamentId, fixtureId } : { tournamentId, fixtureId, fieldId };
    try {
      await this.access.assertAccess({ userId: user.id, action: 'read', resource });
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) return false;
      throw error;
    }
  }

  /**
   * 참가팀 공개 정책 통일(fix/v1-publish) -- `getSchedule`용 대회 전체 단위
   * 스태프 우회. 위 `resolveStaffBypass`와 달리 fixture/field로 좁히지 않는다
   * (`{ tournamentId }`만) -- 이 조회 자체가 특정 경기 하나가 아니라 대회 전체
   * 일정을 한 번에 내려주기 때문에, 그 응답 전체를 우회할 권한도 대회 전체
   * 단위로 판정하는 것이 맞다(TournamentsReadService.get()의 동일 이름 메서드와
   * 같은 스코프 선택 -- decideTournamentStaffAccess의 기존 정책을 그대로 따르는
   * 결과이지 새로 발명한 로직이 아니다: 특정 fixture/field로만 좁게 배정된
   * FIELD_OPERATOR는 자연히 이 우회 대상에서 제외된다).
   */
  private async resolveTournamentStaffBypass(user: V1AuthUser | undefined, tournamentId: string): Promise<boolean> {
    if (user === undefined) return false;
    try {
      await this.access.assertAccess({ userId: user.id, action: 'read', resource: { tournamentId } });
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) return false;
      throw error;
    }
  }

  private async isPublicLiveEnabled(): Promise<boolean> {
    const flag = await this.prisma.v1GameOperationFlag.findUnique({
      where: { key: 'PUBLIC_LIVE' },
      select: { value: true },
    });
    return flag?.value === 'on';
  }

  /**
   * 대회 경기 기록 실명 표시 토글(2026-08-18 사용자 결정) -- 이름이 보이는 참가자
   * (`resolveParticipantNameEligible`이 통과시킨 사람) 중 `userId`가 연결된 사람만
   * 골라 `V1UserProfile`을 한 번에 in 조회한다(N+1 금지, `loadLiveScores`/`loadScorers`와
   * 동일한 배치 패턴). 게스트(`userId === null`)는 조인 대상 자체가 아니므로 여기 오지
   * 않는다 -- 호출부(`resolveParticipantDisplayName`)가 그 경우 스냅샷으로 바로 분기한다.
   *
   * select를 `realName`/`displayName`/`nickname`/`tournamentRealNameVisible`로 좁혀
   * 응답에 생년월일·연락처 같은 다른 PII가 새로 실리지 않게 한다 -- 이 프로필 행은
   * 그대로 공개 응답 페이로드의 이름 문자열로 변환될 값이라 select 범위가 곧 노출 범위다.
   */
  private async loadParticipantNameProfiles(
    userIds: readonly (string | null)[],
  ): Promise<ReadonlyMap<string, ParticipantNameProfileRow>> {
    const uniqueUserIds = Array.from(new Set(userIds.filter((id): id is string => id !== null)));
    if (uniqueUserIds.length === 0) return new Map();
    const profiles = await this.prisma.v1UserProfile.findMany({
      where: { userId: { in: uniqueUserIds } },
      select: { userId: true, realName: true, displayName: true, nickname: true, tournamentRealNameVisible: true },
    });
    return new Map(profiles.map((profile) => [profile.userId, profile] as const));
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
    participants: readonly { id: string; userId: string | null; displayNameSnapshot: string; jerseyNumber: number | null }[],
    consentMap: Map<string, ParticipantConsentEligibility>,
    nameProfileByUserId: ReadonlyMap<string, ParticipantNameProfileRow>,
    isStaffBypass: boolean,
  ) {
    if (gameId === null) return [];
    const events = await this.prisma.v1GameEvent.findMany({
      where: { gameId },
      // 타임라인은 입력(append) 순서가 아니라 경기 시각순이어야 한다 -- sequence 는
      // 서버가 이벤트를 "받은" 순서일 뿐 경기 중 실제 발생 순서와 다를 수 있다
      // (알파 실측: CARD 4건 뒤에 더 이른 시각의 GOAL 이 붙어 나온 사고).
      // sequence 는 동시각(clockMs) tiebreak 용으로만 남긴다.
      orderBy: [{ period: 'asc' }, { clockMs: 'asc' }, { sequence: 'asc' }],
      select: {
        id: true,
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
        // 동의(consent) 게이트는 lineup과 정확히 동일하게 적용한다 -- eligible 이
        // false 면 participantId 와 마찬가지로 이름/등번호도 null. `isStaffBypass`
        // (issue #377) 는 이 동의 게이트만 건너뛴다 -- `participant` 조회 자체는
        // 아래에서 그대로 하므로, 라인업 스냅샷에 없는 참가자(`participant` undefined)
        // 라면 스태프 우회가 켜져 있어도 이름을 지어내지 않고 그대로 null 이다.
        const eligible = resolveParticipantNameEligible(isStaffBypass, consent);
        // 이름은 buildLineup 과 동일한 방식(resolveParticipantDisplayName, 2026-08-18
        // 닉네임 기본 + 프로필 토글)으로 뽑되, buildLineup 의 lineupAt(라인업 공개 시각)
        // 게이트는 따르지 않는다 -- 그 게이트는 "경기 전 선발 명단 노출"을 막는 규칙이고,
        // 골/카드 이벤트는 경기가 시작된 뒤에만 발생하므로 득점자를 보여주는 것이 선발
        // 명단을 미리 흘리는 것이 아니다.
        const participant = event.participantId === null ? undefined : participantById.get(event.participantId);
        return {
          type: event.type,
          cardColor: event.type === 'CARD' ? parseCardColor(event.payload) : null,
          sideId: event.sideId,
          // `sideId`는 스키마상 nullable(`String?`)이지만 GOAL/CARD 이벤트는 게임
          // 로직상 항상 한쪽 사이드에 귀속되므로 실질적으로는 null이 되지 않는다 --
          // 그래도 타입 안전을 위해 null이면 'away'로 접지(fail-safe)한다.
          side: sideKeyById.get(event.sideId ?? '') === 'HOME' ? ('home' as const) : ('away' as const),
          participantId: eligible ? event.participantId : null,
          participantName: eligible ? resolveParticipantDisplayName(participant, nameProfileByUserId) : null,
          jerseyNumber: eligible ? (participant?.jerseyNumber ?? null) : null,
          // 백필로 복원된 골은 `period: 1`로 저장돼 있지만 그건 컬럼이 non-null이라
          // 어쩔 수 없이 넣은 값이고 레거시 원본엔 전/후반 자체가 없었다 -- 그대로
          // 내보내면 이 타임라인이 `periodLabel(1)`="전반" 헤딩을 붙여 없던 사실을
          // 만든다. null이면 프론트가 이미 "기타" 구간으로 렌더한다.
          period: isPeriodUnknown(event.payload) ? null : event.period,
          // 백필로 복원된 "분 미상" 골은 `clockMs: 0`으로 저장돼 있으므로 그대로
          // 내보내면 "0:00 득점"이 된다 -- 표식이 있으면 시각을 아예 내리지 않는다
          // (`PublicMatchEvent.clockMs`는 이미 `number | null`이고, 프론트
          // `formatClock`/`isClockAbnormal`도 null을 "표시 없음"으로 다룬다).
          clockMs: isMinuteUnknown(event.payload) ? null : event.clockMs,
        };
      })
      .sort(byUnknownLast);
  }

  /**
   * 일정 카드 득점자 요약(D-24 확장) -- 페이지에 실린 모든 픽스처(예정/미정 전부)의
   * GOAL·CARD 이벤트를 한 번에 배치 조회한다. `loadLiveScores`와 같은 이유로 픽스처별
   * 쿼리를 피한다. `official_only`로 이미 끝난 경기도 득점자를 보여줘야 하므로
   * (schema 상 PUBLIC_LIVE 플래그는 LIVE 정책만 강등시킨다 -- `effectivePublicVisibilityMode`
   * 참고) `loadLiveScores`와 달리 이 메서드는 플래그로 게이팅하지 않고 항상 실행한다.
   * 이름/등번호로의 해석과 동의(consent) 게이팅은 호출자(`presentScheduleEntry`)가
   * `getMatch`의 `buildEvents`와 동일한 규칙으로 수행한다 -- 라인업 게이트와
   * 독립이라는 계약도 동일하게 유지된다.
   */
  private async loadScheduleEvents(
    fixtures: readonly FixtureScheduleRow[],
  ): Promise<ReadonlyMap<string, readonly ScheduleEventRow[]>> {
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
      // buildEvents 와 같은 이유로 시각순 -- sequence 는 tiebreak 용으로만 남긴다.
      orderBy: [{ period: 'asc' }, { clockMs: 'asc' }, { sequence: 'asc' }],
      // `payload`는 백필의 `minuteKnown: false` 표식을 읽기 위한 것 -- buildEvents가
      // 이미 같은 이유로 payload를 읽는다. 빠뜨리면 일정 카드에서만 "0′"가 뜬다.
      select: { id: true, gameId: true, type: true, sideId: true, participantId: true, period: true, clockMs: true, reversesEventId: true, payload: true },
    });
    const reversedIds = new Set(
      events.map((event) => event.reversesEventId).filter((id): id is string => id !== null),
    );
    const eventsByGame = new Map<string, typeof events>();
    for (const event of events) {
      // GOAL 과 CARD 만 일정 카드에 실린다 -- `buildEvents`(경기 상세 타임라인)가 고르는
      // 것과 정확히 같은 두 종류다. 취소(CORRECTION) 행은 `reversedIds` 를 만드는 데만
      // 쓰이고 자신은 요약에 들어가지 않는다.
      if (event.type !== 'GOAL' && event.type !== 'CARD') continue;
      if (reversedIds.has(event.id)) continue;
      const list = eventsByGame.get(event.gameId) ?? [];
      list.push(event);
      eventsByGame.set(event.gameId, list);
    }

    const result = new Map<string, ScheduleEventRow[]>();
    for (const fixture of fixturesWithGame) {
      const sideKeyById = new Map(fixture.game.sides.map((side) => [side.id, side.sideKey] as const));
      const rows = (eventsByGame.get(fixture.game.id) ?? []).map((event) => ({
        type: event.type === 'CARD' ? ('CARD' as const) : ('GOAL' as const),
        // 카드 색상은 payload 에만 있다 -- `buildEvents` 와 같은 파서를 쓴다. GOAL 이거나
        // 색을 모르는 과거 payload 면 null 이고, 그때 프론트는 색 대신 중립 카드로 그린다.
        cardColor: event.type === 'CARD' ? parseCardColor(event.payload) : null,
        // sideId nullable 방어(위 buildEvents와 동일한 fail-safe 규칙).
        side: (sideKeyById.get(event.sideId ?? '') === 'HOME' ? 'home' : 'away') as 'home' | 'away',
        participantId: event.participantId,
        // buildEvents와 동일한 규칙 -- 백필 복원 골은 전/후반을 모른다.
        period: isPeriodUnknown(event.payload) ? null : event.period,
        // buildEvents와 동일한 규칙 -- 분 미상 골은 시각을 내리지 않는다.
        clockMs: isMinuteUnknown(event.payload) ? null : event.clockMs,
      }));
      // 여기서는 `byUnknownLast` 로 다시 정렬하지 않는다 -- 일정 카드
      // (`schedule-content.tsx` 의 ScorerSummary)가 이미 `clockMs ?? MAX_SAFE_INTEGER`
      // 로 자기가 정렬하며 모르는 값을 뒤로 보낸다. 서버가 여기서 한 번 더 정렬하면
      // "DB가 준 순서를 그대로 넘긴다"는 이 메서드의 기존 계약만 흔들고(취소·재기록
      // 회귀 스펙이 그 순서를 고정하고 있다) 화면 결과는 달라지지 않는다.
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

/**
 * 대회 참가자 이름 공개 정책 (2026-08-13 결정 → 2026-08-18 갱신).
 *
 * ## 지금까지도 그대로인 것: "이름이 보이는가"
 * 대회 경기 기록(라인업/이벤트 득점자/MVP)에 **어떤 이름이든 하나가 붙는가**는
 * 2026-08-13 결정 그대로다 -- 계정 연동·동의(Task 24 consent) 여부와 무관하게 항상
 * 보인다. "대회에 선수로 등록해 실제로 뛰었다"는 사실 자체가 공개 활동이라는 전제,
 * 그리고 그 전제가 적용되는 모집단(`V1GameParticipant`, 게스트/미연동 참가자 포함)도
 * 바뀌지 않았다. 이 게이트는 여전히 `resolveParticipantNameEligible`이 맡고, 되돌리는
 * 방법(`V1_TOURNAMENT_PARTICIPANT_NAMES_CONSENT_GATE=true` 환경 변수)도 아래 그대로
 * 남아 있다 -- 재배포 없이 이전(Task 24 동의 게이팅)으로 즉시 돌아갈 수 있다.
 *
 * ## 2026-08-18에 바뀐 것: "보이면 어떤 이름인가"
 * 이름이 보이기로 정해진 다음, **그 이름이 실명인지 닉네임인지**는 이제 참가자 본인이
 * 프로필에서 켜고 끄는 스위치(`V1UserProfile.tournamentRealNameVisible`, 기본값
 * false)로 결정된다 -- 대회 신청 때마다 동의를 다시 묻지 않고, 한 번 켜면 이후 모든
 * 대회 기록에 계속 적용된다. 이전 정책은 이 지점에서 **항상 실명**(`displayNameSnapshot`,
 * 브라켓 생성 시점에 `V1TournamentPlayer.realName`에서 찍힌 스냅샷)을 썼다 -- 그게
 * "동의와 무관하게 공개"라는 표현이 실제로 뜻하던 값이었다. 지금은 그 자리를
 * `resolveParticipantDisplayName`(아래)이 대신한다:
 *   - `userId`가 없는 참가자(게스트/미연동)는 조인 대상이 아니므로 여전히
 *     `displayNameSnapshot` 그대로다 -- 이 경우는 전혀 바뀌지 않았다.
 *   - `userId`가 있는데 프로필이 없거나(온보딩 미완료 등) 토글이 없으면 실명 없이
 *     조용히 시작해야 하므로(fail-closed) 역시 스냅샷으로 접지한다.
 *   - `userId`가 있고 토글 OFF(기본값)면 `V1UserProfile.displayName ?? nickname`
 *     (닉네임)을 쓴다.
 *   - `userId`가 있고 토글 ON이면 `V1UserProfile.realName`(실명)을 쓰되, 그 필드가
 *     비어 있으면(실명을 아직 입력 안 한 채 토글만 켠 경우) 닉네임으로 방어적으로
 *     내려간다 -- 빈 이름을 보여주지 않기 위함이지 실명을 지어내는 게 아니다.
 *
 * `displayNameSnapshot`은 여전히 라인업/브라켓 생성 시점에 찍힌 불변 스냅샷이라
 * `V1User`로의 라이브 조인이 아예 없다(계정을 탈퇴해도 갱신되지 않는다, `roster-cleanup.ts`와
 * 동일한 "기록 보존" 원칙) -- 새 정책에서 그 스냅샷이 쓰이는 경우(게스트/프로필 없음)의
 * 성격도 그대로다. 반면 `userId`가 있는 참가자는 이제 **표시 시점에 매번**
 * `V1UserProfile`을 조인하므로(`loadParticipantNameProfiles`), 토글을 끄고 켜는 즉시
 * (재배포·재계산 없이) 다음 조회부터 반영된다 -- 스냅샷과 달리 이 경로는 라이브 값이다.
 *
 * `public-consent.ts`의 판정 로직 자체는 건드리지 않는다 -- 위 "이름이 보이는가" 게이트와
 * 그 롤백 경로, 그리고 이 파일 밖의 다른 두 소비자(`public-user-records.service.ts`의
 * 개인 기록, `team-match-series-public.service.ts`의 팀 매치 시리즈)가 여전히 그대로
 * 의존한다. `V1_TOURNAMENT_PARTICIPANT_NAMES_CONSENT_GATE`로 되돌렸을 때도
 * `resolveParticipantDisplayName`의 토글 기반 이름 선택은 그대로 적용된다 -- 그 환경
 * 변수가 통제하는 것은 "이름이 보이는가"뿐이고 "어떤 이름인가"는 이번 정책이 대체한
 * 별개의 축이라, 되돌린 상태에서도 실명 대신 닉네임 기본값이 유지되는 것이 맞다.
 */
function isTournamentParticipantNameGatingReverted(): boolean {
  return process.env.V1_TOURNAMENT_PARTICIPANT_NAMES_CONSENT_GATE === 'true';
}

/**
 * 라인업/이벤트/MVP 세 빌더와 일정 카드 득점자 요약이 공유하는 단일 판정. 기본(정책
 * 공개)일 때는 무조건 true -- `consent`는 건드리지도 않는다. 되돌렸을 때만 기존
 * 규칙(스태프 우회 OR 동의 eligible)을 그대로 재현한다. `isParticipantPubliclyEligible`
 * 자체가 시간 인자를 받지 않으므로(공개 동의 규칙 재정의, `public-consent.ts` 참고)
 * 이 함수도 시간 인자를 받지 않는다. 일정 카드 득점자 요약은 원래 `isStaffBypass`를
 * 받지 않았으므로(그 화면은 스태프 우회 자체가 없다) 그 호출부는 항상
 * `isStaffBypass=false`로 호출해 되돌린 상태에서도 기존 동작과 완전히 동일하게
 * 유지한다.
 */
function resolveParticipantNameEligible(
  isStaffBypass: boolean,
  consent: ParticipantConsentEligibility | undefined,
): boolean {
  if (!isTournamentParticipantNameGatingReverted()) return true;
  return isStaffBypass || (consent !== undefined && isParticipantPubliclyEligible(consent));
}

/**
 * "이름이 보이기로 정해진(eligible) 참가자에게 실제로 어떤 이름 문자열을 붙일지" --
 * 위 클래스 doc comment의 2026-08-18 표(닉네임 기본 + 프로필 토글)를 그대로 구현한다.
 * 이 함수는 `resolveParticipantNameEligible`이 이미 true를 반환한 뒤에만 호출되므로
 * "숨길지"는 다루지 않는다 -- 오직 "무엇을 보여줄지"만 결정한다.
 *
 * `participant`가 `undefined`(라인업 스냅샷에 없는 참가자 id를 이벤트가 참조하는 경우,
 * `buildEvents`의 기존 fail-safe와 동일한 상황)면 이름을 지어내지 않고 그대로 null이다.
 */
function resolveParticipantDisplayName(
  participant: { userId: string | null; displayNameSnapshot: string } | undefined,
  profileByUserId: ReadonlyMap<string, ParticipantNameProfileRow>,
): string | null {
  if (participant === undefined) return null;
  if (participant.userId === null) return participant.displayNameSnapshot;
  const profile = profileByUserId.get(participant.userId);
  if (profile === undefined) return participant.displayNameSnapshot;
  if (profile.tournamentRealNameVisible) {
    return profile.realName ?? profile.displayName ?? profile.nickname;
  }
  return profile.displayName ?? profile.nickname;
}

/**
 * `hideIdentity`(참가팀 공개 정책 통일, fix/v1-publish) -- true면 어느 팀이 이 경기의
 * home/away인지(teamId/teamName)를 가린다. registrationId는 그대로 남긴다(대회
 * 등록 단위 식별자일 뿐, `/teams/:id` 같은 공개 팀 조회로 실명을 되찾을 수 있는
 * teamId와 달리 그 자체로는 재식별 경로가 없다) -- "이 슬롯에 팀이 배정돼 있다"는
 * 사실 자체는 숨기지 않고, 그 팀이 누구인지만 가린다.
 */
function presentSide(
  registrationId: string | null,
  registration: { team: { id: string; name: string } } | null,
  hideIdentity: boolean,
): { registrationId: string; teamId: string | null; teamName: string | null } | null {
  if (registrationId === null || registration === null) return null;
  return {
    registrationId,
    teamId: hideIdentity ? null : registration.team.id,
    teamName: hideIdentity ? null : registration.team.name,
  };
}

function presentScheduleEntry(
  fixture: FixtureScheduleRow,
  publicLiveEnabled: boolean,
  liveScoreByGameId: ReadonlyMap<string, GameScore>,
  eventsByGameId: ReadonlyMap<string, readonly ScheduleEventRow[]>,
  consentMap: Map<string, ParticipantConsentEligibility>,
  nameProfileByUserId: ReadonlyMap<string, ParticipantNameProfileRow>,
  now: Date,
  hideIdentity: boolean,
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
  // `status === 'live'` 게이트가 `clock`보다 하나 더 필요한 이유는 getMatch의 쌍둥이
  // 주석(위)과 동일하다 -- `resolvePeriodBreak`는 피리어드가 전부 ENDED면 값을 반환하므로
  // 게이트 없이는 종료된 경기 카드에도 "정규 시간 종료"가 실린다.
  const periodBreak: PublicPeriodBreak | null =
    mode === 'live' && !showOfficialResult && status === 'live'
      ? resolvePeriodBreak(fixture.game?.periods ?? [])
      : null;

  // 경기 이벤트 요약 -- `status_only`는 결과 자체를 숨기므로 골·카드 요약도 함께 숨긴다.
  // "이름이 보이는가" 게이팅 규칙은 getMatch의 buildEvents와 정확히 동일하다: 동의
  // (consent)가 eligible일 때만 이름을 채우고, 아니면 시간만 남긴다. "보이면 어떤
  // 이름인가"는 resolveParticipantDisplayName(2026-08-18 닉네임 기본 + 프로필 토글)이
  // 정한다.
  const participantById = new Map((fixture.game?.participants ?? []).map((p) => [p.id, p] as const));
  const summarizedEvents =
    mode === 'status_only' || fixture.game === null
      ? []
      : (eventsByGameId.get(fixture.game.id) ?? []).map((raw) => {
          const consent = raw.participantId === null ? undefined : consentMap.get(raw.participantId);
          // 일정 카드 이벤트 요약은 스태프 우회가 없는 화면이라 항상 isStaffBypass=false
          // 로 호출한다(되돌린 상태에서도 기존 동작 그대로).
          const eligible = resolveParticipantNameEligible(false, consent);
          const participant = raw.participantId === null ? undefined : participantById.get(raw.participantId);
          return {
            type: raw.type,
            cardColor: raw.cardColor,
            side: raw.side,
            participantName: eligible ? resolveParticipantDisplayName(participant, nameProfileByUserId) : null,
            jerseyNumber: eligible ? (participant?.jerseyNumber ?? null) : null,
            period: raw.period,
            clockMs: raw.clockMs,
          };
        });
  // `scorers`는 골만 담는 기존 계약 그대로 유지한다(`type`/`cardColor` 없이) -- 이미
  // 배포된 클라이언트가 이 배열의 length 를 골 수로 읽고 있어 카드가 섞이면 곧장 오독이 된다.
  const scorers = summarizedEvents
    .filter((event) => event.type === 'GOAL')
    .map(({ type: _type, cardColor: _cardColor, ...goal }) => goal);
  const cards = summarizedEvents
    .filter((event) => event.type === 'CARD')
    .map(({ type: _type, ...card }) => card);

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
    home: presentSide(fixture.homeRegistrationId, fixture.homeRegistration, hideIdentity),
    away: presentSide(fixture.awayRegistrationId, fixture.awayRegistration, hideIdentity),
    visibilityMode: mode as EffectiveMode,
    status,
    resultState: resolveResultState({
      currentRevisionState,
      supersedesId: fixture.game?.currentOfficialRevision?.supersedesId ?? null,
    }),
    scoreStatus,
    score: mode === 'status_only' ? null : showOfficialResult ? officialScore : liveScoreToPublicScore(liveScore),
    clock,
    periodBreak,
    scorers,
    cards,
    hasVideo: fixture.videos.length > 0,
  };
}

function buildLineup(
  fixture: FixtureMatchRow,
  mode: EffectiveMode,
  consentMap: Map<string, ParticipantConsentEligibility>,
  nameProfileByUserId: ReadonlyMap<string, ParticipantNameProfileRow>,
  isStaffBypass: boolean,
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
  // 저장할 때마다 immutable lineup revision과 participant snapshot이 새로
  // 생긴다. 전체 participant를 side로만 묶으면 과거 저장본까지 합쳐지므로,
  // lineups에서 side별 가장 큰 revision의 id 하나만 선택한다. DB 반환 순서에
  // 기대지 않아 조회 옵션이 바뀌어도 최신 저장본 계약을 유지한다.
  const latestLineupBySide = new Map<string, { id: string; revision: number }>();
  for (const lineup of fixture.game.lineups) {
    const current = latestLineupBySide.get(lineup.sideId);
    if (current === undefined || lineup.revision > current.revision) {
      latestLineupBySide.set(lineup.sideId, { id: lineup.id, revision: lineup.revision });
    }
  }

  const bySide = new Map<string, ParticipantRow[]>();
  for (const participant of fixture.game.participants) {
    if (latestLineupBySide.get(participant.sideId)?.id !== participant.lineupId) continue;
    const list = bySide.get(participant.sideId) ?? [];
    list.push(participant);
    bySide.set(participant.sideId, list);
  }
  const home = fixture.game.sides.find((side) => side.sideKey === 'HOME') ?? null;
  const away = fixture.game.sides.find((side) => side.sideKey === 'AWAY') ?? null;

  const present = (sideId: string | undefined) =>
    (sideId ? (bySide.get(sideId) ?? []) : []).map((participant) => {
      const consent = consentMap.get(participant.id);
      const eligible = resolveParticipantNameEligible(isStaffBypass, consent);
      return {
        participantId: participant.id,
        displayName: eligible ? resolveParticipantDisplayName(participant, nameProfileByUserId) : null,
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
  nameProfileByUserId: ReadonlyMap<string, ParticipantNameProfileRow>,
  isStaffBypass: boolean,
) {
  if (mode === 'status_only' || currentRevisionState !== 'OFFICIAL') return null;
  const mvpParticipantId = fixture.game?.currentOfficialRevision?.mvpParticipantId ?? null;
  if (mvpParticipantId === null) return null;
  const consent = consentMap.get(mvpParticipantId);
  const eligible = resolveParticipantNameEligible(isStaffBypass, consent);
  if (!eligible) return null;
  const participant = (fixture.game?.participants ?? []).find((row) => row.id === mvpParticipantId);
  if (participant === undefined) return null;
  // participant가 정의돼 있으므로 resolveParticipantDisplayName은 null을 반환하지
  // 않는다(undefined 참가자일 때만 null) -- displayNameSnapshot 폴백은 그 계약을
  // 타입에도 그대로 반영하기 위한 방어일 뿐, 실질적으로는 항상 함수 반환값을 쓴다.
  const displayName = resolveParticipantDisplayName(participant, nameProfileByUserId) ?? participant.displayNameSnapshot;
  return { participantId: participant.id, displayName };
}

/**
 * 공개 응답의 `score`. 정규시간 스코어(`home`/`away`)에 더해, 결선(knockout)에서
 * 승부차기까지 간 경기만 `penalties` 가 채워진다 — 승부차기가 없었던 경기는 항상
 * `null` 이라 소비처가 "필드가 있는데 값이 null" 하나만 보면 된다(키 자체가 사라지는
 * 경우는 없다).
 */
type PublicScoreValue = {
  home: number;
  away: number;
  penalties: { home: number; away: number } | null;
};

/**
 * 라이브 집계 스코어(`tallyLiveScore`)는 정규시간 GOAL 이벤트만 센다 — 승부차기 킥은
 * `V1GameEvent` 로 아예 기록되지 않으므로(옵션 B, `apps/v1_web/src/lib/penalty-shootout.ts`
 * 의 설계 주석) 진행 중 스코어에는 승부차기가 존재할 수 없다. 그래서 `penalties` 를
 * "아직 모른다"가 아니라 확정적으로 `null` 로 채운다.
 */
function liveScoreToPublicScore(score: GameScore | null): PublicScoreValue | null {
  if (score === null) return null;
  return { home: score.home, away: score.away, penalties: null };
}

function parseCardColor(value: Prisma.JsonValue): 'YELLOW' | 'RED' | null {
  if (value === null || Array.isArray(value) || typeof value !== 'object') return null;
  const card = value.card;
  return card === 'YELLOW' || card === 'RED' ? card : null;
}

/**
 * `v1_game_result_revisions.score` 에는 **서로 다른 두 형태**가 들어 있다. 둘 다
 * 정상적으로 생산된 값이라 리더가 양쪽을 다 읽어야 한다.
 *
 *   1) 평평한 형태 — 실시간 결과 확정 경로가 쓴다
 *      (`tournament-result-review.service.ts` 의 `score: { home, away, penalties? }`)
 *        `{ "home": 2, "away": 0 }` / 승부차기까지 갔으면
 *        `{ "home": 1, "away": 1, "penalties": { "home": 4, "away": 3 } }`
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
 * **승부차기 필드 이름이 형태별로 다르다**: 평평한 형태는 `penalties`(복수), 중첩
 * 형태는 `penalty`(단수). 한쪽만 읽으면 그 형태로 저장된 경기에서만 승부차기가
 * 조용히 사라진다 — 이 저장소에서 이미 반복된 함정이라
 * (`apps/v1_api/src/tournaments/tournament-fixture-official-result.ts` 의
 * `parseTournamentFixtureOfficialScore` 가 같은 이유로 양쪽을 다 읽는다) 여기서도
 * 같은 기준으로 둘 다 읽는다.
 *
 * `regulation` 이 명시적으로 `null` 인 경우(완료됐지만 스코어가 기록되지 않은 소스,
 * `incomplete: true`)는 점수를 지어내지 않고 `null` 을 돌려준다.
 */
function parseScore(value: Prisma.JsonValue | null | undefined): PublicScoreValue | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const flat = readHomeAway(value);
  if (flat !== null) {
    return { ...flat, penalties: readHomeAway((value as { penalties?: unknown }).penalties) };
  }

  const regulation = readHomeAway((value as { regulation?: unknown }).regulation);
  if (regulation !== null) {
    return { ...regulation, penalties: readHomeAway((value as { penalty?: unknown }).penalty) };
  }
  return null;
}

function readHomeAway(value: unknown): { home: number; away: number } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const home = (value as { home?: unknown }).home;
  const away = (value as { away?: unknown }).away;
  if (typeof home !== 'number' || typeof away !== 'number') return null;
  return { home, away };
}
