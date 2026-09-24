import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHomePopupStorageKey, HomePopupDialog } from './home-notice-popup';
import type { HomePopup } from './home.types';
import { bindSoftNavigator } from '@/lib/navigation-history';

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

  // 팝업 링크를 눌러 이동하면 닫기는 URL 이 바뀐 뒤에 온다 — 닫기 back 이 이동 push 와 엇갈리지 않는다.
  it('closes on route change without walking history back', async () => {
    const historyBack = vi.spyOn(window.history, 'back');
    const linked = { ...popup, linkUrl: '/matches', linkLabel: '매치 보기' };
    const { rerender } = render(<HomePopupDialog popup={linked} location="/home" />);
    const link = await screen.findByRole('link', { name: '매치 보기' });

    const notPrevented = link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(notPrevented).toBe(true); // 링크가 그대로 이동한다
    await act(async () => {}); // 이동(push)은 클릭 처리보다 늦게 커밋된다
    expect(screen.getByRole('dialog', { name: popup.title })).toBeInTheDocument();
    expect(historyBack).not.toHaveBeenCalled();

    window.history.pushState({}, '', '/matches');
    rerender(<HomePopupDialog popup={linked} location="/matches" />);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(historyBack).not.toHaveBeenCalled();
    historyBack.mockRestore();
  });

  it('closes when only the query string changes', async () => {
    const historyBack = vi.spyOn(window.history, 'back');
    const linked = { ...popup, linkUrl: '/matches?sport=futsal', linkLabel: '풋살 매치' };
    const routerReplace = vi.fn();
    const unbind = bindSoftNavigator(routerReplace);
    const { rerender } = render(<HomePopupDialog popup={linked} location="/matches" />);
    const link = await screen.findByRole('link', { name: '풋살 매치' });

    // The popup's own history entry is open, so the link replaces it instead of pushing past it.
    const notPrevented = link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(notPrevented).toBe(false);
    expect(routerReplace).toHaveBeenCalledWith('/matches?sport=futsal');
    window.history.replaceState({}, '', '/matches?sport=futsal');
    rerender(<HomePopupDialog popup={linked} location="/matches?sport=futsal" />);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(historyBack).not.toHaveBeenCalled();
    historyBack.mockRestore();
    unbind();
  });

  it('closes on click for a link that leaves the app, whatever the scheme case', async () => {
    const linked = { ...popup, linkUrl: 'HTTPS://example.com/event', linkLabel: '이벤트 보기' };
    render(<HomePopupDialog popup={linked} location="/home" />);
    const link = await screen.findByRole('link', { name: '이벤트 보기' });
    expect(link).toHaveAttribute('target', '_blank');

    link.addEventListener('click', (event) => event.preventDefault()); // jsdom 은 새 창을 열지 못한다
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
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
