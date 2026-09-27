import { useEffect, useState, type Dispatch, type RefObject } from 'react';
import { getMotionPaused, subscribeMotionPaused } from '../landing-motion-store';
import type { DemoAction } from './landing-v4-demo-state';

/*
 * 첫 화면 자동 시연: 매치 신청 → 라이브 골 → 결승 진출을 약 8초 동안 한 번 보여 주고 처음 화면으로 돌아간다.
 * 공지는 하지 않는다(silent) — 사용자가 한 일이 아니므로 스크린리더에 읽히면 안 된다.
 */
export const AUTOPLAY_STEPS: ReadonlyArray<{ at: number; action: DemoAction }> = [
  { at: 900, action: { type: 'tab', tab: 'match' } },
  { at: 1900, action: { type: 'apply', id: 'seongsu', silent: true } },
  { at: 3300, action: { type: 'tab', tab: 'cup', sub: 'live' } },
  { at: 4200, action: { type: 'goal', side: 'a', silent: true } },
  { at: 5400, action: { type: 'cupSub', sub: 'bracket' } },
  // 라이브 화면의 결승(FC 한강 vs 성수 러너스)에서 방금 골을 넣은 쪽을 우승시켜 시연 서사를 맞춘다.
  { at: 6300, action: { type: 'pickFinal', slot: 0, silent: true } },
  { at: 8400, action: { type: 'reset' } },
];

/**
 * 이 중 하나라도 오면 즉시 멈춘다. capture 로 받아 폰 안 버튼이 먼저 처리하기 전에 끊는다.
 * click·focusin 은 포인터·키 이벤트 없이 누르거나 옮기는 스크린리더 가상 커서를 위해 둔다.
 */
const INTERRUPT_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'click', 'focusin'] as const;
const VISIBLE_THRESHOLD = 0.4;

export function useLandingV4Autoplay(
  targetRef: RefObject<HTMLElement | null>,
  dispatch: Dispatch<DemoAction>,
): boolean {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const target = targetRef.current;
    if (!target || typeof window.matchMedia !== 'function' || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || getMotionPaused() || document.hidden) return;

    const timers: number[] = [];
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      timers.forEach((id) => window.clearTimeout(id));
      io.disconnect();
      INTERRUPT_EVENTS.forEach((type) => window.removeEventListener(type, stop, true));
      window.removeEventListener('scroll', stop);
      document.removeEventListener('visibilitychange', stop);
      unsubscribe();
      setPlaying(false);
    };
    const play = () => {
      setPlaying(true);
      AUTOPLAY_STEPS.forEach(({ at, action }, index) => {
        timers.push(
          window.setTimeout(() => {
            dispatch(action);
            if (index === AUTOPLAY_STEPS.length - 1) stop();
          }, at),
        );
      });
    };
    // 첫 관찰 결과로만 정한다 — 처음에 화면 밖이었다면 나중에 스크롤해 들어와도 시작하지 않는다.
    const io = new IntersectionObserver(
      ([entry]) => {
        io.disconnect();
        if (!stopped && entry?.isIntersecting) play();
        else stop();
      },
      { threshold: VISIBLE_THRESHOLD },
    );
    io.observe(target);
    INTERRUPT_EVENTS.forEach((type) => window.addEventListener(type, stop, { capture: true, passive: true }));
    window.addEventListener('scroll', stop, { passive: true });
    document.addEventListener('visibilitychange', stop);
    const unsubscribe = subscribeMotionPaused(stop);
    return stop;
  }, [targetRef, dispatch]);

  return playing;
}
