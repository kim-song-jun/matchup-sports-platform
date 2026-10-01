'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { Card, DatePickerTextInput } from '@/components/v1-ui/primitives';
import { EyeIcon, EyeOffIcon } from '@/components/v1-ui/icons';
import { OtpCodeInput, OtpErrorBanner, OtpRemainingRow } from '@/components/auth/otp/otp-parts';
import { OTP_CODE_LENGTH, useOtpVerification } from '@/components/auth/otp/use-otp-verification';
import { usePhoneVerificationRequests } from '@/components/auth/phone-verification/use-phone-verification-requests';
import {
  useV1CheckEmail,
  useV1CheckNickname,
  useV1Register,
  useV1UpdateProfile,
  useV1UploadImages,
} from '@/hooks/use-v1-api';
import { cssUrl } from '@/lib/assets';
import { V1ApiError } from '@/lib/api-client';
import { trackEvent } from '@/lib/analytics';
import { clearV1IdentityCache } from '@/lib/query-keys';
import { saveStoredV1Session } from '@/lib/session-storage';
import { displayInitials } from '@/lib/display-initials';
import {
  clearSignupTermsDocumentIds,
  readSignupTermsDocumentIds,
} from '@/lib/signup-terms-storage';
import { AUTH_WELCOME_STAGE, AuthFrame } from './auth-page';
import { useDuplicateCheck, type DuplicateCheckStatus } from './use-duplicate-check';
import {
  formatBirthDate,
  formatPhone,
  getSignupProfileIssue,
  isCompleteSignupProfile,
  isPlausibleEmail,
  isSignupAgeEligible,
  normalizeSeparatedDigits,
  normalizeSignupDisplayName,
  SIGNUP_PROFILE_ERROR_MESSAGES,
} from './signup-profile-validation';
import { extractErrorMessage } from '@/lib/error-message';

type WizardStep = 'account' | 'verify' | 'profile';

const STEP_ORDER: WizardStep[] = ['account', 'verify', 'profile'];

const STEP_COPY: Record<WizardStep, { title: string; sub?: string }> = {
  account: {
    title: '가입 정보를\n확인해 주세요',
    sub: '닉네임과 이메일은 입력하면 중복을 바로 확인해요. 비밀번호까지 입력하면 본인인증 단계로 넘어가요.',
  },
  verify: {
    title: '휴대폰 번호를 인증해 주세요',
    sub: '인증이 끝나면 자동으로 다음 단계로 넘어가요.',
  },
  // 부제가 없다: 생년월일 칸까지 첫 화면 안에 들어오게 하려고 제목만 둔다.
  profile: {
    title: '프로필을 완성해 주세요',
  },
};

/** 인증 성공 표시를 볼 시간을 준 뒤 다음 단계로 넘긴다 — 즉시 전환하면 무엇이 처리됐는지 알 수 없다. */
const VERIFY_ADVANCE_DELAY_MS = 900;

const onboardingDraftKey = 'teameet.v1.onboardingDraft';

/**
 * 필수 입력 표시. 별표는 장식(aria-hidden)이고 실제 의미는 sr-only 텍스트가 전달한다 —
 * 빨간 별 하나만 두면 색으로만 정보를 주게 되어 색각 이상·스크린리더 사용자에게는 사라진다.
 * 어드민 폼(admin/admins, tournaments/new)이 쓰는 표기와 같은 형태다.
 */
function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" style={{ marginLeft: 2, color: 'var(--red700)' }}>*</span>
      <span className="sr-only">(필수)</span>
    </>
  );
}

export function SignupClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const register = useV1Register();
  const updateProfile = useV1UpdateProfile();
  const uploadImages = useV1UploadImages();
  const checkEmail = useV1CheckEmail();
  const checkNickname = useV1CheckNickname();

  const [step, setStep] = useState<WizardStep>('account');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false);
  const [realName, setRealName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneProofToken, setPhoneProofToken] = useState<string | null>(null);
  const [birthDateDigits, setBirthDateDigits] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [acceptedTermsDocumentIds, setAcceptedTermsDocumentIds] = useState<string[]>([]);
  const [termsReady, setTermsReady] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nicknameHelperId = useId();
  const emailHelperId = useId();
  const normalizedNickname = nickname.trim();
  const normalizedEmail = email.trim().toLowerCase();
  const nicknameCheck = useDuplicateCheck({
    value: normalizedNickname,
    isCheckable: (value) => value.length >= 2,
    check: checkNickname.mutateAsync,
  });
  const emailCheck = useDuplicateCheck({
    value: normalizedEmail,
    isCheckable: isPlausibleEmail,
    check: checkEmail.mutateAsync,
  });
  /** 인증 완료 → 다음 단계 자동 이동 타이머. 언마운트 시 정리해 사라진 화면에 setState 하지 않는다. */
  const advanceTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
    },
    [],
  );

  /**
   * 인증이 끝나면 사용자가 버튼을 한 번 더 누르지 않아도 다음 단계로 넘어간다.
   * 다만 즉시 전환하면 "인증 완료" 표시를 볼 새가 없어 무엇이 처리됐는지 알 수 없으므로,
   * 완료 상태를 잠깐 보여준 뒤 이동한다.
   */
  const handlePhoneVerified = (token?: string) => {
    setPhoneProofToken(token ?? null);
    setProfileError(null);
    if (!token) return;
    if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null;
      setStep('profile');
    }, VERIFY_ADVANCE_DELAY_MS);
  };

  const otpIdPrefix = useId();
  const phoneRequests = usePhoneVerificationRequests({ mode: 'public', phone: phoneDigits, onVerified: handlePhoneVerified });
  const otp = useOtpVerification(phoneRequests);

  useEffect(() => {
    const documentIds = readSignupTermsDocumentIds();
    if (documentIds.length === 0) {
      router.replace('/terms?mode=signup');
      return;
    }
    setAcceptedTermsDocumentIds(documentIds);
    setTermsReady(true);
  }, [router]);

  if (!termsReady) return null;

  const stepIndex = STEP_ORDER.indexOf(step);
  const copy = STEP_COPY[step];
  const nicknameError = duplicateFieldError(nicknameCheck.status, {
    taken: '이미 사용 중인 닉네임이에요.',
    invalid: '닉네임은 2자 이상 입력해 주세요.',
  });
  const emailError = duplicateFieldError(emailCheck.status, {
    taken: '이미 가입된 이메일이에요.',
    invalid: '이메일 형식을 확인해 주세요.',
  });
  const passwordMismatch = passwordConfirm.length > 0 && password !== passwordConfirm;
  const passwordMatch = passwordConfirm.length > 0 && password === passwordConfirm;
  const passwordTooShort = password.length > 0 && password.length < 8;
  const passwordLongEnough = password.length >= 8;
  const accountReady = nicknameCheck.verified && emailCheck.verified && passwordLongEnough && passwordMatch;
  // normalizeSeparatedDigits 는 하이픈·공백만 걷어내므로 'ROLLING10ab' 같은 값도 길이 11이 된다.
  // 길이만 보고 인증을 열면 문자가 섞인 값으로 유료 SMS 발송을 시도하게 되므로 숫자 11자리만 허용한다.
  const isSendablePhone = /^\d{11}$/.test(phoneDigits);
  const profileDraft = { displayName: realName, phone: phoneDigits, birthDate: birthDateDigits, gender };
  const profileIssue = getSignupProfileIssue(profileDraft);
  const profileBlocked = register.isPending || updateProfile.isPending || uploadImages.isPending || uploadingProfileImage || profileIssue !== null;

  const selectProfileImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setProfileError(null);
    setError(null);
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setProfileError('이미지 파일만 선택할 수 있어요.');
      event.target.value = '';
      return;
    }

    // 용량으로 거부하지 않는다 -- 제출 시 업로드 훅이 2MB 초과 사진을 자동으로 줄여
    // WebP 로 변환한다(프로필 수정 화면과 같은 정책, 2026-08-25 사용자 확정).
    const reader = new FileReader();
    setUploadingProfileImage(true);
    reader.onload = () => {
      setProfileImageUrl(typeof reader.result === 'string' ? reader.result : '');
      setProfileImageFile(file);
      setUploadingProfileImage(false);
    };
    reader.onerror = () => {
      setProfileError('이미지를 읽지 못했어요. 다시 선택해 주세요.');
      event.target.value = '';
      setUploadingProfileImage(false);
    };
    reader.readAsDataURL(file);
  };

  const goBack = () => {
    setError(null);
    setProfileError(null);
    // 인증 직후 900ms 안에 뒤로가기를 누르면, 예약된 자동 이동이 나중에 발동해 사용자가
    // 되돌아온 단계를 덮어쓴다. 단계를 바꾸기 전에 예약을 취소한다.
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    // 인증 단계로 되돌아와도 이미 받은 증명은 유지한다 — 되돌아왔다는 이유로 재인증을 시키면
    // 유료 SMS 를 한 번 더 쓰게 되고 쿨다운에도 걸린다.
    setStep(step === 'profile' ? 'verify' : 'account');
  };

  const goVerify = () => {
    if (!accountReady) return;
    setError(null);
    setProfileError(null);
    setStep('verify');
  };

  const goProfile = () => {
    if (!phoneProofToken) return;
    setError(null);
    setProfileError(null);
    setStep('profile');
  };

  const submitAccount = async () => {
    // 로딩 중 재클릭 시 중복 제출 방지 — isPending 은 disabled 속성과 동일하게 리렌더
    // 이후에나 반영되는 값이라 동시 클릭까지 막지는 못하지만, 스피너가 보이는 동안의
    // 재클릭은 막는다(동시 클릭 방지가 필요하면 ref 락을 따로 둔다).
    if (profileBlocked) return;
    setError(null);
    setProfileError(null);
    if (!isCompleteSignupProfile(profileDraft)) {
      const nextProfileIssue = getSignupProfileIssue(profileDraft);
      if (nextProfileIssue) setProfileError(SIGNUP_PROFILE_ERROR_MESSAGES[nextProfileIssue]);
      return;
    }

    if (!phoneProofToken) {
      setProfileError('휴대폰 본인인증을 완료해 주세요.');
      return;
    }

    try {
      const normalizedRealName = normalizeSignupDisplayName(profileDraft.displayName);
      const result = await register.mutateAsync({
        nickname: normalizedNickname,
        realName: normalizedRealName,
        displayName: normalizedRealName,
        email: normalizedEmail,
        password,
        gender: profileDraft.gender,
        phone: profileDraft.phone,
        birthDate: profileDraft.birthDate,
        requiredTermsAccepted: true,
        acceptedTermsDocumentIds,
        phoneProofToken: phoneProofToken ?? undefined,
      });

      saveStoredV1Session(result.session);
      clearV1IdentityCache(queryClient);
      trackEvent('sign_up_complete', { method: 'email' });

      if (profileImageFile) {
        const uploadResult = await uploadImages.mutateAsync([profileImageFile]);
        const uploadedUrl = uploadResult.urls[0];
        if (!uploadedUrl) {
          throw new Error('프로필 사진 업로드 응답에 이미지 URL이 없어요.');
        }

        await updateProfile.mutateAsync({
          realName: normalizedRealName,
          nickname: normalizedNickname,
          email: normalizedEmail,
          profileImageUrl: uploadedUrl,
          phone: profileDraft.phone,
          birthDate: profileDraft.birthDate,
          gender: profileDraft.gender,
        });
      }

      window.sessionStorage.removeItem(onboardingDraftKey);
      clearSignupTermsDocumentIds();
      router.replace('/signup/complete');
    } catch (nextError) {
      if (nextError instanceof V1ApiError && nextError.statusCode === 409) {
        if (nextError.code === 'NICKNAME_CONFLICT') {
          nicknameCheck.markTaken(normalizedNickname);
          setStep('account');
          return;
        }
        if (nextError.code === 'PHONE_CONFLICT') {
          setProfileError('이미 가입된 휴대폰 번호예요.');
          return;
        }
        emailCheck.markTaken(normalizedEmail);
        setStep('account');
        return;
      }
      if (nextError instanceof V1ApiError && nextError.code === 'PHONE_NOT_VERIFIED') {
        setProfileError('휴대폰 본인인증을 완료해 주세요.');
        setPhoneProofToken(null);
        return;
      }
      if (nextError instanceof V1ApiError && nextError.code === 'TERMS_NOT_READY') {
        setError('필수 약관 문서가 아직 준비되지 않았어요.');
        return;
      }
      if (nextError instanceof V1ApiError && (nextError.code === 'TERMS_REQUIRED' || nextError.code === 'TERMS_DOCUMENT_STALE')) {
        router.replace('/terms?mode=signup');
        return;
      }
      setError(extractErrorMessage(nextError, '회원가입에 실패했어요.'));
    }
  };
  const primary =
    step === 'account'
      ? {
          label: '본인인증 하기',
          disabled: !accountReady,
          loading: false,
          onClick: goVerify,
        }
      : step === 'verify'
      ? phoneProofToken
        ? {
            // 인증 성공 시 자동으로 넘어가므로 이 버튼은 되돌아온 사용자를 위한 경로다.
            label: '다음',
            disabled: false,
            loading: false,
            onClick: goProfile,
          }
        : otp.phase === 'idle' || otp.expired
        ? {
            label: otp.expired ? '인증번호 다시 받기' : '인증번호 받기',
            disabled: !isSendablePhone || phoneRequests.issuing,
            loading: phoneRequests.issuing,
            onClick: () => { void otp.requestCode(); },
          }
        : {
            label: '인증번호 확인',
            disabled: otp.code.length !== OTP_CODE_LENGTH || phoneRequests.verifying,
            loading: phoneRequests.verifying,
            onClick: () => { void otp.submitCode(); },
          }
      : {
          label: register.isPending ? '가입하는 중...' : '가입하고 계속',
          disabled: profileBlocked,
          loading: false,
          onClick: () => { void submitAccount(); },
        };

  const disabledHint: string | null = primary.disabled
    ? step === 'account'
      ? !nicknameCheck.verified
        ? duplicateHint('닉네임', nicknameCheck.waiting)
        : !emailCheck.verified
          ? duplicateHint('이메일', emailCheck.waiting)
          : !passwordLongEnough
            ? '비밀번호는 8자 이상이어야 해요.'
            : '비밀번호 확인이 일치해야 해요.'
      : step === 'verify'
        ? !isSendablePhone
          ? '휴대폰 번호를 숫자 11자리로 입력해 주세요.'
          : otp.phase === 'sent' && !otp.expired && otp.code.length !== OTP_CODE_LENGTH
            ? '인증번호 6자리를 입력해 주세요.'
            : null
        : profileIssue
          ? SIGNUP_PROFILE_ERROR_MESSAGES[profileIssue]
          : uploadingProfileImage
          ? '프로필 사진을 업로드하는 중이에요.'
          : null
    : null;

  return (
    <AuthFrame
      stage={AUTH_WELCOME_STAGE}
      // 뒤로가기는 상단 하나뿐이고 목적지는 늘 바로 앞 단계다: 첫 단계는 약관(거기서 다시 /login
      // 으로 나갈 수 있다), 이후 단계는 이전 입력 단계.
      topTitle="회원가입"
      backHref={step === 'account' ? '/terms?mode=signup' : undefined}
      onBack={step === 'account' ? undefined : goBack}
      fixedAction={
        <>
          <button
            className={`tm-btn tm-btn-lg ${primary.disabled ? 'tm-btn-neutral' : 'tm-btn-primary'} tm-btn-block`}
            disabled={primary.disabled}
            type="button"
            onClick={primary.onClick}
          >
            {primary.loading ? <span className="tm-spinner" aria-hidden="true" /> : null}
            {primary.label}
          </button>
          {disabledHint ? (
            <p className="tm-text-caption" role="status" style={{ margin: '8px 0 0', textAlign: 'center' }}>
              {disabledHint}
            </p>
          ) : null}
        </>
      }
    >
      <div className="tm-auth-body">
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {`${STEP_ORDER.length}단계 중 ${stepIndex + 1}단계: ${copy.title.replace(/\n/g, ' ')}`}
        </p>
        <div
          className="tm-signup-progress"
          role="progressbar"
          aria-label={`회원가입 진행 단계 ${stepIndex + 1} / ${STEP_ORDER.length}`}
          aria-valuenow={stepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={STEP_ORDER.length}
          style={{ ['--signup-steps' as string]: STEP_ORDER.length }}
        >
          {STEP_ORDER.map((value, index) => (
            <span key={value} data-on={index <= stepIndex} aria-hidden="true" />
          ))}
        </div>
        <div className={`tm-signup-hero${copy.sub ? '' : ' tm-signup-hero-title-only'}`}>
          <h1 className="tm-text-heading tm-auth-heading">{copy.title}</h1>
          {copy.sub ? <p className="tm-text-body tm-auth-sub">{copy.sub}</p> : null}
        </div>

        {/* 별표를 aria-hidden 으로만 두면 "표시는 필수 입력이에요"로 읽혀 무엇에 대한 설명인지
            사라진다. 시각 사용자는 기호로, 보조공학은 sr-only 단어로 같은 문장을 받게 한다. */}
        <p className="tm-text-caption" style={{ margin: '0 0 4px', color: 'var(--text-muted)' }}>
          <span aria-hidden="true" style={{ color: 'var(--red700)' }}>*</span>
          <span className="sr-only">별표</span> 표시는 필수 입력이에요.
        </p>

        <form className="tm-auth-form tm-auth-signup-form" onSubmit={(event: FormEvent) => event.preventDefault()}>
          {step === 'account' ? (
            <>
              <label className="tm-auth-field">
                <span className="tm-text-label">닉네임<RequiredMark /></span>
                <input
                  className={`tm-input tm-auth-input ${nicknameError ? 'tm-auth-input-error' : nicknameCheck.verified ? 'tm-auth-input-success' : ''}`}
                  minLength={2}
                  maxLength={40}
                  autoFocus
                  onChange={(event) => setNickname(event.target.value)}
                  onBlur={nicknameCheck.onBlur}
                  placeholder="활동 닉네임"
                  type="text"
                  value={nickname}
                  aria-invalid={nicknameError ? true : undefined}
                  aria-describedby={nicknameError || nicknameCheck.status === 'checking' || nicknameCheck.verified ? nicknameHelperId : undefined}
                />
                <DuplicateHelper id={nicknameHelperId} status={nicknameCheck.status} error={nicknameError} availableMessage="사용 가능한 닉네임이에요." />
              </label>

              <label className="tm-auth-field">
                <span className="tm-text-label">이메일<RequiredMark /></span>
                <input
                  className={`tm-input tm-auth-input ${emailError ? 'tm-auth-input-error' : emailCheck.verified ? 'tm-auth-input-success' : ''}`}
                  onChange={(event) => setEmail(event.target.value)}
                  onBlur={emailCheck.onBlur}
                  placeholder="예: name@email.com"
                  type="email"
                  value={email}
                  aria-invalid={emailError ? true : undefined}
                  aria-describedby={emailError || emailCheck.status === 'checking' || emailCheck.verified ? emailHelperId : undefined}
                />
                <DuplicateHelper id={emailHelperId} status={emailCheck.status} error={emailError} availableMessage="사용 가능한 이메일이에요." />
              </label>

              <label className="tm-auth-field">
                <span className="tm-text-label">비밀번호<RequiredMark /></span>
                <span className="tm-auth-password-field">
                  <input
                    className={`tm-input tm-auth-input ${passwordTooShort ? 'tm-auth-input-error' : passwordLongEnough ? 'tm-auth-input-success' : ''}`}
                    minLength={8}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="8자 이상"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    aria-invalid={passwordTooShort ? true : undefined}
                    aria-describedby={passwordTooShort || passwordLongEnough ? 'signup-password-helper' : undefined}
                  />
                  <button className="tm-auth-password-toggle" type="button" aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>
                    {showPassword ? <EyeOffIcon size={20} strokeWidth={1.8} /> : <EyeIcon size={20} strokeWidth={1.8} />}
                  </button>
                </span>
                {passwordTooShort ? (
                  <span id="signup-password-helper" role="alert" className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-error">8자 이상 입력해 주세요.</span>
                ) : passwordLongEnough ? (
                  <span id="signup-password-helper" className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-success">사용할 수 있는 비밀번호예요.</span>
                ) : null}
              </label>

              <label className="tm-auth-field">
                <span className="tm-text-label">비밀번호 확인<RequiredMark /></span>
                <span className="tm-auth-password-field">
                  <input
                    className={`tm-input tm-auth-input ${passwordMismatch ? 'tm-auth-input-error' : passwordMatch ? 'tm-auth-input-success' : ''}`}
                    minLength={8}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                    placeholder="비밀번호 다시 입력"
                    type={showPasswordConfirm ? 'text' : 'password'}
                    value={passwordConfirm}
                    aria-invalid={passwordMismatch ? true : undefined}
                    aria-describedby={passwordMismatch || passwordMatch ? 'signup-password-confirm-helper' : undefined}
                  />
                  <button className="tm-auth-password-toggle" type="button" aria-label={showPasswordConfirm ? '비밀번호 숨기기' : '비밀번호 보기'} aria-pressed={showPasswordConfirm} onClick={() => setShowPasswordConfirm((value) => !value)}>
                    {showPasswordConfirm ? <EyeOffIcon size={20} strokeWidth={1.8} /> : <EyeIcon size={20} strokeWidth={1.8} />}
                  </button>
                </span>
                {passwordMismatch ? (
                  <span id="signup-password-confirm-helper" role="alert" className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-error">비밀번호가 일치하지 않아요.</span>
                ) : passwordMatch ? (
                  <span id="signup-password-confirm-helper" className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-success">비밀번호가 일치해요.</span>
                ) : null}
              </label>
            </>
          ) : null}

          {step === 'verify' ? (
            <>
              <label className="tm-auth-field">
                <span className="tm-text-label">휴대폰 번호<RequiredMark /></span>
                <input
                  className="tm-input tm-auth-input"
                  inputMode="numeric"
                  onChange={(event) => {
                    setPhoneDigits(normalizeSeparatedDigits(event.target.value));
                    // 번호가 바뀌면 직전 번호로 받은 증명은 무효다.
                    setPhoneProofToken(null);
                    setProfileError(null);
                  }}
                  placeholder="010-0000-0000"
                  required
                  value={formatPhone(phoneDigits)}
                />
              </label>

              {isSendablePhone && !phoneProofToken ? (
                <>
                  {otp.phase === 'sent' ? (
                    <OtpCodeInput idPrefix={otpIdPrefix} otp={otp} verifying={phoneRequests.verifying} />
                  ) : null}
                  <OtpErrorBanner idPrefix={otpIdPrefix} otp={otp} />
                  {otp.phase === 'sent' ? (
                    <div style={{ marginTop: -4 }}>
                      <OtpRemainingRow idPrefix={otpIdPrefix} otp={otp} issuing={phoneRequests.issuing} />
                    </div>
                  ) : null}
                </>
              ) : null}

              {phoneProofToken ? (
                <div
                  className="tm-auth-inset"
                  role="status"
                  style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--blue50)' }}
                >
                  <span
                    aria-hidden="true"
                    style={{ width: 6, height: 6, borderRadius: 'var(--radius-circle)', background: 'var(--blue500)', display: 'inline-block' }}
                  />
                  <span className="tm-text-label" style={{ color: 'var(--blue700)' }}>
                    휴대폰 본인인증이 완료됐어요
                  </span>
                </div>
              ) : null}
            </>
          ) : null}

          {step === 'profile' ? (
            <>
              <div className="tm-auth-profile-upload">
                {/* 행 전체가 파일 선택 라벨이다 — 아바타·문구·버튼이 각자 같은 일을 하지 않는다. */}
                <label className="tm-auth-profile-upload-main tm-pressable">
                  <span className="tm-auth-profile-preview-trigger">
                    <span className="tm-auth-profile-preview" style={profileImageUrl ? { backgroundImage: cssUrl(profileImageUrl) } : undefined}>
                      {profileImageUrl ? null : <span className="tm-text-caption">{displayInitials(realName || normalizedNickname, { fallback: 'T' })}</span>}
                    </span>
                    {profileImageUrl ? null : (
                      <span className="tm-auth-profile-preview-badge" aria-hidden="true">
                        <Camera size={13} strokeWidth={2.4} />
                      </span>
                    )}
                    <input className="sr-only" type="file" accept="image/*" onChange={selectProfileImage} disabled={uploadingProfileImage} />
                  </span>
                  <span>
                    <span className="tm-text-label">프로필 사진 <em className="tm-auth-optional">선택 입력</em></span>
                    <span className="tm-text-caption tm-auth-profile-upload-hint">
                      {uploadingProfileImage
                        ? '사진을 읽고 있어요.'
                        : profileImageUrl
                          ? '눌러서 다른 사진으로 바꿀 수 있어요.'
                          : '눌러서 사진을 올려요. 큰 사진은 자동으로 줄여요.'}
                    </span>
                  </span>
                </label>
                {profileImageUrl ? (
                  <button className="tm-btn tm-btn-md tm-btn-ghost" type="button" disabled={uploadingProfileImage} onClick={() => { setProfileImageUrl(''); setProfileImageFile(null); }}>
                    제거
                  </button>
                ) : null}
              </div>

              <div className="tm-auth-field">
                {/* radiogroup 은 label 로 감싸지지 않으므로 aria-labelledby 로 라벨을 직접 물린다 —
                    aria-label="성별" 만 두면 라벨 안의 "(필수)" 가 접근성 이름에서 빠진다. */}
                <span className="tm-text-label" id="signup-gender-label">성별<RequiredMark /></span>
                <div
                  className="tm-auth-segmented"
                  role="radiogroup"
                  aria-labelledby="signup-gender-label"
                  aria-required="true"
                >
                  <button
                    className={`tm-auth-segment ${gender === 'male' ? 'tm-auth-segment-active' : ''}`}
                    type="button"
                    role="radio"
                    aria-checked={gender === 'male'}
                    onClick={() => { setGender('male'); setProfileError(null); }}
                  >
                    남
                  </button>
                  <button
                    className={`tm-auth-segment ${gender === 'female' ? 'tm-auth-segment-active' : ''}`}
                    type="button"
                    role="radio"
                    aria-checked={gender === 'female'}
                    onClick={() => { setGender('female'); setProfileError(null); }}
                  >
                    여
                  </button>
                </div>
              </div>
              <label className="tm-auth-field">
                <span className="tm-text-label">이름<RequiredMark /></span>
                <input
                  className="tm-input tm-auth-input"
                  maxLength={40}
                  onChange={(event) => { setRealName(event.target.value); setProfileError(null); }}
                  placeholder="실명 또는 확인 가능한 이름"
                  required
                  type="text"
                  value={realName}
                />
              </label>

              <label className="tm-auth-field">
                <span className="tm-text-label">생년월일<RequiredMark /></span>
                <DatePickerTextInput
                  dateValue={formatBirthDate(birthDateDigits)}
                  inputClassName="tm-auth-input"
                  onDateChange={(value) => { setBirthDateDigits(normalizeSeparatedDigits(value)); setProfileError(null); }}
                  onTextChange={(value) => { setBirthDateDigits(normalizeSeparatedDigits(value)); setProfileError(null); }}
                  placeholder="예: 1995-01-15"
                  required
                  value={formatBirthDate(birthDateDigits)}
                />
                <span
                  className="tm-text-caption"
                  role="status"
                  style={{ color: birthDateDigits.length === 8 && !isSignupAgeEligible(birthDateDigits) ? 'var(--red700)' : 'var(--text-caption)' }}
                >
                  만 14세 이상만 가입할 수 있어요.
                </span>
              </label>

            </>
          ) : null}
        </form>

        {profileError ? (
          <Card pad={16} className="tm-auth-soft-card tm-auth-soft-card-error">
            <div className="tm-text-body-lg">프로필 정보를 확인해 주세요</div>
            <div className="tm-text-caption">{profileError}</div>
          </Card>
        ) : null}

        {error ? (
          <Card pad={16} className="tm-auth-soft-card tm-auth-soft-card-error">
            <div className="tm-text-body-lg">다시 시도해 주세요</div>
            <div className="tm-text-caption">{error}</div>
          </Card>
        ) : null}
      </div>
    </AuthFrame>
  );
}

const DUPLICATE_CHECK_FAILED_MESSAGE = '중복 확인에 실패했어요. 다시 시도해 주세요.';

function duplicateFieldError(
  status: DuplicateCheckStatus,
  messages: { taken: string; invalid: string },
): string | null {
  if (status === 'taken') return messages.taken;
  if (status === 'invalid') return messages.invalid;
  if (status === 'error') return DUPLICATE_CHECK_FAILED_MESSAGE;
  return null;
}

/** 자동 확인이라 "결과를 기다리는 중"과 "다른 값을 넣어야 함"이 갈린다. */
function duplicateHint(label: string, waiting: boolean) {
  return waiting ? `${label}을 확인하고 있어요.` : `사용할 수 있는 ${label}을 입력해 주세요.`;
}

function DuplicateHelper({ id, status, error, availableMessage }: {
  id: string;
  status: DuplicateCheckStatus;
  error: string | null;
  availableMessage: string;
}) {
  if (error) {
    return <span id={id} role="alert" className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-error">{error}</span>;
  }
  if (status === 'checking') {
    return <span id={id} role="status" className="tm-text-caption tm-auth-field-helper">확인하고 있어요.</span>;
  }
  if (status === 'available') {
    return <span id={id} className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-success">{availableMessage}</span>;
  }
  return null;
}
