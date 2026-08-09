'use client';

import { useEffect, useRef } from 'react';
import { Goal, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import type { FrozenEventCapture } from '@/lib/game-operations-clock';
import type { GameCardColor, GameEventType, GameLineupParticipant } from '@/types/game-operations';

export interface EventCaptureCommitInput {
  readonly type: GameEventType;
  readonly participantId: string;
  readonly sideId: string;
  readonly period: number;
  readonly clockMs: number;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
}

export interface EventCaptureModalProps {
  readonly open: boolean;
  readonly sideId: string;
  readonly player: GameLineupParticipant;
  /** The frozen tap instant — held by the PARENT for the modal's whole
   * lifetime (see this task's freeze requirement); this component never
   * re-derives it. */
  readonly frozen: FrozenEventCapture;
  readonly onCommit: (input: EventCaptureCommitInput) => void;
  readonly onCancel: () => void;
}

function formatClock(clockMs: number): string {
  const totalSeconds = Math.floor(clockMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * D-9 — 골/카드/파울 모두 탭 즉시 확정한다. 어시스트는 여기서 묻지 않는다
 * (토스트의 "어시스트 추가" 액션 또는 기록된 이벤트 목록의 "+ 어시스트"에서
 * 사후 부착 — recorded-event-list.tsx / event-toast.tsx 참고).
 */
export function EventCaptureModal({ open, sideId, player, frozen, onCommit, onCancel }: EventCaptureModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
    } else {
      const el = previousFocusRef.current;
      if (el && typeof (el as HTMLElement).focus === 'function') (el as HTMLElement).focus();
      previousFocusRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => firstFocusableRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusableSelectors = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelectors));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  if (!open) return null;

  const base = {
    participantId: player.id,
    sideId,
    period: frozen.period,
    clockMs: frozen.clockMs,
    occurredAt: frozen.occurredAt,
  };

  const commit = (type: GameEventType, payload: Record<string, unknown> = {}) => {
    onCommit({ ...base, type, payload });
  };
  const commitCard = (card: GameCardColor) => commit('CARD', { card });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 p-0 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-capture-title"
        className="w-full max-w-[440px] rounded-t-2xl bg-white shadow-[0_8px_32px_rgba(20,28,45,0.2)] sm:rounded-2xl dark:bg-gray-800"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700">
          <div>
            <h2 id="event-capture-title" className="text-base font-bold text-gray-900 dark:text-white">
              {player.displayNameSnapshot}
            </h2>
            <p className="mt-0.5 text-2xs font-medium tabular-nums text-blue-600 dark:text-blue-400" aria-live="polite">
              {frozen.period}피리어드 · {formatClock(frozen.clockMs)} 시점 기록 (고정됨)
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="이벤트 기록 취소"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-gray-700"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 px-5 py-5 sm:grid-cols-4">
          <Button ref={firstFocusableRef} size="lg" variant="success" className="h-16 flex-col gap-1" onClick={() => commit('GOAL')}>
            <Goal size={18} aria-hidden="true" />
            골
          </Button>
          <Button size="lg" variant="warning" className="h-16 flex-col gap-1" onClick={() => commitCard('YELLOW')}>
            <span aria-hidden="true" className="block h-4 w-3 rounded-[2px] bg-yellow-300" />
            옐로카드
          </Button>
          <Button size="lg" variant="danger" className="h-16 flex-col gap-1" onClick={() => commitCard('RED')}>
            <span aria-hidden="true" className="block h-4 w-3 rounded-[2px] bg-red-200" />
            레드카드
          </Button>
          <Button size="lg" variant="neutral" className="h-16 flex-col gap-1" onClick={() => commit('FOUL')}>
            <AlertTriangle size={18} aria-hidden="true" />
            파울
          </Button>
        </div>
      </div>
    </div>
  );
}
