'use client';

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { emailLinkPath, readLinkResultQuery } from '@/lib/link-result';
import { clearPendingEmailLink, readPendingEmailLink } from '@/lib/pending-email-link';
import { peekPendingSocialLink } from '@/lib/pending-social-link';
import type { V1AuthMe } from '@/types/api';
import { getPendingSocialSignupRoute } from './social-signup-access';

const PROFILE_DEFERRED_STATUS = 'social_profile_deferred';

/**
 * 이메일 가입 중 "카카오로 가입했어요"로 나간 사람이 원래 계정으로 로그인하면, 가입 화면에서 입력해 둔 이메일로
 * 이메일 로그인 연결 화면(1단계에 그 이메일이 채워진 채)을 딱 한 번 열어 준다. 연결 화면이 칸을 읽고 비운다.
 * 가입 화면이 보관한 원래 목적지는 `?redirect=` 로 함께 실어, 연결을 마치거나 미루고 돌아갈 곳을 잃지 않게 한다.
 *
 * 제안하지 않고 칸만 비우는 경우:
 * - 이 계정에 이미 이메일 로그인이 있거나, 보관한 이메일이 이미 이 계정의 이메일이다.
 * - 방금 새 소셜 계정으로 가입 중이다(가입을 이어 가는 계정은 원래 계정이 아니다).
 * - 소셜 연결 결과가 대기 중이거나 이미 보였다 — 자동 이동 둘이 서로의 화면을 덮어쓰지 않도록 연결 결과가 먼저다.
 *   (약관 재동의가 남은 계정만 그 일을 마칠 때까지 기다린다. 소셜 연결 리졸버도 같은 조건에서 기다린다.)
 *
 * 로그인 수단이 여럿이라 각 성공 지점이 아니라 로그인 뒤 항상 지나는 앱 전역 게이트(PendingSocialSignupGate)에서 부른다.
 *
 * @param account 인증이 확인된 현재 계정(`/auth/me`). 로그인 전이거나 아직 확인 중이면 undefined.
 * @param socialLinkRouted 소셜 연결 리졸버가 화면 이동을 시작했는지(`usePendingSocialLinkResolver` 의 `routed`).
 */
export function usePendingEmailLinkOffer(
  account: Pick<V1AuthMe, 'user' | 'termsCompliance'> | undefined,
  socialLinkRouted: RefObject<boolean>,
) {
  const router = useRouter();
  // 연결 화면이 칸을 비우기 전에 이 효과가 다시 돌아도(auth/me 갱신) 이동을 두 번 하지 않는다.
  const offeredRef = useRef(false);

  useEffect(() => {
    if (!account || offeredRef.current) return;

    const { onboardingStatus, authProviders, email } = account.user;
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
    if (!authProviders || authProviders.includes('email') || email?.trim().toLowerCase() === pending.email) {
      clearPendingEmailLink();
      return;
    }

    offeredRef.current = true;
    router.replace(emailLinkPath(pending.returnTo));
  }, [account, router, socialLinkRouted]);
}
