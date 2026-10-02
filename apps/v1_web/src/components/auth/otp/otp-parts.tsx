import { RefreshCw } from 'lucide-react';
import { AlertBanner } from '@/components/v1-ui/primitives';
import { OTP_CODE_LENGTH, type OtpVerification } from './use-otp-verification';

/**
 * 인증번호 입력 화면의 조각들. 카드(OtpVerificationCard)와 하단 버튼이 발송·확인을 맡는 가입 화면이
 * 같은 입력칸·안내·재발송 줄을 쓰도록 나눴다. 상태는 useOtpVerification 이 소유한다.
 */

type Parts = { idPrefix: string; otp: OtpVerification };

export const otpInputId = (idPrefix: string) => `${idPrefix}-otp-input`;
const otpErrorId = (idPrefix: string) => `${idPrefix}-error`;
const otpRemainingId = (idPrefix: string) => `${idPrefix}-remaining`;

export function OtpCodeInput({ idPrefix, otp, verifying }: Parts & { verifying: boolean }) {
  const showError = Boolean(otp.error) && otp.errorTone === 'error';
  return (
    <label className="tm-auth-field" htmlFor={otpInputId(idPrefix)}>
      <span className="tm-text-label">인증번호 6자리</span>
      <input
        id={otpInputId(idPrefix)}
        className={`tm-input tm-auth-input ${showError ? 'tm-auth-input-error' : ''}`}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={OTP_CODE_LENGTH}
        pattern="[0-9]*"
        placeholder="숫자 6자리"
        value={otp.code}
        disabled={otp.expired || verifying}
        onChange={(event) => otp.setCode(event.target.value)}
        aria-invalid={showError}
        aria-describedby={otp.error ? `${otpErrorId(idPrefix)} ${otpRemainingId(idPrefix)}` : otpRemainingId(idPrefix)}
      />
    </label>
  );
}

/** 에러는 입력칸 바로 아래에 둔다 — 시선이 세 단계 떨어지면 "다시 받기"의 결과처럼 읽힌다. */
export function OtpErrorBanner({ idPrefix, otp }: Parts) {
  if (!otp.error) return null;
  return (
    <div id={otpErrorId(idPrefix)}>
      <AlertBanner message={otp.error} tone={otp.errorTone} />
    </div>
  );
}

export function OtpRemainingRow({ idPrefix, otp, issuing }: Parts & { issuing: boolean }) {
  const minutes = Math.floor(otp.remainingMs / 60000);
  const seconds = Math.floor((otp.remainingMs % 60000) / 1000);
  const resendSeconds = Math.ceil(otp.resendRemainingMs / 1000);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span
        id={otpRemainingId(idPrefix)}
        className="tm-text-caption"
        style={{ color: otp.expired ? 'var(--red700)' : 'var(--text-muted)' }}
      >
        {otp.expired ? '인증번호를 다시 받아 주세요' : `남은 시간 ${minutes}:${String(seconds).padStart(2, '0')}`}
      </span>
      <button
        type="button"
        className="tm-btn tm-btn-sm tm-btn-ghost"
        disabled={issuing || otp.resendRemainingMs > 0}
        onClick={() => void otp.requestCode()}
      >
        <RefreshCw size={14} aria-hidden="true" />
        {otp.resendRemainingMs > 0 ? `다시 받기 (${resendSeconds}초)` : '다시 받기'}
      </button>
    </div>
  );
}
