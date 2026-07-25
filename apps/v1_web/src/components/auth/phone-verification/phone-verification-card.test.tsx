import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhoneVerificationCard } from './phone-verification-card';
import * as api from '@/hooks/use-v1-api';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

/** pending microtask/timer(예: mutateAsync resolve, useEffect)를 플러시(fake timer 하에서 waitFor 대신 사용). */
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

function mutation<T>(resolved: T) {
  return { mutateAsync: vi.fn().mockResolvedValue(resolved), isPending: false } as never;
}

function rejectingMutation(error: unknown) {
  return { mutateAsync: vi.fn().mockRejectedValue(error), isPending: false } as never;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('PhoneVerificationCard', () => {
  it('"인증번호 받기" 클릭 시 issue를 호출하고 코드 입력 필드·확인 버튼을 노출한다', async () => {
    const issueMock = vi.fn().mockResolvedValue({ expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
    vi.spyOn(api, 'useV1PhoneIssue').mockReturnValue({ mutateAsync: issueMock, isPending: false } as never);
    vi.spyOn(api, 'useV1PhoneVerify').mockReturnValue(mutation({ verified: false }));

    wrap(<PhoneVerificationCard mode="public" phone="01012345678" onVerified={vi.fn()} />);

    expect(screen.queryByLabelText('인증번호 6자리')).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
    });
    await flush();

    expect(issueMock).toHaveBeenCalledWith({ phone: '01012345678' });
    expect(screen.getByLabelText('인증번호 6자리')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
  });

  it('public: 코드 입력 후 확인 클릭 시 verify를 호출하고 성공하면 proofToken으로 onVerified를 호출한다', async () => {
    vi.spyOn(api, 'useV1PhoneIssue').mockReturnValue(
      mutation({ expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() }),
    );
    const verifyMock = vi.fn().mockResolvedValue({ verified: true, proofToken: 'PROOF' });
    vi.spyOn(api, 'useV1PhoneVerify').mockReturnValue({ mutateAsync: verifyMock, isPending: false } as never);
    const onVerified = vi.fn();

    wrap(<PhoneVerificationCard mode="public" phone="01012345678" onVerified={onVerified} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
    });
    await flush();

    fireEvent.change(screen.getByLabelText('인증번호 6자리'), { target: { value: '123456' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '확인' }));
    });
    await flush();

    expect(verifyMock).toHaveBeenCalledWith({ phone: '01012345678', code: '123456' });
    expect(onVerified).toHaveBeenCalledWith('PROOF');
    expect(screen.getByText('휴대폰 본인인증이 완료됐어요.')).toBeInTheDocument();
  });

  it('authed: 코드 입력 후 확인 클릭 시 confirm을 호출하고 성공하면 인자 없이 onVerified를 호출한다', async () => {
    vi.spyOn(api, 'useV1AuthedPhoneRequest').mockReturnValue(
      mutation({ sent: true, channel: 'phone' as const }),
    );
    const confirmMock = vi.fn().mockResolvedValue({
      verified: true,
      verification: { emailVerified: true, phoneVerified: true },
    });
    vi.spyOn(api, 'useV1AuthedPhoneConfirm').mockReturnValue({ mutateAsync: confirmMock, isPending: false } as never);
    const onVerified = vi.fn();

    wrap(<PhoneVerificationCard mode="authed" phone="01012345678" onVerified={onVerified} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
    });
    await flush();

    fireEvent.change(screen.getByLabelText('인증번호 6자리'), { target: { value: '654321' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '확인' }));
    });
    await flush();

    expect(confirmMock).toHaveBeenCalledWith({ code: '654321' });
    expect(onVerified).toHaveBeenCalledWith();
  });

  it('오코드로 verify가 실패하면 에러 메시지를 노출하고 onVerified는 호출하지 않는다', async () => {
    vi.spyOn(api, 'useV1PhoneIssue').mockReturnValue(
      mutation({ expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() }),
    );
    vi.spyOn(api, 'useV1PhoneVerify').mockReturnValue(
      rejectingMutation({ message: '인증번호가 올바르지 않아요.' }),
    );
    const onVerified = vi.fn();

    wrap(<PhoneVerificationCard mode="public" phone="01012345678" onVerified={onVerified} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
    });
    await flush();

    fireEvent.change(screen.getByLabelText('인증번호 6자리'), { target: { value: '000000' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '확인' }));
    });
    await flush();

    expect(screen.getByRole('alert')).toHaveTextContent('인증번호가 올바르지 않아요.');
    expect(onVerified).not.toHaveBeenCalled();
    expect(screen.queryByText('휴대폰 본인인증이 완료됐어요.')).not.toBeInTheDocument();
  });

  it('devCode가 응답에 포함되면 입력 필드를 devCode로 프리필한다', async () => {
    vi.spyOn(api, 'useV1PhoneIssue').mockReturnValue(
      mutation({ expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), devCode: '135790' }),
    );
    vi.spyOn(api, 'useV1PhoneVerify').mockReturnValue(mutation({ verified: false }));

    wrap(<PhoneVerificationCard mode="public" phone="01012345678" onVerified={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
    });
    await flush();

    expect(screen.getByLabelText('인증번호 6자리')).toHaveValue('135790');
  });

  it('재전송 쿨다운 중에는 "다시 받기" 버튼이 비활성화된다', async () => {
    vi.spyOn(api, 'useV1PhoneIssue').mockReturnValue(
      mutation({ expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() }),
    );
    vi.spyOn(api, 'useV1PhoneVerify').mockReturnValue(mutation({ verified: false }));

    wrap(<PhoneVerificationCard mode="public" phone="01012345678" onVerified={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
    });
    await flush();

    const resendButton = screen.getByRole('button', { name: /다시 받기/ });
    expect(resendButton).toBeDisabled();

    await advance(30 * 1000 + 100);
    expect(screen.getByRole('button', { name: '다시 받기' })).toBeEnabled();
  });

  it('만료되면 입력이 비활성화되고 다시 받기를 안내한다', async () => {
    vi.spyOn(api, 'useV1PhoneIssue').mockReturnValue(
      mutation({ expiresAt: new Date(Date.now() + 1000).toISOString() }),
    );
    vi.spyOn(api, 'useV1PhoneVerify').mockReturnValue(mutation({ verified: false }));

    wrap(<PhoneVerificationCard mode="public" phone="01012345678" onVerified={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
    });
    await flush();
    await advance(1200);

    expect(screen.getByText('인증번호를 다시 받아 주세요')).toBeInTheDocument();
    expect(screen.getByLabelText('인증번호 6자리')).toBeDisabled();
  });

  it('phone prop이 바뀌면 idle 상태로 리셋되어 이전 번호 코드로 verify하지 않는다', async () => {
    vi.spyOn(api, 'useV1PhoneIssue').mockReturnValue(
      mutation({ expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), devCode: '111111' }),
    );
    vi.spyOn(api, 'useV1PhoneVerify').mockReturnValue(mutation({ verified: false }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onVerified = vi.fn();
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <PhoneVerificationCard mode="public" phone="01011112222" onVerified={onVerified} />
      </QueryClientProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
    });
    await flush();
    expect(screen.getByLabelText('인증번호 6자리')).toBeInTheDocument();

    // 번호를 다른 11자리로 변경 → idle 리셋(입력 필드 사라지고 "인증번호 받기"로 복귀)
    rerender(
      <QueryClientProvider client={qc}>
        <PhoneVerificationCard mode="public" phone="01033334444" onVerified={onVerified} />
      </QueryClientProvider>,
    );
    await flush();

    expect(screen.queryByLabelText('인증번호 6자리')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeInTheDocument();
  });
});
