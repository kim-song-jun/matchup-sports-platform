'use client';

import { useCallback } from 'react';
import { Mail } from 'lucide-react';
import { OtpVerificationCard, type OtpIssueResult } from '@/components/auth/otp/otp-verification-card';
import { useV1RecoveryEmailIssue, useV1RecoveryEmailVerify } from '@/hooks/use-v1-api';

type Props = {
  email: string;
  /** 대조에 성공하면 비밀번호 재설정용 증명 토큰을 넘긴다. */
  onVerified: (proofToken?: string) => void;
  surface?: 'card' | 'inset';
};

/**
 * 이메일 본인인증 카드(비로그인 비밀번호 재설정 전용).
 *
 * 휴대폰 카드와 달리 용도를 고를 수 없다 — 서버가 이 경로의 증명을 재설정용으로 고정하고,
 * 그 증명은 휴대폰 증명과 서로 통하지 않는다.
 */
export function EmailVerificationCard({ email, onVerified, surface = 'card' }: Props) {
  const issue = useV1RecoveryEmailIssue();
  const verify = useV1RecoveryEmailVerify();

  const requestCode = useCallback(async (): Promise<OtpIssueResult> => {
    const res = await issue.mutateAsync({ email });
    return { expiresAt: res.expiresAt, devCode: res.devCode };
  }, [email, issue]);

  const submitCode = useCallback(
    async (code: string) => {
      const res = await verify.mutateAsync({ email, code });
      if (!res.verified) return false;
      onVerified(res.proofToken);
      return true;
    },
    [email, verify, onVerified],
  );

  return (
    <OtpVerificationCard
      title="이메일 본인인증"
      verifiedMessage="이메일 본인인증이 완료됐어요."
      idPrefix="email-verification"
      resetKey={email}
      requestIcon={<Mail size={18} aria-hidden="true" />}
      issuing={issue.isPending}
      verifying={verify.isPending}
      onRequestCode={requestCode}
      onSubmitCode={submitCode}
      requestFailureMessage="인증번호 발송에 실패했어요. 잠시 후 다시 시도해 주세요."
      verifyFailureMessage="인증번호가 올바르지 않아요. 다시 확인해 주세요."
      surface={surface}
    />
  );
}
