import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { getHomeNoticeStorageKey, HomeNoticePopup } from './home-notice-popup';
import type { HomeNotice } from './home.types';

const notice: HomeNotice = {
  id: 'notice-pinned',
  title: '서비스 이용 안내',
  summary: '고정',
  trailing: '7월 13일 (월)',
  body: '이번 주 경기장 이용 시간을 확인해 주세요.',
};

describe('HomeNoticePopup', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows the real pinned notice content and links to its detail page', async () => {
    render(<HomeNoticePopup notice={notice} />);

    const dialog = await screen.findByRole('dialog', { name: notice.title });
    expect(dialog).toHaveTextContent(notice.body ?? '');
    expect(dialog.parentElement).toHaveClass('items-center');
    expect(dialog.parentElement).not.toHaveClass('items-end');
    expect(dialog).toHaveTextContent(notice.trailing);
    const title = screen.getByRole('heading', { name: notice.title });
    const date = screen.getByText(notice.trailing);
    const body = screen.getByText(notice.body ?? '');
    expect(title.compareDocumentPosition(date) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(date.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: '일주일 안 보기' }).compareDocumentPosition(
      screen.getByRole('link', { name: '자세히 보기' }),
    ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('link', { name: '자세히 보기' })).toHaveAttribute('href', `/notices/${notice.id}`);
  });

  it('hides the same notice for seven days without hiding a different notice', async () => {
    const user = userEvent.setup();
    const first = render(<HomeNoticePopup notice={notice} />);

    await user.click(await screen.findByRole('button', { name: '일주일 안 보기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const hiddenUntil = Number(window.localStorage.getItem(getHomeNoticeStorageKey(notice.id)));
    expect(hiddenUntil).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);

    first.unmount();
    const second = render(<HomeNoticePopup notice={notice} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    second.rerender(<HomeNoticePopup notice={{ ...notice, id: 'notice-new', title: '새 공지' }} />);
    expect(await screen.findByRole('dialog', { name: '새 공지' })).toBeInTheDocument();
  });
});
