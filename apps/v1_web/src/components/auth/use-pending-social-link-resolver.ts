'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useV1LinkPending } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { getSignupIncompleteRoute } from '@/lib/auth-link-errors';
import { buildLinkResultPath, linkResultFromError, linkResultFromSuccess } from '@/lib/link-result';
import { clearPendingSocialLink, readPendingSocialLink } from '@/lib/pending-social-link';
import { sanitizeRedirectPath } from '@/lib/session-storage';
import type { V1AuthMe, V1LinkableProvider } from '@/types/api';
import { getPendingSocialSignupRoute } from './social-signup-access';

const TERMS_RECONSENT_REQUIRED_CODE = 'TERMS_RECONSENT_REQUIRED';
const TERMS_RENEWAL_ROUTE = '/terms?mode=renewal';

/** 새 필수 약관에 동의해야 한다는 403 이면 동의 화면 경로. 경로를 못 읽으면 약관 갱신 화면이다. */
function termsReconsentRoute(error: unknown): string | null {
  if (!(error instanceof V1ApiError) || error.statusCode !== 403 || error.code !== TERMS_RECONSENT_REQUIRED_CODE) return null;
  const next = typeof error.details === 'object' && error.details !== null ? (error.details as { next?: unknown }).next : null;
  const route = typeof next === 'object' && next !== null ? (next as { route?: unknown }).route : null;
  return (typeof route === 'string' ? sanitizeRedirectPath(route) : null) ?? TERMS_RENEWAL_ROUTE;
}

/**
 * 카카오·Apple 로그인이 "이미 팀밋 계정이 있어요"로 막힌 뒤, 안내받은 계정에 어떤 방법으로든 로그인하면
 * 보관해 둔 연결 토큰으로 그 로그인 수단을 이 계정에 붙이고 로그인 방법 화면에서 결과를 보여 준다.
 * 토큰은 처음 충돌한 계정에만 쓰인다 — 다른 계정이면 서버가 거절하고 결과 화면이 직접 연결을 안내한다.
 *
 * 로그인 방법이 이메일·카카오·Apple·가입 직후 자동 로그인으로 여럿이라 각 성공 지점이 아니라
 * 로그인 뒤 항상 지나는 앱 전역 게이트(PendingSocialSignupGate)에서 부른다.
 *
 * - 가입이 덜 끝난 계정에는 붙일 수 없다. 약관 재동의가 필요한 계정도 동의가 끝날 때까지 기다린다.
 *   기다리는 동안 토큰이 만료되면 조용히 사라지지 않게 실패 결과로 안내한다.
 * - 약관 재동의 403 은 토큰을 지우지 않고 동의 화면으로 보낸다. 돌아오면 같은 토큰으로 다시 시도한다.
 *
 * @param account 인증이 확인된 현재 계정(`/auth/me`). 로그인 전이거나 아직 확인 중이면 undefined.
 */
export function usePendingSocialLinkResolver(account: Pick<V1AuthMe, 'user' | 'termsCompliance'> | undefined) {
  const router = useRouter();
  const { mutate: linkPending } = useV1LinkPending();
  // 요청이 끝나기 전에 effect 가 다시 돌아도(auth/me 갱신) 같은 토큰을 두 번 보내지 않는다.
  const inFlightTokenRef = useRef<string | null>(null);
  // 약관 동의를 기다리는 토큰의 제공자. 돌아왔을 때 토큰이 없으면 만료된 것이다.
  const waitingProviderRef = useRef<V1LinkableProvider | null>(null);

  useEffect(() => {
    if (!account) {
      waitingProviderRef.current = null;
      return;
    }
    // 가입을 마친 뒤 토큰이 남아 있으면 그때 이어진다.
    if (getPendingSocialSignupRoute(account.user.onboardingStatus) !== null) return;

    const pending = readPendingSocialLink();
    if (!pending) {
      const expiredProvider = waitingProviderRef.current;
      waitingProviderRef.current = null;
      if (expiredProvider && inFlightTokenRef.current === null) {
        router.replace(buildLinkResultPath({ linkResult: 'failed', provider: expiredProvider }));
      }
      return;
    }
    if (account.termsCompliance?.compliant === false) {
      waitingProviderRef.current = pending.provider;
      return;
    }
    if (inFlightTokenRef.current === pending.linkToken) return;

    inFlightTokenRef.current = pending.linkToken;
    waitingProviderRef.current = null;
    linkPending({ linkToken: pending.linkToken }, {
      onSuccess: (result) => {
        clearPendingSocialLink();
        inFlightTokenRef.current = null;
        router.replace(buildLinkResultPath({ linkResult: linkResultFromSuccess(result), provider: result.provider }));
      },
      onError: (error) => {
        inFlightTokenRef.current = null;
        const reconsentRoute = termsReconsentRoute(error);
        if (reconsentRoute) {
          waitingProviderRef.current = pending.provider;
          router.replace(reconsentRoute);
          return;
        }
        clearPendingSocialLink();
        // 이 계정이 가입 도중이면 연결 결과보다 가입을 이어 가는 화면이 먼저다.
        router.replace(getSignupIncompleteRoute(error) ?? buildLinkResultPath({ linkResult: linkResultFromError(error), provider: pending.provider }));
      },
    });
  }, [account, linkPending, router]);
}
