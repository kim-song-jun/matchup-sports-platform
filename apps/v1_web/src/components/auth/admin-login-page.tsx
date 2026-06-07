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
          <h1 className="tm-text-heading tm-auth-title">업체 운영 로그인</h1>
          <p className="tm-text-body tm-auth-sub">팀장과 운영진 계정으로 로그인 후 운영 워크스페이스로 이동합니다.</p>
          <Link className="tm-btn tm-btn-lg tm-btn-outline tm-btn-block tm-auth-email-link" href={emailHref}>이메일로 운영 로그인</Link>
          <p className="tm-text-caption tm-auth-helper">운영 권한이 있는 팀과 내가 만든 매치만 표시됩니다.</p>
        </div>
        <div>
          <Card pad={16} className="tm-auth-soft-card">
            <div className="tm-text-body-lg">운영 워크스페이스</div>
            <div className="tm-text-caption">로그인 후 팀, 매치, 리뷰 업무를 바로 확인합니다.</div>
          </Card>
          {devLogin}
          <p className="tm-text-caption tm-auth-policy">계속하면 서비스 약관과 개인정보 처리방침에 동의합니다.</p>
        </div>
      </div>
    </AuthFrame>
  );
}
