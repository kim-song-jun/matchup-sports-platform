'use client';

import { cn } from '@/lib/utils';

/* ── Time / Date helpers ── */

export function formatChatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const period = h < 12 ? '오전' : '오후';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${period} ${displayH}:${m}`;
}

export function formatDateLabel(dateStr: string): string {
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

export function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/* ── Date Separator ── */

export function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center my-4">
      <span className="rounded-full bg-gray-200/60 dark:bg-gray-700/60 px-3 py-1 text-xs text-gray-500 dark:text-gray-400">
        {label}
      </span>
    </div>
  );
}

/* ── System Message ── */

export function SystemMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-center my-3">
      <span className="text-xs text-gray-500 dark:text-gray-400 text-center max-w-[80%]">
        {text}
      </span>
    </div>
  );
}

/* ── Chat Bubble ── */

interface ChatBubbleProps {
  message: string;
  timestamp: string;
  isMine: boolean;
  senderName?: string;
  senderTeamName?: string;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  isRead?: boolean;
}

export function ChatBubble({
  message,
  timestamp,
  isMine,
  senderName,
  senderTeamName,
  isFirstInGroup,
  isLastInGroup,
  isRead,
}: ChatBubbleProps) {
  return (
    <div className={cn('flex', isLastInGroup ? 'mb-3' : 'mb-0.5', isMine ? 'justify-end' : 'justify-start')}>
      {/* Opponent message */}
      {!isMine && (
        <div className="flex items-start gap-2 max-w-[75%] lg:max-w-[60%]">
          {isFirstInGroup ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300 shrink-0 mt-0.5">
              {senderName?.charAt(0) ?? '?'}
            </div>
          ) : (
            <div className="w-8 shrink-0" />
          )}
          <div>
            {isFirstInGroup && senderName && (
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{senderName}</span>
                {senderTeamName && (
                  <span className="text-2xs text-gray-500 dark:text-gray-400">{senderTeamName}</span>
                )}
              </div>
            )}
            <div className="flex items-end gap-1.5">
              <div
                className={cn(
                  'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-3.5 py-2 text-md text-gray-800 dark:text-gray-200',
                  isFirstInGroup ? 'rounded-xl rounded-tl-md' : 'rounded-xl',
                )}
              >
                {message}
              </div>
              {isLastInGroup && (
                <span className="text-xs text-gray-400 dark:text-gray-400 shrink-0 pb-0.5">
                  {formatChatTime(timestamp)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* My message */}
      {isMine && (
        <div className="flex items-end gap-1.5 max-w-[75%] lg:max-w-[60%]">
          {isLastInGroup && (
            <div className="flex flex-col items-end shrink-0 pb-0.5">
              {isRead === false && (
                <span className="text-xs text-blue-500 font-medium">1</span>
              )}
              <span className="text-xs text-gray-400 dark:text-gray-400">
                {formatChatTime(timestamp)}
              </span>
            </div>
          )}
          <div
            className={cn(
              'bg-blue-500 dark:bg-blue-600 px-3.5 py-2 text-md text-white',
              isFirstInGroup ? 'rounded-xl rounded-tr-md' : 'rounded-xl',
            )}
          >
            {message}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Typing Indicator ── */

interface TypingIndicatorProps {
  senderName?: string;
}

export function TypingIndicator({ senderName }: TypingIndicatorProps) {
  return (
    <div className="flex items-start gap-2 mb-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300 shrink-0">
        {senderName?.charAt(0) ?? '·'}
      </div>
      <div className="flex gap-1 rounded-xl rounded-tl-md bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-3.5 py-2.5">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}
