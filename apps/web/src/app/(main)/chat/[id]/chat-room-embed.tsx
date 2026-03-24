'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Send, ChevronDown, ChevronUp,
  Calendar, MapPin, DollarSign, Info,
  MoreVertical, Flag, Ban, LogOut,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useChatStore } from '@/stores/chat-store';
import { useToast } from '@/components/ui/toast';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, chatRoomId]);

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
      <div className="flex-1 flex items-center justify-center px-5 py-20 text-center">
        <div>
          <Info size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-[15px] text-gray-600">채팅방을 찾을 수 없어요</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="shrink-0 bg-white border-b border-gray-100">
        {!embedded && (
          <div className="pt-[var(--safe-area-top)]" />
        )}
        <div className="flex items-center gap-3 px-4 py-3">
          {!embedded && onBack && (
            <button
              onClick={onBack}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-50 transition-colors lg:hidden"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="flex-1 min-w-0">
            <Link
              href={`/teams/${opponentTeamId}`}
              className="text-[16px] font-bold text-gray-900 truncate block hover:text-blue-500 transition-colors"
            >
              {opponentName}
            </Link>
            <p className="text-[11px] text-gray-400 truncate">
              {room.matchTitle}
            </p>
          </div>
          <button
            aria-label={showMatchInfo ? '매치 정보 닫기' : '매치 정보 보기'}
            onClick={() => setShowMatchInfo(!showMatchInfo)}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 active:scale-[0.98] transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            {showMatchInfo ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          {/* More menu */}
          <div className="relative" ref={menuRef}>
            <button
              aria-label="더보기 메뉴"
              onClick={() => setShowMenu(!showMenu)}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 active:scale-[0.98] transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <MoreVertical size={18} />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 rounded-xl bg-white border border-gray-100 shadow-lg py-1 z-50 animate-fade-in">
                <button
                  onClick={() => { setShowMenu(false); setShowReportModal(true); }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Flag size={14} className="text-gray-400" />
                  신고하기
                </button>
                <button
                  onClick={() => { setShowMenu(false); setShowBlockModal(true); }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Ban size={14} className="text-gray-400" />
                  차단하기
                </button>
                <button
                  onClick={() => { setShowMenu(false); setShowLeaveModal(true); }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[13px] text-red-500 hover:bg-gray-50 transition-colors"
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

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 bg-gray-50">
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
                    <span className="text-[12px] text-gray-400 text-center max-w-[80%]">
                      {msg.message}
                    </span>
                  </div>
                );
              }

              const isMine = msg.senderId === currentUserId;

              return (
                <div
                  key={msg.id}
                  className={`flex mb-2.5 group ${isMine ? 'justify-end' : 'justify-start'}`}
                >
                  {!isMine && (
                    <div className="flex items-start gap-2 max-w-[75%] lg:max-w-[60%]">
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
                          <span className="text-[10px] text-gray-400 shrink-0 pb-0.5 opacity-0 group-hover:opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 max-lg:opacity-100">
                            {formatTime(msg.timestamp)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {isMine && (
                    <div className="flex items-end gap-1.5 max-w-[75%] lg:max-w-[60%]">
                      <span className="text-[10px] text-gray-400 shrink-0 pb-0.5 opacity-0 group-hover:opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 max-lg:opacity-100">
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
      <div className="shrink-0 px-4 py-2 bg-white border-t border-gray-50">
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
      <div className={`shrink-0 bg-white border-t border-gray-100 px-4 py-3 ${!embedded ? 'pb-[calc(0.75rem+var(--safe-area-bottom))] lg:pb-3' : ''}`}>
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
            aria-label="메시지 보내기"
            onClick={handleSend}
            disabled={!input.trim()}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 mx-4 animate-fade-in">
            <h3 className="text-[16px] font-bold text-gray-900 mb-4">신고하기</h3>
            <div className="space-y-2 mb-4">
              {['욕설/비매너', '허위정보', '스팸', '기타'].map((reason) => (
                <label
                  key={reason}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-all ${
                    reportReason === reason
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
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
                  <span className="text-[14px] text-gray-700">{reason}</span>
                </label>
              ))}
            </div>
            <textarea
              value={reportDetail}
              onChange={(e) => setReportDetail(e.target.value)}
              placeholder="상세 내용을 입력하세요 (선택)"
              rows={3}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 focus:bg-white transition-all resize-none mb-4"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setShowReportModal(false); setReportReason(''); setReportDetail(''); }}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[14px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleReport}
                disabled={!reportReason}
                className="flex-1 rounded-xl bg-blue-500 py-2.5 text-[14px] font-semibold text-white hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 mx-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                <Ban size={20} className="text-red-500" />
              </div>
              <h3 className="text-[16px] font-bold text-gray-900">차단하기</h3>
            </div>
            <p className="text-[14px] text-gray-600 mb-6">
              이 팀을 차단하시겠어요? 차단하면 채팅이 비활성화됩니다.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowBlockModal(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[14px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleBlock}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-[14px] font-semibold text-white hover:bg-red-600 transition-colors"
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
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 mx-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                <LogOut size={20} className="text-gray-500" />
              </div>
              <h3 className="text-[16px] font-bold text-gray-900">채팅방 나가기</h3>
            </div>
            <p className="text-[14px] text-gray-600 mb-6">
              채팅방을 나가시겠어요? 대화 내용은 삭제됩니다.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowLeaveModal(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[14px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleLeave}
                className="flex-1 rounded-xl bg-gray-900 py-2.5 text-[14px] font-semibold text-white hover:bg-gray-800 transition-colors"
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
