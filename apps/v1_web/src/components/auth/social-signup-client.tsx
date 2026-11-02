'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Card, DatePickerTextInput } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { PhoneConflictNotice } from '@/components/auth/otp/phone-conflict-notice';
import { PhoneVerificationCard } from '@/components/auth/phone-verification/phone-verification-card';
import { useV1AuthMe, useV1CheckNickname, useV1CompleteSocialProfile, useV1DeferSocialProfile } from '@/hooks/use-v1-api';
import { getSignInThenLinkHint } from '@/lib/auth-link-errors';
import { clearPendingEmailLink } from '@/lib/pending-email-link';
import { clearPendingSocialLink } from '@/lib/pending-social-link';
import { useSocialSignupExit } from './use-social-signup-exit';
import { V1ApiError } from '@/lib/api-client';
import { trackEvent } from '@/lib/analytics';
import { clearV1IdentityCache } from '@/lib/query-keys';
import { getSavedRedirectPath, resolveAuthContinuationPath, sanitizeRedirectPath, saveStoredV1Session } from '@/lib/session-storage';
import { AUTH_WELCOME_STAGE, AuthFrame } from './auth-page';
import { AuthStepHeader } from './auth-step-header';
import { emailLinkPath, EMAIL_LINK_PATH } from '@/lib/link-result';
import { buildAccountConflictPath } from './login-recovery-route';
import {
  formatBirthDate,
  formatPhone,
  getSignupProfileIssue,
  isCompleteSignupProfile,
  isSignupAgeEligible,
  normalizeSeparatedDigits,
  normalizeSignupDisplayName,
  SIGNUP_PROFILE_ERROR_MESSAGES,
} from './signup-profile-validation';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1SignInThenLinkDetails } from '@/types/api';
import styles from './social-signup-review.module.css';

type SocialStep = 'nickname' | 'gender' | 'name' | 'phone' | 'birthDate' | 'review';

type FieldErrors = Partial<Record<'nickname' | 'gender', string>>;
type DuplicateCheckState = {
  status: 'idle' | 'available' | 'taken' | 'error';
  value: string;
};

/** 가입 진행 중인 소셜 계정의 이름. 모르면 null — 문구가 특정 서비스를 단정하지 않게 한다. */
function socialProviderLabel(provider: string | null | undefined): string | null {
  if (provider === 'kakao') return '카카오';
  if (provider === 'apple') return 'Apple';
  if (provider === 'naver') return '네이버';
  return null;
}

export function SocialSignupClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const completeProfile = useV1CompleteSocialProfile();
  const deferProfile = useV1DeferSocialProfile();
  const checkNickname = useV1CheckNickname();
  const [nickname, setNickname] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [birthDateDigits, setBirthDateDigits] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [nicknameCheck, setNicknameCheck] = useState<DuplicateCheckState>({ status: 'idle', value: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [termsRecoveryPending, setTermsRecoveryPending] = useState(false);
  const [step, setStep] = useState<SocialStep>('nickname');
  const [editPhone, setEditPhone] = useState(false);
  const [editBirthDate, setEditBirthDate] = useState(false);
  const [postSignupDestination, setPostSignupDestination] = useState<{ path: string; denied: boolean; termsFirst: boolean } | null>(null);
  const [phoneConflict, setPhoneConflict] = useState(false);
  // 번호 중복 409 가 준 기존 계정 로그인·연결 시도 안내. 토큰이 있어야 연결을 시도할 수 있다.
  const [conflictHint, setConflictHint] = useState<V1SignInThenLinkDetails | null>(null);
  const recordConflictHint = useCallback((failure: unknown) => setConflictHint(getSignInThenLinkHint(failure)), []);
  // 카카오가 동의항목 승인 하에 내려준 값(이름·번호·성별)을 자동으로 채운다.
  // 동의항목이 없으면 socialSignupPrefill 이 null 이라 아무것도 하지 않고 직접 입력 흐름 그대로다.
  const authMe = useV1AuthMe();
  const exitFlow = useSocialSignupExit({ onboardingStatus: authMe.data?.user?.onboardingStatus });
  const prefill = authMe.data?.socialSignupPrefill ?? null;
  const providerLabel = socialProviderLabel(authMe.data?.user?.authProvider);
  const authProvider = authMe.data?.user?.authProvider;
  const conflictRedirect = () => sanitizeRedirectPath(new URLSearchParams(window.location.search).get('redirect')) ?? getSavedRedirectPath();
  const conflictExitPath = (path: string) => {
    const redirect = conflictRedirect();
    return redirect ? `${path}?redirect=${encodeURIComponent(redirect)}` : path;
  };
  const linkHint = conflictHint?.linkToken ? conflictHint : null;
  // 번호를 쥔 계정이 탈퇴 유예 중이면 로그인 첫 화면 대신 두 가지 방법을 보여 주는 안내로 나간다 — 로그인 버튼은 거기에 있다.
  const withdrawalPending = linkHint !== null && linkHint.withdrawalPendingUntil !== undefined;
  const loginExitPath = () => (
    linkHint && withdrawalPending ? buildAccountConflictPath(linkHint.provider, conflictRedirect()) : conflictExitPath('/login')
  );
  const leaveFromConflict = (target: string, confirmFirst: boolean) => (
    linkHint ? exitFlow.leaveWithPendingLink(target, linkHint, { confirmFirst }) : exitFlow.leaveTo(target)
  );
  const phoneConflictNotice = (
    <PhoneConflictNotice
      pending={exitFlow.pending}
      linkProvider={linkHint?.provider}
      withdrawalPending={withdrawalPending}
      recycledNumberHelp
      onLogin={() => void leaveFromConflict(loginExitPath(), true)}
      onFindAccount={() => void leaveFromConflict(conflictExitPath('/auth/find-account'), false)}
    />
  );
  // 카카오가 제공한 번호는 추가 인증 없이 사용한다. 다른 번호로 바꾼 경우에만 직접 인증한다.
  const lockedName = Boolean(prefill?.name);
  const lockedGender = Boolean(prefill?.gender);
  const kakaoPhoneAccepted = authProvider === 'kakao' && Boolean(prefill?.phone) && prefill?.phone === phoneDigits;
  const contactReady = phoneVerified || kakaoPhoneAccepted;

  // 정보 입력을 미룬 계정이 활동 시도 중 돌아온 화면 — 가입 모드와 달리 건너뛰기가 없고 입력 뒤 원래 화면으로 간다.
  const activityMode = authMe.data?.user?.onboardingStatus === 'social_profile_deferred';
  const statusPending = authMe.isPending === true;
  // 건너뛰기는 가입 직후 상태가 확인된 때만 — 조회 실패나 이미 미룬 계정에는 보이지 않는다.
  const signupMode = authMe.data?.user?.onboardingStatus === 'social_profile_required';
  const [activitySeeded, setActivitySeeded] = useState(false);
  useEffect(() => {
    if (!activityMode || activitySeeded || !authMe.data) return;
    // 자동 생성된 닉네임은 이미 서버에서 중복 검사를 통과했다. 바꾸면 기존처럼 다시 확인한다.
    const currentNickname = authMe.data.profile.nickname ?? '';
    if (currentNickname) {
      setNickname(currentNickname);
      setNicknameCheck({ status: 'available', value: currentNickname });
    }
    if (authMe.data.user.phone) setPhoneDigits(normalizeSeparatedDigits(authMe.data.user.phone));
    if (authMe.data.verification?.phoneVerified) setPhoneVerified(true);
    setActivitySeeded(true);
  }, [activityMode, activitySeeded, authMe.data]);

  const [prefillApplied, setPrefillApplied] = useState(false);
  useEffect(() => {
    if (!prefill || prefillApplied) return;
    // 보통은 게이트가 이미 /auth/me 를 받아 둔 뒤라 첫 렌더에 값이 있지만, 캐시가 비어
    // 늦게 도착할 수 있다. 그때 이미 입력 중이던 값을 덮어쓰면 입력이 유실된다.
    // 잠기는 필드(이름·성별)는 카카오 값이 권위이므로 그대로 반영하고,
    // 사용자가 직접 고치라고 열어 둔 전화번호만 비어 있을 때에만 채운다.
    if (prefill.name) setDisplayName(prefill.name);
    if (prefill.gender) setGender(prefill.gender);
    if (prefill.phone) setPhoneDigits((current) => (current.length > 0 ? current : prefill.phone!));
    if (prefill.birthDate) setBirthDateDigits((current) => current || prefill.birthDate!);
    setPrefillApplied(true);
  }, [prefill, prefillApplied]);

  const nicknameVerified = nicknameCheck.status === 'available' && nicknameCheck.value === nickname.trim();
  const profileDraft = { displayName, phone: phoneDigits, birthDate: birthDateDigits, gender };
  const profileIssue = getSignupProfileIssue(profileDraft);
  const signupPending = completeProfile.isPending || deferProfile.isPending || termsRecoveryPending;
  const isBlocked = signupPending || checkNickname.isPending || !nicknameVerified || profileIssue !== null;
  const steps: SocialStep[] = [
    'nickname',
    ...(!lockedGender || step === 'gender' ? ['gender' as const] : []),
    ...(!lockedName || step === 'name' ? ['name' as const] : []),
    ...(!kakaoPhoneAccepted || editPhone || step === 'phone' ? ['phone' as const] : []),
    ...(!prefill?.birthDate || !isSignupAgeEligible(prefill.birthDate) || editBirthDate || step === 'birthDate' ? ['birthDate' as const] : []),
    'review',
  ];
  const stepIndex = Math.max(0, steps.indexOf(step));
  const stepCopy: Record<SocialStep, { title: string; sub: string }> = {
    nickname: { title: '어떤 닉네임으로 활동할까요?', sub: '다른 사람에게 보여 줄 이름이에요.' },
    gender: { title: '성별을 선택해 주세요', sub: '경기와 대회 참가 조건을 확인할 때 사용해요.' },
    name: { title: '이름을 입력해 주세요', sub: '실명 또는 확인 가능한 이름을 알려 주세요.' },
    phone: { title: '휴대폰 번호를 확인해 주세요', sub: '직접 입력한 번호는 인증이 필요해요.' },
    birthDate: { title: '생년월일을 입력해 주세요', sub: '만 14세 이상만 가입할 수 있어요.' },
    review: { title: '입력한 정보를 확인해 주세요', sub: '제공받은 정보와 직접 입력한 정보를 함께 확인해 주세요.' },
  };
  const stepReady = step === 'nickname' ? nicknameVerified : step === 'gender' ? Boolean(gender)
    : step === 'name' ? Boolean(normalizeSignupDisplayName(displayName))
    : step === 'phone' ? /^\d{11}$/.test(phoneDigits) && contactReady
    : step === 'birthDate' ? isSignupAgeEligible(birthDateDigits) : !isBlocked;
  const nextStep = () => {
    if (!stepReady || signupPending) return;
    setError(null);
    setStep(steps[Math.min(stepIndex + 1, steps.length - 1)]);
  };
  const goBack = () => {
    if (stepIndex > 0) { setError(null); setStep(steps[stepIndex - 1]); return; }
    if (activityMode) router.replace(continuationPath());
    else void exitFlow.exit();
  };
  const runNicknameCheck = () => {
    const nextNickname = nickname.trim();
    setError(null);
    if (nextNickname.length < 2) {
      setFieldErrors((current) => ({ ...current, nickname: '2자 이상 입력해 주세요.' }));
      setNicknameCheck({ status: 'idle', value: '' });
      return;
    }

    checkNickname.mutate(nextNickname, {
      onSuccess: (result) => {
        setNicknameCheck({ status: result.available ? 'available' : 'taken', value: nextNickname });
        setFieldErrors((current) => ({ ...current, nickname: result.available ? undefined : '이미 사용 중인 닉네임이에요.' }));
      },
      onError: () => {
        setNicknameCheck({ status: 'error', value: nextNickname });
        setFieldErrors((current) => ({ ...current, nickname: '중복 확인에 실패했어요. 다시 시도해 주세요.' }));
      },
    });
  };

  const continuationPath = (nextRoute?: string | null) => resolveAuthContinuationPath(
    nextRoute, new URLSearchParams(window.location.search).get('redirect'),
  );

  const recoverRequiredTerms = async () => {
    // 서버가 가입 상태를 되돌린 오류라 fresh 캐시도 재조회해야 약관 게이트에 갇히지 않는다.
    setTermsRecoveryPending(true);
    try {
      // 재조회가 전역 게이트를 바꾸기 전에 URL에만 있는 원 목적지를 보존한다.
      const termsRoute = continuationPath('/terms?mode=social');
      const currentAuth = await authMe.refetch();
      if (currentAuth.isError) {
        setError(extractErrorMessage(currentAuth.error, '가입을 완료하지 못했어요.'));
        return;
      }
      router.replace(termsRoute);
    } finally {
      setTermsRecoveryPending(false);
    }
  };

  const deferSignup = () => {
    if (signupPending) return;
    setError(null);
    deferProfile.mutate(undefined, {
      onSuccess: (result) => {
        saveStoredV1Session(result.session);
        clearPendingSocialLink();
        clearPendingEmailLink();
        clearV1IdentityCache(queryClient);
        trackEvent('sign_up_complete', {
          method: authMe.data?.user?.authProvider ?? 'social',
          profile: 'deferred',
        });
        const destination = continuationPath(result.next?.route);
        if (result.user?.signupEmailLoginRequired === true && destination.startsWith('/terms?mode=renewal')) {
          const terms = new URL(destination, window.location.origin);
          terms.searchParams.set('redirect', emailLinkPath(getSavedRedirectPath() ?? '/home'));
          router.replace(`${terms.pathname}${terms.search}${terms.hash}`);
        } else {
          if (result.user?.signupEmailLoginRequired === true) {
            const returnTo = getSavedRedirectPath();
            router.replace(destination.startsWith(EMAIL_LINK_PATH) ? (returnTo ? emailLinkPath(returnTo) : destination) : emailLinkPath(destination));
          } else router.replace(destination);
        }
      },
      onError: async (nextError) => {
        if (nextError instanceof V1ApiError && nextError.code === 'TERMS_REQUIRED') {
          await recoverRequiredTerms();
          return;
        }
        if (nextError instanceof V1ApiError && nextError.code === 'SOCIAL_SIGNUP_EXPIRED') {
          setError(`가입 가능 시간이 지났어요. ${providerLabel ? `${providerLabel} 로그인부터` : '로그인 화면에서 처음부터'} 다시 시작해 주세요.`);
          return;
        }
        setError(extractErrorMessage(nextError, '나중에 입력하기를 처리하지 못했어요.'));
      },
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // mutation 종료 뒤에도 약관 복구가 끝나기 전에는 다른 가입 요청을 보내지 않는다.
    if (signupPending) return;
    setError(null);
    setPhoneConflict(false);
    setFieldErrors({});

    if (!nicknameVerified) {
      setFieldErrors({ nickname: '닉네임 중복 확인이 필요해요.' });
      return;
    }

    if (!isCompleteSignupProfile(profileDraft)) {
      const nextProfileIssue = getSignupProfileIssue(profileDraft);
      if (nextProfileIssue) {
        setError(SIGNUP_PROFILE_ERROR_MESSAGES[nextProfileIssue]);
      }
      return;
    }

    if (!contactReady) {
      setError('휴대폰 본인인증을 완료해 주세요.');
      return;
    }

    completeProfile.mutate(
      {
        nickname: nickname.trim(),
        displayName: normalizeSignupDisplayName(profileDraft.displayName),
        phone: profileDraft.phone,
        birthDate: profileDraft.birthDate,
        gender: profileDraft.gender,
      },
      {
        onSuccess: (result) => {
          saveStoredV1Session(result.session);
          // 새 계정의 가입이 끝났다 — 앞서 안내받은 계정용 대기 연결 토큰과 입력해 둔 이메일은 이 계정에 쓰이지 않게 지운다.
          clearPendingSocialLink();
          clearPendingEmailLink();
          clearV1IdentityCache(queryClient);
          const method = authMe.data?.user?.authProvider ?? 'social';
          // No next route means the server finished a deferred profile — possibly deferred in another
          // tab after this form rendered in signup mode.
          const nextRoute = result.next?.route;
          if (activityMode || !nextRoute) {
            trackEvent('activity_profile_complete', { method });
          } else {
            trackEvent('sign_up_complete', { method });
          }
          const destination = continuationPath(nextRoute);
          const termsFirst = nextRoute?.startsWith('/terms?mode=renewal') === true;
          if (signupMode && result.user?.signupEmailLoginRequired === true && (nextRoute?.startsWith('/onboarding/') || termsFirst)) {
            if (result.user?.canLinkLoginMethods === true) {
              if (termsFirst) {
                const onboarding = new URL('/onboarding/sport', window.location.origin);
                const originalDestination = getSavedRedirectPath();
                if (originalDestination) onboarding.searchParams.set('redirect', originalDestination);
                const terms = new URL(destination, window.location.origin);
                terms.searchParams.set('redirect', emailLinkPath(`${onboarding.pathname}${onboarding.search}`));
                router.replace(`${terms.pathname}${terms.search}${terms.hash}`);
              } else router.replace(emailLinkPath(destination));
            } else setPostSignupDestination({ path: destination, denied: result.user?.canLinkLoginMethods === false, termsFirst });
            return;
          }
          router.replace(destination);
        },
        onError: async (nextError) => {
          if (nextError instanceof V1ApiError && nextError.code === 'NICKNAME_CONFLICT') {
            setStep('nickname');
            setNicknameCheck({ status: 'taken', value: nickname.trim() });
            setFieldErrors({ nickname: '이미 사용 중인 닉네임이에요.' });
            setError('다른 닉네임으로 다시 시도해 주세요.');
            return;
          }

          if (nextError instanceof V1ApiError && nextError.code === 'PHONE_CONFLICT') {
            setEditPhone(true);
            setStep('phone');
            recordConflictHint(nextError);
            setPhoneConflict(true);
            return;
          }

          if (nextError instanceof V1ApiError && nextError.code === 'TERMS_NOT_READY') {
            setError('필수 약관을 저장할 수 없어 가입을 완료하지 못했어요.');
            return;
          }

          if (nextError instanceof V1ApiError && nextError.code === 'TERMS_REQUIRED') {
            await recoverRequiredTerms();
            return;
          }

          if (nextError instanceof V1ApiError && nextError.code === 'SOCIAL_SIGNUP_EXPIRED') {
            setError(`가입 가능 시간이 지났어요. ${providerLabel ? `${providerLabel} 로그인부터` : '로그인 화면에서 처음부터'} 다시 시작해 주세요.`);
            return;
          }

          if (nextError instanceof V1ApiError && nextError.code === 'PHONE_NOT_VERIFIED') {
            setEditPhone(true);
            setStep('phone');
            setError('휴대폰 본인인증을 완료해 주세요.');
            setPhoneVerified(false);
            return;
          }

          setError(extractErrorMessage(nextError, '가입을 완료하지 못했어요.'));
        },
      },
    );
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (step !== 'review') { event.preventDefault(); nextStep(); return; }
    submit(event);
  };

  if (postSignupDestination) {
    return <AuthFrame stage={AUTH_WELCOME_STAGE} topTitle="이메일 로그인 연결">
      <div className="tm-auth-body">
        <h1 className="tm-text-heading">이메일 로그인을 연결하지 못했어요</h1>
        <p className="tm-text-body tm-auth-sub">{postSignupDestination.denied ? '이 계정은 현재 로그인 방법을 변경할 수 없어요.' : '이 계정의 로그인 방법 변경 권한을 확인하지 못했어요.'} {postSignupDestination.termsFirst ? '먼저 필수 약관을 확인해 주세요.' : '고객센터에 문의해 주세요.'}</p>
        <Button block size="lg" type="button" variant="primary" onClick={() => router.replace(postSignupDestination.termsFirst ? postSignupDestination.path : '/my/inquiries/new')}>{postSignupDestination.termsFirst ? '필수 약관 확인하기' : '고객센터 문의하기'}</Button>
      </div>
    </AuthFrame>;
  }

  return (
    <AuthFrame
      stage={AUTH_WELCOME_STAGE}
      topTitle={activityMode ? '활동 정보 입력' : providerLabel ? `${providerLabel} 가입` : '간편 가입'}
      onBack={goBack}
      backLabel={stepIndex > 0 ? '이전 단계' : activityMode ? '돌아가기' : '가입 그만두기'}
    >
      <form className="tm-auth-body" id="v1-social-signup-form" onSubmit={handleFormSubmit}>
        {!statusPending ? <AuthStepHeader name="가입" steps={steps} index={stepIndex} title={stepCopy[step].title} sub={stepCopy[step].sub} focusOnChange /> : null}
        <div className="tm-auth-form tm-auth-signup-form">
          {step === 'nickname' ? (
            <label className="tm-auth-field">
              <span className="tm-text-label">닉네임</span>
              <span className="tm-auth-field-with-action">
                <input className={`tm-input tm-auth-input ${fieldErrors.nickname ? 'tm-auth-input-error' : nicknameVerified ? 'tm-auth-input-success' : ''}`}
                  minLength={2} onChange={(event) => { setNickname(event.target.value); setNicknameCheck({ status: 'idle', value: '' }); setFieldErrors((current) => ({ ...current, nickname: undefined })); }}
                  placeholder="사용할 닉네임" required type="text" value={nickname} aria-invalid={fieldErrors.nickname ? true : undefined}
                  aria-describedby={fieldErrors.nickname || nicknameVerified ? 'social-signup-nickname-helper' : undefined} />
                <Button disabled={nickname.trim().length < 2} loading={checkNickname.isPending} onClick={runNicknameCheck} size="md" type="button" variant="neutral">중복 확인</Button>
              </span>
              {fieldErrors.nickname || nicknameVerified ? <span id="social-signup-nickname-helper" role={fieldErrors.nickname ? 'alert' : undefined}
                className={`tm-text-caption tm-auth-field-helper ${fieldErrors.nickname ? 'tm-auth-field-helper-error' : 'tm-auth-field-helper-success'}`}>{fieldErrors.nickname ?? '사용 가능한 닉네임이에요.'}</span> : null}
            </label>
          ) : null}
          {step === 'gender' ? <div className="tm-auth-field">
            <span className="tm-text-label">성별</span>
            <div className="tm-auth-segmented" role="radiogroup" aria-label="성별" aria-invalid={fieldErrors.gender ? true : undefined}>
              {(['male', 'female'] as const).map((value) => <button key={value} className={`tm-auth-segment ${gender === value ? 'tm-auth-segment-active' : ''}`} type="button" role="radio" aria-checked={gender === value} disabled={lockedGender} onClick={() => { setGender(value); setFieldErrors((current) => ({ ...current, gender: undefined })); }}>{value === 'male' ? '남' : '여'}</button>)}
            </div>
          </div> : null}
          {step === 'name' ? <label className="tm-auth-field"><span className="tm-text-label">이름</span>
            <input className="tm-input tm-auth-input" maxLength={40} onChange={(event) => setDisplayName(event.target.value)} placeholder="실명 또는 확인 가능한 이름" readOnly={lockedName} required type="text" value={displayName} />
          </label> : null}
          {step === 'phone' ? <>
            <label className="tm-auth-field"><span className="tm-text-label">휴대폰 번호</span>
              <input className="tm-input tm-auth-input" inputMode="numeric" onChange={(event) => { setPhoneDigits(normalizeSeparatedDigits(event.target.value)); setPhoneVerified(false); setPhoneConflict(false); }} placeholder="010-0000-0000" required value={formatPhone(phoneDigits)} />
            </label>
            {phoneDigits.length === 11 && !contactReady ? <PhoneVerificationCard mode="authed" phone={phoneDigits} onVerified={() => setPhoneVerified(true)} surface="inset" conflictNotice={phoneConflictNotice} onFailure={recordConflictHint} /> : null}
            {contactReady ? <div className="tm-text-caption" role="status" style={{ color: 'var(--blue700)' }}>{kakaoPhoneAccepted ? '카카오에서 받은 전화번호예요. 추가 인증 없이 사용할 수 있어요.' : '휴대폰 본인인증이 완료됐어요'}</div> : null}
            {phoneConflict ? phoneConflictNotice : null}
          </> : null}
          {step === 'birthDate' ? <label className="tm-auth-field"><span className="tm-text-label">생년월일</span>
            <DatePickerTextInput dateValue={formatBirthDate(birthDateDigits)} inputClassName="tm-auth-input" onDateChange={(value) => setBirthDateDigits(normalizeSeparatedDigits(value))} onTextChange={(value) => setBirthDateDigits(normalizeSeparatedDigits(value))} placeholder="예: 1995-01-15" required value={formatBirthDate(birthDateDigits)} />
            <span className="tm-text-caption" role="status" style={{ color: birthDateDigits.length === 8 && !isSignupAgeEligible(birthDateDigits) ? 'var(--red700)' : 'var(--text-caption)' }}>만 14세 이상만 가입할 수 있어요.</span>
          </label> : null}
          {step === 'review' ? <>
            <dl className={styles.summary}>
              <div className={styles.row}><dt>닉네임</dt><dd>{nickname}</dd></div>
              <div className={styles.row}><dt>이름</dt><dd>{displayName}{lockedName ? <span className={styles.source}>{providerLabel ?? '소셜'} 제공</span> : null}</dd></div>
              <div className={styles.row}><dt>성별</dt><dd>{gender === 'male' ? '남' : '여'}{lockedGender ? <span className={styles.source}>{providerLabel ?? '소셜'} 제공</span> : null}</dd></div>
              <div className={styles.row}><dt>휴대폰</dt><dd>{formatPhone(phoneDigits)}<span className={styles.source}>{kakaoPhoneAccepted ? `${providerLabel ?? '소셜'} 제공` : '인증 완료'}</span></dd><button className={styles.edit} type="button" onClick={() => { setEditPhone(true); setStep('phone'); }}>번호 변경</button></div>
              <div className={styles.row}><dt>생년월일</dt><dd>{formatBirthDate(birthDateDigits)}</dd><button className={styles.edit} type="button" onClick={() => { setEditBirthDate(true); setStep('birthDate'); }}>생년월일 변경</button></div>
            </dl>
            {signupMode && authMe.data?.user.canLinkAfterSignup === false ? <p className="tm-text-caption">이 계정은 현재 이메일 로그인을 연결할 수 없어요.</p> : null}
            {signupMode && authMe.data?.user.canLinkAfterSignup === undefined ? <p className="tm-text-caption">이메일 로그인 연결 가능 여부를 확인하지 못했어요. 가입 후 로그인 방법 설정에서 다시 확인해 주세요.</p> : null}
            {signupMode && authMe.data?.user.canLinkAfterSignup === true ? <p className={styles.next}>다음으로 이메일을 인증하고 비밀번호를 설정해요.</p> : null}
          </> : null}
        </div>
        {error ? <Card pad={16} className="tm-auth-soft-card tm-auth-soft-card-error"><div className="tm-text-body-lg">가입을 완료하지 못했어요</div><div className="tm-text-caption">{error}</div></Card> : null}
        {exitFlow.error ? <Card pad={16} className="tm-auth-soft-card tm-auth-soft-card-error"><div className="tm-text-body-lg">가입을 취소하지 못했어요</div><div className="tm-text-caption">{exitFlow.error}</div></Card> : null}
        <div style={{ marginTop: 24 }}>
          <Button block disabled={!stepReady || signupPending || checkNickname.isPending} loading={completeProfile.isPending || termsRecoveryPending} size="lg" type="submit" variant={stepReady ? 'primary' : 'neutral'}>
            {step === 'review' ? activityMode ? '입력 완료하고 계속하기' : '확인하고 계속' : '다음'}
          </Button>
          {signupMode && step !== 'review' ? <><div className="tm-auth-fixed-skip-row" style={{ justifyContent: 'center' }}><Button disabled={signupPending} loading={deferProfile.isPending || termsRecoveryPending} onClick={deferSignup} size="sm" type="button" variant="ghost">나중에 입력할게요</Button></div><div className="tm-text-micro tm-auth-fixed-reason">팀 만들기·참가 신청처럼 활동을 시작할 때 다시 물어볼게요.</div></> : null}
        </div>
      </form>
      {exitFlow.ConfirmModal}
    </AuthFrame>
  );
}
