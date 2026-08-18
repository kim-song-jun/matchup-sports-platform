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
  // `left-1/2 + -translate-x-1/2`로 가운데를 맞추면 390px에서 토스트가 세로로
  // 찌그러진다(실측: "골을 기록했어요"가 한 줄에 한 글자씩 쌓였다). fixed 요소는
  // `right`가 없으면 가용 폭이 `100% - left`, 즉 50vw(390px에서 195px)로 잘리고
  // `max-w-[90vw]`(=351px)는 그보다 넓어 아무 것도 늘려주지 못한다 — 데스크톱
  // (50vw=720px)에서만 멀쩡해 보였던 이유다. `inset-x-0`로 폭을 뷰포트 전체로 주고
  // 가운데 정렬은 flex(`items-center`)에 맡긴다. 전폭 컨테이너가 아래 화면 조작을
  // 가로막지 않도록 컨테이너는 `pointer-events-none`, 토스트 자신만
  // `pointer-events-auto`로 되살린다.
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="pointer-events-auto flex min-w-[200px] max-w-full items-center gap-3 rounded-2xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-lg motion-safe:animate-[fade-in_0.15s_ease-out] sm:max-w-[400px]"
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
