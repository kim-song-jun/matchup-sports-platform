'use client';

import { useState } from 'react';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { useV1Notifications, useV1ReadAllNotifications } from '@/hooks/use-v1-api';
import {
  AdminShell,
  AdminPageHeader,
  AdminKpiCard,
  AdminBadge,
  AdminRow,
  AdminEmpty,
  AdminListSkeleton,
} from '@/components/admin';

type Tab = 'unread' | 'all';

export default function AdminNotificationsPage() {
  const { data, isPending, isError, error, refetch } = useV1Notifications({ limit: 40 });
  const readAll = useV1ReadAllNotifications();

  const items = data?.items ?? [];
  const unread = items.filter((n) => n.status === 'created');
  const unreadCount = data?.unreadCount ?? unread.length;

  const [tab, setTab] = useState<Tab>(() => (unreadCount > 0 ? 'unread' : 'all'));

  const displayItems = tab === 'unread' ? unread : items;

  const handleReadAll = async () => {
    try {
      await readAll.mutateAsync({});
    } catch {
      // non-critical, ignore
    }
  };

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="알림"
        title="알림 센터"
        description="새로운 소식을 확인하세요."
        action={
          unread.length > 0 ? (
            <button
              type="button"
              onClick={() => void handleReadAll()}
              disabled={readAll.isPending}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[14px] font-medium rounded-xl px-4 h-10 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              <CheckCheck size={15} aria-hidden="true" />
              모두 읽음
            </button>
          ) : undefined
        }
      />

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <AdminKpiCard
          label="읽지 않은 알림"
          value={unreadCount}
          tone={unreadCount > 0 ? 'warning' : 'neutral'}
          icon={<Bell size={16} />}
        />
        <AdminKpiCard label="전체 알림" value={items.length} />
      </div>

      {/* Tab toggle */}
      <div className="flex gap-2 mb-4">
        {([
          { key: 'unread' as Tab, label: '읽지 않은 알림', count: unread.length },
          { key: 'all' as Tab, label: '전체 알림', count: items.length },
        ] as const).map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`flex items-center gap-1.5 px-4 min-h-[44px] md:min-h-[36px] rounded-xl text-[14px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 ${
              tab === key
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
            {count > 0 && (
              <span
                className={`text-[11px] font-bold rounded-full px-1.5 ${
                  tab === key ? 'bg-blue-400 text-white' : 'bg-white text-gray-500'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <div className="flex items-center gap-2">
            {tab === 'unread' ? (
              <Bell size={16} className="text-blue-500" />
            ) : (
              <BellOff size={16} className="text-gray-400" />
            )}
            <span className="text-[15px] font-bold text-gray-900">
              {tab === 'unread' ? '읽지 않은 알림' : '전체 알림'}
            </span>
            {unreadCount > 0 && tab === 'unread' && (
              <span className="bg-blue-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                {unreadCount}
              </span>
            )}
          </div>
          <span className="text-[13px] text-gray-400">{displayItems.length}개</span>
        </div>

        {isError ? (
          <div className="px-5 py-8 text-center">
            <p className="text-[14px] text-gray-500 mb-2">
              {error instanceof Error ? error.message : '알림을 불러오지 못했어요.'}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-[14px] text-blue-500 font-medium focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
            >
              다시 시도
            </button>
          </div>
        ) : isPending ? (
          <AdminListSkeleton rows={5} />
        ) : displayItems.length === 0 ? (
          <AdminEmpty
            icon={tab === 'unread' ? <Bell size={36} /> : <BellOff size={36} />}
            title={tab === 'unread' ? '읽지 않은 알림이 없어요' : '알림이 없어요'}
            description={tab === 'unread' ? '새로운 활동이 있으면 여기에 표시돼요.' : undefined}
          />
        ) : (
          displayItems.map((n) => (
            <AdminRow
              key={n.notificationId}
              title={n.title}
              meta={n.body ?? undefined}
              leftIcon={
                n.status === 'created' ? (
                  <span className="w-2 h-2 bg-blue-500 rounded-full block mt-0.5" />
                ) : undefined
              }
              badge={
                n.status === 'created' ? (
                  <AdminBadge status="created" label="새 알림" />
                ) : undefined
              }
              href={n.target.route ?? undefined}
            />
          ))
        )}
      </div>
    </AdminShell>
  );
}
