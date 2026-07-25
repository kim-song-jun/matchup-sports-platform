'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { PhoneVerificationCard } from '@/components/auth/phone-verification/phone-verification-card';
import { useV1FindAccountByPhone, useV1ResetPasswordByPhone } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1FoundAccount } from '@/types/api';
import { AuthFrame } from './auth-page';
import { formatPhone, normalizeSeparatedDigits } from './signup-profile-validation';

type Mode = 'find-id' | 'reset-password';

const MODE_COPY: Record<Mode, { title: string; sub: string }> = {
  'find-id': {
    title: '가입한 이메일을 찾아요',
    sub: '가입할 때 등록한 휴대폰 번호로 본인인증하면 로그인에 쓰는 이메일을 알려드려요.',
  },
  'reset-password': {
    title: '비밀번호를 다시 설정해요',
    sub: '가입할 때 등록한 휴대폰 번호로 본인인증하면 새 비밀번호를 정할 수 있어요.',
  },
};

export function AccountRecoveryClient() {
  const [mode, setMode] = useState<Mode>('find-id');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [proofToken, setProofToken] = useState<string | null>(null);
  const [found, setFound] = useState<V1FoundAccount | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [resetDone, setResetDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const findAccount = useV1FindAccountByPhone();
  const resetPassword = useV1ResetPasswordByPhone();

  // 모드를 바꾸면 앞 모드에서 받은 증명·결과를 버린다 — 남겨 두면 "아이디 찾기로 인증했는데
  // 비밀번호 재설정 화면이 이미 인증된 것처럼 보이는" 상태가 된다.
  const switchMode = (next: Mode) => {
    setMode(next);
    setProofToken(null);
    setFound(null);
    setNewPassword('');
    setPasswordConfirm('');
    setResetDone(false);
    setError(null);
  };

  const onVerified = async (token?: string) => {
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

  const passwordReady =
    newPassword.length >= 8 && newPassword === passwordConfirm && Boolean(proofToken);

  const submitReset = async () => {
    if (!proofToken || !passwordReady || resetPassword.isPending) return;
    setError(null);
    try {
      await resetPassword.mutateAsync({ phone: phoneDigits, proofToken, newPassword });
      setResetDone(true);
    } catch (err) {
      setError(extractErrorMessage(err, '비밀번호를 바꾸지 못했어요.'));
    }
  };

  const copy = MODE_COPY[mode];
  // 카카오로만 가입한 계정은 바꿀 비밀번호 자체가 없다 — 재설정 입력을 띄우는 대신 안내한다.
  const socialOnly = found !== null && !found.hasPassword;

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
        <p className="tm-text-body tm-auth-sub">{copy.sub}</p>

        <div className="tm-auth-form">
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
              onVerified={(token) => void onVerified(token)}
            />
          ) : null}

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

          {found && mode === 'reset-password' && socialOnly ? (
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

          {found && mode === 'reset-password' && !socialOnly && !resetDone ? (
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
                loading={resetPassword.isPending}
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
