'use client';

import Link from 'next/link';
import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { Card } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { BrandMark } from '@/components/v1-ui/brand-logo';
import { EyeIcon, EyeOffIcon } from '@/components/v1-ui/icons';
import { useV1EmailLogin } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { trackEvent } from '@/lib/analytics';
import { clearV1IdentityCache } from '@/lib/query-keys';
import { sanitizeRedirectPath, saveStoredV1Session } from '@/lib/session-storage';
import { AuthFrame } from './auth-page';
import { getEmailLoginViewModel } from './auth.view-model';

function mapEmailLoginError(err: unknown): string {
  if (err instanceof V1ApiError) {
    if (err.code === 'UNAUTHENTICATED') return '이메일이나 비밀번호를 다시 확인해 주세요.';
    if (err.code === 'PERMISSION_DENIED') return '로그인이 제한된 계정이에요. 고객센터에서 상태를 확인해 주세요.';
  }
  return '지금은 로그인할 수 없어요. 잠시 후 다시 시도해 주세요.';
}

export function EmailLoginClient() {
  const model = getEmailLoginViewModel();
  const router = useRouter();
  const queryClient = useQueryClient();
  const login = useV1EmailLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // isPending 은 리렌더 이후에나 반영되므로, 같은 이벤트 루프 틱에서 두 번 눌리는
  // 극단적인 케이스(연타/마우스 더블클릭 버그 등)까지 막으려면 ref 기반 동기 락이 필요하다.
  const submitBusyRef = useRef(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitBusyRef.current) return;
    submitBusyRef.current = true;
    setError(null);

    login.mutate(
      { email, password },
      {
        onSuccess: (result) => {
          saveStoredV1Session(result.session);
          clearV1IdentityCache(queryClient);
          trackEvent('login', { method: 'email' });
          const redirect = sanitizeRedirectPath(new URLSearchParams(window.location.search).get('redirect'));
          const apiNext = sanitizeRedirectPath(result.next?.route);
          if (apiNext?.startsWith('/terms?mode=renewal')) {
            const separator = apiNext.includes('?') ? '&' : '?';
            router.replace(redirect ? `${apiNext}${separator}redirect=${encodeURIComponent(redirect)}` : apiNext);
            return;
          }
          router.replace(redirect ?? apiNext ?? '/home');
        },
        onError: (nextError) => {
          trackEvent('login_failed', { method: 'email', reason: nextError instanceof V1ApiError ? nextError.code : 'unknown' });
          setError(mapEmailLoginError(nextError));
        },
        onSettled: () => {
          submitBusyRef.current = false;
        },
      },
    );
  };

  return (
    <AuthFrame topTitle="이메일 로그인" backHref={model.backHref} className="tm-auth-email-frame">
      <form className="tm-auth-body" id="v1-email-login-form" onSubmit={submit}>
        <div className="tm-auth-logo" style={{ background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--grey200)' }}>
          <BrandMark size={42} alt="Teameet" />
        </div>
        <h1 className="tm-text-heading tm-auth-heading">{model.title}</h1>
        {model.sub ? <p className="tm-text-body tm-auth-sub">{model.sub}</p> : null}
        <div className="tm-auth-form">
          <label className="tm-auth-field">
            <span className="tm-text-label">이메일</span>
            <input
              className={`tm-input tm-auth-input${error ? ' tm-auth-input-error' : ''}`}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="예: me@email.com"
              required
              type="email"
              value={email}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'email-login-error' : undefined}
            />
          </label>
          <label className="tm-auth-field">
            <span className="tm-text-label">비밀번호</span>
            <span className="tm-auth-password-field">
              <input
                className={`tm-input tm-auth-input${error ? ' tm-auth-input-error' : ''}`}
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호"
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'email-login-error' : undefined}
              />
              <button
                className="tm-auth-password-toggle"
                type="button"
                aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOffIcon size={20} strokeWidth={1.8} /> : <EyeIcon size={20} strokeWidth={1.8} />}
              </button>
            </span>
          </label>
          {error ? (
            <div className="tm-auth-inline-error" id="email-login-error" role="alert">
              <AlertCircle aria-hidden="true" size={17} strokeWidth={2.2} />
              <span className="tm-text-caption">{error}</span>
            </div>
          ) : null}
        </div>
        <Button className="tm-auth-email-submit" block loading={login.isPending} size="lg" type="submit" variant="primary">
          {model.primary.label}
        </Button>
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
