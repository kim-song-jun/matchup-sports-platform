'use client';

import { useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import Link from 'next/link';
import { Bell, Check } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

interface Notification {
  id: string;
  type: 'match' | 'team' | 'chat' | 'system';
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  link?: string;
}

const mockNotifications: Notification[] = [
  { id: 'n1', type: 'match', title: '매치 참가 확정', body: '강남 풋살파크 주말 매치에 참가가 확정되었어요.', isRead: false, createdAt: '2026-03-25T14:00:00', link: '/matches/match-1' },
  { id: 'n2', type: 'team', title: '팀 가입 승인', body: 'FC 서울 유나이티드에서 가입을 승인했어요.', isRead: false, createdAt: '2026-03-25T11:30:00', link: '/teams/team-1' },
  { id: 'n3', type: 'chat', title: '새 메시지', body: '김선수님이 메시지를 보냈어요: "내일 경기 참가 가능한가요?"', isRead: false, createdAt: '2026-03-25T10:15:00', link: '/chat' },
  { id: 'n4', type: 'match', title: '매치 시작 1시간 전', body: '잠실 농구 픽업게임이 1시간 후에 시작돼요. 준비하세요!', isRead: true, createdAt: '2026-03-24T18:00:00', link: '/matches/match-2' },
  { id: 'n5', type: 'system', title: '매너 점수 상승', body: '최근 매치에서 좋은 평가를 받아 매너 점수가 올랐어요. 현재 4.5점', isRead: true, createdAt: '2026-03-24T12:00:00', link: '/profile' },
  { id: 'n6', type: 'match', title: '매치 인원 마감 임박', body: '배드민턴 초급 매치가 1자리 남았어요.', isRead: true, createdAt: '2026-03-23T16:00:00', link: '/matches/match-5' },
  { id: 'n7', type: 'team', title: '팀 매칭 성사', body: 'FC 서울 vs 강남 FC 팀 매칭이 확정되었어요.', isRead: true, createdAt: '2026-03-23T09:00:00', link: '/team-matches/tm-1' },
  { id: 'n8', type: 'system', title: '뱃지 획득', body: '"첫 매치 참가" 뱃지를 획득했어요!', isRead: true, createdAt: '2026-03-22T15:00:00', link: '/badges' },
];

const typeLabel: Record<string, string> = { match: '매치', team: '팀', chat: '채팅', system: '시스템' };

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
  const [notifications, setNotifications] = useState(mockNotifications);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
    } catch { /* fallback to local */ }
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    toast('success', '모든 알림을 읽음 처리했어요');
  };

  const markRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0">
      <header className="px-5 lg:px-0 pt-4 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 dark:text-white">알림</h1>
          {unreadCount > 0 && (
            <p className="text-[12px] text-blue-500 mt-0.5">읽지 않은 알림 {unreadCount}개</p>
          )}
        </div>
        {isAuthenticated && unreadCount > 0 && (
          <button onClick={markAllRead} className="text-[12px] text-gray-500 font-medium min-h-[44px] flex items-center hover:text-gray-600 transition-colors">
            모두 읽음
          </button>
        )}
      </header>

      <div className="px-5 lg:px-0">
        {!isAuthenticated ? (
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 py-14 text-center">
            <p className="text-[14px] text-gray-500">로그인 후 알림을 받아보세요</p>
            <Link href="/login" className="mt-3 inline-block rounded-xl bg-blue-500 px-6 py-2.5 text-[13px] font-bold text-white">
              로그인
            </Link>
          </div>
        ) : (
          <div className="space-y-2 stagger-children">
            {notifications.map((n) => (
              <Link key={n.id} href={n.link || '#'} onClick={() => markRead(n.id)}>
                <div className={`rounded-xl p-4 transition-colors active:scale-[0.98] ${n.isRead ? 'hover:bg-gray-50 dark:hover:bg-gray-800' : 'bg-blue-50/30 dark:bg-blue-900/10 hover:bg-blue-50/50'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-gray-500">{typeLabel[n.type]}</span>
                        <span className="text-[11px] text-gray-300">{timeAgo(n.createdAt)}</span>
                        {!n.isRead && <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500" />}
                      </div>
                      <p className={`text-[14px] mt-0.5 ${n.isRead ? 'text-gray-600 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100 font-medium'}`}>
                        {n.title}
                      </p>
                      <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-1">{n.body}</p>
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
