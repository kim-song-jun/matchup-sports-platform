'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { useChatStore } from '@/stores/chat-store';
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

function formatMatchDate(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}/${d.getDate()} (${weekdays[d.getDay()]})`;
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
      className={`rounded-2xl border p-4 transition-all active:scale-[0.98] ${
        isActive
          ? 'bg-blue-50/60 border-blue-200 shadow-[0_2px_12px_rgba(59,130,246,0.08)]'
          : 'bg-white border-gray-100 hover:shadow-[0_2px_16px_rgba(0,0,0,0.04)]'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Team Avatar */}
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl text-[15px] font-bold shrink-0 ${
            isActive
              ? 'bg-blue-100 text-blue-600'
              : 'bg-blue-50 text-blue-500'
          }`}
        >
          {opponentName.charAt(0)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[15px] font-semibold text-gray-900 truncate">
              {opponentName}
            </h3>
            {room.lastMessageAt && (
              <span className="text-[11px] text-gray-400 shrink-0">
                {formatRelativeTime(room.lastMessageAt)}
              </span>
            )}
          </div>

          <p className="text-[12px] text-gray-400 mt-0.5">
            {room.matchTitle} · {formatMatchDate(room.matchDate)}
          </p>

          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[13px] text-gray-500 truncate flex-1 mr-2">
              {room.lastMessage ?? '대화를 시작하세요'}
            </p>
            {room.unreadCount > 0 && (
              <span className="shrink-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[11px] font-bold text-white">
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
  const { getChatRooms, currentTeamId } = useChatStore();
  const chatRooms = getChatRooms();

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const handleSelectRoom = useCallback((roomId: string) => {
    setSelectedRoomId(roomId);
  }, []);

  const emptyState = (
    <div className="rounded-2xl bg-gray-50 p-16 text-center">
      <MessageCircle size={32} className="mx-auto text-gray-300 mb-3" />
      <p className="text-[15px] font-medium text-gray-600">
        아직 채팅방이 없어요
      </p>
      <p className="text-[13px] text-gray-400 mt-1">
        팀 매칭이 성사되면 채팅방이 생성됩니다
      </p>
    </div>
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
      <div className="hidden lg:grid lg:grid-cols-[380px_1fr] lg:h-[calc(100dvh-5rem)] lg:-my-10 lg:-mx-8 rounded-2xl overflow-hidden border border-gray-200 bg-white">
        {/* Left panel - Chat room list */}
        <div className="border-r border-gray-200 flex flex-col bg-white">
          <div className="shrink-0 px-5 pt-5 pb-3 border-b border-gray-100">
            <h1 className="text-[22px] font-bold text-gray-900">채팅</h1>
            <p className="text-[13px] text-gray-400 mt-0.5">팀 매칭 대화</p>
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
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 mb-4">
                <MessageCircle size={28} className="text-gray-400" />
              </div>
              <p className="text-[17px] font-semibold text-gray-600">
                채팅방을 선택하세요
              </p>
              <p className="text-[13px] text-gray-400 mt-1.5 max-w-[240px]">
                왼쪽 목록에서 대화할 채팅방을 선택하면 여기에 표시됩니다
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ===== MOBILE: Full-width list ===== */}
      <div className="lg:hidden pt-[var(--safe-area-top)] animate-fade-in dark:bg-gray-900">
        <header className="px-5 pt-4 pb-3">
          <h1 className="text-[22px] font-bold text-gray-900 dark:text-white">채팅</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">팀 매칭 대화</p>
        </header>

        <div className="px-5">
          {chatRooms.length === 0 ? (
            emptyState
          ) : (
            <div className="space-y-2">{roomList(false)}</div>
          )}
        </div>

        <div className="h-6" />
      </div>
    </>
  );
}
