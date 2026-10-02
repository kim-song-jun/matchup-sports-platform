import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import AdminContentHubPage from './page';

// 탭 본문 3개는 각자 자기 페이지였던 완결 화면(각자 훅·폼 보유)이라 스텁으로 대체한다 —
// 이 테스트의 계약은 "허브가 올바른 본문을 갈아끼우고 동반 파라미터를 보존하는가"다.
vi.mock('./notices-view', () => ({ NoticesView: () => <div>stub-notices</div> }));
vi.mock('./popups-view', () => ({ PopupsView: () => <div>stub-popups</div> }));
vi.mock('./terms-view', () => ({ TermsView: () => <div>stub-terms</div> }));

const replaceMock = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/content',
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParams,
}));

describe('AdminContentHubPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
  });

  it('starts on notices and switches bodies per tab with a URL mirror', async () => {
    const user = userEvent.setup();
    render(<AdminContentHubPage />);

    expect(screen.getByText('stub-notices')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '약관' }));
    expect(screen.getByText('stub-terms')).toBeInTheDocument();
    expect(screen.queryByText('stub-notices')).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith('/admin/content?tab=terms', { scroll: false });
  });

  it('lands on the popups tab from ?tab=popups and keeps targetPath when switching tabs', async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams('tab=popups&targetPath=%2Ftournaments%2Ft-1');
    render(<AdminContentHubPage />);

    expect(screen.getByText('stub-popups')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '팝업' })).toHaveAttribute('aria-selected', 'true');

    // 탭을 옮겨도 동반 파라미터(targetPath)는 URL 에서 사라지지 않는다.
    await user.click(screen.getByRole('tab', { name: '약관' }));
    expect(replaceMock).toHaveBeenCalledWith(
      '/admin/content?tab=terms&targetPath=%2Ftournaments%2Ft-1',
      { scroll: false },
    );
  });
});
