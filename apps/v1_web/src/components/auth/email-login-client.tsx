'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/v1-ui/primitives';
import { useV1EmailLogin } from '@/hooks/use-v1-api';
import { sanitizeRedirectPath, saveStoredV1Session } from '@/lib/session-storage';
import { AuthFrame } from './auth-page';
import { getEmailLoginViewModel } from './auth.view-model';

export function EmailLoginClient() {
  const model = getEmailLoginViewModel();
  const router = useRouter();
  const login = useV1EmailLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    login.mutate(
      { email, password },
      {
        onSuccess: (result) => {
          saveStoredV1Session(result.session);
          const redirect = sanitizeRedirectPath(new URLSearchParams(window.location.search).get('redirect'));
          router.replace(redirect ?? '/home');
        },
        onError: (nextError) => {
          setError(nextError instanceof Error ? nextError.message : '로그인에 실패했어요.');
        },
      },
    );
  };

  return (
    <AuthFrame topTitle="이메일 로그인" backHref={model.backHref} className="tm-auth-email-frame">
      <form className="tm-auth-body" id="v1-email-login-form" onSubmit={submit}>
        <h1 className="tm-text-heading tm-auth-heading">{model.title}</h1>
        {model.sub ? <p className="tm-text-body tm-auth-sub">{model.sub}</p> : null}
        <div className="tm-auth-form">
          <label className="tm-auth-field">
            <span className="tm-text-label">이메일</span>
            <input className="tm-input tm-auth-input" onChange={(event) => setEmail(event.target.value)} placeholder="예: me@email.com" required type="email" value={email} />
          </label>
          <label className="tm-auth-field">
            <span className="tm-text-label">비밀번호</span>
            <input className="tm-input tm-auth-input" minLength={8} onChange={(event) => setPassword(event.target.value)} placeholder="비밀번호" required type="password" value={password} />
          </label>
        </div>
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block tm-auth-email-submit" disabled={login.isPending} type="submit">
          {login.isPending ? '로그인 중' : model.primary.label}
        </button>
        {error ? <p className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-error">{error}</p> : null}
        <div className="tm-auth-link-row">
          <Link className="tm-btn tm-btn-sm tm-btn-ghost" href="/auth/password-reset">비밀번호 찾기</Link>
          <Link className="tm-btn tm-btn-sm tm-btn-ghost" href={model.signupHref}>회원가입</Link>
        </div>
        {!error && model.notice ? (
          <Card pad={16} className="tm-auth-soft-card">
            <div className="tm-text-body-lg">{model.notice.title}</div>
            <div className="tm-text-caption">{model.notice.body}</div>
          </Card>
        ) : null}
      </form>
    </AuthFrame>
  );
}
