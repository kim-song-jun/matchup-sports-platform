'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { AlertBanner } from '@/components/v1-ui/primitives';
import { PHONE_CONFLICT_CODE } from './phone-conflict-notice';
import { OtpCodeInput, OtpErrorBanner, OtpRemainingRow } from './otp-parts';
import { OTP_CODE_LENGTH, useOtpVerification, type OtpVerificationOptions } from './use-otp-verification';

/**
 * 6자리 인증번호 카드 — 카드 안에서 발급 버튼과 확인 버튼을 함께 갖는 껍데기.
 * 상태·규칙은 useOtpVerification, 입력칸·재발송 줄은 otp-parts 가 소유한다.
 */

type Props = OtpVerificationOptions & {
  /** 카드 머리말. 예: '휴대폰 본인인증' */
  title: string;
  /** 인증이 끝난 뒤 카드에 남는 한 줄. */
  verifiedMessage: string;
  /** 입력칸·에러·남은시간 요소의 DOM id 접두사(aria-describedby 연결에 쓰인다). */
  idPrefix: string;
  /** '인증번호 받기' 버튼의 채널 아이콘. */
  requestIcon: ReactNode;
  issuing: boolean;
  verifying: boolean;
  /**
   * card: 페이지 배경 위에 단독으로 놓일 때(예: /my/phone-verify).
   * inset: 이미 카드인 폼 안에 끼워질 때 — 카드 안 카드로 테두리가 겹쳐 보이지 않도록
   * 흰 카드 대신 폼 내부 보조 영역(tint) 표면을 쓴다.
   */
  surface?: 'card' | 'inset';
  /** 번호 중복(PHONE_CONFLICT)일 때 오류 배너 대신 보여 줄 안내와 출구. */
  conflictNotice?: ReactNode;
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
  conflictNotice,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const otp = useOtpVerification({ resetKey, onRequestCode, onSubmitCode, requestFailureMessage, verifyFailureMessage });
  const { phase, verified, error, errorTone } = otp;

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
      style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <p className="tm-text-label" style={{ margin: 0 }}>
        {title}
      </p>

      {phase === 'idle' ? (
        <button
          type="button"
          className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
          disabled={issuing}
          onClick={() => void otp.requestCode()}
        >
          {issuing ? <span className="tm-spinner" aria-hidden="true" /> : requestIcon}
          인증번호 받기
        </button>
      ) : (
        <>
          <OtpCodeInput idPrefix={idPrefix} otp={otp} verifying={verifying} />
          <OtpErrorBanner idPrefix={idPrefix} otp={otp} conflictNotice={conflictNotice} />

          <button
            type="button"
            className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
            disabled={otp.expired || verifying || otp.code.length !== OTP_CODE_LENGTH}
            onClick={() => void otp.submitCode()}
          >
            {verifying ? <span className="tm-spinner" aria-hidden="true" /> : <KeyRound size={18} aria-hidden="true" />}
            확인
          </button>

          <OtpRemainingRow idPrefix={idPrefix} otp={otp} issuing={issuing} />
        </>
      )}

      {/* idle 단계의 실패(발송 자체 실패·쿨다운)는 방금 누른 버튼의 결과이므로 버튼 아래에 남긴다. */}
      {error && phase === 'idle'
        ? (conflictNotice && otp.errorCode === PHONE_CONFLICT_CODE
          ? conflictNotice
          : <AlertBanner message={error} tone={errorTone} />)
        : null}
    </div>
  );
}
