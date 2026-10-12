/**
 * 하단 탭으로 돌아오면 **보던 자리**로 돌아간다.
 *
 * iOS 탭바·안드로이드 하단 내비는 탭마다 스크롤 위치를 들고 있다. 이 앱은 탭 클릭을
 * 'push'(새 화면 진입)로 분류해 매번 맨 위로 되돌리고 있었고, alpha 실측에서 그게
 * "새로고침당한" 체감의 원인이었다 — 대회 목록을 500px 굴려 놓고 팀 탭에 갔다
 * 돌아오면 0px 였다.
 *
 * 이 테스트가 잡는 버그: 탭 클릭이 다시 'push' 로 분류되어 스크롤이 초기화되는 것.
 * 그리고 그 반대 방향도 함께 고정한다 — **일반 링크는 여전히 맨 위에서 시작해야 한다**
 * (탭과 링크를 뭉뚱그려 전부 복원하면 새 화면이 중간부터 보이는 다른 버그가 된다).
 */
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveScrollPosition } from '@/lib/scroll-positions';

const nav = vi.hoisted(() => ({ pathname: '/tournaments' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));
vi.mock('@/lib/session-storage', () => ({
  getCurrentRedirectPath: () => `${nav.pathname}${window.location.search}${window.location.hash}`,
}));

import { ScrollRestoration } from './scroll-restoration';

/** `.tm-scroll-area` 를 실제 스크롤러처럼 세운다 — 이 앱의 모바일 스크롤러는 window 가 아니다. */
function mountScrollArea(scrollHeight: number, clientHeight = 800) {
  const area = document.createElement('main');
  area.className = 'tm-scroll-area';
  Object.defineProperty(area, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(area, 'clientHeight', { value: clientHeight, configurable: true });
  area.scrollTop = 0;
  document.body.appendChild(area);
  return area;
}

/** 실제 셸이 그리는 마크업과 같은 클래스를 쓴다 — 셀렉터가 어긋나면 이 테스트가 무의미해진다. */
function anchor(className: string, href: string) {
  const a = document.createElement('a');
  a.className = className;
  a.setAttribute('href', href);
  document.body.appendChild(a);
  return a;
}

function targetAt(area: HTMLElement, id: string, offsetTop: number) {
  const target = document.createElement('section');
  target.id = id;
  Object.defineProperty(target, 'offsetTop', { value: offsetTop });
  target.scrollIntoView = vi.fn(() => { area.scrollTop = target.offsetTop; });
  return target;
}

function clickThen(el: HTMLElement, nextPath: string, rerender: () => void) {
  document.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a')) event.preventDefault();
  }, { once: true });
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  nav.pathname = nextPath;
  rerender();
}

describe('ScrollRestoration — 탭으로 돌아오면 보던 자리로', () => {
  beforeEach(() => {
    nav.pathname = '/tournaments';
    window.history.replaceState(null, '', '/tournaments');
    window.sessionStorage.clear();
    document.body.innerHTML = '';
    // jsdom 에는 ResizeObserver 가 없다. 높이가 이미 충분한 케이스만 쓰므로
    // observe 가 불릴 일은 없지만, 생성자 부재로 죽지 않게 최소 스텁만 둔다.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('하단 탭을 눌러 돌아오면 저장된 위치로 복원한다', () => {
    const area = mountScrollArea(5000);
    saveScrollPosition('/tournaments', 500);

    nav.pathname = '/teams';
    const view = render(<ScrollRestoration />);

    const tab = anchor('tm-bottom-tab', '/tournaments');
    clickThen(tab, '/tournaments', () => view.rerender(<ScrollRestoration />));

    expect(area.scrollTop).toBe(500);
  });

  it('데스크톱 상단 탭도 같게 동작한다', () => {
    const area = mountScrollArea(5000);
    saveScrollPosition('/tournaments', 320);

    nav.pathname = '/teams';
    const view = render(<ScrollRestoration />);

    const tab = anchor('tm-desktop-nav-tab', '/tournaments');
    clickThen(tab, '/tournaments', () => view.rerender(<ScrollRestoration />));

    expect(area.scrollTop).toBe(320);
  });

  it('일반 링크(카드 클릭)는 여전히 맨 위에서 시작한다', () => {
    const area = mountScrollArea(5000);
    saveScrollPosition('/tournaments', 500);
    area.scrollTop = 500;

    nav.pathname = '/teams';
    const view = render(<ScrollRestoration />);

    // 탭이 아닌 평범한 카드 링크 — 새 화면 진입이므로 복원하면 안 된다.
    const card = anchor('tm-card-link', '/tournaments');
    clickThen(card, '/tournaments', () => view.rerender(<ScrollRestoration />));

    expect(area.scrollTop).toBe(0);
  });

  it('초기 URL fragment가 있으면 실제 target으로 이동한다', () => {
    nav.pathname = '/landing';
    window.history.replaceState(null, '', '/landing#business-info');
    const area = mountScrollArea(5000);
    const target = targetAt(area, 'business-info', 1200);
    area.appendChild(target);

    render(<ScrollRestoration />);

    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(area.scrollTop).toBe(1200);
  });

  it('fragment target이 뒤늦게 렌더되면 해당 요소가 생긴 뒤 이동한다', async () => {
    nav.pathname = '/landing';
    window.history.replaceState(null, '', '/landing#business-info');
    const area = mountScrollArea(5000);
    const view = render(<ScrollRestoration />);
    const target = targetAt(area, 'business-info', 1350);

    area.appendChild(target);

    await waitFor(() => expect(target.scrollIntoView).toHaveBeenCalledTimes(1));
    expect(area.scrollTop).toBe(1350);
    view.unmount();
  });

  it('기다림 상한이 지나면 없는 target 감시를 끝내고 나중에 생겨도 스크롤하지 않는다', async () => {
    vi.useFakeTimers();
    let unmount = () => {};
    try {
      nav.pathname = '/landing';
      window.history.replaceState(null, '', '/landing#business-info');
      const area = mountScrollArea(5000);
      const view = render(<ScrollRestoration />);
      unmount = view.unmount;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      const target = targetAt(area, 'business-info', 1350);
      await act(async () => {
        area.appendChild(target);
        await Promise.resolve();
      });

      expect(target.scrollIntoView).not.toHaveBeenCalled();
      expect(area.scrollTop).toBe(0);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('same-path pushState로 hash가 바뀌면 대기 중인 이전 target을 스크롤하지 않는다', async () => {
    nav.pathname = '/landing';
    window.history.replaceState(null, '', '/landing#business-info');
    const area = mountScrollArea(5000);
    render(<ScrollRestoration />);
    const staleTarget = targetAt(area, 'business-info', 1400);

    window.history.pushState(null, '', '/landing#other');
    await act(async () => {
      area.appendChild(staleTarget);
      await Promise.resolve();
    });

    expect(staleTarget.scrollIntoView).not.toHaveBeenCalled();
    expect(area.scrollTop).toBe(0);
  });

  it.each(['route departure', 'unmount'])('missing fragment observer stops after %s', async (exit) => {
    nav.pathname = '/landing';
    window.history.replaceState(null, '', '/landing#business-info');
    mountScrollArea(5000);
    const view = render(<ScrollRestoration />);
    const target = document.createElement('section');
    target.id = 'business-info';
    target.scrollIntoView = vi.fn();

    if (exit === 'route departure') {
      window.history.replaceState(null, '', '/login');
      nav.pathname = '/login';
      view.rerender(<ScrollRestoration />);
    } else {
      view.unmount();
    }

    await act(async () => {
      document.body.appendChild(target);
      await Promise.resolve();
    });

    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });

  it('fragment 링크의 pathname 전환은 target 이동을 보존한다', () => {
    const area = mountScrollArea(5000);
    area.scrollTop = 460;
    nav.pathname = '/login';
    window.history.replaceState(null, '', '/login');
    const view = render(<ScrollRestoration />);
    const target = targetAt(area, 'business-info', 950);
    area.appendChild(target);

    const link = anchor('tm-card-link', '/landing#business-info');
    document.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('a')) event.preventDefault();
    }, { once: true });
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    window.history.replaceState(null, '', '/landing#business-info');
    nav.pathname = '/landing';
    view.rerender(<ScrollRestoration />);

    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(area.scrollTop).toBe(950);
  });

  it('그 탭에 처음 들어가면(저장된 값 없음) 맨 위 그대로 둔다', () => {
    const area = mountScrollArea(5000);
    nav.pathname = '/teams';
    const view = render(<ScrollRestoration />);

    const tab = anchor('tm-bottom-tab', '/tournaments');
    clickThen(tab, '/tournaments', () => view.rerender(<ScrollRestoration />));

    expect(area.scrollTop).toBe(0);
  });
});

// 헤더 뒤로가기(‹)와 하드웨어 뒤로가 같은 "뒤로"로 분류돼야 보던 자리로 돌아간다.
// 전에는 이 클릭이 'push' 로 잡혀 목록이 매번 맨 위에서 시작했다.
describe('ScrollRestoration — 예전 방문의 위치가 남지 않는다', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/tournaments');
    window.sessionStorage.clear();
    document.body.innerHTML = '';
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  // alpha 실측: 목록을 새로 열어 맨 위에서 상세로 갔다 헤더 뒤로가기로 오면 예전 방문의 1500 으로 튀었다.
  it('새로 들어와 맨 위에서 떠난 목록은 뒤로 돌아와도 맨 위다', () => {
    const area = mountScrollArea(5000);
    saveScrollPosition('/teams', 1500);
    nav.pathname = '/home';
    const view = render(<ScrollRestoration />);
    const rerender = () => view.rerender(<ScrollRestoration />);

    clickThen(anchor('tm-card-link', '/teams'), '/teams', rerender);
    expect(area.scrollTop).toBe(0);
    clickThen(anchor('tm-card-link', '/teams/t1'), '/teams/t1', rerender);
    const back = anchor('tm-btn', '/teams');
    back.dataset.navBack = 'true';
    clickThen(back, '/teams', rerender);

    expect(area.scrollTop).toBe(0);
  });

  it('처음 연 화면도 지금 위치를 기록해 예전 값을 덮는다', () => {
    const area = mountScrollArea(5000);
    saveScrollPosition('/teams', 1500);
    nav.pathname = '/teams';
    const view = render(<ScrollRestoration />);
    const rerender = () => view.rerender(<ScrollRestoration />);

    clickThen(anchor('tm-card-link', '/teams/t1'), '/teams/t1', rerender);
    const back = anchor('tm-btn', '/teams');
    back.dataset.navBack = 'true';
    clickThen(back, '/teams', rerender);

    expect(area.scrollTop).toBe(0);
  });
});

describe('ScrollRestoration — 뒤로가기는 보던 자리로', () => {
  beforeEach(() => {
    nav.pathname = '/tournaments';
    window.history.replaceState(null, '', '/tournaments');
    window.sessionStorage.clear();
    document.body.innerHTML = '';
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('헤더 뒤로가기(data-nav-back) 클릭은 저장된 위치로 복원한다', () => {
    const area = mountScrollArea(5000);
    saveScrollPosition('/tournaments', 640);
    nav.pathname = '/tournaments/7';
    const view = render(<ScrollRestoration />);

    const backLink = anchor('tm-btn', '/tournaments');
    backLink.dataset.navBack = 'true';
    clickThen(backLink, '/tournaments', () => view.rerender(<ScrollRestoration />));

    expect(area.scrollTop).toBe(640);
  });

  it('앱 페이지 이동인 popstate(하드웨어 뒤로)도 복원한다', () => {
    const area = mountScrollArea(5000);
    saveScrollPosition('/tournaments', 410);
    nav.pathname = '/tournaments/7';
    const view = render(<ScrollRestoration />);

    window.dispatchEvent(new PopStateEvent('popstate'));
    nav.pathname = '/tournaments';
    view.rerender(<ScrollRestoration />);

    expect(area.scrollTop).toBe(410);
  });

  it('hash가 있어도 popstate에서는 저장된 위치를 먼저 복원한다', () => {
    const area = mountScrollArea(5000);
    const target = targetAt(area, 'business-info', 1200);
    area.appendChild(target);
    nav.pathname = '/landing/details';
    window.history.replaceState(null, '', '/landing/details');
    const view = render(<ScrollRestoration />);
    saveScrollPosition('/landing#business-info', 410);

    window.dispatchEvent(new PopStateEvent('popstate'));
    window.history.replaceState(null, '', '/landing#business-info');
    nav.pathname = '/landing';
    view.rerender(<ScrollRestoration />);

    expect(area.scrollTop).toBe(410);
    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });
});
