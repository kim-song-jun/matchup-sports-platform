import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { v1Post } from '@/lib/api-client';
import { PhoneVerificationRequiredModal } from './phone-verification-required-modal';

const assign = vi.fn();

function setLocation(pathname: string, search = '') {
  vi.stubGlobal('location', { pathname, search, assign } as unknown as Location);
}

function stubApiError(code: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({
        status: 'error',
        statusCode: 403,
        code,
        message: '휴대폰 본인인증을 완료해야 이용할 수 있어요.',
        timestamp: new Date().toISOString(),
      }),
    }),
  );
}

describe('PhoneVerificationRequiredModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    assign.mockReset();
  });

  it('explains the block and sends the user to verification with a way back', async () => {
    setLocation('/tournaments/t-1/apply');
    stubApiError('PHONE_VERIFICATION_REQUIRED');
    render(<PhoneVerificationRequiredModal />);

    // 모달 상태 갱신이 fetch 거절과 함께 일어난다 — act 밖이면 경고만 남고 단언은 통과해 버린다.
    await act(async () => {
      await expect(v1Post('/tournaments/t-1/registrations', {})).rejects.toThrow();
    });

    expect(await screen.findByText('휴대폰 본인인증이 필요해요')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '인증하러 가기' }));
    expect(assign).toHaveBeenCalledWith('/my/phone-verify?redirect=%2Ftournaments%2Ft-1%2Fapply');
  });

  it('stays closed for unrelated failures', async () => {
    setLocation('/tournaments/t-1/apply');
    stubApiError('TOURNAMENT_REGISTRATION_CLOSED');
    render(<PhoneVerificationRequiredModal />);

    await act(async () => {
      await expect(v1Post('/tournaments/t-1/registrations', {})).rejects.toThrow();
    });

    await waitFor(() => expect(screen.queryByText('휴대폰 본인인증이 필요해요')).not.toBeInTheDocument());
    expect(assign).not.toHaveBeenCalled();
  });

  it('does not cover the verification screen itself', async () => {
    setLocation('/my/phone-verify');
    stubApiError('PHONE_VERIFICATION_REQUIRED');
    render(<PhoneVerificationRequiredModal />);

    await act(async () => {
      await expect(v1Post('/verification/phone/confirm', {})).rejects.toThrow();
    });

    await waitFor(() => expect(screen.queryByText('휴대폰 본인인증이 필요해요')).not.toBeInTheDocument());
  });
});
