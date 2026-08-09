'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

export interface EventToastAction {
  readonly label: string;
  readonly onClick: () => void;
}

export interface EventToastItem {
  readonly id: number;
  readonly message: string;
  readonly action: EventToastAction | null;
}

const AUTO_DISMISS_MS = 5000; // admin-toast.tsx보다 길게 — 액션 버튼을 누를 시간을 준다

/**
 * `components/admin/admin-toast.tsx`와 형제 컴포넌트지만, admin 전용이 아니고
 * 액션 버튼 슬롯이 있다(D-9: "골 기록했어요! 어시스트 추가" 토스트). admin-toast를
 * 넓히지 않고 별도로 둔 이유: 그쪽은 admin 페이지 전용으로 이름·경로가 확정돼 있다.
 */
export function useEventToast() {
  const [toasts, setToasts] = useState<EventToastItem[]>([]);
  const counterRef = useRef(0);
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      timerRefs.current.forEach(clearTimeout);
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, opts?: { action?: EventToastAction }) => {
      const id = ++counterRef.current;
      setToasts((prev) => [...prev, { id, message, action: opts?.action ?? null }]);
      const timer = setTimeout(() => {
        dismiss(id);
        timerRefs.current = timerRefs.current.filter((t) => t !== timer);
      }, AUTO_DISMISS_MS);
      timerRefs.current.push(timer);
    },
    [dismiss],
  );

  return { toasts, showToast, dismiss };
}

export function EventToasts({ toasts, onDismiss }: { toasts: readonly EventToastItem[]; onDismiss?: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="flex min-w-[200px] max-w-[90vw] items-center gap-3 rounded-2xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-lg motion-safe:animate-[fade-in_0.15s_ease-out] sm:max-w-[400px]"
        >
          <CheckCircle2 size={16} aria-hidden="true" className="shrink-0" />
          <span className="flex-1">{toast.message}</span>
          {toast.action ? (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                onDismiss?.(toast.id);
              }}
              className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
