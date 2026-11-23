import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, V1AttendanceStatus, V1ScheduleType } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { MATCH_SCHEDULE_DEFAULT_DURATION_MS } from '../team-schedules/team-match-schedule';
import { visibleTeamMatchScheduleWhere } from '../team-schedules/team-schedules.service';
import { isUsableAccessTokenSecret, issueAccessToken, parseAccessToken } from './access-token';
import { buildIcs, type IcsEvent } from './ics';

const DAY_MS = 24 * 60 * 60 * 1_000;
/** 구독 캘린더에 싣는 범위: 지난 2주 ~ 앞으로 6개월. */
const FEED_PAST_MS = 14 * DAY_MS;
const FEED_FUTURE_MS = 180 * DAY_MS;
const FEED_MAX_EVENTS = 1_000;
const LAST_USED_TOUCH_MS = 10 * 60 * 1_000;
const CALENDAR_NAME = 'Teameet';
const DEFAULT_ORIGIN = 'https://teameet.co.kr';

const TYPE_LABEL: Record<V1ScheduleType, string> = {
  MATCH: '경기',
  TRAINING: '훈련',
  EVENT: '모임',
};

export interface CalendarFeedStatus {
  connected: boolean;
  /** https 구독 주소(`.ics`). 구글 캘린더 "URL로 추가"에 붙여 넣는다. */
  feedUrl: string | null;
  /** 같은 주소를 `webcal://` 로 — 아이폰에서 누르면 캘린더 구독 창이 바로 뜬다. */
  webcalUrl: string | null;
  createdAt: Date | null;
}

/** 웹 화면 주소의 기준. 운영·알파는 FRONTEND_URL 이 있고, 없으면 운영 주소로 둔다. */
export function frontendOrigin(): string {
  return (process.env.FRONTEND_URL ?? '').trim().replace(/\/+$/, '') || DEFAULT_ORIGIN;
}

@Injectable()
export class CalendarFeedService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 내 구독 주소 (로그인 쿠키) ─────────────────────────────────────────────

  async status(user: V1AuthUser, origin: string): Promise<CalendarFeedStatus> {
    const row = await this.activeToken(user.id);
    return row === null ? { connected: false, feedUrl: null, webcalUrl: null, createdAt: null } : this.toStatus(row, origin);
  }

  /** 아직 없으면 만든다. 있으면 그대로 돌려준다(같은 주소를 몇 번이든 다시 복사할 수 있다). */
  async ensure(user: V1AuthUser, origin: string): Promise<CalendarFeedStatus> {
    // 두 탭에서 동시에 눌러도 활성 주소가 하나만 생기게 사용자별로 줄을 세운다.
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockUserFeed(tx, user.id);
      const existing = await tx.v1AccessToken.findFirst({
        where: { userId: user.id, kind: 'calendar_feed', revokedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      return existing ?? (await tx.v1AccessToken.create({ data: { userId: user.id, kind: 'calendar_feed' } }));
    });
    return this.toStatus(row, origin);
  }

  /** 옛 주소는 즉시 쓸 수 없게 하고 새 주소를 만든다. */
  async regenerate(user: V1AuthUser, origin: string): Promise<CalendarFeedStatus> {
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockUserFeed(tx, user.id);
      await tx.v1AccessToken.updateMany({
        where: { userId: user.id, kind: 'calendar_feed', revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.v1AccessToken.create({ data: { userId: user.id, kind: 'calendar_feed' } });
    });
    return this.toStatus(row, origin);
  }

  // ── 구독 주소로 읽기 (토큰, 로그인 없음) ───────────────────────────────────

  async feedForToken(token: string, now: Date = new Date()): Promise<string> {
    const id = parseAccessToken(token, this.secret(), 'calendar_feed');
    const row = id === null ? null : await this.prisma.v1AccessToken.findFirst({ where: { id, kind: 'calendar_feed', revokedAt: null } });
    const owner = row === null ? null : await this.prisma.v1User.findFirst({ where: { id: row.userId, accountStatus: 'active' }, select: { id: true } });
    if (row === null || owner === null) {
      throw new NotFoundException({ code: 'CALENDAR_FEED_NOT_FOUND', message: '캘린더 주소를 찾을 수 없어요.' });
    }
    if (row.lastUsedAt === null || now.getTime() - row.lastUsedAt.getTime() > LAST_USED_TOUCH_MS) {
      await this.prisma.v1AccessToken.update({ where: { id: row.id }, data: { lastUsedAt: now } });
    }
    return buildIcs(await this.feedEvents(row.userId, now), { name: CALENDAR_NAME, now });
  }

  // ── 일정 한 건 내려받기 (로그인 쿠키) ──────────────────────────────────────

  async scheduleFile(user: V1AuthUser, teamId: string, scheduleId: string, now: Date = new Date()): Promise<string> {
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: { teamId, userId: user.id, status: 'active', team: { status: 'active', deletedAt: null } },
      select: { team: { select: { name: true } } },
    });
    const schedule =
      membership === null
        ? null
        : await this.prisma.v1TeamSchedule.findFirst({
            where: { id: scheduleId, teamId, AND: [await visibleTeamMatchScheduleWhere(this.prisma, [teamId])] },
          });
    if (membership === null || schedule === null) {
      throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Schedule was not found' });
    }
    const events = await this.scheduleEvents([schedule], new Map([[teamId, membership.team.name]]), false);
    return buildIcs(events, { name: CALENDAR_NAME, now });
  }

  // ── 일정 모으기 ────────────────────────────────────────────────────────────

  private async feedEvents(userId: string, now: Date): Promise<IcsEvent[]> {
    const from = new Date(now.getTime() - FEED_PAST_MS);
    const to = new Date(now.getTime() + FEED_FUTURE_MS);

    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: { userId, status: 'active', team: { status: 'active', deletedAt: null } },
      select: { teamId: true, team: { select: { name: true } } },
    });
    const teamNames = new Map(memberships.map((m) => [m.teamId, m.team.name]));
    const teamIds = [...teamNames.keys()];

    const schedules =
      teamIds.length === 0
        ? []
        : await this.prisma.v1TeamSchedule.findMany({
            where: {
              teamId: { in: teamIds },
              startAt: { gte: from, lte: to },
              AND: [await visibleTeamMatchScheduleWhere(this.prisma, teamIds)],
              // 불참을 누른 일정은 내 캘린더에 넣지 않는다. 응답이 없거나 대기 중이면 넣는다.
              NOT: { attendance: { some: { userId, status: V1AttendanceStatus.NOT_GOING } } },
            },
            orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
            take: FEED_MAX_EVENTS,
          });

    const matches = await this.prisma.v1Match.findMany({
      where: {
        deletedAt: null,
        startAt: { gte: from, lte: to },
        status: { not: 'archived' },
        participants: { some: { userId, role: 'participant', status: { in: ['active', 'completed'] } } },
      },
      select: { id: true, title: true, placeName: true, placeAddress: true, startAt: true, endAt: true, status: true, updatedAt: true },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      take: FEED_MAX_EVENTS,
    });

    const origin = frontendOrigin();
    const matchEvents: IcsEvent[] = matches.map((match) => ({
      uid: `match-${match.id}@teameet.co.kr`,
      summary: match.title,
      startAt: match.startAt,
      endAt: match.endAt ?? new Date(match.startAt.getTime() + MATCH_SCHEDULE_DEFAULT_DURATION_MS),
      updatedAt: match.updatedAt,
      // 개인 매치에는 버전이 없어 수정 시각(초)을 쓴다 — 바뀔 때마다 커지니 캘린더가 변경·취소를 알아본다.
      sequence: Math.floor(match.updatedAt.getTime() / 1_000),
      location: [match.placeName, match.placeAddress].filter(Boolean).join(' ') || null,
      description: `개인 매치\n자세히 보기: ${origin}/matches/${match.id}`,
      url: `${origin}/matches/${match.id}`,
      cancelled: match.status === 'cancelled',
    }));

    // 팀이 둘 이상이면 어느 팀 일정인지 한눈에 보이게 제목 앞에 팀 이름을 붙인다.
    const scheduleEvents = await this.scheduleEvents(schedules, teamNames, teamNames.size > 1);
    return [...scheduleEvents, ...matchEvents].sort((a, b) => a.startAt.getTime() - b.startAt.getTime()).slice(0, FEED_MAX_EVENTS);
  }

  private async scheduleEvents(
    schedules: ReadonlyArray<{
      id: string;
      teamId: string;
      teamMatchId: string | null;
      title: string;
      type: V1ScheduleType;
      startAt: Date;
      endAt: Date;
      state: string;
      version: number;
      cancelReason: string | null;
      updatedAt: Date;
    }>,
    teamNames: ReadonlyMap<string, string>,
    prefixTeamName: boolean,
  ): Promise<IcsEvent[]> {
    const matchIds = schedules.flatMap((s) => (s.teamMatchId === null ? [] : [s.teamMatchId]));
    const places =
      matchIds.length === 0
        ? []
        : await this.prisma.v1TeamMatch.findMany({ where: { id: { in: matchIds } }, select: { id: true, placeName: true, placeAddress: true } });
    const placeByMatch = new Map(places.map((p) => [p.id, [p.placeName, p.placeAddress].filter(Boolean).join(' ') || null]));

    const origin = frontendOrigin();
    return schedules.map((schedule) => {
      const teamName = teamNames.get(schedule.teamId) ?? '';
      const url = `${origin}/teams/${schedule.teamId}/schedules/${schedule.id}`;
      const cancelled = schedule.state === 'CANCELLED';
      const lines = [`${teamName} · ${TYPE_LABEL[schedule.type]}`];
      if (cancelled && schedule.cancelReason) lines.push(`취소 사유: ${schedule.cancelReason}`);
      lines.push(`자세히 보기: ${url}`);
      return {
        uid: `schedule-${schedule.id}@teameet.co.kr`,
        summary: prefixTeamName && teamName ? `[${teamName}] ${schedule.title}` : schedule.title,
        startAt: schedule.startAt,
        endAt: schedule.endAt,
        updatedAt: schedule.updatedAt,
        sequence: schedule.version,
        location: schedule.teamMatchId === null ? null : (placeByMatch.get(schedule.teamMatchId) ?? null),
        description: lines.join('\n'),
        url,
        cancelled,
      };
    });
  }

  // ── 내부 ──────────────────────────────────────────────────────────────────

  private async lockUserFeed(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`calendar-feed:${userId}`}, 0))`;
  }

  private activeToken(userId: string) {
    return this.prisma.v1AccessToken.findFirst({
      where: { userId, kind: 'calendar_feed', revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  private toStatus(row: { id: string; createdAt: Date }, origin: string): CalendarFeedStatus {
    const feedUrl = `${origin}/api/v1/calendar/feed/${issueAccessToken(this.secret(), 'calendar_feed', row.id)}.ics`;
    return { connected: true, feedUrl, webcalUrl: feedUrl.replace(/^https?:/, 'webcal:'), createdAt: row.createdAt };
  }

  private secret(): string {
    const secret = process.env.V1_SESSION_SECRET;
    if (!isUsableAccessTokenSecret(secret)) {
      throw new ServiceUnavailableException({ code: 'CALENDAR_FEED_NOT_CONFIGURED', message: '캘린더 연결이 아직 준비되지 않았어요.' });
    }
    return secret;
  }
}
