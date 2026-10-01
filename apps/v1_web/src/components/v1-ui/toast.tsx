'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

export const TOAST_DURATION_MS = 3000;

type ToastMessage = { id: number; text: string };

/**
 * 확인 창 뒤 "무엇이 바뀌었는지" 한 줄을 화면 아래에 3초 보인다. 새 안내는 앞 안내를 덮는다 —
 * 연달아 바꿔도 마지막 결과만 남는다.
 *
 * @example
 * const { showToast, toast } = useToast();
 * showToast('김하나님을 매니저로 지정했어요');
 * return <>{page}{toast}</>;
 */
export function useToast() {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const counterRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const showToast = useCallback((text: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const id = ++counterRef.current;
    setMessage({ id, text });
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setMessage((current) => (current?.id === id ? null : current));
    }, TOAST_DURATION_MS);
  }, []);

  /** 새 동작을 시작할 때 앞 동작의 안내를 거둔다 — 그 동작이 실패하면 지난 성공 문구만 남지 않게. */
  const hideToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setMessage(null);
  }, []);

  return { showToast, hideToast, toast: <ToastViewport message={message} /> } as const;
}

/**
 * 라이브 영역은 비어 있어도 늘 그려 둔다 — 내용이 들어오는 순간을 스크린리더가 읽는다.
 * `left-1/2` 가운데 정렬은 390 에서 폭이 50vw 로 잘리므로 전폭 컨테이너 + flex 로 가운데를 맞춘다.
 */
function ToastViewport({ message }: { message: ToastMessage | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="tm-native-toast-stack pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      {message ? (
        <div
          key={message.id}
          className="tm-native-toast-card pointer-events-auto motion-safe:animate-[fade-in_0.15s_ease-out]"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            maxWidth: 400,
            padding: '14px 16px',
            borderRadius: 'var(--radius-control)',
            background: 'var(--static-ink)',
            boxShadow: '0 8px 24px color-mix(in srgb, var(--static-ink) 18%, transparent)',
          }}
        >
          <Check size={16} strokeWidth={2.6} aria-hidden="true" style={{ color: 'var(--green500)', flexShrink: 0 }} />
          <span className="tm-text-label" style={{ color: 'var(--static-white)', fontWeight: 600 }}>{message.text}</span>
        </div>
      ) : null}
    </div>
  );
}
