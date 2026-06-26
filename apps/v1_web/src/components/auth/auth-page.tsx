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
            {/* P0 R-X2: 링크 텍스트 blue500(3.71:1 불통과) → blue700(#1b64da, 5.41:1 AA 통과). blue600은 4.49:1로 0.01 미달. */}
            로그인 또는 가입을 진행하면 <Link href="/terms?document=terms" style={{ color: 'var(--blue700)' }}>서비스 이용약관</Link>과{' '}
            <Link href="/terms?document=privacy" style={{ color: 'var(--blue700)' }}>개인정보 처리방침</Link>에 동의하는 것으로 간주돼요.
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
        {/* P2 마이크로인터랙션: .tm-complete-check 키프레임으로 완료 피드백 (globals.css 제공) */}
        <div className="tm-auth-complete-icon tm-complete-check"><CheckMark checked /></div>
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
  // Fill 패턴: 브랜드 배경(background) + 대비 충족 전경 텍스트(foreground).
  // 이전 outline 리팩터(border/color에 브랜드색 재사용)는 카카오 1.28:1 / 네이버 2.25:1로
  // WCAG 2.1 AA(4.5:1) FAIL — 격상 전 fill 패턴으로 복원.
  // disabled(준비 중)은 tm-auth-provider-disabled(grey100 배경, caption 텍스트)로 처리.
  const activeStyle = { background: provider.background, color: provider.foreground, borderColor: 'transparent' };

  if (provider.disabled) {
    return (
      <button
        className="tm-btn tm-btn-md tm-auth-provider-disabled"
        disabled
        aria-label={`${provider.label} 로그인 (준비 중)`}
        type="button"
      >
        {provider.label}
      </button>
    );
  }

  if (provider.href?.startsWith('http')) {
    return (
      <a className="tm-btn tm-btn-md tm-btn-outline tm-pressable" href={provider.href} style={activeStyle}>
        {provider.label}
      </a>
    );
  }

  return provider.href ? (
    <Link className="tm-btn tm-btn-md tm-btn-outline tm-pressable" href={provider.href} prefetch={false} style={activeStyle}>
      {provider.label}
    </Link>
  ) : (
    <button className="tm-btn tm-btn-md tm-btn-outline tm-pressable" style={activeStyle} type="button">
      {provider.label}
    </button>
  );
}

function ExceptionActions({ model }: { model: AuthExceptionViewModel }) {
  /* #22: 픽셀 스페이서 div → gap으로 교체 */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <AuthActionButton action={model.primary} />
      {model.secondary ? <AuthActionButton action={model.secondary} /> : null}
    </div>
  );
}

function SignupActions({ primary, secondary }: { primary: AuthAction; secondary: AuthAction }) {
  /* #22: 픽셀 스페이서 div → gap으로 교체 */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <AuthActionButton action={primary} />
      <AuthActionButton action={secondary} />
    </div>
  );
}

function AuthDivider() {
  return <div className="tm-auth-divider"><span /><em className="tm-text-caption">또는</em><span /></div>;
}

function CheckMark({ checked }: { checked?: boolean }) {
  return <span className={`tm-auth-check ${checked ? 'tm-auth-check-on' : ''}`}>✓</span>;
}

