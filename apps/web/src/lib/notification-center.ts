import type { Notification } from '@/types/api';

type NotificationLike = Partial<Notification> & Pick<Notification, 'id' | 'type' | 'title' | 'body' | 'createdAt'>;

function toTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function resolveNotificationLink(notification: Pick<Notification, 'type' | 'link' | 'data'>) {
  if (notification.link) {
    return notification.link;
  }

  const data = notification.data ?? null;
  const matchId = typeof data?.matchId === 'string' ? data.matchId : null;
  const teamId = typeof data?.teamId === 'string' ? data.teamId : null;
  const teamMatchId = typeof data?.teamMatchId === 'string' ? data.teamMatchId : null;
  const paymentId = typeof data?.paymentId === 'string' ? data.paymentId : null;
  const listingId = typeof data?.listingId === 'string' ? data.listingId : null;

  switch (notification.type) {
    case 'match_created':
    case 'player_joined':
    case 'player_left':
    case 'match_reminder':
    case 'match_completed':
      return matchId ? `/matches/${matchId}` : null;
    case 'review_pending':
      return matchId ? `/matches/${matchId}` : '/reviews';
    case 'team_announced':
      if (teamMatchId) {
        return `/team-matches/${teamMatchId}`;
      }
      return teamId ? `/teams/${teamId}` : null;
    case 'payment_confirmed':
    case 'payment_refunded':
      return paymentId ? `/payments/${paymentId}` : '/payments';
    case 'marketplace_order':
    case 'marketplace_message':
      return listingId ? `/marketplace/${listingId}` : '/marketplace';
    case 'level_changed':
      return '/profile';
    default:
      return null;
  }
}

export function notificationVisualType(notification: Pick<Notification, 'category' | 'type'>) {
  if (notification.category) {
    return notification.category;
  }

  switch (notification.type) {
    case 'match_created':
    case 'player_joined':
    case 'player_left':
    case 'match_reminder':
    case 'match_completed':
    case 'review_pending':
      return 'match' as const;
    case 'team_announced':
      return 'team' as const;
    case 'marketplace_message':
      return 'chat' as const;
    case 'payment_confirmed':
    case 'payment_refunded':
    case 'marketplace_order':
      return 'payment' as const;
    default:
      return 'system' as const;
  }
}

export function normalizeNotification(notification: NotificationLike): Notification {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    isRead: notification.isRead ?? false,
    createdAt: notification.createdAt,
    data: notification.data ?? null,
    category: notificationVisualType(notification as Notification),
    link: resolveNotificationLink(notification as Notification),
    ctaLabel: notification.ctaLabel ?? null,
  };
}

function sortNotifications(items: Notification[]) {
  return [...items].sort((left, right) => {
    if (left.isRead !== right.isRead) {
      return left.isRead ? 1 : -1;
    }

    return toTimestamp(right.createdAt) - toTimestamp(left.createdAt);
  });
}

export function upsertNotificationList(current: Notification[] | undefined, incoming: NotificationLike) {
  const nextNotification = normalizeNotification(incoming);
  const existing = current ?? [];
  const others = existing.filter((item) => item.id !== nextNotification.id);
  return sortNotifications([nextNotification, ...others]);
}

export function markNotificationReadInList(current: Notification[] | undefined, notificationId: string) {
  if (!current) {
    return current;
  }

  return current.map((notification) =>
    notification.id === notificationId
      ? { ...notification, isRead: true }
      : notification,
  );
}

export function markAllNotificationsReadInList(current: Notification[] | undefined) {
  if (!current) {
    return current;
  }

  return current.map((notification) => ({ ...notification, isRead: true }));
}

export function unreadNotificationCount(current: Notification[] | undefined) {
  return (current ?? []).filter((notification) => !notification.isRead).length;
}
