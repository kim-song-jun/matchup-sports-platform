'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Send, ChevronDown, ChevronUp,
  Calendar, MapPin, MessageCircle,
  MoreVertical, Flag, Ban, LogOut,
  Smile, Paperclip,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Modal } from '@/components/ui/modal';
import {
  ChatBubble, DateSeparator, SystemMessage,
  formatDateLabel, getDateKey,
} from '@/components/chat/chat-bubble';
import { ReportModal } from '@/components/chat/report-modal';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { useChatMessages, useSendMessage, useMarkChatRead, queryKeys } from '@/hooks/use-api';
import { useChatRoomSocket } from '@/hooks/use-realtime';
import { formatMatchDate } from '@/lib/utils';
import type { ChatMessage, ChatRoom } from '@/types/api';
import type { ChatMessagePayload } from '@/lib/realtime-client';

function groupMessagesByDate(messages: ChatMessage[]): { date: string; label: string; messages: ChatMessage[] }[] {
  const groups: Map<string, { label: string; messages: ChatMessage[] }> = new Map();

  for (const msg of messages) {
    const key = getDateKey(msg.createdAt);
    if (!groups.has(key)) {
      groups.set(key, { label: formatDateLabel(msg.createdAt), messages: [] });
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

interface ChatRoomEmbedProps {
  chatRoomId: string;
  room?: ChatRoom;
  /** If true, back button is hidden. Used in desktop embed mode. */
  embedded?: boolean;
  onBack?: () => void;
}

export default function ChatRoomEmbed({
  chatRoomId,
  room,
  embedded = true,
  onBack,
}: ChatRoomEmbedProps) {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: messagesData, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useChatMessages(chatRoomId);
  const messages = useMemo(() => (messagesData?.pages.flat() ?? []).slice().reverse(), [messagesData]);
  const sendMessageMutation = useSendMessage();
  const markReadMutation = useMarkChatRead();

  const [input, setInput] = useState('');
  const [showMatchInfo, setShowMatchInfo] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);
  const isFirstLoad = useRef(true);

  // Mark as read on mount
  useEffect(() => {
    if (chatRoomId) {
      markReadMutation.mutate(chatRoomId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatRoomId]);

  // Reset state on room change
  useEffect(() => {
    setInput('');
    setShowMatchInfo(false);
    setShowMenu(false);
    setShowLeaveModal(false);
    setOptimisticMessages([]);
    isFirstLoad.current = true;
  }, [chatRoomId]);

  // Realtime: receive new messages via WebSocket
  const handleWsMessage = useCallback((payload: ChatMessagePayload) => {
    const newMsg: ChatMessage = {
      id: payload.id,
      roomId: payload.roomId,
      senderId: payload.senderId,
      content: payload.content,
      createdAt: payload.createdAt,
      sender: payload.sender,
    };

    // Insert into the first page of the infinite query cache (newest messages)
    queryClient.setQueryData(
      queryKeys.chat.messages(chatRoomId),
      (prev: { pages: ChatMessage[][]; pageParams: unknown[] } | undefined) => {
        if (!prev) return { pages: [[newMsg]], pageParams: [undefined] };
        const [firstPage, ...rest] = prev.pages;
        // Avoid duplicates from optimistic inserts
        if (firstPage.some((m: ChatMessage) => m.id === newMsg.id)) return prev;
        return { ...prev, pages: [[...firstPage, newMsg], ...rest] };
      },
    );

    // Remove matching optimistic message
    setOptimisticMessages((prev) => prev.filter((m) => m.id !== newMsg.id));
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatRoomId, queryClient]);

  useChatRoomSocket(chatRoomId, handleWsMessage);

  // All messages: persisted + optimistic
  const allMessages = useMemo(() => [...messages, ...optimisticMessages], [messages, optimisticMessages]);
  const groupedMessages = useMemo(() => groupMessagesByDate(allMessages), [allMessages]);

  // Auto-scroll
  useEffect(() => {
    if (isFirstLoad.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      isFirstLoad.current = false;
    } else if (isNearBottom.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [allMessages.length, chatRoomId]);

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  // ESC handling is delegated to Modal component

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      roomId: chatRoomId,
      senderId: user?.id ?? '',
      content: trimmed,
      createdAt: new Date().toISOString(),
      sender: { id: user?.id ?? '', nickname: user?.nickname ?? '', profileImageUrl: user?.profileImageUrl ?? null },
    };

    setOptimisticMessages((prev) => [...prev, optimistic]);
    setInput('');

    sendMessageMutation.mutate(
      { roomId: chatRoomId, data: { content: trimmed } },
      {
        onError: () => {
          setOptimisticMessages((prev) => prev.filter((m) => m.id !== tempId));
          toast('error', '메시지 전송에 실패했어요');
        },
      },
    );
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleLeave() {
    setShowLeaveModal(false);
    toast('info', '채팅방을 나갔어요');
    router.push('/chat');
  }

  function handleLoadMore() {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }

  if (isError) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <ErrorState onRetry={refetch} message="채팅을 불러오지 못했어요" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="shrink-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
        {!embedded && (
          <div className="pt-[var(--safe-area-top)]" />
        )}
        <div className="flex items-center gap-3 px-4 py-3">
          {!embedded && onBack && (
            <button
              onClick={onBack}
              aria-label="뒤로 가기"
              className="rounded-lg p-1.5 min-w-11 min-h-[44px] text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="flex-1 min-w-0">
            <span className="text-lg font-bold text-gray-900 dark:text-white truncate block">
              {room?.name ?? '채팅방'}
            </span>
          </div>
          <button
            aria-label={showMatchInfo ? '정보 닫기' : '정보 보기'}
            onClick={() => setShowMatchInfo(!showMatchInfo)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-[0.98] transition-[colors,transform] min-w-11 min-h-[44px] flex items-center justify-center"
          >
            {showMatchInfo ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          <div className="relative" ref={menuRef}>
            <button
              aria-label="더보기 메뉴"
              onClick={() => setShowMenu(!showMenu)}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-[0.98] transition-[colors,transform] min-w-11 min-h-[44px] flex items-center justify-center"
            >
              <MoreVertical size={18} />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-lg py-1 z-50 animate-fade-in">
                <button
                  onClick={() => { setShowMenu(false); setShowReportModal(true); }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <Flag size={14} className="text-gray-500" />
                  신고하기
                </button>
                <button
                  onClick={() => { setShowMenu(false); toast('info', '차단 기능을 준비 중이에요'); }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <Ban size={14} className="text-gray-500" />
                  차단하기
                </button>
                <button
                  onClick={() => { setShowMenu(false); setShowLeaveModal(true); }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <LogOut size={14} className="text-red-400" />
                  나가기
                </button>
              </div>
            )}
          </div>
        </div>

        {showMatchInfo && room && (
          <div className="px-4 pb-3 animate-fade-in">
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <Calendar size={14} className="text-gray-500" aria-hidden="true" />
                <span>{room.lastMessageAt ? formatMatchDate(room.lastMessageAt) : '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <MapPin size={14} className="text-gray-500" aria-hidden="true" />
                <span>{room.name}</span>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 bg-gray-50 dark:bg-gray-900/50 min-h-0"
      >
        <div className="min-h-full flex flex-col justify-end">
          {/* Load more older messages */}
          {hasNextPage && (
            <div className="flex justify-center py-2">
              <button
                onClick={handleLoadMore}
                disabled={isFetchingNextPage}
                className="rounded-full border border-gray-200 dark:border-gray-600 px-4 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors min-h-[44px] disabled:opacity-50"
              >
                {isFetchingNextPage ? '불러오는 중...' : '더 보기'}
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className={`h-10 rounded-xl animate-pulse bg-gray-200 dark:bg-gray-700 ${i % 2 === 0 ? 'w-2/3 ml-auto' : 'w-2/3'}`} />
              ))}
            </div>
          ) : allMessages.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
              title="아직 메시지가 없어요"
              description="첫 메시지를 보내보세요"
              size="sm"
            />
          ) : (
            groupedMessages.map((group) => (
              <div key={group.date}>
                <DateSeparator label={group.label} />
                {group.messages.map((msg, idx, arr) => {
                  const isMine = msg.senderId === user?.id;
                  const prev = idx > 0 ? arr[idx - 1] : null;
                  const next = idx < arr.length - 1 ? arr[idx + 1] : null;
                  const isFirstInGroup = !prev || prev.senderId !== msg.senderId;
                  const isLastInGroup = !next || next.senderId !== msg.senderId;

                  if (msg.content.startsWith('[system]')) {
                    return <SystemMessage key={msg.id} text={msg.content.replace('[system]', '')} />;
                  }

                  return (
                    <ChatBubble
                      key={msg.id}
                      message={msg.content}
                      timestamp={msg.createdAt}
                      isMine={isMine}
                      senderName={msg.sender?.nickname ?? ''}
                      isFirstInGroup={isFirstInGroup}
                      isLastInGroup={isLastInGroup}
                    />
                  );
                })}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Emoji picker */}
      {showEmoji && (
        <div className="shrink-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 px-4 py-2">
          <div className="flex flex-wrap gap-2">
            {['👍', '👏', '🔥', '⚽', '🏀', '🏒', '💪', '🎉', '😊', '😂', '🙏', '❤️'].map((emoji) => (
              <button
                key={emoji}
                onClick={() => { setInput((prev) => prev + emoji); setShowEmoji(false); }}
                className="text-2xl p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-90 transition-[colors,transform] min-w-11 min-h-[44px] flex items-center justify-center"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="shrink-0 px-4 py-2 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="shrink-0 text-2xs font-semibold text-gray-400 dark:text-gray-500">빠른 메시지</span>
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => { setInput(action.message); inputRef.current?.focus(); }}
              className="shrink-0 rounded-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 min-h-[44px] text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 transition-colors"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input Bar */}
      <div className={`shrink-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 px-4 py-3 ${!embedded ? 'pb-[calc(0.75rem+var(--safe-area-bottom))] lg:pb-3' : ''}`}>
        <div className="flex items-center gap-1.5">
          <button
            aria-label="파일 첨부"
            onClick={() => { fileInputRef.current?.click(); toast('info', '파일 첨부 기능을 준비 중이에요'); }}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0"
          >
            <Paperclip size={18} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={() => toast('info', '이미지 전송 기능을 준비 중이에요')} />
          <button
            aria-label="이모지"
            onClick={() => setShowEmoji(!showEmoji)}
            className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors shrink-0 ${showEmoji ? 'text-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          >
            <Smile size={18} />
          </button>
          <label htmlFor="chat-message-input" className="sr-only">메시지 입력</label>
          <input
            ref={inputRef}
            id="chat-message-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요"
            maxLength={2000}
            className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 px-3.5 py-2.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-colors"
          />
          <button
            aria-label="메시지 보내기"
            onClick={handleSend}
            disabled={!input.trim() || sendMessageMutation.isPending}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* Report Modal */}
      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetType="chatRoom"
        targetId={chatRoomId}
        targetName={room?.name}
      />

      {/* Leave Confirmation Modal */}
      <Modal isOpen={showLeaveModal} onClose={() => setShowLeaveModal(false)} title="채팅방 나가기">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 mx-auto mb-4">
          <LogOut size={24} className="text-gray-500" />
        </div>
        <p className="text-base text-gray-600 dark:text-gray-300 text-center mb-6">
          채팅방을 나가시겠어요?
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowLeaveModal(false)}
            className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 py-2.5 text-base font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleLeave}
            className="flex-1 rounded-xl bg-blue-500 py-2.5 text-base font-semibold text-white hover:bg-blue-600 transition-colors"
          >
            나가기
          </button>
        </div>
      </Modal>
    </div>
  );
}
