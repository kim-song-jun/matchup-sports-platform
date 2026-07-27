import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhoneVerifyPageClient } from './phone-verify-page-client';
import * as api from '@/hooks/use-v1-api';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/my/phone-verify',
}));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function authMe(phone: string | null) {
  return {
    data: { user: { phone }, verification: { phoneVerified: false } },
    isLoading: false,
  } as never;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PhoneVerifyPageClient — 인증 대상 번호 확인·수정', () => {
  it('계정에 저장된 번호를 화면에 보여준다 — 어느 번호로 문자가 가는지 알 수 있어야 한다', () => {
    vi.spyOn(api, 'useV1AuthMe').mockReturnValue(authMe('01012345678'));
    vi.spyOn(api, 'useV1AuthedPhoneRequest').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.spyOn(api, 'useV1AuthedPhoneConfirm').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

    wrap(<PhoneVerifyPageClient />);

    expect(screen.getByText('인증번호를 받을 번호')).toBeInTheDocument();
    expect(screen.getByText('010-1234-5678')).toBeInTheDocument();
  });

  it('저장된 번호가 틀렸을 때 이 화면에서 고쳐 그 번호로 인증번호를 받는다', async () => {
    const requestMock = vi.fn().mockResolvedValue({
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    vi.spyOn(api, 'useV1AuthMe').mockReturnValue(authMe('01012345678'));
    vi.spyOn(api, 'useV1AuthedPhoneRequest').mockReturnValue({ mutateAsync: requestMock, isPending: false } as never);
    vi.spyOn(api, 'useV1AuthedPhoneConfirm').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

    wrap(<PhoneVerifyPageClient />);

    fireEvent.click(screen.getByRole('button', { name: '인증받을 휴대폰 번호 수정' }));

    const input = screen.getByLabelText('휴대폰 번호');
    fireEvent.change(input, { target: { value: '010-9876-5432' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
    });

    // 프로필로 가지 않고도 수정한 번호로 발송돼야 한다(서버가 확정 시 user.phone 을 갱신한다).
    expect(requestMock).toHaveBeenCalledWith({ phone: '01098765432' });
  });

  it('번호를 고치다 마음이 바뀌면 기존 번호로 되돌릴 수 있다', () => {
    vi.spyOn(api, 'useV1AuthMe').mockReturnValue(authMe('01012345678'));
    vi.spyOn(api, 'useV1AuthedPhoneRequest').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.spyOn(api, 'useV1AuthedPhoneConfirm').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

    wrap(<PhoneVerifyPageClient />);

    fireEvent.click(screen.getByRole('button', { name: '인증받을 휴대폰 번호 수정' }));
    fireEvent.change(screen.getByLabelText('휴대폰 번호'), { target: { value: '010-9876-5432' } });
    fireEvent.click(screen.getByRole('button', { name: '기존 번호로 되돌리기' }));

    expect(screen.getByText('010-1234-5678')).toBeInTheDocument();
    expect(screen.queryByLabelText('휴대폰 번호')).not.toBeInTheDocument();
  });

  it('계정에 번호가 없으면 입력칸을 바로 연다', () => {
    vi.spyOn(api, 'useV1AuthMe').mockReturnValue(authMe(null));
    vi.spyOn(api, 'useV1AuthedPhoneRequest').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    vi.spyOn(api, 'useV1AuthedPhoneConfirm').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

    wrap(<PhoneVerifyPageClient />);

    expect(screen.getByLabelText('휴대폰 번호')).toBeInTheDocument();
    expect(screen.queryByText('인증번호를 받을 번호')).not.toBeInTheDocument();
  });
});
