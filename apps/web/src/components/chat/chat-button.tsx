'use client';

import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { useChatStore } from '@/stores/chat-store';

interface ChatButtonProps {
  /** team match ID to find the matching chat room */
  teamMatchId?: string;
  /** render as inline button instead of floating */
  inline?: boolean;
}

export function ChatButton({ teamMatchId, inline = false }: ChatButtonProps) {
  const { chatRooms } = useChatStore();

  // Find chat room for this team match, or link to chat list
  const matchingRoom = teamMatchId
    ? chatRooms.find((r) => r.teamMatchId === teamMatchId)
    : null;

  const href = matchingRoom ? `/chat/${matchingRoom.id}` : '/chat';
  const unreadCount = matchingRoom?.unreadCount ?? 0;

  if (inline) {
    return (
      <Link
        href={href}
        className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3 text-[14px] font-semibold text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
      >
        <div className="relative">
          <MessageCircle size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </div>
        채팅하기
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500 text-white shadow-[0_4px_20px_rgba(59,130,246,0.4)] hover:bg-blue-600 active:bg-blue-700 active:scale-95 transition-all lg:hidden"
    >
      <MessageCircle size={24} />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
          {unreadCount}
        </span>
      )}
    </Link>
  );
}
