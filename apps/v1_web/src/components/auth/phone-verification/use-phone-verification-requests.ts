import { useCallback } from 'react';
import type { OtpIssueResult } from '@/components/auth/otp/use-otp-verification';
import {
  useV1AuthedPhoneConfirm,
  useV1AuthedPhoneRequest,
  useV1PhoneIssue,
  useV1PhoneVerify,
} from '@/hooks/use-v1-api';

type Options = {
  /** public: 비로그인 회원가입 전 pre-account 인증(proofToken 발급). authed: 로그인 후 카카오/레거시 구제. */
  mode: 'public' | 'authed';
  /** public 모드에서 발급받을 증명 토큰의 용도. 생략하면 가입용. */
  purpose?: 'signup' | 'password_reset';
  phone: string;
  /** public 모드는 proofToken을 전달하고, authed 모드는 서버가 이미 phoneVerifiedAt을 세팅하므로 인자 없이 호출된다. */
  onVerified: (proofToken?: string) => void;
};

/**
 * 휴대폰 인증의 발급/대조 API 호출과 부모 통보 규칙. 카드(PhoneVerificationCard)와 하단 버튼이
 * 발송·확인을 맡는 가입 화면이 같은 규칙을 쓰도록 화면과 분리했다.
 */
export function usePhoneVerificationRequests({ mode, purpose, phone, onVerified }: Options) {
  const publicIssue = useV1PhoneIssue();
  const publicVerify = useV1PhoneVerify();
  const authedRequest = useV1AuthedPhoneRequest();
  const authedConfirm = useV1AuthedPhoneConfirm();

  const onRequestCode = useCallback(async (): Promise<OtpIssueResult> => {
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

  const onSubmitCode = useCallback(
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

  return {
    resetKey: `${mode}:${phone}`,
    issuing: mode === 'public' ? publicIssue.isPending : authedRequest.isPending,
    verifying: mode === 'public' ? publicVerify.isPending : authedConfirm.isPending,
    onRequestCode,
    onSubmitCode,
    requestFailureMessage: '인증번호 발송에 실패했어요. 잠시 후 다시 시도해 주세요.',
    verifyFailureMessage: '인증번호가 올바르지 않아요. 다시 확인해 주세요.',
  };
}
