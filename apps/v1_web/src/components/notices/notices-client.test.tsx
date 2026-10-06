import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useState, type MouseEvent, type ReactElement } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1Notice } from '@/types/api';
import { NoticeDetailPageClient, NoticeListPageClient } from './notices-client';

const navigation = vi.hoisted(() => ({
  pathname: '/notices',
  searchParams: new URLSearchParams(),
  navigate: (href: string) => window.history.replaceState(null, '', href),
  replace: vi.fn<(href: string, options?: { scroll?: boolean }) => void>(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => navigation.searchParams,
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace, push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const noticeId = '48cb17a3-3c43-4079-9825-ad13eefe6bae';
const guide: V1Notice = {
  noticeId, title: '서비스 이용 안내', category: '안내',
  publishedAt: '2026-10-05T03:00:00.000Z', body: '서비스 운영 시간을 확인해 주세요.',
};
const update: V1Notice = { ...guide, noticeId: 'update-1', title: '서비스 업데이트', category: '업데이트' };
const server = setupServer(
  http.get('*/api/v1/notices', ({ request }) => {
    const category = new URL(request.url).searchParams.get('category');
    const notices = [guide, update].filter((notice) => !category || notice.category === category);
    return HttpResponse.json({ status: 'success', data: { notices, pageInfo: { hasNextPage: false, nextCursor: null } } });
  }),
  http.get('*/api/v1/notices/:noticeId', () => HttpResponse.json({ status: 'success', data: { notice: guide } })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  navigation.pathname = '/notices';
  navigation.searchParams = new URLSearchParams();
  navigation.navigate = (href) => window.history.replaceState(null, '', href);
  navigation.replace.mockReset();
  navigation.replace.mockImplementation((href) => navigation.navigate(href));
  window.history.replaceState(null, '', '/notices');
});
afterEach(() => {
  server.resetHandlers();
  vi.unstubAllEnvs();
});
afterAll(() => server.close());

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

// Only the browser router is substituted: actual clients, links, back action, hooks and API parsing run.
function NoticeJourney({ initialHref = '/notices' }: { readonly initialHref?: string }) {
  const [href, setHref] = useState(initialHref);
  const route = new URL(href, 'http://localhost');
  navigation.pathname = route.pathname;
  navigation.searchParams = route.searchParams;
  navigation.navigate = setHref;
  const openLink = (event: MouseEvent<HTMLDivElement>) => {
    const link = event.target instanceof Element ? event.target.closest('a') : null;
    if (!link || link.hasAttribute('data-nav-back')) return;
    const target = link.getAttribute('href');
    if (!target) return;
    event.preventDefault();
    setHref(target);
  };
  return (
    <div onClickCapture={openLink}>
      {route.pathname === '/notices'
        ? <NoticeListPageClient />
        : <NoticeDetailPageClient noticeId={noticeId} />}
    </div>
  );
}

describe('notice category return journey (MD-QA #23)', () => {
  it('retains the selected notice category after detail back', async () => {
    const user = userEvent.setup();
    renderWithQuery(<NoticeJourney />);
    await screen.findByRole('link', { name: /서비스 이용 안내/ });

    await user.click(screen.getByRole('button', { name: '안내' }));
    expect(screen.getByRole('button', { name: '안내' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(await screen.findByRole('link', { name: /서비스 이용 안내/ }));
    await screen.findByRole('heading', { name: '서비스 이용 안내' });
    await user.click(screen.getByRole('link', { name: '뒤로가기' }));

    await screen.findByRole('link', { name: /서비스 이용 안내/ });
    expect(screen.getByRole('button', { name: '안내' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('link', { name: /서비스 업데이트/ })).not.toBeInTheDocument();
  });

  it('hydrates a selected category from the returned list URL', async () => {
    renderWithQuery(<NoticeJourney initialHref="/notices?category=%EC%95%88%EB%82%B4" />);

    await screen.findByRole('link', { name: /서비스 이용 안내/ });
    expect(screen.getByRole('button', { name: '안내' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('link', { name: /서비스 업데이트/ })).not.toBeInTheDocument();
  });

  it('keeps the default list links and back destination', async () => {
    const user = userEvent.setup();
    renderWithQuery(<NoticeJourney />);
    const link = await screen.findByRole('link', { name: /서비스 이용 안내/ });
    expect(link).toHaveAttribute('href', `/notices/${noticeId}`);
    await user.click(link);

    await screen.findByRole('heading', { name: '서비스 이용 안내' });
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', '/notices');
  });

  it('returns a directly opened detail to the default notice list', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', `/notices/${noticeId}`);
    renderWithQuery(<NoticeDetailPageClient noticeId={noticeId} />);
    await screen.findByRole('heading', { name: '서비스 이용 안내' });
    await user.click(screen.getByRole('link', { name: '뒤로가기' }));

    expect(`${window.location.pathname}${window.location.search}`).toBe('/notices');
  });

  it('uses the latest local category before router query synchronization', async () => {
    const user = userEvent.setup();
    const pendingRoutes: string[] = [];
    navigation.replace.mockImplementation((href) => { pendingRoutes.push(href); });
    renderWithQuery(<NoticeJourney />);
    await screen.findByRole('link', { name: /서비스 이용 안내/ });
    await user.click(screen.getByRole('button', { name: '안내' }));
    await user.click(screen.getByRole('button', { name: '업데이트' }));
    await user.click(screen.getByRole('button', { name: '안내' }));
    await user.click(await screen.findByRole('link', { name: /서비스 이용 안내/ }));

    await screen.findByRole('heading', { name: '서비스 이용 안내' });
    const backHref = screen.getByRole('link', { name: '뒤로가기' }).getAttribute('href') ?? '';
    expect(new URL(backHref, 'http://localhost').searchParams.get('category')).toBe('안내');
  });

  it('updates the local category when the existing list receives a new URL', async () => {
    renderWithQuery(<NoticeJourney />);
    await screen.findByRole('link', { name: /서비스 이용 안내/ });
    await act(() => navigation.navigate('/notices?category=%EC%97%85%EB%8D%B0%EC%9D%B4%ED%8A%B8'));

    expect(screen.getByRole('button', { name: '업데이트' })).toHaveAttribute('aria-pressed', 'true');
    await screen.findByRole('link', { name: /서비스 업데이트/ });
    expect(screen.queryByRole('link', { name: /서비스 이용 안내/ })).not.toBeInTheDocument();
  });

  it('preserves a safe nested list origin when a category is selected', async () => {
    const user = userEvent.setup();
    renderWithQuery(<NoticeJourney initialHref="/notices?from=%2Fnotifications" />);
    await screen.findByRole('link', { name: /서비스 이용 안내/ });
    await user.click(screen.getByRole('button', { name: '안내' }));
    await user.click(await screen.findByRole('link', { name: /서비스 이용 안내/ }));
    await screen.findByRole('heading', { name: '서비스 이용 안내' });
    await user.click(screen.getByRole('link', { name: '뒤로가기' }));

    await screen.findByRole('link', { name: /서비스 이용 안내/ });
    expect(screen.getByRole('button', { name: '안내' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', '/notifications');
  });

  it('uses the default category for an unsupported category query', async () => {
    renderWithQuery(<NoticeJourney initialHref="/notices?category=unknown" />);

    await screen.findByRole('link', { name: /서비스 업데이트/ });
    expect(screen.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true');
  });

  it.each(['https://outside.test/notices', '//outside.test/notices', '/\\outside.test/notices', 'javascript:alert(1)'])(
    'rejects an unsafe detail return destination: %s', async (from) => {
      navigation.searchParams = new URLSearchParams({ from });
      renderWithQuery(<NoticeDetailPageClient noticeId={noticeId} />);

      await screen.findByRole('heading', { name: '서비스 이용 안내' });
      expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', '/notices');
    },
  );
});
