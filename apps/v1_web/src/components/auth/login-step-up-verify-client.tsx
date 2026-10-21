'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import { BrandMark } from '@/components/v1-ui/brand-logo';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { useV1LoginStepUpResend, useV1LoginStepUpVerify } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { trackEvent } from '@/lib/analytics';
import {
  clearLoginStepUp,
  getEmailLoginPath,
  readLoginStepUp,
  updateLoginStepUpTimes,
  type StoredLoginStepUp,
} from '@/lib/login-step-up';
import { AUTH_WELCOME_STAGE, AuthFrame } from './auth-page';
import { completeEmailLogin } from './email-login-completion';
import { describeResendFailure, describeVerifyFailure, type StepUpFailure } from './login-step-up-errors';
import { PasswordResetLink } from './password-reset-link';

const CODE_LENGTH = 6;
const TICK_MS = 1000;

type Notice = { message: string; tone: 'error' | 'info'; recovery?: boolean };
type DeadReason = 'missing' | 'expired';

const DEAD_COPY: Record<DeadReason, { title: string; body: string }> = {
  missing: {
    title: '본인 확인을 이어갈 수 없어요',
    body: '확인 중이던 로그인 정보를 찾지 못했어요. 이메일 로그인에서 처음부터 다시 시도해 주세요.',
  },
  expired: {
    title: '인증 시간이 지났어요',
    body: '이메일 로그인에서 다시 로그인하면 새 인증번호를 받을 수 있어요.',
  },
};

function DeadView({ reason, href }: { reason: DeadReason; href: string }) {
  const copy = DEAD_COPY[reason];
  const headingRef = useRef<HTMLHeadingElement>(null);
  // 화면이 통째로 바뀌므로 스크린리더가 새 상태를 알도록 제목으로 포커스를 옮긴다.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <AuthFrame topTitle="본인 확인" backHref={href} className="tm-auth-email-frame" stage={AUTH_WELCOME_STAGE}>
      <div className="tm-auth-body">
        <h1 className="tm-text-heading tm-auth-heading" ref={headingRef} tabIndex={-1}>{copy.title}</h1>
        <p className="tm-text-body tm-auth-sub">{copy.body}</p>
        <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href={href}>이메일 로그인으로 돌아가기</Link>
      </div>
    </AuthFrame>
  );
}

function msUntil(iso: string, now: number) {
  return Math.max(0, Date.parse(iso) - now);
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export function LoginStepUpVerifyClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const verify = useV1LoginStepUpVerify();
  const resend = useV1LoginStepUpResend();
  const ids = useId();
  const inputId = `${ids}-code`;
  const errorId = `${ids}-error`;
  const timerId = `${ids}-timer`;
  const inputRef = useRef<HTMLInputElement>(null);
  // isPending 은 다음 렌더에야 반영된다 — 같은 틱의 연타가 인증 시도를 두 번 쓰지 않게 ref 로 막는다.
  const busyRef = useRef(false);
  // undefined = 아직 스토리지를 읽기 전(서버 렌더 포함), null = 저장된 챌린지 없음.
  const [challenge, setChallenge] = useState<StoredLoginStepUp | null | undefined>(undefined);
  const [dead, setDead] = useState<DeadReason | null>(null);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [resendCount, setResendCount] = useState(0);
  // 시도 5회를 다 쓴 인증번호 — 서버는 새로 받기 전까지 이 코드를 받지 않는다.
  const [codeExhausted, setCodeExhausted] = useState(false);

  useEffect(() => {
    const stored = readLoginStepUp();
    setChallenge(stored);
    setCode(stored?.devCode ?? '');
  }, []);

  // 다시 받기를 누른 버튼은 대기 시간 동안 비활성이 되어 포커스를 잃는다 — 새 인증번호를 칠 입력칸으로 옮긴다.
  useEffect(() => {
    if (resendCount > 0) inputRef.current?.focus();
  }, [resendCount]);

  const ticking = Boolean(challenge) && dead === null;
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [ticking]);

  if (challenge === undefined) return <PageSkeleton variant="auth" />;

  const redirect = challenge?.redirect ?? null;
  const emailLoginHref = getEmailLoginPath(redirect);

  if (dead !== null || !challenge) {
    return <DeadView reason={dead ?? 'missing'} href={emailLoginHref} />;
  }

  const remainingMs = msUntil(challenge.expiresAt, now);
  const resendWaitMs = msUntil(challenge.resendAvailableAt, now);
  const codeExpired = remainingMs <= 0;
  const codeLocked = codeExpired || codeExhausted;
  const inlineError = notice?.tone === 'error' ? notice : null;

  const fail = (failure: StepUpFailure) => {
    if (failure.kind === 'dead') {
      clearLoginStepUp();
      setDead('expired');
      return;
    }
    setNotice({ message: failure.message, tone: failure.tone, recovery: failure.recovery });
    if (failure.codeExhausted) setCodeExhausted(true);
    if (failure.resendInMs !== undefined) {
      // 남은 시간은 화면의 now(1초마다 갱신)로 계산하므로 같은 시각으로 맞춰야 1초씩 어긋나지 않는다.
      const at = Date.now();
      setNow(at);
      setChallenge((current) => current && { ...current, resendAvailableAt: new Date(at + failure.resendInMs!).toISOString() });
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyRef.current || code.length !== CODE_LENGTH || codeLocked) return;
    busyRef.current = true;
    setNotice(null);
    verify.mutate(
      { challengeToken: challenge.challengeToken, code },
      {
        onSuccess: (result) => {
          completeEmailLogin({ result, queryClient, replace: (path) => router.replace(path), requestedRedirect: redirect });
        },
        onError: (error) => {
          const failure = describeVerifyFailure(error);
          trackEvent('login_step_up_failed', { reason: error instanceof V1ApiError ? error.code : 'unknown' });
          fail(failure);
          inputRef.current?.focus();
        },
        onSettled: () => {
          busyRef.current = false;
        },
      },
    );
  };

  const requestResend = () => {
    if (resend.isPending || resendWaitMs > 0) return;
    setNotice(null);
    resend.mutate(
      { challengeToken: challenge.challengeToken },
      {
        onSuccess: (result) => {
          updateLoginStepUpTimes(result);
          setChallenge((current) => current && {
            ...current,
            expiresAt: result.expiresAt,
            resendAvailableAt: result.resendAvailableAt,
            devCode: result.devCode,
          });
          setCode(result.devCode ?? '');
          setCodeExhausted(false);
          setNotice({ message: '인증번호를 다시 보냈어요. 메일함을 확인해 주세요.', tone: 'info' });
          setResendCount((count) => count + 1);
        },
        onError: (error) => fail(describeResendFailure(error)),
      },
    );
  };

  return (
    <AuthFrame topTitle="본인 확인" backHref={emailLoginHref} className="tm-auth-email-frame" stage={AUTH_WELCOME_STAGE}>
      <form className="tm-auth-body" onSubmit={submit}>
        <div className="tm-auth-logo" style={{ background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--grey200)' }}>
          <BrandMark size={42} alt="Teameet" />
        </div>
        <h1 className="tm-text-heading tm-auth-heading">본인 확인이<br />한 번 더 필요해요</h1>
        <p className="tm-text-body tm-auth-sub">
          최근 로그인 실패가 있어 입력하신 메일({challenge.maskedEmail})로 인증번호를 보냈어요.
        </p>
        <div className="tm-auth-form">
          <div className="tm-auth-field">
            <label className="tm-text-label" htmlFor={inputId}>인증번호 6자리</label>
            <input
              id={inputId}
              ref={inputRef}
              className={`tm-input tm-auth-input${inlineError ? ' tm-auth-input-error' : ''}`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              pattern="[0-9]*"
              placeholder="123456"
              value={code}
              disabled={codeLocked}
              readOnly={verify.isPending}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
              aria-invalid={inlineError ? true : undefined}
              aria-describedby={inlineError ? `${errorId} ${timerId}` : timerId}
            />
            <span
              id={timerId}
              className="tm-text-caption"
              style={{ color: codeExpired ? 'var(--red700)' : 'var(--text-muted)' }}
            >
              {codeExpired ? '인증번호 입력 시간이 지났어요. 인증번호를 다시 받아 주세요.' : `남은 시간 ${formatRemaining(remainingMs)}`}
            </span>
          </div>
          {inlineError ? (
            <div className="tm-auth-inline-error" id={errorId} role="alert">
              <AlertCircle aria-hidden="true" size={17} strokeWidth={2.2} />
              <span className="tm-text-caption">{inlineError.message}</span>
            </div>
          ) : null}
          {inlineError?.recovery ? <PasswordResetLink redirect={redirect} /> : null}
          {notice?.tone === 'info' ? (
            <p className="tm-text-caption" role="status" style={{ color: 'var(--blue700)' }}>{notice.message}</p>
          ) : null}
        </div>
        <Button
          className="tm-auth-email-submit"
          block
          disabled={code.length !== CODE_LENGTH || codeLocked}
          loading={verify.isPending}
          size="lg"
          type="submit"
          variant="primary"
        >
          확인하고 로그인
        </Button>
        <div className="tm-auth-link-row">
          <button
            className="tm-btn tm-btn-sm tm-btn-ghost"
            type="button"
            disabled={resend.isPending || resendWaitMs > 0}
            onClick={requestResend}
          >
            {resendWaitMs > 0 ? `인증번호 다시 받기 (${Math.ceil(resendWaitMs / 1000)}초)` : '인증번호 다시 받기'}
          </button>
          <Link className="tm-btn tm-btn-sm tm-btn-ghost" href={emailLoginHref} onClick={clearLoginStepUp}>
            다른 계정으로 로그인
          </Link>
        </div>
        <p className="tm-text-caption tm-auth-sub">
          메일이 오지 않으면 스팸함을 보거나 이메일·비밀번호를 다시 확인해 주세요.
        </p>
      </form>
    </AuthFrame>
  );
}
