'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Card, ErrorState } from '@/components/v1-ui/primitives';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { AuthedEmailVerificationCard } from './authed-email-verification-card';
import { readEmailVerifyReturnPath } from './email-verify-route';

/**
 * 로그인한 사용자의 이메일 인증 화면(/my/email-verify). 마이 탭 배너의 "인증하기"가 연결된다.
 * 인증번호는 서버가 계정 이메일로 보낸다 — 이 화면은 주소를 보여 주기만 하고 바꾸지 않는다.
 * 확정 성공은 useV1AuthedEmailConfirm 이 authMe 를 다시 읽게 해 마이 탭 배너를 걷어낸다.
 */
export function EmailVerifyPageClient() {
  const searchParams = useSearchParams();
  const returnTo = readEmailVerifyReturnPath(searchParams);
  const authMe = useV1AuthMe();
  const [done, setDone] = useState(false);
  const doneRef = useRef<HTMLDivElement>(null);

  const email = authMe.data?.user.email ?? null;
  const verified = done || authMe.data?.verification?.emailVerified === true;

  // 인증번호 받기·확인 버튼이 화면에서 사라지므로 포커스를 완료 안내로 옮겨 스크린리더가 결과를 읽게 한다.
  useEffect(() => {
    if (verified) doneRef.current?.focus();
  }, [verified]);

  const frame = (children: ReactNode) => (
    <div className="tm-content-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
      {children}
    </div>
  );

  if (verified) {
    return frame(
      <>
        <div ref={doneRef} tabIndex={-1} style={{ outline: 'none' }}>
          <Card pad={16} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={20} color="var(--blue500)" aria-hidden="true" />
            <p className="tm-text-label" style={{ margin: 0 }}>이메일 인증이 완료됐어요.</p>
          </Card>
        </div>
        <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href={returnTo}>
          확인
        </Link>
      </>,
    );
  }

  if (authMe.isPending) {
    return frame(
      <Card pad={16}>
        <p className="tm-text-caption" style={{ margin: 0, color: 'var(--text-caption)' }}>계정 정보를 불러오는 중이에요.</p>
      </Card>,
    );
  }

  if (!authMe.data) {
    return <ErrorState message="계정 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={() => void authMe.refetch()} />;
  }

  if (!email) {
    return frame(
      <>
        <Card pad={16}>
          <p className="tm-text-body" style={{ margin: 0 }}>인증할 이메일이 없어요. 로그인 방법에서 이메일 로그인을 먼저 연결해 주세요.</p>
        </Card>
        <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href="/my/settings/login-methods">
          로그인 방법으로 가기
        </Link>
      </>,
    );
  }

  return frame(
    <>
      <Card pad={16}>
        <p className="tm-text-body" style={{ margin: 0 }}>
          이메일 인증을 마치면 비밀번호를 잊어도 찾을 수 있어요.
        </p>
      </Card>
      <Card pad={16} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <p className="tm-text-caption" style={{ margin: 0, color: 'var(--text-caption)' }}>인증번호를 받을 이메일</p>
        <p className="tm-text-label" style={{ margin: 0, color: 'var(--text-strong)', overflowWrap: 'anywhere' }}>{email}</p>
      </Card>
      <AuthedEmailVerificationCard email={email} onVerified={() => setDone(true)} />
    </>,
  );
}
