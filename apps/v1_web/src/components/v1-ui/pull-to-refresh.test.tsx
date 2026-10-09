import { useRef } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/home', refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ refresh: nav.refresh }),
}));

import { PullToRefresh } from './pull-to-refresh';

let fetchCount = 0;

function Probe() {
  useQuery({
    queryKey: ['probe'],
    queryFn: async () => ++fetchCount,
    staleTime: Infinity,
  });
  return <p>목록</p>;
}

function Harness({ children }: { children?: React.ReactNode }) {
  const areaRef = useRef<HTMLElement>(null);
  return (
    <>
      <PullToRefresh areaRef={areaRef} />
      <main ref={areaRef} className="tm-scroll-area">
        <Probe />
        {children}
      </main>
    </>
  );
}

function mount(children?: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <Harness>{children}</Harness>
    </QueryClientProvider>,
  );
  return { area: view.container.querySelector('main') as HTMLElement, ...view };
}

function touch(target: Element, type: string, points: Array<[number, number]>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', {
    value: points.map(([clientX, clientY]) => ({ clientX, clientY })),
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

/** 손가락 하나가 (x, y0) 에서 시작해 y 좌표들을 차례로 지나 떼진다. */
function drag(area: Element, ys: number[], x = 100) {
  touch(area, 'touchstart', [[x, ys[0]]]);
  for (const y of ys.slice(1)) touch(area, 'touchmove', [[x, y]]);
  touch(area, 'touchend', []);
}

// 슬롭을 넘긴 뒤 140px 이동 -> 저항 0.5 로 70px (임계 64px 초과)
const PAST_THRESHOLD = [100, 110, 250];
// 슬롭을 넘긴 뒤 60px 이동 -> 30px (임계 미달)
const SHORT_OF_THRESHOLD = [100, 110, 170];

async function settledFetchCount(expected: number) {
  await waitFor(() => expect(fetchCount).toBe(expected));
}

beforeEach(() => {
  fetchCount = 0;
  nav.pathname = '/home';
  nav.refresh.mockClear();
  window.TeameetNative = { postMessage: () => undefined };
});

afterEach(() => {
  delete window.TeameetNative;
  document.body.innerHTML = '';
});

describe('PullToRefresh', () => {
  it('앱 셸에서 맨 위에서 임계를 넘겨 놓으면 활성 쿼리를 한 번 다시 받고 서버 데이터도 갱신한다', async () => {
    const { area } = mount();
    await settledFetchCount(1);

    drag(area, PAST_THRESHOLD);

    await settledFetchCount(2);
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(area.dataset.ptr).toBeUndefined());
  });

  it('임계 전에 놓으면 다시 받지 않고 원위치로 돌아간다', async () => {
    const { area } = mount();
    await settledFetchCount(1);

    drag(area, SHORT_OF_THRESHOLD);

    await waitFor(() => expect(area.dataset.ptr).toBeUndefined());
    expect(fetchCount).toBe(1);
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it('스크롤이 내려가 있는 상태에서 시작하면 반응하지 않는다', async () => {
    const { area } = mount();
    await settledFetchCount(1);
    Object.defineProperty(area, 'scrollTop', { value: 120, configurable: true });

    const start = touch(area, 'touchstart', [[100, 100]]);
    const move = touch(area, 'touchmove', [[100, 250]]);
    touch(area, 'touchend', []);

    expect(move.defaultPrevented).toBe(false);
    expect(start.defaultPrevented).toBe(false);
    expect(area.dataset.ptr).toBeUndefined();
    expect(fetchCount).toBe(1);
  });

  it('가로가 우세한 스와이프는 가로채지 않는다', async () => {
    const { area } = mount();
    await settledFetchCount(1);

    touch(area, 'touchstart', [[100, 100]]);
    const move = touch(area, 'touchmove', [[260, 150]]);
    touch(area, 'touchend', []);

    expect(move.defaultPrevented).toBe(false);
    expect(area.dataset.ptr).toBeUndefined();
    expect(fetchCount).toBe(1);
  });

  it('당기는 동안에는 기본 동작(고무줄 튕김)을 막는다', async () => {
    const { area } = mount();
    touch(area, 'touchstart', [[100, 100]]);
    touch(area, 'touchmove', [[100, 110]]);
    const move = touch(area, 'touchmove', [[100, 200]]);
    expect(move.defaultPrevented).toBe(true);
    expect(area.dataset.ptr).toBe('pull');
    touch(area, 'touchend', []);
  });

  it.each(['/chat/room1', '/admin/users', '/tournament-ops/tournaments/t1/operations', '/matches/new'])(
    '제외 라우트 %s 에서는 반응하지 않는다',
    async (path) => {
      nav.pathname = path;
      const { area } = mount();
      await settledFetchCount(1);

      drag(area, PAST_THRESHOLD);

      expect(area.dataset.ptr).toBeUndefined();
      expect(fetchCount).toBe(1);
    },
  );

  it('열린 모달이 있으면 반응하지 않는다', async () => {
    const { area } = mount();
    await settledFetchCount(1);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(dialog);

    drag(area, PAST_THRESHOLD);

    expect(area.dataset.ptr).toBeUndefined();
    expect(fetchCount).toBe(1);
  });

  // 매치·팀 상세처럼 하단 고정 CTA 가 있는 화면이 대부분이라, 그 화면에서도 새로고침돼야 한다.
  it('하단 고정 CTA 가 있는 화면에서도 새로고침한다', async () => {
    const { area } = mount(<div className="tm-fixed-cta" style={{ position: 'fixed', bottom: 0 }}><button>신청하기</button></div>);
    await settledFetchCount(1);

    drag(area, PAST_THRESHOLD);

    await settledFetchCount(2);
  });

  it('안쪽 스크롤러가 이미 내려가 있으면 그 스크롤이 우선이다', async () => {
    const { area } = mount(<div data-testid="inner"><span>줄</span></div>);
    await settledFetchCount(1);
    const inner = area.querySelector('[data-testid="inner"]') as HTMLElement;
    Object.defineProperty(inner, 'scrollTop', { value: 30, configurable: true });

    touch(inner.firstElementChild as Element, 'touchstart', [[100, 100]]);
    const move = touch(inner.firstElementChild as Element, 'touchmove', [[100, 250]]);
    touch(area, 'touchend', []);

    expect(move.defaultPrevented).toBe(false);
    expect(fetchCount).toBe(1);
  });

  it('앱 셸이 아니면 아무것도 붙이지 않는다', async () => {
    delete window.TeameetNative;
    const { area, container } = mount();
    await settledFetchCount(1);

    drag(area, PAST_THRESHOLD);

    expect(container.querySelector('.tm-ptr')).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(area.dataset.ptr).toBeUndefined();
    expect(fetchCount).toBe(1);
  });

  it('새로고침 중에 다시 당겨도 무시하고 끝나면 원위치로 돌아간다', async () => {
    const { area, container } = mount();
    await settledFetchCount(1);

    drag(area, PAST_THRESHOLD);
    expect(container.querySelector('.tm-ptr')?.getAttribute('data-state')).toBe('refreshing');
    expect(container.querySelector('[role="status"]')?.textContent).toBe('새로고침 중이에요');
    drag(area, PAST_THRESHOLD);

    await waitFor(() => expect(area.dataset.ptr).toBeUndefined());
    expect(fetchCount).toBe(2);
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]')?.textContent).toBe('');
  });
});
