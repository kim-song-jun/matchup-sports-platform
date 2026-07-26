import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HomePageView } from '@/components/home/home-page';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHomeViewModel } from '@/components/home/home.view-model';
import { Providers } from '../providers';
import HomePage from './page';

const analytics = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  // PendingTournamentReviewModal(홈 리뷰 독려)이 useRouter를 사용한다
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: analytics.trackEvent,
  getGaMeasurementId: () => undefined,
}));

describe('HomePage', () => {
  beforeEach(() => {
    analytics.trackEvent.mockClear();
  });

  it('tracks a home_view event on mount', async () => {
    render(
      <Providers>
        <HomePage />
      </Providers>,
    );

    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('home_view', {}));
  });

  it('renders a signed-out home shell without sample identity or content while API data is empty', () => {
    const fallback = getHomeViewModel();

    render(
      <Providers>
        <HomePage />
      </Providers>,
    );

    expect(screen.getAllByText('teameet').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Teameet 홈' })).toBeInTheDocument();
    expect(screen.getByLabelText('채팅')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(fallback.viewerName);
    expect(screen.getByText('로그인하면 매치와 팀 채팅을 이어볼 수 있어요.')).toBeInTheDocument();
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

  it('shows only notice titles in the home notice panel', () => {
    const model = {
      ...getHomeViewModel(),
      notices: [
        {
          id: 'notice-long-body',
          title: '홈 노출 공지 제목',
          summary: '홈에서는 이 긴 공지 본문이 그대로 보이면 안 됩니다.',
          trailing: '오늘',
        },
      ],
    };

    render(
      <Providers>
        <HomePageView model={model} />
      </Providers>,
    );

    expect(screen.getAllByText('홈 노출 공지 제목').length).toBeGreaterThan(0);
    expect(screen.queryByText('홈에서는 이 긴 공지 본문이 그대로 보이면 안 됩니다.')).not.toBeInTheDocument();
  });

  it('uses the compact recommended-match error container for network failures', () => {
    const model = { ...getHomeViewModel(), network: true, recommendedMatches: [] };

    const { container } = render(
      <Providers>
        <HomePageView model={model} />
      </Providers>,
    );

    const error = container.querySelector('.tm-home-matches-error-wrap');
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent('목록을 불러오지 못했어요');
    expect(error).toHaveTextContent('다시 불러오기');
  });

  describe('push notification nudge banner', () => {
    it('does not render the nudge when the model has no pushNudge', () => {
      const model = getHomeViewModel();

      render(
        <Providers>
          <HomePageView model={model} />
        </Providers>,
      );

      expect(screen.queryByText('알림을 받아보세요')).not.toBeInTheDocument();
    });

    it('renders a dismissible nudge and wires the subscribe/dismiss actions through', () => {
      const onSubscribe = vi.fn();
      const onDismiss = vi.fn();
      const model = {
        ...getHomeViewModel(),
        pushNudge: { subscribing: false, onSubscribe, onDismiss },
      };

      render(
        <Providers>
          <HomePageView model={model} />
        </Providers>,
      );

      expect(screen.getByText('알림을 받아보세요')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '알림 받기' }));
      expect(onSubscribe).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByLabelText('알림 받기 안내 닫기'));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('disables the subscribe button and shows a pending label while subscribing', () => {
      const model = {
        ...getHomeViewModel(),
        pushNudge: { subscribing: true, onSubscribe: vi.fn(), onDismiss: vi.fn() },
      };

      render(
        <Providers>
          <HomePageView model={model} />
        </Providers>,
      );

      const subscribeButton = screen.getByRole('button', { name: '확인 중' });
      expect(subscribeButton).toBeDisabled();
    });
  });
});
