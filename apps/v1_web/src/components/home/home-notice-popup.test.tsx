import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { getHomePopupStorageKey, HomePopupDialog } from './home-notice-popup';
import type { HomePopup } from './home.types';

const popup: HomePopup = {
  id: 'popup-main',
  title: '서비스 이용 안내',
  trailing: '7월 13일 (월)',
  body: '이번 주 경기장 이용 시간을 확인해 주세요.',
  linkUrl: null,
  linkLabel: null,
};

describe('HomePopupDialog', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders an internal CTA link when configured', async () => {
    render(<HomePopupDialog popup={{ ...popup, linkUrl: '/matches', linkLabel: '매치 보기' }} />);

    const link = await screen.findByRole('link', { name: '매치 보기' });
    expect(link).toHaveAttribute('href', '/matches');
    expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
  });

  it('shows independent popup content with close actions', async () => {
    render(<HomePopupDialog popup={popup} />);

    const dialog = await screen.findByRole('dialog', { name: popup.title });
    expect(dialog).toHaveTextContent(popup.body);
    expect(dialog.parentElement).toHaveClass('items-center');
    expect(dialog).toHaveTextContent(popup.trailing);
    expect(screen.getByRole('button', { name: '일주일 안 보기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('hides only the same popup for seven days', async () => {
    const user = userEvent.setup();
    const first = render(<HomePopupDialog popup={popup} />);

    await user.click(await screen.findByRole('button', { name: '일주일 안 보기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const hiddenUntil = Number(window.localStorage.getItem(getHomePopupStorageKey(popup.id)));
    expect(hiddenUntil).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);

    first.unmount();
    const second = render(<HomePopupDialog popup={popup} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    second.rerender(<HomePopupDialog popup={{ ...popup, id: 'popup-new', title: '새 팝업' }} />);
    expect(await screen.findByRole('dialog', { name: '새 팝업' })).toBeInTheDocument();
  });
});
