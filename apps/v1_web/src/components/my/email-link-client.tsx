'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AUTH_WELCOME_STAGE, AuthFrame, SignupCompletePageView } from '@/components/auth/auth-page';
import { getEmailLinkCompleteViewModel } from '@/components/auth/auth.view-model';
import { AuthPasswordField } from '@/components/auth/auth-password-field';
import { AuthStepCta } from '@/components/auth/auth-step-cta';
import type { AuthStepAction } from '@/components/auth/auth-step-cta';
import { AuthStepHeader } from '@/components/auth/auth-step-header';
import { AuthVerifiedInset } from '@/components/auth/auth-verified-inset';
import { OtpCodeInput, OtpErrorBanner, OtpRemainingRow } from '@/components/auth/otp/otp-parts';
import { OTP_CODE_LENGTH, useOtpVerification } from '@/components/auth/otp/use-otp-verification';
import { isPlausibleEmail } from '@/components/auth/signup-profile-validation';
import { useSignOutAndLeave } from '@/components/auth/use-sign-out-and-leave';
import { AlertBanner, Card } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { useV1AuthMe, useV1LinkEmailComplete, useV1LinkEmailRequest, useV1LinkEmailVerify } from '@/hooks/use-v1-api';
import {
  EMAIL_CONFLICT_CODE,
  EMAIL_LINK_TOKEN_INVALID_CODE,
  EMAIL_SEND_FAILED_CODE,
  SOCIAL_LINK_ADMIN_FORBIDDEN_CODE,
  SOCIAL_LINK_PROVIDER_EXISTS_CODE,
} from '@/lib/auth-error-codes';
import { EMAIL_SEND_UNAVAILABLE_CODE, RECENT_LOGIN_REQUIRED_CODE } from '@/lib/auth-link-errors';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import { emailLinkPath, LOGIN_METHODS_PATH, parseEmailLinkReturnTo } from '@/lib/link-result';
import { clearPendingEmailLink, readPendingEmailLink } from '@/lib/pending-email-link';
import { getLoginPathForRedirect } from '@/lib/session-storage';
import { EmailLinkInterruptionView } from './email-link-interruption';
import type { EmailLinkInterruption } from './email-link-interruption';

type FormStep = 'email' | 'code' | 'password';
type Step = FormStep | 'done';

const FORM_STEPS: readonly FormStep[] = ['email', 'code', 'password'];
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 8;

const SEND_UNAVAILABLE_MESSAGE = '지금은 인증 메일을 보낼 수 없어요. 잠시 후 다시 시도해 주세요.';
const OFFER_NOTE = '방금 가입하려던 이메일이에요. 비밀번호는 저장하지 않아서 새로 정해 주세요.';
const TOKEN_INVALID_MESSAGE = '이메일 인증이 만료돼서 처음부터 다시 해야 해요. 인증번호를 다시 받아 주세요.';

/** 입력을 바꿔도 풀리지 않아 단계 화면 대신 안내를 보여 주는 오류 코드. */
const INTERRUPTION_BY_CODE = new Map<string, EmailLinkInterruption>([
  [RECENT_LOGIN_REQUIRED_CODE, 'recent-login'],
  [SOCIAL_LINK_PROVIDER_EXISTS_CODE, 'exists'],
  [SOCIAL_LINK_ADMIN_FORBIDDEN_CODE, 'admin'],
]);

/**
 * 카카오·Apple 로 가입한 계정이 이메일·비밀번호 로그인을 더하는 단계 화면(이메일 → 인증번호 → 비밀번호 → 완료).
 * 가입 화면과 같은 틀(진행 바 · 한 화면 한 질문 · 하단 고정 버튼)이고, 상단 뒤로 가기는 바로 앞 단계로 간다.
 *
 * 인증 증명(`emailLinkToken`)과 비밀번호는 이 컴포넌트의 메모리에만 있다 — 주소·스토리지에 두지 않는다.
 * 가입 화면에서 이어 온 이메일(`readPendingEmailLink`)은 처음 그릴 때 한 번 읽어 1단계에 채우고 칸은 비운다.
 * `?redirect=` 는 연결 뒤 돌아갈 곳이다(같은 origin 경로만). 일반 설정에서는 미루기도 가능하지만
 * 새 소셜 가입에서 필수 설정 중이면 이메일을 건너뛰지 않고 로그아웃 또는 고객센터를 이용할 수 있다.
 */
export function EmailLinkClient() {
  const requestEmail = useV1LinkEmailRequest();
  const verifyEmail = useV1LinkEmailVerify();
  const completeLink = useV1LinkEmailComplete();
  const signOut = useSignOutAndLeave();
  const authMe = useV1AuthMe();
  const mandatory = authMe.data?.user.signupEmailLoginRequired === true;
  const returnTo = parseEmailLinkReturnTo(useSearchParams().get('redirect'));

  // 렌더 중에는 읽기만 한다(개발 모드의 이중 렌더에서도 같은 값). 칸은 마운트 뒤에 비운다.
  const [offeredEmail] = useState(() => readPendingEmailLink()?.email ?? null);
  useEffect(() => {
    clearPendingEmailLink();
  }, []);

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(offeredEmail ?? '');
  const [emailEdited, setEmailEdited] = useState(false);
  useEffect(() => {
    if (mandatory && !emailEdited && !offeredEmail && authMe.data?.user.email) setEmail(authMe.data.user.email);
  }, [mandatory, emailEdited, offeredEmail, authMe.data?.user.email]);
  // 보관해 둔 이메일을 제안하는 중인지. 사용자가 입력을 고치면 일반 1단계로 돌아간다.
  const [offerActive, setOfferActive] = useState(offeredEmail !== null);
  const [emailLinkToken, setEmailLinkToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  // 마지막 단계에서 되돌아온 이유. `count` 가 바뀌면 인증번호 상태가 새로 시작한다.
  const [restart, setRestart] = useState<{ count: number; code: string | null }>({ count: 0, code: null });
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [linkedEmail, setLinkedEmail] = useState('');
  const emailId = useId();
  const emailFeedbackId = useId();
  const formId = useId();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const otpIdPrefix = useId();
  const doneHeadingRef = useRef<HTMLHeadingElement>(null);

  const normalizedEmail = email.trim().toLowerCase();

  const otp = useOtpVerification({
    resetKey: `${normalizedEmail}|${restart.count}`,
    onRequestCode: async () => {
      setRestart((current) => ({ ...current, code: null }));
      try {
        const result = await requestEmail.mutateAsync({ email: normalizedEmail });
        setStep('code');
        return { expiresAt: new Date(Date.now() + result.expiresInSeconds * 1000).toISOString(), devCode: result.devCode };
      } catch (error) {
        // 다시 받기는 2단계에서도 부른다 — 주소가 막혔다면 고칠 수 있는 1단계로 돌려보낸다.
        if (extractErrorCode(error) === EMAIL_CONFLICT_CODE) setStep('email');
        throw error;
      }
    },
    onSubmitCode: async (code) => {
      const result = await verifyEmail.mutateAsync({ code });
      setEmailLinkToken(result.emailLinkToken);
      setStep('password');
      return true;
    },
    requestFailureMessage: '인증번호를 보내지 못했어요. 잠시 후 다시 시도해 주세요.',
    verifyFailureMessage: '인증번호를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
  });

  useEffect(() => {
    if (step === 'done') doneHeadingRef.current?.focus();
  }, [step]);

  // 마지막 단계에서 돌아온 이유가 있으면 그것이, 없으면 인증번호 요청·확인이 낸 오류가 지금 상황이다.
  const issueCode = restart.code ?? otp.errorCode;
  const interruption = issueCode ? INTERRUPTION_BY_CODE.get(issueCode) ?? null : null;
  const emailConflict = issueCode === EMAIL_CONFLICT_CODE;
  const sendUnavailable = issueCode === EMAIL_SEND_UNAVAILABLE_CODE || issueCode === EMAIL_SEND_FAILED_CODE;
  const tokenInvalid = issueCode === EMAIL_LINK_TOKEN_INVALID_CODE;

  // 고칠 곳이 이 입력칸이라 막힌 주소를 알린 뒤에는 포커스를 입력칸에 둔다(되돌아온 단계의 제목 포커스보다 뒤에 온다).
  useEffect(() => {
    if (step === 'email' && emailConflict) emailInputRef.current?.focus();
  }, [step, emailConflict]);

  const restartFromEmail = (code: string) => {
    setEmailLinkToken(null);
    setPassword('');
    setPasswordConfirm('');
    setCompleteError(null);
    setRestart((current) => ({ count: current.count + 1, code }));
    setStep('email');
  };

  const submitPassword = async () => {
    if (!emailLinkToken || completeLink.isPending) return;
    setCompleteError(null);
    try {
      const result = await completeLink.mutateAsync({ emailLinkToken, password, passwordConfirm });
      setPassword('');
      setPasswordConfirm('');
      setEmailLinkToken(null);
      setLinkedEmail(result.email);
      setStep('done');
    } catch (error) {
      const code = extractErrorCode(error);
      if (code === EMAIL_CONFLICT_CODE || code === EMAIL_LINK_TOKEN_INVALID_CODE) {
        restartFromEmail(code);
        return;
      }
      if (code && INTERRUPTION_BY_CODE.has(code)) {
        setRestart((current) => ({ ...current, code }));
        return;
      }
      setCompleteError(extractErrorMessage(error, '이메일 로그인을 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'));
    }
  };

  const goBack = () => {
    setCompleteError(null);
    // 떠나는 단계의 오류(틀린 인증번호 등)가 앞 단계에 남아 보이지 않게 한다.
    otp.clearError();
    setStep(step === 'password' ? 'code' : 'email');
  };

  const changeEmail = (value: string) => {
    setEmailEdited(true);
    setEmail(value);
    // 대소문자·앞뒤 공백만 다른 입력은 같은 주소다 — 인증번호 상태(주소가 바뀌어야 새로 시작한다)와 같은 기준으로 가른다.
    if (value.trim().toLowerCase() === normalizedEmail) return;
    setOfferActive(false);
    // 지난 시도의 결과(막힌 주소 등)는 이 주소에 대한 것이 아니고, 증명은 인증한 그 주소에만 쓸 수 있다.
    setRestart((current) => ({ ...current, code: null }));
    setEmailLinkToken(null);
  };

  if (step === 'done') {
    return <SignupCompletePageView model={getEmailLinkCompleteViewModel(linkedEmail, LOGIN_METHODS_PATH, returnTo)} headingRef={doneHeadingRef} />;
  }

  if (interruption) {
    return (
      <EmailLinkInterruptionView
        kind={interruption}
        mandatory={mandatory}
        backHref={returnTo ?? LOGIN_METHODS_PATH}
        onRelogin={() => {
          void signOut.signOutAndLeave(getLoginPathForRedirect(emailLinkPath(returnTo)), {
            failureMessage: '로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.',
          });
        }}
        relogin={{ pending: signOut.pending, error: signOut.error }}
      />
    );
  }

  const sendReady = normalizedEmail.length <= MAX_EMAIL_LENGTH && isPlausibleEmail(normalizedEmail);
  const codeStillValid = otp.phase === 'sent' && !otp.expired;
  const passwordLongEnough = password.length >= MIN_PASSWORD_LENGTH;
  const passwordMatch = passwordConfirm.length > 0 && password === passwordConfirm;

  const emailStepBusy = requestEmail.isPending;
  const primary: AuthStepAction = step === 'email'
    ? {
        label: '인증번호 받기',
        // 막힌 주소는 같은 요청을 되풀이해도 같은 답이라 다른 주소를 넣을 때까지 잠근다.
        disabled: !sendReady || emailStepBusy || emailConflict,
        loading: emailStepBusy,
        // 이미 받은 인증번호가 살아 있으면 다시 보내지 않고(재발송 대기에 걸린다) 그 단계로 간다.
        onClick: () => {
          if (!codeStillValid) {
            void otp.requestCode();
            return;
          }
          otp.clearError();
          setStep('code');
        },
      }
    : step === 'code'
      ? emailLinkToken
        ? { label: '다음', disabled: false, loading: false, onClick: () => setStep('password') }
        : otp.expired
          ? { label: '인증번호 다시 받기', disabled: emailStepBusy, loading: emailStepBusy, onClick: () => { void otp.requestCode(); } }
          : {
              label: '인증번호 확인',
              disabled: otp.code.length !== OTP_CODE_LENGTH || verifyEmail.isPending,
              loading: verifyEmail.isPending,
              onClick: () => { void otp.submitCode(); },
            }
      : {
          label: completeLink.isPending ? '연결하는 중...' : '연결하기',
          disabled: !passwordLongEnough || !passwordMatch || completeLink.isPending,
          loading: completeLink.isPending,
          onClick: () => { void submitPassword(); },
        };

  const disabledHint = !primary.disabled || primary.loading
    ? null
    : step === 'email'
      ? emailConflict
        ? '사용할 수 있는 이메일을 입력해 주세요.'
        : normalizedEmail === '' ? '이메일을 입력해 주세요.' : '이메일 형식을 확인해 주세요.'
      : step === 'code'
        ? '인증번호 6자리를 입력해 주세요.'
        : !passwordLongEnough ? '비밀번호는 8자 이상이어야 해요.' : '비밀번호 확인이 일치해야 해요.';

  const copy = step === 'email'
    ? {
        title: offerActive ? '이메일을 연결할까요?' : '이메일을 입력해 주세요',
        sub: '인증번호를 보내 드려요. 이 이메일이 계정 이메일이 돼요.',
      }
    : step === 'code'
      ? { title: '인증번호를 입력해 주세요', sub: `${normalizedEmail} 으로 6자리 숫자를 보냈어요.` }
      : { title: '비밀번호를 정해 주세요', sub: '다음부터 이 이메일과 비밀번호로 로그인해요. 8자 이상으로 정해 주세요.' };

  const emailFeedbackShown = emailConflict || sendUnavailable;

  return (
    <AuthFrame
      stage={AUTH_WELCOME_STAGE}
      topTitle="이메일 로그인 연결"
      backHref={step === 'email' && !mandatory ? returnTo ?? LOGIN_METHODS_PATH : undefined}
      appBack={step === 'email' && !mandatory}
      onBack={step === 'email' ? undefined : goBack}
      fixedAction={
        <AuthStepCta
          formId={formId}
          action={primary}
          hint={disabledHint}
          footnote={step === 'email' && offerActive ? '나중에 하려면 뒤로 가기를 눌러 주세요.' : null}
        />
      }
    >
      <div className="tm-auth-body">
        <AuthStepHeader
          name="이메일 연결"
          steps={FORM_STEPS}
          index={FORM_STEPS.indexOf(step)}
          title={copy.title}
          sub={copy.sub}
          focusOnChange
        />

        {mandatory && step === 'email' ? <div className="tm-text-caption" style={{ marginTop: 16 }}>가입을 마치려면 이메일 인증과 비밀번호 설정이 필요해요.</div> : null}

        {step === 'email' && tokenInvalid ? <AlertBanner tone="warning" assertive message={TOKEN_INVALID_MESSAGE} /> : null}
        <form
          id={formId}
          className="tm-auth-form tm-auth-signup-form"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (!primary.disabled) primary.onClick?.();
          }}
        >
          {step === 'email' ? (
            <>
              {offerActive ? <AlertBanner tone="info" message={OFFER_NOTE} /> : null}
              <div className="tm-auth-field">
                <label className="tm-text-label" htmlFor={emailId}>이메일</label>
                <input
                  id={emailId}
                  ref={emailInputRef}
                  className={`tm-input tm-auth-input ${emailConflict || sendUnavailable ? 'tm-auth-input-error' : ''}`}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={MAX_EMAIL_LENGTH}
                  autoFocus={offeredEmail === null}
                  placeholder="예: name@email.com"
                  value={email}
                  // disabled 로 잠그면 Enter 로 보낸 사람의 포커스가 사라진다 — 읽기 전용으로 둔다.
                  readOnly={emailStepBusy}
                  onChange={(event) => changeEmail(event.target.value)}
                  aria-invalid={emailFeedbackShown ? true : undefined}
                  aria-describedby={emailFeedbackShown ? emailFeedbackId : undefined}
                />
                {emailConflict ? (
                  <>
                    <span id={emailFeedbackId} role="alert" className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-error">
                      이미 다른 계정에서 쓰는 이메일이에요.
                    </span>
                    <p className="tm-text-caption" style={{ margin: 0, lineHeight: 1.5, wordBreak: 'keep-all' }}>
                      다른 이메일을 입력해 주세요. 본인 계정이 아니라면{' '}
                      <Link className="tm-auth-inline-link" href="/my/inquiries/new">고객센터에 알려 주세요</Link>.
                    </p>
                  </>
                ) : null}
                {sendUnavailable ? (
                  <span id={emailFeedbackId} role="alert" className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-error">
                    {SEND_UNAVAILABLE_MESSAGE}
                  </span>
                ) : null}
              </div>
              {emailFeedbackShown ? null : <OtpErrorBanner idPrefix={otpIdPrefix} otp={otp} />}
            </>
          ) : null}

          {step === 'code' ? (
            emailLinkToken ? (
              <AuthVerifiedInset message="이메일 인증이 완료됐어요" />
            ) : (
              <>
                <OtpCodeInput idPrefix={otpIdPrefix} otp={otp} verifying={verifyEmail.isPending} />
                <OtpErrorBanner idPrefix={otpIdPrefix} otp={otp} />
                <div style={{ marginTop: -4 }}>
                  <OtpRemainingRow idPrefix={otpIdPrefix} otp={otp} issuing={emailStepBusy} />
                </div>
              </>
            )
          ) : null}

          {step === 'password' ? (
            <>
              <AuthPasswordField
                label="비밀번호"
                value={password}
                onChange={setPassword}
                placeholder="8자 이상"
                feedback={password.length > 0
                  ? passwordLongEnough
                    ? { kind: 'success', message: '사용할 수 있는 비밀번호예요.' }
                    : { kind: 'error', message: '8자 이상 입력해 주세요.' }
                  : null}
              />
              <AuthPasswordField
                label="비밀번호 확인"
                value={passwordConfirm}
                onChange={setPasswordConfirm}
                placeholder="비밀번호 다시 입력"
                feedback={passwordConfirm.length > 0
                  ? passwordMatch
                    ? { kind: 'success', message: '비밀번호가 일치해요.' }
                    : { kind: 'error', message: '비밀번호가 일치하지 않아요.' }
                  : null}
              />
            </>
          ) : null}
        </form>

        {mandatory && step === 'email' ? <>
          <Button type="button" variant="ghost" size="sm" disabled={signOut.pending} onClick={() => void signOut.signOutAndLeave('/login', { failureMessage: '로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.' })}>로그아웃</Button>
          {signOut.error ? <p className="tm-text-caption" role="alert">{signOut.error}</p> : null}
        </> : null}

        {completeError ? (
          <Card pad={16} className="tm-auth-soft-card tm-auth-soft-card-error">
            <div className="tm-text-body-lg">다시 시도해 주세요</div>
            <div className="tm-text-caption" role="alert">{completeError}</div>
          </Card>
        ) : null}
      </div>
    </AuthFrame>
  );
}
