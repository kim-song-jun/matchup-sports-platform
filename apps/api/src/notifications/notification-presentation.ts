import { NotificationType } from '@prisma/client';

type NotificationRecord = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: Date;
  /** Prisma JsonValue from DB — runtime-narrowed by asRecord(); not a REST input DTO. */
  data: unknown;
};

export type NotificationCategory = 'match' | 'team' | 'chat' | 'payment' | 'system';

/**
 * Notification payload shape after DB retrieval.
 * Typed as Record because Prisma stores free-form JSON; runtime-narrowed via asRecord().
 */
export type NotificationData = Record<string, unknown>;

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: Date;
  /** Prisma JsonValue narrowed to key-value object, or null for non-object payloads. */
  data: NotificationData | null;
  category: NotificationCategory;
  link: string | null;
  ctaLabel: string | null;
}

/**
 * Narrows Prisma JsonValue to a plain object.
 * Cannot be a class-validator DTO because it represents DB output, not REST input.
 */
function asRecord(data: unknown): NotificationData | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }

  return data as NotificationData;
}

function readString(data: NotificationData | null, key: string) {
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
    case NotificationType.review_received:
    case NotificationType.team_match_applied:
    case NotificationType.team_match_approved:
    case NotificationType.team_match_rejected:
    case NotificationType.mercenary_applied:
    case NotificationType.mercenary_accepted:
    case NotificationType.mercenary_rejected:
    case NotificationType.mercenary_closed:
    case NotificationType.mercenary_cancelled:
      return 'match';
    case NotificationType.team_announced:
    case NotificationType.team_invitation:
    case NotificationType.team_application_received:
    case NotificationType.team_application_accepted:
    case NotificationType.team_application_rejected:
      return 'team';
    case NotificationType.marketplace_message:
    case NotificationType.chat_message:
      return 'chat';
    case NotificationType.payment_confirmed:
    case NotificationType.payment_refunded:
    case NotificationType.marketplace_order:
    case NotificationType.lesson_ticket_purchased:
    case NotificationType.marketplace_payout_paid:
      return 'payment';
    case NotificationType.badge_earned:
    case NotificationType.no_show_penalty:
      return 'team';
    case NotificationType.level_changed:
    default:
      // NOTE: any new NotificationType must be explicitly mapped here;
      // default falls to 'system' which has no user-controllable preference gate.
      return 'system';
  }
}

export function notificationLink(type: NotificationType, data: NotificationData | null) {
  const explicitLink = readString(data, 'link');
  if (explicitLink) {
    return explicitLink;
  }

  const matchId = readString(data, 'matchId');
  const teamId = readString(data, 'teamId');
  const teamMatchId = readString(data, 'teamMatchId');
  const paymentId = readString(data, 'paymentId');
  const listingId = readString(data, 'listingId');
  const mercenaryPostId = readString(data, 'mercenaryPostId');
  const chatRoomId = readString(data, 'chatRoomId');

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
    case NotificationType.review_received:
      return matchId ? `/matches/${matchId}` : '/reviews';
    case NotificationType.team_announced:
      if (teamMatchId) {
        return `/team-matches/${teamMatchId}`;
      }
      return teamId ? `/teams/${teamId}` : null;
    case NotificationType.team_application_received:
      return teamId ? `/teams/${teamId}/members?tab=applicants` : null;
    case NotificationType.team_application_accepted:
    case NotificationType.team_application_rejected:
      return teamId ? `/teams/${teamId}` : null;
    case NotificationType.team_match_applied:
    case NotificationType.team_match_rejected:
      return teamMatchId ? `/team-matches/${teamMatchId}` : '/team-matches';
    case NotificationType.team_match_approved:
      // Prefer deep-linking to the chat room; fall back to match detail for older notifications
      return chatRoomId ? `/chat/${chatRoomId}` : (teamMatchId ? `/team-matches/${teamMatchId}` : '/team-matches');
    case NotificationType.mercenary_applied:
    case NotificationType.mercenary_rejected:
    case NotificationType.mercenary_closed:
    case NotificationType.mercenary_cancelled:
      return mercenaryPostId ? `/mercenary/${mercenaryPostId}` : '/mercenary';
    case NotificationType.mercenary_accepted: {
      const postId = readString(data, 'postId');
      return chatRoomId ? `/chat/${chatRoomId}` : (postId ? `/mercenary/${postId}` : '/mercenary');
    }
    case NotificationType.lesson_ticket_purchased:
      return '/my/lessons';
    case NotificationType.chat_message:
      return chatRoomId ? `/chat/${chatRoomId}` : '/chat';
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
    case NotificationType.lesson_ticket_purchased:
      return '레슨 보기';
    case NotificationType.team_announced:
    case NotificationType.team_application_received:
      return '팀 보기';
    case NotificationType.team_application_accepted:
    case NotificationType.team_application_rejected:
      return '팀 보기';
    case NotificationType.team_match_applied:
    case NotificationType.team_match_approved:
    case NotificationType.team_match_rejected:
      return '팀 매치 보기';
    case NotificationType.mercenary_applied:
    case NotificationType.mercenary_accepted:
    case NotificationType.mercenary_rejected:
    case NotificationType.mercenary_closed:
    case NotificationType.mercenary_cancelled:
      return '용병 보기';
    case NotificationType.review_received:
      return '리뷰 보기';
    case NotificationType.chat_message:
      return '채팅 보기';
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
