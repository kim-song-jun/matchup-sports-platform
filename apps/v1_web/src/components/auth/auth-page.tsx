import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/v1-ui/primitives';
import { ChevronLeftIcon } from '@/components/v1-ui/icons';
import { BrandMark } from '@/components/v1-ui/brand-logo';
import type { AuthAction, AuthExceptionViewModel, LoginProvider, LoginViewModel, SignupCompleteViewModel } from './auth.types';

export function LoginPageView({ model }: { model: LoginViewModel }) {
  const card = (
    <AuthFrame>
      <div className="tm-auth-login">
        <div>
          <div className="tm-auth-logo" style={{ background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--grey200)' }}>
            <BrandMark size={42} alt="Teameet" />
          </div>
          <h1 className="tm-text-heading tm-auth-title">{model.heroTitle}</h1>
          <p className="tm-text-body tm-auth-sub">{model.heroSub}</p>
          <Link className="tm-btn tm-btn-lg tm-btn-outline tm-btn-block tm-auth-email-link" href={model.emailHref}>이메일로 로그인</Link>
          <p className="tm-text-caption tm-auth-helper">기존 계정이 있으면 이메일 로그인 후 종목, 실력, 지역 확인으로 이어져요.</p>
        </div>
        <div>
          <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href={model.guestHref}>로그인 없이 시작하기</Link>
          <p className="tm-text-body tm-auth-center">
            아직 계정이 없나요? <Link href={model.signupHref}>회원가입</Link>
          </p>
          {model.providers.length > 0 ? (
            <>
              <AuthDivider />
              <div className="tm-auth-provider-group">
                <div className="tm-auth-provider-row">
                  {model.providers.map((provider) => <ProviderButton key={provider.label} provider={provider} />)}
                </div>
                {model.providers.some((provider) => provider.disabled) ? (
                  <p className="tm-text-caption tm-auth-provider-note">
                    {model.providers.filter((provider) => provider.disabled).map((provider) => provider.label).join('·')} 로그인은 준비 중이에요
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
          <p className="tm-text-caption tm-auth-policy">
            로그인 또는 가입을 진행하면 <Link href="/terms" style={{ color: 'var(--blue500)' }}>서비스 이용약관</Link>과{' '}
            <Link href="/my/settings/legal" style={{ color: 'var(--blue500)' }}>개인정보 처리방침</Link>에 동의하는 것으로 간주돼요.
          </p>
        </div>
      </div>
    </AuthFrame>
  );

  return (
    <div className="tm-auth-login-split">
      {/* Brand panel — hidden on mobile (display:none), shown as left pane on desktop */}
      <div className="tm-auth-split-brand" aria-hidden="true">
        <div className="tm-auth-split-brand-logo" style={{ background: 'var(--surface)' }}>
          <BrandMark size={52} />
        </div>
        <div className="tm-auth-split-brand-wordmark">teameet</div>
        <p className="tm-auth-split-brand-tagline">생활체육 동호인을 위한 AI 스포츠 매칭 플랫폼</p>
        <ul className="tm-auth-split-brand-features" role="list">
          <li className="tm-auth-split-brand-feature">풋살 · 농구 · 배드민턴 등 11개 종목</li>
          <li className="tm-auth-split-brand-feature">AI 기반 실력 · 지역 · 시간 매칭</li>
          <li className="tm-auth-split-brand-feature">팀 매칭 · 용병 · 강좌 · 장터</li>
        </ul>
      </div>
      {/* Card side — on mobile this is the entire page; on desktop it's the right pane */}
      <div className="tm-auth-split-card-side">
        {card}
      </div>
    </div>
  );
}

export function AuthExceptionPageView({ model }: { model: AuthExceptionViewModel }) {
  return (
    <AuthFrame topTitle="로그인 확인" backHref={model.backHref} fixedAction={<ExceptionActions model={model} />}>
      <div className="tm-auth-exception">
        <span className={`tm-badge ${model.tone === 'red' ? 'tm-badge-red' : 'tm-badge-orange'}`}>{model.badge}</span>
        <h1 className="tm-text-heading tm-auth-heading">{model.title}</h1>
        <p className="tm-text-body tm-auth-sub">{model.body}</p>
        <Card pad={16} className={`tm-auth-exception-card tm-auth-exception-card-${model.tone}`}>
          <div className="tm-text-label">안내</div>
          <div className="tm-text-caption">입력하신 정보는 안전하게 유지돼요. 다시 시도해 주세요.</div>
        </Card>
      </div>
    </AuthFrame>
  );
}

export function SignupCompletePageView({ model }: { model: SignupCompleteViewModel }) {
  return (
    <AuthFrame fixedAction={<SignupActions primary={model.primary} secondary={model.secondary} />}>
      <div className="tm-auth-complete">
        <div className="tm-auth-complete-icon"><CheckMark checked /></div>
        <h1 className="tm-text-heading tm-auth-heading">{model.title}</h1>
        <p className="tm-text-body tm-auth-sub">{model.sub}</p>
        <div className="tm-auth-stack">
          {model.steps.map((step) => (
            <Card key={step.title} pad={15} className="tm-auth-step-card">
              <CheckMark checked={step.done} />
              <div>
                <div className="tm-text-body-lg">{step.title}</div>
                <div className="tm-text-caption">{step.body}</div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </AuthFrame>
  );
}

export function AuthFrame({ children, topTitle, backHref, skipHref, fixedAction, className }: { children: ReactNode; topTitle?: string; backHref?: string; skipHref?: string; fixedAction?: ReactNode; className?: string }) {
  return (
    <div className={`tm-auth-frame${className ? ` ${className}` : ''}`}>
      {topTitle || backHref || skipHref ? (
        <header className="tm-auth-topbar">
          <div className="tm-auth-topbar-left">
            {backHref ? (
              <Link className="tm-btn tm-btn-icon tm-btn-ghost" href={backHref} aria-label="뒤로가기">
                <ChevronLeftIcon size={22} strokeWidth={2.2} />
              </Link>
            ) : null}
            {topTitle ? <div className="tm-text-body-lg">{topTitle}</div> : null}
          </div>
          {skipHref ? <Link className="tm-btn tm-btn-sm tm-btn-ghost" href={skipHref}>건너뛰기</Link> : null}
        </header>
      ) : null}
      <main className={`tm-auth-scroll ${fixedAction ? 'tm-auth-scroll-with-cta' : ''} ${topTitle || backHref || skipHref ? '' : 'tm-auth-scroll-full'}`}>
        {children}
      </main>
      {fixedAction ? <div className="tm-auth-fixed-cta">{fixedAction}</div> : null}
    </div>
  );
}

function AuthActionButton({ action }: { action: AuthAction }) {
  const className = `tm-btn tm-btn-lg ${action.disabled ? 'tm-btn-neutral' : action.tone === 'danger' ? 'tm-btn-danger' : action.tone === 'neutral' ? 'tm-btn-neutral' : 'tm-btn-primary'} tm-btn-block`;
  return action.href && !action.disabled ? <Link className={className} href={action.href}>{action.label}</Link> : <button className={className} type="button" disabled={action.disabled}>{action.label}</button>;
}

function ProviderButton({ provider }: { provider: LoginProvider }) {
  const style = { background: provider.background, color: provider.color };

  if (provider.href?.startsWith('http') && !provider.disabled) {
    return (
      <a className="tm-btn tm-btn-md tm-pressable" href={provider.href} style={style}>
        {provider.label}
      </a>
    );
  }

  return provider.href && !provider.disabled ? (
    <Link className="tm-btn tm-btn-md tm-pressable" href={provider.href} prefetch={false} style={style}>
      {provider.label}
    </Link>
  ) : (
    <button
      className={`tm-btn tm-btn-md ${provider.disabled ? 'tm-auth-provider-disabled' : 'tm-pressable'}`}
      disabled={provider.disabled}
      aria-label={provider.disabled ? `${provider.label} 로그인 (준비 중)` : undefined}
      style={provider.disabled ? undefined : style}
      type="button"
    >
      {provider.label}
    </button>
  );
}

function ExceptionActions({ model }: { model: AuthExceptionViewModel }) {
  return (
    <>
      <AuthActionButton action={model.primary} />
      {model.secondary ? <><div style={{ height: 8 }} /><AuthActionButton action={model.secondary} /></> : null}
    </>
  );
}

function SignupActions({ primary, secondary }: { primary: AuthAction; secondary: AuthAction }) {
  return (
    <>
      <AuthActionButton action={primary} />
      <div style={{ height: 8 }} />
      <AuthActionButton action={secondary} />
    </>
  );
}

function AuthDivider() {
  return <div className="tm-auth-divider"><span /><em className="tm-text-caption">또는</em><span /></div>;
}

function CheckMark({ checked }: { checked?: boolean }) {
  return <span className={`tm-auth-check ${checked ? 'tm-auth-check-on' : ''}`}>✓</span>;
}

