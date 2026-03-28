'use client';

import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import Link from 'next/link';
import { Bell, Trophy, Users, MessageCircle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

const typeLabel: Record<string, string> = { match: '매치', team: '팀', chat: '채팅', system: '시스템' };

const typeConfig: Record<string, { icon: typeof Trophy; bg: string; text: string; darkBg: string }> = {
  match:  { icon: Trophy,        bg: 'bg-amber-50',  text: 'text-amber-500',  darkBg: 'dark:bg-amber-900/30' },
  team:   { icon: Users,         bg: 'bg-green-50',  text: 'text-green-500',  darkBg: 'dark:bg-green-900/30' },
  chat:   { icon: MessageCircle, bg: 'bg-blue-50',   text: 'text-blue-500',   darkBg: 'dark:bg-blue-900/30' },
  system: { icon: Bell,          bg: 'bg-gray-100',  text: 'text-gray-500',   darkBg: 'dark:bg-gray-800' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export default function NotificationsPage() {
  const { isAuthenticated } = useAuthStore();
  const { toast } = useToast();
  const { notifications, getUnreadCount, markAsRead, markAllAsRead } = useNotificationStore();
  const unreadCount = getUnreadCount();

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
    } catch { /* fallback to local */ }
    markAllAsRead();
    toast('success', '모든 알림을 읽음 처리했어요');
  };

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <header className="px-5 @3xl:px-0 pt-4 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">알림</h1>
          {unreadCount > 0 && (
            <p className="text-xs text-blue-500 mt-0.5">읽지 않은 알림 {unreadCount}개</p>
          )}
        </div>
        {isAuthenticated && unreadCount > 0 && (
          <button onClick={markAllRead} aria-label="모든 알림 읽음 처리" className="text-xs text-gray-500 font-medium min-h-[44px] min-w-[44px] px-3 py-2 flex items-center hover:text-gray-600 transition-colors">
            모두 읽음
          </button>
        )}
      </header>

      <div className="px-5 @3xl:px-0">
        {!isAuthenticated ? (
          <EmptyState
            icon={Bell}
            title="알림이 기다리고 있어요"
            description="로그인하면 매치 소식을 받아볼 수 있어요"
            action={{ label: '로그인', href: '/login' }}
          />
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="아직 알림이 없어요"
            description="매치나 팀 활동이 있으면 여기서 알려드릴게요"
          />
        ) : (
          <div className="space-y-2 stagger-children">
            {notifications.map((n) => (
              <Link key={n.id} href={n.link || '#'} onClick={() => markAsRead(n.id)}>
                <div className={`rounded-xl p-4 transition-colors active:scale-[0.98] ${n.isRead ? 'hover:bg-gray-50 dark:hover:bg-gray-800' : 'bg-blue-50/70 dark:bg-blue-900/20 hover:bg-blue-50/90'}`}>
                  <div className="flex items-start gap-3">
                    {(() => { const TypeIcon = typeConfig[n.type]?.icon || Bell; return (
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${typeConfig[n.type]?.bg || 'bg-gray-100'} ${typeConfig[n.type]?.darkBg || 'dark:bg-gray-800'} ${typeConfig[n.type]?.text || 'text-gray-500'}`}>
                        <TypeIcon size={18} />
                      </span>
                    ); })()}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(n.createdAt)}</span>
                        {!n.isRead && <span className="flex h-2.5 w-2.5 rounded-full bg-blue-500 animate-badge-pulse" />}
                      </div>
                      <p className={`text-base mt-0.5 ${n.isRead ? 'text-gray-600 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100 font-bold'}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{n.body}</p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
