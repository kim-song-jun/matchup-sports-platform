import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhoneVerificationCard } from './phone-verification-card';
import * as api from '@/hooks/use-v1-api';

const POLL_MS = 2000;

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

/** 마운트 자동 발급 등 대기 중인 프라미스/이펙트를 플러시(fake timer 하에서 waitFor 대신 사용). */
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PhoneVerificationCard', () => {
  it('public · 데스크탑: 자동 발급 후 자동 폴링으로 도착이 확인되면 proofToken으로 onVerified 호출', async () => {
    vi.spyOn(api, 'useV1PhoneIssue').mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(issuedResult()), isPending: false } as never);
    vi.spyOn(api, 'useV1PhoneVerify').mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({ verified: true, proofToken: 'PROOF' }), isPending: false } as never);
    const onVerified = vi.fn();

    wrap(<PhoneVerificationCard mode="public" phone="01012345678" onVerified={onVerified} />);
    await flush(); // 자동 발급
    await advance(POLL_MS + 10); // 진입 즉시 확인/폴링 → 도착 확인

    expect(onVerified).toHaveBeenCalledWith('PROOF');
    expect(screen.getByText('휴대폰 본인인증이 완료됐어요.')).toBeInTheDocument();
  });

  it('authed · 데스크탑: 자동 폴링 성공 시 인자 없이 onVerified 호출', async () => {
    vi.spyOn(api, 'useV1AuthedPhoneRequest').mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(issuedResult({ qrCode: 'data:image/png;base64,QR' })), isPending: false } as never);
    vi.spyOn(api, 'useV1AuthedPhoneConfirm').mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({ verified: true }), isPending: false } as never);
    const onVerified = vi.fn();

    wrap(<PhoneVerificationCard mode="authed" phone="01012345678" onVerified={onVerified} />);
    await flush();
    await advance(POLL_MS + 10);

    expect(onVerified).toHaveBeenCalledWith();
  });

  it('아직 도착 전이면 조용히 재시도한다(onVerified 미호출·에러 미노출)', async () => {
    vi.spyOn(api, 'useV1PhoneIssue').mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(issuedResult()), isPending: false } as never);
    const verifyMock = vi.fn().mockResolvedValue({ verified: false });
    vi.spyOn(api, 'useV1PhoneVerify').mockReturnValue({ mutateAsync: verifyMock, isPending: false } as never);
    const onVerified = vi.fn();

    wrap(<PhoneVerificationCard mode="public" phone="01012345678" onVerified={onVerified} />);
    await flush();
    await advance(POLL_MS * 2 + 20); // 두 번 폴링

    expect(verifyMock).toHaveBeenCalled();
    expect(onVerified).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('문자 도착을 확인하고 있어요…')).toBeInTheDocument();
  });

  it('데스크탑: 발급된 QR을 렌더한다(코드/번호는 노출하지 않음)', async () => {
    vi.spyOn(api, 'useV1AuthedPhoneRequest').mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(issuedResult({ qrCode: 'data:image/png;base64,QR' })), isPending: false } as never);
    vi.spyOn(api, 'useV1AuthedPhoneConfirm').mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({ verified: false }), isPending: false } as never);

    wrap(<PhoneVerificationCard mode="authed" phone="01012345678" onVerified={vi.fn()} />);
    await flush();

    expect(screen.getByAltText('휴대폰 카메라로 스캔하면 인증 문자가 자동으로 준비돼요')).toHaveAttribute('src', 'data:image/png;base64,QR');
    // 인증번호 코드가 화면에 노출되지 않아야 한다.
    expect(screen.queryByText('ABC123')).not.toBeInTheDocument();
  });

  it('모바일: "인증 문자 보내기"를 누르기 전에는 폴링하지 않고, 누른 뒤부터 자동 확인한다', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Android' });
    vi.spyOn(api, 'useV1PhoneIssue').mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(issuedResult()), isPending: false } as never);
    const verifyMock = vi.fn().mockResolvedValue({ verified: true, proofToken: 'PROOF' });
    vi.spyOn(api, 'useV1PhoneVerify').mockReturnValue({ mutateAsync: verifyMock, isPending: false } as never);
    const onVerified = vi.fn();

    wrap(<PhoneVerificationCard mode="public" phone="01012345678" onVerified={onVerified} />);
    await flush();
    await advance(POLL_MS + 10); // 보내기 전 → 폴링 없음
    expect(verifyMock).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: '인증 문자 보내기' }));
    });
    await advance(POLL_MS + 10); // 보낸 뒤 → 폴링 발화

    expect(onVerified).toHaveBeenCalledWith('PROOF');
  });

  it('만료되면 "다시 시작하기" CTA로 전환되고 보내기 버튼은 사라진다', async () => {
    vi.spyOn(api, 'useV1PhoneIssue').mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(issuedResult({ expiresAt: new Date(Date.now() - 1000).toISOString() })), isPending: false } as never);
    vi.spyOn(api, 'useV1PhoneVerify').mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

    wrap(<PhoneVerificationCard mode="public" phone="01012345678" onVerified={vi.fn()} />);
    await flush();
    await advance(1100); // 카운트다운이 만료를 반영

    expect(screen.getByText('인증 시간이 지났어요. 다시 시작해 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /다시 시작하기/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '인증 문자 보내기' })).not.toBeInTheDocument();
  });

  it('"다른 방법으로" 토글은 새 채널로 즉시 재발급한다', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Android' });
    const issueMock = vi
      .fn()
      .mockResolvedValueOnce(issuedResult())
      .mockResolvedValueOnce(issuedResult({ qrCode: 'data:image/png;base64,QR' }));
    vi.spyOn(api, 'useV1PhoneIssue').mockReturnValue({ mutateAsync: issueMock, isPending: false } as never);
    vi.spyOn(api, 'useV1PhoneVerify').mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({ verified: false }), isPending: false } as never);

    wrap(<PhoneVerificationCard mode="public" phone="01012345678" onVerified={vi.fn()} />);
    await flush();
    expect(issueMock).toHaveBeenNthCalledWith(1, { phone: '01012345678', channel: 'mobile' });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'QR 코드로 인증 방법 바꾸기' }));
    });
    await flush();

    expect(issueMock).toHaveBeenNthCalledWith(2, { phone: '01012345678', channel: 'desktop' });
    expect(screen.getByAltText('휴대폰 카메라로 스캔하면 인증 문자가 자동으로 준비돼요')).toBeInTheDocument();
  });
});
