import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, V1GameEventType, V1GameLineupState, V1GameResultRevisionState, V1GameState, V1TeamMatchStatus, V1VisibilityMode } from '@prisma/client';
import type { GameScore } from '../games.types';
import { PrismaService } from '../../prisma/prisma.service';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { isBracketPublished, shouldHideParticipantIdentity } from '../../tournaments/tournament-detail.presenter';
import {
  findTournamentOnSurface,
  TOURNAMENT_KINDS,
} from '../../tournaments/tournament-surface-lookup';
// 골 이벤트 백필이 복원한 골의 "모르는 값" 판정 -- 대진표 쪽
// (`deriveTournamentFixtureOfficialGoals`)과 공개 기록 쪽이 같은 규칙을 써야 같은 골이
// 화면마다 다르게(0분 vs 표시 없음 / 전반 vs 기타) 보이지 않는다.
import {
  isMinuteUnknown,
  isPeriodUnknown,
  parseTournamentFixtureRevisionGoals,
  resolveGoalDisplaySideId,
} from '../../tournaments/tournament-fixture-official-result';
import {
  TournamentStaffAccessService,
  type TournamentStaffResource,
} from '../../tournaments/staff/tournament-staff-access.service';
import { decodeRecordCursor, encodeRecordCursor } from './public-cursor';
import { isParticipantPubliclyEligible, loadParticipantConsentEligibility, type ParticipantConsentEligibility } from './public-consent';
import { resolveLiveClock, resolvePeriodBreak, type PublicGameClock, type PublicPeriodBreak } from './public-clock';
import { tallyLiveScore } from './public-live-score';
import { effectivePublicVisibilityMode, isLineupPublished, publicFixtureStatus, resolveResultState } from './public-visibility';
import type { PublicTournamentScheduleQueryDto } from './dto/public-records-query.dto';
import {
  byUnknownLast,
  isTournamentParticipantNameGatingReverted,
  loadParticipantNameProfiles,
  parseCardColor,
  resolveParticipantDisplayName,
  resolveParticipantNameEligible,
  resolveParticipantProfileHref,
  type ParticipantNameProfileRow,
} from './participant-name-gating';

/**
 * A fixture/match this route never returns individually and never lists in
 * the schedule: the bracket has not been published yet, or the game's own
 * `V1GameVisibilityPolicy` resolves to `hidden`. Both collapse to the exact
 * same not-found response so a caller cannot distinguish "does not exist"
 * from "exists but hidden" -- the fail-closed default the todo requires.
 */
const NOT_FOUND = { code: 'TOURNAMENT_MATCH_NOT_FOUND', message: '경기 정보를 찾을 수 없어요.' } as const;
// 리그 대진 공개 기록(getLeagueFixtureRecord)의 404 — 위 NOT_FOUND 와 같은 fail-closed
// 원칙(존재하지 않는 것과 숨겨진 것을 구분해 주지 않는다)을 리그 도메인 코드로 낸다.
const LEAGUE_FIXTURE_NOT_FOUND = { code: 'LEAGUE_FIXTURE_NOT_FOUND', message: '경기 정보를 찾을 수 없어요.' } as const;
// getLeagueFixtureRecord 전용 — league-match-forfeit.service.ts 가 export 하는
// `FORFEIT_REASON_MARKER`(값: '[LEAGUE_FORFEIT]')와 **의도적으로 동일한 리터럴을
// 여기 복제**한다. import 로 그 상수를 끌어오면 이 파일(비인증 공개 read 경로)이
// `league-match-forfeit.service.ts → GamesService → team-schedules.service.ts` 로
// 이어지는 거대한 어드민/게임 엔진 mutation 모듈 그래프를 전부 끌고 들어온다 —
// 문자열 하나 때문에 이 read-only 프로젝션의 컴파일 단위가 그 그래프의 아무 파일
// (심지어 무관한 팀 일정 모듈)에도 깨질 수 있게 된다(실측: 이 값을 정정 중이던
// 세션이 team-schedules.service.ts 를 동시에 고치고 있어 그 경유로 ts-jest 컴파일이
// 막혔다). 값이 바뀌면 두 파일이 갈릴 수 있으나, 그 리스크보다 이 파일의 격리가
// 더 크다 — 몰수 판정 로직 자체는 다른 파일(league-match-public.service.ts 의
// isForfeit)도 같은 리터럴을 재사용하는 기존 패턴이다.
const LEAGUE_FORFEIT_REASON_MARKER = '[LEAGUE_FORFEIT]';
// 리그 도메인(league-match-public.service.ts)과 같은 상한 — 회고 STATS-1은 그 패턴의 복제다.
const PLAYER_RECORDS_LIMIT = 30;
// 어드민 추천 근거는 상위 후보만 필요하다 — chip 3개 + 여유분.
const ADMIN_PLAYER_RECORDS_LIMIT = 10;

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
  // finding #76: id도 함께 내려준다 -- fieldName만 있으면 소비처(my-staff-fixtures-client.tsx)가
  // 필드를 문자열로만 매칭해야 해서, 같은 이름의 필드가 두 개 생기면(이름 유일성 제약이
  // 없다) 담당자가 아닌 경기까지 "내 담당"으로 잘못 묶인다.
  field: { select: { id: true, name: true } },
  videos: { select: { id: true } },
  game: {
    select: {
      id: true,
      state: true,
      visibilityPolicy: { select: { mode: true, lineupAt: true } },
      // outcomeReason/outcomeNote — 일정 목록에서도 몰수·중단을 정상 종료와 구분하기 위한 것.
      // 경기 상세(FIXTURE_MATCH_SELECT)에만 있던 동안, 목록만 훑는 관전자에게는 몰수 0:0 과
      // 실제 0:0 무승부가 같아 보였다(alpha 실측: 순위표에 세 팀이 나란히 2점인데 그중
      // 두 경기가 몰수라는 사실을 목록 어디에서도 알 수 없었다).
      currentOfficialRevision: {
        select: {
          state: true,
          supersedesId: true,
          officialAt: true,
          score: true,
          goalEvents: true,
          outcomeReason: true,
          outcomeNote: true,
        },
      },
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

/**
 * 경기 상세 프로젝션이 게임(V1Game)에서 읽는 부분 — 대회 픽스처(getMatch)와 리그 대진
 * (getLeagueFixtureRecord)이 같은 셀렉트를 공유한다. 게임 엔진은 소스 종류
 * (TOURNAMENT_FIXTURE/TEAM_MATCH)와 무관하게 동일한 구조라, 여기서 갈리면 같은 골이
 * 화면마다 다르게 보인다.
 */
const GAME_MATCH_SELECT = {
  id: true,
  state: true,
  visibilityPolicy: { select: { mode: true, lineupAt: true } },
  sides: { select: { id: true, sideKey: true } },
  lineups: {
    select: { id: true, sideId: true, revision: true, state: true },
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
      // [P1-d] `position` 은 더 이상 읽지 않는다 — 공개 응답에서 뺐으므로(D4) 여기서
      // 계속 select 하면 안 쓰는 값을 나르는 셈이고, 다음 사람이 "이미 있으니 써도
      // 되겠지" 하고 다시 노출시킬 여지를 남긴다.
    },
  },
  currentOfficialRevision: {
    // outcomeReason/outcomeNote — 몰수·중단으로 끝난 경기를 관전자 화면에서 정상 종료와
    // 구분해 보여주기 위한 것. 점수만 내보내면 "왜 그 점수인지"가 공개 기록 어디에도
    // 없어서, 1차 대회에서 문제가 됐던 그 상태가 그대로 남는다.
    select: {
      state: true,
      supersedesId: true,
      officialAt: true,
      score: true,
      goalEvents: true,
      mvpParticipantId: true,
      outcomeReason: true,
      outcomeNote: true,
      // 리그 몰수(getLeagueFixtureRecord) 전용 — `[LEAGUE_FORFEIT]` 마커 감지에만
      // 쓴다(값 자체를 응답에 그대로 내보내지 않는다). getMatch(대회 경로)는 이 필드를
      // 읽지 않는다 — outcomeReason/outcomeNote 만으로 충분하다(L-F-forfeit-public-exposure).
      reason: true,
    },
  },
  // Lane 1 addition -- see FIXTURE_SCHEDULE_SELECT above.
  periods: { select: { number: true, state: true, startedAt: true, pausedTotalMs: true, pausedAt: true } },
} satisfies Prisma.V1GameSelect;

type GameMatchRow = Prisma.V1GameGetPayload<{ select: typeof GAME_MATCH_SELECT }>;

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
  game: { select: GAME_MATCH_SELECT },
} satisfies Prisma.V1TournamentFixtureSelect;

type FixtureMatchRow = Prisma.V1TournamentFixtureGetPayload<{ select: typeof FIXTURE_MATCH_SELECT }>;

type EffectiveMode = 'status_only' | 'live' | 'official_only';

/**
 * 일정 카드 요약에 실리는 한 건의 경기 이벤트 -- 골이거나 카드(경고/퇴장)다.
 * `loadScheduleEvents`가 DB 행에서 만들고 `presentScheduleEntry`가 동의(consent)
 * 게이팅을 거쳐 `scorers`/`cards` 두 배열로 갈라 응답에 싣는다. 이름/등번호가
 * 아직 붙어 있지 않은 중간 형태라 `participantId`만 들고 있다.
 */
type ScheduleEventRow = {
  type: 'GOAL' | 'OWN_GOAL' | 'CARD';
  cardColor: 'YELLOW' | 'RED' | null;
  side: 'home' | 'away';
  participantId: string | null;
  period: number | null;
  clockMs: number | null;
};

// `byUnknownLast`(period/clockMs unknown-last 정렬)는 이제 `./participant-name-gating`가
// 소유한다 -- 백필이 만든 "모른다"는 값을 뒤로 보내는 규칙은 팀 전적의 이벤트 요약도
// 그대로 필요해서 공유 파일로 옮겼다(위 import 참고).

@Injectable()
export class PublicTournamentRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TournamentStaffAccessService,
  ) {}

  /**
   * 회고 STATS-1: 대회 단위 개인 득점·도움 랭킹. 리그의
   * `league-match-public.service.ts#playerRecords`를 대회 도메인으로 복제한 것 —
   * 공식 리비전의 `V1GameResultParticipant` 집계, 공개동의 게이팅
   * (`isParticipantPubliclyEligible`), 0 기록 제외, 내림차순 LIMIT까지 같은 규칙이다.
   * 다른 점 두 가지만 기록한다:
   * - 대진 미공개(`isBracketPublished` false)면 목록을 비워 내린다 — 이 컨트롤러의
   *   다른 라우트들이 미공개 대진을 숨기는 정책과 같은 축.
   * - 랭킹 행은 정의상 전원이 동의+계정 연결이므로 `profileHref`를 함께 내린다
   *   (#707/#714에서 확립한 "열어도 되는지는 서버가 판단해 내린다" 관례).
   * 몰수·중단 경기는 별도 제외하지 않는다: 운영자가 스코어만 입력한 경기는
   * 참가자 스탯 행 자체가 없어 자연히 집계되지 않는다.
   */
  async getPlayerRecords(tournamentId: string) {
    const tournament = await findTournamentOnSurface(this.prisma, TOURNAMENT_KINDS, {
      where: { id: tournamentId },
      select: { id: true, bracketPublishedAt: true, bracketPublishScheduledAt: true },
    });
    if (tournament === null) {
      throw new NotFoundException(NOT_FOUND);
    }
    const empty = { tournamentId: tournament.id, goals: [], assists: [] };
    if (!isBracketPublished(tournament.bracketPublishedAt, tournament.bracketPublishScheduledAt)) {
      return empty;
    }

    const publicLiveEnabled = await this.isPublicLiveEnabled();
    const games = await this.prisma.v1Game.findMany({
      where: { tournamentFixture: { tournamentId }, currentOfficialRevisionId: { not: null } },
      select: { currentOfficialRevisionId: true, visibilityPolicy: { select: { mode: true } } },
    });
    // Lane 가시성 정책을 그대로 적용한다(리뷰 지적) — hidden 경기는 존재 자체가
    // 비공개(fail-closed: 정책 row 없음 = HIDDEN)이고, status_only는 점수도
    // 가리는 모드다(getMatch/presentScheduleEntry의 `mode === 'status_only'
    // ? null` 참조). 어느 쪽이든 그 경기의 득점·도움이 공개 랭킹에 실리면
    // 숨긴 결과가 간접 노출된다.
    const revisionIds = games
      .filter((game) => {
        const mode = effectivePublicVisibilityMode(game.visibilityPolicy?.mode ?? 'HIDDEN', publicLiveEnabled);
        return mode !== 'hidden' && mode !== 'status_only';
      })
      .map((game) => game.currentOfficialRevisionId)
      .filter((id): id is string => id !== null);
    if (revisionIds.length === 0) return empty;

    const allParticipantRows = await this.prisma.v1GameResultParticipant.findMany({
      where: { resultRevisionId: { in: revisionIds } },
      select: {
        participantId: true,
        goals: true,
        assists: true,
        resultRevision: { select: { officialAt: true } },
      },
    });
    // 0골·0도움 행은 최종 응답에서 전부 걸러진다 — 동의 3쿼리·프로필 조회 대상에
    // 넣을 이유가 없다(리뷰 지적). 합산에 0을 더하는 행이라 결과도 동일하다.
    const participantRows = allParticipantRows.filter((row) => row.goals > 0 || row.assists > 0);

    const eligibility = await loadParticipantConsentEligibility(
      this.prisma,
      participantRows.map((row) => row.participantId),
    );
    const totalsByUserId = new Map<string, { goals: number; assists: number }>();
    const profileHrefByUserId = new Map<string, string>();
    for (const row of participantRows) {
      const eligibilityRow = eligibility.get(row.participantId);
      if (eligibilityRow === undefined) continue;
      // officialAt null(공식 확정 안 됨)은 동의 판정과 무관한 별개 게이트 — 리그와 동일.
      if (row.resultRevision.officialAt === null || !isParticipantPubliclyEligible(eligibilityRow)) continue;
      const userId = eligibilityRow.linkedUserId!;
      // href는 lane 단일 소스 헬퍼로 생성한다 — 여기서 문자열을 직접 만들면
      // 동의 게이팅·인코딩 규칙이 두 곳으로 갈라진다(리뷰 지적). 이 지점은
      // eligibility를 이미 통과했으므로 반환은 항상 non-null이다.
      profileHrefByUserId.set(userId, resolveParticipantProfileHref(userId, eligibilityRow)!);
      const current = totalsByUserId.get(userId) ?? { goals: 0, assists: 0 };
      current.goals += row.goals;
      current.assists += row.assists;
      totalsByUserId.set(userId, current);
    }

    const userIds = [...totalsByUserId.keys()];
    const users = userIds.length === 0
      ? []
      : await this.prisma.v1User.findMany({
          where: { id: { in: userIds } },
          select: { id: true, profile: { select: { nickname: true, displayName: true, deletedAt: true } } },
        });
    // 탈퇴 처리(admin.service.ts)는 nickname을 `deleted_<8자>` 내부 식별자로 덮고
    // displayName에만 '탈퇴 회원'을 남긴다 — nickname만 쓰면 공개 응답에 식별자가
    // 그대로 노출된다. resolveParticipantDisplayName(participant-name-gating.ts)의
    // 탈퇴 방어와 같은 규칙이다(실명 공개 규칙은 랭킹 표면에 적용하지 않는다 —
    // 리그 랭킹도 nickname 표면이다).
    const nicknameByUserId = new Map(users.map((user) => [
      user.id,
      user.profile === null
        ? null
        : user.profile.deletedAt !== null
          ? user.profile.displayName ?? user.profile.nickname ?? null
          : user.profile.nickname ?? null,
    ]));

    const rows = userIds.map((userId) => ({
      userId,
      nickname: nicknameByUserId.get(userId) ?? null,
      profileHref: profileHrefByUserId.get(userId)!,
      ...totalsByUserId.get(userId)!,
    }));
    return {
      tournamentId: tournament.id,
      goals: rows.filter((row) => row.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, PLAYER_RECORDS_LIMIT),
      assists: rows.filter((row) => row.assists > 0).sort((a, b) => b.assists - a.assists).slice(0, PLAYER_RECORDS_LIMIT),
    };
  }

  /**
   * 회고 STATS-3: 수상 추천 근거용 **어드민 비게이팅** 랭킹. 위 공개 랭킹과 같은
   * 집계(공식 리비전의 V1GameResultParticipant)를 쓰되 공개동의 게이팅을 걸지
   * 않는다 — 동의 게이팅된 공개 랭킹으로 수상자를 고르면 미동의 1위가 조용히
   * 빠져 **틀린 추천**이 되기 때문이다(2026-08-25 A안 확정). 컨트롤러
   * (`AdminTournamentPlayerRecordsController`)가 활성 어드민만 통과시킨다.
   *
   * 공개 랭킹과 달리 **가시성 정책(hidden·status_only) 필터도 걸지 않는다** —
   * 숨김은 관중에 대한 정책이지 운영자에 대한 정책이 아니고, 수상 판단은 실제로
   * 치러진 모든 공식 결과를 근거로 해야 한다.
   *
   * 집계 키: 참가자의 `userId`가 있으면 사용자 단위(경기 간 합산), 없으면
   * 대회 안 정규화 이름 단위 — 계정 미연결 참가자는 이름 스냅샷 외에 게임 간
   * 동일인 판단 근거가 없다(어드민 통계 탭이 이미 같은 폴백을 쓴다). 이름·팀은
   * 마지막으로 본 스냅샷을 쓴다.
   */
  async getPlayerRecordsForAdmin(tournamentId: string) {
    // 없는 대회 id에 빈 200을 주면 클라이언트 오배선이 "데이터 없음"으로 위장된다
    // (리뷰 지적) — 공개 라우트와 달리 어드민 표면이라 명시적 코드를 쓴다.
    const tournament = await findTournamentOnSurface(this.prisma, TOURNAMENT_KINDS, {
      where: { id: tournamentId },
      select: { id: true },
    });
    if (tournament === null) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }
    const empty = { tournamentId, goals: [], assists: [] };
    const games = await this.prisma.v1Game.findMany({
      where: { tournamentFixture: { tournamentId }, currentOfficialRevisionId: { not: null } },
      select: { currentOfficialRevisionId: true },
    });
    const revisionIds = games
      .map((game) => game.currentOfficialRevisionId)
      .filter((id): id is string => id !== null);
    if (revisionIds.length === 0) return empty;

    const participantRows = await this.prisma.v1GameResultParticipant.findMany({
      where: { resultRevisionId: { in: revisionIds } },
      select: {
        participantId: true,
        goals: true,
        assists: true,
        resultRevision: { select: { officialAt: true } },
      },
    });
    // 0골·0도움 행은 응답에서 전부 걸러진다 — 공개 랭킹과 같은 사전 필터(비용 패리티).
    // "마지막 스냅샷" 갱신이 결정적이 되도록 officialAt(동률이면 participantId)로
    // 정렬한다 — findMany 순서는 무보장이라 그대로 두면 name/team이 실행마다
    // 흔들릴 수 있다(리뷰 지적).
    const officialRows = participantRows
      .filter((row) => row.resultRevision.officialAt !== null && (row.goals > 0 || row.assists > 0))
      .sort(
        (a, b) =>
          a.resultRevision.officialAt!.getTime() - b.resultRevision.officialAt!.getTime() ||
          a.participantId.localeCompare(b.participantId),
      );
    if (officialRows.length === 0) return empty;

    const participants = await this.prisma.v1GameParticipant.findMany({
      where: { id: { in: officialRows.map((row) => row.participantId) } },
      select: { id: true, userId: true, displayNameSnapshot: true, sideId: true },
    });
    const participantById = new Map(participants.map((participant) => [participant.id, participant]));
    const sideIds = [...new Set(participants.map((participant) => participant.sideId))];
    const sides = sideIds.length === 0
      ? []
      : await this.prisma.v1GameSide.findMany({
          where: { id: { in: sideIds } },
          select: { id: true, teamId: true },
        });
    const teamIdBySideId = new Map(sides.map((side) => [side.id, side.teamId]));
    const teamIds = [...new Set(sides.map((side) => side.teamId).filter((id): id is string => id !== null))];
    const teams = teamIds.length === 0
      ? []
      : await this.prisma.v1Team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } });
    const teamNameById = new Map(teams.map((team) => [team.id, team.name]));

    type AdminRecordRow = {
      userId: string | null;
      name: string;
      teamName: string | null;
      goals: number;
      assists: number;
    };
    const totalsByKey = new Map<string, AdminRecordRow>();
    for (const row of officialRows) {
      const participant = participantById.get(row.participantId);
      if (participant === undefined) continue;
      const key = participant.userId !== null
        ? `user:${participant.userId}`
        : `named:${participant.displayNameSnapshot.trim().normalize('NFKC').toLocaleLowerCase('ko-KR')}`;
      const teamId = teamIdBySideId.get(participant.sideId) ?? null;
      const teamName = teamId !== null ? teamNameById.get(teamId) ?? null : null;
      const current = totalsByKey.get(key) ?? {
        userId: participant.userId,
        name: participant.displayNameSnapshot,
        teamName,
        goals: 0,
        assists: 0,
      };
      current.goals += row.goals;
      current.assists += row.assists;
      // 마지막으로 본 스냅샷으로 갱신 — 개명·이적 시 최신 표기를 따른다.
      // teamName도 이름과 똑같이 무조건 대입한다: null 가드를 두면 "마지막
      // 스냅샷이 무팀"인 사실이 이전 팀명으로 가려진다(리뷰 지적).
      current.name = participant.displayNameSnapshot;
      current.teamName = teamName;
      totalsByKey.set(key, current);
    }

    const rows = [...totalsByKey.values()];
    return {
      tournamentId,
      goals: rows.filter((row) => row.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, ADMIN_PLAYER_RECORDS_LIMIT),
      assists: rows.filter((row) => row.assists > 0).sort((a, b) => b.assists - a.assists).slice(0, ADMIN_PLAYER_RECORDS_LIMIT),
    };
  }

  async getSchedule(tournamentId: string, query: PublicTournamentScheduleQueryDto, user?: V1AuthUser) {
    const tournament = await findTournamentOnSurface(this.prisma, TOURNAMENT_KINDS, {
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
    const nameProfileByUserId = await loadParticipantNameProfiles(
      this.prisma,
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
    const tournament = await findTournamentOnSurface(this.prisma, TOURNAMENT_KINDS, {
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
    // **항상 조회한다.** 이름 게이팅(되돌린 상태에서만 동작)에는 안 쓰이지만, 프로필 링크
    // (`resolveParticipantProfileHref`)는 정책 공개 기본값에서도 동의를 확인해야 하기
    // 때문이다 -- 예전처럼 게이팅 플래그로 감싸 두면 기본 운영 설정에서 이 맵이 비어
    // `profileHref` 가 **항상 null** 이 되어 링크가 하나도 생기지 않는다(Copilot 리뷰가
    // 잡은 결함). 배치 조회 1회라 N+1 이 아니고, getMatch 는 단일 경기라 대상도 적다.
    const consentMap = await loadParticipantConsentEligibility(this.prisma, participantIds);
    // 위 consentMap과 달리 이건 게이팅하지 않는다 -- getSchedule과 동일한 이유
    // (resolveParticipantDisplayName 위 doc comment 참고).
    const nameProfileByUserId = await loadParticipantNameProfiles(
      this.prisma,
      (fixture.game?.participants ?? []).map((participant) => participant.userId),
    );
    const isStaffBypass = await this.resolveStaffBypass(user, tournamentId, fixtureId, fixture.fieldId);
    // 참가팀 공개 정책 통일(fix/v1-publish) — 이 경기의 home/away 팀명도 모집 중(open)엔
    // 가린다. 이 페이지는 fixture 하나만 다루므로 위에서 이미 계산한 fixture/field
    // 스코프 스태프 우회(isStaffBypass, 참가자 실명 우회와 동일)를 그대로 재사용한다.
    const hideIdentity = shouldHideParticipantIdentity(tournament.status, isStaffBypass);

    const lineup = buildLineup(fixture, mode, consentMap, nameProfileByUserId, isStaffBypass);
    // finding #60: 종료(ended) 직후~공식 확정(officialize) 전 창에서는 위 714-717줄의
    // `liveScore` 게이트가 이미 닫혀 score=null("- : -")을 보여준다. 이벤트 타임라인이
    // status_only 만 게이팅하면 이 창에서 score는 비어 있는데 골 타임라인은 그대로 남아
    // 같은 화면이 서로 모순된 사실을 말한다 — pendingProjection이 식별하는 것과 같은
    // 창이므로 그 조건을 재사용해 이벤트도 함께 가린다.
    const hidePendingOfficialEvents = status === 'ended' && !showOfficialResult;
    const events =
      mode === 'status_only' || hidePendingOfficialEvents
        ? []
        : await this.buildEvents(
            fixture.game?.id ?? null,
            fixture.game?.sides ?? [],
            fixture.game?.participants ?? [],
            fixture.game?.currentOfficialRevision?.state === 'OFFICIAL'
              ? fixture.game.currentOfficialRevision.goalEvents
              : null,
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

    // finding #57: hideIdentity를 넘기지 않으면 이 경기의 home/away는 가려도
    // findNextMatch가 실명을 그대로 돌려줘, 두 팀 중 정의상 하나(이 경기 참가팀)가
    // 즉시 재식별된다 — home/away presentSide(아래 797-798줄)와 같은 스코프를 쓴다.
    const nextMatch = await this.findNextMatch(fixture, hideIdentity);

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
      // 몰수·중단 종결 표시. 정상 종료(NORMAL)면 null 이라 기존 화면 계약은 그대로다 —
      // 관전자에게 매번 "정상 종료"라고 말할 이유는 없다. 공식 결과가 공개된 경우에만
      // 내보낸다(showOfficialResult) — 아직 공개 전인 결과의 사유를 미리 흘리면 안 된다.
      // finding #58: `mode !== 'status_only'`를 함께 요구한다 — status_only는 위 723줄
      // `score`를 이미 null로 가리므로(docs/api/domains/public-records.md:285-291의
      // "점수와 사유는 함께 나가거나 함께 빠져야 한다" 불변식), 이 필드만 게이트가
      // 없으면 "- : -"인데 "몰수으로 종료된 경기예요"가 함께 뜨는 자기모순이 생긴다.
      outcome:
        mode !== 'status_only' &&
        showOfficialResult &&
        fixture.game?.currentOfficialRevision != null &&
        fixture.game.currentOfficialRevision.outcomeReason !== 'NORMAL'
          ? {
              reason: fixture.game.currentOfficialRevision.outcomeReason,
              note: fixture.game.currentOfficialRevision.outcomeNote,
            }
          : null,
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

  // 참가자 이름 프로필 배치 조회(`loadParticipantNameProfiles`)는 이제
  // `./participant-name-gating`가 소유한다 -- 팀 전적도 같은 조회를 그대로 재사용한다
  // (위 import 참고).

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
      where: { gameId: { in: gameIds }, OR: [{ type: { in: ['GOAL', 'OWN_GOAL'] } }, { reversesEventId: { not: null } }] },
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
      where: { gameId, OR: [{ type: { in: ['GOAL', 'OWN_GOAL'] } }, { reversesEventId: { not: null } }] },
      select: { id: true, type: true, sideId: true, reversesEventId: true },
    });
    const sideKeyById = new Map(sides.map((side) => [side.id, side.sideKey] as const));
    return tallyLiveScore(events, sideKeyById);
  }

  private async buildEvents(
    gameId: string | null,
    sides: readonly { id: string; sideKey: 'HOME' | 'AWAY' }[],
    participants: readonly { id: string; sideId: string; userId: string | null; displayNameSnapshot: string; jerseyNumber: number | null }[],
    officialGoalEvents: Prisma.JsonValue | null,
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
    const scoringTypes: ReadonlySet<V1GameEventType> = new Set(['GOAL', 'OWN_GOAL', 'CARD']);
    const revisionGoals = parseTournamentFixtureRevisionGoals(officialGoalEvents);
    const participantById = new Map(participants.map((participant) => [participant.id, participant] as const));
    const participantSideIdById = new Map(
      participants.map((participant) => [participant.id, participant.sideId] as const),
    );
    // 홈/원정 매핑을 이 자리에서 서버가 직접 해준다 -- `sideId` 는 클라이언트에서
    // 재구성할 수 없는 내부 id 라서, 라인업(lineup)이 아직 공개되지 않은 경기라도
    // (아래 참고: 이름/등번호가 라인업 게이트와 독립인 것과 같은 이유로) 타임라인을
    // 홈/원정으로 나눠 보여줄 수 있어야 한다.
    const sideKeyById = new Map(sides.map((side) => [side.id, side.sideKey] as const));
    const eventRows = events
      .filter(
        (event) =>
          scoringTypes.has(event.type) &&
          !reversedIds.has(event.id) &&
          (revisionGoals === null || event.type === 'CARD'),
      )
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
        const displaySideId = resolveGoalDisplaySideId(
          event.sideId ?? '',
          event.participantId,
          event.type === 'OWN_GOAL',
          participantSideIdById,
        );
        return {
          type: event.type,
          cardColor: event.type === 'CARD' ? parseCardColor(event.payload) : null,
          sideId: event.sideId,
          // `sideId`는 스키마상 nullable(`String?`)이지만 GOAL/CARD 이벤트는 게임
          // 로직상 항상 한쪽 사이드에 귀속되므로 실질적으로는 null이 되지 않는다 --
          // 그래도 타입 안전을 위해 null이면 'away'로 접지(fail-safe)한다.
          side: sideKeyById.get(displaySideId) === 'HOME' ? ('home' as const) : ('away' as const),
          participantId: eligible ? event.participantId : null,
          participantName: eligible ? resolveParticipantDisplayName(participant, nameProfileByUserId) : null,
          jerseyNumber: eligible ? (participant?.jerseyNumber ?? null) : null,
          profileHref: eligible ? resolveParticipantProfileHref(participant?.userId ?? null, consent) : null,
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
    if (revisionGoals === null) return eventRows;
    const revisionRows = revisionGoals.map((event) => {
      const consent = event.participantId === null ? undefined : consentMap.get(event.participantId);
      const eligible = resolveParticipantNameEligible(isStaffBypass, consent);
      const participant =
        event.participantId === null ? undefined : participantById.get(event.participantId);
      const displaySideId = resolveGoalDisplaySideId(
        event.sideId,
        event.participantId,
        event.ownGoal,
        participantSideIdById,
      );
      return {
        type: event.ownGoal ? ('OWN_GOAL' as const) : ('GOAL' as const),
        cardColor: null,
        sideId: event.sideId,
        side: sideKeyById.get(displaySideId) === 'HOME' ? ('home' as const) : ('away' as const),
        participantId: eligible ? event.participantId : null,
        participantName: eligible
          ? resolveParticipantDisplayName(participant, nameProfileByUserId)
          : null,
        jerseyNumber: eligible ? (participant?.jerseyNumber ?? null) : null,
        profileHref: eligible ? resolveParticipantProfileHref(participant?.userId ?? null, consent) : null,
        period: event.period,
        clockMs: event.minute === null ? null : event.minute * 60000,
      };
    });
    return [...eventRows, ...revisionRows].sort(byUnknownLast);
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
      if (event.type !== 'GOAL' && event.type !== 'OWN_GOAL' && event.type !== 'CARD') continue;
      if (reversedIds.has(event.id)) continue;
      const list = eventsByGame.get(event.gameId) ?? [];
      list.push(event);
      eventsByGame.set(event.gameId, list);
    }

    const result = new Map<string, ScheduleEventRow[]>();
    for (const fixture of fixturesWithGame) {
      const sideKeyById = new Map(fixture.game.sides.map((side) => [side.id, side.sideKey] as const));
      const participantSideIdById = new Map(
        fixture.game.participants.map((participant) => [participant.id, participant.sideId] as const),
      );
      const revisionGoals =
        fixture.game.currentOfficialRevision?.state === 'OFFICIAL'
          ? parseTournamentFixtureRevisionGoals(fixture.game.currentOfficialRevision.goalEvents)
          : null;
      const rows: ScheduleEventRow[] = (eventsByGame.get(fixture.game.id) ?? [])
        .filter((event) => revisionGoals === null || event.type === 'CARD')
        .map((event) => ({
        type:
          event.type === 'CARD'
            ? ('CARD' as const)
            : event.type === 'OWN_GOAL'
              ? ('OWN_GOAL' as const)
              : ('GOAL' as const),
        // 카드 색상은 payload 에만 있다 -- `buildEvents` 와 같은 파서를 쓴다. GOAL 이거나
        // 색을 모르는 과거 payload 면 null 이고, 그때 프론트는 색 대신 중립 카드로 그린다.
        cardColor: event.type === 'CARD' ? parseCardColor(event.payload) : null,
        // sideId nullable 방어(위 buildEvents와 동일한 fail-safe 규칙).
        side: (sideKeyById.get(
          resolveGoalDisplaySideId(
            event.sideId ?? '',
            event.participantId,
            event.type === 'OWN_GOAL',
            participantSideIdById,
          ),
        ) === 'HOME' ? 'home' : 'away') as 'home' | 'away',
        participantId: event.participantId,
        // buildEvents와 동일한 규칙 -- 백필 복원 골은 전/후반을 모른다.
        period: isPeriodUnknown(event.payload) ? null : event.period,
        // buildEvents와 동일한 규칙 -- 분 미상 골은 시각을 내리지 않는다.
        clockMs: isMinuteUnknown(event.payload) ? null : event.clockMs,
        }));
      if (revisionGoals !== null) {
        rows.push(
          ...revisionGoals.map((event) => ({
            type: event.ownGoal ? ('OWN_GOAL' as const) : ('GOAL' as const),
            cardColor: null,
            side:
              sideKeyById.get(
                resolveGoalDisplaySideId(
                  event.sideId,
                  event.participantId,
                  event.ownGoal,
                  participantSideIdById,
                ),
              ) === 'HOME'
                ? ('home' as const)
                : ('away' as const),
            participantId: event.participantId,
            period: event.period,
            clockMs: event.minute === null ? null : event.minute * 60000,
          })),
        );
      }
      // 여기서는 `byUnknownLast` 로 다시 정렬하지 않는다 -- 일정 카드
      // (`schedule-content.tsx` 의 ScorerSummary)가 이미 `clockMs ?? MAX_SAFE_INTEGER`
      // 로 자기가 정렬하며 모르는 값을 뒤로 보낸다. 서버가 여기서 한 번 더 정렬하면
      // "DB가 준 순서를 그대로 넘긴다"는 이 메서드의 기존 계약만 흔들고(취소·재기록
      // 회귀 스펙이 그 순서를 고정하고 있다) 화면 결과는 달라지지 않는다.
      result.set(fixture.game.id, rows);
    }
    return result;
  }

  /**
   * `hideIdentity`(finding #57) -- 이 경기의 home/away를 가릴 때(모집 중 대회)는
   * 다음 경기의 팀명도 함께 가려야 한다. 쿼리 조건이 이 경기의 registrationId 중
   * 하나를 요구하므로, 반환되는 `next.home`/`next.away` 중 한쪽은 정의상 방금
   * 가린 두 팀 중 하나와 같은 팀이다 -- 가리지 않으면 재식별 경로가 된다.
   */
  private async findNextMatch(fixture: FixtureMatchRow, hideIdentity: boolean) {
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
        ? { teamId: hideIdentity ? null : next.homeRegistration.team.id, teamName: hideIdentity ? null : next.homeRegistration.team.name }
        : null,
      away: next.awayRegistration
        ? { teamId: hideIdentity ? null : next.awayRegistration.team.id, teamName: hideIdentity ? null : next.awayRegistration.team.name }
        : null,
    };
  }

  /**
   * 리그 경기 공개 기록 — `GET /league-matches/:leagueId/fixtures/:teamMatchId/record`.
   *
   * 리그 대진은 생성 즉시 TEAM_MATCH 소스의 V1Game 이 붙는다
   * (league-match-admin.service.ts generateFixtures) — 즉 골·카드 타임라인, 라인업,
   * 공식 리비전, 몰수 사유, MVP 가 대회 픽스처와 **같은 엔진에 이미 저장돼 있다**.
   * 이 메서드는 getMatch 와 동일한 게임 프로젝션을 리그 대진에 적용한다.
   *
   * **응답 필드명은 getMatch(프론트 PublicMatchDetail)와 동일하게 유지한다** — 프론트
   * MatchDetailContent 컴포넌트를 분기 없이 재사용하기 위해서다. 그래서 리그 값이
   * 대회 이름의 자리에 실린다:
   *   - `tournamentId`/`tournamentTitle` ← 리그 id/제목 (컴포넌트는 tournamentId 를
   *     nextMatch 링크에만 쓰는데 리그는 nextMatch=null 이라 잘못된 링크가 생길 수 없다)
   *   - `round` ← 'N주차' 라벨(string 계약 — 대회의 'group'/'semi' 자리),
   *     `groupName` ← null (헤더가 `groupName ?? round` 를 찍으므로 round 가 그대로 보인다)
   * 대회 전용 개념은 리그에 없는 값으로 고정한다: 스태프 실명 우회 없음(리그 운영자는
   * 어드민 화면에서 본다 — 여기 공개 화면은 동의 게이팅 그대로), 참가팀 가리기 없음
   * (리그 참가팀은 순위표에 항상 공개), `nextMatch`/`fieldName` 은 null.
   * `videos` 는 리그 대진 영상 저장소(V1TeamMatchVideo — 어드민이
   * /admin/league-matches/:leagueId/videos 에서 등록)에서 내린다.
   */
  async getLeagueFixtureRecord(leagueId: string, teamMatchId: string) {
    const league = await this.prisma.v1League.findUnique({
      where: { id: leagueId },
      select: { id: true, title: true },
    });
    if (league === null) {
      throw new NotFoundException(LEAGUE_FIXTURE_NOT_FOUND);
    }

    const teamMatch = await this.prisma.v1TeamMatch.findFirst({
      where: { id: teamMatchId, leagueId, deletedAt: null },
      select: {
        id: true,
        startAt: true,
        placeName: true,
        status: true,
        hostTeam: { select: { id: true, name: true } },
        approvedApplicantTeam: { select: { id: true, name: true } },
        videos: { select: { id: true, title: true, url: true }, orderBy: { sortOrder: 'asc' } },
        game: { select: GAME_MATCH_SELECT },
      },
    });
    if (teamMatch === null) {
      throw new NotFoundException(LEAGUE_FIXTURE_NOT_FOUND);
    }

    const publicLiveEnabled = await this.isPublicLiveEnabled();
    const policyMode: V1VisibilityMode = teamMatch.game?.visibilityPolicy?.mode ?? 'HIDDEN';
    const mode = effectivePublicVisibilityMode(policyMode, publicLiveEnabled);
    if (mode === 'hidden') {
      throw new NotFoundException(LEAGUE_FIXTURE_NOT_FOUND);
    }

    const currentRevisionState = normalizeRevisionState(teamMatch.game?.currentOfficialRevision?.state);
    const resultState = resolveResultState({
      currentRevisionState,
      supersedesId: teamMatch.game?.currentOfficialRevision?.supersedesId ?? null,
    });
    const status = publicTeamMatchStatus(teamMatch.game?.state ?? null, teamMatch.status);

    const officialScore = parseScore(teamMatch.game?.currentOfficialRevision?.score);
    const officialAt = teamMatch.game?.currentOfficialRevision?.officialAt ?? null;
    const showOfficialResult = currentRevisionState === 'OFFICIAL' && officialScore !== null && officialAt !== null;
    // getMatch 의 Lane 1 트윈 — 진행 중(라이브)인 리그 경기의 관중 스코어.
    const liveScore =
      !showOfficialResult && mode === 'live' && status === 'live' && teamMatch.game !== null
        ? await this.computeLiveScore(teamMatch.game.id, teamMatch.game.sides)
        : null;
    const scoreStatus: 'unavailable' | 'live' | 'official' = showOfficialResult
      ? 'official'
      : liveScore !== null
        ? 'live'
        : 'unavailable';
    const score: PublicScoreValue | null =
      mode === 'status_only' ? null : showOfficialResult ? officialScore : liveScoreToPublicScore(liveScore);
    const clock: PublicGameClock | null =
      mode === 'live' && !showOfficialResult ? resolveLiveClock(teamMatch.game?.periods ?? [], new Date()) : null;
    // getMatch 와 같은 이유로 status === 'live' 게이트가 하나 더 필요하다 — 그 주석 참고.
    const periodBreak: PublicPeriodBreak | null =
      mode === 'live' && !showOfficialResult && status === 'live'
        ? resolvePeriodBreak(teamMatch.game?.periods ?? [])
        : null;

    const participantIds = (teamMatch.game?.participants ?? []).map((participant) => participant.id);
    // getMatch 와 동일: 프로필 링크의 동의 확인 때문에 항상 조회한다(그쪽 주석 참고).
    const consentMap = await loadParticipantConsentEligibility(this.prisma, participantIds);
    const nameProfileByUserId = await loadParticipantNameProfiles(
      this.prisma,
      (teamMatch.game?.participants ?? []).map((participant) => participant.userId),
    );

    const lineup = buildLineup(
      { game: teamMatch.game, scheduledAt: teamMatch.startAt },
      mode,
      consentMap,
      nameProfileByUserId,
      false,
    );
    // finding #60: getMatch 와 동일한 창(종료~공식 확정 전)에 대한 트윈 게이트.
    const hidePendingOfficialEvents = status === 'ended' && !showOfficialResult;
    const events =
      mode === 'status_only' || hidePendingOfficialEvents
        ? []
        : await this.buildEvents(
            teamMatch.game?.id ?? null,
            teamMatch.game?.sides ?? [],
            teamMatch.game?.participants ?? [],
            teamMatch.game?.currentOfficialRevision?.state === 'OFFICIAL'
              ? teamMatch.game.currentOfficialRevision.goalEvents
              : null,
            consentMap,
            nameProfileByUserId,
            false,
          );
    const mvp = buildMvp({ game: teamMatch.game }, mode, currentRevisionState, consentMap, nameProfileByUserId, false);

    const history =
      teamMatch.game === null
        ? []
        : await this.prisma.v1GameResultRevision.findMany({
            where: { gameId: teamMatch.game.id, state: { in: ['OFFICIAL', 'VOID'] } },
            orderBy: { revision: 'asc' },
            select: { revision: true, state: true, officialAt: true, reason: true, supersedesId: true },
          });

    const weekNumber = await this.resolveLeagueWeekNumber(leagueId, teamMatch.startAt);

    return {
      tournamentId: league.id,
      tournamentTitle: league.title,
      fixtureId: teamMatch.id,
      gameId: teamMatch.game?.id ?? null,
      // PublicMatchDetail.round 는 string 계약(대회는 'group'/'semi' 같은 라벨) —
      // 숫자를 그대로 내리면 소비처의 문자열 처리에서 깨진다(Copilot 리뷰 #747).
      round: `${weekNumber}주차`,
      fixtureNumber: 1,
      legNumber: 1,
      groupId: null,
      groupName: null,
      scheduledAt: teamMatch.startAt.toISOString(),
      venue: teamMatch.placeName,
      fieldName: null,
      // 리그 대진은 등록(registration) 개념이 없다 — teamId 를 그대로 안정적 id 로 쓴다.
      home: { registrationId: teamMatch.hostTeam.id, teamId: teamMatch.hostTeam.id, teamName: teamMatch.hostTeam.name },
      away: teamMatch.approvedApplicantTeam
        ? {
            registrationId: teamMatch.approvedApplicantTeam.id,
            teamId: teamMatch.approvedApplicantTeam.id,
            teamName: teamMatch.approvedApplicantTeam.name,
          }
        : null,
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
      // getMatch 와 동일한 게이트 — 공식 결과가 공개된 몰수·중단만 사유를 내보낸다.
      // finding #58: mode !== 'status_only' 도 같은 이유로 함께 요구한다(getMatch 참고).
      //
      // getMatch(대회 경로)와 달리 이 리그 경로는 outcomeNote 를 절대 그대로 내보내지
      // 않는다. 대회의 outcomeReason/outcomeNote 는 처음부터 공개용으로 설계된 채널이지만,
      // 리그 대진의 이 컬럼을 채우는 유일한 writer 는 league-match-forfeit.service 이고
      // 그 서비스의 명시 계약은 정반대다: "사유 원문은 공개하지 않는다 — 운영자가 쓴
      // 자유 텍스트라 그대로 노출하면 내부 메모가 새어 나간다. 읽는 쪽은 boolean 만
      // 만들고 문자열은 버려야 한다." 그 서비스는 컬럼(outcomeReason='FORFEIT' +
      // outcomeNote=사유 원문)과 레거시 `[LEAGUE_FORFEIT]` reason 마커 두 채널을 함께
      // 쓰므로(과거 리비전 호환), 몰수 감지도 두 채널을 모두 인정하되 응답에는 boolean
      // 만 싣는다 — note 는 항상 null. 사유 원문은 아래 history 매핑에서도 걸러낸다
      // (같은 발견의 두 증상, 한 커밋으로 함께 해결).
      //
      // `.includes` (not `.startsWith`, reason 마커 판정): 몰수 결과가 정정되면 reason 이
      // `[LEAGUE_RESULT_CORRECTION] [LEAGUE_FORFEIT] ...` 로 마커가 앞이 아니게
      // 바뀐다(league-match-result-entry.service.ts:707-709, 몰수 표식을 정정 후에도
      // 잃지 않으려는 의도적 설계). isForfeit 배지(league-match-public.service.ts:348)도
      // 같은 `.includes` 판정을 쓰므로, 순위표·대진 목록의 "몰수" 배지와 이 상세 화면의
      // 안내가 정정 이후에도 계속 같은 결론을 내야 한다.
      outcome:
        mode !== 'status_only' && showOfficialResult && teamMatch.game?.currentOfficialRevision != null
          ? teamMatch.game.currentOfficialRevision.outcomeReason !== 'NORMAL' ||
            (teamMatch.game.currentOfficialRevision.reason?.includes(LEAGUE_FORFEIT_REASON_MARKER) ?? false)
            ? {
                reason:
                  teamMatch.game.currentOfficialRevision.outcomeReason !== 'NORMAL'
                    ? teamMatch.game.currentOfficialRevision.outcomeReason
                    : ('FORFEIT' as const),
                note: null,
              }
            : null
          : null,
      pendingProjection: mode === 'live' && resultState === 'pending' && (status === 'live' || status === 'ended'),
      history: history.map((revision) => {
        // 몰수 사유는 운영자가 쓴 자유 텍스트라 공개하지 않는다 — league-match-forfeit.service
        // 의 명시 계약("읽는 쪽은 boolean 만 만들고 문자열은 버려야 한다"). 마커만 벗겨
        // 원문을 그대로 내보내던 것이 결함이었다: 위 outcome 필드가 몰수 사실(boolean)을
        // 이미 전달하므로, history 에서는 이 리비전의 사유를 통째로 null 로 만든다.
        //
        // `.includes` 여야 한다(`.startsWith` 아님). 정상 결과를 나중에 몰수로 '정정'하면
        // reason 이 `[LEAGUE_RESULT_CORRECTION] [LEAGUE_FORFEIT] <운영자 자유 텍스트>` 가
        // 되어 마커가 맨 앞이 아니다 — startsWith 로는 이 경우가 아래 분기로 떨어져
        // 마커만 벗겨진 운영자 원문이 그대로 공개됐다. 바로 위 outcome.isForfeit 판정이
        // 이미 `.includes` 를 쓰고 있어서 같은 파일 안에서 판정 기준이 어긋나 있었다.
        if (revision.reason?.includes(LEAGUE_FORFEIT_REASON_MARKER)) {
          return {
            revision: revision.revision,
            state: revision.state,
            officialAt: revision.officialAt?.toISOString() ?? null,
            reason: null,
            isCorrection: revision.supersedesId !== null,
          };
        }
        return {
          revision: revision.revision,
          state: revision.state,
          officialAt: revision.officialAt?.toISOString() ?? null,
          // 리그 결과 입력·정정 경로는 감사용 코드 마커("[LEAGUE_RESULT_ENTRY] ...",
          // league-match-result-entry.service.ts)를 reason 앞에 붙여 저장한다 — 관전자
          // 화면(결과 변경 이력)에 그대로 나가면 기술 문구다(alpha 실측 2026-08-25).
          // 표시에서만 마커를 벗긴다 — DB 의 감사 기록 원문은 그대로다.
          //
          // 마커를 하나가 아니라 **연속으로 전부** 벗긴다: 리그 결과 경로는 마커를 겹쳐
          // 붙일 수 있어서(`[LEAGUE_RESULT_ENTRY] [X] ...`) 하나만 벗기면 남은 마커가
          // 그대로 노출된다. 몰수 마커가 섞인 리비전은 위 분기에서 이미 통째로 null 이
          // 되므로 여기 오는 것은 공개해도 되는 사유뿐이다 — 원문은 유지하고 마커만 뗀다.
          reason: revision.reason === null ? null : revision.reason.replace(/^(\[[A-Z0-9_]+\]\s*)+/, ''),
          isCorrection: revision.supersedesId !== null,
        };
      }),
      videos: teamMatch.videos.map((video) => ({ id: video.id, title: video.title, url: video.url })),
      nextMatch: null,
    };
  }

  /**
   * 주차 라벨 — 리그 대진은 주 단위 템플릿으로 일괄 생성되므로(weeksCount) KST 기준
   * "몇 번째 경기 날짜인가"가 곧 주차다. 리그 상세 화면(league-fixture-detail-client)의
   * 클라이언트 파생과 같은 규칙을 쓴다 — 같은 경기가 화면마다 다른 주차로 불리면 안 된다.
   */
  private async resolveLeagueWeekNumber(leagueId: string, startAt: Date): Promise<number> {
    const fixtures = await this.prisma.v1TeamMatch.findMany({
      // 이후 주차의 대진은 이 경기의 순번에 영향을 주지 않는다 — 더 이른 KST 날짜의
      // 대진은 전부 startAt 이 더 작고, 같은 날짜의 늦은 대진은 잘려도 그 날짜 자체가
      // 이 경기로 이미 세어진다. 라이브 폴링(10초)마다 리그 전체를 훑지 않기 위한
      // 범위 축소다(Copilot 리뷰 #747).
      where: { leagueId, deletedAt: null, startAt: { lte: startAt } },
      select: { startAt: true },
    });
    const days = Array.from(new Set(fixtures.map((fixture) => KST_DAY.format(fixture.startAt)))).sort();
    const index = days.indexOf(KST_DAY.format(startAt));
    return index >= 0 ? index + 1 : 1;
  }
}

const KST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });

/**
 * 팀매치(리그 대진)의 공개 진행 상태 — `publicFixtureStatus` 와 같은 "게임 상태 우선"
 * 규칙이되, 폴백 축이 V1TournamentFixtureStatus 가 아니라 V1TeamMatchStatus 다.
 * 리그 대진은 생성 즉시 V1Game 이 붙으므로 이 폴백은 방어용이다(pre-Task-6 행 등).
 */
const TEAM_MATCH_STATUS_TO_PUBLIC_STATUS: Record<V1TeamMatchStatus, 'scheduled' | 'live' | 'ended' | 'cancelled'> = {
  recruiting: 'scheduled',
  closed: 'scheduled',
  matched: 'scheduled',
  completed: 'ended',
  cancelled: 'cancelled',
  // 보관(archived)은 끝난 경기의 정리 상태다 — 취소로 보이면 치러진 기록과 모순된다.
  archived: 'ended',
};

function publicTeamMatchStatus(gameState: V1GameState | null, teamMatchStatus: V1TeamMatchStatus) {
  if (gameState !== null) {
    // 게임이 있으면 publicFixtureStatus 와 완전히 같은 매핑을 탄다 — fixtureStatus
    // 인자는 gameState 가 null 이 아닌 한 읽히지 않는다(public-visibility.ts).
    return publicFixtureStatus({ gameState, fixtureStatus: 'scheduled' });
  }
  return TEAM_MATCH_STATUS_TO_PUBLIC_STATUS[teamMatchStatus] ?? 'scheduled';
}

function normalizeRevisionState(state: V1GameResultRevisionState | undefined): 'OFFICIAL' | 'VOID' | null {
  return state === 'OFFICIAL' || state === 'VOID' ? state : null;
}

// 대회 참가자 이름 공개 정책(2026-08-13 결정 → 2026-08-18 갱신)과 그 판정 함수
// (`isTournamentParticipantNameGatingReverted`/`resolveParticipantNameEligible`/
// `resolveParticipantDisplayName`)은 이제 `./participant-name-gating`가 소유한다 --
// 팀 전적 API(D-24 확장)의 이벤트 요약도 정확히 같은 규칙을 써야 해서 옮겼다
// (그 파일의 doc comment에 전체 정책 문서가 그대로 있다).

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
  // finding #60: getMatch/getLeagueFixtureRecord와 동일한 트윈 게이트 — 종료됐지만
  // 아직 공식 확정 전인 경기는 score가 이미 null(위 clock 게이트 참고)이므로 득점자
  // 요약도 함께 비운다.
  const hidePendingOfficialEvents = status === 'ended' && !showOfficialResult;
  const participantById = new Map((fixture.game?.participants ?? []).map((p) => [p.id, p] as const));
  const summarizedEvents =
    mode === 'status_only' || hidePendingOfficialEvents || fixture.game === null
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
    .filter((event) => event.type === 'GOAL' || event.type === 'OWN_GOAL')
    .map(({ type, cardColor: _cardColor, ...goal }) =>
      type === 'OWN_GOAL' ? { ...goal, ownGoal: true as const } : goal,
    );
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
    // finding #76: fieldId도 함께 내려준다 -- 위 FIXTURE_SCHEDULE_SELECT의 field.id 참고.
    // 소비처(my-staff-fixtures-client.tsx)가 이제 이 값으로 담당 경기를 매칭한다
    // (이름은 유일하지 않아 동명 필드가 생기면 오배정된다).
    fieldId: fixture.field?.id ?? null,
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
    // **이 뷰의 점수 공개 게이트를 그대로 따른다.** outcome 전용 조건을 따로 만들지
    // 않는 이유: 목록이 `0:0` 은 보여주면서 그게 몰수라는 사실만 감추면, 이 필드를
    // 추가한 목적 자체가 무너진다 — 점수와 사유는 함께 나가거나 함께 빠져야 한다.
    // finding #58: 그 "점수 공개 게이트"는 `showOfficialResult` 단독이 아니라 위 1630줄
    // `score`가 실제로 쓰는 `mode === 'status_only' ? null : ...`까지 포함해야 이
    // 주석의 의도가 실제로 지켜진다 — `showOfficialResult`만 보면 status_only 모드에서
    // score=null인데 outcome은 그대로 새는 자기모순이 생겼었다.
    //
    // 알려진 차이: 상세(`getMatch`)의 `showOfficialResult` 는 `officialAt !== null` 까지
    // 요구하지만 이 목록은 요구하지 않는다(이 PR 이전부터 **점수**에 대해 그랬다). 따라서
    // `officialAt` 이 빈 레거시 OFFICIAL 리비전은 목록에만 점수와 사유가 함께 뜬다. 그
    // 게이트 차이를 좁히는 것은 기존 점수 노출 동작을 바꾸는 별개 변경이라 여기서 하지
    // 않는다(`schedule-scorers.spec.ts` 가 현재 동작을 고정한다).
    outcome:
      mode !== 'status_only' &&
      showOfficialResult &&
      fixture.game?.currentOfficialRevision != null &&
      fixture.game.currentOfficialRevision.outcomeReason !== 'NORMAL'
        ? {
            reason: fixture.game.currentOfficialRevision.outcomeReason,
            note: fixture.game.currentOfficialRevision.outcomeNote,
          }
        : null,
    hasVideo: fixture.videos.length > 0,
  };
}

// 대회 픽스처(FixtureMatchRow)와 리그 대진 행이 구조적으로 공유하는 최소 형태 —
// 이 두 빌더는 게임(V1Game) 필드와 킥오프 시각만 읽는다.
function buildLineup(
  fixture: { game: GameMatchRow | null; scheduledAt: Date | null },
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

  type ParticipantRow = GameMatchRow['participants'][number];
  // 저장할 때마다 immutable lineup revision과 participant snapshot이 새로
  // 생긴다. 전체 participant를 side로만 묶으면 과거 저장본까지 합쳐지므로,
  // lineups에서 side별 가장 큰 revision의 id 하나만 선택한다. DB 반환 순서에
  // 기대지 않아 조회 옵션이 바뀌어도 최신 저장본 계약을 유지한다.
  //
  // `state`도 함께 걸러야 한다 — 대진이 생성되면 등록 명단 전원을 담은
  // revision 1 DRAFT가 자동으로 깔리고, 팀이 제출을 마치기 전까지는 그게 항상
  // "가장 큰 revision"이다. state를 안 보면 관중에게는 아직 제출되지 않은
  // 초안(등록 선수 전원, 전원 '선발')이 공개 라인업으로 보이고, 팀이 제출 후
  // 라인업을 다시 편집만 하고(저장 → 새 DRAFT) 제출은 누르지 않은 경우에는
  // 그 미제출 편집본이 공식 명단을 덮어써 버린다. 프론트의 "지금 운영 중인
  // 라인업" 정의(operate/lineup-grid.tsx의 latestOperableLineup — SUBMITTED/
  // LOCKED 중 최고 revision)와 동일한 규칙을 여기서도 써야 관중·현장 운영
  // 콘솔이 같은 명단을 본다.
  const OPERABLE_LINEUP_STATES: readonly V1GameLineupState[] = ['SUBMITTED', 'LOCKED'];
  const latestLineupBySide = new Map<string, { id: string; revision: number }>();
  for (const lineup of fixture.game.lineups) {
    if (!OPERABLE_LINEUP_STATES.includes(lineup.state)) continue;
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
        // [P1-d] `position` 을 공개 응답에서 뺐다. D4: 상대 팀과 관중에게는 **등번호와
        // 이름만** 나가고 선발/후보·포지션·좌표는 팀 전술보드 안에 머문다 -- 포지션은
        // 팀이 짜 넣은 전술 정보이지 관전자에게 공개할 사실이 아니다.
        //
        // 새 데이터만으로는 충분하지 않아서 계약에서 뺀다: P1-d 이후 경기는 로스터
        // 스냅샷이 포지션을 안 넣어 저절로 null 이지만, **과거 데이터는 실제 값을 들고
        // 있어 계속 공개된다.** 그리고 필드를 계약에 남겨 두면 나중에 누가 채웠을 때
        // 조용히 새어 나간다.
        //
        // 이 자리에 포지션을 보여주려면 **선수 본인이 선언한 선호 포지션**(D14)을 쓴다 --
        // 그건 공개를 전제로 본인이 정한 값이라 팀의 전술 배치와 성격이 다르다.
        // 두 조건을 **모두** 만족할 때만 링크가 걸린다.
        //   eligible          — 이름이 가려진 사람("비공개 선수")에게 링크를 걸면 안 된다
        //   profileHref !== null — 프로필은 이름보다 강한 노출이라 동의를 직접 본다
        // 이름 게이팅 롤백 스위치가 켜져도 동의 없는 사람의 프로필은 열리지 않는다.
        profileHref: eligible ? resolveParticipantProfileHref(participant.userId, consent) : null,
      };
    });

  return { home: present(home?.id), away: present(away?.id) };
}

function buildMvp(
  fixture: { game: GameMatchRow | null },
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
  return {
    participantId: participant.id,
    displayName,
    profileHref: resolveParticipantProfileHref(participant.userId, consent),
  };
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

// `parseCardColor`도 `./participant-name-gating`가 소유한다(위 import 참고).

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
