'use client';

import Link from 'next/link';
import { useEffect, useState, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { useAuthStore } from '@/stores/auth-store';
import { Bell, Trophy, Users, MessageCircle, CreditCard, ChevronRight } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { shouldHandleInAppNotificationNavigation } from '@/lib/notification-activation';
import { resolveNotificationLink, notificationVisualType } from '@/lib/notification-center';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications, useUnreadCount } from '@/hooks/use-api';
import type { Notification } from '@/types/api';

const typeConfig: Record<string, { icon: typeof Trophy; bg: string; text: string; darkBg: string }> = {
  match:  { icon: Trophy,        bg: 'bg-amber-50',  text: 'text-amber-500',  darkBg: 'dark:bg-amber-900/30' },
  team:   { icon: Users,         bg: 'bg-green-50',  text: 'text-green-500',  darkBg: 'dark:bg-green-900/30' },
  chat:   { icon: MessageCircle, bg: 'bg-blue-50',   text: 'text-blue-500',   darkBg: 'dark:bg-blue-900/30' },
  payment:{ icon: CreditCard,    bg: 'bg-emerald-50',text: 'text-emerald-500',darkBg: 'dark:bg-emerald-900/30' },
  system: { icon: Bell,          bg: 'bg-gray-100',  text: 'text-gray-500',   darkBg: 'dark:bg-gray-800' },
};

export default function NotificationsPage() {
  const t = useTranslations('notifications');
  const te = useTranslations('empty');
  const tc = useTranslations('common');
  const { isAuthenticated } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const { toast } = useToast();
  const tt = useTranslations('time');

  useEffect(() => { setMounted(true); }, []);
  const {
    data: notifications = [],
    isLoading,
    refetch: refetchNotifications,
  } = useNotifications();
  const {
    data: unreadData,
    refetch: refetchUnreadCount,
  } = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const unreadCount = unreadData?.count ?? notifications.filter((notification) => !notification.isRead).length;

  useEffect(() => {
    if (!mounted || !isAuthenticated) {
      return;
    }

    const backfillNotifications = () => {
      void refetchNotifications();
      void refetchUnreadCount();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        backfillNotifications();
      }
    };

    window.addEventListener('focus', backfillNotifications);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', backfillNotifications);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, mounted, refetchNotifications, refetchUnreadCount]);

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins <= 0) return tt('justNow');
    if (mins < 60) return tt('minutesAgo', { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return tt('hoursAgo', { count: hours });
    const days = Math.floor(hours / 24);
    return tt('daysAgo', { count: days });
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllRead.mutateAsync();
      toast('success', t('markAllReadToast'));
    } catch {
      toast('error', t('markAllReadErrorToast'));
    }
  };

  const handleMarkRead = async (notification: Notification) => {
    if (notification.isRead) {
      return;
    }

    try {
      await markRead.mutateAsync(notification.id);
    } catch {
      toast('error', t('markReadErrorToast'));
    }
  };

  const handleOpenNotification = (notification: Notification, target: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!shouldHandleInAppNotificationNavigation(event)) {
      return;
    }

    event.preventDefault();
    window.location.assign(target);

    window.setTimeout(() => {
      void handleMarkRead(notification);
    }, 0);
  };

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <MobileGlassHeader
        title={t('title')}
        subtitle={unreadCount > 0 ? t('unreadCount', { count: unreadCount }) : '중요한 업데이트와 알림을 모아봤어요.'}
        showBack
        actions={mounted && isAuthenticated && unreadCount > 0 ? (
          <button onClick={handleMarkAllRead} aria-label={t('markAllReadLabel')} className="glass-mobile-icon-button flex min-h-[44px] items-center justify-center rounded-xl px-3.5 text-xs font-semibold text-gray-600 dark:text-gray-300" disabled={markAllRead.isPending}>
            {t('markAllRead')}
          </button>
        ) : undefined}
      />

      <div className="px-5 @3xl:px-0 mt-4">
        {!mounted || !isAuthenticated ? (
          <EmptyState
            icon={Bell}
            title={t('loginPromptTitle')}
            description={t('loginPromptDesc')}
            action={{ label: tc('login'), href: '/login' }}
          />
        ) : isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4 animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-xl bg-gray-100 dark:bg-gray-800" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 rounded bg-gray-100 dark:bg-gray-800" />
                    <div className="h-4 w-2/3 rounded bg-gray-100 dark:bg-gray-800" />
                    <div className="h-3 w-full rounded bg-gray-100 dark:bg-gray-800" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={te('noNotifications')}
            description={te('noNotificationsDesc')}
          />
        ) : (
          <div className="space-y-3 stagger-children">
            {notifications.map((n) => {
              const visualType = notificationVisualType(n);
              const TypeIcon = typeConfig[visualType]?.icon || Bell;
              const target = resolveNotificationLink(n);

              return (
                <NotificationCard
                  key={n.id}
                  notification={n}
                  target={target}
                  visualType={visualType}
                  TypeIcon={TypeIcon}
                  formatTimeAgo={formatTimeAgo}
                  defaultCta={t('defaultCta')}
                  onNavigate={target ? handleOpenNotification(n, target) : undefined}
                  onOpen={() => {
                    if (!target) {
                      void handleMarkRead(n);
                    }
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="h-24" />
    </div>
  );
}

function NotificationCard({
  notification,
  target,
  visualType,
  TypeIcon,
  formatTimeAgo,
  defaultCta,
  onNavigate,
  onOpen,
}: {
  notification: Notification;
  target: string | null;
  visualType: string;
  TypeIcon: typeof Trophy;
  formatTimeAgo: (dateStr: string) => string;
  defaultCta: string;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onOpen: () => void;
}) {
  const cardInner = (
    <div className={`w-full rounded-2xl p-4 text-left transition-colors active:scale-[0.98] ${notification.isRead ? 'border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800' : 'border border-blue-100 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-900/20 hover:bg-blue-50/90'}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${typeConfig[visualType]?.bg || 'bg-gray-100'} ${typeConfig[visualType]?.darkBg || 'dark:bg-gray-800'} ${typeConfig[visualType]?.text || 'text-gray-500'}`}>
          <TypeIcon size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 dark:text-gray-500">{formatTimeAgo(notification.createdAt)}</span>
            {!notification.isRead && <span data-testid="notification-unread-dot" className="flex h-2.5 w-2.5 rounded-full bg-blue-500" />}
          </div>
          <p className={`text-sm mt-0.5 ${notification.isRead ? 'text-gray-600 dark:text-gray-500' : 'font-semibold text-gray-900 dark:text-gray-100'}`}>
            {notification.title}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{notification.body}</p>
          {target && (
            <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-500">
              <span>{notification.ctaLabel || defaultCta}</span>
              <ChevronRight size={14} />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (target) {
    return (
      <Link
        href={target}
        onClick={onNavigate}
        data-testid={`notification-card-${notification.id}`}
        className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        {cardInner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`notification-card-${notification.id}`}
      className="w-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    >
      {cardInner}
    </button>
  );
}
