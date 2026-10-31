'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { formatMonthDay } from '@/lib/date-utils';
import { peekPendingSocialLink } from '@/lib/pending-social-link';
import { AppleLoginButton } from './apple-login-button';
import { AUTH_NOTICE_STAGE, AuthFrame } from './auth-page';
import { buildKakaoAuthUrl } from './auth.view-model';
import { ACCOUNT_CONFLICT_PATH, buildAccountConflictPath } from './login-recovery-route';
import { KakaoLoginButton } from './kakao-login-button';
import { LINK_TOKEN_WINDOW_MINUTES, linkProviderLabel } from './sign-in-then-link-copy';
import { WithdrawalPendingGuide, type WithdrawalGuideStep } from './withdrawal-pending-guide';
import type { V1LinkableProvider } from '@/types/api';

type Step = { title: string; body: string };

function buildSteps(label: string, autoLink: boolean): Step[] {
  return [
    {
      title: '원래 가입한 방법으로 로그인해요',
      body: '처음 가입할 때 쓴 방법으로 로그인해요. 이메일로 가입했다면 이메일 로그인을, 소셜로 가입했다면 해당 로그인 버튼을 눌러요.',
    },
    autoLink
      ? { title: `${LINK_TOKEN_WINDOW_MINUTES}분 안에 로그인하면 ${label} 로그인이 자동으로 연결돼요`, body: '연결이 끝나면 설정의 "로그인 방법" 화면으로 이동해요.' }
      : { title: '로그인한 뒤 설정에서 연결해요', body: `설정의 "로그인 방법"에서 ${label} 로그인을 연결해 주세요.` },
    {
      title: '다음부터는 같은 계정으로 들어와요',
      body: `${label} 버튼으로도 원래 계정에 로그인할 수 있어요.`,
    },
  ];
}

/** 번호를 쥔 계정이 탈퇴 유예 중일 때의 방법 1. 로그인이 곧바로 연결되지 않고 탈퇴 철회를 한 번 거친다. */
function buildWithdrawalSteps(label: string, autoLink: boolean): WithdrawalGuideStep[] {
  return [
    { title: '원래 가입한 방법으로 로그인해요', body: '아래 버튼에서 골라요.' },
    { title: '탈퇴 신청을 취소해요', body: '로그인하면 취소할 수 있는 화면이 나와요.' },
    autoLink
      ? { title: `${label} 로그인이 자동으로 연결돼요`, body: `${LINK_TOKEN_WINDOW_MINUTES}분 안에 로그인하고 탈퇴 신청을 취소해 주세요.` }
      : { title: '로그인한 뒤 설정에서 연결해요', body: `설정의 "로그인 방법"에서 ${label} 로그인을 연결해 주세요.` },
  ];
}

// 연결 토큰이 실제로 남아 있는지는 브라우저 저장소만 안다. 서버 렌더에서는 알 수 없어(null) 흔한 경우인 자동 연결 문구로 그린다.
const subscribeNothing = () => () => {};
const readAutoLinkAvailable = () => peekPendingSocialLink()?.expired === false;
const serverAutoLinkAvailable = () => null;
// 충돌한 계정이 탈퇴 유예 중인지(그 계정의 유예 종료 시각, 날짜를 모르면 null)도 저장소만 안다. 없음은 undefined.
const readWithdrawalPendingUntil = () => peekPendingSocialLink()?.withdrawalPendingUntil;
const serverWithdrawalPendingUntil = () => undefined;

/**
 * 카카오·Apple 로그인이 "이미 팀밋 계정이 있어요"(409)로 막혔을 때의 3단계 안내.
 * 로그인 버튼은 여기서 다시 시작하고, 연결은 로그인 직후 앱 전역 게이트가 대기 토큰으로 이어 준다.
 */
export function AccountExistsGuide({ provider, redirectPath }: { provider: V1LinkableProvider | null; redirectPath: string | null }) {
  const autoLink = useSyncExternalStore(subscribeNothing, readAutoLinkAvailable, serverAutoLinkAvailable);
  const withdrawalPendingUntil = useSyncExternalStore(subscribeNothing, readWithdrawalPendingUntil, serverWithdrawalPendingUntil);
  const label = linkProviderLabel(provider);
  const steps = buildSteps(label, autoLink !== false);
  const withdrawalPending = withdrawalPendingUntil !== undefined;
  const hasWays = withdrawalPendingUntil != null && formatMonthDay(withdrawalPendingUntil) !== null;
  const redirectQuery = redirectPath ? `redirect=${encodeURIComponent(redirectPath)}` : '';
  const emailHref = redirectQuery ? `/login/email?${redirectQuery}` : '/login/email';
  const guidePath = provider ? buildAccountConflictPath(provider, redirectPath) : ACCOUNT_CONFLICT_PATH;
  const recoveryQuery = [`from=${encodeURIComponent(guidePath)}`, redirectQuery].filter(Boolean).join('&');
  const kakaoHref = buildKakaoAuthUrl();

  return (
    <AuthFrame
      topTitle="로그인 확인"
      backHref="/login"
      stage={AUTH_NOTICE_STAGE}
      fixedAction={(
        <div className="tm-auth-provider-group">
          <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href={emailHref}>이메일로 로그인하기</Link>
          <AppleLoginButton className="tm-btn tm-btn-lg tm-btn-block tm-auth-apple" />
          {kakaoHref ? (
            <KakaoLoginButton
              className="tm-btn tm-btn-lg tm-btn-outline tm-btn-block tm-pressable"
              href={kakaoHref}
              label="카카오로 로그인하기"
              style={{ background: 'var(--kakao-yellow)', color: 'var(--static-black)', borderColor: 'transparent' }}
            />
          ) : null}
          <div className="tm-auth-guide-links">
            <Link className="tm-btn tm-btn-sm tm-btn-ghost" href={`/auth/find-account?${recoveryQuery}`}>계정 찾기</Link>
            <Link className="tm-btn tm-btn-sm tm-btn-ghost" href={`/auth/find-account?mode=reset-password&${recoveryQuery}`}>비밀번호 재설정</Link>
          </div>
        </div>
      )}
    >
      <div className="tm-auth-body">
        <span className="tm-badge tm-badge-orange">이미 가입된 계정</span>
        <h1 className="tm-text-heading tm-auth-heading">이미 팀밋 계정이 있어요</h1>
        {withdrawalPending ? (
          <>
            <p className="tm-text-body tm-auth-sub tm-wpg-sub">
              가입했던 계정이 탈퇴 신청 중이라, {label}로 새로 가입할 수 없어요.{hasWays ? ' 아래 두 가지 중에서 골라 주세요.' : ''}
            </p>
            <WithdrawalPendingGuide
              until={withdrawalPendingUntil}
              finishIcon="link"
              steps={buildWithdrawalSteps(label, autoLink !== false)}
              waitedText={`${label}로 새로 가입할 수 있어요`}
            />
          </>
        ) : (
          <>
            <p className="tm-text-body tm-auth-sub">
              같은 정보로 만든 계정이 있어서 {label}로 새로 가입할 수 없어요. 아래 순서로 계정을 이어 주세요.
            </p>
            <ol className="tm-auth-features tm-auth-steps">
              {steps.map((step, index) => (
                <li className="tm-auth-feature tm-auth-step" key={step.title}>
                  <span className="tm-auth-feature-icon tm-auth-step-number" aria-hidden="true">{index + 1}</span>
                  <span>
                    <span className="tm-text-body-lg tm-auth-step-title">{step.title}</span>
                    <span className="tm-text-caption tm-auth-step-body">{step.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </AuthFrame>
  );
}
