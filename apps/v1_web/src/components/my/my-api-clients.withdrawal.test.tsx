import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WithdrawalPageClient } from './my-api-clients';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/my/settings/withdrawal',
}));

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('WithdrawalPageClient', () => {
  // App Store 5.1.1(v) 는 수동 삭제 절차라면 소요 기간을 알리라고 한다. 기간은 방침의 30일 유예와 같아야 한다.
  it('탈퇴 요청 전에 삭제까지의 기간과 복구 경로를 보여준다', () => {
    renderWithClient(<WithdrawalPageClient />);

    expect(
      screen.getByText('탈퇴를 요청하면 30일 뒤 계정과 개인정보가 삭제돼요. 그 전에는 고객센터로 복구를 요청할 수 있어요.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '탈퇴 요청' })).toBeInTheDocument();
  });
});
