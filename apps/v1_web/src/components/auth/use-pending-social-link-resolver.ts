'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useV1LinkPending } from '@/hooks/use-v1-api';
import { isTransientFailure, isUnauthenticatedError, V1ApiError } from '@/lib/api-client';
import { getSignupIncompleteRoute } from '@/lib/auth-link-errors';
import { buildLinkResultPath, linkResultFromError, linkResultFromSuccess } from '@/lib/link-result';
import { clearPendingSocialLink, takePendingSocialLink } from '@/lib/pending-social-link';
import { sanitizeRedirectPath } from '@/lib/session-storage';
import type { V1AuthMe } from '@/types/api';
import { getPendingSocialSignupRoute } from './social-signup-access';

const TERMS_RECONSENT_REQUIRED_CODE = 'TERMS_RECONSENT_REQUIRED';
/** 네트워크 단절·서버 오류·요청량 초과처럼 다시 보내면 달라질 수 있는 실패를 이 페이지 세션에서 다시 시도하는 상한과 간격. */
const RETRY_LIMIT = 2;
export const RETRY_DELAY_MS = 3000;
const PROFILE_DEFERRED_STATUS = 'social_profile_deferred';
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
 * - 가입이 덜 끝난 계정(정보 입력을 미룬 계정 포함 — 서버가 SIGNUP_INCOMPLETE 로 막는다)에는 붙일 수 없다.
 *   토큰을 남기고 이동 없이 기다린다. 약관 재동의가 필요한 계정도 동의가 끝날 때까지 기다린다.
 *   기다리는 동안 토큰이 만료됐으면 준비된 계정에서 한 번 `expired` 결과로 안내한다.
 * - 대기 값을 읽는 곳 중 만료 표식을 소비하는 것은 여기(`takePendingSocialLink`)뿐이다. 배너·안내 화면은 `peek` 만 쓴다.
 * - 약관 재동의 403 은 토큰을 지우지 않고 동의 화면으로 보낸다. 돌아오면 같은 토큰으로 다시 시도한다.
 * - 다시 보내면 달라질 수 있는 실패(네트워크·5xx·429)는 토큰을 둔 채 상한까지 재시도하고, 확정된 거절(409 계열·
 *   400 토큰 오류·403)만 토큰을 지우고 결과로 이동한다. 401(로그인이 풀림)은 건드리지 않는다.
 *
 * @param account 인증이 확인된 현재 계정(`/auth/me`). 로그인 전이거나 아직 확인 중이면 undefined.
 */
export function usePendingSocialLinkResolver(account: Pick<V1AuthMe, 'user' | 'termsCompliance'> | undefined) {
  const router = useRouter();
  const { mutate: linkPending } = useV1LinkPending();
  // 요청이 끝나기 전에 effect 가 다시 돌아도(auth/me 갱신) 같은 토큰을 두 번 보내지 않는다.
  const inFlightTokenRef = useRef<string | null>(null);
  const attemptsRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 재시도 가능한 실패 뒤 effect 를 다시 돌리는 신호.
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  useEffect(() => {
    if (!account) return;
    // 가입을 마친 뒤, 또는 약관 동의를 마친 뒤 토큰이 남아 있으면 그때 이어진다. 기다리는 동안은 대기 값을 읽지도 않는다.
    const { onboardingStatus } = account.user;
    if (getPendingSocialSignupRoute(onboardingStatus) !== null || onboardingStatus === PROFILE_DEFERRED_STATUS) return;
    if (account.termsCompliance?.compliant === false) return;

    const pending = takePendingSocialLink();
    if (!pending) return;
    if (pending.expired) {
      router.replace(buildLinkResultPath({ linkResult: 'expired', provider: pending.provider }));
      return;
    }
    if (inFlightTokenRef.current === pending.linkToken) return;

    inFlightTokenRef.current = pending.linkToken;
    linkPending({ linkToken: pending.linkToken }, {
      onSuccess: (result) => {
        clearPendingSocialLink();
        inFlightTokenRef.current = null;
        router.replace(buildLinkResultPath({ linkResult: linkResultFromSuccess(result), provider: result.provider }));
      },
      onError: (error) => {
        inFlightTokenRef.current = null;
        // 로그인이 풀린 것이다 — 연결 결과가 아니라 로그인 게이트가 다룰 일이라 토큰도 그대로 둔다.
        if (isUnauthenticatedError(error)) return;
        if (isTransientFailure(error) && attemptsRef.current < RETRY_LIMIT) {
          attemptsRef.current += 1;
          retryTimerRef.current = setTimeout(() => setRetryTick((tick) => tick + 1), RETRY_DELAY_MS);
          return;
        }
        const reconsentRoute = termsReconsentRoute(error);
        if (reconsentRoute) {
          router.replace(reconsentRoute);
          return;
        }
        clearPendingSocialLink();
        // 이 계정이 가입 도중이면 연결 결과보다 가입을 이어 가는 화면이 먼저다.
        router.replace(getSignupIncompleteRoute(error) ?? buildLinkResultPath({ linkResult: linkResultFromError(error), provider: pending.provider }));
      },
    });
  }, [account, linkPending, retryTick, router]);
}
