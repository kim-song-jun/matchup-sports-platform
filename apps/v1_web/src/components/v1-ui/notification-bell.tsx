'use client';

import Link from 'next/link';
import { useV1NotificationUnreadSummary } from '@/hooks/use-v1-api';
import { BellIcon } from './icons';

type NotificationBellProps = {
  className: string;
  ariaLabel?: string;
  /** Numeric unread badge class. Defaults to the pill-shaped `.tm-unread-badge`. */
  badgeClassName?: string;
  /**
   * Legacy plain-dot indicator (no count text). Only pass this when a caller's
   * chrome (e.g. desktop top nav) intentionally wants the compact dot instead
   * of a numeric badge — omit it to get the default numeric badge.
   */
  dotClassName?: string;
  forceUnread?: boolean;
  iconSize?: number;
  onClick?: () => void;
};

const MAX_DISPLAY_COUNT = 99;

export function formatUnreadCount(count: number): string {
  return count > MAX_DISPLAY_COUNT ? `${MAX_DISPLAY_COUNT}+` : String(count);
}

function useUnreadNotificationCount(forceUnread?: boolean): number {
  const summary = useV1NotificationUnreadSummary();
  const unreadCount = summary.data?.unreadCount ?? 0;
  return forceUnread ? Math.max(unreadCount, 1) : unreadCount;
}

export function buildAriaLabel(ariaLabel: string, unreadCount: number): string {
  if (unreadCount <= 0) return ariaLabel;
  return `${ariaLabel} (읽지 않은 알림 ${formatUnreadCount(unreadCount)}개)`;
}

function UnreadIndicator({ unreadCount, badgeClassName, dotClassName }: { unreadCount: number; badgeClassName: string; dotClassName?: string }) {
  if (unreadCount <= 0) return null;
  if (dotClassName) {
    return <span className={dotClassName} aria-hidden="true" />;
  }
  return (
    <span className={badgeClassName} aria-hidden="true">
      {formatUnreadCount(unreadCount)}
    </span>
  );
}

export function NotificationBellLink({
  className,
  ariaLabel = '알림',
  badgeClassName = 'tm-unread-badge',
  dotClassName,
  forceUnread = false,
  iconSize = 21,
}: NotificationBellProps) {
  const unreadCount = useUnreadNotificationCount(forceUnread);
  return (
    <Link className={className} href="/notifications" aria-label={buildAriaLabel(ariaLabel, unreadCount)}>
      <BellIcon size={iconSize} strokeWidth={2} />
      <UnreadIndicator unreadCount={unreadCount} badgeClassName={badgeClassName} dotClassName={dotClassName} />
    </Link>
  );
}

export function NotificationBellButton({
  className,
  ariaLabel = '알림',
  badgeClassName = 'tm-unread-badge',
  dotClassName,
  forceUnread = false,
  iconSize = 20,
  onClick,
}: NotificationBellProps) {
  const unreadCount = useUnreadNotificationCount(forceUnread);
  return (
    <button className={className} type="button" aria-label={buildAriaLabel(ariaLabel, unreadCount)} onClick={onClick}>
      <BellIcon size={iconSize} strokeWidth={2} />
      <UnreadIndicator unreadCount={unreadCount} badgeClassName={badgeClassName} dotClassName={dotClassName} />
    </button>
  );
}
