import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ThemeProvider, useTheme } from './theme-provider';

const hooks = vi.hoisted(() => ({
  useV1Settings: vi.fn(),
  useV1UpdateSettings: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1Settings: hooks.useV1Settings,
  useV1UpdateSettings: hooks.useV1UpdateSettings,
}));

const sessionMock = vi.hoisted(() => ({ hasStoredV1Session: vi.fn() }));
vi.mock('@/lib/session-storage', () => ({ hasStoredV1Session: sessionMock.hasStoredV1Session }));

function Consumer() {
  const { preference } = useTheme();
  return <div data-testid="preference">{preference}</div>;
}

describe('ThemeProvider server sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    hooks.useV1UpdateSettings.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  // 계정 A로 로그인해 서버 값(dark)으로 동기화된 뒤, 같은 기기에서 로그아웃하고 다른
  // 계정 B로 로그인하면(SPA 내비게이션, 풀 리로드 없음) B의 서버 값(light)으로 다시
  // 동기화돼야 한다 — serverSynced가 리셋되지 않으면 A의 테마가 B에게 그대로 남는다.
  it('로그아웃 후 다른 계정으로 로그인하면 그 계정의 서버 값으로 다시 동기화한다', async () => {
    sessionMock.hasStoredV1Session.mockReturnValue(true);
    hooks.useV1Settings.mockReturnValue({ data: { theme: 'dark' } });

    const { rerender } = render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );

    expect(await screen.findByTestId('preference')).toHaveTextContent('dark');

    // 로그아웃: 세션이 사라진다.
    sessionMock.hasStoredV1Session.mockReturnValue(false);
    hooks.useV1Settings.mockReturnValue({ data: undefined });
    rerender(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );

    // 다른 계정(B)으로 로그인: 서버 값은 light.
    sessionMock.hasStoredV1Session.mockReturnValue(true);
    hooks.useV1Settings.mockReturnValue({ data: { theme: 'light' } });
    rerender(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );

    expect(await screen.findByTestId('preference')).toHaveTextContent('light');
  });
});
