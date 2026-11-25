import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { isUsableAccessTokenSecret, issueAccessToken, parseAccessToken } from '../calendar-feed/access-token';
import { tallyLiveScore } from '../games/public-records/public-live-score';
import { isPublicLiveEnabled } from '../games/public-records/public-live-flag';
import { effectivePublicVisibilityMode } from '../games/public-records/public-visibility';
import { PrismaService } from '../prisma/prisma.service';
import { tallySharedRecordGoals } from './widget-home';
import { LineupTodoService } from '../team-lineups/lineup-todo.service';
import { NEXT_GAME_STARTED_GRACE_MS } from '../team-lineups/team-upcoming-games.service';

/** 기기마다 토큰 하나라 여러 대를 쓸 수 있되 무한히 쌓이지는 않게 한다. 넘치면 가장 오래된 것부터 폐기한다. */
const MAX_ACTIVE_WIDGET_TOKENS = 10;
export const WIDGET_DEFAULT_LIMIT = 3;
export const WIDGET_MAX_LIMIT = 10;

export interface WidgetGame {
  gameId: string;
  teamId: string;
  teamName: string;
  title: string;
  opponentName: string | null;
  scheduledAt: Date | null;
  placeName: string | null;
  competitionKind: 'TOURNAMENT' | 'LEAGUE' | 'FRIENDLY';
  state: 'SCHEDULED' | 'LIVE' | 'PAUSED';
  /** 진행 중이고 공개 정책이 점수를 공개할 때만. 우리 팀 기준이다. 그 밖에는 null. */
  score: { mine: number; opponent: number } | null;
}

@Injectable()
export class WidgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lineupTodos: LineupTodoService,
  ) {}

  // ── 토큰 ───────────────────────────────────────────────────────────────────

  /** 로그인 쿠키로 부른다. 앱이 받아 위젯과 나눠 쓰는 저장소에 넣는다. */
  async issueToken(user: V1AuthUser): Promise<{ token: string }> {
    const secret = this.secret();
    const row = await this.prisma.$transaction(async (tx) => {
      const active = await tx.v1AccessToken.findMany({
        where: { userId: user.id, kind: 'widget', revokedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      const overflow = active.length - (MAX_ACTIVE_WIDGET_TOKENS - 1);
      if (overflow > 0) {
        await tx.v1AccessToken.updateMany({ where: { id: { in: active.slice(0, overflow).map((a) => a.id) } }, data: { revokedAt: new Date() } });
      }
      return tx.v1AccessToken.create({ data: { userId: user.id, kind: 'widget' } });
    });
    return { token: issueAccessToken(secret, 'widget', row.id) };
  }

  /** `Authorization: Bearer <토큰>` → 사용자. 틀리거나 폐기됐거나 비활성 계정이면 401. */
  async authenticate(authorization: string | undefined, now: Date = new Date()): Promise<{ userId: string; tokenId: string }> {
    const token = /^Bearer (\S+)$/.exec(authorization ?? '')?.[1];
    const tokenId = token === undefined ? null : parseAccessToken(token, this.secret(), 'widget');
    const row = tokenId === null ? null : await this.prisma.v1AccessToken.findFirst({ where: { id: tokenId, kind: 'widget', revokedAt: null } });
    const owner = row === null ? null : await this.prisma.v1User.findFirst({ where: { id: row.userId, accountStatus: 'active' }, select: { id: true } });
    if (row === null || owner === null) {
      throw new UnauthorizedException({ code: 'WIDGET_TOKEN_INVALID', message: '위젯 연결이 풀렸어요. 앱에서 다시 로그인해 주세요.' });
    }
    if (row.lastUsedAt === null || now.getTime() - row.lastUsedAt.getTime() > 10 * 60 * 1_000) {
      await this.prisma.v1AccessToken.update({ where: { id: row.id }, data: { lastUsedAt: now } });
    }
    return { userId: row.userId, tokenId: row.id };
  }

  /** 분실·교체한 기기까지 포함해 내 위젯 토큰을 전부 폐기한다(로그인 쿠키). */
  async revokeAll(user: V1AuthUser): Promise<{ revoked: number }> {
    const { count } = await this.prisma.v1AccessToken.updateMany({
      where: { userId: user.id, kind: 'widget', revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: count };
  }

  /** 앱에서 로그아웃할 때 그 기기의 위젯 토큰을 폐기한다. */
  async revoke(tokenId: string): Promise<{ revoked: true }> {
    await this.prisma.v1AccessToken.updateMany({ where: { id: tokenId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { revoked: true };
  }

  // ── 내 팀 경기 ─────────────────────────────────────────────────────────────

  /** 진행 중인 경기를 앞에, 그다음 다가오는 경기를 시각순으로. 내 팀 경기만. */
  async games(userId: string, limit: number, now: Date = new Date()): Promise<{ items: WidgetGame[] }> {
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: { userId, status: 'active', team: { status: 'active', deletedAt: null } },
      select: { teamId: true },
    });
    const teamIds = memberships.map((m) => m.teamId);
    if (teamIds.length === 0) return { items: [] };

    const upcoming = await this.lineupTodos.listUpcomingForTeams(teamIds, now, {
      startedWithinMs: NEXT_GAME_STARTED_GRACE_MS,
      includeUntimedTournamentGames: true,
    });
    // 3시간을 넘겨 길어지는 진행 중 경기도 놓치지 않게 따로 찾는다.
    // 위 수집 경로와 같은 숨김 규칙을 건다 — 삭제된 경기·삭제된 대회·보류된 리그의 경기는 오래 진행 중이어도 안 나온다.
    const liveRows = await this.prisma.v1Game.findMany({
      where: {
        state: { in: ['LIVE', 'PAUSED'] },
        sides: { some: { teamId: { in: teamIds } } },
        NOT: [
          { teamMatch: { is: { deletedAt: { not: null } } } },
          { teamMatch: { is: { tournament: { is: { deletedAt: { not: null } } } } } },
          { teamMatch: { is: { league: { is: { status: 'on_hold' } } } } },
        ],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: WIDGET_MAX_LIMIT,
    });
    const gameIds = [...new Set([...upcoming.map((g) => g.gameId), ...liveRows.map((g) => g.id)])];
    if (gameIds.length === 0) return { items: [] };

    const games = await this.prisma.v1Game.findMany({
      where: { id: { in: gameIds } },
      select: {
        id: true,
        state: true,
        sides: { select: { id: true, sideKey: true, teamId: true, displayNameSnapshot: true } },
        visibilityPolicy: { select: { mode: true } },
        sharedRecord: { select: { goals: true } },
        teamMatch: { select: { title: true, startAt: true, placeName: true, tournamentId: true, leagueId: true } },
      },
    });
    const gameById = new Map(games.map((g) => [g.id, g]));
    const teamIdSet = new Set(teamIds);
    const liveEnabled = await isPublicLiveEnabled(this.prisma);

    const items: WidgetGame[] = [];
    const seen = new Set<string>();
    for (const todo of upcoming) {
      const game = gameById.get(todo.gameId);
      if (game === undefined || seen.has(todo.gameId) || (game.state !== 'SCHEDULED' && game.state !== 'LIVE' && game.state !== 'PAUSED')) continue;
      seen.add(todo.gameId);
      items.push({
        gameId: todo.gameId,
        teamId: todo.teamId,
        teamName: todo.teamName,
        title: todo.title,
        opponentName: todo.opponentName,
        scheduledAt: todo.scheduledAt,
        placeName: game.teamMatch?.placeName ?? null,
        competitionKind: todo.competitionKind,
        state: game.state,
        score: null,
      });
    }
    for (const row of liveRows) {
      const game = gameById.get(row.id);
      const mine = game?.sides.find((s) => s.teamId !== null && teamIdSet.has(s.teamId));
      if (game === undefined || mine === undefined || seen.has(row.id) || (game.state !== 'LIVE' && game.state !== 'PAUSED')) continue;
      seen.add(row.id);
      items.push({
        gameId: row.id,
        teamId: mine.teamId!,
        teamName: mine.displayNameSnapshot,
        title: game.teamMatch?.title ?? '경기',
        opponentName: game.sides.find((s) => s.id !== mine.id)?.displayNameSnapshot ?? null,
        scheduledAt: game.teamMatch?.startAt ?? null,
        placeName: game.teamMatch?.placeName ?? null,
        competitionKind: game.teamMatch?.tournamentId ? 'TOURNAMENT' : game.teamMatch?.leagueId ? 'LEAGUE' : 'FRIENDLY',
        state: game.state,
        score: null,
      });
    }

    // 점수는 공개 경기 화면과 같은 규칙으로만 내준다 — 운영자가 가린 경기의 숫자가 위젯으로 새면 안 된다.
    const scorable = items.filter((item) => {
      const game = gameById.get(item.gameId)!;
      return item.state !== 'SCHEDULED' && effectivePublicVisibilityMode(game.visibilityPolicy?.mode ?? 'HIDDEN', liveEnabled) === 'live';
    });
    if (scorable.length > 0) {
      const events = await this.prisma.v1GameEvent.findMany({
        where: { gameId: { in: scorable.map((i) => i.gameId) }, OR: [{ type: { in: ['GOAL', 'OWN_GOAL'] } }, { reversesEventId: { not: null } }] },
        select: { id: true, gameId: true, type: true, sideId: true, reversesEventId: true },
      });
      for (const item of scorable) {
        const game = gameById.get(item.gameId)!;
        const sideKeyById = new Map(game.sides.map((s) => [s.id, s.sideKey] as const));
        // 친선 팀 매치는 득점을 공유 기록에 두므로 그쪽에서 센다(이벤트만 세면 0 : 0).
        const tally = game.sharedRecord !== null
          ? tallySharedRecordGoals(game.sharedRecord.goals, sideKeyById)
          : tallyLiveScore(events.filter((e) => e.gameId === item.gameId), sideKeyById);
        const mineKey = game.sides.find((s) => s.teamId === item.teamId)?.sideKey ?? 'HOME';
        item.score = mineKey === 'HOME' ? { mine: tally.home, opponent: tally.away } : { mine: tally.away, opponent: tally.home };
      }
    }

    const rank = (item: WidgetGame) => (item.state === 'SCHEDULED' ? 1 : 0);
    items.sort((a, b) => rank(a) - rank(b) || (a.scheduledAt?.getTime() ?? Infinity) - (b.scheduledAt?.getTime() ?? Infinity));
    return { items: items.slice(0, limit) };
  }

  private secret(): string {
    const secret = process.env.V1_SESSION_SECRET;
    if (!isUsableAccessTokenSecret(secret)) {
      throw new ServiceUnavailableException({ code: 'WIDGET_NOT_CONFIGURED', message: '위젯 연결이 아직 준비되지 않았어요.' });
    }
    return secret;
  }
}
