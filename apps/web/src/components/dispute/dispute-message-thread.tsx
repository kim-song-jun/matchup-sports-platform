'use client';

import { ChatBubble, DateSeparator, SystemMessage, formatDateLabel, getDateKey } from '@/components/chat/chat-bubble';

// Expected type contract (frontend-data-dev adds to types/api.ts):
// interface DisputeMessage {
//   id: string;
//   senderId: string | null;       // null = system message
//   senderName: string | null;
//   senderRole: 'buyer' | 'seller' | 'admin' | 'system';
//   content: string;
//   createdAt: string;
// }

export interface DisputeMessage {
  id: string;
  senderId: string | null;
  senderName: string | null;
  senderRole: 'buyer' | 'seller' | 'admin' | 'system';
  content: string;
  createdAt: string;
}

interface DisputeMessageThreadProps {
  messages: DisputeMessage[];
  /** The ID of the currently authenticated user, used to determine isMine */
  currentUserId: string;
}

/**
 * Renders a dispute message thread using ChatBubble primitives.
 * Admin messages receive a role badge overlay.
 * System events use the SystemMessage primitive.
 */
export function DisputeMessageThread({ messages, currentUserId }: DisputeMessageThreadProps) {
  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-gray-400 dark:text-gray-500">아직 메시지가 없어요</p>
      </div>
    );
  }

  // Group messages by date key for DateSeparator insertion
  const groupedDays = messages.reduce<{ dateKey: string; dateLabel: string; items: DisputeMessage[] }[]>(
    (acc, msg) => {
      const key = getDateKey(msg.createdAt);
      const last = acc[acc.length - 1];
      if (!last || last.dateKey !== key) {
        acc.push({ dateKey: key, dateLabel: formatDateLabel(msg.createdAt), items: [msg] });
      } else {
        last.items.push(msg);
      }
      return acc;
    },
    [],
  );

  return (
    <div className="space-y-0 px-4 py-3">
      {groupedDays.map((day) => (
        <div key={day.dateKey}>
          <DateSeparator label={day.dateLabel} />
          {day.items.map((msg, idx) => {
            const prev = day.items[idx - 1];
            const next = day.items[idx + 1];

            // System messages (status transitions, auto-release notices)
            if (msg.senderRole === 'system' || msg.senderId === null) {
              return <SystemMessage key={msg.id} text={msg.content} />;
            }

            const isMine = msg.senderId === currentUserId;
            const isFirstInGroup = !prev || prev.senderId !== msg.senderId;
            const isLastInGroup = !next || next.senderId !== msg.senderId;

            // Admin messages — render with "운영자" badge using ChatBubble + wrapper
            if (msg.senderRole === 'admin') {
              return (
                <div key={msg.id} className="relative">
                  {isFirstInGroup && (
                    <div className="flex items-center gap-1.5 mb-1 ml-10">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                        {msg.senderName ?? '운영자'}
                      </span>
                      <span className="rounded-full bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 text-2xs font-semibold text-blue-600 dark:text-blue-300">
                        운영자
                      </span>
                    </div>
                  )}
                  <ChatBubble
                    message={msg.content}
                    timestamp={msg.createdAt}
                    isMine={isMine}
                    senderName={undefined}
                    isFirstInGroup={isFirstInGroup}
                    isLastInGroup={isLastInGroup}
                  />
                </div>
              );
            }

            return (
              <ChatBubble
                key={msg.id}
                message={msg.content}
                timestamp={msg.createdAt}
                isMine={isMine}
                senderName={isFirstInGroup ? (msg.senderName ?? undefined) : undefined}
                isFirstInGroup={isFirstInGroup}
                isLastInGroup={isLastInGroup}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
