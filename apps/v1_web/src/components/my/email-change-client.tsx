'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AUTH_WELCOME_STAGE, AuthFrame, SignupCompletePageView } from '@/components/auth/auth-page';
import { getEmailChangeCompleteViewModel } from '@/components/auth/auth.view-model';
import { AuthStepCta } from '@/components/auth/auth-step-cta';
import type { AuthStepAction } from '@/components/auth/auth-step-cta';
import { AuthStepHeader } from '@/components/auth/auth-step-header';
import { AuthVerifiedInset } from '@/components/auth/auth-verified-inset';
import { OtpCodeInput, OtpErrorBanner, OtpRemainingRow } from '@/components/auth/otp/otp-parts';
import { OTP_CODE_LENGTH, useOtpVerification } from '@/components/auth/otp/use-otp-verification';
import { isPlausibleEmail, isValidBirthDateDigits, normalizeSeparatedDigits, normalizeSignupDisplayName } from '@/components/auth/signup-profile-validation';
import { useSignOutAndLeave } from '@/components/auth/use-sign-out-and-leave';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { AlertBanner, Card, ErrorState } from '@/components/v1-ui/primitives';
import { useV1EmailChangeRequest, useV1EmailChangeVerify, useV1Profile, useV1UpdateProfile } from '@/hooks/use-v1-api';
import {
  EMAIL_CHANGE_PROOF_REQUIRED_CODE,
  EMAIL_CONFLICT_CODE,
  EMAIL_SEND_FAILED_CODE,
  EMAIL_UNCHANGED_CODE,
} from '@/lib/auth-error-codes';
import { EMAIL_SEND_UNAVAILABLE_CODE, RECENT_LOGIN_REQUIRED_CODE } from '@/lib/auth-link-errors';
import { emailChangePath, parseEmailChangeReturnTo } from '@/lib/email-change-path';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import { formatMissingProfileFields, getMissingRequiredProfileFields } from '@/lib/profile-required-fields';
import { getLoginPathForRedirect } from '@/lib/session-storage';
import type { V1Profile } from '@/types/api';
import { EmailLinkInterruptionView } from './email-link-interruption';

type FormStep = 'email' | 'code';
type Step = FormStep | 'done';

const FORM_STEPS: readonly FormStep[] = ['email', 'code'];
const MAX_EMAIL_LENGTH = 254;
// `UpdateProfileDto` 의 길이 제한 — 저장된 값이 넘으면 서버가 저장을 거절한다.
const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 40;
const REAL_NAME_MAX_LENGTH = 40;
const BIO_MAX_LENGTH = 300;

const SEND_UNAVAILABLE_MESSAGE = '지금은 인증 메일을 보낼 수 없어요. 잠시 후 다시 시도해 주세요.';
const TOKEN_INVALID_MESSAGE = '이메일 인증이 만료돼서 처음부터 다시 해야 해요. 인증번호를 다시 받아 주세요.';
const LOGIN_ID_NOTE = '이 이메일은 로그인에도 쓰여요. 바꾸면 다음부터 새 이메일로 로그인해요.';

/**
 * 프로필 저장(`PATCH /me/profile`)은 보내지 않은 칸을 비운다(이메일·소개 제외). 이메일만 바꿔도 나머지는 서버에 저장된 값 그대로 다시 보낸다.
 * 서버가 저장을 거절할 값(이름·성별·닉네임이 없거나, 생년월일·휴대폰 번호·길이가 `UpdateProfileDto` 규칙에 어긋남)이 저장돼 있으면 `null` 을 돌려준다 —
 * 그대로 시작하면 인증번호만 쓰고 마지막 저장에서 막히고, 같은 증명으로 다시 해도 같은 이유로 실패한다.
 */
function profileSavePayload(data: V1Profile) {
  const { profile } = data;
  const nickname = (profile.nickname ?? '').trim();
  const realName = normalizeSignupDisplayName(profile.realName ?? '') || null;
  const bio = profile.bio?.trim() || null;
  const phone = data.phone || null;
  const birthDate = normalizeSeparatedDigits(profile.birthDate ?? '') || null;
  if (!realName || !profile.gender || nickname.length < NICKNAME_MIN_LENGTH || nickname.length > NICKNAME_MAX_LENGTH) return null;
  if (realName.length > REAL_NAME_MAX_LENGTH || (bio?.length ?? 0) > BIO_MAX_LENGTH) return null;
  if (phone !== null && !/^\d{11}$/.test(phone)) return null;
  if (birthDate !== null && !isValidBirthDateDigits(birthDate)) return null;
  return {
    realName,
    nickname,
    bio,
    profileImageUrl: profile.profileImageUrl || null,
    phone,
    birthDate,
    gender: profile.gender,
  };
}

/**
 * 프로필 수정에서 "변경"을 눌러 오는 이메일 변경 화면(새 이메일 → 인증번호 → 완료). 이메일 연결 화면과 같은 틀이다.
 * 인증번호를 맞추면 받은 증명(`emailChangeToken`)으로 바로 프로필을 저장해서, 10분짜리 증명이 화면 사이에 남지 않는다.
 *
 * 증명은 이 컴포넌트의 메모리에만 있다 — 주소·스토리지에 두지 않는다. `?redirect=` 는 돌아갈 프로필 수정 화면이다.
 */
export function EmailChangeClient() {
  const profile = useV1Profile();
  const returnTo = parseEmailChangeReturnTo(useSearchParams().get('redirect'));

  if (profile.isPending) return <PageSkeleton variant="form" />;
  // 이미 받은 데이터가 있으면 뒤늦은 재조회 실패로 진행 중인 단계나 완료 화면을 걷어내지 않는다.
  if (!profile.data) {
    return (
      <AuthFrame stage={AUTH_WELCOME_STAGE} topTitle="이메일 변경" backHref={returnTo} appBack>
        <div className="tm-auth-body">
          <ErrorState message="프로필 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={() => void profile.refetch()} />
        </div>
      </AuthFrame>
    );
  }
  const savePayload = profileSavePayload(profile.data);
  if (!savePayload) return <ProfileIncompleteView returnTo={returnTo} missing={getMissingRequiredProfileFields(profile.data)} />;
  return <EmailChangeFlow profile={profile.data} savePayload={savePayload} returnTo={returnTo} />;
}

function ProfileIncompleteView({ returnTo, missing }: { returnTo: string; missing: ReturnType<typeof getMissingRequiredProfileFields> }) {
  return (
    <AuthFrame
      stage={AUTH_WELCOME_STAGE}
      topTitle="이메일 변경"
      backHref={returnTo}
      appBack
      fixedAction={<Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href={returnTo}>프로필로 돌아가기</Link>}
    >
      <div className="tm-auth-body">
        <div className="tm-signup-hero">
          <h1 className="tm-text-heading tm-auth-heading">프로필을 먼저 저장해 주세요</h1>
          <p className="tm-text-body tm-auth-sub">이메일을 바꾸려면 이름·닉네임·성별이 저장돼 있고 생년월일·휴대폰 번호가 올바르게 입력돼 있어야 해요. 프로필 수정에서 확인해 저장한 뒤 다시 시도해 주세요.</p>
          {missing.length > 0 ? <p className="tm-text-body tm-auth-sub">비어 있는 정보: {formatMissingProfileFields(missing)}</p> : null}
        </div>
      </div>
    </AuthFrame>
  );
}

function EmailChangeFlow({ profile, savePayload, returnTo }: {
  profile: V1Profile;
  savePayload: NonNullable<ReturnType<typeof profileSavePayload>>;
  returnTo: string;
}) {
  const requestEmail = useV1EmailChangeRequest();
  const verifyEmail = useV1EmailChangeVerify();
  const updateProfile = useV1UpdateProfile();
  const signOut = useSignOutAndLeave();

  const hasPassword = Boolean(profile.hasPassword);
  const currentEmail = (profile.email ?? '').trim().toLowerCase();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [emailChangeToken, setEmailChangeToken] = useState<string | null>(null);
  // 서버가 이 주소를 받아 주지 않은 이유. `count` 가 바뀌면 인증번호 상태가 새로 시작한다.
  const [restart, setRestart] = useState<{ count: number; code: string | null }>({ count: 0, code: null });
  // 인증은 끝났는데 저장이 실패한 경우의 안내. 증명이 살아 있는 동안 다시 저장할 수 있다.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [changedEmail, setChangedEmail] = useState('');
  const emailId = useId();
  const emailFeedbackId = useId();
  const formId = useId();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const otpIdPrefix = useId();
  const doneHeadingRef = useRef<HTMLHeadingElement>(null);

  const normalizedEmail = email.trim().toLowerCase();

  const saveEmail = async (token: string): Promise<boolean> => {
    setSaveError(null);
    try {
      await updateProfile.mutateAsync({ ...savePayload, email: normalizedEmail, emailChangeToken: token });
    } catch (error) {
      const code = extractErrorCode(error);
      if (code === EMAIL_CONFLICT_CODE || code === EMAIL_CHANGE_PROOF_REQUIRED_CODE) {
        restartFromEmail(code);
        return false;
      }
      setSaveError(extractErrorMessage(error, '이메일을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.'));
      return false;
    }
    setEmailChangeToken(null);
    setChangedEmail(normalizedEmail);
    setStep('done');
    return true;
  };

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
        const code = extractErrorCode(error);
        if (code === EMAIL_CONFLICT_CODE || code === EMAIL_UNCHANGED_CODE) setStep('email');
        throw error;
      }
    },
    onSubmitCode: async (code) => {
      const result = await verifyEmail.mutateAsync({ code });
      setEmailChangeToken(result.emailChangeToken);
      return saveEmail(result.emailChangeToken);
    },
    requestFailureMessage: '인증번호를 보내지 못했어요. 잠시 후 다시 시도해 주세요.',
    verifyFailureMessage: '인증번호를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
  });

  useEffect(() => {
    if (step === 'done') doneHeadingRef.current?.focus();
  }, [step]);

  // 저장이 낸 이유가 있으면 그것이, 없으면 인증번호 요청·확인이 낸 오류가 지금 상황이다.
  const issueCode = restart.code ?? otp.errorCode;
  const needsRecentLogin = issueCode === RECENT_LOGIN_REQUIRED_CODE;
  const emailConflict = issueCode === EMAIL_CONFLICT_CODE;
  const emailUnchanged = issueCode === EMAIL_UNCHANGED_CODE || (normalizedEmail !== '' && normalizedEmail === currentEmail);
  const sendUnavailable = issueCode === EMAIL_SEND_UNAVAILABLE_CODE || issueCode === EMAIL_SEND_FAILED_CODE;
  const tokenInvalid = issueCode === EMAIL_CHANGE_PROOF_REQUIRED_CODE;

  // 고칠 곳이 이 입력칸이라 막힌 주소를 알린 뒤에는 포커스를 입력칸에 둔다(되돌아온 단계의 제목 포커스보다 뒤에 온다).
  useEffect(() => {
    if (step === 'email' && emailConflict) emailInputRef.current?.focus();
  }, [step, emailConflict]);

  function restartFromEmail(code: string) {
    setEmailChangeToken(null);
    setSaveError(null);
    setRestart((current) => ({ count: current.count + 1, code }));
    setStep('email');
  }

  const goBack = () => {
    setSaveError(null);
    // 떠나는 단계의 오류(틀린 인증번호 등)가 앞 단계에 남아 보이지 않게 한다.
    otp.clearError();
    setStep('email');
  };

  const changeEmail = (value: string) => {
    setEmail(value);
    // 대소문자·앞뒤 공백만 다른 입력은 같은 주소다 — 인증번호 상태(주소가 바뀌어야 새로 시작한다)와 같은 기준으로 가른다.
    if (value.trim().toLowerCase() === normalizedEmail) return;
    // 지난 시도의 결과(막힌 주소 등)는 이 주소에 대한 것이 아니고, 증명은 인증한 그 주소에만 쓸 수 있다.
    setRestart((current) => ({ ...current, code: null }));
    setEmailChangeToken(null);
    setSaveError(null);
  };

  if (step === 'done') {
    return (
      <SignupCompletePageView
        topTitle="이메일 변경"
        model={getEmailChangeCompleteViewModel(changedEmail, hasPassword, returnTo)}
        headingRef={doneHeadingRef}
      />
    );
  }

  if (needsRecentLogin) {
    return (
      <EmailLinkInterruptionView
        kind="recent-login-email-change"
        backHref={returnTo}
        onRelogin={() => {
          void signOut.signOutAndLeave(getLoginPathForRedirect(emailChangePath(returnTo)), {
            failureMessage: '로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.',
          });
        }}
        relogin={{ pending: signOut.pending, error: signOut.error }}
      />
    );
  }

  const sendReady = normalizedEmail.length <= MAX_EMAIL_LENGTH && isPlausibleEmail(normalizedEmail);
  const codeStillValid = otp.phase === 'sent' && !otp.expired;
  const emailBlocked = emailConflict || emailUnchanged;
  const emailStepBusy = requestEmail.isPending;
  const saving = verifyEmail.isPending || updateProfile.isPending;

  const primary: AuthStepAction = step === 'email'
    ? {
        label: '인증번호 받기',
        // 막힌 주소는 같은 요청을 되풀이해도 같은 답이라 다른 주소를 넣을 때까지 잠근다.
        disabled: !sendReady || emailStepBusy || emailBlocked,
        loading: emailStepBusy,
        // 이미 받은 인증번호가 살아 있으면 다시 보내지 않고(재발송 대기에 걸린다) 그 단계로 간다.
        onClick: () => {
          if (!codeStillValid && !emailChangeToken) {
            void otp.requestCode();
            return;
          }
          otp.clearError();
          setStep('code');
        },
      }
    : emailChangeToken
      ? { label: saving ? '바꾸는 중...' : '이메일 바꾸기', disabled: saving, loading: saving, onClick: () => { void saveEmail(emailChangeToken); } }
      : otp.expired
        ? { label: '인증번호 다시 받기', disabled: emailStepBusy, loading: emailStepBusy, onClick: () => { void otp.requestCode(); } }
        : {
            label: saving ? '바꾸는 중...' : '인증하고 바꾸기',
            disabled: otp.code.length !== OTP_CODE_LENGTH || saving,
            loading: saving,
            onClick: () => { void otp.submitCode(); },
          };

  const disabledHint = !primary.disabled || primary.loading
    ? null
    : step === 'email'
      ? emailBlocked
        ? '사용할 수 있는 이메일을 입력해 주세요.'
        : normalizedEmail === '' ? '이메일을 입력해 주세요.' : '이메일 형식을 확인해 주세요.'
      : '인증번호 6자리를 입력해 주세요.';

  const copy = step === 'email'
    ? { title: '새 이메일을 입력해 주세요', sub: '인증번호를 보내 드려요. 인증하면 바로 바뀌어요.' }
    : { title: '인증번호를 입력해 주세요', sub: `${normalizedEmail} 으로 6자리 숫자를 보냈어요.` };

  const emailFeedbackShown = emailBlocked || sendUnavailable;

  return (
    <AuthFrame
      stage={AUTH_WELCOME_STAGE}
      topTitle="이메일 변경"
      backHref={step === 'email' ? returnTo : undefined}
      appBack={step === 'email'}
      onBack={step === 'email' ? undefined : goBack}
      fixedAction={<AuthStepCta formId={formId} action={primary} hint={disabledHint} />}
    >
      <div className="tm-auth-body">
        <AuthStepHeader
          name="이메일 변경"
          steps={FORM_STEPS}
          index={FORM_STEPS.indexOf(step)}
          title={copy.title}
          sub={copy.sub}
          focusOnChange
        />

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
              {hasPassword ? <AlertBanner tone="info" message={LOGIN_ID_NOTE} /> : null}
              <div className="tm-auth-field">
                <label className="tm-text-label" htmlFor={emailId}>이메일</label>
                <input
                  id={emailId}
                  ref={emailInputRef}
                  className={`tm-input tm-auth-input ${emailFeedbackShown ? 'tm-auth-input-error' : ''}`}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={MAX_EMAIL_LENGTH}
                  autoFocus
                  placeholder="예: name@email.com"
                  value={email}
                  // disabled 로 잠그면 Enter 로 보낸 사람의 포커스가 사라진다 — 읽기 전용으로 둔다.
                  readOnly={emailStepBusy}
                  onChange={(event) => changeEmail(event.target.value)}
                  aria-invalid={emailFeedbackShown ? true : undefined}
                  aria-describedby={emailFeedbackShown ? emailFeedbackId : undefined}
                />
                {emailUnchanged ? (
                  <span id={emailFeedbackId} role="alert" className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-error">
                    지금 쓰는 이메일과 같아요. 바꿀 새 이메일을 입력해 주세요.
                  </span>
                ) : null}
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
            emailChangeToken ? (
              <AuthVerifiedInset message="이메일 인증이 완료됐어요" />
            ) : (
              <>
                <OtpCodeInput idPrefix={otpIdPrefix} otp={otp} verifying={saving} />
                <OtpErrorBanner idPrefix={otpIdPrefix} otp={otp} />
                <div style={{ marginTop: -4 }}>
                  <OtpRemainingRow idPrefix={otpIdPrefix} otp={otp} issuing={emailStepBusy} />
                </div>
              </>
            )
          ) : null}
        </form>

        {saveError ? (
          <Card pad={16} className="tm-auth-soft-card tm-auth-soft-card-error">
            <div className="tm-text-body-lg">다시 시도해 주세요</div>
            <div className="tm-text-caption" role="alert">{saveError}</div>
          </Card>
        ) : null}
      </div>
    </AuthFrame>
  );
}
