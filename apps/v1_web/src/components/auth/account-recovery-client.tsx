'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { EmailVerificationCard } from '@/components/auth/email-verification/email-verification-card';
import { PhoneVerificationCard } from '@/components/auth/phone-verification/phone-verification-card';
import {
  useV1AuthMe,
  useV1FindAccountByPhone,
  useV1ResetPasswordByEmail,
} from '@/hooks/use-v1-api';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import { sanitizeRedirectPath } from '@/lib/session-storage';
import type { V1FoundAccount } from '@/types/api';
import { AUTH_NOTICE_STAGE, AuthFrame } from './auth-page';
import { formatPhone, normalizeSeparatedDigits } from './signup-profile-validation';

type Mode = 'find-id' | 'reset-password';

const MODE_COPY: Record<Mode, { title: string; sub: string }> = {
  'find-id': {
    title: '가입한 이메일을 찾아요',
    sub: '가입할 때 등록한 휴대폰 번호로 본인인증하면 로그인에 쓰는 이메일을 알려드려요.',
  },
  'reset-password': {
    title: '비밀번호를 다시 설정해요',
    sub: '가입한 이메일로 인증번호를 보내드려요. 코드를 확인하면 새 비밀번호를 정할 수 있어요.',
  },
};

/**
 * 인증 카드를 띄울지 정하는 가벼운 형식 확인. 최종 판정은 서버(class-validator)가 하고,
 * 여기서는 "아직 다 입력하지 않은 주소"에 카드가 먼저 튀어나오지 않게만 막는다.
 */
function looksLikeEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value.trim());
}

export function AccountRecoveryClient({ initialMode = 'find-id', backHref = '/login/email', redirectPath }: {
  initialMode?: Mode;
  backHref?: string;
  redirectPath?: string | null;
}) {
  const fieldId = useId();
  const redirect = sanitizeRedirectPath(redirectPath);
  const loginHref = redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login';
  const emailLoginHref = redirect ? `/login/email?redirect=${encodeURIComponent(redirect)}` : '/login/email';
  const recoveryBackHref = backHref === '/login/email' ? emailLoginHref : backHref;
  const returnToSettings = backHref === '/my/settings';
  const currentAccount = useV1AuthMe({ enabled: returnToSettings });
  const [mode, setMode] = useState<Mode>(initialMode);
  const [phoneDigits, setPhoneDigits] = useState('');
  const [proofToken, setProofToken] = useState<string | null>(null);
  const [found, setFound] = useState<V1FoundAccount | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [emailProofToken, setEmailProofToken] = useState<string | null>(null);
  /**
   * 카카오 전용 계정이라는 사실은 사서함 주인임을 증명한 **뒤**에야 드러난다 — 요청 단계에서
   * 알려 주면 이메일 하나로 계정 종류를 훑을 수 있기 때문이다. 그래서 서버가 재설정을 막을 때
   * (PASSWORD_LOGIN_UNAVAILABLE) 비로소 세운다.
   */
  const [resetBlockedSocialOnly, setResetBlockedSocialOnly] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [resetDone, setResetDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const phoneRequestGeneration = useRef(0);
  // 같은 번호를 다시 입력해도 새 카드를 렌더해 이전 OTP의 늦은 완료 상태를 분리한다.
  const [phoneFlowGeneration, setPhoneFlowGeneration] = useState(0);
  const emailRequestGeneration = useRef(0);
  // 정규화 주소가 같아도 실제 입력을 고치면 이전 인증 카드와 저장 응답을 분리한다.
  const [emailFlowGeneration, setEmailFlowGeneration] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const findAccount = useV1FindAccountByPhone();
  const resetPasswordByEmail = useV1ResetPasswordByEmail();

  const normalizedEmail = emailInput.trim().toLowerCase();
  const accountPhone = currentAccount.data?.user.phone ?? '';
  const accountEmail = currentAccount.data?.user.email ?? '';
  useEffect(() => {
    if (!returnToSettings) return;
    phoneRequestGeneration.current += 1;
    setPhoneFlowGeneration(phoneRequestGeneration.current);
    emailRequestGeneration.current += 1;
    setEmailFlowGeneration(emailRequestGeneration.current);
    setPhoneDigits(normalizeSeparatedDigits(accountPhone));
    setEmailInput(accountEmail);
    setProofToken(null);
    setFound(null);
    setEmailProofToken(null);
    setResetDone(false);
  }, [returnToSettings, accountPhone, accountEmail]);

  // 앞 단계에서 받은 증명·결과를 버린다 — 남겨 두면 "다른 방법으로 인증했는데 이 화면이
  // 이미 인증된 것처럼 보이는" 상태가 된다.
  const resetProgress = () => {
    phoneRequestGeneration.current += 1;
    setPhoneFlowGeneration(phoneRequestGeneration.current);
    emailRequestGeneration.current += 1;
    setEmailFlowGeneration(emailRequestGeneration.current);
    setProofToken(null);
    setFound(null);
    setEmailProofToken(null);
    setResetBlockedSocialOnly(false);
    setNewPassword('');
    setPasswordConfirm('');
    setResetDone(false);
    setError(null);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    resetProgress();
  };

  const onPhoneVerified = async (token?: string) => {
    // 인증 중 번호/방법이 바뀌거나 화면을 떠나면 이전 카드의 증명으로 조회를 시작하지 않는다.
    if (!token || !mounted.current || mode !== 'find-id' || phoneFlowGeneration !== phoneRequestGeneration.current) return;
    const lookupGeneration = ++phoneRequestGeneration.current;
    setPhoneFlowGeneration(lookupGeneration);
    setProofToken(token);
    setError(null);
    try {
      const account = await findAccount.mutateAsync({ phone: phoneDigits, proofToken: token });
      if (!mounted.current || lookupGeneration !== phoneRequestGeneration.current) return;
      setFound(account);
    } catch (err) {
      if (!mounted.current || lookupGeneration !== phoneRequestGeneration.current) return;
      setFound(null);
      setError(extractErrorMessage(err, '계정을 찾지 못했어요.'));
    }
  };

  const onEmailVerified = (token?: string) => {
    if (!token || !mounted.current || mode !== 'reset-password' || emailFlowGeneration !== emailRequestGeneration.current) return;
    setEmailProofToken(token);
    setError(null);
  };

  const copy = MODE_COPY[mode];
  // 번호 조회 결과는 아이디 찾기에만 쓰고, 이메일 재설정은 해당 이메일의 서버 판정을 따른다.
  const socialOnly = mode === 'find-id' ? found !== null && !found.hasPassword : resetBlockedSocialOnly;
  const resetting = resetPasswordByEmail.isPending;

  // 본인 확인을 마쳤고 아직 비밀번호를 못 바꾼 상태에서만 새 비밀번호 입력을 띄운다.
  const verifiedForReset = Boolean(emailProofToken);
  const matchesCurrentAccount = !returnToSettings || Boolean(currentAccount.data
    && normalizedEmail && normalizedEmail === accountEmail.trim().toLowerCase());
  const passwordFormVisible = mode === 'reset-password' && verifiedForReset && matchesCurrentAccount && !socialOnly && !resetDone;
  const passwordReady = newPassword.length >= 8 && newPassword === passwordConfirm;

  const submitReset = async () => {
    if (!mounted.current || mode !== 'reset-password' || emailFlowGeneration !== emailRequestGeneration.current
      || !passwordReady || resetting || !matchesCurrentAccount || !emailProofToken || socialOnly) return;
    const resetGeneration = emailFlowGeneration;
    setError(null);
    try {
      await resetPasswordByEmail.mutateAsync({ email: normalizedEmail, proofToken: emailProofToken, newPassword });
      if (!mounted.current || resetGeneration !== emailRequestGeneration.current) return;
      setResetDone(true);
    } catch (err) {
      if (!mounted.current || resetGeneration !== emailRequestGeneration.current) return;
      if (extractErrorCode(err) === 'PASSWORD_LOGIN_UNAVAILABLE') {
        setResetBlockedSocialOnly(true);
        return;
      }
      setError(extractErrorMessage(err, '비밀번호를 바꾸지 못했어요.'));
    }
  };

  return (
    <AuthFrame topTitle={returnToSettings ? '비밀번호 변경' : '계정 찾기'} backHref={recoveryBackHref} appBack={returnToSettings} stage={AUTH_NOTICE_STAGE}>
      <div className="tm-auth-body">
        <div className="tm-auth-segmented" role="tablist" aria-label="찾기 방법">
          <button
            className={`tm-auth-segment ${mode === 'find-id' ? 'tm-auth-segment-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={mode === 'find-id'}
            onClick={() => switchMode('find-id')}
          >
            아이디 찾기
          </button>
          <button
            className={`tm-auth-segment ${mode === 'reset-password' ? 'tm-auth-segment-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={mode === 'reset-password'}
            onClick={() => switchMode('reset-password')}
          >
            비밀번호 재설정
          </button>
        </div>

        <h1 className="tm-text-heading tm-auth-heading">{copy.title}</h1>
        <p className="tm-text-body tm-auth-sub">
          {copy.sub}
        </p>

        {returnToSettings && currentAccount.isError ? (
          <Card pad={16} className="tm-auth-soft-card-error"><div role="alert">{extractErrorMessage(currentAccount.error, '계정 정보를 확인하지 못했어요. 설정에서 다시 시도해 주세요.')}</div></Card>
        ) : verifiedForReset && !matchesCurrentAccount ? (
          <Card pad={16} className="tm-auth-soft-card-error"><div role="alert">로그인한 계정의 이메일로 본인인증해 주세요.</div></Card>
        ) : null}

        <div className="tm-auth-form">
          {mode === 'find-id' ? (
            <>
              <label className="tm-auth-field" htmlFor={`${fieldId}-phone`}>
                <span className="tm-text-label">휴대폰 번호</span>
                <input
                  id={`${fieldId}-phone`}
                  className="tm-input tm-auth-input"
                  inputMode="numeric"
                  onChange={(event) => {
                    phoneRequestGeneration.current += 1;
                    setPhoneFlowGeneration(phoneRequestGeneration.current);
                    setPhoneDigits(normalizeSeparatedDigits(event.target.value));
                    // 번호를 고치면 앞 번호로 받은 증명은 더는 유효하지 않다.
                    setProofToken(null);
                    setFound(null);
                    setResetBlockedSocialOnly(false);
                    setResetDone(false);
                  }}
                  placeholder="010-0000-0000"
                  value={formatPhone(phoneDigits)}
                />
              </label>

              {phoneDigits.length === 11 && !proofToken ? (
                <PhoneVerificationCard
                  key={phoneFlowGeneration}
                  mode="public"
                  purpose="password_reset"
                  phone={phoneDigits}
                  onVerified={(token) => void onPhoneVerified(token)}
                />
              ) : null}
            </>
          ) : (
            <>
              <label className="tm-auth-field" htmlFor={`${fieldId}-email`}>
                <span className="tm-text-label">이메일</span>
                <input
                  id={`${fieldId}-email`}
                  autoComplete="email"
                  className="tm-input tm-auth-input"
                  inputMode="email"
                  onChange={(event) => {
                    emailRequestGeneration.current += 1;
                    setEmailFlowGeneration(emailRequestGeneration.current);
                    setEmailInput(event.target.value);
                    // 주소를 고치면 앞 주소로 받은 증명은 더는 유효하지 않다.
                    setEmailProofToken(null);
                    setResetBlockedSocialOnly(false);
                    setResetDone(false);
                  }}
                  placeholder="you@example.com"
                  type="email"
                  value={emailInput}
                />
              </label>

              {looksLikeEmail(emailInput) ? (
                <>
                  {/* 인증 뒤에도 완료 상태를 보여 주는 기존 이메일 카드를 유지한다. */}
                  <EmailVerificationCard
                    key={emailFlowGeneration}
                    email={normalizedEmail}
                    onVerified={onEmailVerified}
                  />
                  {/* 가입 여부는 서버도 알려 주지 않는다(아무나 이메일만으로 가입 여부를 훑지
                      못하게). 메일이 오지 않는 이유를 사용자가 스스로 좁힐 수 있게 안내한다. */}
                  {emailProofToken ? null : (
                    <p className="tm-text-caption" style={{ margin: 0 }}>
                      가입된 이메일이면 인증번호를 보내드려요. 메일이 오지 않으면 주소를 다시 확인하거나
                      스팸함을 확인해 주세요.
                    </p>
                  )}
                </>
              ) : null}
            </>
          )}

          {found && mode === 'find-id' ? (
            <Card pad={16} className="tm-auth-soft-card">
              <div className="tm-text-body-lg">가입한 이메일</div>
              <div className="tm-text-heading" style={{ marginTop: 4 }}>{found.maskedEmail ?? '—'}</div>
              {socialOnly ? (
                <div className="tm-text-caption" style={{ marginTop: 8 }}>
                  이 계정은 카카오 로그인으로 가입했어요. 카카오로 로그인해 주세요.
                </div>
              ) : null}
              <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href={emailLoginHref} style={{ marginTop: 16 }}>
                로그인하러 가기
              </Link>
            </Card>
          ) : null}

          {mode === 'reset-password' && socialOnly ? (
            <Card pad={16} className="tm-auth-soft-card">
              <div className="tm-text-body-lg">비밀번호가 없는 계정이에요</div>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>
                카카오 로그인으로 가입해서 바꿀 비밀번호가 없어요. 카카오로 로그인해 주세요.
              </div>
              <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href={loginHref} style={{ marginTop: 16 }}>
                로그인 화면으로
              </Link>
            </Card>
          ) : null}

          {passwordFormVisible ? (
            <>
              <label className="tm-auth-field" htmlFor={`${fieldId}-password`}>
                <span className="tm-text-label">새 비밀번호</span>
                <input
                  id={`${fieldId}-password`}
                  className="tm-input tm-auth-input"
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="8자 이상"
                  type="password"
                  value={newPassword}
                />
              </label>
              <label className="tm-auth-field" htmlFor={`${fieldId}-password-confirm`}>
                <span className="tm-text-label">새 비밀번호 확인</span>
                <input
                  id={`${fieldId}-password-confirm`}
                  className="tm-input tm-auth-input"
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  placeholder="비밀번호 다시 입력"
                  type="password"
                  value={passwordConfirm}
                />
                {passwordConfirm.length > 0 && newPassword !== passwordConfirm ? (
                  <span className="tm-text-caption tm-auth-field-helper-error" role="alert">
                    비밀번호가 일치하지 않아요.
                  </span>
                ) : null}
              </label>
              <Button
                block
                disabled={!passwordReady}
                loading={resetting}
                onClick={() => void submitReset()}
                size="lg"
                type="button"
                variant={passwordReady ? 'primary' : 'neutral'}
              >
                비밀번호 바꾸기
              </Button>
            </>
          ) : null}

          {resetDone ? (
            <Card pad={16} className="tm-auth-soft-card">
              <div className="tm-text-body-lg">비밀번호를 바꿨어요</div>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>{returnToSettings ? '인증한 계정의 비밀번호를 바꿨어요.' : '새 비밀번호로 로그인해 주세요.'}</div>
              <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href={returnToSettings ? backHref : emailLoginHref} style={{ marginTop: 16 }}>
                {returnToSettings ? '계정 설정으로 돌아가기' : '로그인하러 가기'}
              </Link>
            </Card>
          ) : null}

          {error ? (
            <Card pad={16} className="tm-auth-soft-card tm-auth-soft-card-error">
              <div className="tm-text-body-lg">계정을 확인하지 못했어요</div>
              <div className="tm-text-caption">{error}</div>
            </Card>
          ) : null}
        </div>
      </div>
    </AuthFrame>
  );
}
