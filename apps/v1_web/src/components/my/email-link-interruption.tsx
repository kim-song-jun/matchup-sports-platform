'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { AUTH_WELCOME_STAGE, AuthFrame } from '@/components/auth/auth-page';
import { Button } from '@/components/v1-ui/button';
import { LOGIN_METHODS_PATH } from '@/lib/link-result';
import { RECENT_LOGIN_NOTICE } from './link-result-notice';

export type EmailLinkInterruption = 'recent-login' | 'exists' | 'admin';

const COPY: Record<EmailLinkInterruption, { title: string; body: string }> = {
  'recent-login': RECENT_LOGIN_NOTICE,
  exists: {
    title: '이미 이메일 로그인이 연결돼 있어요',
    body: '이 계정에는 이메일과 비밀번호로 로그인하는 방법이 이미 있어요. 로그인 방법 화면에서 확인해 주세요.',
  },
  admin: {
    title: '이메일 로그인을 연결할 수 없어요',
    body: '운영자 계정에는 이메일 로그인을 연결할 수 없어요. 문의가 필요하면 고객센터에 알려 주세요.',
  },
};

/**
 * 입력을 바꿔도 풀리지 않는 이유로 흐름이 멈췄을 때의 화면. 단계 화면 대신 나타나고, 갈 곳은 하나다.
 * 다시 로그인(recent-login)은 로그아웃한 뒤 이 연결 화면으로 돌아오는 로그인 경로로 보낸다.
 */
export function EmailLinkInterruptionView({ kind, backHref, onRelogin, relogin, mandatory = false }: {
  kind: EmailLinkInterruption;
  /** 상단 뒤로 가기가 가는 곳 — 이 화면에 오기 전에 가려던 곳이 있으면 그곳이다. */
  backHref: string;
  onRelogin: () => void;
  relogin: { pending: boolean; error: string | null };
  mandatory?: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // 화면이 통째로 바뀌므로 스크린리더가 새 상태를 알도록 제목으로 포커스를 옮긴다.
  useEffect(() => {
    headingRef.current?.focus();
  }, [kind]);

  const copy = COPY[kind];
  return (
    <AuthFrame
      stage={AUTH_WELCOME_STAGE}
      topTitle="이메일 로그인 연결"
      backHref={mandatory ? undefined : backHref}
      appBack={!mandatory}
      fixedAction={
        kind === 'recent-login' ? (
          <>
            <Button variant="primary" size="lg" block loading={relogin.pending} onClick={onRelogin}>
              다시 로그인하기
            </Button>
            {relogin.error ? (
              <p className="tm-text-caption" role="alert" style={{ margin: '8px 0 0', textAlign: 'center', color: 'var(--red700)' }}>
                {relogin.error}
              </p>
            ) : null}
          </>
        ) : (
          <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href={mandatory ? '/my/inquiries/new' : LOGIN_METHODS_PATH}>
            {mandatory ? '고객센터 문의하기' : '로그인 방법으로 돌아가기'}
          </Link>
        )
      }
    >
      <div className="tm-auth-body">
        <div className="tm-signup-hero">
          <h1 ref={headingRef} tabIndex={-1} className="tm-text-heading tm-auth-heading">{copy.title}</h1>
          <p className="tm-text-body tm-auth-sub">{mandatory && kind === 'exists' ? '이미 연결된 이메일 로그인 정보가 확인되지 않아요. 고객센터에 문의해 주세요.' : copy.body}</p>
        </div>
      </div>
    </AuthFrame>
  );
}
