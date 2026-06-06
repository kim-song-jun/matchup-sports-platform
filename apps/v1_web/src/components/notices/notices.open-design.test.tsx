import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NoticeListPageView } from './notices-page';
import { getNoticeListViewModel } from './notices.view-model';

describe('notices Open Design contract', () => {
  it('renders pinned notice list with category filters and no fake read side effect', () => {
    render(<NoticeListPageView model={getNoticeListViewModel()} />);

    const page = screen.getByTestId('notices-open-design');
    expect(page).toHaveClass('tm-notices-open-design');
    expect(within(page).getByRole('heading', { name: '공지사항' })).toBeInTheDocument();
    expect(within(page).getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(page).getByRole('link', { name: /이번 주 고정 공지/ })).toHaveAttribute('href', '/notices/notice-1');
    expect(page).not.toHaveTextContent('읽음 처리 완료');
  });
});
