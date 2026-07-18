import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { getTournamentPopupStorageKey, TournamentPopupDialog } from './tournament-popup-dialog';
import type { V1TournamentDetailPopup } from '@/types/api';

const popup: V1TournamentDetailPopup = {
  popupId: 'tournament-popup-1',
  title: '얼리버드 신청 안내',
  body: '7/31까지 신청하면 참가비를 할인해 드려요.',
  imageUrl: null,
};

describe('TournamentPopupDialog', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows the tournament popup content with close actions', async () => {
    render(<TournamentPopupDialog popup={popup} />);

    const dialog = await screen.findByRole('dialog', { name: popup.title });
    expect(dialog).toHaveTextContent(popup.body);
    expect(screen.getByRole('button', { name: '일주일 안 보기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
  });

  it('renders no dialog when there is no active popup', () => {
    render(<TournamentPopupDialog popup={null} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('replaces a broken remote popup image with the local campaign fallback', async () => {
    render(
      <TournamentPopupDialog
        popup={{ ...popup, imageUrl: 'https://cdn.example.com/broken-popup.webp' }}
      />,
    );

    const image = await screen.findByRole('presentation');
    fireEvent.error(image);

    expect(image).toHaveAttribute('src', '/mock/generated/team-huddle.webp');
  });

  it('hides only this tournament popup for seven days, keyed by popupId', async () => {
    const user = userEvent.setup();
    const first = render(<TournamentPopupDialog popup={popup} />);

    await user.click(await screen.findByRole('button', { name: '일주일 안 보기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const hiddenUntil = Number(window.localStorage.getItem(getTournamentPopupStorageKey(popup.popupId)));
    expect(hiddenUntil).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);

    first.unmount();
    const second = render(<TournamentPopupDialog popup={popup} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // A different tournament's popup (different id) is unaffected by this hidden-until entry.
    second.rerender(<TournamentPopupDialog popup={{ ...popup, popupId: 'tournament-popup-2', title: '새 팝업' }} />);
    expect(await screen.findByRole('dialog', { name: '새 팝업' })).toBeInTheDocument();
  });
});
