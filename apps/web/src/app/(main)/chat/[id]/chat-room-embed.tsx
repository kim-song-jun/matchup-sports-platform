'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Send, ChevronDown, ChevronUp,
  Calendar, MapPin, DollarSign, Info, MessageCircle,
  MoreVertical, Flag, Ban, LogOut,
  Image as ImageIcon, Smile, Paperclip,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useChatStore } from '@/stores/chat-store';
import { useToast } from '@/components/ui/toast';
import { formatMatchDate } from '@/lib/utils';
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
  const now = new Date();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '어제';
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})`;
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

interface ChatRoomEmbedProps {
  chatRoomId: string;
  /** If true, header is shown inline (no back button). Used in desktop embed mode. */
  embedded?: boolean;
  /** Callback for back navigation. Only used when not embedded. */
  onBack?: () => void;
}

export default function ChatRoomEmbed({
  chatRoomId,
  embedded = true,
  onBack,
}: ChatRoomEmbedProps) {
  const {
    chatRooms, getChatMessages, sendMessage, markAsRead,
    currentUserId, currentTeamId,
  } = useChatStore();
  const { toast } = useToast();
  const router = useRouter();

  const room = chatRooms.find((r) => r.id === chatRoomId);
  const messages = getChatMessages(chatRoomId);
  const groupedMessages = groupMessagesByDate(messages);

  const [input, setInput] = useState('');
  const [showMatchInfo, setShowMatchInfo] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetail, setReportDetail] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);
  const isFirstLoad = useRef(true);

  const opponentName = room
    ? room.homeTeamId === currentTeamId
      ? room.awayTeamName
      : room.homeTeamName
    : '';

  const opponentTeamId = room
    ? room.homeTeamId === currentTeamId
      ? room.awayTeamId
      : room.homeTeamId
    : '';

  // Mark as read on mount / room change
  useEffect(() => {
    if (chatRoomId) {
      markAsRead(chatRoomId);
    }
  }, [chatRoomId, markAsRead]);

  // Mock 타이핑 인디케이터
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.senderId !== currentUserId) return;
    const delay = 2000 + Math.random() * 2000;
    const t1 = setTimeout(() => setIsTyping(true), delay);
    const t2 = setTimeout(() => setIsTyping(false), delay + 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [messages.length, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll: 첫 로드는 instant, 이후는 하단 근처일 때만
  useEffect(() => {
    if (isFirstLoad.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      isFirstLoad.current = false;
    } else if (isNearBottom.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, chatRoomId]);

  // 스크롤 위치 감지
  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  // Reset input on room switch
  useEffect(() => {
    setInput('');
    setShowMatchInfo(false);
    setShowMenu(false);
    setShowReportModal(false);
    setShowBlockModal(false);
    setShowLeaveModal(false);
  }, [chatRoomId]);

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

  function handleReport() {
    if (!reportReason) return;
    setShowReportModal(false);
    setReportReason('');
    setReportDetail('');
    toast('success', '신고가 접수되었어요. 운영팀이 검토할게요');
  }

  function handleBlock() {
    setShowBlockModal(false);
    toast('success', '차단되었어요');
  }

  function handleLeave() {
    setShowLeaveModal(false);
    toast('info', '채팅방을 나갔어요');
    router.push('/chat');
  }

  if (!room) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          icon={MessageCircle}
          title="채팅방을 찾을 수 없어요"
          description="삭제되었거나 존재하지 않는 채팅방이에요"
          size="sm"
        />
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
              className="rounded-lg p-1.5 min-w-[44px] min-h-[44px] text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors lg:hidden"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="flex-1 min-w-0">
            <Link
              href={`/teams/${opponentTeamId}`}
              className="text-lg font-bold text-gray-900 dark:text-white truncate block hover:text-blue-500 transition-colors"
            >
              {opponentName}
            </Link>
            <p className="text-xs text-gray-500 truncate">
              {room.matchTitle}
            </p>
          </div>
          <button
            aria-label={showMatchInfo ? '매치 정보 닫기' : '매치 정보 보기'}
            onClick={() => setShowMatchInfo(!showMatchInfo)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-[0.98] transition-[colors,transform] min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            {showMatchInfo ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          {/* More menu */}
          <div className="relative" ref={menuRef}>
            <button
              aria-label="더보기 메뉴"
              onClick={() => setShowMenu(!showMenu)}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-[0.98] transition-[colors,transform] min-w-[44px] min-h-[44px] flex items-center justify-center"
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
                  onClick={() => { setShowMenu(false); setShowBlockModal(true); }}
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

        {/* Collapsible Match Info */}
        {showMatchInfo && (
          <div className="px-4 pb-3 animate-fade-in">
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <Calendar size={14} className="text-gray-500" />
                <span>{formatMatchDate(room.matchDate)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <MapPin size={14} className="text-gray-500" />
                <span>{room.matchTitle}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <DollarSign size={14} className="text-gray-500" />
                <span className="text-gray-600 dark:text-gray-300">
                  {room.homeTeamName} vs {room.awayTeamName}
                </span>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Messages area */}
      <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-3 bg-gray-50 dark:bg-gray-900/50 min-h-0">
        {/* Push messages to bottom when few messages */}
        <div className="min-h-full flex flex-col justify-end">
        {groupedMessages.map((group) => (
          <div key={group.date}>
            {/* Date separator */}
            <div className="flex items-center justify-center my-4">
              <span className="rounded-full bg-gray-200/60 dark:bg-gray-700/60 px-3 py-1 text-xs text-gray-500 dark:text-gray-400">
                {group.label}
              </span>
            </div>

            {/* Messages — 그루핑 적용 */}
            {group.messages.map((msg, idx, arr) => {
              if (msg.isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center my-3">
                    <span className="text-xs text-gray-500 dark:text-gray-400 text-center max-w-[80%]">
                      {msg.message}
                    </span>
                  </div>
                );
              }

              const isMine = msg.senderId === currentUserId;
              const prev = idx > 0 ? arr[idx - 1] : null;
              const next = idx < arr.length - 1 ? arr[idx + 1] : null;
              const isFirstInGroup = !prev || prev.isSystem || prev.senderId !== msg.senderId;
              const isLastInGroup = !next || next.isSystem || next.senderId !== msg.senderId;

              return (
                <div
                  key={msg.id}
                  className={`flex ${isLastInGroup ? 'mb-3' : 'mb-0.5'} ${isMine ? 'justify-end' : 'justify-start'}`}
                >
                  {/* ── 상대방 메시지 ── */}
                  {!isMine && (
                    <div className="flex items-start gap-2 max-w-[75%] lg:max-w-[60%]">
                      {/* 아바타: 그룹 첫 메시지만 */}
                      {isFirstInGroup ? (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300 shrink-0 mt-0.5">
                          {msg.senderName.charAt(0)}
                        </div>
                      ) : (
                        <div className="w-8 shrink-0" /> /* 들여쓰기 공간 */
                      )}
                      <div>
                        {/* 이름: 그룹 첫 메시지만 */}
                        {isFirstInGroup && (
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{msg.senderName}</span>
                            <span className="text-2xs text-gray-500">{msg.senderTeamName}</span>
                          </div>
                        )}
                        <div className="flex items-end gap-1.5">
                          <div className={`bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-3.5 py-2 text-base text-gray-800 dark:text-gray-200 ${
                            isFirstInGroup ? 'rounded-xl rounded-tl-md' : 'rounded-xl'
                          }`}>
                            {msg.message}
                          </div>
                          {/* 시간: 그룹 마지막만 */}
                          {isLastInGroup && (
                            <span className="text-2xs text-gray-400 dark:text-gray-500 shrink-0 pb-0.5">
                              {formatTime(msg.timestamp)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── 내 메시지 ── */}
                  {isMine && (
                    <div className="flex items-end gap-1.5 max-w-[75%] lg:max-w-[60%]">
                      {/* 시간 + 읽음: 그룹 마지막만 */}
                      {isLastInGroup && (
                        <div className="flex flex-col items-end shrink-0 pb-0.5">
                          {msg.isRead === false && <span className="text-2xs text-blue-500 font-medium">1</span>}
                          <span className="text-2xs text-gray-400 dark:text-gray-500">{formatTime(msg.timestamp)}</span>
                        </div>
                      )}
                      <div className={`bg-blue-500 px-3.5 py-2 text-base text-white ${
                        isFirstInGroup ? 'rounded-xl rounded-tr-md' : 'rounded-xl'
                      }`}>
                        {msg.message}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {/* 타이핑 인디케이터 */}
        {isTyping && (
          <div className="flex items-center gap-2 mb-2 ml-10">
            <div className="flex gap-1 rounded-xl rounded-tl-md bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-3.5 py-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 이모지 피커 (간단 버전) */}
      {showEmoji && (
        <div className="shrink-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 px-4 py-2">
          <div className="flex flex-wrap gap-2">
            {['👍', '👏', '🔥', '⚽', '🏀', '🏒', '💪', '🎉', '😊', '😂', '🙏', '❤️'].map(emoji => (
              <button key={emoji} onClick={() => { setInput(prev => prev + emoji); setShowEmoji(false); }}
                className="text-2xl p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-90 transition-[colors,transform] min-w-[44px] min-h-[44px] flex items-center justify-center">
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="shrink-0 px-4 py-2 bg-white dark:bg-gray-800 border-t border-gray-50 dark:border-gray-800">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
          <span className="shrink-0 text-2xs font-semibold text-gray-400 dark:text-gray-500">빠른 메시지</span>
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => handleQuickAction(action.message)}
              className="shrink-0 rounded-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 transition-colors"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input Bar */}
      <div className={`shrink-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 px-4 py-3 ${!embedded ? 'pb-[calc(0.75rem+var(--safe-area-bottom))] lg:pb-3' : ''}`}>
        <div className="flex items-center gap-1.5">
          {/* 첨부 */}
          <button aria-label="파일 첨부" onClick={() => { fileInputRef.current?.click(); toast('info', '파일 첨부 기능을 준비 중이에요'); }}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0">
            <Paperclip size={18} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={() => toast('info', '이미지 전송 기능을 준비 중이에요')} />
          {/* 이모지 */}
          <button aria-label="이모지" onClick={() => setShowEmoji(!showEmoji)}
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors shrink-0 ${showEmoji ? 'text-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <Smile size={18} />
          </button>
          {/* 입력 */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요"
            className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 px-3.5 py-2.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-colors"
          />
          {/* 전송 */}
          <button
            aria-label="메시지 보내기"
            onClick={handleSend}
            disabled={!input.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-800 p-6 mx-4 animate-fade-in">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">신고하기</h3>
            <div className="space-y-2 mb-4">
              {['욕설/비매너', '허위정보', '스팸', '기타'].map((reason) => (
                <label
                  key={reason}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                    reportReason === reason
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                      : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="reportReason"
                    value={reason}
                    checked={reportReason === reason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="accent-blue-500"
                  />
                  <span className="text-base text-gray-700 dark:text-gray-200">{reason}</span>
                </label>
              ))}
            </div>
            <textarea
              value={reportDetail}
              onChange={(e) => setReportDetail(e.target.value)}
              placeholder="상세 내용을 입력하세요 (선택)"
              rows={3}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 focus:bg-white dark:focus:bg-gray-800 transition-colors resize-none mb-4"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setShowReportModal(false); setReportReason(''); setReportDetail(''); }}
                className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 py-2.5 text-base font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleReport}
                disabled={!reportReason}
                className="flex-1 rounded-xl bg-blue-500 py-2.5 text-base font-bold text-white hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                신고하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Block Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-800 p-6 mx-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                <Ban size={20} className="text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">차단하기</h3>
            </div>
            <p className="text-base text-gray-600 dark:text-gray-300 mb-6">
              이 팀을 차단하시겠어요? 차단하면 채팅이 비활성화됩니다.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowBlockModal(false)}
                className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 py-2.5 text-base font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleBlock}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-base font-semibold text-white hover:bg-red-600 transition-colors"
              >
                차단하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-800 p-6 mx-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
                <LogOut size={20} className="text-gray-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">채팅방 나가기</h3>
            </div>
            <p className="text-base text-gray-600 dark:text-gray-300 mb-6">
              채팅방을 나가시겠어요? 대화 내용은 삭제됩니다.
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
          </div>
        </div>
      )}
    </div>
  );
}
