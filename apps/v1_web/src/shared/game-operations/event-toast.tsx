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
  readonly description: string | null;
  readonly action: EventToastAction | null;
  /** 퇴장 애니메이션이 재생되는 동안 true. 이 시간이 지나야 실제로 제거된다. */
  readonly exiting?: boolean;
}

const AUTO_DISMISS_MS = 5000; // admin-toast.tsx보다 길게 — 액션 버튼을 누를 시간을 준다
// CSS 의 퇴장 애니메이션 길이와 같아야 한다. 짧으면 잘리고, 길면 빈 자리가 남는다.
const EXIT_MS = 150;

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

  // 2단계로 지운다: exiting 을 세워 퇴장 애니메이션을 재생하고, 끝난 뒤 배열에서
  // 뺀다. 바로 filter 하면 진입만 있고 사라질 땐 뚝 끊기는 비대칭이 된다.
  // 자동 닫힘·수동 닫힘 모두 이 한 곳을 지나므로 여기만 고치면 된다.
  const dismiss = useCallback((id: number) => {
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      // CSS 의 animation:none 만으로는 아래 setTimeout 이 사라지지 않아 빈 자리만 남는다.
      setToasts((prev) => prev.filter((t) => t.id !== id));
      return;
    }
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    const removeTimer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timerRefs.current = timerRefs.current.filter((t) => t !== removeTimer);
    }, EXIT_MS);
    timerRefs.current.push(removeTimer);
  }, []);

  const showToast = useCallback(
    (message: string, opts?: { action?: EventToastAction; description?: string }) => {
      const id = ++counterRef.current;
      setToasts((prev) => [...prev, { id, message, description: opts?.description ?? null, action: opts?.action ?? null }]);
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

/**
 * 가장 가까운 기준 상자(콘솔에서는 화면 위에 붙는 점수 카드) 바로 아래에 겹쳐 뜬다. 화면 아래에 고정하면
 * 기록 격자·진행 바·바닥에서 올라오는 시트와 겹쳐 되돌리기가 다른 버튼 위에 얹힌다.
 * 폭은 부모 폭(`inset-x-0`)이고 가운데 정렬은 flex 가 맡는다. 컨테이너는 `pointer-events-none`, 토스트만 `pointer-events-auto`다.
 */
export function EventToasts({
  toasts,
  onDismiss,
}: {
  toasts: readonly EventToastItem[];
  onDismiss?: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none absolute inset-x-0 top-full flex flex-col items-center gap-2 px-4 pt-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`tm-native-toast-card pointer-events-auto flex min-w-[200px] max-w-full items-center gap-3 rounded-2xl bg-gray-900 px-5 py-3 text-[length:var(--font-size-body-sm)] font-semibold text-white shadow-lg sm:max-w-[400px] ${
            toast.exiting
              ? 'motion-safe:animate-[fade-in_0.15s_ease-in_reverse_both]'
              : 'motion-safe:animate-[fade-in_0.15s_ease-out]'
          }`}
        >
          <CheckCircle2 size={16} aria-hidden="true" className="shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span>{toast.message}</span>
            {toast.description !== null ? (
              <span className="text-[length:var(--font-size-caption)] font-medium text-white/80">{toast.description}</span>
            ) : null}
          </span>
          {toast.action ? (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                onDismiss?.(toast.id);
              }}
              className="min-h-[44px] min-w-[44px] shrink-0 rounded-lg bg-white/15 px-3 text-[length:var(--font-size-body-sm)] font-bold text-white transition-colors hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
