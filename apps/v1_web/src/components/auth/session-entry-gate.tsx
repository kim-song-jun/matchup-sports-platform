'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import {
  clearStoredV1Session,
  sanitizeRedirectPath,
  shouldProbeV1Session,
} from '@/lib/session-storage';
import { disconnectV1Socket } from '@/lib/v1-socket';
import { BrandMark } from '@/components/v1-ui/brand-logo';

type SessionEntryGateProps = {
  mode: 'root' | 'login';
  children?: ReactNode;
};

export function SessionEntryGate({ mode, children }: SessionEntryGateProps) {
  const router = useRouter();
  const [hasSessionHint, setHasSessionHint] = useState<boolean | null>(null);
  const authMe = useV1AuthMe({ enabled: hasSessionHint === true, retry: false });

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

    if (authMe.isError && !authMe.isFetching && isUnauthenticated(authMe.error)) {
      clearStoredV1Session();
      disconnectV1Socket();
      setHasSessionHint(false);
      if (mode === 'root') window.location.replace('/login');
    }
  }, [authMe.error, authMe.isError, authMe.isFetching, authMe.isSuccess, hasSessionHint, mode, router]);

  if (mode === 'login' && (hasSessionHint === false || (authMe.isError && isUnauthenticated(authMe.error)))) {
    return <>{children}</>;
  }

  return <SessionFallback />;
}

function isUnauthenticated(error: unknown) {
  return error instanceof V1ApiError
    && (error.statusCode === 401 || error.code === 'UNAUTHENTICATED');
}

export function SessionFallback() {
  return (
    <main className="tm-auth-frame">
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
    </main>
  );
}
