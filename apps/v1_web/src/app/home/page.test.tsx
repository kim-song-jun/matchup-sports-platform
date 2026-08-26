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
  // 홈 배너(PendingReviewsCard)와 하위 컴포넌트들이 next/navigation 훅을 사용한다
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
    // retry는 실제 프로덕션(home-client.tsx)에서 항상 채워지는 필드다 — ErrorState는
    // EmptyState와 달리 onRetry가 없으면 버튼 자체를 렌더하지 않으므로(의도된 동작:
    // 핸들러 없는 죽은 버튼을 보여주지 않음) 픽스처에서도 실제 사용처처럼 채워준다.
    const model = { ...getHomeViewModel(), network: true, recommendedMatches: [], retry: vi.fn() };

    const { container } = render(
      <Providers>
        <HomePageView model={model} />
      </Providers>,
    );

    const error = container.querySelector('.tm-home-matches-error-wrap');
    // role="alert"는 ErrorState 자체 루트에 있다(중첩 live region을 피하려고 wrapper에는
    // 다시 걸지 않음) — wrapper 안에서 alert 요소가 실제로 존재하는지로 검증한다.
    expect(error?.querySelector('[role="alert"]')).not.toBeNull();
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
        // Task 154 P2-1: 배너는 조건이 맞아도 정책이 이번 방문에 뽑아야 렌더된다.
        // 이 테스트의 관심사는 "뽑혔을 때 제대로 그려지고 동작이 연결되는가" 이므로
        // 푸시가 뽑힌 상태를 명시한다.
        bannerDecision: { showPhoneVerify: false, nudge: 'push' as const, deferred: [] },
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
        bannerDecision: { showPhoneVerify: false, nudge: 'push' as const, deferred: [] },
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
