'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { EmailVerificationCard } from '@/components/auth/email-verification/email-verification-card';
import { PhoneVerificationCard } from '@/components/auth/phone-verification/phone-verification-card';
import {
  useV1FindAccountByPhone,
  useV1ResetPasswordByEmail,
  useV1ResetPasswordByPhone,
} from '@/hooks/use-v1-api';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import type { V1FoundAccount } from '@/types/api';
import { AuthFrame } from './auth-page';
import { formatPhone, normalizeSeparatedDigits } from './signup-profile-validation';

type Mode = 'find-id' | 'reset-password';
/** 본인 확인 수단. 아이디 찾기는 휴대폰만 — 이메일로 이메일을 찾을 수는 없다. */
type Method = 'phone' | 'email';

const MODE_COPY: Record<Mode, { title: string; sub: string }> = {
  'find-id': {
    title: '가입한 이메일을 찾아요',
    sub: '가입할 때 등록한 휴대폰 번호로 본인인증하면 로그인에 쓰는 이메일을 알려드려요.',
  },
  'reset-password': {
    title: '비밀번호를 다시 설정해요',
    sub: '',
  },
};

const RESET_SUB: Record<Method, string> = {
  phone: '가입할 때 등록한 휴대폰 번호로 본인인증하면 새 비밀번호를 정할 수 있어요.',
  email: '가입한 이메일로 인증번호를 보내드려요. 코드를 확인하면 새 비밀번호를 정할 수 있어요.',
};

/**
 * 인증 카드를 띄울지 정하는 가벼운 형식 확인. 최종 판정은 서버(class-validator)가 하고,
 * 여기서는 "아직 다 입력하지 않은 주소"에 카드가 먼저 튀어나오지 않게만 막는다.
 */
function looksLikeEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value.trim());
}

export function AccountRecoveryClient() {
  const [mode, setMode] = useState<Mode>('find-id');
  const [method, setMethod] = useState<Method>('phone');
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

  const findAccount = useV1FindAccountByPhone();
  const resetPassword = useV1ResetPasswordByPhone();
  const resetPasswordByEmail = useV1ResetPasswordByEmail();

  const normalizedEmail = emailInput.trim().toLowerCase();

  // 앞 단계에서 받은 증명·결과를 버린다 — 남겨 두면 "다른 방법으로 인증했는데 이 화면이
  // 이미 인증된 것처럼 보이는" 상태가 된다.
  const resetProgress = () => {
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
    // 아이디 찾기는 휴대폰 인증만 지원한다 — 모드를 옮기면 수단도 되돌린다.
    if (next === 'find-id') setMethod('phone');
    resetProgress();
  };

  const switchMethod = (next: Method) => {
    setMethod(next);
    resetProgress();
  };

  const onPhoneVerified = async (token?: string) => {
    if (!token) return;
    setProofToken(token);
    setError(null);
    try {
      setFound(await findAccount.mutateAsync({ phone: phoneDigits, proofToken: token }));
    } catch (err) {
      setFound(null);
      setError(extractErrorMessage(err, '계정을 찾지 못했어요.'));
    }
  };

  const copy = MODE_COPY[mode];
  // 카카오로만 가입한 계정은 바꿀 비밀번호 자체가 없다 — 재설정 입력을 띄우는 대신 안내한다.
  const socialOnly = (found !== null && !found.hasPassword) || resetBlockedSocialOnly;
  const resetting = resetPassword.isPending || resetPasswordByEmail.isPending;

  // 본인 확인을 마쳤고 아직 비밀번호를 못 바꾼 상태에서만 새 비밀번호 입력을 띄운다.
  const verifiedForReset =
    method === 'phone' ? Boolean(proofToken) && found !== null : Boolean(emailProofToken);
  const passwordFormVisible = mode === 'reset-password' && verifiedForReset && !socialOnly && !resetDone;
  const passwordReady = newPassword.length >= 8 && newPassword === passwordConfirm;

  const submitReset = async () => {
    if (!passwordReady || resetting) return;
    setError(null);
    try {
      if (method === 'phone') {
        if (!proofToken) return;
        await resetPassword.mutateAsync({ phone: phoneDigits, proofToken, newPassword });
      } else {
        if (!emailProofToken) return;
        await resetPasswordByEmail.mutateAsync({
          email: normalizedEmail,
          proofToken: emailProofToken,
          newPassword,
        });
      }
      setResetDone(true);
    } catch (err) {
      if (extractErrorCode(err) === 'PASSWORD_LOGIN_UNAVAILABLE') {
        setResetBlockedSocialOnly(true);
        return;
      }
      setError(extractErrorMessage(err, '비밀번호를 바꾸지 못했어요.'));
    }
  };

  return (
    <AuthFrame topTitle="계정 찾기" backHref="/login/email">
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
          {mode === 'reset-password' ? RESET_SUB[method] : copy.sub}
        </p>

        <div className="tm-auth-form">
          {mode === 'reset-password' ? (
            <div className="tm-auth-field">
              <span className="tm-text-label">본인 확인 방법</span>
              {/* 위 모드 탭보다 한 단계 낮은 선택지라 축소 변형을 쓴다 — 같은 크기로 두 줄을
                  쌓으면 어느 쪽이 상위인지 읽히지 않는다. */}
              <div className="tm-auth-segmented tm-auth-segmented-sm" role="tablist" aria-label="본인 확인 방법">
                <button
                  className={`tm-auth-segment ${method === 'phone' ? 'tm-auth-segment-active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={method === 'phone'}
                  onClick={() => switchMethod('phone')}
                >
                  휴대폰
                </button>
                <button
                  className={`tm-auth-segment ${method === 'email' ? 'tm-auth-segment-active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={method === 'email'}
                  onClick={() => switchMethod('email')}
                >
                  이메일
                </button>
              </div>
            </div>
          ) : null}

          {method === 'phone' ? (
            <>
              <label className="tm-auth-field">
                <span className="tm-text-label">휴대폰 번호</span>
                <input
                  className="tm-input tm-auth-input"
                  inputMode="numeric"
                  onChange={(event) => {
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
                  mode="public"
                  purpose="password_reset"
                  phone={phoneDigits}
                  onVerified={(token) => void onPhoneVerified(token)}
                />
              ) : null}
            </>
          ) : (
            <>
              <label className="tm-auth-field">
                <span className="tm-text-label">이메일</span>
                <input
                  autoComplete="email"
                  className="tm-input tm-auth-input"
                  inputMode="email"
                  onChange={(event) => {
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
                  {/* 인증 뒤에도 카드를 남긴다 — 휴대폰 경로는 찾은 계정 카드가 인증 성공을
                      대신 알려 주지만, 이메일 경로는 카드가 사라지면 성공했다는 표시가
                      아무 데도 남지 않는다. 카드가 스스로 완료 상태를 보여 준다. */}
                  <EmailVerificationCard
                    email={normalizedEmail}
                    onVerified={(token) => {
                      if (!token) return;
                      setEmailProofToken(token);
                      setError(null);
                    }}
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
              <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href="/login/email" style={{ marginTop: 14 }}>
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
              <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href="/login" style={{ marginTop: 14 }}>
                로그인 화면으로
              </Link>
            </Card>
          ) : null}

          {passwordFormVisible ? (
            <>
              <label className="tm-auth-field">
                <span className="tm-text-label">새 비밀번호</span>
                <input
                  className="tm-input tm-auth-input"
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="8자 이상"
                  type="password"
                  value={newPassword}
                />
              </label>
              <label className="tm-auth-field">
                <span className="tm-text-label">새 비밀번호 확인</span>
                <input
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
              <div className="tm-text-caption" style={{ marginTop: 4 }}>새 비밀번호로 로그인해 주세요.</div>
              <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href="/login/email" style={{ marginTop: 14 }}>
                로그인하러 가기
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
