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

describe('NavigationHistoryTracker — 콜드스타트', () => {
  it('상세로 바로 열린 탭엔 부모 항목을 한 번 끼운다', () => {
    openFreshTab('/teams/1');
    const lengthBefore = window.history.length;

    render(<NavigationHistoryTracker />);

    expect(window.history.length).toBe(lengthBefore + 1);
    expect(window.location.pathname).toBe('/teams/1');
  });

  it('하단 탭 루트로 열린 탭엔 끼우지 않는다', () => {
    openFreshTab('/home?from=%2Fteams');
    const lengthBefore = window.history.length;

    render(<NavigationHistoryTracker />);

    expect(window.history.length).toBe(lengthBefore);
  });

  it('부모 항목에 도착하면 router.replace 로 부모를 그린다', async () => {
    openFreshTab('/teams/1');
    render(<NavigationHistoryTracker />);

    await new Promise((resolve) => {
      window.addEventListener('popstate', resolve, { once: true, capture: true });
      window.history.back();
    });

    expect(router.replace).toHaveBeenCalledWith('/teams');
  });
});
