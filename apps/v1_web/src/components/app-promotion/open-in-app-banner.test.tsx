import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/home' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
}));

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';

type W = Window & { webkit?: unknown };
const KEY = 'teameet:v1:open-in-app:hidden-until';
const DAY_MS = 24 * 60 * 60 * 1000;
const STORE_URL = 'https://apps.apple.com/kr/app/id6809736050';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=kr.co.teameet';
const NOW = new Date('2026-11-07T03:00:00.000Z').getTime();

function setUa(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

// 모듈 수준 메모리 플래그가 테스트 간에 새지 않도록 매번 새로 불러온다.
async function mount() {
  vi.resetModules();
  const { OpenInAppBanner } = await import('./open-in-app-banner');
  return render(<OpenInAppBanner placement="shell" />);
}

const banner = () => screen.queryByRole('region', { name: '팀밋 앱으로 열기' });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(NOW);
  nav.pathname = '/home';
  setUa(IPHONE_UA);
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (window as W).webkit;
  delete window.TeameetNative;
});

describe('OpenInAppBanner', () => {
  it.each([
    ['iPhone Safari', IPHONE_UA, STORE_URL],
    ['Android Chrome', ANDROID_UA, PLAY_STORE_URL],
  ])('%s 에서 마운트 직후 해당 스토어 링크와 앱 아이콘이 있는 배너를 보여 준다', async (_label, ua, storeUrl) => {
    setUa(ua);
    await mount();

    // 검색 결과는 실제 대회·리그 내용을 요약해야 한다. 설치 안내는 여전히 사용자에게 보인다.
    expect(banner()).toHaveAttribute('data-nosnippet');
    expect(screen.getByRole('link', { name: '앱으로 열기' }).getAttribute('href')).toBe(storeUrl);
    expect(document.querySelector('img')?.getAttribute('src')).toBe('/brand/icon-192.png');
    // 화면을 막는 모달이 아니다 — 포커스를 가져가거나 가두지 않는다.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body).toHaveFocus();
  });

  it('네이티브 셸 안에서는 보이지 않는다', async () => {
    (window as W).webkit = { messageHandlers: { TeameetNative: { postMessage() {} } } };
    await mount();
    expect(banner()).toBeNull();
  });

  it('Android 네이티브 셸 안에서는 보이지 않는다', async () => {
    setUa(ANDROID_UA);
    window.TeameetNative = { postMessage() {} };
    await mount();
    expect(banner()).toBeNull();
  });

  it('데스크톱 UA 에서는 보이지 않는다', async () => {
    setUa(DESKTOP_UA);
    await mount();
    expect(banner()).toBeNull();
  });

  it.each(['/admin/users', '/auth/callback', '/tournament-ops/abc', '/onboarding'])(
    '제외 경로 %s 에서는 보이지 않는다',
    async (path) => {
      nav.pathname = path;
      await mount();
      expect(banner()).toBeNull();
    },
  );

  it('제외 경로로 이동하면 사라지고 다시 돌아오면 다시 보인다', async () => {
    const view = await mount();
    expect(banner()).not.toBeNull();

    nav.pathname = '/login';
    const { OpenInAppBanner } = await import('./open-in-app-banner');
    view.rerender(<OpenInAppBanner placement="shell" />);
    expect(banner()).toBeNull();

    nav.pathname = '/tournaments';
    view.rerender(<OpenInAppBanner placement="shell" />);
    expect(banner()).not.toBeNull();
  });

  it.each([['iPhone', IPHONE_UA], ['Android', ANDROID_UA]])('%s: 닫으면 7일 동안 다시 마운트해도 보이지 않는다', async (_label, ua) => {
    setUa(ua);
    const first = await mount();
    fireEvent.click(screen.getByRole('button', { name: '앱 안내 닫기' }));

    expect(banner()).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBe(String(NOW + 7 * DAY_MS));
    first.unmount();

    // 링크마다 새 웹뷰가 열려도(저장소는 유지) 7일 안에는 다시 뜨지 않는다.
    vi.setSystemTime(NOW + 7 * DAY_MS - 1);
    const second = await mount();
    expect(banner()).toBeNull();
    second.unmount();

    vi.setSystemTime(NOW + 7 * DAY_MS + 1);
    await mount();
    expect(banner()).not.toBeNull();
  });

  it.each([['iPhone', IPHONE_UA], ['Android', ANDROID_UA]])('%s: 앱으로 열기를 누르면 스토어 이동 뒤 배너를 치우고 7일 동안 숨긴다', async (_label, ua) => {
    setUa(ua);
    await mount();
    const link = screen.getByRole('link', { name: '앱으로 열기' });
    link.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(link);

    expect(window.localStorage.getItem(KEY)).toBe(String(NOW + 7 * DAY_MS));
    // 링크 이동이 시작되기 전에는 앵커를 떼지 않는다.
    expect(screen.getByRole('link', { name: '앱으로 열기' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(banner()).toBeNull();
  });

  it.each([
    ['숫자가 아닌 값', 'abc'],
    ['이미 지난 시각', String(NOW - 1)],
    ['숨김 기간보다 먼 미래(기기 시계가 어긋난 값)', String(NOW + 365 * DAY_MS)],
  ])('저장된 숨김 시각이 %s 이면 무시하고 배너를 보여 준다', async (_label, stored) => {
    window.localStorage.setItem(KEY, stored);
    await mount();
    expect(banner()).not.toBeNull();
  });

  it('localStorage 가 예외를 던져도 같은 페이지 수명에서는 다시 보이지 않는다', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.resetModules();
    const { OpenInAppBanner } = await import('./open-in-app-banner');
    const first = render(<OpenInAppBanner placement="shell" />);
    expect(banner()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '앱 안내 닫기' }));
    expect(banner()).toBeNull();
    first.unmount();

    render(<OpenInAppBanner placement="shell" />);
    expect(banner()).toBeNull();
  });
});
