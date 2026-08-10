import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  const { preference, setPreference } = useTheme();
  return (
    <div>
      <div data-testid="preference">{preference}</div>
      <button onClick={() => setPreference('light')}>set-light</button>
    </div>
  );
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

  // Copilot 리뷰 지적: enabled:false로 바뀌어도 React Query 캐시엔 이전 로그인 사용자의
  // settings.data가 그대로 남을 수 있다(예: 탈퇴 처리 후 router.replace만 하고 풀 리로드는
  // 안 하는 흐름) — 로그아웃 상태에선 그 캐시값을 절대 재적용하면 안 된다.
  it('로그아웃 상태에서는 캐시에 남은 이전 사용자의 서버 테마를 재적용하지 않는다', async () => {
    const user = userEvent.setup();
    sessionMock.hasStoredV1Session.mockReturnValue(true);
    hooks.useV1Settings.mockReturnValue({ data: { theme: 'dark' } });

    const { rerender } = render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );
    expect(await screen.findByTestId('preference')).toHaveTextContent('dark');

    // 사용자가 직접 라이트로 바꾼다 — preference/localStorage가 실제 코드 경로로 light가 된다.
    await user.click(screen.getByRole('button', { name: 'set-light' }));
    expect(screen.getByTestId('preference')).toHaveTextContent('light');

    // 이제 로그아웃 — 하지만 React Query 캐시(mock)는 지워지지 않고 이전 계정의 dark가
    // 그대로 남아 있다고 가정한다(쿼리 비활성화만으로는 캐시가 안 지워지는 상황 재현).
    sessionMock.hasStoredV1Session.mockReturnValue(false);
    rerender(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );

    // 가드가 없다면 여기서 캐시에 남은 dark로 되돌아간다 — 로그아웃 상태이므로 light가 유지돼야 한다.
    expect(screen.getByTestId('preference')).toHaveTextContent('light');
  });

  // Copilot 리뷰 지적: prefersDarkOS가 초기값 false로 시작하면, system 선호도 + OS가
  // dark인 사용자는 마운트 직후 effectiveTheme가 잠깐 light로 계산돼 FOUC 스크립트가
  // 미리 붙여둔 .dark를 뗐다가(toggle(false)) matchMedia effect 이후 다시 붙이는
  // (toggle(true)) 깜빡임이 생긴다. 초기 state를 matchMedia로 동기 계산하면 classList
  // 조작이 (true) 한 번만 일어나야 한다.
  it('system 선호도 + OS dark일 때 마운트 직후 .dark를 뗐다 다시 붙이는 깜빡임이 없다', () => {
    window.localStorage.setItem('tm-theme', 'system');
    sessionMock.hasStoredV1Session.mockReturnValue(false);
    hooks.useV1Settings.mockReturnValue({ data: undefined });
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true, // OS가 다크라고 가정
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const toggleSpy = vi.spyOn(document.documentElement.classList, 'toggle');

    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );

    const darkCalls = toggleSpy.mock.calls.filter((call) => call[0] === 'dark');
    expect(darkCalls).toEqual([['dark', true]]);

    toggleSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  // Copilot 리뷰 지적: 초기 서버 동기화가 끝나기 전(settings 쿼리가 아직 이전 값으로
  // 응답 중)에 사용자가 먼저 테마를 바꾸면, 뒤늦게 도착하는 stale 서버 값이 방금 고른
  // 값을 되돌리는 레이스가 있었다.
  it('초기 서버 동기화가 끝나기 전에 사용자가 먼저 바꾸면 뒤늦게 온 stale 서버 값이 되돌리지 않는다', async () => {
    const user = userEvent.setup();
    // 초기값을 dark로 둬야 "set-light" 클릭이 실제 변경이 된다 — 기본값(light)과
    // 같으면 setPreference의 no-op 가드(next === preference)에 걸려 아무 일도
    // 안 일어나고 serverSynced도 true가 안 돼서, 이 테스트가 검증하려는 레이스
    // 자체가 발생하지 않는다.
    window.localStorage.setItem('tm-theme', 'dark');
    sessionMock.hasStoredV1Session.mockReturnValue(true);
    // settings 쿼리가 아직 로딩 중 — 아직 데이터 없음.
    hooks.useV1Settings.mockReturnValue({ data: undefined });

    const { rerender } = render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');

    // 사용자가 응답이 오기 전에 먼저 라이트로 바꾼다.
    await user.click(screen.getByRole('button', { name: 'set-light' }));
    expect(screen.getByTestId('preference')).toHaveTextContent('light');

    // 뒤늦게 stale 응답 도착 — 사용자가 고르기 전(pre-click)의 서버 값이라고 가정.
    hooks.useV1Settings.mockReturnValue({ data: { theme: 'dark' } });
    rerender(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    );

    // 가드가 없다면 여기서 stale 'dark'로 되돌아간다 — 사용자의 최근 선택이 유지돼야 한다.
    expect(screen.getByTestId('preference')).toHaveTextContent('light');
  });
});
