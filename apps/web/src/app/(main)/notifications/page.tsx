'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Bell, Trophy, Users, MessageCircle, Clock3, CheckCheck, Receipt } from 'lucide-react';
import { useNotifications } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

const toneMap = {
  match: {
    icon: Trophy,
    label: '매치',
    badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200',
    tone: 'border-amber-200/70',
  },
  team: {
    icon: Users,
    label: '팀',
    badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200',
    tone: 'border-emerald-200/70',
  },
  chat: {
    icon: MessageCircle,
    label: '메시지',
    badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200',
    tone: 'border-blue-200/70',
  },
  system: {
    icon: Bell,
    label: '시스템',
    badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    tone: 'border-slate-200/70',
  },
  payment: {
    icon: Receipt,
    label: '결제',
    badgeClass: 'bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-200',
    tone: 'border-violet-200/70',
  },
} as const;

const surfaceCard =
  'rounded-[28px] border border-slate-200/70 bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/20';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);

  if (mins < 60) return `${mins}분 전`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

function getNotificationTone(type: string) {
  if (
    type === 'match' ||
    [
      'match_created',
      'player_joined',
      'player_left',
      'match_reminder',
      'match_completed',
      'review_pending',
    ].includes(type)
  ) {
    return toneMap.match;
  }

  if (type === 'team' || type === 'team_announced') {
    return toneMap.team;
  }

  if (type === 'chat' || type === 'marketplace_message') {
    return toneMap.chat;
  }

  if (type === 'payment' || ['payment_confirmed', 'payment_refunded', 'marketplace_order'].includes(type)) {
    return toneMap.payment;
  }

  return toneMap.system;
}

export default function NotificationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations('notifications');
  const te = useTranslations('empty');
  const tc = useTranslations('common');
  const { isAuthenticated } = useAuthStore();
  const { toast } = useToast();
  const { notifications, getUnreadCount, markAsRead, markAllAsRead, setNotifications } = useNotificationStore();
  const { data, isLoading, error, refetch } = useNotifications();
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const unreadCount = getUnreadCount();

  useEffect(() => {
    if (!isAuthenticated || !data) return;

    const normalized = data.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    }));

    const storeJson = JSON.stringify(notifications);
    const nextJson = JSON.stringify(normalized);

    if (storeJson !== nextJson) {
      setNotifications(normalized);
    }
  }, [data, isAuthenticated, notifications, setNotifications]);

  const markAllRead = async () => {
    if (isMarkingAll || unreadCount === 0) return;

    setIsMarkingAll(true);
    try {
      await Promise.all(
        notifications
          .filter((notification) => !notification.isRead)
          .map((notification) => api.patch(`/notifications/${notification.id}/read`)),
      );

      markAllAsRead();
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast('success', t('markAllReadToast'));
    } catch {
      toast('error', '알림 상태를 동기화하지 못했어요. 잠시 후 다시 시도해주세요');
    } finally {
      setIsMarkingAll(false);
    }
  };

  const handleNotificationClick = async (id: string, link?: string, isRead?: boolean) => {
    if (!link) return;
    if (openingId) return;

    setOpeningId(id);

    if (!isRead) {
      try {
        await api.patch(`/notifications/${id}/read`);
        markAsRead(id);
        await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      } catch {
        toast('error', '읽음 상태를 동기화하지 못했어요. 다시 시도해주세요');
        setOpeningId(null);
        return;
      }
    }

    router.push(link);
  };

  const stats = [
    { label: '전체', value: notifications.length },
    { label: '안읽음', value: unreadCount },
    { label: '읽음', value: Math.max(notifications.length - unreadCount, 0) },
  ];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <section className="px-5 @3xl:px-0 pt-4">
        <div className={`${surfaceCard} overflow-hidden p-6 sm:p-7`}>
          <div className="flex flex-col gap-5 @3xl:flex-row @3xl:items-end @3xl:justify-between">
            <div className="max-w-2xl">
              <div className="eyebrow-chip">
                <Bell size={14} />
                MatchUp Notifications
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                알림도 경기 운영처럼 정리합니다.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                매치, 팀, 결제, 메시지 알림을 한곳에서 보고 필요한 액션만 빠르게 처리합니다.
              </p>
            </div>
            {isAuthenticated && unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={isMarkingAll}
                aria-label={t('markAllReadLabel')}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-950/20 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950"
              >
                <CheckCheck size={14} />
                {isMarkingAll ? '동기화 중...' : t('markAllRead')}
              </button>
            )}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{stat.label}</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {unreadCount > 0 && (
        <section className="px-5 @3xl:px-0 mt-4">
          <div className="solid-panel rounded-[24px] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Clock3 size={16} className="text-blue-500" />
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{t('unreadCount', { count: unreadCount })}</p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">
                Action queue
              </span>
            </div>
          </div>
        </section>
      )}

      <section className="px-5 @3xl:px-0 mt-4">
        {!isAuthenticated ? (
          <EmptyState
            icon={Bell}
            title={t('loginPromptTitle')}
            description={t('loginPromptDesc')}
            action={{ label: tc('login'), href: '/login' }}
          />
        ) : isLoading && notifications.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-[108px] rounded-[24px] bg-slate-100/80 dark:bg-slate-900/70 skeleton-shimmer" />
            ))}
          </div>
        ) : error ? (
          <ErrorState onRetry={() => refetch()} />
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={te('noNotifications')}
            description={te('noNotificationsDesc')}
          />
        ) : (
          <div className="space-y-3 stagger-children">
            {notifications.map((notification) => {
              const config = getNotificationTone(notification.type);
              const Icon = config.icon;

              return (
                <Link
                  key={notification.id}
                  href={notification.link || '/notifications'}
                  onClick={(event) => {
                    if (!notification.link) return;
                    event.preventDefault();
                    void handleNotificationClick(notification.id, notification.link, notification.isRead);
                  }}
                >
                  <div className={`${surfaceCard} p-4 transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(15,23,42,0.08)] ${!notification.isRead ? 'ring-1 ring-blue-500/10' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${config.tone} bg-white/80 dark:bg-slate-900/80`}>
                        <Icon size={18} className="text-slate-600 dark:text-slate-200" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${config.badgeClass}`}>
                              {config.label}
                            </span>
                            <span className="text-xs text-slate-400 dark:text-slate-500">{timeAgo(notification.createdAt)}</span>
                          </div>
                          {!notification.isRead && <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />}
                        </div>

                        <p className={`mt-2 text-base font-semibold ${notification.isRead ? 'text-slate-700 dark:text-slate-300' : 'text-slate-950 dark:text-white'}`}>
                          {notification.title}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                          {notification.body}
                        </p>
                        {openingId === notification.id && (
                          <p className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-300">읽음 상태를 동기화한 뒤 이동 중입니다.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
