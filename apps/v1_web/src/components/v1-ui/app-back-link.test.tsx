import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNavigationHistoryForTests, installNavigationHistory } from '@/lib/navigation-history';
import { AppBackLink } from './app-back-link';

const navigation = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  router: { back: vi.fn(), replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => navigation.searchParams,
  useRouter: () => navigation.router,
}));

beforeEach(() => {
  __resetNavigationHistoryForTests();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/home');
  navigation.searchParams = new URLSearchParams();
  Object.values(navigation.router).forEach((fn) => fn.mockReset());
});
afterEach(() => __resetNavigationHistoryForTests());

describe('AppBackLink', () => {
  it.each([
    ['경로 출처를 따른다', 'from=%2Fmy%2Freviews', '/my/reviews'],
    ['알림 화면 출처를 따른다', 'from=%2Fnotifications', '/notifications'],
    ['출처가 없으면 기본값', '', '/teams'],
    ['외부 주소는 무시하고 기본값', 'from=%2F..%2F%2Fevil.example', '/teams'],
    ['경로가 아닌 표식은 무시하고 기본값', 'from=tournament', '/teams'],
  ])('%s', (_label, query, expected) => {
    navigation.searchParams = new URLSearchParams(query);
    render(<AppBackLink fallbackHref="/teams">뒤로</AppBackLink>);
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', expected);
  });
});

// 헤더 뒤로가기가 push 로 쌓이면 [home, detail, home] 이 되어 하드웨어 뒤로가 detail 로 튄다(핑퐁).
describe('AppBackLink 클릭 — 핑퐁 없는 뒤로가기', () => {
  it('목적지가 바로 앞 앱 항목이면 router.back() — 새 항목을 만들지 않고 스크롤도 복원된다', () => {
    installNavigationHistory();
    window.history.pushState({}, '', '/teams/1?from=%2Fhome');
    navigation.searchParams = new URLSearchParams('from=%2Fhome');
    render(<AppBackLink fallbackHref="/teams">뒤로</AppBackLink>);

    const notPrevented = fireEvent.click(screen.getByRole('link', { name: '뒤로가기' }));

    expect(notPrevented).toBe(false);
    expect(navigation.router.back).toHaveBeenCalledTimes(1);
    expect(navigation.router.replace).not.toHaveBeenCalled();
  });

  it('연타해도 뒤로는 한 번만 — 앞 back 의 pop 이 오기 전의 클릭은 무시한다', () => {
    installNavigationHistory();
    window.history.pushState({}, '', '/teams');
    window.history.pushState({}, '', '/teams/1?from=%2Fteams');
    navigation.searchParams = new URLSearchParams('from=%2Fteams');
    render(<AppBackLink fallbackHref="/teams">뒤로</AppBackLink>);

    const link = screen.getByRole('link', { name: '뒤로가기' });
    fireEvent.click(link);
    fireEvent.click(link);

    expect(navigation.router.back).toHaveBeenCalledTimes(1);
    expect(navigation.router.replace).not.toHaveBeenCalled();
  });

  it('바로 앞 항목이 목적지가 아니면 router.replace(목적지) — 앞으로 중복 항목을 남기지 않는다', () => {
    installNavigationHistory();
    window.history.pushState({}, '', '/tournaments');
    window.history.pushState({}, '', '/teams/1');
    render(<AppBackLink fallbackHref="/teams">뒤로</AppBackLink>);

    fireEvent.click(screen.getByRole('link', { name: '뒤로가기' }));

    expect(navigation.router.replace).toHaveBeenCalledWith('/teams');
    expect(navigation.router.back).not.toHaveBeenCalled();
  });

  it('앱 안 이전 항목이 없는 첫 화면(콜드스타트)도 replace — 앱 밖으로 back 하지 않는다', () => {
    installNavigationHistory();
    render(<AppBackLink fallbackHref="/teams">뒤로</AppBackLink>);

    fireEvent.click(screen.getByRole('link', { name: '뒤로가기' }));

    expect(navigation.router.replace).toHaveBeenCalledWith('/teams');
    expect(navigation.router.back).not.toHaveBeenCalled();
  });

  it.each([['metaKey'], ['ctrlKey'], ['shiftKey'], ['altKey']])('%s 클릭은 가로채지 않는다(새 탭·새 창 열기)', (key) => {
    installNavigationHistory();
    window.history.pushState({}, '', '/teams/1?from=%2Fhome');
    navigation.searchParams = new URLSearchParams('from=%2Fhome');
    render(<AppBackLink fallbackHref="/teams">뒤로</AppBackLink>);

    // React 핸들러(루트 컨테이너) 뒤에 도는 document 리스너에서 기본 동작이 살아 있는지 본다.
    // jsdom 은 앵커 이동을 구현하지 않으므로 확인한 뒤 막는다.
    let preventedByApp: boolean | null = null;
    const observe = (event: MouseEvent) => {
      preventedByApp = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener('click', observe);
    fireEvent.click(screen.getByRole('link', { name: '뒤로가기' }), { [key]: true });
    document.removeEventListener('click', observe);

    expect(preventedByApp).toBe(false);
    expect(navigation.router.back).not.toHaveBeenCalled();
    expect(navigation.router.replace).not.toHaveBeenCalled();
  });
});
