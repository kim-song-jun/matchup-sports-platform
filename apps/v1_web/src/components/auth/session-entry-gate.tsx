'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { clearStoredV1Session, hasStoredV1Session, sanitizeRedirectPath } from '@/lib/session-storage';
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
    setHasSessionHint(hasStoredV1Session());
  }, []);

  useEffect(() => {
    if (hasSessionHint === null) return;

    if (!hasSessionHint) {
      if (mode === 'root') router.replace('/login');
      return;
    }

    if (authMe.isSuccess) {
      const redirect = sanitizeRedirectPath(new URLSearchParams(window.location.search).get('redirect'));
      router.replace(redirect ?? '/home');
      return;
    }

    if (authMe.isError) {
      clearStoredV1Session();
      if (mode === 'root') router.replace('/login');
    }
  }, [authMe.isError, authMe.isSuccess, hasSessionHint, mode, router]);

  if (mode === 'login' && (hasSessionHint === false || authMe.isError)) {
    return <>{children}</>;
  }

  return <SessionFallback />;
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
