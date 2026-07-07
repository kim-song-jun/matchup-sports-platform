import { render, screen } from '@testing-library/react';
import { HomePageView } from '@/components/home/home-page';
import { describe, expect, it, vi } from 'vitest';
import { getHomeViewModel } from '@/components/home/home.view-model';
import { Providers } from '../providers';
import HomePage from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
}));

describe('HomePage', () => {
  it('renders the home shell without showing sample home content while API data is empty', () => {
    const fallback = getHomeViewModel();

    render(
      <Providers>
        <HomePage />
      </Providers>,
    );

    expect(screen.getAllByText('teameet').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('채팅')).toBeInTheDocument();
    expect(document.body.textContent).toContain(fallback.viewerName);
    expect(screen.getAllByText('공지사항').length).toBeGreaterThan(0);
    expect(screen.getByText('새 공지사항이 없어요.')).toBeInTheDocument();

    for (const match of fallback.recommendedMatches) {
      expect(screen.queryByText(match.title)).not.toBeInTheDocument();
    }

    for (const notice of fallback.notices) {
      expect(screen.queryByText(notice.title)).not.toBeInTheDocument();
    }
  });

  it('anchors the unread badge to the floating chat button instead of the page corner', () => {
    const model = getHomeViewModel();

    const { container } = render(
      <Providers>
        <HomePageView model={model} />
      </Providers>,
    );

    const chatButton = screen.getByLabelText('채팅');
    expect(chatButton).toBeInTheDocument();
    expect(chatButton.querySelector('.tm-floating-count')).toHaveTextContent(String(model.chatUnreadCount));
    expect(container.querySelector('.tm-home-chat-row .tm-floating-count')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.tm-home-chat-row .tm-home-chat-row-count').length).toBeGreaterThan(0);
  });
});
