'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, MessageSquare, RefreshCw } from 'lucide-react';
import { AlertBanner, Card } from '@/components/v1-ui/primitives';
import { extractErrorMessage } from '@/lib/error-message';
import {
  useV1AuthedPhoneConfirm,
  useV1AuthedPhoneRequest,
  useV1PhoneIssue,
  useV1PhoneVerify,
} from '@/hooks/use-v1-api';

type Props = {
  /** public: 비로그인 회원가입 전 pre-account 인증(proofToken 발급). authed: 로그인 후 카카오/레거시 구제. */
  mode: 'public' | 'authed';
  phone: string;
  /** public 모드는 proofToken을 전달하고, authed 모드는 서버가 이미 phoneVerifiedAt을 세팅하므로 인자 없이 호출된다. */
  onVerified: (proofToken?: string) => void;
};

const CODE_LENGTH = 6;
/** 서버 OTP TTL(백엔드 VerificationService/PhoneVerificationService 공통 상수)과 정합. authed 응답엔
 * expiresAt이 없어 이 상수로 카운트다운을 계산한다. */
const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const COUNTDOWN_TICK_MS = 1000;

export function PhoneVerificationCard({ mode, phone, onVerified }: Props) {
  const publicIssue = useV1PhoneIssue();
  const publicVerify = useV1PhoneVerify();
  const authedRequest = useV1AuthedPhoneRequest();
  const authedConfirm = useV1AuthedPhoneConfirm();

  const [phase, setPhase] = useState<'idle' | 'sent'>('idle');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [resendRemainingMs, setResendRemainingMs] = useState(0);
  const [verified, setVerified] = useState(false);

  const issuing = mode === 'public' ? publicIssue.isPending : authedRequest.isPending;
  const verifying = mode === 'public' ? publicVerify.isPending : authedConfirm.isPending;

  const requestCode = useCallback(async () => {
    setError(null);
    try {
      if (mode === 'public') {
        const res = await publicIssue.mutateAsync({ phone });
        setExpiresAt(res.expiresAt);
        setRemainingMs(Math.max(0, new Date(res.expiresAt).getTime() - Date.now()));
        setCode(res.devCode ?? '');
      } else {
        const res = await authedRequest.mutateAsync({ phone });
        if (res.alreadyVerified) {
          setVerified(true);
          onVerified();
          return;
        }
        const fallbackExpiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
        setExpiresAt(fallbackExpiresAt);
        setRemainingMs(CODE_TTL_MS);
        setCode(res.devCode ?? '');
      }
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_MS);
      setResendRemainingMs(RESEND_COOLDOWN_MS);
      setPhase('sent');
    } catch (err) {
      setError(extractErrorMessage(err, '인증번호 발송에 실패했어요. 잠시 후 다시 시도해 주세요.'));
    }
  }, [mode, phone, publicIssue, authedRequest, onVerified]);

  const verifyCode = useCallback(async () => {
    setError(null);
    try {
      if (mode === 'public') {
        const res = await publicVerify.mutateAsync({ phone, code });
        if (res.verified) {
          setVerified(true);
          onVerified(res.proofToken);
        }
      } else {
        const res = await authedConfirm.mutateAsync({ code });
        if (res.verified) {
          setVerified(true);
          onVerified();
        }
      }
    } catch (err) {
      setError(extractErrorMessage(err, '인증번호가 올바르지 않아요. 다시 확인해 주세요.'));
    }
  }, [mode, phone, code, publicVerify, authedConfirm, onVerified]);

  // 남은 시간 · 재전송 쿨다운 카운트다운(1초 tick). phase가 'sent'인 동안만 동작.
  useEffect(() => {
    if (phase !== 'sent' || verified) return;
    const tick = () => {
      setRemainingMs(expiresAt ? Math.max(0, new Date(expiresAt).getTime() - Date.now()) : 0);
      setResendRemainingMs(resendAvailableAt ? Math.max(0, resendAvailableAt - Date.now()) : 0);
    };
    tick();
    const id = window.setInterval(tick, COUNTDOWN_TICK_MS);
    return () => window.clearInterval(id);
  }, [phase, verified, expiresAt, resendAvailableAt]);

  const expired = phase === 'sent' && !verified && remainingMs <= 0;
  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  const resendSeconds = Math.ceil(resendRemainingMs / 1000);

  if (verified) {
    return (
      <Card pad={16} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--blue50)' }}>
        <CheckCircle2 size={20} color="var(--blue500)" aria-hidden="true" />
        <p className="tm-text-label" style={{ margin: 0, color: 'var(--blue500)' }}>
          휴대폰 본인인증이 완료됐어요.
        </p>
      </Card>
    );
  }

  return (
    <Card pad={18} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="tm-text-label" style={{ margin: 0 }}>
        휴대폰 본인인증
      </p>

      {phase === 'idle' ? (
        <button
          type="button"
          className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
          disabled={issuing}
          onClick={() => void requestCode()}
        >
          {issuing ? <span className="tm-spinner" aria-hidden="true" /> : <MessageSquare size={18} aria-hidden="true" />}
          인증번호 받기
        </button>
      ) : (
        <>
          <label className="tm-auth-field" htmlFor="phone-verification-otp-input">
            <span className="tm-text-label">인증번호 6자리</span>
            <input
              id="phone-verification-otp-input"
              className="tm-input tm-auth-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              pattern="[0-9]*"
              placeholder="숫자 6자리"
              value={code}
              disabled={expired || verifying}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
              aria-describedby="phone-verification-remaining"
            />
          </label>

          <button
            type="button"
            className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
            disabled={expired || verifying || code.length !== CODE_LENGTH}
            onClick={() => void verifyCode()}
          >
            {verifying ? <span className="tm-spinner" aria-hidden="true" /> : <KeyRound size={18} aria-hidden="true" />}
            확인
          </button>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span
              id="phone-verification-remaining"
              className="tm-text-caption"
              style={{ color: expired ? 'var(--red500)' : 'var(--text-muted)' }}
            >
              {expired ? '인증번호를 다시 받아 주세요' : `남은 시간 ${minutes}:${String(seconds).padStart(2, '0')}`}
            </span>
            <button
              type="button"
              className="tm-btn tm-btn-sm tm-btn-ghost"
              disabled={issuing || resendRemainingMs > 0}
              onClick={() => void requestCode()}
            >
              <RefreshCw size={14} aria-hidden="true" />
              {resendRemainingMs > 0 ? `다시 받기 (${resendSeconds}초)` : '다시 받기'}
            </button>
          </div>
        </>
      )}

      {error ? <AlertBanner message={error} tone="error" /> : null}
    </Card>
  );
}
