'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
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
  /** Same-side teammates, for the optional assist picker — excludes the
   * scorer themself. */
  readonly teammates: readonly GameLineupParticipant[];
  readonly onCommit: (input: EventCaptureCommitInput) => void;
  readonly onCancel: () => void;
}

function formatClock(clockMs: number): string {
  const totalSeconds = Math.floor(clockMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

type Step = { readonly kind: 'primary' } | { readonly kind: 'assist' };

/**
 * Task 21 — the freeze-on-tap event capture step. Goal/Yellow/Red are the
 * prominent, always-visible primary actions (October minimum). Assist and a
 * foul note are extensible secondary actions surfaced in a visible
 * disclosure section — not literally hidden behind a menu, but deliberately
 * not competing with the primary three for visual weight, and never
 * blocking/delaying committing a goal or card.
 */
export function EventCaptureModal({
  open,
  sideId,
  player,
  frozen,
  teammates,
  onCommit,
  onCancel,
}: EventCaptureModalProps) {
  const [step, setStep] = useState<Step>({ kind: 'primary' });
  const [foulNote, setFoulNote] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      setStep({ kind: 'primary' });
      setFoulNote('');
    }
  }, [open, player.id]);

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
    const focusableSelectors = 'a[href], button:not([disabled]), textarea, input, [tabindex]:not([tabindex="-1"])';
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

  const base = useMemo(
    () => ({
      participantId: player.id,
      sideId,
      period: frozen.period,
      clockMs: frozen.clockMs,
      occurredAt: frozen.occurredAt,
    }),
    [player.id, sideId, frozen],
  );

  if (!open) return null;

  const commitGoal = (assistParticipantId: string | null) => {
    onCommit({
      ...base,
      type: 'GOAL',
      payload: assistParticipantId ? { assistParticipantId } : {},
    });
  };

  const commitCard = (card: GameCardColor) => {
    onCommit({ ...base, type: 'CARD', payload: { card } });
  };

  const commitFoul = () => {
    const trimmed = foulNote.trim();
    onCommit({
      ...base,
      type: 'CORRECTION',
      payload: { kind: 'FOUL', ...(trimmed ? { note: trimmed } : {}) },
    });
  };

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
            <p
              className="mt-0.5 text-2xs font-medium tabular-nums text-blue-600 dark:text-blue-400"
              aria-live="polite"
            >
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

        {step.kind === 'primary' ? (
          <div className="flex flex-col gap-4 px-5 py-5">
            <div className="grid grid-cols-3 gap-2">
              <Button
                ref={firstFocusableRef}
                size="lg"
                variant="success"
                className="h-16 flex-col gap-1"
                onClick={() => setStep({ kind: 'assist' })}
              >
                <span aria-hidden="true">⚽</span>
                골
              </Button>
              <Button
                size="lg"
                variant="warning"
                className="h-16 flex-col gap-1"
                onClick={() => commitCard('YELLOW')}
              >
                <span aria-hidden="true" className="block h-4 w-3 rounded-[2px] bg-yellow-300" />
                옐로카드
              </Button>
              <Button
                size="lg"
                variant="danger"
                className="h-16 flex-col gap-1"
                onClick={() => commitCard('RED')}
              >
                <span aria-hidden="true" className="block h-4 w-3 rounded-[2px] bg-red-200" />
                레드카드
              </Button>
            </div>

            <details className="rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700">
              <summary className="cursor-pointer text-2xs font-semibold text-gray-500 dark:text-gray-400">
                파울 기록 (선택)
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                <label htmlFor="foul-note" className="sr-only">
                  파울 메모
                </label>
                <textarea
                  id="foul-note"
                  rows={2}
                  value={foulNote}
                  onChange={(event) => setFoulNote(event.target.value)}
                  placeholder="메모 (선택)"
                  className="rounded-lg border border-gray-200 px-2.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                />
                <Button size="md" variant="neutral" onClick={commitFoul}>
                  파울 기록하기
                </Button>
              </div>
            </details>
          </div>
        ) : (
          <div className="flex flex-col gap-3 px-5 py-5">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              어시스트한 선수가 있나요? (선택)
            </p>
            <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto" role="list">
              <button
                type="button"
                onClick={() => commitGoal(null)}
                className="flex min-h-[44px] items-center rounded-lg px-3 text-left text-sm font-medium text-gray-600 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                어시스트 없음
              </button>
              {teammates.map((teammate) => (
                <button
                  key={teammate.id}
                  type="button"
                  onClick={() => commitGoal(teammate.id)}
                  className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-gray-900 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-white dark:hover:bg-blue-500/10"
                >
                  <span className="tabular-nums text-gray-400">{teammate.jerseyNumber ?? '-'}</span>
                  {teammate.displayNameSnapshot}
                </button>
              ))}
            </div>
            <Button size="md" variant="outline" onClick={() => setStep({ kind: 'primary' })}>
              뒤로
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
