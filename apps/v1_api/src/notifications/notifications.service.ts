import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, V1NotificationTargetType } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  NotificationsQueryDto,
  ReadAllNotificationsDto,
  UpdateNotificationPreferencesDto,
} from './dto/notifications.dto';
import { WebPushService } from './web-push.service';

/** Notification event types emitted by domain services. */
export type NotificationEventType =
  | 'match_application_received'
  | 'match_application_approved'
  | 'match_application_rejected'
  | 'match_cancelled'
  | 'match_completed'
  | 'team_join_application_received'
  | 'team_join_application_accepted'
  | 'team_join_application_rejected'
  | 'team_match_application_received'
  | 'team_match_application_withdrawn'
  | 'team_match_application_approved'
  | 'team_match_application_rejected'
  | 'team_match_closed'
  | 'team_match_cancelled'
  | 'team_match_completed'
  | 'tournament_registration_confirmed'
  | 'tournament_registration_waitlisted'
  | 'tournament_registration_cancelled'
  | 'tournament_registration_submitted'
  | 'tournament_payment_confirmed'
  | 'tournament_announcement_published'
  | 'team_invitation_received'
  | 'team_invitation_accepted';

/** Preference field in V1NotificationPreference that gates the event type. */
function preferenceFieldForEvent(
  type: NotificationEventType,
): keyof Pick<
  {
    matchEnabled: boolean;
    teamEnabled: boolean;
    teamMatchEnabled: boolean;
    chatEnabled: boolean;
    activityEnabled: boolean;
    importantEnabled: boolean;
    noticeEnabled: boolean;
    marketingEnabled: boolean;
  },
  'matchEnabled' | 'teamEnabled' | 'teamMatchEnabled' | 'activityEnabled'
> {
  if (
    type === 'match_application_received' ||
    type === 'match_application_approved' ||
    type === 'match_application_rejected' ||
    type === 'match_cancelled' ||
    type === 'match_completed'
  ) {
    return 'matchEnabled';
  }
  if (
    type === 'team_join_application_received' ||
    type === 'team_join_application_accepted' ||
    type === 'team_join_application_rejected' ||
    type === 'team_invitation_received' ||
    type === 'team_invitation_accepted'
  ) {
    return 'teamEnabled';
  }
  if (
    type === 'team_match_application_received' ||
    type === 'team_match_application_withdrawn' ||
    type === 'team_match_application_approved' ||
    type === 'team_match_application_rejected' ||
    type === 'team_match_closed' ||
    type === 'team_match_cancelled' ||
    type === 'team_match_completed'
  ) {
    return 'teamMatchEnabled';
  }
  if (
    type === 'tournament_registration_confirmed' ||
    type === 'tournament_registration_waitlisted' ||
    type === 'tournament_registration_cancelled' ||
    type === 'tournament_registration_submitted' ||
    type === 'tournament_payment_confirmed' ||
    type === 'tournament_announcement_published'
  ) {
    return 'activityEnabled';
  }
  return 'activityEnabled';
}

function targetTypeForEvent(type: NotificationEventType): V1NotificationTargetType {
  if (
    type === 'match_application_received' ||
    type === 'match_application_approved' ||
    type === 'match_application_rejected' ||
    type === 'match_cancelled' ||
    type === 'match_completed'
  ) {
    return 'match';
  }
  if (
    type === 'team_join_application_received' ||
    type === 'team_join_application_accepted' ||
    type === 'team_join_application_rejected' ||
    type === 'team_invitation_received' ||
    type === 'team_invitation_accepted'
  ) {
    return 'team';
  }
  if (
    type === 'tournament_registration_confirmed' ||
    type === 'tournament_registration_waitlisted' ||
    type === 'tournament_registration_cancelled' ||
    type === 'tournament_registration_submitted' ||
    type === 'tournament_payment_confirmed' ||
    type === 'tournament_announcement_published'
  ) {
    return 'tournament';
  }
  return 'team_match';
}

/**
 * Maps a notification targetType to its consumer route base. Naive pluralization
 * (`targetType + 's'`) breaks for 'match'/'team_match' → '/matchs'/'/team-matchs',
 * so map explicitly to the real Next.js routes.
 */
const ROUTE_BASE_BY_TARGET_TYPE: Partial<Record<V1NotificationTargetType, string>> = {
  match: '/matches',
  team: '/teams',
  team_match: '/team-matches',
  tournament: '/tournaments',
};

function deepLinkForTarget(
  targetType: V1NotificationTargetType,
  targetId: string | null,
): string | null {
  if (!targetId) return null;
  const base = ROUTE_BASE_BY_TARGET_TYPE[targetType] ?? `/${targetType.replace(/_/g, '-')}s`;
  return `${base}/${targetId}`;
}

function deepLinkForEvent(
  type: NotificationEventType,
  targetType: V1NotificationTargetType,
  targetId: string | null,
): string | null {
  if (type === 'team_join_application_received' && targetId) {
    return `/teams/${targetId}/members`;
  }
  return deepLinkForTarget(targetType, targetId);
}

const EVENT_TITLES: Record<NotificationEventType, string> = {
  match_application_received: '매치 신청이 도착했어요',
  match_application_approved: '매치 신청이 승인됐어요',
  match_application_rejected: '매치 신청이 거절됐어요',
  match_cancelled: '매치가 취소됐어요',
  match_completed: '매치가 완료됐어요. 리뷰를 남겨보세요!',
  team_join_application_received: '팀 가입 신청이 도착했어요',
  team_join_application_accepted: '팀 가입 신청이 수락됐어요',
  team_join_application_rejected: '팀 가입 신청이 거절됐어요',
  team_match_application_received: '팀매치 신청이 도착했어요',
  team_match_application_withdrawn: '팀매치 신청이 취소됐어요',
  team_match_application_approved: '팀매치 신청이 승인됐어요',
  team_match_application_rejected: '팀매치 신청이 거절됐어요',
  team_match_closed: '팀매치 모집이 마감됐어요',
  team_match_cancelled: '팀매치가 취소됐어요',
  team_match_completed: '팀매치가 완료됐어요. 리뷰를 남겨보세요!',
  tournament_registration_confirmed: '대회 참가가 확정됐어요',
  tournament_registration_waitlisted: '대기자 명단에 등록됐어요',
  tournament_registration_cancelled: '대회 참가가 취소됐어요',
  tournament_registration_submitted: '대회 신청이 접수됐어요',
  tournament_payment_confirmed: '입금이 확인됐어요',
  tournament_announcement_published: '대회 공지가 올라왔어요',
  team_invitation_received: '팀 초대가 도착했어요',
  team_invitation_accepted: '팀 초대를 수락했어요',
};

/**
 * 알림 본문(body) 기본값 — 호출부가 body를 넘기지 않아도 항상 title+body 구조를 보장하는 fallback.
 * 문체 규칙: 상태 통보성 이벤트(신청 승인/거절/취소 등 이미 벌어진 일을 알림)는 평서형("~됐어요.")을,
 * 사용자 행동이 필요한 이벤트(입금 확인 대기, 신청 검토, 공지 확인 등)는 청유형("~해주세요."/"~해 보세요.")을
 * 쓴다. 초대한 팀 이름·상대팀명·대회명처럼 의미 있는 변수가 있으면 호출부에서 `"${value}" ...` 형태로
 * 따옴표에 감싸 본문 앞에 삽입한 문자열을 명시적으로 전달해 이 기본값을 오버라이드한다.
 */
const EVENT_BODIES: Record<NotificationEventType, string> = {
  match_application_received: '매치 신청을 확인해 주세요.',
  match_application_approved: '매치 참가가 확정됐어요.',
  match_application_rejected: '매치 신청이 거절됐어요.',
  match_cancelled: '매치가 취소됐어요.',
  match_completed: '함께한 매치의 리뷰를 남겨보세요.',
  team_join_application_received: '팀 가입 신청을 확인해 주세요.',
  team_join_application_accepted: '팀 가입이 승인됐어요.',
  team_join_application_rejected: '팀 가입 신청이 거절됐어요.',
  team_match_application_received: '팀매치 신청을 확인해 주세요.',
  team_match_application_withdrawn: '상대팀 신청이 취소됐어요.',
  team_match_application_approved: '팀매치 신청이 승인됐어요.',
  team_match_application_rejected: '팀매치 신청이 거절됐어요.',
  team_match_closed: '모집이 마감되어 대기 중인 신청이 종료됐어요.',
  team_match_cancelled: '팀매치가 취소됐어요.',
  team_match_completed: '팀매치 리뷰를 남겨보세요.',
  tournament_registration_confirmed: '대회 참가가 확정됐어요.',
  tournament_registration_waitlisted: '대기자 명단에 등록됐어요.',
  tournament_registration_cancelled: '대회 참가 신청이 취소됐어요.',
  tournament_registration_submitted: '입금 안내를 확인해 주세요.',
  tournament_payment_confirmed: '운영진 확정을 기다려 주세요.',
  tournament_announcement_published: '공지를 확인해 보세요.',
  team_invitation_received: '팀 초대를 확인해 보세요.',
  team_invitation_accepted: '팀 초대를 수락했어요.',
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly webPushService: WebPushService,
    @InjectPinoLogger(NotificationsService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Fire-and-forget: creates a V1Notification for userId if the user's preference
   * for this event category is enabled (or no preference row exists → defaults enabled).
   * Notification failures must NEVER propagate to the caller's transaction or response.
   */
  async emitNotification(
    userId: string,
    type: NotificationEventType,
    targetId: string | null,
    body?: string,
  ): Promise<void> {
    const targetType = targetTypeForEvent(type);
    const deepLink = deepLinkForEvent(type, targetType, targetId);
    const title = EVENT_TITLES[type];
    const prefField = preferenceFieldForEvent(type);

    this.emitNotificationFireAndForget(
      userId,
      targetType,
      targetId,
      title,
      body ?? EVENT_BODIES[type],
      deepLink,
      prefField,
    );
  }

  /**
   * Emit to multiple users. Each user's preference is checked individually.
   */
  async emitNotificationToMany(
    userIds: string[],
    type: NotificationEventType,
    targetId: string | null,
    body?: string,
  ): Promise<void> {
    if (userIds.length === 0) return;
    for (const userId of userIds) {
      this.emitNotificationFireAndForget(
        userId,
        targetTypeForEvent(type),
        targetId,
        EVENT_TITLES[type],
        body ?? EVENT_BODIES[type],
        deepLinkForEvent(type, targetTypeForEvent(type), targetId),
        preferenceFieldForEvent(type),
      );
    }
  }

  /**
   * Fire-and-forget for recipient sets that need a lookup: resolves the userIds
   * then emits, swallowing ALL errors (including the lookup itself) so that the
   * notification side-effect never breaks the caller's already-committed request.
   */
  emitToManyDeferred(
    resolveUserIds: () => Promise<string[]>,
    type: NotificationEventType,
    targetId: string | null,
    body?: string,
  ): void {
    void (async () => {
      const userIds = await resolveUserIds();
      await this.emitNotificationToMany(userIds, type, targetId, body);
    })().catch((e: unknown) =>
      this.logger.warn(
        { type, error: e instanceof Error ? e.message : String(e) },
        '알림 발송 실패',
      ),
    );
  }

  private emitNotificationFireAndForget(
    userId: string,
    targetType: V1NotificationTargetType,
    targetId: string | null,
    title: string,
    body: string | null,
    deepLink: string | null,
    prefField: keyof { matchEnabled: boolean; teamEnabled: boolean; teamMatchEnabled: boolean; activityEnabled: boolean },
  ): void {
    this.createNotificationWithPrefCheck(userId, targetType, targetId, title, body, deepLink, prefField).catch(
      (err: unknown) => {
        this.logger.warn(
          {
            userId,
            targetType,
            targetId,
            error: err instanceof Error ? err.message : String(err),
          },
          '알림 생성 실패',
        );
      },
    );
  }

  private async createNotificationWithPrefCheck(
    userId: string,
    targetType: V1NotificationTargetType,
    targetId: string | null,
    title: string,
    body: string | null,
    deepLink: string | null,
    prefField: keyof { matchEnabled: boolean; teamEnabled: boolean; teamMatchEnabled: boolean; activityEnabled: boolean },
  ): Promise<void> {
    const pref = await this.prisma.v1NotificationPreference.findUnique({
      where: { userId },
      select: { [prefField]: true },
    });
    // If no preference row, default is enabled (treat as true).
    const enabled = pref ? (pref as Record<string, boolean>)[prefField] !== false : true;
    if (!enabled) return;

    const notification = await this.prisma.v1Notification.create({
      data: {
        recipientUserId: userId,
        targetType,
        targetId,
        title,
        body,
        deepLink,
      },
    });

    // emitToUser와 sendToUser는 서로 독립적인 채널이다 — 하나가 던져도 다른 하나의
    // 시도는 계속되어야 한다(ChatService.sendMessage의 개별 try/catch 격리 패턴과 동일).
    try {
      this.realtimeGateway.emitToUser(userId, 'notification:new', notification);
    } catch (err) {
      this.logger.warn(
        {
          userId,
          targetType,
          targetId,
          error: err instanceof Error ? err.message : String(err),
        },
        '실시간 알림 전송 실패',
      );
    }

    void this.webPushService
      .sendToUser(userId, { title, body: body ?? undefined, url: deepLink ?? undefined })
      .catch((err: unknown) => {
        this.logger.warn(
          {
            userId,
            targetType,
            targetId,
            error: err instanceof Error ? err.message : String(err),
          },
          '웹 푸시 발송 실패',
        );
      });
  }

  async list(user: V1AuthUser, query: NotificationsQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const where: Prisma.V1NotificationWhereInput = {
      recipientUserId: user.id,
      ...(query.status === 'read' ? { readAt: { not: null } } : {}),
      ...(query.status === 'unread' || query.status === 'created' ? { readAt: null } : {}),
      ...(query.type ? { targetType: query.type as never } : {}),
    };
    const [items, unreadCount] = await Promise.all([
      this.prisma.v1Notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      }),
      this.prisma.v1Notification.count({ where: { recipientUserId: user.id, readAt: null } }),
    ]);
    const pageItems = items.slice(0, limit);
    const hasNext = items.length > limit;

    return {
      items: pageItems.map((notification) => ({
        notificationId: notification.id,
        type: notification.targetType,
        title: notification.title,
        body: notification.body,
        target: {
          type: notification.targetType,
          id: notification.targetId,
          route: notification.deepLink,
        },
        status: notification.readAt ? 'read' : 'created',
        readAt: notification.readAt,
        createdAt: notification.createdAt,
      })),
      unreadCount,
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  async read(user: V1AuthUser, notificationId: string) {
    const notification = await this.prisma.v1Notification.findUnique({ where: { id: notificationId } });
    if (!notification) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Notification was not found' });
    if (notification.recipientUserId !== user.id) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Notification access is denied' });
    }
    const readAt = notification.readAt ?? new Date();
    const updated = notification.readAt
      ? notification
      : await this.prisma.v1Notification.update({ where: { id: notification.id }, data: { readAt } });
    return { notificationId: updated.id, status: 'read', readAt: updated.readAt ?? readAt };
  }

  async readAll(user: V1AuthUser, dto: ReadAllNotificationsDto) {
    const readAt = new Date();
    const result = await this.prisma.v1Notification.updateMany({
      where: {
        recipientUserId: user.id,
        readAt: null,
        ...(dto.type ? { targetType: dto.type as never } : {}),
      },
      data: { readAt },
    });
    const unreadCount = await this.prisma.v1Notification.count({
      where: { recipientUserId: user.id, readAt: null },
    });
    return { updatedCount: result.count, readAt, unreadCount };
  }

  async preferences(user: V1AuthUser) {
    const preferences = await this.prisma.v1NotificationPreference.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
    return toPreferencesResponse(preferences);
  }

  async updatePreferences(user: V1AuthUser, dto: UpdateNotificationPreferencesDto) {
    const preferences = await this.prisma.v1NotificationPreference.upsert({
      where: { userId: user.id },
      update: {
        ...(dto.importantEnabled === undefined ? {} : { importantEnabled: dto.importantEnabled }),
        ...(dto.activityEnabled === undefined ? {} : { activityEnabled: dto.activityEnabled }),
        ...(dto.marketingEnabled === undefined ? {} : { marketingEnabled: dto.marketingEnabled }),
      },
      create: {
        userId: user.id,
        importantEnabled: dto.importantEnabled ?? true,
        activityEnabled: dto.activityEnabled ?? true,
        marketingEnabled: dto.marketingEnabled ?? false,
      },
    });
    return toPreferencesResponse(preferences);
  }
}

function toPreferencesResponse(preferences: {
  importantEnabled: boolean;
  activityEnabled: boolean;
  marketingEnabled: boolean;
  updatedAt: Date;
}) {
  return {
    importantEnabled: preferences.importantEnabled,
    activityEnabled: preferences.activityEnabled,
    marketingEnabled: preferences.marketingEnabled,
    updatedAt: preferences.updatedAt,
  };
}
