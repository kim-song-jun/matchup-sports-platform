/**
 * Admin drawer + command palette against real window.history (alpha E2E findings O3 / O7).
 * - ESC closes only the topmost overlay (drawer below, palette on top).
 * - A drawer nav link leaves no overlay marker behind, so forward after a cross-document return is not dead.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNavigationHistoryForTests } from '@/lib/navigation-history';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { currentPath, settleHistory } from '@/test/history-router';
import { NavigationHistoryTracker } from '@/components/v1-ui/navigation-history-tracker';
import { AdminShell } from './admin-shell';

const nav = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const router = {
    push: (url: string) => {
      window.history.pushState({ __NA: true }, '', url);
      notify();
    },
    replace: (url: string) => {
      window.history.replaceState({ __NA: true }, '', url);
      notify();
    },
  };
  return { listeners, notify, router };
});

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  const subscribe = (listener: () => void) => {
    nav.listeners.add(listener);
    window.addEventListener('popstate', listener);
    return () => {
      nav.listeners.delete(listener);
      window.removeEventListener('popstate', listener);
    };
  };
  return {
    usePathname: () => useSyncExternalStore(subscribe, () => window.location.pathname),
    useRouter: () => nav.router,
  };
});

// Next Link: onClick first, then push (or replace) unless the handler prevented it.
vi.mock('next/link', () => ({
  default: ({ href, onClick, replace, children, prefetch: _prefetch, scroll: _scroll, ...rest }: Record<string, unknown>) => (
    <a
      href={href as string}
      {...rest}
      onClick={(event) => {
        (onClick as ((event: unknown) => void) | undefined)?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        (replace ? nav.router.replace : nav.router.push)(href as string);
      }}
    >
      {children as React.ReactNode}
    </a>
  ),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminInquiriesPendingCount: () => ({ data: { count: 0 } }),
  useV1AdminGlobalSearch: () => ({ data: undefined, isFetching: false }),
}));

function resetModules() {
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
}

beforeEach(() => {
  resetModules();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/landing');
});
afterEach(() => {
  resetModules();
});

const renderAdmin = () =>
  render(
    <>
      <NavigationHistoryTracker />
      <AdminShell>
        <div>content</div>
      </AdminShell>
    </>,
  );
const openDrawer = () => fireEvent.click(screen.getByRole('button', { name: '메뉴 열기' }));
const drawer = () => screen.queryByRole('dialog', { name: '관리자 메뉴' });
const palette = () => screen.queryByRole('dialog', { name: '전역 검색' });
const traverse = async (go: () => void) => {
  await act(async () => {
    go();
    await settleHistory();
  });
};

describe('Admin overlays — ESC', () => {
  it('drawer + palette open: ESC closes only the palette, a second ESC closes the drawer', async () => {
    window.history.pushState({}, '', '/admin/users');
    renderAdmin();
    openDrawer();
    act(() => {
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    });
    expect(drawer()).not.toBeNull();
    expect(palette()).not.toBeNull();

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(palette()).toBeNull();
    expect(drawer()).not.toBeNull();

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(drawer()).toBeNull();
  });
});

describe('Admin drawer nav link — no leftover marker', () => {
  it('drawer → 팀, back ×2, forward ×2 reaches /admin/teams even across a document reload', async () => {
    window.history.pushState({}, '', '/admin');
    const firstDocument = renderAdmin();
    openDrawer();
    await act(async () => {
      fireEvent.click(within(drawer()!).getByRole('link', { name: '팀' }));
      await settleHistory();
    });
    expect(currentPath()).toBe('/admin/teams');
    expect(drawer()).toBeNull();

    await traverse(() => window.history.back());
    expect(currentPath()).toBe('/admin');
    await traverse(() => window.history.back());
    expect(currentPath()).toBe('/landing');
    await traverse(() => window.history.forward());
    expect(currentPath()).toBe('/admin');

    // On alpha /landing → /admin is a cross-document forward: /admin boots as a fresh document.
    firstDocument.unmount();
    resetModules();
    renderAdmin();

    await traverse(() => window.history.forward());
    expect(currentPath()).toBe('/admin/teams');
  });
});
