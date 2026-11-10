import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireActivityProfile } from './require-activity-profile';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  hasPrevious: true,
  onboardingStatus: 'completed' as string | undefined,
  phoneVerified: true,
  noSport: false,
  providers: ['kakao'] as string[],
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, back: mocks.back, replace: mocks.replace }),
}));

vi.mock('@/lib/navigation-history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/navigation-history')>()),
  hasPreviousInAppEntry: () => mocks.hasPrevious,
  markAppInitiatedBack: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AuthMe: () => ({
    data: mocks.onboardingStatus
      ? {
          user: { onboardingStatus: mocks.onboardingStatus, authProviders: mocks.providers },
          verification: { emailVerified: false, phoneVerified: mocks.phoneVerified },
          onboarding: { missing: mocks.noSport ? ['sports'] : [] },
        }
      : undefined,
  }),
}));

describe('RequireActivityProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasPrevious = true;
    mocks.phoneVerified = true;
    mocks.noSport = false;
    mocks.providers = ['kakao'];
    window.history.replaceState(null, '', '/teams/new');
  });

  it('정보 입력을 미룬 계정에는 폼 대신 행동별 시트를 띄우고 입력 화면으로 보낸다', () => {
    mocks.onboardingStatus = 'social_profile_deferred';
    mocks.noSport = true;
    render(
      <RequireActivityProfile title="팀을 만들려면 정보가 필요해요">
        <div>팀 만들기 폼</div>
      </RequireActivityProfile>,
    );

    expect(screen.getByRole('dialog', { name: '팀을 만들려면 2가지가 더 필요해요' })).toBeInTheDocument();
    expect(screen.queryByText('팀 만들기 폼')).not.toBeInTheDocument();
    // 체크리스트: 휴대폰 인증은 끝났고, 기본 정보와 관심 종목이 남았다 — 색이 아니라 글자로 구분한다.
    const items = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(items).toEqual(['휴대폰 인증완료', '이름·성별·생년월일필요', '관심 종목필요']);

    fireEvent.click(screen.getByRole('button', { name: '정보 입력하기' }));
    expect(mocks.push).toHaveBeenCalledWith('/signup/social?redirect=%2Fteams%2Fnew');

    fireEvent.click(screen.getByRole('button', { name: '다음에 할게요' }));
    expect(mocks.back).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('관심 종목만 남았으면 종목 고르기로 보내고 원래 화면으로 돌아오게 한다', () => {
    mocks.onboardingStatus = 'deferred';
    mocks.noSport = true;
    window.history.replaceState(null, '', '/tournaments/t-1/apply?step=2#form');
    render(
      <RequireActivityProfile title="대회에 신청하려면 정보가 필요해요">
        <div>폼</div>
      </RequireActivityProfile>,
    );

    expect(screen.getByRole('dialog', { name: '대회에 신청하려면 1가지가 더 필요해요' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '관심 종목 고르기' }));
    expect(mocks.push).toHaveBeenCalledWith('/onboarding/sport?redirect=%2Ftournaments%2Ft-1%2Fapply%3Fstep%3D2%23form');
  });

  it('종목을 건너뛴 이메일 가입은 막지 않는다', () => {
    mocks.onboardingStatus = 'deferred';
    mocks.noSport = true;
    mocks.providers = ['email'];
    render(
      <RequireActivityProfile title="팀을 만들려면 정보가 필요해요">
        <div>팀 만들기 폼</div>
      </RequireActivityProfile>,
    );
    expect(screen.getByText('팀 만들기 폼')).toBeInTheDocument();
  });

  it('돌아올 경로에 해시도 담는다', () => {
    mocks.onboardingStatus = 'social_profile_deferred';
    window.history.replaceState(null, '', '/teams/abc#member-list');
    render(
      <RequireActivityProfile title="신청하려면 정보가 필요해요">
        <div>폼</div>
      </RequireActivityProfile>,
    );
    fireEvent.click(screen.getByRole('button', { name: '정보 입력하기' }));
    expect(mocks.push).toHaveBeenCalledWith('/signup/social?redirect=%2Fteams%2Fabc%23member-list');
  });

  it('ESC 로도 닫히며 같은 이탈 경로를 탄다', () => {
    mocks.onboardingStatus = 'social_profile_deferred';
    render(
      <RequireActivityProfile title="팀을 만들려면 정보가 필요해요">
        <div>팀 만들기 폼</div>
      </RequireActivityProfile>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mocks.back).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('앱 안에 이전 화면이 없으면(딥링크·새 탭) 다음에 할게요가 홈으로 보낸다', () => {
    mocks.onboardingStatus = 'social_profile_deferred';
    mocks.hasPrevious = false;
    render(
      <RequireActivityProfile title="팀을 만들려면 정보가 필요해요">
        <div>팀 만들기 폼</div>
      </RequireActivityProfile>,
    );

    fireEvent.click(screen.getByRole('button', { name: '다음에 할게요' }));
    expect(mocks.replace).toHaveBeenCalledWith('/home');
    expect(mocks.back).not.toHaveBeenCalled();
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
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
  );
});
