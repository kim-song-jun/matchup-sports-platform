'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { getMotionPaused, subscribeMotionPaused } from '../landing-motion-store';

/** landing-v4.css 의 투어 고정 미디어 조건과 같아야 한다 — 어긋나면 보이지 않는 폰을 굴린다. */
export const TOUR_PIN_QUERY = '(min-width: 1024px) and (min-height: 700px)';

/** 스크롤이 이만큼 멈추면 반쯤 넘어간 화면을 가장 가까운 화면으로 맞춘다. */
const SETTLE_MS = 160;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * 뷰포트 가운데가 행 i 중심 → 행 i+1 중심으로 가는 동안 가운데 40% 에서만 화면이 넘어간다(앞뒤 30% 는 읽는 구간).
 * stepped(움직임 멈추기)면 반을 넘는 순간 한 번에 바꾼다.
 */
export function tourProgress(centers: readonly number[], mid: number, stepped: boolean): number {
  const last = centers.length - 1;
  if (mid <= centers[0]) return 0;
  if (mid >= centers[last]) return last;
  let i = 0;
  while (mid >= centers[i + 1]) i += 1;
  const f = (mid - centers[i]) / (centers[i + 1] - centers[i]);
  if (stepped) return f < 0.5 ? i : i + 1;
  return i + smoothstep(clamp((f - 0.3) / 0.4, 0, 1));
}

/** 다음 화면은 아래에서 시트처럼 올라와 덮고 지난 화면은 작아지며 물러난다 — 두 화면의 글자를 반투명으로 겹치지 않는다. */
export function sheetPose(progress: number, index: number): { ty: number; sc: number; op: number } {
  const d = clamp(progress - index, -1, 1);
  return {
    ty: d < 0 ? -d * 100 : -d * 4,
    sc: d > 0 ? 1 - d * 0.06 : 1,
    op: Math.abs(d) >= 1 ? 0 : d > 0 ? 1 - d * 0.6 : 1,
  };
}

// Safari < 14 의 MediaQueryList 에는 addListener/removeListener 만 있다.
type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
};

function onMediaChange(query: MediaQueryList, listener: () => void): () => void {
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }
  const legacy = query as LegacyMediaQueryList;
  legacy.addListener?.(listener);
  return () => legacy.removeListener?.(listener);
}

/**
 * 1024+·높이 700+ 이고 모션 감소가 아니면 frame[data-pin="on"] 을 달고, 스크롤 진행을 고정 폰 화면의 CSS 변수로만 옮긴다.
 * 투어가 화면 근처에 없으면 스크롤을 듣지 않는다. 설명 행에는 아무 상태도 쓰지 않는다(단계 강조 없음).
 */
export function useLandingV4TourPin(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const frame = ref.current;
    if (!frame || typeof IntersectionObserver === 'undefined' || typeof window.matchMedia !== 'function') return;
    const rows = [...frame.querySelectorAll<HTMLElement>('[data-v4-tour-row]')];
    const pin = frame.querySelector<HTMLElement>('[data-v4-tour-pin]');
    const screens = pin ? [...pin.querySelectorAll<HTMLElement>('[data-screen]')] : [];
    const tabs = pin ? [...pin.querySelectorAll<HTMLElement>('[data-tab]')] : [];
    if (!pin || rows.length < 2 || screens.length !== rows.length) return;
    const pinQuery = window.matchMedia(TOUR_PIN_QUERY);
    const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    let rafId = 0;
    let settleTimer: number | undefined;
    let listening = false;
    let inView = false;
    let current = 0;
    let written: number | null = null;

    // 읽는 구간(앞뒤 30%)에선 진행값이 그대로라 매 프레임 같은 값을 다시 써 스타일 재계산만 부르지 않게 한다.
    const apply = (progress: number) => {
      current = progress;
      if (progress === written) return;
      written = progress;
      screens.forEach((screen, i) => {
        const { ty, sc, op } = sheetPose(progress, i);
        screen.style.setProperty('--tm-landing-v4-ty', `${ty.toFixed(3)}%`);
        screen.style.setProperty('--tm-landing-v4-sc', sc.toFixed(4));
        screen.style.setProperty('--tm-landing-v4-op', op.toFixed(4));
      });
      const key = screens[Math.round(progress)]?.dataset.tabKey;
      tabs.forEach((tab) => { tab.dataset.on = String(tab.dataset.tab === key); });
    };
    const measure = () => {
      const centers = rows.map((row) => {
        const box = row.getBoundingClientRect();
        return box.top + box.height / 2;
      });
      return tourProgress(centers, window.innerHeight / 2, getMotionPaused());
    };
    const update = () => {
      rafId = 0;
      apply(measure());
    };
    const onScroll = () => {
      if (!rafId) rafId = requestAnimationFrame(update);
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => apply(Math.round(current)), SETTLE_MS);
    };
    const listen = (on: boolean) => {
      if (on === listening) return;
      listening = on;
      if (on) {
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        return;
      }
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(rafId);
      rafId = 0;
      window.clearTimeout(settleTimer);
    };
    const refresh = () => {
      const pinned = pinQuery.matches && !reduceQuery.matches;
      if (getMotionPaused()) frame.dataset.still = 'true';
      else delete frame.dataset.still;
      if (pinned && frame.dataset.pin !== 'on') {
        frame.dataset.pin = 'on';
        apply(measure());
      } else if (!pinned) {
        delete frame.dataset.pin;
      }
      listen(pinned && inView);
      if (listening) onScroll();
    };

    const io = new IntersectionObserver(
      (entries) => {
        inView = entries[entries.length - 1]?.isIntersecting ?? inView;
        refresh();
      },
      { rootMargin: '50% 0px' },
    );
    io.observe(frame);
    const cleanups = [
      onMediaChange(pinQuery, refresh),
      onMediaChange(reduceQuery, refresh),
      subscribeMotionPaused(refresh),
    ];
    refresh();
    return () => {
      io.disconnect();
      listen(false);
      cleanups.forEach((fn) => fn());
    };
  }, [ref]);
}

/** 투어 전체를 감싸는 섬. 안쪽 행·고정 폰은 서버가 그린 그대로 두고 속성과 CSS 변수만 바꾼다. */
export function LandingV4TourFrame({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLandingV4TourPin(ref);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
