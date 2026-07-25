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
    });
    const user = userEvent.setup();
    renderWithClient(<NotificationSettingsPageClient />);

    await user.click(screen.getByRole('switch', { name: '브라우저 알림 받기' }));

    expect(subscribe).toHaveBeenCalled();
    expect(screen.queryByText('브라우저 알림을 켜지 못했어요')).not.toBeInTheDocument();
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
    });
    const user = userEvent.setup();
    renderWithClient(<NotificationSettingsPageClient />);

    await user.click(screen.getByRole('switch', { name: '브라우저 알림 받기' }));

    expect(await screen.findByText('브라우저 알림을 켜지 못했어요')).toBeInTheDocument();
    expect(screen.getByText(/지금은 브라우저 알림을 켤 수 없어요/)).toBeInTheDocument();
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
    });
    const user = userEvent.setup();
    renderWithClient(<NotificationSettingsPageClient />);

    await user.click(screen.getByRole('switch', { name: '브라우저 알림 받기' }));

    expect(await screen.findByText(/브라우저 설정에서 이 사이트의 알림을 허용/)).toBeInTheDocument();
  });

  it('unsubscribes from push notifications when the toggle is turned off', async () => {
    const unsubscribe = vi.fn();
    vi.mocked(useV1PushRegistration).mockReturnValue({
      subscribe: vi.fn(),
      unsubscribe,
      permission: 'granted',
      isSubscribed: true,
    });
    const user = userEvent.setup();
    renderWithClient(<NotificationSettingsPageClient />);

    await user.click(screen.getByRole('switch', { name: '브라우저 알림 받기' }));

    expect(unsubscribe).toHaveBeenCalled();
  });

  it('disables the toggle when browser permission is denied and not currently subscribed', async () => {
    const subscribe = vi.fn();
    vi.mocked(useV1PushRegistration).mockReturnValue({
      subscribe,
      unsubscribe: vi.fn(),
      permission: 'denied',
      isSubscribed: false,
    });
    const user = userEvent.setup();
    renderWithClient(<NotificationSettingsPageClient />);

    const toggle = screen.getByRole('switch', { name: '브라우저 알림 받기' });
    expect(toggle).toBeDisabled();

    await user.click(toggle);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('hides the toggle entirely when push is unsupported', () => {
    vi.mocked(useV1PushRegistration).mockReturnValue({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      permission: 'unsupported',
      isSubscribed: false,
    });
    renderWithClient(<NotificationSettingsPageClient />);

    expect(screen.queryByRole('switch', { name: '브라우저 알림 받기' })).not.toBeInTheDocument();
  });
});
