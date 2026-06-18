import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/v1-ui/primitives';
import { ChevronLeftIcon, MatchIcon, TeamMatchIcon, TrophyIcon } from '@/components/v1-ui/icons';
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
          <ul className="tm-auth-features">
            <li className="tm-auth-feature">
              <span className="tm-auth-feature-icon" aria-hidden="true"><MatchIcon size={16} strokeWidth={2} /></span>
              <span className="tm-text-body">내 종목·실력·지역에 맞는 매치를 추천받아요</span>
            </li>
            <li className="tm-auth-feature">
              <span className="tm-auth-feature-icon" aria-hidden="true"><TeamMatchIcon size={16} strokeWidth={2} /></span>
              <span className="tm-text-body">팀을 만들고 다른 팀과 경기를 잡아요</span>
            </li>
            <li className="tm-auth-feature">
              <span className="tm-auth-feature-icon" aria-hidden="true"><TrophyIcon size={16} strokeWidth={2} /></span>
              <span className="tm-text-body">대회에 참가하고 기록을 쌓아요</span>
            </li>
          </ul>
        </div>
        <div>
          <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block tm-auth-email-link" href={model.emailHref}>이메일로 로그인</Link>
          <Link className="tm-btn tm-btn-lg tm-btn-outline tm-btn-block tm-auth-guest-link" href={model.guestHref}>로그인 없이 시작하기</Link>
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

  // 모바일 우선 — 데스크톱에서도 모바일 폭 프레임(가운데), 모바일은 풀스크린.
  // (이전 50/50 split 은 이 원칙에 맞춰 폐기)
  return card;
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
  // 준비 중(disabled)에도 provider 브랜드색을 그대로 노출 — 회색 비활성 대신
  // 브랜드 배경/텍스트를 인라인으로 적용(tm-auth-provider-disabled 의 grey100 을 덮음).
  // disabled 의미는 cursor:not-allowed + 하단 "준비 중" 안내 + aria-label 로 전달.
  const style = { background: provider.background, color: provider.color, border: 0 };

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
      style={style}
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

