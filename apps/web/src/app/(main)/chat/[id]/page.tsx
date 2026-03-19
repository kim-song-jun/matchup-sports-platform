'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Send, ChevronDown, ChevronUp,
  Calendar, MapPin, DollarSign, Info,
} from 'lucide-react';
import { useChatStore } from '@/stores/chat-store';
import type { ChatMessage } from '@/stores/chat-store';

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const period = h < 12 ? '오전' : '오후';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${period} ${displayH}:${m}`;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${weekdays[d.getDay()]}요일`;
}

function formatMatchDate(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}/${d.getDate()} (${weekdays[d.getDay()]})`;
}

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function groupMessagesByDate(messages: ChatMessage[]): { date: string; label: string; messages: ChatMessage[] }[] {
  const groups: Map<string, { label: string; messages: ChatMessage[] }> = new Map();

  for (const msg of messages) {
    const key = getDateKey(msg.timestamp);
    if (!groups.has(key)) {
      groups.set(key, { label: formatDateLabel(msg.timestamp), messages: [] });
    }
    groups.get(key)!.messages.push(msg);
  }

  return Array.from(groups.entries()).map(([date, group]) => ({
    date,
    label: group.label,
    messages: group.messages,
  }));
}

const QUICK_ACTIONS = [
  { label: '입금 완료', message: '입금 완료했습니다! 확인 부탁드립니다.' },
  { label: '유니폼 색상 조율', message: '유니폼 색상 조율하려고 합니다. 어떤 색으로 준비하시나요?' },
  { label: '위치 공유', message: '구장 위치 공유드립니다. 안전하게 오세요!' },
];

export default function ChatRoomPage() {
  const params = useParams();
  const router = useRouter();
  const chatRoomId = params.id as string;

  const {
    chatRooms, getChatMessages, sendMessage, markAsRead,
    currentUserId, currentTeamId,
  } = useChatStore();

  const room = chatRooms.find((r) => r.id === chatRoomId);
  const messages = getChatMessages(chatRoomId);
  const groupedMessages = groupMessagesByDate(messages);

  const [input, setInput] = useState('');
  const [showMatchInfo, setShowMatchInfo] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const opponentName = room
    ? room.homeTeamId === currentTeamId
      ? room.awayTeamName
      : room.homeTeamName
    : '';

  // Mark as read on mount
  useEffect(() => {
    if (chatRoomId) {
      markAsRead(chatRoomId);
    }
  }, [chatRoomId, markAsRead]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed) return;
    sendMessage(chatRoomId, trimmed);
    setInput('');
    inputRef.current?.focus();
  }

  function handleQuickAction(message: string) {
    sendMessage(chatRoomId, message);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!room) {
    return (
      <div className="pt-[var(--safe-area-top)] px-5 lg:px-0 py-20 text-center">
        <Info size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-[15px] text-gray-600">채팅방을 찾을 수 없어요</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh bg-gray-50">
      {/* Header */}
      <header className="shrink-0 bg-white border-b border-gray-100 pt-[var(--safe-area-top)]">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => router.back()}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[16px] font-bold text-gray-900 truncate">
              {opponentName}
            </h1>
            <p className="text-[11px] text-gray-400 truncate">
              {room.matchTitle}
            </p>
          </div>
          <button
            onClick={() => setShowMatchInfo(!showMatchInfo)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-50 transition-colors"
          >
            {showMatchInfo ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {/* Collapsible Match Info */}
        {showMatchInfo && (
          <div className="px-4 pb-3 animate-fade-in">
            <div className="rounded-xl bg-gray-50 p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <Calendar size={14} className="text-gray-400" />
                <span>{formatMatchDate(room.matchDate)}</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <MapPin size={14} className="text-gray-400" />
                <span>{room.matchTitle}</span>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <DollarSign size={14} className="text-gray-400" />
                <span className="text-gray-600">
                  {room.homeTeamName} vs {room.awayTeamName}
                </span>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {groupedMessages.map((group) => (
          <div key={group.date}>
            {/* Date separator */}
            <div className="flex items-center justify-center my-4">
              <span className="rounded-full bg-gray-200/60 px-3 py-1 text-[11px] text-gray-500">
                {group.label}
              </span>
            </div>

            {/* Messages */}
            {group.messages.map((msg) => {
              if (msg.isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center my-3">
                    <span className="rounded-full bg-gray-100 px-4 py-1.5 text-[12px] text-gray-500 text-center max-w-[80%]">
                      {msg.message}
                    </span>
                  </div>
                );
              }

              const isMine = msg.senderId === currentUserId;

              return (
                <div
                  key={msg.id}
                  className={`flex mb-2.5 ${isMine ? 'justify-end' : 'justify-start'}`}
                >
                  {!isMine && (
                    <div className="flex items-start gap-2 max-w-[80%]">
                      {/* Avatar */}
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-[12px] font-bold text-gray-600 shrink-0 mt-0.5">
                        {msg.senderName.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[12px] font-semibold text-gray-700">
                            {msg.senderName}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {msg.senderTeamName}
                          </span>
                        </div>
                        <div className="flex items-end gap-1.5">
                          <div className="rounded-2xl rounded-tl-md bg-white border border-gray-100 px-3.5 py-2.5 text-[14px] text-gray-800 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                            {msg.message}
                          </div>
                          <span className="text-[10px] text-gray-400 shrink-0 pb-0.5">
                            {formatTime(msg.timestamp)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {isMine && (
                    <div className="flex items-end gap-1.5 max-w-[80%]">
                      <span className="text-[10px] text-gray-400 shrink-0 pb-0.5">
                        {formatTime(msg.timestamp)}
                      </span>
                      <div className="rounded-2xl rounded-tr-md bg-blue-500 px-3.5 py-2.5 text-[14px] text-white">
                        {msg.message}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      <div className="shrink-0 px-4 pb-2">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => handleQuickAction(action.message)}
              className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input Bar */}
      <div className="shrink-0 bg-white border-t border-gray-100 px-4 py-3 pb-[calc(0.75rem+var(--safe-area-bottom))]">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요"
            className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
