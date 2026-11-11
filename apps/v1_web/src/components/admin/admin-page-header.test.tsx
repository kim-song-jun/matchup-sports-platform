import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNavigationHistoryForTests, installNavigationHistory } from '@/lib/navigation-history';
import { AdminPageHeader } from './admin-page-header';

const navigation = vi.hoisted(() => ({
  router: { back: vi.fn(), replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => navigation.router,
}));

beforeEach(() => {
  __resetNavigationHistoryForTests();
  window.history.replaceState(null, '', '/my');
  Object.values(navigation.router).forEach((fn) => fn.mockReset());
});

describe('AdminPageHeader 뒤로가기 버튼', () => {
  it('back 을 주지 않으면 버튼이 없다', () => {
    render(<AdminPageHeader title="담당 대회 관리" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('back 을 주면 제목 옆에 뒤로가기 버튼이 보이고 44px 이상이다', () => {
    render(<AdminPageHeader title="담당 대회 관리" back={{ fallbackHref: '/my', label: '마이페이지로' }} />);
    const link = screen.getByRole('link', { name: '마이페이지로' });
    expect(link).toHaveAttribute('href', '/my');
    expect(link.className).toContain('h-11');
    expect(link.className).toContain('w-11');
  });

  it('직전 항목이 목적지면 새 항목을 쌓지 않고 router.back() 한다', () => {
    installNavigationHistory();
    window.history.pushState({}, '', '/tournament-management');
    render(<AdminPageHeader title="담당 대회 관리" back={{ fallbackHref: '/my', label: '마이페이지로' }} />);

    fireEvent.click(screen.getByRole('link', { name: '마이페이지로' }));

    expect(navigation.router.back).toHaveBeenCalledTimes(1);
    expect(navigation.router.push).not.toHaveBeenCalled();
  });
});
