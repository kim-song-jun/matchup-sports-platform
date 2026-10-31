'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { EMAIL_LINK_PATH } from '@/lib/link-result';
import { clearPendingEmailLink, readPendingEmailLink } from '@/lib/pending-email-link';
import { peekPendingSocialLink } from '@/lib/pending-social-link';
import type { V1AuthMe } from '@/types/api';
import { getPendingSocialSignupRoute } from './social-signup-access';

const PROFILE_DEFERRED_STATUS = 'social_profile_deferred';

/**
 * 이메일 가입 중 "카카오로 가입했어요"로 나간 사람이 원래 계정으로 로그인하면, 가입 화면에서 입력해 둔 이메일로
 * 이메일 로그인 연결 화면(1단계에 그 이메일이 채워진 채)을 딱 한 번 열어 준다. 연결 화면이 칸을 읽고 비운다.
 *
 * 제안하지 않는 경우 — 이 계정에 이미 이메일 로그인이 있거나, 보관한 이메일이 이미 이 계정의 이메일인 경우 —
 * 에는 칸만 비운다. 가입이 덜 끝났거나 약관 재동의가 남은 계정은 그 일을 마친 뒤에 이어진다(`usePendingSocialLinkResolver` 와 같다).
 * 소셜 연결 토큰이 대기 중이면 그 결과 화면이 먼저이므로 기다린다 — 두 이동이 서로 덮어쓰지 않게.
 *
 * 로그인 수단이 여럿이라 각 성공 지점이 아니라 로그인 뒤 항상 지나는 앱 전역 게이트(PendingSocialSignupGate)에서 부른다.
 *
 * @param account 인증이 확인된 현재 계정(`/auth/me`). 로그인 전이거나 아직 확인 중이면 undefined.
 */
export function usePendingEmailLinkOffer(account: Pick<V1AuthMe, 'user' | 'termsCompliance'> | undefined) {
  const router = useRouter();
  // 연결 화면이 칸을 비우기 전에 이 효과가 다시 돌아도(auth/me 갱신) 이동을 두 번 하지 않는다.
  const offeredRef = useRef(false);

  useEffect(() => {
    if (!account || offeredRef.current) return;
    const { onboardingStatus } = account.user;
    if (getPendingSocialSignupRoute(onboardingStatus) !== null || onboardingStatus === PROFILE_DEFERRED_STATUS) return;
    if (account.termsCompliance?.compliant === false) return;
    if (peekPendingSocialLink() !== null) return;

    const pendingEmail = readPendingEmailLink();
    if (pendingEmail === null) return;

    const { authProviders, email } = account.user;
    // 서버 응답에 로그인 수단 목록이 없으면 이메일 로그인이 있는지 알 수 없다 — 제안하지 않는다.
    if (!authProviders || authProviders.includes('email') || email?.trim().toLowerCase() === pendingEmail) {
      clearPendingEmailLink();
      return;
    }

    offeredRef.current = true;
    router.replace(EMAIL_LINK_PATH);
  }, [account, router]);
}
