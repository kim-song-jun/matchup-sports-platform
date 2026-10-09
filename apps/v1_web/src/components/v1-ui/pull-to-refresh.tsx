'use client';

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { detectNativeShell } from '@/lib/native-bridge';
import {
  PULL_MIN_REFRESH_MS,
  PULL_THRESHOLD_PX,
  classifyPullIntent,
  isPullToRefreshRoute,
  pullOffset,
  pullProgress,
  shouldRefresh,
} from '@/lib/pull-to-refresh';

const DESKTOP_QUERY = '(min-width: 1024px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const RELEASE_MS = 240; // --duration-slow
const SPOKES = Array.from({ length: 8 }, (_, i) => i);

type Gesture = { startX: number; startY: number; baseY: number; intent: 'undecided' | 'pull' };

function isBlockedByOverlay(): boolean {
  const root = document.documentElement;
  return (
    document.querySelector('[aria-modal="true"]') !== null ||
    root.classList.contains('tm-keyboard-open') ||
    root.dataset.teameetNativeKeyboard === 'open'
  );
}

/** A nested scroller that is already scrolled owns the downward drag. */
function startsInsideScrolledScroller(target: EventTarget | null, area: HTMLElement): boolean {
  for (let node = target as HTMLElement | null; node && node !== area; node = node.parentElement) {
    if (node.scrollTop > 0) return true;
  }
  return false;
}

/** Native app only: browsers keep their own refresh behavior and get none of this DOM. */
export function PullToRefresh({ areaRef }: { areaRef: RefObject<HTMLElement | null> }) {
  const [inNativeShell, setInNativeShell] = useState(false);
  useEffect(() => {
    setInNativeShell(detectNativeShell() !== null);
  }, []);
  return inNativeShell ? <PullToRefreshActive areaRef={areaRef} /> : null;
}

function PullToRefreshActive({ areaRef }: { areaRef: RefObject<HTMLElement | null> }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('');
  const enabled = pathname ? isPullToRefreshRoute(pathname) : false;
  // The gesture effect must not re-run (and wipe an in-flight pull) when these identities change.
  const refetchRef = useRef<() => Promise<unknown>>(async () => undefined);
  useEffect(() => {
    refetchRef.current = async () => {
      router.refresh();
      await queryClient.refetchQueries({ type: 'active' });
    };
  }, [router, queryClient]);

  useEffect(() => {
    const maybeArea = areaRef.current;
    const maybeIndicator = indicatorRef.current;
    if (!enabled || !maybeArea || !maybeIndicator) return;
    const area: HTMLElement = maybeArea;
    const indicator: HTMLDivElement = maybeIndicator;

    let gesture: Gesture | null = null;
    let offset = 0;
    let refreshing = false;
    let disposed = false;
    let clearTimer: ReturnType<typeof setTimeout> | null = null;
    const reducedMotion = () => window.matchMedia(REDUCED_MOTION_QUERY).matches;

    const apply = (next: number, state: 'pull' | 'release' | 'refreshing') => {
      offset = next;
      const value = `${next}px`;
      area.style.setProperty('--tm-ptr-offset', value);
      indicator.style.setProperty('--tm-ptr-offset', value);
      indicator.style.setProperty('--tm-ptr-progress', String(pullProgress(next)));
      area.dataset.ptr = state === 'pull' ? 'pull' : 'release';
      indicator.dataset.state = state;
    };

    const clear = () => {
      offset = 0;
      delete area.dataset.ptr;
      area.style.removeProperty('--tm-ptr-offset');
      delete indicator.dataset.state;
      indicator.style.removeProperty('--tm-ptr-offset');
      indicator.style.removeProperty('--tm-ptr-progress');
    };

    const settle = () => {
      apply(0, 'release');
      clearTimer = setTimeout(clear, reducedMotion() ? 0 : RELEASE_MS);
    };

    const refresh = async () => {
      refreshing = true;
      apply(PULL_THRESHOLD_PX, 'refreshing');
      setStatus('새로고침 중이에요');
      try {
        await Promise.all([
          refetchRef.current(),
          new Promise((resolve) => setTimeout(resolve, PULL_MIN_REFRESH_MS)),
        ]);
      } finally {
        refreshing = false;
        setStatus('');
        if (!disposed) settle();
      }
    };

    const endGesture = () => {
      area.removeEventListener('touchmove', onMove);
      const pulled = gesture?.intent === 'pull';
      gesture = null;
      return pulled;
    };

    function onMove(event: TouchEvent) {
      if (!gesture) return;
      const touch = event.touches[0];
      if (event.touches.length !== 1 || !touch) {
        if (endGesture()) settle();
        return;
      }
      if (gesture.intent === 'undecided') {
        const intent = classifyPullIntent(touch.clientX - gesture.startX, touch.clientY - gesture.startY);
        if (intent === 'undecided') return;
        if (intent === 'ignore' || area.scrollTop > 0) {
          endGesture();
          return;
        }
        gesture.intent = 'pull';
        gesture.baseY = touch.clientY;
      }
      if (event.cancelable) event.preventDefault();
      apply(pullOffset(touch.clientY - gesture.baseY), 'pull');
    }

    const onStart = (event: TouchEvent) => {
      if (refreshing || gesture) return;
      if (clearTimer) {
        clearTimeout(clearTimer);
        clear();
      }
      const touch = event.touches[0];
      if (event.touches.length !== 1 || !touch) return;
      if (window.matchMedia(DESKTOP_QUERY).matches) return;
      if (area.scrollTop > 0 || isBlockedByOverlay() || startsInsideScrolledScroller(event.target, area)) return;
      gesture = { startX: touch.clientX, startY: touch.clientY, baseY: touch.clientY, intent: 'undecided' };
      // Non-passive only for the lifetime of a gesture that may become a pull.
      area.addEventListener('touchmove', onMove, { passive: false });
    };

    const onEnd = (event: TouchEvent) => {
      const pulled = endGesture();
      if (!pulled) return;
      if (event.type === 'touchend' && shouldRefresh(offset)) void refresh();
      else settle();
    };

    area.addEventListener('touchstart', onStart, { passive: true });
    area.addEventListener('touchend', onEnd, { passive: true });
    area.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      disposed = true;
      if (clearTimer) clearTimeout(clearTimer);
      area.removeEventListener('touchstart', onStart);
      area.removeEventListener('touchend', onEnd);
      area.removeEventListener('touchcancel', onEnd);
      area.removeEventListener('touchmove', onMove);
      clear();
    };
  }, [enabled, areaRef]);

  return (
    <>
      <div ref={indicatorRef} className="tm-ptr" aria-hidden="true">
        <svg className="tm-ptr-spinner" viewBox="0 0 24 24" width="24" height="24">
          {SPOKES.map((i) => (
            <line
              key={i}
              className="tm-ptr-spoke"
              x1="12"
              y1="3.5"
              x2="12"
              y2="8"
              transform={`rotate(${i * 45} 12 12)`}
              style={{ '--i': i } as CSSProperties}
            />
          ))}
        </svg>
      </div>
      <div role="status" className="sr-only">{status}</div>
    </>
  );
}
