'use client';

import { useCallback } from 'react';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { savePendingSocialLink } from '@/lib/pending-social-link';
import type { V1SignInThenLinkDetails } from '@/types/api';
import { autoLinkPromise } from './sign-in-then-link-copy';
import { getPendingSocialSignupRoute } from './social-signup-access';
import { useSignOutAndLeave } from './use-sign-out-and-leave';

/**
 * 소셜 가입 진행 중(약관·프로필 입력) 화면에서 빠져나가는 유일한 경로.
 *
 * 이 단계의 계정은 카카오 신원만 있고 프로필이 비어 있어, PendingSocialSignupGate 가
 * 앱 전역에서 다른 경로를 전부 되돌린다(그래서 브라우저 뒤로가기·홈이 먹히지 않는다).
 * 게이트를 푸는 대신 "가입을 그만두고 로그아웃"이라는 명시적 출구를 준다 —
 * 서버도 pending 상태에서 /auth/logout 만은 허용하도록 열어 둔 설계다.
 */
export function useSocialSignupExit({ onboardingStatus }: { onboardingStatus?: string | null } = {}) {
  const { confirm, ConfirmModal } = useConfirm();
  // 약관·프로필 단계의 가입 대기 계정은 서버 가드가 푸시 등록 API 를 막아 등록이 없다. 프로필을
  // 미룬(social_profile_deferred) 계정은 알림 쓰기가 열려 있어 등록했을 수 있으므로 해지를 시도한다.
  const revokePush = getPendingSocialSignupRoute(onboardingStatus) === null;
  const { signOutAndLeave, pending, error } = useSignOutAndLeave({ revokePush });

  /** 로그아웃 뒤 하드 내비게이션으로 나간다. 실패하면 서버 세션이 남아 게이트가 되돌려 보내므로 알린다. */
  const leaveTo = useCallback(
    (path: string, onSignedOut?: () => void) => signOutAndLeave(path, {
      failureMessage: '가입 취소를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.',
      onSignedOut,
    }),
    [signOutAndLeave],
  );

  const exit = useCallback(async () => {
    const confirmed = await confirm({
      title: '가입을 그만둘까요?',
      message: '지금까지 입력한 내용은 저장되지 않아요. 다시 카카오로 로그인하면 이어서 진행할 수 있어요.',
      confirmLabel: '그만두기',
      cancelLabel: '계속 쓰기',
      tone: 'danger',
    });
    if (!confirmed) return;

    await leaveTo('/login');
  }, [confirm, leaveTo]);

  /**
   * 번호 중복으로 "원래 방법으로 로그인"해야 할 때의 출구. 로그아웃이 끝난 뒤 연결 토큰을 보관하고 이동하면,
   * 로그인 직후 앱 전역 게이트가 그 토큰으로 이 소셜 로그인을 원래 계정에 자동 연결한다.
   * 토큰은 로그아웃 정리(대기 칸 삭제)보다 늦게 써야 하므로 로그아웃 전에는 저장하지 않는다.
   * `confirmFirst` 는 입력 중이던 가입 내용을 버리는 선택(로그인)에 쓴다.
   */
  const leaveWithPendingLink = useCallback(async (
    path: string,
    hint: V1SignInThenLinkDetails,
    { confirmFirst }: { confirmFirst: boolean },
  ) => {
    if (confirmFirst) {
      const confirmed = await confirm({
        title: '가입을 그만두고 로그인할까요?',
        message: `지금까지 입력한 내용은 저장되지 않아요. ${autoLinkPromise(hint.provider)}`,
        confirmLabel: '로그인하러 가기',
        cancelLabel: '취소',
      });
      if (!confirmed) return;
    }
    await leaveTo(path, () => { savePendingSocialLink(hint); });
  }, [confirm, leaveTo]);

  return { exit, leaveTo, leaveWithPendingLink, ConfirmModal, error, pending };
}
