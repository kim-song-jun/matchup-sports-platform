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
    const subscribe = vi.fn();
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
