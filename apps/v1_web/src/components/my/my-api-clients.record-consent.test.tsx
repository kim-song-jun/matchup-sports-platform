import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordConsentSettingsPageClient } from './my-api-clients';

// F2: 사용자 단위 공개 기록 동의 토글 — 켜면 과거 경기까지 소급 공개된다는 게 이 기능의
// 핵심 조건이라(사용자 명시 결정) 문구·mutation payload 둘 다 이 사실을 실제로 반영하는지
// 검증한다("이 테스트가 깨지면 실제 버그를 잡는가" 게이트).
const hooks = vi.hoisted(() => ({
  consent: vi.fn(),
  updateConsent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-v1-api')>();
  return {
    ...actual,
    useV1RecordConsent: hooks.consent,
    useV1UpdateRecordConsent: hooks.updateConsent,
  };
});

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('RecordConsentSettingsPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('꺼져 있으면 OFF로 보이고, 소급 공개를 미리 알린다', () => {
    hooks.consent.mockReturnValue({ data: { granted: false, effectiveAt: null }, isLoading: false, isError: false, refetch: vi.fn() });
    hooks.updateConsent.mockReturnValue({ mutate: vi.fn(), isPending: false });

    renderWithClient(<RecordConsentSettingsPageClient />);

    const toggle = screen.getByRole('switch', { name: '경기 기록 공개' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('OFF')).toBeInTheDocument();
    // 켜기 전에도 소급 공개 사실을 알아야 한다 — 켜고 나서 놀라지 않게.
    expect(screen.getByText(/켜면 지금까지 참가한 경기 기록도 함께 공개돼요/)).toBeInTheDocument();
  });

  it('토글을 누르면 granted:true + 고정 policyHash로 저장한다', async () => {
    hooks.consent.mockReturnValue({ data: { granted: false, effectiveAt: null }, isLoading: false, isError: false, refetch: vi.fn() });
    const mutate = vi.fn();
    hooks.updateConsent.mockReturnValue({ mutate, isPending: false });
    const user = userEvent.setup();

    renderWithClient(<RecordConsentSettingsPageClient />);
    await user.click(screen.getByRole('switch', { name: '경기 기록 공개' }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      { granted: true, policyHash: 'v1-public-record-consent-1' },
      expect.any(Object),
    );
  });

  it('켜져 있으면 ON으로 보이고 언제부터 공개됐는지 알려준다', () => {
    hooks.consent.mockReturnValue({
      data: { granted: true, effectiveAt: '2026-08-01T00:00:00.000Z' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    hooks.updateConsent.mockReturnValue({ mutate: vi.fn(), isPending: false });

    renderWithClient(<RecordConsentSettingsPageClient />);

    const toggle = screen.getByRole('switch', { name: '경기 기록 공개' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('ON')).toBeInTheDocument();
    expect(screen.getByText(/부터 공개하고 있어요/)).toBeInTheDocument();
  });

  it('저장에 실패하면 조용히 넘어가지 않고 이유를 알린다', async () => {
    hooks.consent.mockReturnValue({ data: { granted: false, effectiveAt: null }, isLoading: false, isError: false, refetch: vi.fn() });
    const mutate = vi.fn((_vars, options) => options?.onError?.(new Error('boom')));
    hooks.updateConsent.mockReturnValue({ mutate, isPending: false });
    const user = userEvent.setup();

    renderWithClient(<RecordConsentSettingsPageClient />);
    await user.click(screen.getByRole('switch', { name: '경기 기록 공개' }));

    expect(await screen.findByText('저장하지 못했어요')).toBeInTheDocument();
  });

  it('조회 자체가 실패하면 재시도 가능한 에러 화면을 보여준다', () => {
    const refetch = vi.fn();
    hooks.consent.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    hooks.updateConsent.mockReturnValue({ mutate: vi.fn(), isPending: false });

    renderWithClient(<RecordConsentSettingsPageClient />);

    expect(screen.getByText('설정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: '경기 기록 공개' })).not.toBeInTheDocument();
  });
});
