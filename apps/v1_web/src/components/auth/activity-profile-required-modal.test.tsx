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

function stubApiError(code: string, details?: unknown) {
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
        details,
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

  it('서버가 알려 준 남은 항목을 체크리스트로 보여 주고 첫 항목 화면으로 보낸 뒤 원래 화면으로 돌아오게 한다', async () => {
    setLocation('/teams/new', '?from=home');
    stubApiError('ACTIVITY_PROFILE_REQUIRED', { missing: ['interestSport'], next: { route: '/onboarding/sport' } });
    render(<ActivityProfileRequiredModal />);

    await act(async () => {
      await expect(v1Post('/teams', {})).rejects.toThrow();
    });

    expect(await screen.findByText('1가지가 더 필요해요')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '휴대폰 인증완료',
      '이름·성별·생년월일완료',
      '관심 종목필요',
    ]);
    fireEvent.click(screen.getByRole('button', { name: '관심 종목 고르기' }));
    expect(assign).toHaveBeenCalledWith('/onboarding/sport?redirect=%2Fteams%2Fnew%3Ffrom%3Dhome');
  });

  it('휴대폰이 먼저 남았으면 정보 입력 화면으로 보낸다', async () => {
    setLocation('/teams/new');
    stubApiError('ACTIVITY_PROFILE_REQUIRED', { missing: ['phone', 'basicProfile', 'interestSport'] });
    render(<ActivityProfileRequiredModal />);

    await act(async () => {
      await expect(v1Post('/teams', {})).rejects.toThrow();
    });

    expect(await screen.findByText('3가지가 더 필요해요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '정보 입력하기' }));
    expect(assign).toHaveBeenCalledWith('/signup/social?redirect=%2Fteams%2Fnew');
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
