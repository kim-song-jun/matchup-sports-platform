'use client';

import Link from 'next/link';
import { useV1NotificationUnreadSummary } from '@/hooks/use-v1-api';
import { BellIcon } from './icons';

type NotificationBellProps = {
  className: string;
  ariaLabel?: string;
  dotClassName?: string;
  forceUnread?: boolean;
  iconSize?: number;
  onClick?: () => void;
};

function useHasUnreadNotification(forceUnread?: boolean) {
  const summary = useV1NotificationUnreadSummary();
  return Boolean(forceUnread || (summary.data?.unreadCount ?? 0) > 0);
}

export function NotificationBellLink({
  className,
  ariaLabel = '알림',
  dotClassName = 'tm-unread-dot',
  forceUnread = false,
  iconSize = 21,
}: NotificationBellProps) {
  const hasUnread = useHasUnreadNotification(forceUnread);
  return (
    <Link className={className} href="/notifications" aria-label={hasUnread ? `${ariaLabel} (새 알림 있음)` : ariaLabel}>
      <BellIcon size={iconSize} strokeWidth={2} />
      {hasUnread ? <span className={dotClassName} aria-hidden="true" /> : null}
    </Link>
  );
}

export function NotificationBellButton({
  className,
  ariaLabel = '알림',
  dotClassName = 'tm-unread-dot',
  forceUnread = false,
  iconSize = 20,
  onClick,
}: NotificationBellProps) {
  const hasUnread = useHasUnreadNotification(forceUnread);
  return (
    <button className={className} type="button" aria-label={hasUnread ? `${ariaLabel} (새 알림 있음)` : ariaLabel} onClick={onClick}>
      <BellIcon size={iconSize} strokeWidth={2} />
      {hasUnread ? <span className={dotClassName} aria-hidden="true" /> : null}
    </button>
  );
}
