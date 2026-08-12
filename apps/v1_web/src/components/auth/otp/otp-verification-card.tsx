'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, KeyRound, RefreshCw } from 'lucide-react';
import { AlertBanner } from '@/components/v1-ui/primitives';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';

/**
 * 6자리 인증번호 카드의 공통 껍데기 — 발급 → 입력 → 대조 → 완료의 화면 상태만 소유한다.
 *
 * 어떤 API 를 부를지, 성공했을 때 부모에게 무엇을 넘길지는 채널별 래퍼
 * (PhoneVerificationCard / EmailVerificationCard)가 정한다. 카운트다운·재발송 쿨다운·
 * 만료·에러 톤 같은 규칙을 채널마다 복사해 두면 한쪽만 고쳐지는 순간 두 화면이 갈린다.
 */

const CODE_LENGTH = 6;
/** 서버 OTP TTL(백엔드 VerificationService/PhoneVerificationService/EmailVerificationService 공통 상수)과 정합.
 * 발급 응답의 서버 expiresAt 을 우선 사용하고, 없을 때만 이 상수로 카운트다운을 폴백 계산한다. */
const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const COUNTDOWN_TICK_MS = 1000;

export type OtpIssueResult = {
  /** 이미 인증이 끝난 경우(로그인 후 흐름) — 코드 입력 없이 완료 상태로 넘어간다. */
  alreadyVerified?: boolean;
  expiresAt?: string;
  devCode?: string;
};

type Props = {
  /** 카드 머리말. 예: '휴대폰 본인인증' */
  title: string;
  /** 인증이 끝난 뒤 카드에 남는 한 줄. */
  verifiedMessage: string;
  /** 입력칸·에러·남은시간 요소의 DOM id 접두사(aria-describedby 연결에 쓰인다). */
  idPrefix: string;
  /**
   * 인증 대상(번호·주소)의 식별자. 값이 바뀌면 이전 대상으로 발급한 코드가 남지 않도록
   * 발급/입력 상태를 통째로 버린다.
   */
  resetKey: string;
  /** '인증번호 받기' 버튼의 채널 아이콘. */
  requestIcon: ReactNode;
  issuing: boolean;
  verifying: boolean;
  onRequestCode: () => Promise<OtpIssueResult>;
  /** 대조 성공이면 true. 부모에게 알리는 일(onVerified)은 래퍼가 여기서 처리한다. */
  onSubmitCode: (code: string) => Promise<boolean>;
  requestFailureMessage: string;
  verifyFailureMessage: string;
  /**
   * card: 페이지 배경 위에 단독으로 놓일 때(예: /my/phone-verify).
   * inset: 이미 카드인 폼 안에 끼워질 때(가입 위저드) — 카드 안 카드로 테두리가 겹쳐 보이지 않도록
   * 흰 카드 대신 폼 내부 보조 영역(tint) 표면을 쓴다.
   */
  surface?: 'card' | 'inset';
};

export function OtpVerificationCard({
  title,
  verifiedMessage,
  idPrefix,
  resetKey,
  requestIcon,
  issuing,
  verifying,
  onRequestCode,
  onSubmitCode,
  requestFailureMessage,
  verifyFailureMessage,
  surface = 'card',
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'idle' | 'sent'>('idle');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  /**
   * 재발송 쿨다운은 실패가 아니라 "조금 뒤에 다시" 안내다. 빨간 error 배너로 띄우면
   * 사용자가 인증에 실패한 줄 알고 대상부터 다시 확인하게 되므로 info 톤으로 분리한다.
   */
  const [errorTone, setErrorTone] = useState<'error' | 'info'>('error');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [resendRemainingMs, setResendRemainingMs] = useState(0);
  const [verified, setVerified] = useState(false);

  // 대상이 바뀌면(사용자가 번호·주소를 계속 수정 가능) 이전 대상의 발급/입력 상태를 버린다 —
  // 같은 컴포넌트 인스턴스가 유지될 때 이전 대상으로 발급한 코드로 대조하는 것을 막는다.
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
  }, [resetKey]);

  const showFailure = useCallback((err: unknown, fallback: string) => {
    setError(extractErrorMessage(err, fallback));
    setErrorTone(extractErrorCode(err) === 'VERIFICATION_RESEND_COOLDOWN' ? 'info' : 'error');
  }, []);

  const requestCode = useCallback(async () => {
    setError(null);
    setErrorTone('error');
    try {
      const res = await onRequestCode();
      if (res.alreadyVerified) {
        setVerified(true);
        return;
      }
      // 서버가 내려준 expiresAt 을 우선 사용(서버 TTL 기준). 없으면 CODE_TTL_MS 로 폴백.
      const resolvedExpiresAt = res.expiresAt ?? new Date(Date.now() + CODE_TTL_MS).toISOString();
      setExpiresAt(resolvedExpiresAt);
      setRemainingMs(Math.max(0, new Date(resolvedExpiresAt).getTime() - Date.now()));
      setCode(res.devCode ?? '');
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_MS);
      setResendRemainingMs(RESEND_COOLDOWN_MS);
      setPhase('sent');
    } catch (err) {
      showFailure(err, requestFailureMessage);
    }
  }, [onRequestCode, requestFailureMessage, showFailure]);

  const submitCode = useCallback(async () => {
    setError(null);
    setErrorTone('error');
    try {
      if (await onSubmitCode(code)) setVerified(true);
    } catch (err) {
      showFailure(err, verifyFailureMessage);
    }
  }, [code, onSubmitCode, verifyFailureMessage, showFailure]);

  /**
   * 이 카드는 대상 입력이 끝나는 순간 폼 중간에 새로 나타난다. 모바일에서는 하단 고정 CTA가
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
  const errorId = `${idPrefix}-error`;
  const remainingId = `${idPrefix}-remaining`;

  if (verified) {
    return (
      <div
        ref={rootRef}
        className={surfaceClass}
        style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--blue50)' }}
      >
        <CheckCircle2 size={20} color="var(--blue500)" aria-hidden="true" />
        <p className="tm-text-label" style={{ margin: 0, color: 'var(--blue700)' }}>
          {verifiedMessage}
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
        {title}
      </p>

      {phase === 'idle' ? (
        <button
          type="button"
          className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
          disabled={issuing}
          onClick={() => void requestCode()}
        >
          {issuing ? <span className="tm-spinner" aria-hidden="true" /> : requestIcon}
          인증번호 받기
        </button>
      ) : (
        <>
          <label className="tm-auth-field" htmlFor={`${idPrefix}-otp-input`}>
            <span className="tm-text-label">인증번호 6자리</span>
            <input
              id={`${idPrefix}-otp-input`}
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
              aria-describedby={error ? `${errorId} ${remainingId}` : remainingId}
            />
          </label>

          {/* 에러는 입력칸 바로 아래에 둔다 — 카드 맨 아래(재전송 줄 밑)에 있으면 시선이 세 단계
              떨어지고 "다시 받기"의 결과처럼 읽힌다. */}
          {error ? (
            <div id={errorId}>
              <AlertBanner message={error} tone={errorTone} />
            </div>
          ) : null}

          <button
            type="button"
            className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
            disabled={expired || verifying || code.length !== CODE_LENGTH}
            onClick={() => void submitCode()}
          >
            {verifying ? <span className="tm-spinner" aria-hidden="true" /> : <KeyRound size={18} aria-hidden="true" />}
            확인
          </button>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span
              id={remainingId}
              className="tm-text-caption"
              style={{ color: expired ? 'var(--red700)' : 'var(--text-muted)' }}
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
