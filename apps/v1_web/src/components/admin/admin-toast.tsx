'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AdminToastVariant = 'success' | 'error';

export interface AdminToastItem {
  id: number;
  message: string;
  variant: AdminToastVariant;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const AUTO_DISMISS_MS = 3500;

/**
 * useAdminToast — shared toast state for all admin pages.
 *
 * Returns `{ toasts, showToast }`. Toasts auto-dismiss after 3500ms.
 * Each call to showToast appends an item; the renderer stacks them bottom-center.
 */
export function useAdminToast() {
  const [toasts, setToasts] = useState<AdminToastItem[]>([]);
  const counterRef = useRef(0);

  function showToast(message: string, variant: AdminToastVariant = 'success') {
    const id = ++counterRef.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }

  return { toasts, showToast };
}

// ── Renderer ──────────────────────────────────────────────────────────────────

/**
 * AdminToasts — fixed bottom-center toast stack.
 *
 * Renders accessible, dismissible toast notifications.
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
            'motion-safe:animate-[fade-in_0.15s_ease-out]',
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
