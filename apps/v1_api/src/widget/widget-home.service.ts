import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { V1ScheduleState, V1ScheduleType } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { tallyLiveScore } from '../games/public-records/public-live-score';
import { isPublicLiveEnabled } from '../games/public-records/public-live-flag';
import { effectivePublicVisibilityMode } from '../games/public-records/public-visibility';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduleAttendanceService, type SetAttendanceResponse } from '../team-schedules/attendance.service';
import { visibleTeamMatchScheduleWhere } from '../team-schedules/team-schedules.service';
import {
  readEndedResult,
  WIDGET_JUST_ENDED_MS,
  WIDGET_LIVE_MAX_AGE_MS,
  WIDGET_PENDING_LIMIT,
  WIDGET_SCHEDULE_LIMIT,
  type WidgetPerspectiveScore,
} from './widget-home';

export type WidgetResponseStatus = 'GOING' | 'MAYBE' | 'NOT_GOING' | 'WAITLISTED';

export interface WidgetLiveGame {
  gameId: string;
  teamId: string;
  teamName: string;
  title: string;
  opponentName: string | null;
  competitionKind: 'TOURNAMENT' | 'LEAGUE' | 'FRIENDLY';
  /** `ENDED` 는 끝난 지 15분 안인 「방금 끝남」. */
  state: 'LIVE' | 'PAUSED' | 'ENDED';
  startedAt: Date | null;
  /** 우리 팀 기준. 공개 규칙이 가리거나 아직 모르면 null. */
  score: WidgetPerspectiveScore | null;
  /** 승부차기 점수 — 경기가 끝난 뒤에만 있다(진행 중에는 서버가 모른다). */
  penalties: WidgetPerspectiveScore | null;
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
  myResponse: WidgetResponseStatus | null;
  /** 지금 위젯에서 참석·불참을 저장할 수 있는가(훈련·모임이고 마감 전). */
  canRespond: boolean;
}

export interface WidgetHome {
  generatedAt: Date;
  live: WidgetLiveGame[];
  /** 아직 응답하지 않은 훈련·모임 총 건수와 가장 급한 몇 건. */
  pendingCount: number;
  pending: WidgetScheduleItem[];
  schedules: WidgetScheduleItem[];
}

const RESPONDABLE_TYPES = [V1ScheduleType.TRAINING, V1ScheduleType.EVENT] as const;

@Injectable()
export class WidgetHomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: ScheduleAttendanceService,
  ) {}

  async home(userId: string, now: Date = new Date()): Promise<WidgetHome> {
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: { userId, status: 'active', team: { status: 'active', deletedAt: null } },
      select: { teamId: true, team: { select: { name: true } } },
    });
    const teamNames = new Map(memberships.map((m) => [m.teamId, m.team.name]));
    const teamIds = [...teamNames.keys()];
    if (teamIds.length === 0) return { generatedAt: now, live: [], pendingCount: 0, pending: [], schedules: [] };

    const visible = await visibleTeamMatchScheduleWhere(this.prisma, teamIds);
    const [live, pending, pendingCount, schedules] = await Promise.all([
      this.liveGames(teamIds, teamNames, now),
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
    const places = await this.placesFor([...pending, ...schedules]);
    const toItem = (row: (typeof schedules)[number]): WidgetScheduleItem => ({
      scheduleId: row.id,
      teamId: row.teamId,
      teamName: teamNames.get(row.teamId) ?? '',
      title: row.title,
      type: row.type,
      startAt: row.startAt,
      endAt: row.endAt,
      rsvpDeadlineAt: row.rsvpDeadlineAt,
      placeName: row.teamMatchId === null ? null : (places.get(row.teamMatchId) ?? null),
      myResponse: row.attendance[0]?.status ?? null,
      canRespond: (RESPONDABLE_TYPES as readonly V1ScheduleType[]).includes(row.type) && (row.rsvpDeadlineAt === null || row.rsvpDeadlineAt > now),
    });
    return { generatedAt: now, live, pendingCount, pending: pending.map(toItem), schedules: schedules.map(toItem) };
  }

  /** 위젯에서 참석·불참·미정을 저장한다. 마감·정원 같은 규칙은 앱에서 누를 때와 같은 서비스를 그대로 탄다. */
  async setResponse(userId: string, scheduleId: string, status: 'GOING' | 'MAYBE' | 'NOT_GOING'): Promise<SetAttendanceResponse> {
    const [schedule, user] = await Promise.all([
      this.prisma.v1TeamSchedule.findUnique({ where: { id: scheduleId }, select: { id: true, teamId: true } }),
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
    const existing = await this.prisma.v1ScheduleAttendance.findUnique({
      where: { scheduleId_userId: { scheduleId, userId } },
      select: { version: true },
    });
    const actor: V1AuthUser = { id: user.id, email: user.email, accountStatus: user.accountStatus, onboardingStatus: user.onboardingStatus };
    // 멱등키는 누를 때마다 새로 만든다 — 같은 응답을 다시 눌러도 앱에서처럼 그대로 저장된다.
    return this.attendance.setMyAttendance(actor, schedule.teamId, scheduleId, { status, expectedVersion: existing?.version ?? 0 }, randomUUID());
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

  private async placesFor(rows: ReadonlyArray<{ teamMatchId: string | null }>): Promise<Map<string, string | null>> {
    const ids = [...new Set(rows.flatMap((row) => (row.teamMatchId === null ? [] : [row.teamMatchId])))];
    if (ids.length === 0) return new Map();
    const matches = await this.prisma.v1TeamMatch.findMany({ where: { id: { in: ids } }, select: { id: true, placeName: true } });
    return new Map(matches.map((match) => [match.id, match.placeName]));
  }

  /** 진행 중(시작 후 12시간 안) + 방금 끝난(15분 안) 내 팀 경기. 점수는 공개 경기 화면과 같은 규칙으로만. */
  private async liveGames(teamIds: string[], teamNames: ReadonlyMap<string, string>, now: Date): Promise<WidgetLiveGame[]> {
    const teamIdSet = new Set(teamIds);
    const games = await this.prisma.v1Game.findMany({
      where: {
        sides: { some: { teamId: { in: teamIds } } },
        OR: [
          { state: { in: ['LIVE', 'PAUSED'] }, teamMatch: { is: { startAt: { gte: new Date(now.getTime() - WIDGET_LIVE_MAX_AGE_MS) } } } },
          { state: 'ENDED', updatedAt: { gte: new Date(now.getTime() - WIDGET_JUST_ENDED_MS) } },
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
        currentOfficialRevision: { select: { score: true } },
        teamMatch: { select: { title: true, startAt: true, tournamentId: true, leagueId: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });
    if (games.length === 0) return [];

    const liveEnabled = await isPublicLiveEnabled(this.prisma);
    const running = games.filter((game) => game.state !== 'ENDED');
    const events =
      running.length === 0
        ? []
        : await this.prisma.v1GameEvent.findMany({
            where: { gameId: { in: running.map((game) => game.id) }, OR: [{ type: { in: ['GOAL', 'OWN_GOAL'] } }, { reversesEventId: { not: null } }] },
            select: { id: true, gameId: true, type: true, sideId: true, reversesEventId: true },
          });

    const items: WidgetLiveGame[] = [];
    for (const game of games) {
      const mine = game.sides.find((side) => side.teamId !== null && teamIdSet.has(side.teamId));
      if (mine === undefined || (game.state !== 'LIVE' && game.state !== 'PAUSED' && game.state !== 'ENDED')) continue;
      const mode = effectivePublicVisibilityMode(game.visibilityPolicy?.mode ?? 'HIDDEN', liveEnabled);
      let score: WidgetPerspectiveScore | null = null;
      let penalties: WidgetPerspectiveScore | null = null;
      if (game.state === 'ENDED') {
        // 끝난 경기는 공식 결과를 보여 주되, 운영자가 가린 경기(hidden·status_only)는 숨긴다.
        if (mode === 'live' || mode === 'official_only') {
          const result = readEndedResult(game.currentOfficialRevision?.score, mine.sideKey);
          score = result?.score ?? null;
          penalties = result?.penalties ?? null;
        }
      } else if (mode === 'live') {
        const tally = tallyLiveScore(events.filter((event) => event.gameId === game.id), new Map(game.sides.map((side) => [side.id, side.sideKey] as const)));
        score = mine.sideKey === 'HOME' ? { mine: tally.home, opponent: tally.away } : { mine: tally.away, opponent: tally.home };
      }
      items.push({
        gameId: game.id,
        teamId: mine.teamId!,
        teamName: teamNames.get(mine.teamId!) ?? mine.displayNameSnapshot,
        title: game.teamMatch?.title ?? '경기',
        opponentName: game.sides.find((side) => side.id !== mine.id)?.displayNameSnapshot ?? null,
        competitionKind: game.teamMatch?.tournamentId ? 'TOURNAMENT' : game.teamMatch?.leagueId ? 'LEAGUE' : 'FRIENDLY',
        state: game.state,
        startedAt: game.teamMatch?.startAt ?? null,
        score,
        penalties,
      });
    }
    // 진행 중이 앞, 방금 끝난 경기가 뒤.
    return items.sort((a, b) => Number(a.state === 'ENDED') - Number(b.state === 'ENDED'));
  }
}
