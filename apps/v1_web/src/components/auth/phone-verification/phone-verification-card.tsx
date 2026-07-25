'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, KeyRound, MessageSquare, RefreshCw } from 'lucide-react';
import { AlertBanner } from '@/components/v1-ui/primitives';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import {
  useV1AuthedPhoneConfirm,
  useV1AuthedPhoneRequest,
  useV1PhoneIssue,
  useV1PhoneVerify,
} from '@/hooks/use-v1-api';

type Props = {
  /** public: 비로그인 회원가입 전 pre-account 인증(proofToken 발급). authed: 로그인 후 카카오/레거시 구제. */
  mode: 'public' | 'authed';
  /** public 모드에서 발급받을 증명 토큰의 용도. 생략하면 가입용. */
  purpose?: 'signup' | 'password_reset';
  phone: string;
  /** public 모드는 proofToken을 전달하고, authed 모드는 서버가 이미 phoneVerifiedAt을 세팅하므로 인자 없이 호출된다. */
  onVerified: (proofToken?: string) => void;
  /**
   * card: 페이지 배경 위에 단독으로 놓일 때(예: /my/phone-verify).
   * inset: 이미 카드인 폼 안에 끼워질 때(가입 위저드) — 카드 안 카드로 테두리가 겹쳐 보이지 않도록
   * 흰 카드 대신 폼 내부 보조 영역(tint) 표면을 쓴다.
   */
  surface?: 'card' | 'inset';
};

const CODE_LENGTH = 6;
/** 서버 OTP TTL(백엔드 VerificationService/PhoneVerificationService 공통 상수)과 정합.
 * 발급 응답의 서버 expiresAt 을 우선 사용하고, 없을 때만 이 상수로 카운트다운을 폴백 계산한다. */
const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const COUNTDOWN_TICK_MS = 1000;

export function PhoneVerificationCard({ mode, purpose, phone, onVerified, surface = 'card' }: Props) {
  const publicIssue = useV1PhoneIssue();
  const publicVerify = useV1PhoneVerify();
  const authedRequest = useV1AuthedPhoneRequest();
  const authedConfirm = useV1AuthedPhoneConfirm();

  const rootRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'idle' | 'sent'>('idle');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  /**
   * 재발송 쿨다운은 실패가 아니라 "조금 뒤에 다시" 안내다. 빨간 error 배너로 띄우면
   * 사용자가 인증에 실패한 줄 알고 번호부터 다시 확인하게 되므로 info 톤으로 분리한다.
   */
  const [errorTone, setErrorTone] = useState<'error' | 'info'>('error');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [resendRemainingMs, setResendRemainingMs] = useState(0);
  const [verified, setVerified] = useState(false);

  // phone 또는 mode 가 바뀌면(사용자가 번호를 계속 수정 가능) 이전 번호의 발급/입력 상태를 버린다 —
  // 같은 컴포넌트 인스턴스가 유지될 때 이전 번호로 발급한 코드로 verify 하는 것을 막는다.
  useEffect(() => {
    setPhase('idle');
    setCode('');
    setError(null);
    setErrorTone('error');
    setExpiresAt(null);
    setResendAvailableAt(null);
    setRemainingMs(0);
    setResendRemainingMs(0);
    setVerified(false);
  }, [phone, mode]);

  const issuing = mode === 'public' ? publicIssue.isPending : authedRequest.isPending;
  const verifying = mode === 'public' ? publicVerify.isPending : authedConfirm.isPending;

  const showFailure = useCallback((err: unknown, fallback: string) => {
    setError(extractErrorMessage(err, fallback));
    setErrorTone(extractErrorCode(err) === 'VERIFICATION_RESEND_COOLDOWN' ? 'info' : 'error');
  }, []);

  const requestCode = useCallback(async () => {
    setError(null);
    setErrorTone('error');
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
        // 서버가 내려준 expiresAt 을 우선 사용(서버 TTL 기준). 없으면 CODE_TTL_MS 로 폴백.
        const resolvedExpiresAt = res.expiresAt ?? new Date(Date.now() + CODE_TTL_MS).toISOString();
        setExpiresAt(resolvedExpiresAt);
        setRemainingMs(Math.max(0, new Date(resolvedExpiresAt).getTime() - Date.now()));
        setCode(res.devCode ?? '');
      }
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_MS);
      setResendRemainingMs(RESEND_COOLDOWN_MS);
      setPhase('sent');
    } catch (err) {
      showFailure(err, '인증번호 발송에 실패했어요. 잠시 후 다시 시도해 주세요.');
    }
  }, [mode, phone, publicIssue, authedRequest, onVerified, showFailure]);

  const verifyCode = useCallback(async () => {
    setError(null);
    setErrorTone('error');
    try {
      if (mode === 'public') {
        const res = await publicVerify.mutateAsync({ phone, code, purpose });
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
      showFailure(err, '인증번호가 올바르지 않아요. 다시 확인해 주세요.');
    }
  }, [mode, purpose, phone, code, publicVerify, authedConfirm, onVerified, showFailure]);

  /**
   * 이 카드는 번호 11자리를 채우는 순간 폼 중간에 새로 나타난다. 모바일에서는 하단 고정 CTA가
   * 그 자리를 덮고 있어(390 기준 실측) "인증번호 받기"가 화면 밖/뒤에 깔린 채 등장한다 —
   * 사용자가 스크롤을 내리기 전까지 인증을 시작할 방법이 없으므로 등장 시 뷰로 끌어온다.
   *
   * 폼 안에 끼워지는 inset 변형에서만 보정한다 — /my/phone-verify 처럼 카드가 화면의 주인공인
   * 곳에는 가릴 고정 CTA가 없어서, 같은 스크롤이 이유 없는 화면 점프로만 남는다.
   */
  useEffect(() => {
    const node = rootRef.current;
    if (!node || verified || surface !== 'inset') return;
    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // jsdom 등 레이아웃이 없는 환경에는 scrollIntoView 자체가 없다 — 스크롤 보정은 부가 기능이므로 건너뛴다.
    node.scrollIntoView?.({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    // phase 전환(idle→sent)마다 다시 맞춘다 — 입력칸이 새로 생기며 높이가 바뀌기 때문.
  }, [phase, verified, surface]);

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

  // 'inset'은 이미 카드인 폼 안에 들어갈 때 쓰는 표면 — 흰 카드 위 흰 카드로 테두리가 겹치지 않게 한다.
  const surfaceClass = surface === 'inset' ? 'tm-auth-inset' : 'tm-card';

  if (verified) {
    return (
      <div
        ref={rootRef}
        className={surfaceClass}
        style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--blue50)' }}
      >
        <CheckCircle2 size={20} color="var(--blue500)" aria-hidden="true" />
        <p className="tm-text-label" style={{ margin: 0, color: 'var(--blue500)' }}>
          휴대폰 본인인증이 완료됐어요.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={surfaceClass}
      style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}
    >
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
              className={`tm-input tm-auth-input ${error && errorTone === 'error' ? 'tm-auth-input-error' : ''}`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              pattern="[0-9]*"
              placeholder="숫자 6자리"
              value={code}
              disabled={expired || verifying}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
              aria-invalid={Boolean(error) && errorTone === 'error'}
              aria-describedby={
                error ? 'phone-verification-error phone-verification-remaining' : 'phone-verification-remaining'
              }
            />
          </label>

          {/* 에러는 입력칸 바로 아래에 둔다 — 카드 맨 아래(재전송 줄 밑)에 있으면 시선이 세 단계
              떨어지고 "다시 받기"의 결과처럼 읽힌다. */}
          {error ? (
            <div id="phone-verification-error">
              <AlertBanner message={error} tone={errorTone} />
            </div>
          ) : null}

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

      {/* idle 단계의 실패(발송 자체 실패·쿨다운)는 방금 누른 버튼의 결과이므로 버튼 아래에 남긴다. */}
      {error && phase === 'idle' ? <AlertBanner message={error} tone={errorTone} /> : null}
    </div>
  );
}
