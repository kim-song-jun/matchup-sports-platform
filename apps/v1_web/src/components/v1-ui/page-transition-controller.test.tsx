import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageTransitionController } from './page-transition-controller';

// 이 파일이 지키는 것: **어떤 이동에 View Transition 을 걸지 않는가**.
//
// 같은 pathname 안에서 검색 파라미터만 바뀌는 이동('search')은 template.tsx 가
// 리마운트되지 않아 pending VT 를 resolve 할 신호가 오지 않는다 — 걸어 두면
// MAX_PENDING_MS 동안 old 스냅샷이 정지 화면으로 남는다(Copilot 2차 지적). 그래서
// 컨트롤러는 kind 만 심고 startViewTransition 을 부르지 않아야 한다.

const route = vi.hoisted(() => ({ pathname: '/tournaments' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

function clickAnchor(href: string) {
  const host = document.createElement('div');
  host.innerHTML = `<a href="${href}">이동</a>`;
  document.body.appendChild(host);
  host.querySelector('a')!.addEventListener('click', (event) => event.preventDefault());
  host.querySelector('a')!.click();
}

describe('PageTransitionController — search 이동에는 VT 를 걸지 않는다', () => {
  let startViewTransition: ReturnType<typeof vi.fn>;

  let skipTransition: ReturnType<typeof vi.fn>;
  let updateCallbackDone: Promise<void>;

  beforeEach(() => {
    vi.useFakeTimers();
    route.pathname = '/tournaments';
    skipTransition = vi.fn();
    window.history.replaceState(null, '', '/tournaments');
    startViewTransition = vi.fn((cb: () => Promise<void>) => {
      updateCallbackDone = cb();
      return { skipTransition, ready: Promise.resolve(), finished: updateCallbackDone, updateCallbackDone };
    });
    (document as unknown as { startViewTransition: unknown }).startViewTransition = startViewTransition;
    delete document.documentElement.dataset.navKind;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.body.innerHTML = '';
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
  });

  it('쿼리만 바뀌는 링크(필터 시트 ?filter=1)는 data-nav-kind=search 만 심고 startViewTransition 을 부르지 않는다', () => {
    render(<PageTransitionController />);

    clickAnchor('/tournaments?filter=1');

    expect(document.documentElement.dataset.navKind).toBe('search');
    expect(startViewTransition).not.toHaveBeenCalled();
  });

  it('pathname 이 바뀌는 링크는 그대로 push 로 VT 를 건다(가드가 전부를 막지 않는다)', () => {
    render(<PageTransitionController />);

    clickAnchor('/tournaments/abc');

    expect(document.documentElement.dataset.navKind).toBe('push');
    expect(startViewTransition).toHaveBeenCalledTimes(1);
  });
});


describe('PageTransitionController pending navigation', () => {
  const transitions: Array<{ skipTransition: ReturnType<typeof vi.fn>; done: Promise<void> }> = [];
  beforeEach(() => {
    vi.useFakeTimers();
    route.pathname = '/tournaments';
    window.history.replaceState(null, '', '/tournaments');
    transitions.length = 0;
    document.startViewTransition = vi.fn((callback: () => Promise<void>) => {
      const transition = { skipTransition: vi.fn(), done: callback() };
      transitions.push(transition);
      return { ...transition, ready: Promise.resolve(), finished: transition.done, updateCallbackDone: transition.done };
    }) as unknown as typeof document.startViewTransition;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
    document.body.innerHTML = '';
  });

  it('skips the old-to-old animation when the destination is still pending at 150ms', async () => {
    render(<PageTransitionController />);
    clickAnchor('/tournaments/abc');
    act(() => vi.advanceTimersByTime(150));
    expect(transitions[0].skipTransition).toHaveBeenCalledOnce();
    await expect(transitions[0].done).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows the animation when the destination commits before the deadline', async () => {
    const result = render(<PageTransitionController />);
    clickAnchor('/tournaments/abc');
    route.pathname = '/tournaments/abc';
    result.rerender(<PageTransitionController />);
    await expect(transitions[0].done).resolves.toBeUndefined();
    act(() => vi.advanceTimersByTime(150));
    expect(transitions[0].skipTransition).not.toHaveBeenCalled();
  });

  it('skips and settles a superseded transition when the next intent is query-only', async () => {
    render(<PageTransitionController />);
    clickAnchor('/tournaments/abc');
    clickAnchor('/tournaments?filter=1');
    expect(transitions).toHaveLength(1);
    expect(transitions[0].skipTransition).toHaveBeenCalledOnce();
    await expect(transitions[0].done).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases the pending snapshot and timer on unmount', async () => {
    const result = render(<PageTransitionController />);
    clickAnchor('/tournaments/abc');
    result.unmount();
    expect(transitions[0].skipTransition).toHaveBeenCalledOnce();
    await expect(transitions[0].done).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});

// 래퍼(template.tsx)의 view-transition-name 은 상시로 두면 래퍼가 스태킹 컨텍스트가 되어 페이지 안
// 시트·모달이 셸 아래에 깔린다(W5 alpha 실측). 그래서 이름은 <html data-page-transition> 이 있는
// 동안에만 붙고(globals.css), 그 표시를 언제 달고 떼는지가 이 컨트롤러의 계약이다.
describe('PageTransitionController — 래퍼 이름 표시(data-page-transition)는 전환이 도는 동안에만', () => {
  type Fake = { skipTransition: ReturnType<typeof vi.fn>; finish: () => void; finished: Promise<void>; markAtStart?: string };
  const fakes: Fake[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    route.pathname = '/tournaments';
    window.history.replaceState(null, '', '/tournaments');
    fakes.length = 0;
    delete document.documentElement.dataset.pageTransition;
    document.startViewTransition = vi.fn((callback: () => Promise<void>) => {
      let finish!: () => void;
      const finished = new Promise<void>((resolve) => { finish = resolve; });
      // old 스냅샷은 호출 직후 프레임에 찍힌다 — 그 전에 표시가 붙어 있어야 page-content 로 잡힌다.
      const markAtStart = document.documentElement.dataset.pageTransition;
      const done = callback();
      const fake: Fake = { skipTransition: vi.fn(() => finish()), finish, finished, markAtStart };
      fakes.push(fake);
      return { skipTransition: fake.skipTransition, ready: Promise.resolve(), finished, updateCallbackDone: done };
    }) as unknown as typeof document.startViewTransition;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
    delete document.documentElement.dataset.pageTransition;
    document.body.innerHTML = '';
  });

  it('startViewTransition 을 부르기 전에 표시를 달고, 전환이 끝나면 뗀다', async () => {
    render(<PageTransitionController />);
    clickAnchor('/tournaments/abc');

    expect(fakes[0].markAtStart).toBe('active');
    expect(document.documentElement.dataset.pageTransition).toBe('active');

    fakes[0].finish();
    await fakes[0].finished;
    expect(document.documentElement.dataset.pageTransition).toBeUndefined();
  });

  it('연타로 앞 전환이 skip 돼 끝나도, 뒤 전환이 도는 동안에는 표시를 떼지 않는다', async () => {
    render(<PageTransitionController />);
    clickAnchor('/tournaments/abc');
    clickAnchor('/tournaments/def');

    expect(fakes).toHaveLength(2);
    expect(fakes[0].skipTransition).toHaveBeenCalledOnce();
    await fakes[0].finished;
    expect(document.documentElement.dataset.pageTransition).toBe('active');

    fakes[1].finish();
    await fakes[1].finished;
    expect(document.documentElement.dataset.pageTransition).toBeUndefined();
  });

  it('전환을 걸지 않는 검색 이동에는 표시를 달지 않는다 — 달면 뗄 finished 가 없어 상시로 남는다', () => {
    render(<PageTransitionController />);
    clickAnchor('/tournaments?filter=1');

    expect(document.startViewTransition).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.pageTransition).toBeUndefined();
  });
});
