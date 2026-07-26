import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NoticeDetailPageView, NoticeListPageView } from './notices-page';
import type { NoticeDetailViewModel, NoticeListViewModel } from './notices.types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/notices/notice-1',
  useSearchParams: () => new URLSearchParams(),
}));

const baseModel: NoticeDetailViewModel = {
  notice: {
    id: 'notice-1',
    tag: '안내',
    title: '계정 보안 안내',
    summary: '개인정보와 계정 보호 기준 안내',
    date: '7월 7일',
    body: ['계정 설정에서 알림과 보안 정보를 관리할 수 있어요.'],
  },
  status: 'ready',
};

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('NoticeDetailPageView', () => {
  it('does not show the related match box when the notice has no related link', () => {
    renderWithClient(<NoticeDetailPageView model={baseModel} />);

    expect(screen.getByRole('heading', { name: '계정 보안 안내' })).toBeInTheDocument();
    expect(screen.queryByText('요약')).not.toBeInTheDocument();
    expect(screen.queryByText('개인정보와 계정 보호 기준 안내')).not.toBeInTheDocument();
    expect(screen.queryByText('관련 매치 확인')).not.toBeInTheDocument();
  });

  it('shows the related match box only when a related link is provided', () => {
    renderWithClient(<NoticeDetailPageView model={{ ...baseModel, relatedHref: '/matches' }} />);

    expect(screen.getByText('관련 매치 확인')).toBeInTheDocument();
  });
});

describe('NoticeListPageView', () => {
  it('exposes one page-level heading across responsive layouts', () => {
    const model: NoticeListViewModel = {
      filters: [{ label: '전체', active: true }],
      notices: [],
      status: 'ready',
    };

    renderWithClient(<NoticeListPageView model={model} />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: '공지사항' })).toBeInTheDocument();
  });
});
