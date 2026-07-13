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
  /**
   * Dot class used only for the "count unknown" state (forceUnread=true but
   * the real unreadCount hasn't loaded yet). Defaults to `dotClassName ??
   * 'tm-unread-dot'`. Pass this when badgeClassName anchors the badge at a
   * different position than the shared `.tm-unread-dot` (e.g. desktop nav's
   * `.tm-desktop-nav-badge` sits at top:3px/right:3px, not the default
   * top:4px/right:2px) so the two indicators share the same visual anchor.
   */
  unknownDotClassName?: string;
  forceUnread?: boolean;
  iconSize?: number;
  onClick?: () => void;
};

const MAX_DISPLAY_COUNT = 99;

export function formatUnreadCount(count: number): string {
  return count > MAX_DISPLAY_COUNT ? `${MAX_DISPLAY_COUNT}+` : String(count);
}

/**
 * unreadCount는 서버가 안 실제 개수. forceUnread는 "무언가 안 읽음이 있다"는
 * 신호(예: 실시간 이벤트)만 줄 뿐 개수를 모를 수 있으므로, 실제 count가 0일 때
 * 임의로 1을 지어내지 않고 unknown 상태로 구분한다.
 */
function useUnreadState(forceUnread?: boolean): { count: number; unknown: boolean } {
  const summary = useV1NotificationUnreadSummary();
  const unreadCount = summary.data?.unreadCount ?? 0;
  if (unreadCount > 0) return { count: unreadCount, unknown: false };
  return { count: 0, unknown: Boolean(forceUnread) };
}

export function buildAriaLabel(ariaLabel: string, unreadCount: number, unknown?: boolean): string {
  if (unknown) return `${ariaLabel} (읽지 않은 알림 있음)`;
  if (unreadCount <= 0) return ariaLabel;
  return `${ariaLabel} (읽지 않은 알림 ${formatUnreadCount(unreadCount)}개)`;
}

function UnreadIndicator({
  unreadCount,
  unknown,
  badgeClassName,
  dotClassName,
  unknownDotClassName,
}: {
  unreadCount: number;
  unknown: boolean;
  badgeClassName: string;
  dotClassName?: string;
  unknownDotClassName?: string;
}) {
  if (unknown) {
    // 개수를 모를 때는 숫자를 지어내지 않고 범용 표시(도트)만 노출
    return <span className={unknownDotClassName ?? dotClassName ?? 'tm-unread-dot'} aria-hidden="true" />;
  }
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
  unknownDotClassName,
  forceUnread = false,
  iconSize = 21,
}: NotificationBellProps) {
  const { count, unknown } = useUnreadState(forceUnread);
  return (
    <Link className={className} href="/notifications" aria-label={buildAriaLabel(ariaLabel, count, unknown)}>
      <BellIcon size={iconSize} strokeWidth={2} />
      <UnreadIndicator
        unreadCount={count}
        unknown={unknown}
        badgeClassName={badgeClassName}
        dotClassName={dotClassName}
        unknownDotClassName={unknownDotClassName}
      />
    </Link>
  );
}

export function NotificationBellButton({
  className,
  ariaLabel = '알림',
  badgeClassName = 'tm-unread-badge',
  dotClassName,
  unknownDotClassName,
  forceUnread = false,
  iconSize = 20,
  onClick,
}: NotificationBellProps) {
  const { count, unknown } = useUnreadState(forceUnread);
  return (
    <button className={className} type="button" aria-label={buildAriaLabel(ariaLabel, count, unknown)} onClick={onClick}>
      <BellIcon size={iconSize} strokeWidth={2} />
      <UnreadIndicator
        unreadCount={count}
        unknown={unknown}
        badgeClassName={badgeClassName}
        dotClassName={dotClassName}
        unknownDotClassName={unknownDotClassName}
      />
    </button>
  );
}
