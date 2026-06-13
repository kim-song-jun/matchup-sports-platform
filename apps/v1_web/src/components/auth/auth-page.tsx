import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/v1-ui/primitives';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/v1-ui/icons';
import type { AuthAction, AuthExceptionViewModel, EmailLoginViewModel, LoginProvider, LoginViewModel, OnboardingOption, OnboardingViewModel, SignupCompleteViewModel, SignupField, SignupFormViewModel, TermsViewModel } from './auth.types';

export function LoginPageView({ model, devLogin }: { model: LoginViewModel; devLogin?: ReactNode }) {
  const card = (
    <AuthFrame>
      <div className="tm-auth-login">
        <div>
          <div className="tm-auth-logo">T</div>
          <h1 className="tm-text-heading tm-auth-title">{model.heroTitle}</h1>
          <p className="tm-text-body tm-auth-sub">{model.heroSub}</p>
          <Link className="tm-btn tm-btn-lg tm-btn-outline tm-btn-block tm-auth-email-link" href={model.emailHref}>이메일로 로그인</Link>
          <p className="tm-text-caption tm-auth-helper">기존 계정이 있으면 이메일 로그인 후 종목, 레벨, 지역 확인으로 이어집니다.</p>
        </div>
        <div>
          <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href={model.guestHref}>로그인 없이 시작하기</Link>
          <p className="tm-text-body tm-auth-center">
            아직 계정이 없나요? <Link href={model.signupHref}>회원가입</Link>
          </p>
          {model.providers.length > 0 ? (
            <>
              <AuthDivider />
              <div className="tm-auth-provider-row">
                {model.providers.map((provider) => <ProviderButton key={provider.label} provider={provider} />)}
              </div>
            </>
          ) : null}
          {devLogin}
          <p className="tm-text-caption tm-auth-policy">계속하면 서비스 약관과 개인정보 처리방침에 동의합니다.</p>
        </div>
      </div>
    </AuthFrame>
  );

  return (
    <div className="tm-auth-login-split">
      {/* Brand panel — hidden on mobile (display:none), shown as left pane on desktop */}
      <div className="tm-auth-split-brand" aria-hidden="true">
        <div className="tm-auth-split-brand-logo">T</div>
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

export function EmailLoginPageView({ model }: { model: EmailLoginViewModel }) {
  return (
    <AuthFrame topTitle="이메일 로그인" backHref={model.backHref} fixedAction={<AuthActionButton action={model.primary} />}>
      <div className="tm-auth-body">
        <h1 className="tm-text-heading tm-auth-heading">{model.title}</h1>
        {model.sub ? <p className="tm-text-body tm-auth-sub">{model.sub}</p> : null}
        <div className="tm-auth-form">
          {model.fields.map((field) => <AuthField key={field.label} {...field} />)}
        </div>
        <div className="tm-auth-link-row">
          <AuthSmallAction action={model.forgot} />
          <Link className="tm-btn tm-btn-sm tm-btn-ghost" href={model.signupHref}>회원가입</Link>
        </div>
        {model.notice ? (
          <Card pad={16} className="tm-auth-soft-card">
            <div className="tm-text-body-lg">{model.notice.title}</div>
            <div className="tm-text-caption">{model.notice.body}</div>
          </Card>
        ) : null}
      </div>
    </AuthFrame>
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
          <div className="tm-text-label">처리 기준</div>
          <div className="tm-text-caption">입력값과 온보딩 임시 선택값은 보존하고, 계정 상태를 성공처럼 처리하지 않습니다.</div>
        </Card>
      </div>
    </AuthFrame>
  );
}

export function TermsPageView({ model }: { model: TermsViewModel }) {
  return (
    <AuthFrame topTitle="약관 동의" backHref={model.backHref} fixedAction={<AuthActionButton action={model.primary} />}>
      <div className="tm-auth-body">
        <h1 className="tm-text-heading tm-auth-heading">{model.title}</h1>
        <p className="tm-text-body tm-auth-sub">{model.sub}</p>
        <Card pad={16} className="tm-auth-agree-all">
          <CheckMark checked />
          <span className="tm-text-body-lg">필수 약관 전체 동의</span>
        </Card>
        <div className="tm-auth-stack">
          {model.agreements.map((item) => (
            <Link key={item.title} className="tm-card tm-auth-agreement tm-pressable" href="/terms">
              <CheckMark checked={item.checked} />
              <div>
                <div className="tm-text-body-lg">{item.title}</div>
                <div className="tm-text-caption">{item.meta}</div>
                <div className="tm-text-caption">{item.detail}</div>
              </div>
              <ChevronRightIcon size={16} strokeWidth={2} />
            </Link>
          ))}
        </div>
      </div>
    </AuthFrame>
  );
}

export function SignupFormPageView({ model }: { model: SignupFormViewModel }) {
  return (
    <AuthFrame topTitle="회원가입" backHref={model.backHref} fixedAction={<AuthActionButton action={model.primary} />}>
      <div className="tm-auth-body">
        <span className="tm-badge tm-badge-blue">SIGN UP</span>
        <h1 className="tm-text-heading tm-auth-heading">{model.title}</h1>
        <p className="tm-text-body tm-auth-sub">{model.sub}</p>
        <div className="tm-auth-form tm-auth-signup-form">
          {model.fields.map((field) => <SignupFieldRow key={field.label} field={field} />)}
        </div>
        <Card pad={16} className="tm-auth-soft-card">
          <div className="tm-text-body-lg">{model.notice.title}</div>
          <div className="tm-text-caption">{model.notice.body}</div>
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

export function OnboardingPageView({ model }: { model: OnboardingViewModel }) {
  return (
    <AuthFrame
      topTitle={model.step === 'resume' ? '이어하기' : '운동 설정'}
      backHref={model.backHref}
      skipHref={model.skipHref}
      fixedAction={<OnboardingActions primary={model.primary} secondary={model.secondary} />}
    >
      <div className="tm-auth-body">
        <ProgressHeader stepNo={model.stepNo} total={model.totalSteps} />
        <h1 className="tm-text-heading tm-auth-heading">{model.title}</h1>
        <p className="tm-text-body tm-auth-sub">{model.sub}</p>
        {model.step === 'sport' ? <SportGrid options={model.options} /> : null}
        {model.step === 'level' ? <LevelList options={model.options} /> : null}
        {model.step === 'region' ? <RegionList options={model.options} /> : null}
        {model.step === 'resume' ? <ResumeList options={model.options} /> : null}
        {model.summary ? <SummaryList items={model.summary} /> : null}
        {model.notice ? <NoticeCard {...model.notice} /> : null}
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

function AuthSmallAction({ action }: { action: AuthAction }) {
  const className = `tm-btn tm-btn-sm ${action.disabled ? 'tm-btn-ghost tm-btn-disabled' : 'tm-btn-ghost'}`;
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
    <button className={`tm-btn tm-btn-md ${provider.disabled ? 'tm-auth-provider-disabled' : 'tm-pressable'}`} disabled={provider.disabled} style={provider.disabled ? undefined : style} type="button">
      {provider.label}
    </button>
  );
}

function AuthField({ label, placeholder, type, helper, state = 'default' }: { label: string; placeholder: string; type: 'email' | 'password'; helper?: string; state?: 'default' | 'error' | 'success' }) {
  return (
    <label className="tm-auth-field">
      <span className="tm-text-label">{label}</span>
      <input className={`tm-input tm-auth-input tm-auth-input-${state}`} placeholder={placeholder} type={type} />
      {helper ? <span className={`tm-text-caption tm-auth-field-helper tm-auth-field-helper-${state}`}>{helper}</span> : null}
    </label>
  );
}

function SignupFieldRow({ field }: { field: SignupField }) {
  return (
    <label className="tm-auth-field">
      <span className="tm-text-label">{field.label}</span>
      <span className={field.action ? 'tm-auth-field-with-action' : ''}>
        <input className={`tm-input tm-auth-input tm-auth-input-${field.state ?? 'default'}`} placeholder={field.placeholder} type={field.type} />
        {field.action ? <AuthSmallAction action={field.action} /> : null}
      </span>
      {field.helper ? <span className={`tm-text-caption tm-auth-field-helper tm-auth-field-helper-${field.state ?? 'default'}`}>{field.helper}</span> : null}
    </label>
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

function OnboardingActions({ primary, secondary }: { primary: AuthAction; secondary?: AuthAction }) {
  return (
    <>
      <AuthActionButton action={primary} />
      {secondary ? <><div style={{ height: 8 }} /><AuthActionButton action={secondary} /></> : null}
    </>
  );
}

function AuthDivider() {
  return <div className="tm-auth-divider"><span /><em className="tm-text-caption">또는</em><span /></div>;
}

function CheckMark({ checked }: { checked?: boolean }) {
  return <span className={`tm-auth-check ${checked ? 'tm-auth-check-on' : ''}`}>✓</span>;
}

function ProgressHeader({ stepNo, total }: { stepNo: number; total: number }) {
  return (
    <div className="tm-auth-progress">
      <span className="tm-text-micro">{stepNo > 0 ? `STEP ${stepNo} / ${total}` : 'RESUME'}</span>
      <div className="tm-auth-progress-bars">
        {Array.from({ length: total }).map((_, index) => <span key={index} data-active={stepNo > 0 && index < stepNo} />)}
      </div>
    </div>
  );
}

function SportGrid({ options }: { options: OnboardingOption[] }) {
  return <div className="tm-auth-sport-grid">{options.map((option) => <OptionCard key={option.label} option={option} />)}</div>;
}

function LevelList({ options }: { options: OnboardingOption[] }) {
  return <div className="tm-auth-stack">{options.map((option) => <OptionRow key={option.label} option={option} trailing="A B C D" />)}</div>;
}

function RegionList({ options }: { options: OnboardingOption[] }) {
  return (
    <>
      <button className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" type="button">현재 위치로 찾기</button>
      <div className="tm-auth-chip-wrap">{options.map((option) => <span key={option.label} className={`tm-chip ${option.selected ? 'tm-chip-active' : ''}`}>{option.label}</span>)}</div>
    </>
  );
}

function ResumeList({ options }: { options: OnboardingOption[] }) {
  return <div className="tm-auth-stack">{options.map((option) => <OptionRow key={option.label} option={option} />)}</div>;
}

function SummaryList({ items }: { items: Array<{ label: string; value: string }> }) {
  return <div className="tm-auth-stack">{items.map((item) => <Card key={item.label} pad={15}><div className="tm-text-label">{item.label}</div><div className="tm-text-caption" style={{ marginTop: 4 }}>{item.value}</div></Card>)}</div>;
}

function OptionCard({ option }: { option: OnboardingOption }) {
  return <Card pad={16} className={`tm-auth-option-card ${option.selected ? 'tm-auth-option-selected' : ''}`}><div className="tm-text-body-lg">{option.label}</div>{option.meta ? <div className="tm-text-caption">{option.meta}</div> : null}</Card>;
}

function OptionRow({ option, trailing }: { option: OnboardingOption; trailing?: string }) {
  return <Card pad={15} className="tm-auth-option-row"><CheckMark checked={option.selected} /><div><div className="tm-text-body-lg">{option.label}</div>{option.meta ? <div className="tm-text-caption">{option.meta}</div> : null}</div>{trailing ? <span className="tm-text-caption tab-num">{trailing}</span> : null}</Card>;
}

function NoticeCard({ title, body, tone = 'blue' }: { title: string; body: string; tone?: 'blue' | 'orange' | 'green' }) {
  return <Card pad={14} className={`tm-auth-notice tm-auth-notice-${tone}`}><div className="tm-text-label">{title}</div><div className="tm-text-caption">{body}</div></Card>;
}
