import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteProgressBar } from './route-progress';

// motion-audit 그룹3(F1 subtab) — kind==='tab' 클릭(하단탭·데스크톱 상단탭·화면 안
// 세부탭)에서 진행바가 켜지면 안 된다. globals.css 의 `:root[data-nav-kind='tab']` 이
// 이미 "탭 전환은 동위 전환이라 콘텐츠 애니메이션이 없다"를 확정했는데, 진행바만 그
// 원칙을 모르고 kind 를 무시한 채(onIntent: () => start()) 모든 내부 네비게이션에서
// 켜졌었다 — 그 결과 탭을 눌렀는데 콘텐츠는 안 바뀌고 얇은 바만 도는 상태가 최대
// ~1s 지속됐다(evidence-pack timelineMs). usePathname mock 은 항상 같은 값을 반환해
// "완료" 트리거(pathname 변화)가 켜지지 않게 해 active 상태만 관찰한다.
const route = vi.hoisted(() => ({ pathname: '/tournaments', search: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}));
beforeEach(() => {
  route.pathname = '/tournaments';
  route.search = '';
  window.history.replaceState({}, '', '/tournaments');
});

function clickAnchor(markup: string, href: string) {
  const host = document.createElement('div');
  host.innerHTML = markup;
  document.body.appendChild(host);
  const anchor = host.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
  if (!anchor) throw new Error(`앵커를 못 찾았다: ${href}`);
  // start()가 useState 를 건드리므로 act()로 감싸 리렌더를 동기적으로 flush 한다 —
  // 안 그러면 진행바가 실제로는 켜졌는데도(다음 tick에야 반영) 이 테스트에서 null 로 보인다.
  act(() => {
    anchor.addEventListener('click', (event) => event.preventDefault());
    anchor.click();
  });
  return host;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('RouteProgressBar — kind별 진행바 발화', () => {
  it("kind='tab' 링크(세부 탭) 클릭에서는 진행바가 뜨지 않는다", () => {
    const { container } = render(<RouteProgressBar />);

    clickAnchor(
      '<nav class="tm-segmented-tabs"><a class="tm-segmented-tab" href="/tournaments?kind=league">리그</a></nav>',
      '/tournaments?kind=league',
    );

    expect(container.querySelector('.tm-route-progress')).toBeNull();
  });

  it("kind='push' 링크(탭 밖 일반 링크) 클릭에서는 진행바가 뜬다", () => {
    const { container } = render(<RouteProgressBar />);

    clickAnchor('<div><a href="/tournaments/1">대회 상세</a></div>', '/tournaments/1');

    expect(container.querySelector('.tm-route-progress')).not.toBeNull();
  });

  it("kind='search' 링크(같은 pathname 의 쿼리만 변경 — 필터 시트) 클릭에서는 진행바가 뜨지 않는다", () => {
    window.history.replaceState(null, '', '/tournaments');
    const { container } = render(<RouteProgressBar />);

    clickAnchor('<div><a href="/tournaments?filter=1" aria-label="필터 열기">필터</a></div>', '/tournaments?filter=1');

    expect(container.querySelector('.tm-route-progress')).toBeNull();
  });

  it("kind='tab' 링크(하단 탭) 클릭에서도 진행바가 뜨지 않는다", () => {
    const { container } = render(<RouteProgressBar />);

    clickAnchor('<nav class="tm-bottom-nav"><a class="tm-bottom-tab" href="/teams">팀</a></nav>', '/teams');

    expect(container.querySelector('.tm-route-progress')).toBeNull();
  });
});

describe('RouteProgressBar navigation lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    route.pathname = '/teams';
    route.search = 'sport=futsal';
    window.history.replaceState({}, '', '/teams?sport=futsal');
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function view() {
    return <><RouteProgressBar /><a data-nav-back="true" href="/teams?sport=basketball" onClick={(e) => e.preventDefault()}>Change sport</a></>;
  }

  it('ends the bar when only the query commits, without waiting for the 8-second timeout', () => {
    const result = render(view());
    fireEvent.click(result.getByText('Change sport'));
    expect(result.container.querySelector('.tm-route-progress')).not.toBeNull();
    route.search = 'sport=basketball';
    result.rerender(view());
    act(() => vi.advanceTimersByTime(260));
    expect(result.container.querySelector('.tm-route-progress')).toBeNull();
  });

  it('keeps progress visible until a different pathname commits', () => {
    const result = render(view());
    act(() => {
      window.history.replaceState({}, '', '/tournaments');
      window.dispatchEvent(new PopStateEvent('popstate'));
      vi.advanceTimersByTime(500);
    });
    expect(result.container.querySelector('.tm-route-progress')).not.toBeNull();
    route.pathname = '/tournaments';
    route.search = '';
    result.rerender(view());
    act(() => vi.advanceTimersByTime(260));
    expect(result.container.querySelector('.tm-route-progress')).toBeNull();
  });

  it('does not start a loading bar for modified link clicks', () => {
    const result = render(view());
    fireEvent.click(result.getByText('Change sport'), { ctrlKey: true });
    expect(result.container.querySelector('.tm-route-progress')).toBeNull();
  });

  it('cleans up pending navigation timers when unmounted', () => {
    const result = render(view());
    fireEvent.click(result.getByText('Change sport'));
    result.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
