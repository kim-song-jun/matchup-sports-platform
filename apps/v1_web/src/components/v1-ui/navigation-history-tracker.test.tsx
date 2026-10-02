/**
 * 알림·딥링크로 상세에 바로 들어오면 첫 뒤로가기가 부모 화면에 닿아야 한다(앱 종료·무반응 대신).
 * 부모는 헤더 뒤로가기와 같은 규칙으로 고르고, 하단 탭 루트에는 끼우지 않는다.
 */
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNavigationHistoryForTests } from '@/lib/navigation-history';
import { NavigationHistoryTracker, resolveColdStartParent } from './navigation-history-tracker';

const router = vi.hoisted(() => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function openFreshTab(url: string) {
  __resetNavigationHistoryForTests();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', url);
}

beforeEach(() => router.replace.mockReset());
afterEach(() => __resetNavigationHistoryForTests());

describe('resolveColdStartParent', () => {
  it.each([
    ['출처가 있으면 출처', '/teams/1', '?from=%2Fmy%2Fteams', '/my/teams'],
    ['출처가 없으면 route-chrome 의 backHref', '/teams/1', '', '/teams'],
    ['외부 출처는 버리고 backHref', '/teams/1', '?from=%2F..%2F%2Fevil.example', '/teams'],
    ['하단 탭 루트는 출처가 있어도 없음', '/home', '?from=%2Fteams', null],
    ['루트 탭(팀 목록)', '/teams', '', null],
    ['부모를 알 수 없는 화면', '/team-matches/5', '', null],
  ])('%s', (_label, pathname, search, expected) => {
    expect(resolveColdStartParent(pathname, search)).toBe(expected);
  });
});

function setNativeShell(shell: 'android' | 'ios' | null) {
  const win = window as unknown as Record<string, unknown>;
  delete win.TeameetNative;
  delete win.webkit;
  if (shell === 'android') win.TeameetNative = { postMessage: vi.fn() };
  if (shell === 'ios') win.webkit = { messageHandlers: { TeameetNative: { postMessage: vi.fn() } } };
}
afterEach(() => setNativeShell(null));

describe('NavigationHistoryTracker — 콜드스타트', () => {
  it.each([
    ['앱 셸(Android) · 출처 없음', 'android', '/teams/1', true],
    ['앱 셸(iOS) · 출처 없음', 'ios', '/teams/1', true],
    ['웹 · 앱·알림이 붙인 출처', null, '/teams/1?from=%2Fmy%2Fteams', true],
    ['웹 · 출처 없음(검색 등 외부 진입) — 브라우저 뒤로를 빼앗지 않는다', null, '/teams/1', false],
    ['웹 · 외부 주소 출처는 출처로 치지 않는다', null, '/teams/1?from=%2F..%2F%2Fevil.example', false],
  ] as const)('%s', (_label, shell, url, inserts) => {
    setNativeShell(shell);
    openFreshTab(url);
    const lengthBefore = window.history.length;

    render(<NavigationHistoryTracker />);

    expect(window.history.length).toBe(lengthBefore + (inserts ? 1 : 0));
    expect(`${window.location.pathname}${window.location.search}`).toBe(url);
  });

  it('하단 탭 루트로 열린 탭엔 끼우지 않는다', () => {
    setNativeShell('android');
    openFreshTab('/home?from=%2Fteams');
    const lengthBefore = window.history.length;

    render(<NavigationHistoryTracker />);

    expect(window.history.length).toBe(lengthBefore);
  });
});

/**
 * Next app-router 흉내 — 추적기보다 늦게 붙는 popstate 리스너(state 에 __NA 가 없으면 전체 새로고침)와
 * 인스턴스 pushState/replaceState 패치(state 에 __NA·트리를 채운다). 실제 Next 와 같은 순서로 붙인다.
 */
function installNextAppRouterStub(reload: () => void) {
  const history = window.history as History & Record<string, unknown>;
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  const withTree = (data: unknown) => ({ ...(data as object), __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: 'tree' });
  history.pushState = (data: unknown, unused: string, url?: string | URL | null) => push(withTree(data), unused, url);
  history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => replace(withTree(data), unused, url);
  history.replaceState(history.state, '');
  const onPop = (event: PopStateEvent) => {
    if (!event.state) return;
    if (!event.state.__NA) reload();
  };
  window.addEventListener('popstate', onPop);
  return () => {
    const own = history as unknown as Record<string, unknown>;
    delete own.pushState;
    delete own.replaceState;
    window.removeEventListener('popstate', onPop);
  };
}

describe('콜드스타트 부모 항목 — Next app-router 와 함께', () => {
  it('부모 항목 pop 은 Next 에 닿기 전에 가로채 router.replace(부모) 로 그린다 — 새로고침 없음', async () => {
    setNativeShell('android');
    openFreshTab('/teams/1');
    render(<NavigationHistoryTracker />);
    const reload = vi.fn();
    const uninstall = installNextAppRouterStub(reload);
    try {
      expect(window.history.state).toMatchObject({ __NA: true, __tmIdx: 1 });

      await new Promise((resolve) => {
        window.addEventListener('popstate', resolve, { once: true, capture: true });
        window.history.back();
      });

      expect(window.location.pathname).toBe('/teams');
      expect(reload).not.toHaveBeenCalled();
      expect(router.replace).toHaveBeenCalledWith('/teams');
    } finally {
      uninstall();
    }
  });
});
