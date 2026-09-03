import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/v1-ui/primitives';
import { AuthBackButton } from './auth-back-button';
import { ChevronLeftIcon, MatchIcon, TeamMatchIcon, TrophyIcon } from '@/components/v1-ui/icons';
import { BrandMark } from '@/components/v1-ui/brand-logo';
import { KakaoLoginButton } from './kakao-login-button';
import type { AuthAction, AuthExceptionViewModel, LoginProvider, LoginViewModel, SignupCompleteViewModel } from './auth.types';

export function LoginPageView({ model }: { model: LoginViewModel }) {
  const card = (
    <AuthFrame stage={AUTH_WELCOME_STAGE}>
      <div className="tm-auth-login">
        <div>
          {/* 데스크톱(≥1024)에서는 같은 그래픽이 왼쪽 스테이지에 크게 놓이므로 카드 안의 것은 숨긴다. */}
          <AuthIllustration name={AUTH_WELCOME_STAGE.illustration} className="tm-hide-desktop" />
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
    <AuthFrame topTitle="로그인 확인" backHref={model.backHref} fixedAction={<ExceptionActions model={model} />} stage={AUTH_NOTICE_STAGE}>
      <div className="tm-auth-exception">
        {/* 그래픽 → 배지 → 타이틀 → 본문. 예전의 "안내" 카드(7종 모두 같은 문구)는 자리 채우기였다 —
            안심 문구는 스테이지 sub 로 옮기고, 그래픽이 "막힌 게 아니라 다른 길이 있다"는 메시지를 맡는다. */}
        <AuthIllustration name={AUTH_NOTICE_STAGE.illustration} className="tm-hide-desktop" />
        <span className={`tm-badge ${model.tone === 'red' ? 'tm-badge-red' : 'tm-badge-orange'}`}>{model.badge}</span>
        <h1 className="tm-text-heading tm-auth-heading">{model.title}</h1>
        <p className="tm-text-body tm-auth-sub">{model.body}</p>
      </div>
    </AuthFrame>
  );
}

export function SignupCompletePageView({ model }: { model: SignupCompleteViewModel }) {
  return (
    <AuthFrame fixedAction={<SignupActions primary={model.primary} secondary={model.secondary} />} stage={JOURNEY_DONE_STAGE}>
      <div className="tm-auth-complete">
        {/* 완료 순간의 그래픽(트로피). .tm-complete-check 키프레임은 그대로 살려 등장 피드백으로 쓴다. */}
        <AuthIllustration name={JOURNEY_DONE_STAGE.illustration} className="tm-hide-desktop tm-complete-check" />
        <h1 className="tm-text-heading tm-auth-heading">{model.title}</h1>
        <p className="tm-text-body tm-auth-sub">{model.sub}</p>
        <div className="tm-auth-stack">
          {model.steps.map((step) => (
            <Card key={step.title} pad={16} className="tm-auth-step-card">
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

/**
 * 데스크톱(≥1024) 왼쪽 스테이지에 놓이는 문험(화면군) 단위 메시지 + 그래픽.
 * 같은 문험은 같은 스테이지를 쓴다 — 화면마다 다른 그림을 만들지 않는다(agy-3d-graphic 스킬).
 */
export type AuthStage = {
  eyebrow: string;
  slogan: string;
  sub: string;
  /** public/illustrations/<name>-640.webp */
  illustration: string;
};

export const AUTH_WELCOME_STAGE: AuthStage = {
  eyebrow: 'Teameet',
  slogan: '같이 뛸 사람이\n기다리고 있어요',
  sub: '종목·실력·지역만 알려주면 딱 맞는 매치와 팀을 찾아드려요.',
  illustration: 'auth-welcome',
};

export const AUTH_NOTICE_STAGE: AuthStage = {
  eyebrow: '로그인 확인',
  slogan: '다른 방법으로\n계속할 수 있어요',
  sub: '입력하신 정보는 안전하게 유지돼요. 아래 안내를 따라 다시 시도해 주세요.',
  illustration: 'auth-notice',
};

export const JOURNEY_DONE_STAGE: AuthStage = {
  eyebrow: '준비 완료',
  slogan: '이제 경기장으로\n나갈 차례예요',
  sub: '설정은 언제든 마이 탭에서 바꿀 수 있어요.',
  illustration: 'journey-done',
};

/**
 * 인증·온보딩 화면의 그래픽 슬롯. 크기는 `.tm-auth-illustration`(globals.css) 한 곳에서 정한다 —
 * 모바일 160px(≤360 은 136px), 데스크톱 스테이지에서는 `.tm-auth-stage-illustration` 이 280px 로 키운다.
 * 장식이라 alt 없이 aria-hidden.
 */
export function AuthIllustration({ name, className }: { name: string; className?: string }) {
  return (
    <Image
      className={`tm-auth-illustration${className ? ` ${className}` : ''}`}
      src={`/illustrations/${name}-640.webp`}
      alt=""
      aria-hidden="true"
      width={640}
      height={640}
      sizes="(min-width: 1024px) 280px, (max-width: 360px) 136px, 160px"
    />
  );
}

export function AuthFrame({ children, topTitle, backHref, onBack, backLabel, skipHref, fixedAction, className, stage }: {
  children: ReactNode;
  topTitle?: string;
  backHref?: string;
  /**
   * 이동이 아니라 동작(확인 모달 → 로그아웃 등)이 필요한 뒤로가기. backHref 와 배타적으로 쓰며,
   * 둘 다 없으면 상단 좌측이 비어 화면을 빠져나갈 방법이 사라진다.
   */
  onBack?: () => void;
  /** 스크린리더용 라벨. 동작이 단순 뒤로가기가 아닐 때 무엇을 하는지 알린다. */
  backLabel?: string;
  skipHref?: string;
  fixedAction?: ReactNode;
  className?: string;
  /**
   * 있으면 데스크톱(≥1024)에서 왼쪽 스테이지(슬로건·그래픽) + 오른쪽 카드의 2단으로 놓인다.
   * 없으면 예전대로 가운데 폰 폭 카드 하나(약관·계정 삭제 안내 등 문험이 정해지지 않은 화면).
   * 모바일에는 아무 영향이 없다 — 스테이지는 CSS 로 숨긴다.
   */
  stage?: AuthStage;
}) {
  const hasBack = Boolean(backHref || onBack);
  return (
    <div className={`tm-auth-frame${className ? ` ${className}` : ''}${stage ? ' tm-auth-frame-staged' : ''}`}>
      {stage ? (
        <aside className="tm-auth-stage tm-show-desktop">
          <div className="tm-auth-stage-brand"><BrandMark size={28} alt="" /><span>teameet</span></div>
          <div className="tm-auth-stage-eyebrow tm-text-label">{stage.eyebrow}</div>
          <div className="tm-auth-stage-slogan">{stage.slogan}</div>
          <p className="tm-auth-stage-sub tm-text-body">{stage.sub}</p>
          <div className="tm-auth-stage-well">
            <AuthIllustration name={stage.illustration} className="tm-auth-stage-illustration" />
          </div>
        </aside>
      ) : null}
      {/* 데스크톱(≥1024)에서는 desktop/auth.css 가 .tm-auth-topbar 를 통째로 숨긴다. 상단바에만
          뒤로가기를 두면 그 폭에서는 화면을 빠져나갈 컨트롤이 아예 사라지므로(로그인·약관·
          회원가입이 실제로 그랬다), 온보딩 위저드와 같은 in-card 내비로 복원한다.
          backHref 는 링크, onBack 은 버튼 — 둘 다 오면 동작이 다른 뒤로가기가 둘 생기니
          backHref 를 정본으로 하나만 렌더한다. */}
      {hasBack ? (
        <div className="tm-onboarding-desktop-nav tm-show-desktop">
          {backHref ? (
            <Link className="tm-onboarding-desktop-back" href={backHref} aria-label={backLabel ?? '뒤로가기'}>
              <ChevronLeftIcon size={22} strokeWidth={2.2} />
            </Link>
          ) : (
            <AuthBackButton className="tm-onboarding-desktop-back" label={backLabel ?? '뒤로가기'} onClick={onBack!} />
          )}
          {topTitle ? <span className="tm-onboarding-desktop-nav-title">{topTitle}</span> : null}
        </div>
      ) : null}
      <div className="tm-auth-card">
      {topTitle || hasBack || skipHref ? (
        <header className="tm-auth-topbar">
          <div className="tm-auth-topbar-left">
            {backHref ? (
              <Link className="tm-btn tm-btn-icon tm-btn-ghost" href={backHref} aria-label={backLabel ?? '뒤로가기'}>
                <ChevronLeftIcon size={22} strokeWidth={2.2} />
              </Link>
            ) : onBack ? (
              <AuthBackButton className="tm-btn tm-btn-icon tm-btn-ghost" label={backLabel ?? '뒤로가기'} onClick={onBack} />
            ) : null}
            {topTitle ? <div className="tm-text-body-lg">{topTitle}</div> : null}
          </div>
          {skipHref ? <Link className="tm-btn tm-btn-sm tm-btn-ghost" href={skipHref}>건너뛰기</Link> : null}
        </header>
      ) : null}
      <main className={`tm-auth-scroll ${fixedAction ? 'tm-auth-scroll-with-cta' : ''} ${topTitle || hasBack || skipHref ? '' : 'tm-auth-scroll-full'}`}>
        {children}
      </main>
      {fixedAction ? <div className="tm-auth-fixed-cta">{fixedAction}</div> : null}
      </div>
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
  // disabled(준비 중)도 브랜드 배경은 유지하고 opacity로 비활성 상태를 구분한다.
  const activeStyle = { background: provider.background, color: provider.foreground, borderColor: 'transparent' };

  if (provider.disabled) {
    return (
      <button
        className="tm-btn tm-btn-md tm-auth-provider-disabled"
        style={{ ...activeStyle, opacity: 0.58 }}
        disabled
        aria-label={`${provider.label} 로그인 (준비 중)`}
        type="button"
      >
        {provider.label}
      </button>
    );
  }

  if (provider.href?.startsWith('http')) {
    // OAuth(카카오): 클릭 시점에 CSRF 방지 state를 생성·저장해야 하므로 클라이언트 버튼 사용.
    return (
      <KakaoLoginButton
        className="tm-btn tm-btn-md tm-btn-outline tm-pressable"
        href={provider.href}
        style={activeStyle}
        label={provider.label}
      />
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

