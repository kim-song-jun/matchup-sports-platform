import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import AdminSettingsHubPage from './page';

// 탭 본문 2개는 각자 자기 페이지였던 완결 폼(각자 훅 보유)이라 스텁으로 대체한다 —
// 이 테스트의 계약은 "허브가 올바른 본문을 갈아끼우고 URL 을 따라가는가"다.
vi.mock('./integrations-view', () => ({ IntegrationsView: () => <div>stub-integrations</div> }));
vi.mock('./reviews-view', () => ({ ReviewPolicyView: () => <div>stub-reviews</div> }));

const replaceMock = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/settings',
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParams,
}));

describe('AdminSettingsHubPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
  });

  it('starts on the integrations tab and switches to review policy with a URL mirror', async () => {
    const user = userEvent.setup();
    render(<AdminSettingsHubPage />);

    expect(screen.getByText('stub-integrations')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '연동' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: '후기 정책' }));

    expect(screen.getByText('stub-reviews')).toBeInTheDocument();
    expect(screen.queryByText('stub-integrations')).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith('/admin/settings?tab=reviews', { scroll: false });
  });

  it('lands on the review policy tab when ?tab=reviews (구 URL 리다이렉트 착지)', () => {
    searchParams = new URLSearchParams('tab=reviews');
    render(<AdminSettingsHubPage />);

    expect(screen.getByText('stub-reviews')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '후기 정책' })).toHaveAttribute('aria-selected', 'true');
  });
});
