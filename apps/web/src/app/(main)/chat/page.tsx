'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Lock, MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useAuthStore } from '@/stores/auth-store';
import { useChatRooms } from '@/hooks/use-api';
import type { ChatRoom } from '@/types/api';
import ChatRoomEmbed from './[id]/chat-room-embed';

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function ChatRoomItem({
  room,
  isActive,
}: {
  room: ChatRoom;
  isActive?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 transition-[colors,transform] active:scale-[0.98] ${
        isActive
          ? 'bg-gray-50 border-gray-100 dark:border-gray-700'
          : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold shrink-0 bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300">
          {(room.name ?? '?').charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate" title={room.name ?? undefined}>
              {room.name}
            </h3>
            {room.lastMessageAt && (
              <span className="text-xs text-gray-500 shrink-0">
                {formatRelativeTime(room.lastMessageAt)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-sm text-gray-500 truncate flex-1 mr-2" title={room.lastMessage ?? undefined}>
              {room.lastMessage ?? '대화를 시작해보세요'}
            </p>
            {(room.unreadCount ?? 0) > 0 && (
              <span className="shrink-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-bold text-white">
                {room.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatListPage() {
  const t = useTranslations('chat');
  const te = useTranslations('empty');
  const tc = useTranslations('common');
  const { isAuthenticated } = useAuthStore();
  const { data: chatRooms = [], isLoading, isError, refetch } = useChatRooms();

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  // Defer auth check to after hydration so SSR and initial client render match
  const [clientAuth, setClientAuth] = useState(false);
  useEffect(() => {
    setClientAuth(isAuthenticated);
  }, [isAuthenticated]);

  const selectedRoom = chatRooms.find((r) => r.id === selectedRoomId);

  if (!clientAuth) {
    return (
      <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in dark:bg-gray-900">
        <MobileGlassHeader title={t('title')} subtitle={t('subtitle')} showBack />
        <EmptyState
          icon={Lock}
          title="로그인이 필요해요"
          description="채팅을 시작하려면 로그인해주세요"
          action={{ label: '로그인하기', href: '/login?redirect=/chat' }}
        />
      </div>
    );
  }

  const emptyState = (
    <EmptyState
      icon={MessageCircle}
      title={t('noChatRooms')}
      description={t('noChatRoomsDesc')}
      size="sm"
    />
  );

  const loadingState = (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-700" />
      ))}
    </div>
  );

  const roomList = (isDesktop: boolean) =>
    chatRooms.map((room) => {
      if (isDesktop) {
        return (
          <button
            key={room.id}
            onClick={() => setSelectedRoomId(room.id)}
            className="w-full text-left"
          >
            <ChatRoomItem room={room} isActive={selectedRoomId === room.id} />
          </button>
        );
      }

      return (
        <Link key={room.id} href={`/chat/${room.id}`} className="block">
          <ChatRoomItem room={room} />
        </Link>
      );
    });

  return (
    <>
      {/* DESKTOP: 2-column layout */}
      <div className="hidden @3xl:grid @3xl:grid-cols-[380px_1fr] @3xl:h-[calc(100dvh-5rem)] @3xl:-my-10 @3xl:-mx-8 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="border-r border-gray-100 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-800">
          <div className="shrink-0 px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('subtitle')}</p>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {isLoading ? loadingState : isError ? (
              <ErrorState onRetry={refetch} message="채팅방을 불러오지 못했어요" />
            ) : chatRooms.length === 0 ? (
              emptyState
            ) : (
              <div className="space-y-2">{roomList(true)}</div>
            )}
          </div>
        </div>

        <div className="flex flex-col bg-gray-50 dark:bg-gray-900 min-w-0">
          {selectedRoomId ? (
            <ChatRoomEmbed chatRoomId={selectedRoomId} room={selectedRoom} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700 mb-4">
                <MessageCircle size={28} className="text-gray-500" aria-hidden="true" />
              </div>
              <p className="text-lg font-semibold text-gray-600 dark:text-gray-300">
                {t('selectRoom')}
              </p>
              <p className="text-sm text-gray-500 mt-1.5 max-w-[240px]">
                {t('selectRoomDesc')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* MOBILE: Full-width list */}
      <div className="@3xl:hidden pt-[var(--safe-area-top)] animate-fade-in dark:bg-gray-900 flex flex-col min-h-[calc(100dvh-56px-80px)]">
        <MobileGlassHeader title={t('title')} subtitle={t('subtitle')} showBack />
        <div className="flex-1 flex flex-col px-5 mt-4">
          {isLoading ? loadingState : isError ? (
            <ErrorState onRetry={refetch} message="채팅방을 불러오지 못했어요" />
          ) : chatRooms.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              {emptyState}
            </div>
          ) : (
            <div className="space-y-3">{roomList(false)}</div>
          )}
          <div className="h-24" />
        </div>
      </div>
    </>
  );
}
