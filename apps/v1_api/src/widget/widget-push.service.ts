import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { V1PushPlatform } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ApnsPushService } from '../notifications/apns-push.service';
import { FcmPushService } from '../notifications/fcm-push.service';
import { resolvePushEnvironment } from '../notifications/push-environment';
import { PrismaService } from '../prisma/prisma.service';
import { WIDGET_LIVE_MAX_AGE_MS } from './widget-home';
import { liveGameWhere, WidgetHomeService, type WidgetLiveGame } from './widget-home.service';
import { liveActivityContentState, liveActivityDismissalSeconds, liveStateHash } from './widget-push';

const TICK_MS = 10_000;
/** 한 번에 보는 진행 중 경기 수. 넘치면 다음 틱이 이어서 본다(경기는 길어야 몇 시간이라 곧 줄어든다). */
const MAX_ACTIVE_GAMES = 200;

/**
 * 경기 상태가 바뀌면(득점·구간 시작/끝·일시정지·종료) 위젯과 실시간 카드에 알린다.
 *
 * 득점·구간·종료가 일어나는 길이 여러 곳(경기 기록, 친선 공유 기록, 시계 만료, 관리자)이라 각 길에 끼워 넣지 않고,
 * 위젯 홈이 보여 주는 값을 주기적으로 다시 계산해 지난번과 다르면 보낸다. 새 길이 생겨도 빠지지 않는다.
 *
 * - 안드로이드: 데이터 전용 FCM(`type=widget_refresh`) — 위젯이 알아서 다시 불러온다.
 * - 아이폰: 카드별 푸시 토큰으로 APNs `liveactivity` 갱신, 종료되면 `end` + 종료 15분 뒤 `dismissal-date`.
 * - 운영 자동 작업이라 `V1_WIDGET_PUSH_ENABLED=true` 일 때만 돈다.
 *
 * ponytail: 마지막으로 보낸 지문은 이 프로세스 메모리에만 둔다. 재시작하면 진행 중 경기에 한 번씩 더 나가고(무해),
 * API 가 여러 대가 되면 같은 변화가 대수만큼 나간다 — 그때 DB 에 지문 컬럼을 둔다.
 */
@Injectable()
export class WidgetPushService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly sent = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly home: WidgetHomeService,
    private readonly apns: ApnsPushService,
    private readonly fcm: FcmPushService,
    @InjectPinoLogger(WidgetPushService.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    if (process.env.V1_WIDGET_PUSH_ENABLED !== 'true') return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
  }

  async tick(now: Date = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.prisma.v1WidgetLiveActivity.deleteMany({ where: { updatedAt: { lt: new Date(now.getTime() - WIDGET_LIVE_MAX_AGE_MS) } } });
      const games = await this.prisma.v1Game.findMany({
        where: liveGameWhere(now),
        select: { id: true, sides: { select: { teamId: true } } },
        take: MAX_ACTIVE_GAMES,
      });
      if (games.length === 0) {
        this.sent.clear();
        return;
      }
      const gameIds = games.map((game) => game.id);
      const teamIds = [...new Set(games.flatMap((game) => game.sides.flatMap((side) => (side.teamId === null ? [] : [side.teamId]))))];

      const activities = await this.prisma.v1WidgetLiveActivity.findMany({
        where: { gameId: { in: gameIds }, token: { is: { revokedAt: null } } },
        select: { id: true, userId: true, gameId: true, pushToken: true },
      });
      const androidDevices = await this.androidDevices(teamIds);
      const users = new Set([...activities.map((a) => a.userId), ...androidDevices.keys()]);

      for (const userId of users) {
        const live = await this.home.liveFor(userId, now);
        const byGame = new Map(live.map((game) => [game.gameId, game]));
        await this.pushAndroid(userId, live, androidDevices.get(userId) ?? []);
        for (const activity of activities.filter((a) => a.userId === userId)) {
          const game = byGame.get(activity.gameId);
          if (game !== undefined) await this.pushActivity(activity, game, now);
        }
      }
    } catch (err) {
      this.logger.error({ err }, 'widget push tick failed');
    } finally {
      this.running = false;
    }
  }

  /** 진행 중 경기를 가진 팀의 팀원 중 위젯 토큰이 있는 사람의 안드로이드 기기. */
  private async androidDevices(teamIds: string[]) {
    const members = await this.prisma.v1TeamMembership.findMany({ where: { teamId: { in: teamIds }, status: 'active' }, select: { userId: true } });
    const userIds = [...new Set(members.map((m) => m.userId))];
    if (userIds.length === 0 || !this.fcm.isConfigured) return new Map<string, Array<{ id: string; token: string; platform: V1PushPlatform }>>();
    const [tokens, devices] = await Promise.all([
      this.prisma.v1AccessToken.findMany({ where: { userId: { in: userIds }, kind: 'widget', revokedAt: null }, select: { userId: true }, distinct: ['userId'] }),
      this.prisma.v1PushDevice.findMany({
        where: { userId: { in: userIds }, platform: V1PushPlatform.android, environment: resolvePushEnvironment(), revokedAt: null },
        select: { id: true, userId: true, token: true, platform: true },
      }),
    ]);
    const withToken = new Set(tokens.map((t) => t.userId));
    const byUser = new Map<string, Array<{ id: string; token: string; platform: V1PushPlatform }>>();
    for (const device of devices) {
      if (!withToken.has(device.userId)) continue;
      byUser.set(device.userId, [...(byUser.get(device.userId) ?? []), device]);
    }
    return byUser;
  }

  private async pushAndroid(userId: string, live: WidgetLiveGame[], devices: Array<{ id: string; token: string; platform: V1PushPlatform }>): Promise<void> {
    if (devices.length === 0) return;
    const changed = live.filter((game) => this.changed(`a:${userId}:${game.gameId}`, liveStateHash(game)));
    if (changed.length === 0) return;
    await this.fcm.send(devices, { notificationId: 'widget-refresh', title: '', dataOnly: { type: 'widget_refresh' } });
  }

  private async pushActivity(activity: { id: string; pushToken: string }, game: WidgetLiveGame, now: Date): Promise<void> {
    const key = `i:${activity.id}:${activity.pushToken}`;
    const hash = liveStateHash(game);
    if (this.sent.get(key) === hash) return;
    const ended = game.state === 'ENDED';
    const outcome = await this.apns.sendLiveActivity(activity.pushToken, {
      event: ended ? 'end' : 'update',
      contentState: liveActivityContentState(game, now),
      ...(ended ? { dismissalDate: liveActivityDismissalSeconds(game, now) } : {}),
    });
    if (outcome === 'delivered') this.sent.set(key, hash);
    // 끝난 카드와 죽은 토큰은 더 보낼 곳이 없다. 일시 오류는 남겨 다음 틱이 다시 보낸다.
    if ((outcome === 'delivered' && ended) || outcome === 'permanent') {
      await this.prisma.v1WidgetLiveActivity.deleteMany({ where: { id: activity.id, pushToken: activity.pushToken } });
      this.sent.delete(key);
    }
  }

  /** 지난번 보낸 지문과 다르면 기억하고 true. */
  private changed(key: string, hash: string): boolean {
    if (this.sent.get(key) === hash) return false;
    this.sent.set(key, hash);
    return true;
  }
}
