import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhoneVerificationCard } from './phone-verification-card';
import * as api from '@/hooks/use-v1-api';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function issuedResult(overrides: Partial<{ code: string; destNumber: string; qrCode?: string; expiresAt: string }> = {}) {
  return {
    code: 'ABC123',
    destNumber: '16663538',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PhoneVerificationCard', () => {
  it('public: verify 성공 시 proofToken으로 onVerified 호출', async () => {
    vi.spyOn(api, 'useV1PhoneIssue').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(issuedResult()),
      isPending: false,
    } as never);
    vi.spyOn(api, 'useV1PhoneVerify').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ verified: true, proofToken: 'PROOF' }),
      isPending: false,
    } as never);
    const onVerified = vi.fn();

    wrap(<PhoneVerificationCard mode="public" phone="01012345678" onVerified={onVerified} />);
    await userEvent.click(await screen.findByRole('button', { name: /인증번호 받기|인증문자 보내기/ }));
    await userEvent.click(await screen.findByRole('button', { name: /인증 확인/ }));

    await waitFor(() => expect(onVerified).toHaveBeenCalledWith('PROOF'));
    expect(screen.getByText('휴대폰 본인인증이 완료됐어요.')).toBeInTheDocument();
  });

  it('public: 아직 문자가 도착하지 않으면 안내 문구를 role="alert"로 노출하고 onVerified를 호출하지 않는다', async () => {
    vi.spyOn(api, 'useV1PhoneIssue').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(issuedResult()),
      isPending: false,
    } as never);
    vi.spyOn(api, 'useV1PhoneVerify').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ verified: false }),
      isPending: false,
    } as never);
    const onVerified = vi.fn();

    wrap(<PhoneVerificationCard mode="public" phone="01012345678" onVerified={onVerified} />);
    await userEvent.click(await screen.findByRole('button', { name: /인증번호 받기/ }));
    await userEvent.click(await screen.findByRole('button', { name: /인증 확인/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('아직 문자가 확인되지 않았어요');
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('verify 호출이 실패(reject)하면 fallback 에러 문구를 노출한다', async () => {
    vi.spyOn(api, 'useV1PhoneIssue').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(issuedResult()),
      isPending: false,
    } as never);
    vi.spyOn(api, 'useV1PhoneVerify').mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('network down')),
      isPending: false,
    } as never);

    wrap(<PhoneVerificationCard mode="public" phone="01012345678" onVerified={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: /인증번호 받기/ }));
    await userEvent.click(await screen.findByRole('button', { name: /인증 확인/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('network down');
  });

  it('desktop: 발급된 QR 코드를 렌더한다(authed 모드)', async () => {
    vi.spyOn(api, 'useV1AuthedPhoneRequest').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(issuedResult({ qrCode: 'data:image/png;base64,QR' })),
      isPending: false,
    } as never);
    vi.spyOn(api, 'useV1AuthedPhoneConfirm').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ verified: false }),
      isPending: false,
    } as never);

    wrap(<PhoneVerificationCard mode="authed" phone="01012345678" onVerified={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: /인증번호 받기/ }));

    const qrImage = await screen.findByAltText('휴대폰 카메라로 스캔하면 인증 문자가 자동으로 준비돼요');
    expect(qrImage).toHaveAttribute('src', 'data:image/png;base64,QR');
  });

  it('authed: confirm 성공 시 인자 없이 onVerified를 호출한다', async () => {
    vi.spyOn(api, 'useV1AuthedPhoneRequest').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(issuedResult()),
      isPending: false,
    } as never);
    vi.spyOn(api, 'useV1AuthedPhoneConfirm').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ verified: true }),
      isPending: false,
    } as never);
    const onVerified = vi.fn();

    wrap(<PhoneVerificationCard mode="authed" phone="01012345678" onVerified={onVerified} />);
    await userEvent.click(await screen.findByRole('button', { name: /인증번호 받기/ }));
    await userEvent.click(await screen.findByRole('button', { name: /인증 확인/ }));

    await waitFor(() => expect(onVerified).toHaveBeenCalledWith());
  });

  it('이미 만료된 인증번호는 재발급 CTA로 전환된다', async () => {
    vi.spyOn(api, 'useV1PhoneIssue').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(issuedResult({ expiresAt: new Date(Date.now() - 1000).toISOString() })),
      isPending: false,
    } as never);
    vi.spyOn(api, 'useV1PhoneVerify').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

    wrap(<PhoneVerificationCard mode="public" phone="01012345678" onVerified={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: /인증번호 받기/ }));

    expect(await screen.findByText('인증번호가 만료됐어요. 다시 받아 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /인증번호 다시 받기/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /인증 확인/ })).not.toBeInTheDocument();
  });

  it('"다른 방법으로" 토글은 새 채널로 즉시 재발급한다', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Android' });
    const issueMock = vi
      .fn()
      .mockResolvedValueOnce(issuedResult())
      .mockResolvedValueOnce(issuedResult({ qrCode: 'data:image/png;base64,QR' }));
    vi.spyOn(api, 'useV1PhoneIssue').mockReturnValue({ mutateAsync: issueMock, isPending: false } as never);
    vi.spyOn(api, 'useV1PhoneVerify').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

    wrap(<PhoneVerificationCard mode="public" phone="01012345678" onVerified={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: /인증번호 받기/ }));

    // mobile 채널로 최초 발급됨
    await waitFor(() => expect(issueMock).toHaveBeenNthCalledWith(1, { phone: '01012345678', channel: 'mobile' }));

    await userEvent.click(screen.getByRole('button', { name: 'QR 코드로 인증 방법 바꾸기' }));

    await waitFor(() => expect(issueMock).toHaveBeenNthCalledWith(2, { phone: '01012345678', channel: 'desktop' }));
    expect(await screen.findByAltText('휴대폰 카메라로 스캔하면 인증 문자가 자동으로 준비돼요')).toBeInTheDocument();
  });
});
