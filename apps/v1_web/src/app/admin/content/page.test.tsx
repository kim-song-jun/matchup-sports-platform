import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminContentHubPage from './page';

// 탭 본문 4개는 각자 자기 페이지였던 완결 화면(각자 훅·폼 보유)이라 스텁으로 대체한다 —
// 이 테스트의 계약은 "허브가 올바른 본문을 갈아끼우고 동반 파라미터를 보존하는가"와
// "광고 탭이 owner 에게만 열리는가"다.
// NoticesView mounting is what starts the notice request, so a mount is recorded to prove it never happens for an ads visit.
const { noticesMounted } = vi.hoisted(() => ({ noticesMounted: vi.fn() }));
vi.mock('./notices-view', async () => {
  const { useEffect } = await import('react');
  return {
    NoticesView: () => {
      useEffect(() => { noticesMounted(); }, []);
      return <div>stub-notices</div>;
    },
  };
});
vi.mock('./popups-view', () => ({ PopupsView: () => <div>stub-popups</div> }));
vi.mock('./terms-view', () => ({ TermsView: () => <div>stub-terms</div> }));
vi.mock('./ads-view', () => ({ AdsView: () => <div>stub-ads</div> }));

const replaceMock = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/content',
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParams,
}));

const server = setupServer();
let adminRole: 'owner' | 'ops' | 'support' = 'owner';
let releaseAdminMe: Promise<void> = Promise.resolve();
let adminMeServed: Promise<void> = Promise.resolve();

/** Resolves once the admin profile response has been sent and the screen had time to apply it. */
async function roleApplied() {
  await adminMeServed;
  await new Promise((resolve) => setTimeout(resolve, 50));
}

function renderHub() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminContentHubPage />
    </QueryClientProvider>,
  );
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  adminRole = 'owner';
  releaseAdminMe = Promise.resolve();
  let markServed = () => {};
  adminMeServed = new Promise<void>((resolve) => { markServed = resolve; });
  server.use(http.get('*/api/v1/admin/me', async () => {
    await releaseAdminMe;
    markServed();
    return HttpResponse.json({
      status: 'success',
      timestamp: '2026-11-08T00:00:00.000Z',
      data: {
        userId: 'u-1',
        adminUserId: 'a-1',
        adminRole,
        status: 'active',
        capabilities: ['status:write'],
        lastActiveAt: null,
      },
    });
  }));
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
});

describe('AdminContentHubPage', () => {
  it('starts on notices and switches bodies per tab with a URL mirror', async () => {
    const user = userEvent.setup();
    renderHub();

    expect(screen.getByText('stub-notices')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '약관' }));
    expect(screen.getByText('stub-terms')).toBeInTheDocument();
    expect(screen.queryByText('stub-notices')).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith('/admin/content?tab=terms', { scroll: false });
  });

  it('lands on the popups tab from ?tab=popups and keeps targetPath when switching tabs', async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams('tab=popups&targetPath=%2Ftournaments%2Ft-1');
    renderHub();

    expect(screen.getByText('stub-popups')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '팝업' })).toHaveAttribute('aria-selected', 'true');

    // 탭을 옮겨도 동반 파라미터(targetPath)는 URL 에서 사라지지 않는다.
    await user.click(screen.getByRole('tab', { name: '약관' }));
    expect(replaceMock).toHaveBeenCalledWith(
      '/admin/content?tab=terms&targetPath=%2Ftournaments%2Ft-1',
      { scroll: false },
    );
  });

  it('shows the ads tab to an owner and opens it with a URL mirror', async () => {
    const user = userEvent.setup();
    renderHub();

    await user.click(await screen.findByRole('tab', { name: '광고' }));

    expect(screen.getByText('stub-ads')).toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith('/admin/content?tab=ads', { scroll: false });
  });

  it('opens straight on the ads tab for an owner who follows ?tab=ads', async () => {
    searchParams = new URLSearchParams('tab=ads');
    renderHub();

    expect(await screen.findByText('stub-ads')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '광고' })).toHaveAttribute('aria-selected', 'true');
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it.each(['ops', 'support'] as const)('hides the ads tab from %s', async (role) => {
    adminRole = role;
    renderHub();

    await roleApplied();
    expect(screen.queryByRole('tab', { name: '광고' })).toBeNull();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['공지사항', '팝업', '약관']);
  });

  it.each(['ops', 'support'] as const)('sends %s who open ?tab=ads back to notices and drops the param from the URL', async (role) => {
    adminRole = role;
    searchParams = new URLSearchParams('tab=ads&targetPath=%2Ftournaments%2Ft-1');
    renderHub();

    expect(await screen.findByText('stub-notices')).toBeInTheDocument();
    expect(screen.queryByText('stub-ads')).toBeNull();
    expect(screen.getByRole('tab', { name: '공지사항' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/admin/content?targetPath=%2Ftournaments%2Ft-1', { scroll: false }));
  });

  it('shows neither the ads tab nor any body for ?tab=ads until the role is known', async () => {
    let release = () => {};
    releaseAdminMe = new Promise<void>((resolve) => { release = resolve; });
    searchParams = new URLSearchParams('tab=ads');
    renderHub();

    expect(screen.queryByRole('tab', { name: '광고' })).toBeNull();
    expect(screen.queryByText('stub-ads')).toBeNull();
    expect(screen.queryByText('stub-notices')).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled();

    release();
    expect(await screen.findByText('stub-ads')).toBeInTheDocument();
  });

  it('never mounts the notices body for an owner who opens ?tab=ads, not even for the frame after the role arrives', async () => {
    let release = () => {};
    releaseAdminMe = new Promise<void>((resolve) => { release = resolve; });
    searchParams = new URLSearchParams('tab=ads');
    renderHub();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(noticesMounted).not.toHaveBeenCalled();

    release();
    expect(await screen.findByText('stub-ads')).toBeInTheDocument();

    expect(noticesMounted).not.toHaveBeenCalled();
  });

  it('follows the address when only the URL changes, as the back button does', async () => {
    searchParams = new URLSearchParams('tab=terms');
    const view = renderHub();
    expect(screen.getByText('stub-terms')).toBeInTheDocument();

    searchParams = new URLSearchParams('tab=popups');
    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AdminContentHubPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('stub-popups')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '팝업' })).toHaveAttribute('aria-selected', 'true');
  });
});
