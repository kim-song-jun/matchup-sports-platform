import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/home' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';

type W = Window & { webkit?: unknown };
const KEY = 'teameet:v1:open-in-app:dismissed';
const STORE_URL = 'https://apps.apple.com/kr/app/id6809736050';

function setUa(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

// 모듈 수준 메모리 플래그가 테스트 간에 새지 않도록 매번 새로 불러온다.
async function mount() {
  vi.resetModules();
  const { OpenInAppSheet } = await import('./open-in-app-sheet');
  return render(<OpenInAppSheet />);
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  nav.pathname = '/home';
  setUa(IPHONE_UA);
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (window as W).webkit;
});

describe('OpenInAppSheet', () => {
  it('iPhone Safari 에서 1.5초 뒤 열리고 App Store 링크와 앱 아이콘을 보여 준다', async () => {
    await mount();
    advance(1499);
    expect(screen.queryByRole('dialog')).toBeNull();
    advance(1);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('link', { name: '앱으로 열기' }).getAttribute('href')).toBe(STORE_URL);
    expect(document.querySelector('img')?.getAttribute('src')).toBe('/brand/icon-192.png');
  });

  it('네이티브 셸 안에서는 열리지 않는다', async () => {
    (window as W).webkit = { messageHandlers: { TeameetNative: { postMessage() {} } } };
    await mount();
    advance(5000);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([
    ['Android', ANDROID_UA],
    ['데스크톱', DESKTOP_UA],
  ])('%s UA 에서는 열리지 않는다', async (_label, ua) => {
    setUa(ua);
    await mount();
    advance(5000);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each(['/admin/users', '/auth/callback', '/tournament-ops/abc', '/onboarding'])(
    '제외 경로 %s 에서는 열리지 않는다',
    async (path) => {
      nav.pathname = path;
      await mount();
      advance(5000);
      expect(screen.queryByRole('dialog')).toBeNull();
    },
  );

  it('"모바일 웹으로 계속 볼게요" 로 닫으면 기록되고 다시 마운트해도 열리지 않는다', async () => {
    const first = await mount();
    advance(1500);
    fireEvent.click(screen.getByRole('button', { name: '모바일 웹으로 계속 볼게요' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.sessionStorage.getItem(KEY)).toBe('1');
    first.unmount();

    await mount();
    advance(5000);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"앱으로 열기" 클릭도 닫힘으로 기록한다', async () => {
    await mount();
    advance(1500);
    const link = screen.getByRole('link', { name: '앱으로 열기' });
    link.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(link);

    expect(window.sessionStorage.getItem(KEY)).toBe('1');
  });

  it('1.5초가 지나기 전에 제외 경로로 이동하면 열리지 않는다', async () => {
    const view = await mount();
    advance(1000);
    nav.pathname = '/login';
    const { OpenInAppSheet } = await import('./open-in-app-sheet');
    view.rerender(<OpenInAppSheet />);
    advance(5000);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sessionStorage 가 예외를 던져도 같은 페이지 수명에서는 다시 열리지 않는다', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.resetModules();
    const { OpenInAppSheet } = await import('./open-in-app-sheet');
    const first = render(<OpenInAppSheet />);
    advance(1500);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '모바일 웹으로 계속 볼게요' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    first.unmount();

    render(<OpenInAppSheet />);
    advance(5000);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
