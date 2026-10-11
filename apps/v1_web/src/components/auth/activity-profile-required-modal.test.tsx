import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { v1Post } from '@/lib/api-client';
import { ActivityProfileRequiredModal } from './activity-profile-required-modal';

const reportClientError = vi.fn();
vi.mock('@/lib/client-error-reporter', () => ({
  reportClientError: (payload: unknown) => reportClientError(payload),
}));

const assign = vi.fn();

function setLocation(pathname: string, search = '', hash = '') {
  vi.stubGlobal('location', { pathname, search, hash, assign } as unknown as Location);
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
        message: '활동하려면 정보를 먼저 입력해 주세요.',
        timestamp: new Date().toISOString(),
      }),
    }),
  );
}

const TITLE = '활동하려면 정보가 필요해요';

describe('ActivityProfileRequiredModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    assign.mockReset();
    reportClientError.mockReset();
  });

  it('403 ACTIVITY_PROFILE_REQUIRED 를 받으면 시트를 띄우고 정보 입력으로 안내하며 클라이언트 오류로 올리지 않는다', async () => {
    setLocation('/matches/m-1', '?tab=info', '#roster');
    stubApiError('ACTIVITY_PROFILE_REQUIRED');
    render(<ActivityProfileRequiredModal />);

    await act(async () => {
      await expect(v1Post('/matches/m-1/participants', {})).rejects.toThrow();
    });

    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    expect(reportClientError).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '정보 입력하기' }));
    expect(assign).toHaveBeenCalledWith('/signup/social?redirect=%2Fmatches%2Fm-1%3Ftab%3Dinfo%23roster');
  });

  it('다음에 할게요로 닫으면 이동하지 않는다', async () => {
    setLocation('/matches/m-1');
    stubApiError('ACTIVITY_PROFILE_REQUIRED');
    render(<ActivityProfileRequiredModal />);

    await act(async () => {
      await expect(v1Post('/matches/m-1/participants', {})).rejects.toThrow();
    });
    fireEvent.click(await screen.findByRole('button', { name: '다음에 할게요' }));

    await waitFor(() => expect(screen.queryByText(TITLE)).not.toBeInTheDocument());
    expect(assign).not.toHaveBeenCalled();
  });

  it('다른 실패에는 뜨지 않고 그 실패는 기존대로 보고한다', async () => {
    setLocation('/matches/m-1');
    stubApiError('MATCH_FULL');
    render(<ActivityProfileRequiredModal />);

    await act(async () => {
      await expect(v1Post('/matches/m-1/participants', {})).rejects.toThrow();
    });

    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    expect(reportClientError).toHaveBeenCalledTimes(1);
  });

  it('정보 입력 화면 자신에서 난 실패는 시트로 덮지 않는다', async () => {
    setLocation('/signup/social');
    stubApiError('ACTIVITY_PROFILE_REQUIRED');
    render(<ActivityProfileRequiredModal />);

    await act(async () => {
      await expect(v1Post('/auth/social-profile', {})).rejects.toThrow();
    });

    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });
});
