'use client';

import { useCallback } from 'react';
import { MessageSquare } from 'lucide-react';
import { OtpVerificationCard, type OtpIssueResult } from '@/components/auth/otp/otp-verification-card';
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
   * inset: 이미 카드인 폼 안에 끼워질 때(가입 위저드).
   */
  surface?: 'card' | 'inset';
};

/**
 * 휴대폰 본인인증 카드 — 발급/대조 API 와 부모 통보 규칙만 정하고, 화면 상태(카운트다운·재발송·
 * 만료·에러 톤)는 OtpVerificationCard 가 이메일 카드와 함께 소유한다.
 */
export function PhoneVerificationCard({ mode, purpose, phone, onVerified, surface = 'card' }: Props) {
  const publicIssue = useV1PhoneIssue();
  const publicVerify = useV1PhoneVerify();
  const authedRequest = useV1AuthedPhoneRequest();
  const authedConfirm = useV1AuthedPhoneConfirm();

  const requestCode = useCallback(async (): Promise<OtpIssueResult> => {
    if (mode === 'public') {
      const res = await publicIssue.mutateAsync({ phone });
      return { expiresAt: res.expiresAt, devCode: res.devCode };
    }
    const res = await authedRequest.mutateAsync({ phone });
    if (res.alreadyVerified) {
      onVerified();
      return { alreadyVerified: true };
    }
    return { expiresAt: res.expiresAt, devCode: res.devCode };
  }, [mode, phone, publicIssue, authedRequest, onVerified]);

  const submitCode = useCallback(
    async (code: string) => {
      if (mode === 'public') {
        const res = await publicVerify.mutateAsync({ phone, code, purpose });
        if (!res.verified) return false;
        onVerified(res.proofToken);
        return true;
      }
      const res = await authedConfirm.mutateAsync({ code });
      if (!res.verified) return false;
      onVerified();
      return true;
    },
    [mode, purpose, phone, publicVerify, authedConfirm, onVerified],
  );

  return (
    <OtpVerificationCard
      title="휴대폰 본인인증"
      verifiedMessage="휴대폰 본인인증이 완료됐어요."
      idPrefix="phone-verification"
      resetKey={`${mode}:${phone}`}
      requestIcon={<MessageSquare size={18} aria-hidden="true" />}
      issuing={mode === 'public' ? publicIssue.isPending : authedRequest.isPending}
      verifying={mode === 'public' ? publicVerify.isPending : authedConfirm.isPending}
      onRequestCode={requestCode}
      onSubmitCode={submitCode}
      requestFailureMessage="인증번호 발송에 실패했어요. 잠시 후 다시 시도해 주세요."
      verifyFailureMessage="인증번호가 올바르지 않아요. 다시 확인해 주세요."
      surface={surface}
    />
  );
}
