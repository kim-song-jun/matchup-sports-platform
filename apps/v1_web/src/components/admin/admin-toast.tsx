'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AdminToastVariant = 'success' | 'error';

export interface AdminToastItem {
  id: number;
  message: string;
  variant: AdminToastVariant;
  /** 퇴장 애니메이션이 재생되는 동안 true. 이 시간이 지나야 실제로 제거된다. */
  exiting?: boolean;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const AUTO_DISMISS_MS = 3500;
// CSS 의 퇴장 애니메이션 길이와 같아야 한다. 짧으면 잘리고, 길면 빈 자리가 남는다.
const EXIT_MS = 150;

/**
 * useAdminToast — shared toast state for all admin pages.
 *
 * Returns `{ toasts, showToast }`. Toasts auto-dismiss after 3500ms.
 * Each call to showToast appends an item; the renderer stacks them bottom-center.
 */
export function useAdminToast() {
  const [toasts, setToasts] = useState<AdminToastItem[]>([]);
  const counterRef = useRef(0);
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Clear any pending auto-dismiss timers on unmount
  useEffect(() => {
    return () => {
      timerRefs.current.forEach(clearTimeout);
    };
  }, []);

  function showToast(message: string, variant: AdminToastVariant = 'success') {
    const id = ++counterRef.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
    // 2단계로 지운다: 먼저 exiting 을 세워 퇴장 애니메이션을 재생하고, 그게 끝난
    // 뒤에 배열에서 뺀다. 바로 filter 하면 진입 애니메이션만 있고 사라질 땐 뚝
    // 끊기는 비대칭이 된다.
    const timer = setTimeout(() => {
      timerRefs.current = timerRefs.current.filter((t) => t !== timer);
      // 모션을 줄이도록 설정했으면 지연 없이 바로 지운다 — CSS 의 animation:none
      // 만으로는 이 setTimeout 이 사라지지 않아 빈 자리만 남는다.
      const reduced =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        return;
      }
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
      const removeTimer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timerRefs.current = timerRefs.current.filter((t) => t !== removeTimer);
      }, EXIT_MS);
      timerRefs.current.push(removeTimer);
    }, AUTO_DISMISS_MS);
    timerRefs.current.push(timer);
  }

  return { toasts, showToast };
}

// ── Renderer ──────────────────────────────────────────────────────────────────

/**
 * AdminToasts — fixed bottom-center toast stack.
 *
 * Renders accessible toast notifications that auto-dismiss after AUTO_DISMISS_MS
 * (no manual close affordance by design — they are transient status messages).
 * Pass `toasts` from `useAdminToast()`.
 */
export function AdminToasts({ toasts }: { toasts: AdminToastItem[] }) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={[
            'flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg pointer-events-auto',
            'min-w-[200px] max-w-[90vw] sm:max-w-[400px]',
            t.exiting
              ? 'motion-safe:animate-[fade-in_0.15s_ease-in_reverse_both]'
              : 'motion-safe:animate-[fade-in_0.15s_ease-out]',
            t.variant === 'error' ? 'bg-red-500 text-white' : 'bg-gray-900 text-white',
          ].join(' ')}
        >
          {t.variant === 'success' ? (
            <CheckCircle2 size={16} aria-hidden="true" className="shrink-0" />
          ) : (
            <XCircle size={16} aria-hidden="true" className="shrink-0" />
          )}
          <span className="flex-1">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
