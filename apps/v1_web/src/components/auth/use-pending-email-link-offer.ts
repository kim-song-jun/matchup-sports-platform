'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/v1-ui/toast';
import { emailLinkPath, readLinkResultQuery } from '@/lib/link-result';
import { clearPendingEmailLink, readPendingEmailLink } from '@/lib/pending-email-link';
import { peekPendingSocialLink } from '@/lib/pending-social-link';
import type { V1AuthMe } from '@/types/api';
import { getPendingSocialSignupRoute } from './social-signup-access';

const PROFILE_DEFERRED_STATUS = 'social_profile_deferred';

const ALREADY_HAS_EMAIL_LOGIN_MESSAGE = '이 계정에는 이미 이메일 로그인이 있어요.';

/**
 * 번호 겹침 안내에서 "로그인하고 이 이메일 연결하기"를 고른 사람이 원래 계정으로 로그인하면, 이메일 로그인 연결 화면을
 * 딱 한 번 열어 준다. 가입 화면에서 이메일을 적어 둔 경우에만 1단계에 그 이메일이 채워지고, 아니면 빈 칸으로 시작한다.
 * 연결 화면이 보관 칸을 읽고 비운다. 가입 화면이 보관한 원래 목적지는 `?redirect=` 로 함께 실어, 연결을 마치거나 미루고
 * 돌아갈 곳을 잃지 않게 한다.
 *
 * 제안하지 않고 칸만 비우는 경우:
 * - 이 계정에 이미 이메일 로그인이 있다(이때만 그 사실을 한 줄로 알린다).
 * - 방금 새 소셜 계정으로 가입 중이다(가입을 이어 가는 계정은 원래 계정이 아니다).
 * - 소셜 연결 결과가 대기 중이거나 이미 보였다 — 자동 이동 둘이 서로의 화면을 덮어쓰지 않도록 연결 결과가 먼저다.
 *   (약관 재동의가 남은 계정만 그 일을 마칠 때까지 기다린다. 소셜 연결 리졸버도 같은 조건에서 기다린다.)
 *
 * 로그인 수단이 여럿이라 각 성공 지점이 아니라 로그인 뒤 항상 지나는 앱 전역 게이트(PendingSocialSignupGate)에서 부른다.
 * 안내 한 줄은 게이트가 그리도록 `toast` 로 돌려준다 — 이동 없이 어느 화면에서든 보여야 한다.
 *
 * @param account 인증이 확인된 현재 계정(`/auth/me`). 로그인 전이거나 아직 확인 중이면 undefined.
 * @param socialLinkRouted 소셜 연결 리졸버가 화면 이동을 시작했는지(`usePendingSocialLinkResolver` 의 `routed`).
 */
export function usePendingEmailLinkOffer(
  account: Pick<V1AuthMe, 'user' | 'termsCompliance'> | undefined,
  socialLinkRouted: RefObject<boolean>,
): { toast: ReactNode } {
  const router = useRouter();
  const { showToast, toast } = useToast();
  // 연결 화면이 칸을 비우기 전에 이 효과가 다시 돌아도(auth/me 갱신) 이동을 두 번 하지 않는다.
  const offeredRef = useRef(false);

  useEffect(() => {
    if (!account || offeredRef.current) return;

    const { onboardingStatus, authProviders } = account.user;
    if (getPendingSocialSignupRoute(onboardingStatus) !== null || onboardingStatus === PROFILE_DEFERRED_STATUS) {
      clearPendingEmailLink();
      return;
    }
    if (account.termsCompliance?.compliant === false) return;
    const socialLinkResultShown = socialLinkRouted.current
      || peekPendingSocialLink() !== null
      || readLinkResultQuery(new URLSearchParams(window.location.search)) !== null;
    if (socialLinkResultShown) {
      clearPendingEmailLink();
      return;
    }

    const pending = readPendingEmailLink();
    if (pending === null) return;

    // 서버 응답에 로그인 수단 목록이 없으면 이메일 로그인이 있는지 알 수 없다 — 제안하지 않는다.
    if (!authProviders) {
      clearPendingEmailLink();
      return;
    }
    if (authProviders.includes('email')) {
      clearPendingEmailLink();
      showToast(ALREADY_HAS_EMAIL_LOGIN_MESSAGE, 'info');
      return;
    }
    offeredRef.current = true;
    router.replace(emailLinkPath(pending.returnTo));
  }, [account, router, showToast, socialLinkRouted]);

  return { toast };
}
