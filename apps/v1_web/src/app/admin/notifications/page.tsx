'use client';

import {
  useV1Notifications,
  useV1ReadAllNotifications,
} from '@/hooks/use-v1-api';
import {
  AdminShell,
  AdminPageHeader,
  AdminBadge,
  AdminRow,
  AdminEmpty,
  AdminListSkeleton,
} from '@/components/admin';

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

export default function AdminNotificationsPage() {
  const { data, isPending, isError, error, refetch } = useV1Notifications({ limit: 30 });
  const readAll = useV1ReadAllNotifications();

  const items = data?.items ?? [];
  const unread = items.filter(n => n.status === 'created');
  const read = items.filter(n => n.status === 'read');

  const handleReadAll = async () => {
    try {
      await readAll.mutateAsync({});
    } catch {
      // notifications read-all errors are non-critical, silently ignore
    }
  };

  return (
    <AdminShell activeTab="notifications">
      <AdminPageHeader
        eyebrow="알림"
        title="알림"
        description="읽지 않은 알림을 확인하세요."
        action={
          unread.length > 0 ? (
            <button
              onClick={handleReadAll}
              disabled={readAll.isPending}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-[14px] font-medium rounded-xl px-4 h-10 transition-colors disabled:opacity-50"
            >
              모두 읽음
            </button>
          ) : undefined
        }
      />

      {/* Unread notifications */}
      {(isPending || unread.length > 0) && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm mb-4">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
            <span className="text-[16px] font-bold text-gray-900">읽지 않은 알림</span>
            {data?.unreadCount ? (
              <span className="bg-blue-50 text-blue-600 text-[11px] font-bold rounded-full px-2 py-0.5">
                {data.unreadCount}개
              </span>
            ) : null}
          </div>
          {isPending ? (
            <AdminListSkeleton rows={3} />
          ) : (
            unread.map(n => (
              <AdminRow
                key={n.notificationId}
                title={n.title}
                meta={n.body ?? undefined}
                badge={<AdminBadge status="created" label="새 알림" />}
                href={n.target.route ?? undefined}
              />
            ))
          )}
        </div>
      )}

      {/* Read notifications */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <span className="text-[16px] font-bold text-gray-900">읽은 알림</span>
          <span className="text-[13px] text-gray-400">{read.length}개</span>
        </div>
        {isPending ? (
          <AdminListSkeleton />
        ) : isError ? (
          <div className="px-5 py-8 text-center">
            <p className="text-[14px] text-gray-500 mb-3">
              {getErrorMessage(error, '알림을 불러오지 못했어요.')}
            </p>
            <button
              onClick={() => refetch()}
              className="text-[14px] text-blue-500 font-medium hover:underline"
            >
              다시 시도
            </button>
          </div>
        ) : read.length === 0 && unread.length === 0 ? (
          <AdminEmpty
            icon="🔔"
            title="알림이 없어요"
            description="새로운 활동이 있으면 여기에 표시돼요."
          />
        ) : read.length === 0 ? (
          <div className="px-5 py-8 text-center text-[14px] text-gray-400">
            이전 알림이 없어요.
          </div>
        ) : (
          read.map(n => (
            <AdminRow
              key={n.notificationId}
              title={n.title}
              meta={n.body ?? undefined}
              badge={<AdminBadge status="read" label="읽음" />}
              href={n.target.route ?? undefined}
            />
          ))
        )}
      </div>
    </AdminShell>
  );
}
