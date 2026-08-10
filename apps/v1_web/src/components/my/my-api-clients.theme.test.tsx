import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ThemeSettingsPageClient } from './my-api-clients';

const hooks = vi.hoisted(() => ({
  useTheme: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/providers/theme-provider', () => ({
  useTheme: hooks.useTheme,
}));

// AppChrome이 렌더하는 NotificationBellLink가 React Query 훅을 쓰므로 필요하다
// (my-api-clients.notifications.test.tsx의 renderWithClient와 동일 패턴).
function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('ThemeSettingsPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('현재 선택된 테마를 라디오 상태로 보여준다', () => {
    hooks.useTheme.mockReturnValue({
      preference: 'dark',
      effectiveTheme: 'dark',
      setPreference: vi.fn(),
      isSaving: false,
      saveError: false,
    });

    renderWithClient(<ThemeSettingsPageClient />);

    expect(screen.getByRole('radio', { name: /다크/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /라이트/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: /기기 설정/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('다른 옵션을 클릭하면 setPreference를 그 값으로 호출한다', async () => {
    const setPreference = vi.fn();
    hooks.useTheme.mockReturnValue({
      preference: 'light',
      effectiveTheme: 'light',
      setPreference,
      isSaving: false,
      saveError: false,
    });
    const user = userEvent.setup();

    renderWithClient(<ThemeSettingsPageClient />);
    await user.click(screen.getByRole('radio', { name: /기기 설정/ }));

    expect(setPreference).toHaveBeenCalledWith('system');
  });

  it('저장 실패 시 실패 안내를 보여준다', () => {
    hooks.useTheme.mockReturnValue({
      preference: 'light',
      effectiveTheme: 'light',
      setPreference: vi.fn(),
      isSaving: false,
      saveError: true,
    });

    renderWithClient(<ThemeSettingsPageClient />);

    expect(screen.getByText('저장하지 못했어요')).toBeInTheDocument();
  });

  // 저장 중엔 선택된 옵션뿐 아니라 전체를 막는다 — 선택된 것만 막으면 저장 대기 중에
  // 다른 옵션을 눌러 PATCH 두 개가 동시에 나가고, 응답이 뒤바뀌어 도착하면 서버에 최종
  // 저장되는 값이 마지막 클릭과 달라질 수 있다(Copilot 리뷰에서 지적된 레이스 컨디션).
  it('저장 중이면 선택 여부와 무관하게 모든 옵션을 비활성화한다', () => {
    hooks.useTheme.mockReturnValue({
      preference: 'dark',
      effectiveTheme: 'dark',
      setPreference: vi.fn(),
      isSaving: true,
      saveError: false,
    });

    renderWithClient(<ThemeSettingsPageClient />);

    expect(screen.getByRole('radio', { name: /다크/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /라이트/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /기기 설정/ })).toBeDisabled();
  });
});
