import { NotificationType } from '@prisma/client';

type NotificationRecord = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: Date;
  data: unknown;
};

export type NotificationCategory = 'match' | 'team' | 'chat' | 'payment' | 'system';

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: Date;
  data: Record<string, unknown> | null;
  category: NotificationCategory;
  link: string | null;
  ctaLabel: string | null;
}

function asRecord(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }

  return data as Record<string, unknown>;
}

function readString(data: Record<string, unknown> | null, key: string) {
  const value = data?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function notificationCategory(type: NotificationType): NotificationCategory {
  switch (type) {
    case NotificationType.match_created:
    case NotificationType.player_joined:
    case NotificationType.player_left:
    case NotificationType.match_updated:
    case NotificationType.match_confirmed:
    case NotificationType.match_reminder:
    case NotificationType.match_cancelled:
    case NotificationType.match_completed:
    case NotificationType.review_pending:
      return 'match';
    case NotificationType.team_announced:
    case NotificationType.team_invitation:
      return 'team';
    case NotificationType.marketplace_message:
      return 'chat';
    case NotificationType.payment_confirmed:
    case NotificationType.payment_refunded:
    case NotificationType.marketplace_order:
      return 'payment';
    case NotificationType.level_changed:
    default:
      return 'system';
  }
}

export function notificationLink(type: NotificationType, data: Record<string, unknown> | null) {
  const explicitLink = readString(data, 'link');
  if (explicitLink) {
    return explicitLink;
  }

  const matchId = readString(data, 'matchId');
  const teamId = readString(data, 'teamId');
  const teamMatchId = readString(data, 'teamMatchId');
  const paymentId = readString(data, 'paymentId');
  const listingId = readString(data, 'listingId');

  switch (type) {
    case NotificationType.match_created:
    case NotificationType.player_joined:
    case NotificationType.player_left:
    case NotificationType.match_updated:
    case NotificationType.match_confirmed:
    case NotificationType.match_reminder:
    case NotificationType.match_cancelled:
    case NotificationType.match_completed:
      return matchId ? `/matches/${matchId}` : null;
    case NotificationType.review_pending:
      return matchId ? `/matches/${matchId}` : '/reviews';
    case NotificationType.team_announced:
      if (teamMatchId) {
        return `/team-matches/${teamMatchId}`;
      }
      return teamId ? `/teams/${teamId}` : null;
    case NotificationType.payment_confirmed:
    case NotificationType.payment_refunded:
      return paymentId ? `/payments/${paymentId}` : '/payments';
    case NotificationType.marketplace_order:
    case NotificationType.marketplace_message:
      return listingId ? `/marketplace/${listingId}` : '/marketplace';
    case NotificationType.level_changed:
      return '/profile';
    default:
      return null;
  }
}

export function notificationCtaLabel(type: NotificationType) {
  switch (type) {
    case NotificationType.payment_confirmed:
    case NotificationType.payment_refunded:
      return '결제 보기';
    case NotificationType.team_announced:
      return '팀 보기';
    case NotificationType.marketplace_order:
    case NotificationType.marketplace_message:
      return '상세 보기';
    case NotificationType.level_changed:
      return '프로필 보기';
    case NotificationType.match_created:
    case NotificationType.player_joined:
    case NotificationType.player_left:
    case NotificationType.match_updated:
    case NotificationType.match_confirmed:
    case NotificationType.match_reminder:
    case NotificationType.match_cancelled:
    case NotificationType.match_completed:
    case NotificationType.review_pending:
      return '매치 보기';
    default:
      return null;
  }
}

export function presentNotification(notification: NotificationRecord): NotificationView {
  const data = asRecord(notification.data);

  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    isRead: notification.isRead,
    createdAt: notification.createdAt,
    data,
    category: notificationCategory(notification.type),
    link: notificationLink(notification.type, data),
    ctaLabel: notificationCtaLabel(notification.type),
  };
}
