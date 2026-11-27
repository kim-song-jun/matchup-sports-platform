import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { V1ScheduleState, V1ScheduleType } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { isPublicLiveEnabled } from '../games/public-records/public-live-flag';
import { effectivePublicVisibilityMode } from '../games/public-records/public-visibility';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduleAttendanceService, type SetAttendanceResponse } from '../team-schedules/attendance.service';
import { visibleTeamMatchScheduleWhere } from '../team-schedules/team-schedules.service';
import { resolveTeamLogoUrl } from '../teams/team-logo-presets';
import { WidgetScorersService, type WidgetScorer, type WidgetScorerGame } from './widget-scorers.service';
import {
  endedGameScore,
  matchResult,
  perspectiveScore,
  readPeriod,
  tallyGameScore,
  WIDGET_FRIENDLY_STARTED_MS,
  WIDGET_JUST_ENDED_MS,
  WIDGET_LIVE_MAX_AGE_MS,
  WIDGET_PENDING_LIMIT,
  WIDGET_SCHEDULE_LIMIT,
  type WidgetMatchResult,
  type WidgetPeriod,
  type WidgetPerspectiveScore,
} from './widget-home';

export type WidgetResponseStatus = 'GOING' | 'MAYBE' | 'NOT_GOING' | 'WAITLISTED';

export interface WidgetLiveGame {
  gameId: string;
  teamId: string;
  teamName: string;
  /** 팀 페이지와 같은 마크(저장된 로고, 없으면 기본 마크). 사이트 기준 경로이거나 업로드 주소 — 앞에 도메인을 붙이는 건 받는 쪽. */
  teamLogoUrl: string | null;
  title: string;
  opponentName: string | null;
  opponentLogoUrl: string | null;
  /** 리그·대회 이름. 친선은 null. */
  competitionName: string | null;
  /** 장소 이름. 정해지지 않았으면 null. */
  venueName: string | null;
  competitionKind: 'TOURNAMENT' | 'LEAGUE' | 'FRIENDLY';
  /** `ENDED` 는 끝난 지 15분 안인 「방금 끝남」. */
  state: 'LIVE' | 'PAUSED' | 'ENDED';
  startedAt: Date | null;
  /** 우리 팀 기준. 공개 규칙이 가리거나 아직 모르면 null. */
  score: WidgetPerspectiveScore | null;
  /** 승부차기 점수 — 경기가 끝난 뒤에만 있다(진행 중에는 서버가 모른다). */
  penalties: WidgetPerspectiveScore | null;
  /** 현재 구간(전반·후반 등)과 시간 계산에 필요한 값. 진행 중이 아니거나 구간 기록이 없는 경기는 null. */
  period: WidgetPeriod | null;
  /** 한 골씩 시간순(분을 모르는 골은 뒤). 점수를 가린 경기는 빈 배열. 이름 규칙은 `WidgetScorersService`. */
  scorers: WidgetScorer[];
}

export interface WidgetScheduleItem {
  scheduleId: string;
  teamId: string;
  teamName: string;
  title: string;
  type: V1ScheduleType;
  startAt: Date;
  endAt: Date;
  rsvpDeadlineAt: Date | null;
  placeName: string | null;
  teamLogoUrl: string | null;
  /** 경기 일정이면 상대팀과 리그·대회 이름. 훈련·모임은 null. */
  opponentName: string | null;
  opponentLogoUrl: string | null;
  competitionName: string | null;
  /** 참석 확정 인원과 정원(정원이 없으면 활동 중인 팀원 수). */
  goingCount: number;
  capacity: number;
  myResponse: WidgetResponseStatus | null;
  /** 지금 위젯에서 참석·불참을 저장할 수 있는가(훈련·모임이고 마감 전). */
  canRespond: boolean;
}

export interface WidgetLastResult {
  gameId: string;
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
  opponentName: string | null;
  opponentLogoUrl: string | null;
  competitionName: string | null;
  startedAt: Date | null;
  score: WidgetPerspectiveScore;
  penalties: WidgetPerspectiveScore | null;
  result: WidgetMatchResult;
}

export interface WidgetHome {
  generatedAt: Date;
  live: WidgetLiveGame[];
  /** 가장 최근 공식 결과(일정이 있어도 항상 내려 준다 — 비었을 때 채울지는 받는 쪽이 정한다). 공개 규칙이 가린 경기는 제외. */
  lastResult: WidgetLastResult | null;
  /** 아직 응답하지 않은 훈련·모임 총 건수와 가장 급한 몇 건. */
  pendingCount: number;
  pending: WidgetScheduleItem[];
  schedules: WidgetScheduleItem[];
}

interface TeamMeta {
  name: string;
  memberCount: number;
  logoUrl: string | null;
}

const RESPONDABLE_TYPES = [V1ScheduleType.TRAINING, V1ScheduleType.EVENT] as const;

@Injectable()
export class WidgetHomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: ScheduleAttendanceService,
    private readonly scorers: WidgetScorersService,
  ) {}

  async home(userId: string, now: Date = new Date()): Promise<WidgetHome> {
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: { userId, status: 'active', team: { status: 'active', deletedAt: null } },
      select: { teamId: true, team: { select: { name: true, memberCount: true, profile: { select: { logoUrl: true } } } } },
    });
    const teamMeta = new Map<string, TeamMeta>(
      memberships.map((m) => [m.teamId, { name: m.team.name, memberCount: m.team.memberCount, logoUrl: resolveTeamLogoUrl(m.teamId, m.team.profile?.logoUrl) }]),
    );
    const teamIds = [...teamMeta.keys()];
    if (teamIds.length === 0) return { generatedAt: now, live: [], lastResult: null, pendingCount: 0, pending: [], schedules: [] };

    const visible = await visibleTeamMatchScheduleWhere(this.prisma, teamIds);
    const [live, lastResult, pending, pendingCount, schedules] = await Promise.all([
      this.liveGames(teamIds, teamMeta, now),
      this.lastResult(teamIds, teamMeta),
      this.prisma.v1TeamSchedule.findMany({
        where: this.pendingWhere(teamIds, userId, now, visible),
        orderBy: [{ rsvpDeadlineAt: { sort: 'asc', nulls: 'last' } }, { startAt: 'asc' }, { id: 'asc' }],
        take: WIDGET_PENDING_LIMIT,
        include: { attendance: { where: { userId }, select: { status: true } } },
      }),
      this.prisma.v1TeamSchedule.count({ where: this.pendingWhere(teamIds, userId, now, visible) }),
      this.prisma.v1TeamSchedule.findMany({
        where: { teamId: { in: teamIds }, state: V1ScheduleState.SCHEDULED, endAt: { gte: now }, AND: [visible] },
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        take: WIDGET_SCHEDULE_LIMIT,
        include: { attendance: { where: { userId }, select: { status: true } } },
      }),
    ]);
    const rows = [...pending, ...schedules];
    const [matches, going] = await Promise.all([this.matchesFor(rows), this.goingCounts(rows.map((row) => row.id))]);
    const toItem = (row: (typeof schedules)[number]): WidgetScheduleItem => {
      const match = row.teamMatchId === null ? undefined : matches.get(row.teamMatchId);
      const opponent = match?.teams.find((team) => team.id !== row.teamId) ?? null;
      const mine = teamMeta.get(row.teamId);
      return {
        scheduleId: row.id,
        teamId: row.teamId,
        teamName: mine?.name ?? '',
        teamLogoUrl: mine?.logoUrl ?? null,
        title: row.title,
        type: row.type,
        startAt: row.startAt,
        endAt: row.endAt,
        rsvpDeadlineAt: row.rsvpDeadlineAt,
        placeName: match?.placeName ?? null,
        opponentName: opponent?.name ?? null,
        opponentLogoUrl: opponent?.logoUrl ?? null,
        competitionName: match?.competitionName ?? null,
        goingCount: going.get(row.id) ?? 0,
        capacity: row.capacity ?? mine?.memberCount ?? 0,
        myResponse: row.attendance[0]?.status ?? null,
        canRespond: (RESPONDABLE_TYPES as readonly V1ScheduleType[]).includes(row.type) && (row.rsvpDeadlineAt === null || row.rsvpDeadlineAt > now),
      };
    };
    return { generatedAt: now, live, lastResult, pendingCount, pending: pending.map(toItem), schedules: schedules.map(toItem) };
  }

  /** 위젯에서 참석·불참·미정을 저장한다. 마감·정원 같은 규칙은 앱에서 누를 때와 같은 서비스를 그대로 탄다. */
  async setResponse(userId: string, scheduleId: string, status: 'GOING' | 'MAYBE' | 'NOT_GOING'): Promise<SetAttendanceResponse> {
    const [schedule, user] = await Promise.all([
      this.prisma.v1TeamSchedule.findUnique({ where: { id: scheduleId }, select: { id: true, teamId: true, type: true } }),
      this.prisma.v1User.findFirst({ where: { id: userId, accountStatus: 'active' }, select: { id: true, email: true, accountStatus: true, onboardingStatus: true } }),
    ]);
    // 내가 활성 팀원인 팀의 일정만 — 남의 팀 일정은 있는지도 알려 주지 않는다.
    const member =
      schedule === null
        ? null
        : await this.prisma.v1TeamMembership.findFirst({
            where: { teamId: schedule.teamId, userId, status: 'active', team: { status: 'active', deletedAt: null } },
            select: { id: true },
          });
    if (schedule === null || user === null || member === null) {
      throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: '일정을 찾을 수 없어요.' });
    }
    // 위젯이 응답을 받는 건 홈에 `canRespond` 로 내려 주는 훈련·모임뿐이다(경기 일정 출석은 앱에서).
    if (!(RESPONDABLE_TYPES as readonly V1ScheduleType[]).includes(schedule.type)) {
      throw new BadRequestException({ code: 'WIDGET_SCHEDULE_NOT_RESPONDABLE', message: '이 일정은 앱에서 응답해 주세요.' });
    }
    const actor: V1AuthUser = { id: user.id, email: user.email, accountStatus: user.accountStatus, onboardingStatus: user.onboardingStatus };
    // 위젯은 버전을 모르니 서버가 읽어 넘긴다. 그 사이 앱·연타로 버전이 바뀌면 한 번 다시 읽어 재시도한다.
    // 멱등키는 시도마다 새로 만든다 — 같은 응답을 다시 눌러도 앱에서처럼 그대로 저장된다.
    for (let attempt = 0; ; attempt += 1) {
      const existing = await this.prisma.v1ScheduleAttendance.findUnique({
        where: { scheduleId_userId: { scheduleId, userId } },
        select: { version: true },
      });
      try {
        return await this.attendance.setMyAttendance(actor, schedule.teamId, scheduleId, { status, expectedVersion: existing?.version ?? 0 }, randomUUID());
      } catch (error) {
        const code = error instanceof ConflictException ? (error.getResponse() as { code?: string }).code : undefined;
        if (code !== 'VERSION_CONFLICT' || attempt >= 1) throw error;
      }
    }
  }

  private pendingWhere(teamIds: string[], userId: string, now: Date, visible: object) {
    return {
      teamId: { in: teamIds },
      state: V1ScheduleState.SCHEDULED,
      type: { in: [...RESPONDABLE_TYPES] },
      endAt: { gte: now },
      OR: [{ rsvpDeadlineAt: null }, { rsvpDeadlineAt: { gt: now } }],
      attendance: { none: { userId } },
      AND: [visible],
    };
  }

  /** 경기 일정의 장소·상대팀·리그 이름. 상대는 호스트와 승인된 신청 팀 중 내 팀이 아닌 쪽이다. */
  private async matchesFor(rows: ReadonlyArray<{ teamMatchId: string | null }>) {
    const ids = [...new Set(rows.flatMap((row) => (row.teamMatchId === null ? [] : [row.teamMatchId])))];
    const result = new Map<string, { placeName: string | null; competitionName: string | null; teams: Array<{ id: string; name: string; logoUrl: string | null }> }>();
    if (ids.length === 0) return result;
    const teamSelect = { select: { id: true, name: true, profile: { select: { logoUrl: true } } } } as const;
    const matches = await this.prisma.v1TeamMatch.findMany({
      where: { id: { in: ids } },
      select: { id: true, placeName: true, league: { select: { title: true } }, tournament: { select: { title: true } }, hostTeam: teamSelect, approvedApplicantTeam: teamSelect },
    });
    for (const match of matches) {
      result.set(match.id, {
        placeName: match.placeName,
        competitionName: match.league?.title ?? match.tournament?.title ?? null,
        teams: [match.hostTeam, match.approvedApplicantTeam].flatMap((team) =>
          team === null ? [] : [{ id: team.id, name: team.name, logoUrl: resolveTeamLogoUrl(team.id, team.profile?.logoUrl) }],
        ),
      });
    }
    return result;
  }

  private async goingCounts(scheduleIds: string[]): Promise<Map<string, number>> {
    if (scheduleIds.length === 0) return new Map();
    const rows = await this.prisma.v1ScheduleAttendance.groupBy({ by: ['scheduleId'], where: { scheduleId: { in: scheduleIds }, status: 'GOING' }, _count: { _all: true } });
    return new Map(rows.map((row) => [row.scheduleId, row._count._all]));
  }

  private async opponentLogos(teamIds: string[]): Promise<Map<string, string | null>> {
    if (teamIds.length === 0) return new Map();
    const teams = await this.prisma.v1Team.findMany({ where: { id: { in: teamIds } }, select: { id: true, profile: { select: { logoUrl: true } } } });
    return new Map(teams.map((team) => [team.id, resolveTeamLogoUrl(team.id, team.profile?.logoUrl)]));
  }

  /** 가장 최근에 끝난 내 팀의 공식 결과 — 위젯이 비었을 때 「지난 경기」로 채운다. 공개 규칙이 가린 경기는 건너뛴다. */
  private async lastResult(teamIds: string[], teamMeta: ReadonlyMap<string, TeamMeta>): Promise<WidgetLastResult | null> {
    const teamIdSet = new Set(teamIds);
    const liveEnabled = await isPublicLiveEnabled(this.prisma);
    // 최근 5경기 안에서 보여 줄 수 있는 첫 경기를 고른다 — 5경기가 모두 가려졌으면 null.
    const games = await this.prisma.v1Game.findMany({
      where: {
        sides: { some: { teamId: { in: teamIds } } },
        state: 'ENDED',
        currentOfficialRevision: { isNot: null },
        NOT: [
          { teamMatch: { is: { deletedAt: { not: null } } } },
          { teamMatch: { is: { status: { in: ['cancelled', 'archived'] } } } },
          { teamMatch: { is: { tournament: { is: { deletedAt: { not: null } } } } } },
        ],
      },
      select: {
        id: true,
        sides: { select: { id: true, sideKey: true, teamId: true, displayNameSnapshot: true } },
        visibilityPolicy: { select: { mode: true } },
        currentOfficialRevision: { select: { score: true } },
        sharedRecord: { select: { goals: true } },
        teamMatch: { select: { startAt: true, league: { select: { title: true } }, tournament: { select: { title: true } } } },
      },
      orderBy: [{ teamMatch: { startAt: { sort: 'desc', nulls: 'last' } } }, { id: 'desc' }],
      take: 5,
    });
    for (const game of games) {
      const mode = effectivePublicVisibilityMode(game.visibilityPolicy?.mode ?? 'HIDDEN', liveEnabled);
      if (mode !== 'live' && mode !== 'official_only') continue;
      const mine = game.sides.find((side) => side.teamId !== null && teamIdSet.has(side.teamId));
      if (mine === undefined) continue;
      const { score, penalties } = endedGameScore(game, mine.sideKey);
      if (score === null) continue;
      const other = game.sides.find((side) => side.id !== mine.id);
      const logos = await this.opponentLogos(other?.teamId ? [other.teamId] : []);
      const meta = teamMeta.get(mine.teamId!);
      return {
        gameId: game.id,
        teamId: mine.teamId!,
        teamName: meta?.name ?? mine.displayNameSnapshot,
        teamLogoUrl: meta?.logoUrl ?? null,
        opponentName: other?.displayNameSnapshot ?? null,
        opponentLogoUrl: other?.teamId ? (logos.get(other.teamId) ?? null) : null,
        competitionName: game.teamMatch?.league?.title ?? game.teamMatch?.tournament?.title ?? null,
        startedAt: game.teamMatch?.startAt ?? null,
        score,
        penalties,
        result: matchResult(score, penalties),
      };
    }
    return null;
  }

  /** 진행 중(시작 후 12시간 안) + 방금 끝난(15분 안) 내 팀 경기. 점수는 공개 경기 화면과 같은 규칙으로만. */
  private async liveGames(teamIds: string[], teamMeta: ReadonlyMap<string, TeamMeta>, now: Date): Promise<WidgetLiveGame[]> {
    const teamIdSet = new Set(teamIds);
    const games = await this.prisma.v1Game.findMany({
      where: {
        sides: { some: { teamId: { in: teamIds } } },
        OR: [
          { state: { in: ['LIVE', 'PAUSED'] }, teamMatch: { is: { startAt: { gte: new Date(now.getTime() - WIDGET_LIVE_MAX_AGE_MS) } } } },
          // 친선 팀 매치: 첫 득점을 기록하기 전까지 경기 상태는 SCHEDULED 라 킥오프가 지난 것으로 따로 잡는다(점수는 0 : 0).
          {
            state: 'SCHEDULED',
            teamMatch: { is: { status: 'matched', leagueId: null, tournamentId: null, startAt: { lte: now, gte: new Date(now.getTime() - WIDGET_FRIENDLY_STARTED_MS) } } },
          },
          // 종료 시각 컬럼이 없어 공식 결과가 확정된 시각으로 잰다(`updatedAt` 은 끝난 뒤 정정·갱신에도 바뀐다). 결과를 정정하면 새 리비전이라 정정도 「방금」으로 다시 나온다.
          { state: 'ENDED', currentOfficialRevision: { is: { createdAt: { gte: new Date(now.getTime() - WIDGET_JUST_ENDED_MS) } } } },
        ],
        NOT: [
          { teamMatch: { is: { deletedAt: { not: null } } } },
          { teamMatch: { is: { status: { in: ['cancelled', 'archived'] } } } },
          { teamMatch: { is: { tournament: { is: { deletedAt: { not: null } } } } } },
        ],
      },
      select: {
        id: true,
        state: true,
        sides: { select: { id: true, sideKey: true, teamId: true, displayNameSnapshot: true } },
        visibilityPolicy: { select: { mode: true } },
        currentOfficialRevision: { select: { score: true, state: true, goalEvents: true } },
        sharedRecord: { select: { goals: true } },
        periods: { select: { number: true, state: true, startedAt: true, endedAt: true, pausedTotalMs: true, pausedAt: true } },
        teamMatch: { select: { title: true, startAt: true, placeName: true, tournamentId: true, leagueId: true, league: { select: { title: true } }, tournament: { select: { title: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });
    if (games.length === 0) return [];

    const liveEnabled = await isPublicLiveEnabled(this.prisma);
    const opponentTeamIds = games.flatMap((game) => game.sides.flatMap((side) => (side.teamId !== null && !teamIdSet.has(side.teamId) ? [side.teamId] : [])));
    const logos = await this.opponentLogos([...new Set(opponentTeamIds)]);
    const running = games.filter((game) => game.state !== 'ENDED');
    const events =
      running.length === 0
        ? []
        : await this.prisma.v1GameEvent.findMany({
            where: { gameId: { in: running.map((game) => game.id) }, OR: [{ type: { in: ['GOAL', 'OWN_GOAL'] } }, { reversesEventId: { not: null } }] },
            select: { id: true, gameId: true, type: true, sideId: true, reversesEventId: true },
          });

    const items: WidgetLiveGame[] = [];
    const scorerGames: WidgetScorerGame[] = [];
    for (const game of games) {
      const mine = game.sides.find((side) => side.teamId !== null && teamIdSet.has(side.teamId));
      if (mine === undefined || (game.state !== 'SCHEDULED' && game.state !== 'LIVE' && game.state !== 'PAUSED' && game.state !== 'ENDED')) continue;
      // 킥오프가 지난 친선 경기는 아직 SCHEDULED 여도 진행 중으로 보인다.
      const state = game.state === 'SCHEDULED' ? 'LIVE' : game.state;
      const mode = effectivePublicVisibilityMode(game.visibilityPolicy?.mode ?? 'HIDDEN', liveEnabled);
      let score: WidgetPerspectiveScore | null = null;
      let penalties: WidgetPerspectiveScore | null = null;
      if (state === 'ENDED') {
        // 끝난 경기는 공식 결과를 보여 주되, 운영자가 가린 경기(hidden·status_only)는 숨긴다.
        if (mode === 'live' || mode === 'official_only') {
          ({ score, penalties } = endedGameScore(game, mine.sideKey));
        }
      } else if (mode === 'live') {
        score = perspectiveScore(tallyGameScore(game, events.filter((event) => event.gameId === game.id)), mine.sideKey);
      }
      const other = game.sides.find((side) => side.id !== mine.id);
      const meta = teamMeta.get(mine.teamId!);
      items.push({
        gameId: game.id,
        teamId: mine.teamId!,
        teamName: meta?.name ?? mine.displayNameSnapshot,
        teamLogoUrl: meta?.logoUrl ?? null,
        title: game.teamMatch?.title ?? '경기',
        opponentName: other?.displayNameSnapshot ?? null,
        opponentLogoUrl: other?.teamId ? (logos.get(other.teamId) ?? null) : null,
        competitionName: game.teamMatch?.league?.title ?? game.teamMatch?.tournament?.title ?? null,
        venueName: game.teamMatch?.placeName ?? null,
        competitionKind: game.teamMatch?.tournamentId ? 'TOURNAMENT' : game.teamMatch?.leagueId ? 'LEAGUE' : 'FRIENDLY',
        state,
        startedAt: game.teamMatch?.startAt ?? null,
        score,
        penalties,
        period: state === 'ENDED' ? null : readPeriod(game.state, game.periods),
        scorers: [],
      });
      // 점수를 보여 줄 수 있는 경기만 득점자도 — 점수를 가린 경기(`status_only` 등)는 골 요약도 가린다.
      if (score !== null) {
        scorerGames.push({ gameId: game.id, mineSideId: mine.id, sharedGoals: game.sharedRecord?.goals ?? null, officialGoalEvents: game.currentOfficialRevision?.goalEvents ?? null, officialState: game.currentOfficialRevision?.state ?? null });
      }
    }
    const scorersByGame = await this.scorers.load(scorerGames);
    for (const item of items) item.scorers = scorersByGame.get(item.gameId) ?? [];
    // 진행 중이 앞, 방금 끝난 경기가 뒤.
    return items.sort((a, b) => Number(a.state === 'ENDED') - Number(b.state === 'ENDED'));
  }
}
