'use client';

import { useCallback } from 'react';
import { Mail } from 'lucide-react';
import { OtpVerificationCard } from '@/components/auth/otp/otp-verification-card';
import type { OtpIssueResult } from '@/components/auth/otp/use-otp-verification';
import { useV1AuthedEmailConfirm, useV1AuthedEmailRequest } from '@/hooks/use-v1-api';

type Props = {
  /** 인증번호가 가는 주소(계정 이메일). 바뀌면 받은 코드와 입력을 버린다. */
  email: string;
  onVerified: () => void;
};

/** 로그인한 계정이 자기 이메일을 인증하는 카드. 발송 대상은 서버가 계정 이메일로 정하므로 주소를 보내지 않는다. */
export function AuthedEmailVerificationCard({ email, onVerified }: Props) {
  const request = useV1AuthedEmailRequest();
  const confirm = useV1AuthedEmailConfirm();

  const requestCode = useCallback(async (): Promise<OtpIssueResult> => {
    const res = await request.mutateAsync();
    if (res.alreadyVerified) {
      onVerified();
      return { alreadyVerified: true };
    }
    return { expiresAt: res.expiresAt, devCode: res.devCode };
  }, [request, onVerified]);

  const submitCode = useCallback(
    async (code: string) => {
      const res = await confirm.mutateAsync({ code });
      if (!res.verified) return false;
      onVerified();
      return true;
    },
    [confirm, onVerified],
  );

  return (
    <OtpVerificationCard
      title="이메일 인증"
      verifiedMessage="이메일 인증이 완료됐어요."
      idPrefix="email-verify"
      resetKey={email}
      requestIcon={<Mail size={18} aria-hidden="true" />}
      issuing={request.isPending}
      verifying={confirm.isPending}
      onRequestCode={requestCode}
      onSubmitCode={submitCode}
      requestFailureMessage="인증번호 발송에 실패했어요. 잠시 후 다시 시도해 주세요."
      verifyFailureMessage="인증번호가 올바르지 않아요. 다시 확인해 주세요."
      focusCodeOnSent
    />
  );
}
