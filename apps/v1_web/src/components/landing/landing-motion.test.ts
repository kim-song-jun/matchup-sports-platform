import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startLandingMotion, TOUR_STAGE_QUERY } from './landing-motion';
import { setMotionPaused } from './landing-motion-store';

/*
 * jsdom 에는 IntersectionObserver 가 없다 — 관찰 대상과 콜백만 기록하는 최소 스텁
 * (불가피한 브라우저 API mock). 판정은 컨트롤러가 실제 DOM 에 남긴 결과로만 한다.
 */
type Observer = { callback: IntersectionObserverCallback; targets: Set<Element> };
let observers: Observer[] = [];

class FakeIntersectionObserver {
  private readonly record: Observer;
  constructor(callback: IntersectionObserverCallback) {
    this.record = { callback, targets: new Set() };
    observers.push(this.record);
  }
  observe(el: Element) { this.record.targets.add(el); }
  unobserve(el: Element) { this.record.targets.delete(el); }
  disconnect() { this.record.targets.clear(); }
}

function fire(target: Element, isIntersecting: boolean) {
  for (const o of observers.filter((ob) => ob.targets.has(target))) {
    o.callback([{ target, isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
  }
}

function stubMedia(reduce: boolean, stage = false) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce') ? reduce : query === TOUR_STAGE_QUERY ? stage : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function mount(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});

afterEach(() => {
  setMotionPaused(false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  delete document.documentElement.dataset.landingSmooth;
});

describe('startLandingMotion — reveal', () => {
  const html = '<section data-reveal id="near"></section><section data-reveal id="far"></section>';
  const place = (root: HTMLElement) => {
    root.querySelector('#near')!.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
    root.querySelector('#far')!.getBoundingClientRect = () => ({ top: 5000 }) as DOMRect;
  };

  it('이미 화면 안에 있는 요소는 숨기지 않고, 아래 요소만 들어올 때 드러낸다', () => {
    stubMedia(false);
    const root = mount(html);
    place(root);
    startLandingMotion(root);

    expect(root.dataset.motion).toBe('on');
    expect(root.querySelector('#near')).toHaveClass('is-in');
    const far = root.querySelector('#far')!;
    expect(far).not.toHaveClass('is-in');
    fire(far, true);
    expect(far).toHaveClass('is-in');
  });

  it('모션 감소 설정이면 모션을 켜지 않는다 — 숨김 규칙이 걸리지 않아 전부 보인다', () => {
    stubMedia(true);
    const root = mount(html);
    place(root);
    startLandingMotion(root);
    expect(root.dataset.motion).toBeUndefined();
  });
});

describe('startLandingMotion — 라이브 스코어 반복', () => {
  const html = `
    <div data-loop="off" id="mini">
      <div data-screen="live">
        <b data-live-home>2</b><span data-live-clock>27:11</span>
        <div data-live-goal></div>
      </div>
    </div>`;

  it('보일 때만 시계가 가고, 움직임 멈추기와 뷰포트 이탈에 멈춘다', () => {
    vi.useFakeTimers();
    stubMedia(false);
    const root = mount(html);
    const mini = root.querySelector('#mini')!;
    const clock = root.querySelector('[data-live-clock]')!;
    const home = root.querySelector('[data-live-home]')!;
    startLandingMotion(root);

    vi.advanceTimersByTime(3000);
    expect(clock.textContent).toBe('27:11'); // 아직 안 보임 — 서버가 그린 최종 장면 그대로

    fire(mini, true);
    expect(clock.textContent).toBe('27:08');
    expect(home.textContent).toBe('1');
    vi.advanceTimersByTime(3000);
    expect(clock.textContent).toBe('27:11');
    expect(home.textContent).toBe('2');

    setMotionPaused(true);
    vi.advanceTimersByTime(5000);
    expect(clock.textContent).toBe('27:11');

    setMotionPaused(false);
    vi.advanceTimersByTime(2000);
    expect(clock.textContent).toBe('27:13');

    fire(mini, false);
    vi.advanceTimersByTime(5000);
    expect(clock.textContent).toBe('27:13');
  });
});

describe('startLandingMotion — 정리', () => {
  it('반환된 정리 함수가 라이브 시계와 관찰을 멈춘다', () => {
    vi.useFakeTimers();
    stubMedia(false);
    const root = mount(`
      <div data-loop="off" id="mini">
        <div data-screen="live">
          <b data-live-home>2</b><span data-live-clock>27:11</span><div data-live-goal></div>
        </div>
      </div>`);
    const mini = root.querySelector('#mini')!;
    const clock = root.querySelector('[data-live-clock]')!;
    const stop = startLandingMotion(root);

    fire(mini, true);
    vi.advanceTimersByTime(2000);
    expect(clock.textContent).toBe('27:10');

    stop();
    vi.advanceTimersByTime(5000);
    expect(clock.textContent).toBe('27:10');
    fire(mini, true); // 관찰이 끊겨 다시 보이는 신호도 오지 않는다
    vi.advanceTimersByTime(3000);
    expect(clock.textContent).toBe('27:10');
  });

  it('진행 중인 능력치 카운트업을 끊고 최종값으로 둔다', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.set(++nextId, cb);
      return nextId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    stubMedia(false);
    const root = mount('<div data-loop="off" id="mini"><div data-screen="card"><b data-count="78">78</b></div></div>');
    const stat = root.querySelector('[data-count]')!;
    const stop = startLandingMotion(root);

    fire(root.querySelector('#mini')!, true);
    const [[firstId, first]] = frames;
    frames.delete(firstId); // 실행된 프레임은 대기열에서 빠진다
    first(performance.now()); // 첫 프레임 — 0 에 가까운 값에서 세기 시작
    expect(Number(stat.textContent)).toBeLessThan(78);
    expect(frames.size).toBe(1);

    stop();
    expect(frames.size).toBe(0);
    expect(stat.textContent).toBe('78');
  });
});

describe('startLandingMotion — 투어 동기화(sticky 폰이 보일 때)', () => {
  const html = `
    <div data-tour>
      <div data-tour-stage data-loop="off" id="stage">
        <div data-screen="match" data-tab-key="match" data-on="true"></div>
        <div data-screen="live" data-tab-key="cup" data-on="false">
          <b data-live-home>2</b><span data-live-clock>27:11</span><div data-live-goal></div>
        </div>
        <span data-tab="match" data-on="true"></span><span data-tab="cup" data-on="false"></span>
        <i data-tour-dot data-on="true"></i><i data-tour-dot data-on="false"></i>
      </div>
      <section data-tour-step data-on="true" id="s0"></section>
      <section data-tour-step data-on="false" id="s1"></section>
    </div>`;

  it('읽는 스텝이 바뀌면 스텝·점·화면·탭바가 함께 바뀌고, 그 화면의 라이브만 돈다', () => {
    vi.useFakeTimers();
    stubMedia(false, true);
    const root = mount(html);
    const clock = root.querySelector('[data-live-clock]')!;
    startLandingMotion(root);
    const on = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)].map((el) => el.dataset.on);

    fire(root.querySelector('#stage')!, true);
    vi.advanceTimersByTime(3000);
    expect(clock.textContent).toBe('27:11'); // 라이브 화면이 아직 폰에 없다

    fire(root.querySelector('#s1')!, true);
    expect(on('[data-tour-step]')).toEqual(['false', 'true']);
    expect(on('[data-tour-dot]')).toEqual(['false', 'true']);
    expect(on('#stage [data-screen]')).toEqual(['false', 'true']);
    expect(on('[data-tab]')).toEqual(['false', 'true']);
    expect(clock.textContent).toBe('27:08');
    vi.advanceTimersByTime(2000);
    expect(clock.textContent).toBe('27:10');

    fire(root.querySelector('#s0')!, true);
    vi.advanceTimersByTime(3000);
    expect(clock.textContent).toBe('27:10'); // 다른 스텝으로 넘어가면 멈춘다
  });

  it('addEventListener 가 없는 MediaQueryList(Safari < 14)에서도 addListener 로 폭 변화를 따라간다', () => {
    let stage = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() { return query === TOUR_STAGE_QUERY ? stage : false; },
      media: query,
      addListener: (fn: () => void) => listeners.add(fn),
      removeListener: (fn: () => void) => listeners.delete(fn),
    }));
    const root = mount(html);
    const stop = startLandingMotion(root);
    const tour = root.querySelector<HTMLElement>('[data-tour]')!;
    expect(tour.dataset.sync).toBeUndefined();

    stage = true;
    listeners.forEach((fn) => fn());
    fire(root.querySelector('#s1')!, true);
    expect(root.querySelector<HTMLElement>('#s1')!.dataset.on).toBe('true');

    stop();
    expect(listeners.size).toBe(0);
  });

  it('sticky 폰이 없는 창에서는 스텝을 동기화하지 않는다', () => {
    stubMedia(false, false);
    const root = mount(html);
    startLandingMotion(root);
    expect(root.querySelector<HTMLElement>('[data-tour]')!.dataset.sync).toBeUndefined();
    fire(root.querySelector('#s1')!, true);
    expect(root.querySelector<HTMLElement>('#s1')!.dataset.on).toBe('false');
  });
});

describe('startLandingMotion — 페이지 내 앵커', () => {
  it('앵커를 누른 동안에만 html 에 부드러운 스크롤 표시를 달고, 정리하면 떼어낸다', () => {
    vi.useFakeTimers();
    stubMedia(false);
    const root = mount('<a href="#why" id="link">왜 팀밋</a><a href="/login" id="out">로그인</a><section id="why"></section>');
    const stop = startLandingMotion(root);
    const html = document.documentElement;

    root.querySelector<HTMLElement>('#out')!.click();
    expect(html.dataset.landingSmooth).toBeUndefined();

    root.querySelector<HTMLElement>('#link')!.click();
    expect(html.dataset.landingSmooth).toBe('');
    window.dispatchEvent(new Event('scrollend'));
    expect(html.dataset.landingSmooth).toBeUndefined();

    root.querySelector<HTMLElement>('#link')!.click();
    vi.advanceTimersByTime(2000); // scrollend 가 오지 않아도 상한 뒤엔 꺼진다
    expect(html.dataset.landingSmooth).toBeUndefined();

    stop();
    root.querySelector<HTMLElement>('#link')!.click();
    expect(html.dataset.landingSmooth).toBeUndefined();
  });
});
