import { getMotionPaused, subscribeMotionPaused } from './landing-motion-store';

/*
 * 랜딩 모션 컨트롤러. IntersectionObserver 는 트리거만 맡고 움직임은 CSS(transform/opacity)가 한다.
 * 서버가 그린 기본 상태는 "모션이 끝난 최종 장면"이다 — JS 가 없거나(크롤러) 모션 감소 설정이면
 * 아무것도 숨기지 않은 채 그대로 둔다. 숨김 상태는 root[data-motion='on'] 아래에서만 걸린다.
 */

const LIVE_START_SECONDS = 27 * 60 + 8;
const GOAL_DELAY_MS = 2400;
const COUNT_DURATION_MS = 1100;
/** scrollend 가 오지 않는 경우(이미 목적지에 있음·미지원 브라우저)에 부드러운 스크롤을 끄는 상한 */
const SMOOTH_SCROLL_MAX_MS = 1500;
/** landing.css 의 투어 sticky 폰 미디어 조건과 같아야 한다 — 어긋나면 보이지 않는 폰에 스텝을 맞춘다. */
export const TOUR_STAGE_QUERY = '(min-width: 768px) and (min-height: 600px)';

function formatClock(seconds: number): string {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function startLandingMotion(root: HTMLElement): () => void {
  if (typeof IntersectionObserver === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stageQuery = window.matchMedia(TOUR_STAGE_QUERY);
  const cleanups: Array<() => void> = [];

  /* 0. 능력치 카운트업 — 같은 숫자를 다시 세면 이전 루프를 끊고, 정리 때는 최종값으로 둔다 */
  const countFrames = new Map<HTMLElement, number>();
  const stopCount = (el: HTMLElement) => {
    const id = countFrames.get(el);
    if (id === undefined) return;
    cancelAnimationFrame(id);
    countFrames.delete(el);
    el.textContent = el.dataset.count ?? el.textContent;
  };
  const countUp = (scope: HTMLElement) => {
    scope.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
      stopCount(el);
      const to = Number(el.dataset.count);
      const start = performance.now();
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / COUNT_DURATION_MS);
        el.textContent = String(Math.round(to * (1 - (1 - t) ** 3)));
        if (t < 1) countFrames.set(el, requestAnimationFrame(frame));
        else countFrames.delete(el);
      };
      countFrames.set(el, requestAnimationFrame(frame));
    });
  };
  cleanups.push(() => [...countFrames.keys()].forEach(stopCount));

  /* 1. 스크롤 reveal — 이미 화면 안(위)에 있는 요소는 숨기지 않고 바로 최종 상태로 둔다 */
  if (!reduce) {
    const revealIO = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          revealIO.unobserve(entry.target);
        }
      },
      { threshold: 0.18, rootMargin: '0px 0px -6% 0px' },
    );
    root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-in');
      else revealIO.observe(el);
    });
    root.dataset.motion = 'on';
    cleanups.push(() => revealIO.disconnect());
  }

  /* 2. 라이브 스코어 — 시계가 가고 잠시 뒤 골이 들어온다(예시 시나리오). 보일 때·재생 중일 때만 돈다 */
  const running = new Map<HTMLElement, { tick: number; goal?: number }>();
  const stage = root.querySelector<HTMLElement>('[data-tour-stage]');
  const stageScreens = stage ? [...stage.querySelectorAll<HTMLElement>('[data-screen]')] : [];
  let currentStep = 0;
  const isLoopOn = (el: Element | null) => el instanceof HTMLElement && el.dataset.loop === 'on';

  const shouldRun = (screen: HTMLElement) => {
    if (reduce || getMotionPaused()) return false;
    if (stage && stage.contains(screen)) {
      return stageQuery.matches && stageScreens.indexOf(screen) === currentStep && isLoopOn(stage);
    }
    return isLoopOn(screen.closest('[data-loop]'));
  };

  const startLive = (screen: HTMLElement) => {
    const clock = screen.querySelector<HTMLElement>('[data-live-clock]');
    const home = screen.querySelector<HTMLElement>('[data-live-home]');
    const goalRow = screen.querySelector<HTMLElement>('[data-live-goal]');
    if (!clock || !home || !goalRow) return;
    if (screen.dataset.liveStarted !== 'true') {
      screen.dataset.liveStarted = 'true';
      screen.dataset.liveSeconds = String(LIVE_START_SECONDS);
      home.textContent = '1';
      goalRow.dataset.state = 'pending';
    }
    let seconds = Number(screen.dataset.liveSeconds);
    clock.textContent = formatClock(seconds);
    const run: { tick: number; goal?: number } = {
      tick: window.setInterval(() => {
        seconds += 1;
        screen.dataset.liveSeconds = String(seconds);
        clock.textContent = formatClock(seconds);
      }, 1000),
    };
    if (goalRow.dataset.state === 'pending') {
      run.goal = window.setTimeout(() => {
        home.textContent = '2';
        home.classList.add('is-bump');
        goalRow.dataset.state = 'shown';
      }, GOAL_DELAY_MS);
    }
    running.set(screen, run);
  };

  const stopLive = (screen: HTMLElement) => {
    const run = running.get(screen);
    if (!run) return;
    window.clearInterval(run.tick);
    if (run.goal !== undefined) window.clearTimeout(run.goal);
    running.delete(screen);
  };

  const liveScreens = [...root.querySelectorAll<HTMLElement>('[data-screen="live"]')];
  const refreshLives = () => {
    for (const screen of liveScreens) {
      const should = shouldRun(screen);
      if (should && !running.has(screen)) startLive(screen);
      else if (!should && running.has(screen)) stopLive(screen);
    }
  };
  cleanups.push(() => liveScreens.forEach(stopLive));
  cleanups.push(subscribeMotionPaused(refreshLives));

  /* 3. 반복 모션 구역 — 뷰포트 밖이면 data-loop="off" 로 CSS 애니메이션과 JS 루프를 멈춘다 */
  const loopIO = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const el = entry.target as HTMLElement;
      el.dataset.loop = entry.isIntersecting ? 'on' : 'off';
      const card = el.querySelector<HTMLElement>('[data-screen="card"]');
      if (entry.isIntersecting && !reduce && card && el !== stage && el.dataset.counted !== 'true') {
        el.dataset.counted = 'true';
        countUp(card);
      }
    }
    refreshLives();
  });
  root.querySelectorAll('[data-loop]').forEach((el) => loopIO.observe(el));
  cleanups.push(() => loopIO.disconnect());

  /* 4. 제품 투어 — sticky 폰이 보일 때(TOUR_STAGE_QUERY)만 읽고 있는 스텝에 맞춰 폰 화면을 바꾼다 */
  const tour = root.querySelector<HTMLElement>('[data-tour]');
  if (tour && stage) {
    const steps = [...tour.querySelectorAll<HTMLElement>('[data-tour-step]')];
    const dots = [...stage.querySelectorAll<HTMLElement>('[data-tour-dot]')];
    const tabs = [...stage.querySelectorAll<HTMLElement>('[data-tab]')];
    const setStep = (n: number) => {
      if (n < 0) return;
      currentStep = n;
      steps.forEach((s, i) => { s.dataset.on = String(i === n); });
      dots.forEach((d, i) => { d.dataset.on = String(i === n); });
      stageScreens.forEach((s, i) => { s.dataset.on = String(i === n); });
      const key = stageScreens[n]?.dataset.tabKey;
      tabs.forEach((t) => { t.dataset.on = String(t.dataset.tab === key); });
      if (!reduce && stageScreens[n]?.dataset.screen === 'card') countUp(stageScreens[n]);
      refreshLives();
    };
    let tourIO: IntersectionObserver | null = null;
    const sync = () => {
      tourIO?.disconnect();
      tourIO = null;
      if (!stageQuery.matches) {
        delete tour.dataset.sync;
        refreshLives();
        return;
      }
      tour.dataset.sync = 'on';
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) if (entry.isIntersecting) setStep(steps.indexOf(entry.target as HTMLElement));
        },
        { rootMargin: '-48% 0px -48% 0px' },
      );
      steps.forEach((s) => io.observe(s));
      tourIO = io;
    };
    sync();
    stageQuery.addEventListener('change', sync);
    cleanups.push(() => {
      tourIO?.disconnect();
      stageQuery.removeEventListener('change', sync);
    });
  }

  /* 5. 페이지 내 앵커 — 누른 동안에만 html 에 부드러운 스크롤을 켠다(모션 감소는 CSS 미디어가 거른다).
        이동 자체는 브라우저 기본 동작에 맡겨 해시·포커스 이동을 그대로 둔다. */
  const html = document.documentElement;
  let smoothTimer: number | undefined;
  const endSmooth = () => {
    window.clearTimeout(smoothTimer);
    delete html.dataset.landingSmooth;
  };
  const onAnchorClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element) || !event.target.closest('a[href^="#"]')) return;
    html.dataset.landingSmooth = '';
    window.clearTimeout(smoothTimer);
    smoothTimer = window.setTimeout(endSmooth, SMOOTH_SCROLL_MAX_MS);
  };
  root.addEventListener('click', onAnchorClick);
  window.addEventListener('scrollend', endSmooth);
  cleanups.push(() => {
    root.removeEventListener('click', onAnchorClick);
    window.removeEventListener('scrollend', endSmooth);
    endSmooth();
  });

  return () => cleanups.forEach((fn) => fn());
}
