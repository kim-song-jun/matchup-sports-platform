import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSocialSignupExit } from './use-social-signup-exit';

const signOut = vi.hoisted(() => ({ signOutAndLeave: vi.fn() }));

vi.mock('./use-sign-out-and-leave', () => ({
  useSignOutAndLeave: () => ({ signOutAndLeave: signOut.signOutAndLeave, pending: false, error: null }),
}));

beforeEach(() => signOut.signOutAndLeave.mockReset());

async function leave(onboardingStatus?: string | null) {
  const { result } = renderHook(() => useSocialSignupExit({ onboardingStatus }));
  await act(() => result.current.leaveTo('/login'));
  return signOut.signOutAndLeave.mock.calls[0];
}

describe('useSocialSignupExit — 기기 푸시 해지 여부', () => {
  // 서버 가드가 푸시 등록 API 를 막는 가입 대기 상태는 등록이 없으니 해지를 건너뛴다.
  it.each(['social_terms_required', 'social_profile_required'])('%s 는 해지를 건너뛴다', async (status) => {
    const [path, options] = await leave(status);

    expect(path).toBe('/login');
    expect(options.skipPushRevoke).toBe(true);
  });

  // 프로필을 미룬 계정은 알림 쓰기가 열려 있어 등록했을 수 있다.
  it.each(['social_profile_deferred', 'completed', null, undefined])('%s 는 해지를 시도한다', async (status) => {
    const [, options] = await leave(status);

    expect(options.skipPushRevoke).toBe(false);
  });

  it('로그아웃 실패 문구는 가입 취소 기준이다', async () => {
    const [, options] = await leave('social_profile_required');

    expect(options.failureMessage).toBe('가입 취소를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.');
  });
});
