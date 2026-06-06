import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/v1-ui/primitives';
import { AuthFrame } from './auth-page';

type AdminLoginPageViewProps = {
  readonly redirect: string;
  readonly devLogin?: ReactNode;
};

export function AdminLoginPageView({ redirect, devLogin }: AdminLoginPageViewProps) {
  const emailHref = `/login/email?${new URLSearchParams({ redirect }).toString()}`;

  return (
    <AuthFrame desktopNav="admin">
      <div className="tm-auth-login">
        <div>
          <div className="tm-auth-logo">T</div>
          <p className="tm-text-label tm-auth-admin-kicker">Teameet 운영</p>
          <h1 className="tm-text-heading tm-auth-title">관리자 로그인</h1>
          <p className="tm-text-body tm-auth-sub">운영자 계정으로 로그인 후 관리자 화면으로 이동합니다.</p>
          <Link className="tm-btn tm-btn-lg tm-btn-outline tm-btn-block tm-auth-email-link" href={emailHref}>이메일로 관리자 로그인</Link>
          <p className="tm-text-caption tm-auth-helper">운영 권한이 없는 계정은 관리자 화면에 접근할 수 없습니다.</p>
        </div>
        <div>
          <Card pad={16} className="tm-auth-soft-card">
            <div className="tm-text-body-lg">운영자 전용</div>
            <div className="tm-text-caption">로그인과 운영 권한 확인 후 열립니다.</div>
          </Card>
          {devLogin}
          <p className="tm-text-caption tm-auth-policy">계속하면 서비스 약관과 개인정보 처리방침에 동의합니다.</p>
        </div>
      </div>
    </AuthFrame>
  );
}
