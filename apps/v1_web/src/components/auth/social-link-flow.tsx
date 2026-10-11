'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AlertBanner } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { ConfirmModal } from '@/components/v1-ui/confirm-modal';
import { PhoneVerificationCard } from '@/components/auth/phone-verification/phone-verification-card';
import { useV1SocialLink, useV1SocialLinkPreview } from '@/hooks/use-v1-api';
import { trackEvent } from '@/lib/analytics';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import { clearV1IdentityCache } from '@/lib/query-keys';
import { saveStoredV1Session } from '@/lib/session-storage';
import type { V1SocialLinkPreview } from '@/types/api';

const PROVIDER_EXISTS = 'SOCIAL_LINK_PROVIDER_EXISTS';
const NOT_VERIFIED = 'PHONE_NOT_VERIFIED';
const HOLDER_PHONE_UNVERIFIED = 'SOCIAL_LINK_PHONE_UNVERIFIED';
/** 연결 대신 처음 가입한 방법으로 들어가야 하는 실패 — 로그인·계정 찾기 출구를 보여 준다. */
const LOGIN_EXIT_CODES = new Set([PROVIDER_EXISTS, HOLDER_PHONE_UNVERIFIED]);
/** 같은 증명으로 다시 시도해도 결과가 바뀌지 않는 실패 — 재시도 버튼을 주지 않는다. */
const TERMINAL_CODES = new Set([
  PROVIDER_EXISTS,
  HOLDER_PHONE_UNVERIFIED,
  'SOCIAL_LINK_ADMIN_FORBIDDEN',
  'ACCOUNT_WITHDRAWAL_PENDING',
  'ACCOUNT_NOT_FOUND',
  'SOCIAL_SIGNUP_EXPIRED',
]);

const SIGNUP_METHOD_LABELS: Readonly<Record<V1SocialLinkPreview['providers'][number], string>> = {
  email: '이메일로 가입',
  kakao: '카카오로 가입',
  apple: 'Apple로 가입',
  naver: '네이버로 가입',
};

function signupMethodLabel(preview: V1SocialLinkPreview): string {
  const key = preview.providers.includes('email') || preview.hasPassword ? 'email' : preview.providers[0];
  return key ? SIGNUP_METHOD_LABELS[key] : '';
}

export function linkProviderLabel(provider: 'kakao' | 'apple'): string {
  return provider === 'kakao' ? '카카오' : 'Apple';
}

type Props = {
  phone: string;
  providerLabel: string;
  /** 번호를 지우고 다시 입력하는 상태로 돌아간다. */
  onChooseOtherNumber: () => void;
  onLogin: () => void;
  onFindAccount: () => void;
  exitPending: boolean;
};

type LinkError = { code: string | null; message: string };

/** 번호 충돌 직후의 안내 — 기존 계정에 연결하거나 다른 번호로 가입하는 두 갈래. */
export function SocialLinkPrompt({
  providerLabel,
  onStart,
  onChooseOtherNumber,
}: Pick<Props, 'providerLabel' | 'onChooseOtherNumber'> & { onStart: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        role="status"
        aria-live="polite"
        className="tm-text-label tm-on-tint"
        style={{
          padding: '12px 16px',
          borderRadius: 'var(--radius-control)',
          background: 'var(--orange50)',
          color: 'var(--orange700)',
          lineHeight: 1.55,
          fontWeight: 700,
        }}
      >
        이 번호로 가입한 계정이 있어요
      </div>
      <p className="tm-text-body" style={{ margin: 0 }}>
        번호를 인증하면 지금 {providerLabel} 로그인을 그 계정에 연결해서 바로 들어갈 수 있어요.
      </p>
      <Button block onClick={onStart} size="lg" type="button" variant="primary">
        인증하고 기존 계정에 연결
      </Button>
      <Button block onClick={onChooseOtherNumber} size="md" type="button" variant="ghost">
        다른 번호로 가입할게요
      </Button>
    </div>
  );
}

/** 번호 소유 증명(OTP) → 연결 대상 확인 → 연결·로그인까지의 흐름. */
export function SocialLinkVerify({ phone, providerLabel, onChooseOtherNumber, onLogin, onFindAccount, exitPending }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const previewMutation = useV1SocialLinkPreview();
  const linkMutation = useV1SocialLink();
  const [proofToken, setProofToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<V1SocialLinkPreview | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<LinkError | null>(null);
  // 인증을 처음부터 다시 시작해야 할 때 카드를 새로 마운트하기 위한 키.
  const [attempt, setAttempt] = useState(0);

  const fail = (err: unknown) => {
    const code = extractErrorCode(err);
    setConfirmOpen(false);
    if (code === NOT_VERIFIED) {
      setProofToken(null);
      setPreview(null);
      setAttempt((current) => current + 1);
      setError({ code, message: '휴대폰 본인인증이 만료됐어요. 인증번호를 다시 받아 주세요.' });
      return;
    }
    setError({ code, message: linkErrorMessage(err, code, providerLabel) });
  };

  const requestPreview = (token: string) => {
    setError(null);
    previewMutation.mutate(
      { phone, proofToken: token },
      {
        onSuccess: (result) => {
          setPreview(result);
          setConfirmOpen(true);
        },
        onError: fail,
      },
    );
  };

  const onVerified = (token?: string) => {
    if (!token) return;
    setProofToken(token);
    requestPreview(token);
  };

  const confirmLink = () => {
    if (!proofToken || !preview || linkMutation.isPending) return;
    linkMutation.mutate(
      { phone, proofToken },
      {
        onSuccess: (result) => {
          saveStoredV1Session(result.session);
          clearV1IdentityCache(queryClient);
          trackEvent('social_account_linked', { provider: preview.linkingProvider });
          router.replace(result.next?.route ?? '/home');
        },
        onError: fail,
      },
    );
  };

  const canRetry = Boolean(proofToken) && !(error?.code && TERMINAL_CODES.has(error.code));
  const linkLabel = preview ? linkProviderLabel(preview.linkingProvider) : providerLabel;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PhoneVerificationCard
        key={attempt}
        mode="public"
        purpose="social_link"
        phone={phone}
        onVerified={onVerified}
        surface="inset"
      />
      {error ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <AlertBanner message={error.message} tone="error" />
          {error.code && LOGIN_EXIT_CODES.has(error.code) ? (
            <>
              <Button block disabled={exitPending} onClick={onLogin} size="lg" type="button" variant="primary">
                기존 계정으로 로그인
              </Button>
              <Button block disabled={exitPending} onClick={onFindAccount} size="lg" type="button" variant="neutral">
                계정 찾기
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      {canRetry && !confirmOpen && !previewMutation.isPending ? (
        <Button
          block
          onClick={() => (preview ? setConfirmOpen(true) : proofToken && requestPreview(proofToken))}
          size="lg"
          type="button"
          variant="primary"
        >
          {preview ? '기존 계정에 연결' : '계정 다시 확인'}
        </Button>
      ) : null}
      <Button block onClick={onChooseOtherNumber} size="md" type="button" variant="ghost">
        다른 번호로 가입할게요
      </Button>
      <ConfirmModal
        open={confirmOpen && preview !== null}
        title={`이 계정에 ${linkLabel} 로그인을 연결할까요?`}
        message={`연결하면 지금 만든 빈 계정은 지워지고, 다음부터 ${linkLabel}로 바로 로그인돼요.`}
        details={
          preview ? (
            <div className="tm-info-row">
              <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>찾은 계정</div>
              <div className="tm-text-body" style={{ color: 'var(--text-strong)', fontWeight: 600 }}>
                {[preview.maskedEmail ?? '이메일 없는 계정', signupMethodLabel(preview)].filter(Boolean).join(' · ')}
              </div>
            </div>
          ) : null
        }
        confirmLabel="연결하고 로그인"
        cancelLabel="취소"
        busy={linkMutation.isPending}
        onConfirm={confirmLink}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function linkErrorMessage(err: unknown, code: string | null, providerLabel: string): string {
  switch (code) {
    case PROVIDER_EXISTS:
      return '이미 같은 종류의 소셜 로그인이 연결된 계정이에요. 그 계정으로 로그인해 주세요.';
    case HOLDER_PHONE_UNVERIFIED:
      return '기존 계정에서 인증되지 않은 번호라 연결할 수 없어요. 처음 가입한 방법으로 로그인해 주세요.';
    case 'SOCIAL_LINK_ADMIN_FORBIDDEN':
      return '이 계정은 이 방법으로 연결할 수 없어요. 고객센터로 문의해 주세요.';
    case 'ACCOUNT_WITHDRAWAL_PENDING':
      return '탈퇴를 진행 중인 계정이라 연결할 수 없어요.';
    case 'ACCOUNT_NOT_FOUND':
      return '이 번호로 가입된 계정을 찾지 못했어요.';
    case 'SOCIAL_SIGNUP_EXPIRED':
      return `가입 가능 시간이 지났어요. ${providerLabel} 로그인부터 다시 시작해 주세요.`;
    case 'SOCIAL_LINK_NOT_PENDING':
    case 'SOCIAL_LINK_CONFLICT':
    case 'SOCIAL_LINK_SAME_ACCOUNT':
      return '계정을 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
    default:
      return extractErrorMessage(err, '계정을 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
}
