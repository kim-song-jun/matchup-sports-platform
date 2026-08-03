'use client';

import { Button } from '@/components/v1-ui/button';
import type { QueuedGameEvent, QueuedEventStatus } from '@/lib/game-operations-queue';

/**
 * Task 21 — the durable local event queue's visible status list. Acceptance
 * criterion: "a failed event remains visible" — every item, whatever its
 * status, stays in this list until it acks; nothing is silently dropped.
 */

export interface QueueStatusPanelProps {
  readonly items: readonly QueuedGameEvent[];
  readonly onRetry: (clientEventId: string) => void;
}

const STATUS_LABEL: Record<QueuedEventStatus, string> = {
  queued: '대기 중',
  sending: '전송 중',
  acked: '기록 완료',
  failed: '전송 실패',
};

const STATUS_BADGE_CLASS: Record<QueuedEventStatus, string> = {
  queued: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  sending: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  acked: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400',
  failed: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
};

function eventLabel(item: QueuedGameEvent): string {
  if (item.event.type === 'GOAL') return '골';
  if (item.event.type === 'CARD') {
    const card = item.event.payload.card;
    return card === 'RED' ? '레드카드' : '옐로카드';
  }
  if (item.event.type === 'CORRECTION') {
    // This console only ever queues a CORRECTION-typed event as the FOUL
    // secondary action's ad hoc payload marker (see EventCaptureModal /
    // types/game-operations.ts's `GameEventType` doc comment) -- it never
    // exposes a real reversal/undo action, so every item this queue ever
    // sees here is a foul note, never a genuine `reverseEvent()` correction.
    // Label off the discriminator, not the wire type, so this stays correct
    // if a real correction/reversal action is ever added to this console.
    return item.event.payload.kind === 'FOUL' ? '파울' : '정정';
  }
  return item.event.type;
}

export function QueueStatusPanel({ items, onRetry }: QueueStatusPanelProps) {
  if (items.length === 0) {
    return (
      <p className="px-1 py-3 text-2xs text-gray-400 dark:text-gray-500">
        기록된 이벤트가 아직 없어요.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5" aria-label="기록한 이벤트 목록">
      {items.map((item) => (
        <li
          key={item.clientEventId}
          className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
              {eventLabel(item)}
            </p>
            {item.status === 'failed' && item.lastError ? (
              <p className="text-2xs text-red-500" role="alert">
                {item.lastError.message}
              </p>
            ) : null}
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${STATUS_BADGE_CLASS[item.status]}`}
          >
            {STATUS_LABEL[item.status]}
          </span>
          {item.status === 'failed' ? (
            <Button size="sm" variant="outline" onClick={() => onRetry(item.clientEventId)}>
              다시 시도
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
