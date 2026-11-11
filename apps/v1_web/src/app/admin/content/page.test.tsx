import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminContentHubPage from './page';

// 탭 본문 4개는 각자 자기 페이지였던 완결 화면(각자 훅·폼 보유)이라 스텁으로 대체한다 —
// 이 테스트의 계약은 "허브가 올바른 본문을 갈아끼우고 동반 파라미터를 보존하는가"와
// "광고 탭이 역할과 상관없이 모든 운영자에게 열리는가"다(2026-11-11 — 변경 권한은 서버가 owner·ops 로 판정하고,
// support 의 버튼 잠금은 광고 화면이 한다).
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

function renderHub() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminContentHubPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
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

  // 2026-11-11: owner·ops·support 모두 광고 탭이 보인다. 화면은 역할을 읽지 않는다(서버가 최종 판정).
  it('shows the ads tab and opens it with a URL mirror', async () => {
    const user = userEvent.setup();
    renderHub();

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['공지사항', '팝업', '약관', '광고']);
    await user.click(screen.getByRole('tab', { name: '광고' }));

    expect(screen.getByText('stub-ads')).toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith('/admin/content?tab=ads', { scroll: false });
  });

  it('opens straight on the ads tab from ?tab=ads without redirecting or mounting notices', () => {
    searchParams = new URLSearchParams('tab=ads&targetPath=%2Ftournaments%2Ft-1');
    renderHub();

    expect(screen.getByText('stub-ads')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '광고' })).toHaveAttribute('aria-selected', 'true');
    expect(replaceMock).not.toHaveBeenCalled();
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
