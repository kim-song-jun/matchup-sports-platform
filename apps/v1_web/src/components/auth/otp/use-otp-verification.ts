import { useCallback, useEffect, useState } from 'react';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';

/**
 * 6자리 인증번호 흐름(발급 → 입력 → 대조 → 완료)의 화면 상태.
 *
 * 어떤 API 를 부를지, 성공했을 때 부모에게 무엇을 넘길지는 채널별 래퍼가 정한다. 카운트다운·재발송
 * 쿨다운·만료·에러 톤 같은 규칙을 채널마다 복사해 두면 한쪽만 고쳐지는 순간 화면이 갈린다.
 * 카드(OtpVerificationCard)와 하단 버튼이 발송·확인을 맡는 가입 화면이 같은 상태를 쓴다.
 */

export const OTP_CODE_LENGTH = 6;
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

export type OtpVerificationOptions = {
  /**
   * 인증 대상(번호·주소)의 식별자. 값이 바뀌면 이전 대상으로 발급한 코드가 남지 않도록
   * 발급/입력 상태를 통째로 버린다.
   */
  resetKey: string;
  onRequestCode: () => Promise<OtpIssueResult>;
  /** 대조 성공이면 true. 부모에게 알리는 일(onVerified)은 채널 래퍼가 여기서 처리한다. */
  onSubmitCode: (code: string) => Promise<boolean>;
  requestFailureMessage: string;
  verifyFailureMessage: string;
};

export type OtpVerification = ReturnType<typeof useOtpVerification>;

export function useOtpVerification({
  resetKey,
  onRequestCode,
  onSubmitCode,
  requestFailureMessage,
  verifyFailureMessage,
}: OtpVerificationOptions) {
  const [phase, setPhase] = useState<'idle' | 'sent'>('idle');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  /**
   * 재발송 쿨다운은 실패가 아니라 "조금 뒤에 다시" 안내다. 빨간 error 배너로 띄우면
   * 사용자가 인증에 실패한 줄 알고 대상부터 다시 확인하게 되므로 info 톤으로 분리한다.
   */
  const [errorTone, setErrorTone] = useState<'error' | 'info'>('error');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [resendRemainingMs, setResendRemainingMs] = useState(0);
  const [verified, setVerified] = useState(false);

  // 대상이 바뀌면(사용자가 번호·주소를 계속 수정 가능) 이전 대상의 발급/입력 상태를 버린다 —
  // 같은 인스턴스가 유지될 때 이전 대상으로 발급한 코드로 대조하는 것을 막는다.
  useEffect(() => {
    setPhase('idle');
    setCode('');
    setError(null);
    setErrorTone('error');
    setErrorCode(null);
    setExpiresAt(null);
    setResendAvailableAt(null);
    setRemainingMs(0);
    setResendRemainingMs(0);
    setVerified(false);
  }, [resetKey]);

  const showFailure = useCallback((err: unknown, fallback: string) => {
    const code = extractErrorCode(err);
    setError(extractErrorMessage(err, fallback));
    setErrorCode(code);
    setErrorTone(code === 'VERIFICATION_RESEND_COOLDOWN' ? 'info' : 'error');
  }, []);

  const requestCode = useCallback(async () => {
    setError(null);
    setErrorTone('error');
    setErrorCode(null);
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
    setErrorCode(null);
    try {
      if (await onSubmitCode(code)) setVerified(true);
    } catch (err) {
      showFailure(err, verifyFailureMessage);
    }
  }, [code, onSubmitCode, verifyFailureMessage, showFailure]);

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

  return {
    phase,
    code,
    setCode: (value: string) => setCode(value.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH)),
    error,
    errorTone,
    errorCode,
    verified,
    expired,
    remainingMs,
    resendRemainingMs,
    requestCode,
    submitCode,
  };
}
