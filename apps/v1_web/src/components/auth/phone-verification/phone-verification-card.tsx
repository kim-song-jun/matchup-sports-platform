'use client';

import { useCallback, type ReactNode } from 'react';
import { MessageSquare } from 'lucide-react';
import { OtpVerificationCard } from '@/components/auth/otp/otp-verification-card';
import { usePhoneVerificationRequests } from './use-phone-verification-requests';

type Props = {
  mode: 'public' | 'authed';
  purpose?: 'signup' | 'password_reset';
  phone: string;
  onVerified: (proofToken?: string) => void;
  /**
   * card: 페이지 배경 위에 단독으로 놓일 때(예: /my/phone-verify).
   * inset: 이미 카드인 폼 안에 끼워질 때.
   */
  surface?: 'card' | 'inset';
  conflictNotice?: ReactNode;
  /** 발급·대조가 실패할 때 그 오류를 그대로 알린다. 오류는 카드가 이어서 보여 주므로 삼키지 않는다. */
  onFailure?: (error: unknown) => void;
};

/**
 * 휴대폰 본인인증 카드 — 발급/대조 API 규칙은 usePhoneVerificationRequests, 화면 상태(카운트다운·
 * 재발송·만료·에러 톤)는 OtpVerificationCard 가 이메일 카드와 함께 소유한다.
 */
export function PhoneVerificationCard({ mode, purpose, phone, onVerified, surface = 'card', conflictNotice, onFailure }: Props) {
  const requests = usePhoneVerificationRequests({ mode, purpose, phone, onVerified });
  const { onRequestCode, onSubmitCode } = requests;
  const requestCode = useCallback(async () => {
    try {
      return await onRequestCode();
    } catch (error) {
      onFailure?.(error);
      throw error;
    }
  }, [onRequestCode, onFailure]);
  const submitCode = useCallback(async (code: string) => {
    try {
      return await onSubmitCode(code);
    } catch (error) {
      onFailure?.(error);
      throw error;
    }
  }, [onSubmitCode, onFailure]);

  return (
    <OtpVerificationCard
      title="휴대폰 본인인증"
      verifiedMessage="휴대폰 본인인증이 완료됐어요."
      idPrefix="phone-verification"
      requestIcon={<MessageSquare size={18} aria-hidden="true" />}
      surface={surface}
      conflictNotice={conflictNotice}
      {...requests}
      onRequestCode={requestCode}
      onSubmitCode={submitCode}
    />
  );
}
