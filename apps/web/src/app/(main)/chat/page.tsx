'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useChatStore } from '@/stores/chat-store';
import { useAuthStore } from '@/stores/auth-store';
import { formatMatchDate } from '@/lib/utils';
import type { ChatRoom } from '@/stores/chat-store';
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

/** Chat room item rendered in the sidebar list */
function ChatRoomItem({
  room,
  opponentName,
  isActive,
  onClick,
}: {
  room: ChatRoom;
  opponentName: string;
  isActive?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <div
      className={`rounded-xl border p-4 transition-[colors,transform] active:scale-[0.98] ${
        isActive
          ? 'bg-gray-50 border-gray-100 dark:border-gray-700'
          : 'bg-white border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Team Avatar */}
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl text-md font-bold shrink-0 bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300`}
        >
          {opponentName.charAt(0)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100 truncate">
              {opponentName}
            </h3>
            {room.lastMessageAt && (
              <span className="text-xs text-gray-500 shrink-0">
                {formatRelativeTime(room.lastMessageAt)}
              </span>
            )}
          </div>

          <p className="text-xs text-gray-500 mt-0.5">
            {room.matchTitle} · {formatMatchDate(room.matchDate)}
          </p>

          <div className="flex items-center justify-between mt-1.5">
            <p className="text-sm text-gray-500 truncate flex-1 mr-2">
              {room.lastMessage ?? '대화를 시작하세요'}
            </p>
            {room.unreadCount > 0 && (
              <span className="shrink-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-bold text-white">
                {room.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return inner;
}

export default function ChatListPage() {
  const { isAuthenticated } = useAuthStore();
  const { getChatRooms, currentTeamId } = useChatStore();
  const chatRooms = getChatRooms();

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const handleSelectRoom = useCallback((roomId: string) => {
    setSelectedRoomId(roomId);
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="pt-[var(--safe-area-top)] lg:pt-0">
        <header className="px-5 lg:px-0 pt-4 pb-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">채팅</h1>
        </header>
        <div className="px-5 lg:px-0">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 py-14 text-center">
            <p className="text-base text-gray-500">로그인 후 채팅을 이용할 수 있어요</p>
            <p className="text-xs text-gray-500 mt-1">팀 매칭이 성사되면 채팅방이 생성돼요</p>
            <Link href="/login" className="inline-block mt-3 rounded-xl bg-blue-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-600 transition-colors">
              로그인
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const emptyState = (
    <EmptyState
      icon={MessageCircle}
      title="아직 채팅방이 없어요"
      description="팀 매칭이 성사되면 채팅방이 생성돼요"
      size="sm"
    />
  );

  const roomList = (isDesktop: boolean) =>
    chatRooms.map((room) => {
      const opponentName =
        room.homeTeamId === currentTeamId
          ? room.awayTeamName
          : room.homeTeamName;

      if (isDesktop) {
        return (
          <button
            key={room.id}
            onClick={() => handleSelectRoom(room.id)}
            className="w-full text-left"
          >
            <ChatRoomItem
              room={room}
              opponentName={opponentName}
              isActive={selectedRoomId === room.id}
            />
          </button>
        );
      }

      return (
        <Link key={room.id} href={`/chat/${room.id}`}>
          <ChatRoomItem room={room} opponentName={opponentName} />
        </Link>
      );
    });

  return (
    <>
      {/* ===== DESKTOP: 2-column layout ===== */}
      <div className="hidden lg:grid lg:grid-cols-[380px_1fr] lg:h-[calc(100dvh-5rem)] lg:-my-10 lg:-mx-8 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 bg-white">
        {/* Left panel - Chat room list */}
        <div className="border-r border-gray-100 dark:border-gray-700 flex flex-col bg-white">
          <div className="shrink-0 px-5 pt-5 pb-3 border-b border-gray-100">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">채팅</h1>
            <p className="text-sm text-gray-500 mt-0.5">팀 매칭 대화</p>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            {chatRooms.length === 0 ? (
              emptyState
            ) : (
              <div className="space-y-2">{roomList(true)}</div>
            )}
          </div>
        </div>

        {/* Right panel - Selected chat or placeholder */}
        <div className="flex flex-col bg-gray-50 min-w-0">
          {selectedRoomId ? (
            <ChatRoomEmbed chatRoomId={selectedRoomId} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gray-100 mb-4">
                <MessageCircle size={28} className="text-gray-500" />
              </div>
              <p className="text-lg font-semibold text-gray-600">
                채팅방을 선택하세요
              </p>
              <p className="text-sm text-gray-500 mt-1.5 max-w-[240px]">
                왼쪽 목록에서 대화할 채팅방을 선택하면 여기에 표시됩니다
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ===== MOBILE: Full-width list ===== */}
      <div className="lg:hidden pt-[var(--safe-area-top)] animate-fade-in dark:bg-gray-900">
        <header className="px-5 pt-4 pb-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">채팅</h1>
          <p className="text-sm text-gray-500 mt-0.5">팀 매칭 대화</p>
        </header>

        <div className="px-5">
          {chatRooms.length === 0 ? (
            emptyState
          ) : (
            <div className="space-y-2">{roomList(false)}</div>
          )}
        </div>

      </div>
    </>
  );
}
