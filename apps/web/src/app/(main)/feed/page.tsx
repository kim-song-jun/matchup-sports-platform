'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bell, Trophy, Users, CreditCard, Award, AlertCircle } from 'lucide-react';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { useNotifications } from '@/hooks/use-api';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { notificationVisualType } from '@/lib/notification-center';
import type { Notification } from '@/types/api';

// Lucide icon type alias
type LucideIcon = typeof Trophy;

const typeConfig: Record<string, { icon: LucideIcon; bg: string; text: string; darkBg: string }> = {
  match:   { icon: Trophy,       bg: 'bg-amber-50',   text: 'text-amber-500',   darkBg: 'dark:bg-amber-900/30' },
  badge:   { icon: Award,        bg: 'bg-purple-50',  text: 'text-purple-500',  darkBg: 'dark:bg-purple-900/30' },
  team:    { icon: Users,        bg: 'bg-green-50',   text: 'text-green-500',   darkBg: 'dark:bg-green-900/30' },
  payment: { icon: CreditCard,   bg: 'bg-emerald-50', text: 'text-emerald-500', darkBg: 'dark:bg-emerald-900/30' },
  chat:    { icon: AlertCircle,  bg: 'bg-blue-50',    text: 'text-blue-500',    darkBg: 'dark:bg-blue-900/30' },
  system:  { icon: Bell,         bg: 'bg-gray-100',   text: 'text-gray-500',    darkBg: 'dark:bg-gray-800' },
};

function resolveVisualType(n: Notification): string {
  const base = notificationVisualType(n);
  // badge_earned maps to badge bucket
  if (n.type === 'badge_earned') return 'badge';
  return base;
}

function groupByPeriod(notifications: Notification[], now: Date): {
  today: Notification[];
  thisWeek: Notification[];
  lastMonth: Notification[];
  older: Notification[];
} {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const today: Notification[] = [];
  const thisWeek: Notification[] = [];
  const lastMonth: Notification[] = [];
  const older: Notification[] = [];

  for (const n of notifications) {
    const d = new Date(n.createdAt);
    if (d >= startOfToday) {
      today.push(n);
    } else if (d >= startOfWeek) {
      thisWeek.push(n);
    } else if (d >= startOfLastMonth) {
      lastMonth.push(n);
    } else {
      older.push(n);
    }
  }

  return { today, thisWeek, lastMonth, older };
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins <= 0) return '방금';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

function ActivityItem({ notification }: { notification: Notification }) {
  const visualType = resolveVisualType(notification);
  const config = typeConfig[visualType] ?? typeConfig.system;
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-3 py-3">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${config.bg} ${config.darkBg} ${config.text}`}
        aria-hidden="true"
      >
        <Icon size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
          {notification.title}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
          {notification.body}
        </p>
        <p className="text-2xs text-gray-500 dark:text-gray-400 mt-1">
          {formatTimeAgo(notification.createdAt)}
        </p>
      </div>
    </div>
  );
}

function Section({ label, items }: { label: string; items: Notification[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4">
      <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest px-1 mb-1">
        {label}
      </h2>
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 px-4">
        {items.map((n) => (
          <ActivityItem key={n.id} notification={n} />
        ))}
      </div>
    </div>
  );
}

export default function FeedPage() {
  const t = useTranslations('feed');
  const { isAuthenticated } = useRequireAuth();
  const [now] = useState(() => new Date());

  const { data: notifications = [], isLoading, isError, refetch } = useNotifications();

  const groups = groupByPeriod(notifications, now);
  const hasAny =
    groups.today.length + groups.thisWeek.length + groups.lastMonth.length + groups.older.length > 0;

  if (!isAuthenticated) return null;

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <header className="px-5 @3xl:px-0 pt-4 pb-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
      </header>

      <div className="px-5 @3xl:px-0">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-xl bg-gray-100 dark:bg-gray-700" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/3 rounded bg-gray-100 dark:bg-gray-700" />
                    <div className="h-4 w-2/3 rounded bg-gray-100 dark:bg-gray-700" />
                    <div className="h-3 w-full rounded bg-gray-100 dark:bg-gray-700" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : !hasAny ? (
          <EmptyState
            icon={Bell}
            title={t('emptyTitle')}
            description={t('emptyDesc')}
          />
        ) : (
          <>
            <Section label={t('today')} items={groups.today} />
            <Section label={t('thisWeek')} items={groups.thisWeek} />
            <Section label={t('lastMonth')} items={groups.lastMonth} />
            <Section label={t('older')} items={groups.older} />
          </>
        )}
      </div>
    </div>
  );
}
