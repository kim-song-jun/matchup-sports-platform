import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireActivityProfile } from './require-activity-profile';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  onboardingStatus: 'completed' as string | undefined,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, back: mocks.back }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AuthMe: () => ({
    data: mocks.onboardingStatus ? { user: { onboardingStatus: mocks.onboardingStatus } } : undefined,
  }),
}));

describe('RequireActivityProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/teams/new');
  });

  it('정보 입력을 미룬 계정에는 폼 대신 행동별 안내를 보여 주고 입력 화면으로 보낸다', () => {
    mocks.onboardingStatus = 'social_profile_deferred';
    render(
      <RequireActivityProfile title="팀을 만들려면 정보가 필요해요">
        <div>팀 만들기 폼</div>
      </RequireActivityProfile>,
    );

    expect(screen.getByText('팀을 만들려면 정보가 필요해요')).toBeInTheDocument();
    expect(screen.queryByText('팀 만들기 폼')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '정보 입력하기' }));
    expect(mocks.push).toHaveBeenCalledWith('/signup/social?redirect=%2Fteams%2Fnew');

    fireEvent.click(screen.getByRole('button', { name: '다음에 할게요' }));
    expect(mocks.back).toHaveBeenCalledTimes(1);
  });

  it.each(['completed', 'social_profile_required', undefined] as const)(
    '대조군 - 상태 %s 이면 폼을 그대로 보여 준다',
    (status) => {
      mocks.onboardingStatus = status;
      render(
        <RequireActivityProfile title="팀을 만들려면 정보가 필요해요">
          <div>팀 만들기 폼</div>
        </RequireActivityProfile>,
      );

      expect(screen.getByText('팀 만들기 폼')).toBeInTheDocument();
      expect(screen.queryByText('팀을 만들려면 정보가 필요해요')).not.toBeInTheDocument();
    },
  );
});
