import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TournamentRealNameVisibilitySettingsPageClient } from './my-api-clients';

// 대회 경기 기록 실명 표시 토글(2026-08-18 사용자 결정) — record-consent와 같은 화면
// 구조를 재사용하되 policyHash가 없다("동의"가 아니라 표시 선호도라서). mutation
// payload가 실제로 { visible } 하나만 보내는지, 문구가 실명/닉네임 전환을 정확히
// 안내하는지를 검증한다("이 테스트가 깨지면 실제 버그를 잡는가" 게이트).
const hooks = vi.hoisted(() => ({
  visibility: vi.fn(),
  updateVisibility: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-v1-api')>();
  return {
    ...actual,
    useV1TournamentRealNameVisibility: hooks.visibility,
    useV1UpdateTournamentRealNameVisibility: hooks.updateVisibility,
  };
});

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('TournamentRealNameVisibilitySettingsPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('꺼져 있으면(기본값) OFF로 보이고 닉네임 표시 중임을 알린다', () => {
    hooks.visibility.mockReturnValue({ data: { visible: false }, isLoading: false, isError: false, refetch: vi.fn() });
    hooks.updateVisibility.mockReturnValue({ mutate: vi.fn(), isPending: false });

    renderWithClient(<TournamentRealNameVisibilitySettingsPageClient />);

    const toggle = screen.getByRole('switch', { name: '대회 기록 실명 표시' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('OFF')).toBeInTheDocument();
    expect(screen.getByText(/지금은 닉네임으로 표시돼요/)).toBeInTheDocument();
  });

  it('토글을 누르면 visible:true만 보낸다 (policyHash 없음)', async () => {
    hooks.visibility.mockReturnValue({ data: { visible: false }, isLoading: false, isError: false, refetch: vi.fn() });
    const mutate = vi.fn();
    hooks.updateVisibility.mockReturnValue({ mutate, isPending: false });
    const user = userEvent.setup();

    renderWithClient(<TournamentRealNameVisibilitySettingsPageClient />);
    await user.click(screen.getByRole('switch', { name: '대회 기록 실명 표시' }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ visible: true }, expect.any(Object));
  });

  it('켜져 있으면 ON으로 보이고 실명 표시 중임을 알린다', () => {
    hooks.visibility.mockReturnValue({ data: { visible: true }, isLoading: false, isError: false, refetch: vi.fn() });
    hooks.updateVisibility.mockReturnValue({ mutate: vi.fn(), isPending: false });

    renderWithClient(<TournamentRealNameVisibilitySettingsPageClient />);

    const toggle = screen.getByRole('switch', { name: '대회 기록 실명 표시' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('ON')).toBeInTheDocument();
    expect(screen.getByText(/지금 실명으로 표시돼요/)).toBeInTheDocument();
  });

  it('저장에 실패하면 조용히 넘어가지 않고 이유를 알린다', async () => {
    hooks.visibility.mockReturnValue({ data: { visible: false }, isLoading: false, isError: false, refetch: vi.fn() });
    const mutate = vi.fn((_vars, options) => options?.onError?.(new Error('boom')));
    hooks.updateVisibility.mockReturnValue({ mutate, isPending: false });
    const user = userEvent.setup();

    renderWithClient(<TournamentRealNameVisibilitySettingsPageClient />);
    await user.click(screen.getByRole('switch', { name: '대회 기록 실명 표시' }));

    expect(await screen.findByText('저장하지 못했어요')).toBeInTheDocument();
  });

  it('조회 자체가 실패하면 재시도 가능한 에러 화면을 보여준다', () => {
    const refetch = vi.fn();
    hooks.visibility.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    hooks.updateVisibility.mockReturnValue({ mutate: vi.fn(), isPending: false });

    renderWithClient(<TournamentRealNameVisibilitySettingsPageClient />);

    expect(screen.getByText('설정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: '대회 기록 실명 표시' })).not.toBeInTheDocument();
  });
});
