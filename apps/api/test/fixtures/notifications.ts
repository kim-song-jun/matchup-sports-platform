import { PrismaClient, Notification, NotificationType } from '@prisma/client';

// Prisma's generated `Json` type for runtime objects (Prisma.JsonObject is a subtype)
type JsonObject = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Build helpers — pure in-memory objects for unit test mocks (no DB I/O)
// ---------------------------------------------------------------------------

export function buildNotification(
  overrides: Partial<{
    id: string;
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    /** Stored as Prisma Json? — accepts null (field omitted in DB). */
    data: JsonObject | null;
    isRead: boolean;
    createdAt: Date;
  }> = {},
): Omit<Notification, 'data'> & { data: JsonObject | null } {
  return {
    id: overrides.id ?? 'notif-test-id',
    userId: overrides.userId ?? 'user-test-id',
    type: overrides.type ?? NotificationType.match_created,
    title: overrides.title ?? '매치가 생성되었습니다',
    body: overrides.body ?? '새 풋살 매치에 참여해 보세요.',
    data: overrides.data !== undefined ? overrides.data : { matchId: 'match-test-id' },
    isRead: overrides.isRead ?? false,
    createdAt: overrides.createdAt ?? new Date('2026-03-01'),
  };
}

// ---------------------------------------------------------------------------
// DB builders
// ---------------------------------------------------------------------------

/**
 * Creates a single Notification for a user.
 */
export async function createNotification(
  prisma: PrismaClient,
  userId: string,
  overrides: Partial<{
    type: NotificationType;
    title: string;
    body: string;
    isRead: boolean;
  }> = {},
): Promise<Notification> {
  return prisma.notification.create({
    data: {
      userId,
      type: overrides.type ?? NotificationType.match_created,
      title: overrides.title ?? '매치가 생성되었습니다',
      body: overrides.body ?? '새 매치에 참여해 보세요.',
      isRead: overrides.isRead ?? false,
    },
  });
}

/**
 * Creates a spread of notifications covering all 8 common types (read + unread mix).
 * Useful for testing notification list pagination and type filtering.
 */
export async function createNotificationSet(
  prisma: PrismaClient,
  userId: string,
): Promise<Notification[]> {
  const specs: Array<{ type: NotificationType; title: string; body: string; isRead: boolean }> = [
    { type: NotificationType.match_created, title: '매치 생성', body: '새 풋살 매치가 열렸습니다.', isRead: false },
    { type: NotificationType.player_joined, title: '참가자 추가', body: '새 플레이어가 참가했습니다.', isRead: false },
    { type: NotificationType.match_confirmed, title: '매치 확정', body: '매치가 확정되었습니다.', isRead: true },
    { type: NotificationType.payment_confirmed, title: '결제 완료', body: '결제가 완료되었습니다.', isRead: true },
    { type: NotificationType.review_pending, title: '리뷰 요청', body: '매치 후기를 작성해 주세요.', isRead: false },
    { type: NotificationType.team_invitation, title: '팀 초대', body: '팀에 초대받았습니다.', isRead: false },
    { type: NotificationType.badge_earned, title: '뱃지 획득', body: '새 뱃지를 획득했습니다.', isRead: true },
    { type: NotificationType.marketplace_order, title: '주문 접수', body: '새 주문이 접수되었습니다.', isRead: false },
  ];

  const notifications = await Promise.all(
    specs.map((spec) =>
      prisma.notification.create({
        data: {
          userId,
          type: spec.type,
          title: spec.title,
          body: spec.body,
          isRead: spec.isRead,
        },
      }),
    ),
  );

  return notifications;
}
