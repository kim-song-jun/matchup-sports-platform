'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { isUnauthenticatedError, retryTransientFailure } from '@/lib/api-client';
import {
  clearStoredV1Session,
  sanitizeRedirectPath,
  shouldProbeV1Session,
} from '@/lib/session-storage';
import { disconnectV1Socket } from '@/lib/v1-socket';
import { BrandMark } from '@/components/v1-ui/brand-logo';
import { ErrorState } from '@/components/v1-ui/primitives';

type SessionEntryGateProps = {
  mode: 'root' | 'login';
  children?: ReactNode;
};

export function SessionEntryGate({ mode, children }: SessionEntryGateProps) {
  const router = useRouter();
  const [hasSessionHint, setHasSessionHint] = useState<boolean | null>(null);
  // 4xx는 재시도해도 답이 같으니 즉시 해당 경로로 보내고, 일시 오류만 몇 번 다시 시도한다.
  const authMe = useV1AuthMe({ enabled: hasSessionHint === true, retry: retryTransientFailure });

  useEffect(() => {
    setHasSessionHint(shouldProbeV1Session());
  }, []);

  useEffect(() => {
    if (hasSessionHint === null) return;

    if (!hasSessionHint) {
      // router.replace()는 로그인 상태에서 prefetch된 /login 인스턴스를 재사용해
      // 세션 무효화 이전 스냅샷에 멈출 수 있다(하드 네비게이션으로 우회).
      if (mode === 'root') window.location.replace('/login');
      return;
    }

    if (authMe.isSuccess) {
      const redirect = sanitizeRedirectPath(new URLSearchParams(window.location.search).get('redirect'));
      router.replace(redirect ?? '/home');
      return;
    }

    if (authMe.isError && !authMe.isFetching && isUnauthenticatedError(authMe.error)) {
      clearStoredV1Session();
      disconnectV1Socket();
      setHasSessionHint(false);
      if (mode === 'root') window.location.replace('/login');
    }
  }, [authMe.error, authMe.isError, authMe.isFetching, authMe.isSuccess, hasSessionHint, mode, router]);

  if (mode === 'login' && (hasSessionHint === false || (authMe.isError && isUnauthenticatedError(authMe.error)))) {
    return <>{children}</>;
  }

  // 401이 아닌 오류에서는 로그인 폼으로 내려보내지 않는다 — 세션이 멀쩡한데도 다시
  // 로그인하게 만들기 때문이다. 대신 재시도 경로를 준다. 이 분기가 없으면 재시도를 모두
  // 소진한 뒤 "로그인 정보를 확인하고 있어요." 화면에서 영영 빠져나오지 못한다.
  if (
    hasSessionHint === true
    && authMe.isError
    && !authMe.isFetching
    && !isUnauthenticatedError(authMe.error)
  ) {
    return (
      <ErrorState
        message={'로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'}
        onRetry={() => void authMe.refetch()}
      />
    );
  }

  return <SessionFallback />;
}

export function SessionFallback() {
  return (
    // 셸 승격 후 AppChrome의 <main class="tm-scroll-area"> 안에 중첩되므로
    // <main> 랜드마크 중복을 피하기 위해 div로 렌더한다 (tm-auth-frame 셀렉터는 태그와 무관)
    <div className="tm-auth-frame">
      <div className="tm-auth-scroll tm-auth-scroll-full">
        <div className="tm-auth-login">
          <div>
            <div className="tm-auth-logo" style={{ background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--grey200)' }}>
              <BrandMark size={42} alt="Teameet" />
            </div>
            <h1 className="tm-text-heading tm-auth-title">Teameet</h1>
            <p className="tm-text-body tm-auth-sub">로그인 정보를 확인하고 있어요.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
