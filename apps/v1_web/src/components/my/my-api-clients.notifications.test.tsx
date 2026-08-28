import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationSettingsPageClient } from './my-api-clients';
import { useV1PushRegistration } from '@/hooks/use-v1-push-registration';

const hooks = vi.hoisted(() => ({
  settings: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-v1-api')>();
  return {
    ...actual,
    useV1Settings: hooks.settings,
    useV1UpdateSettings: hooks.updateSettings,
  };
});

vi.mock('@/hooks/use-v1-push-registration', () => ({
  useV1PushRegistration: vi.fn(),
}));

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('NotificationSettingsPageClient push toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.settings.mockReturnValue({
      data: {
        notifications: {
          matchEnabled: true,
          teamEnabled: true,
          teamMatchEnabled: true,
          chatEnabled: true,
          noticeEnabled: true,
          marketingEnabled: false,
        },
      },
      isError: false,
      refetch: vi.fn(),
    });
    hooks.updateSettings.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it('subscribes to push notifications when the toggle is turned on', async () => {
    const subscribe = vi.fn().mockResolvedValue(true);
    vi.mocked(useV1PushRegistration).mockReturnValue({
      subscribe,
      unsubscribe: vi.fn(),
      permission: 'default',
      isSubscribed: false,
      isPending: false,
    });
    const user = userEvent.setup();
    renderWithClient(<NotificationSettingsPageClient />);

    await user.click(screen.getByRole('switch', { name: '푸시 알림 받기' }));

    expect(subscribe).toHaveBeenCalled();
    expect(screen.queryByText('푸시 알림을 켜지 못했어요')).not.toBeInTheDocument();
  });

  it('구독에 실패하면 조용히 넘어가지 않고 이유를 화면에 알린다 (서버 VAPID 미설정 등)', async () => {
    // 서버가 VAPID 공개키를 못 주면 subscribe()가 false를 반환한다 — 예전에는 토글이 OFF로
    // 남기만 해서 사용자가 원인을 알 수 없었다.
    vi.stubGlobal('Notification', { permission: 'granted' });
    vi.mocked(useV1PushRegistration).mockReturnValue({
      subscribe: vi.fn().mockResolvedValue(false),
      unsubscribe: vi.fn(),
      permission: 'default',
      isSubscribed: false,
      isPending: false,
    });
    const user = userEvent.setup();
    renderWithClient(<NotificationSettingsPageClient />);

    await user.click(screen.getByRole('switch', { name: '푸시 알림 받기' }));

    expect(await screen.findByText('푸시 알림을 켜지 못했어요')).toBeInTheDocument();
    expect(screen.getByText(/지금은 푸시 알림을 켤 수 없어요/)).toBeInTheDocument();
  });

  it('권한 팝업에서 차단하면 차단 해제 방법을 안내한다', async () => {
    // 팝업 결과는 클릭 시점 렌더의 permission('default')에 반영돼 있지 않으므로,
    // 실패 안내는 갱신된 실제 권한을 읽어 분기해야 한다.
    vi.stubGlobal('Notification', { permission: 'denied' });
    vi.mocked(useV1PushRegistration).mockReturnValue({
      subscribe: vi.fn().mockResolvedValue(false),
      unsubscribe: vi.fn(),
      permission: 'default',
      isSubscribed: false,
      isPending: false,
    });
    const user = userEvent.setup();
    renderWithClient(<NotificationSettingsPageClient />);

    await user.click(screen.getByRole('switch', { name: '푸시 알림 받기' }));

    expect(await screen.findByText(/알림 설정에서 허용한 뒤 다시 시도/)).toBeInTheDocument();
  });

  it('unsubscribes from push notifications when the toggle is turned off', async () => {
    const unsubscribe = vi.fn();
    vi.mocked(useV1PushRegistration).mockReturnValue({
      subscribe: vi.fn(),
      unsubscribe,
      permission: 'granted',
      isSubscribed: true,
      isPending: false,
    });
    const user = userEvent.setup();
    renderWithClient(<NotificationSettingsPageClient />);

    await user.click(screen.getByRole('switch', { name: '푸시 알림 받기' }));

    expect(unsubscribe).toHaveBeenCalled();
  });

  it('disables the toggle when browser permission is denied and not currently subscribed', async () => {
    const subscribe = vi.fn();
    vi.mocked(useV1PushRegistration).mockReturnValue({
      subscribe,
      unsubscribe: vi.fn(),
      permission: 'denied',
      isSubscribed: false,
      isPending: false,
    });
    const user = userEvent.setup();
    renderWithClient(<NotificationSettingsPageClient />);

    const toggle = screen.getByRole('switch', { name: '푸시 알림 받기' });
    expect(toggle).toBeDisabled();

    await user.click(toggle);
    expect(subscribe).not.toHaveBeenCalled();
  });

  /**
   * 상태별 문구 회귀 방지: 예전에는 꺼져 있을 때도 "브라우저 푸시로 받아요"라고 적혀 있어
   * 이미 켜진 것으로 읽혔고, 웹 푸시가 기기·브라우저 단위라는 사실이 어디에도 없었다.
   */
  it('구독 중이면 이 기기에서 받는 중이라고 알리고, 기기마다 따로 켜야 함을 밝힌다', () => {
    vi.mocked(useV1PushRegistration).mockReturnValue({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      permission: 'granted',
      isSubscribed: true,
      isPending: false,
    });
    renderWithClient(<NotificationSettingsPageClient />);

    expect(screen.getByText(/지금 이 기기에서 받고 있어요/)).toBeInTheDocument();
    expect(screen.getByText(/다른 기기에서는 따로 켜야 해요/)).toBeInTheDocument();
    // 켜져 있으면 항목 설명도 "알림함 + 푸시 알림 모두"로 바뀐다.
    expect(screen.getByText(/알림함과 푸시 알림 모두에서 빠져요/)).toBeInTheDocument();
  });

  it('구독 전이면 켰을 때 무엇이 달라지는지 알리고, 지금은 알림함에서만 보인다고 안내한다', () => {
    vi.mocked(useV1PushRegistration).mockReturnValue({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      permission: 'default',
      isSubscribed: false,
      isPending: false,
    });
    renderWithClient(<NotificationSettingsPageClient />);

    expect(screen.getByText(/켜면 앱을 닫아도 새 소식을 받을 수 있어요/)).toBeInTheDocument();
    expect(screen.getByText(/지금은 앱 안 알림함에서만 볼 수 있어요/)).toBeInTheDocument();
    // 꺼져 있는데 "받아요"라고 단정하지 않는다.
    expect(screen.queryByText(/브라우저 푸시로 받아요/)).not.toBeInTheDocument();
  });

  /**
   * 구독은 권한 팝업 → 서비스워커 활성화 → 서버 저장까지 수 초가 걸린다. 그동안
   * 토글이 꿈쩍도 하지 않으면 눌리지 않은 줄 알고 다시 누르게 되므로, 토글은 즉시
   * ON 위치로 옮기되 '켜짐'이라고 단정하지는 않는다(실패 시 되돌아가야 하므로).
   */
  it('켜는 중에는 토글이 미리 ON 위치로 가되, 켜졌다고 단정하지 않는다', () => {
    vi.mocked(useV1PushRegistration).mockReturnValue({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      permission: 'default',
      isSubscribed: false,
      isPending: true,
    });
    renderWithClient(<NotificationSettingsPageClient />);

    const toggle = screen.getByRole('switch', { name: '푸시 알림 받기' });
    // 진행 중임을 보조기술에도 알리고, 아직 켜진 상태로 확정하지 않는다.
    expect(toggle).toHaveAttribute('aria-busy', 'true');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    // 중복 실행을 막는다.
    expect(toggle).toBeDisabled();
    expect(screen.getByText(/켜는 중이에요/)).toBeInTheDocument();
    // 시각적으로는 ON 위치로 이동해 누른 티가 난다.
    expect(toggle.querySelector('.tm-toggle-on')).not.toBeNull();
  });

  it('끄는 중에는 끄는 중이라고 알린다', () => {
    vi.mocked(useV1PushRegistration).mockReturnValue({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      permission: 'granted',
      isSubscribed: true,
      isPending: true,
    });
    renderWithClient(<NotificationSettingsPageClient />);

    expect(screen.getByText(/끄는 중이에요/)).toBeInTheDocument();
  });

  it('hides the toggle entirely when push is unsupported', () => {
    vi.mocked(useV1PushRegistration).mockReturnValue({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      permission: 'unsupported',
      isSubscribed: false,
      isPending: false,
    });
    renderWithClient(<NotificationSettingsPageClient />);

    expect(screen.queryByRole('switch', { name: '푸시 알림 받기' })).not.toBeInTheDocument();
  });
});
