'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { Card, DatePickerTextInput } from '@/components/v1-ui/primitives';
import { ChevronLeftIcon, EyeIcon, EyeOffIcon } from '@/components/v1-ui/icons';
import { PhoneVerificationCard } from '@/components/auth/phone-verification/phone-verification-card';
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
import {
  clearSignupTermsDocumentIds,
  readSignupTermsDocumentIds,
} from '@/lib/signup-terms-storage';
import { AuthFrame } from './auth-page';
import {
  formatBirthDate,
  formatPhone,
  getSignupProfileIssue,
  isCompleteSignupProfile,
  normalizeSeparatedDigits,
  normalizeSignupDisplayName,
  SIGNUP_PROFILE_ERROR_MESSAGES,
} from './signup-profile-validation';

type WizardStep = 'account' | 'verify' | 'profile';
type DuplicateCheckState = { status: 'idle' | 'available' | 'taken' | 'error'; value: string };

const STEP_ORDER: WizardStep[] = ['account', 'verify', 'profile'];

const STEP_COPY: Record<WizardStep, { title: string; sub: ReactNode }> = {
  account: {
    title: '가입 정보를\n확인해 주세요',
    sub: '닉네임과 이메일은 먼저 중복 확인이 필요해요. 비밀번호까지 입력하면 본인인증 단계로 넘어가요.',
  },
  verify: {
    title: '본인인증을\n먼저 해주세요',
    sub: '이 단계만 통과하면 나머지는 실패 없이 끝나요. 인증이 끝나면 자동으로 다음으로 넘어가요.',
  },
  profile: {
    title: '프로필을\n완성해 주세요',
    sub: <>대회 참여 시 이름과 생년월일이 <span style={{ whiteSpace: 'nowrap' }}>본인 확인에 쓰여요.</span></>,
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
  const [profileImageName, setProfileImageName] = useState('');
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false);
  const [realName, setRealName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneProofToken, setPhoneProofToken] = useState<string | null>(null);
  const [birthDateDigits, setBirthDateDigits] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [acceptedTermsDocumentIds, setAcceptedTermsDocumentIds] = useState<string[]>([]);
  const [termsReady, setTermsReady] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nicknameCheck, setNicknameCheck] = useState<DuplicateCheckState>({ status: 'idle', value: '' });
  const [emailCheck, setEmailCheck] = useState<DuplicateCheckState>({ status: 'idle', value: '' });
  /** 인증 완료 → 다음 단계 자동 이동 타이머. 언마운트 시 정리해 사라진 화면에 setState 하지 않는다. */
  const advanceTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
    },
    [],
  );

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
  const normalizedNickname = nickname.trim();
  const normalizedEmail = email.trim().toLowerCase();
  const nicknameVerified = nicknameCheck.status === 'available' && nicknameCheck.value === normalizedNickname;
  const emailVerified = emailCheck.status === 'available' && emailCheck.value === normalizedEmail;
  const passwordMismatch = passwordConfirm.length > 0 && password !== passwordConfirm;
  const passwordMatch = passwordConfirm.length > 0 && password === passwordConfirm;
  const passwordTooShort = password.length > 0 && password.length < 8;
  const passwordLongEnough = password.length >= 8;
  const accountReady = nicknameVerified && emailVerified && passwordLongEnough && passwordMatch;
  // normalizeSeparatedDigits 는 하이픈·공백만 걷어내므로 'ROLLING10ab' 같은 값도 길이 11이 된다.
  // 길이만 보고 인증을 열면 문자가 섞인 값으로 유료 SMS 발송을 시도하게 되므로 숫자 11자리만 허용한다.
  const isSendablePhone = /^\d{11}$/.test(phoneDigits);
  const profileDraft = { displayName: realName, phone: phoneDigits, birthDate: birthDateDigits, gender };
  const profileIssue = getSignupProfileIssue(profileDraft);
  const profileBlocked = register.isPending || updateProfile.isPending || uploadImages.isPending || uploadingProfileImage || profileIssue !== null;

  const runNicknameCheck = () => {
    setNicknameError(null);
    setError(null);
    if (normalizedNickname.length < 2) {
      setNicknameError('닉네임은 2자 이상 입력해 주세요.');
      setNicknameCheck({ status: 'idle', value: '' });
      return;
    }

    checkNickname.mutate(normalizedNickname, {
      onSuccess: (result) => {
        setNicknameCheck({ status: result.available ? 'available' : 'taken', value: normalizedNickname });
        setNicknameError(result.available ? null : '이미 사용 중인 닉네임이에요.');
      },
      onError: () => {
        setNicknameCheck({ status: 'error', value: normalizedNickname });
        setNicknameError('중복 확인에 실패했어요. 다시 시도해 주세요.');
      },
    });
  };

  const runEmailCheck = () => {
    setEmailError(null);
    setError(null);
    if (!normalizedEmail.includes('@')) {
      setEmailError('이메일 형식을 확인해 주세요.');
      setEmailCheck({ status: 'idle', value: '' });
      return;
    }

    checkEmail.mutate(normalizedEmail, {
      onSuccess: (result) => {
        setEmailCheck({ status: result.available ? 'available' : 'taken', value: normalizedEmail });
        setEmailError(result.available ? null : '이미 가입된 이메일이에요.');
      },
      onError: () => {
        setEmailCheck({ status: 'error', value: normalizedEmail });
        setEmailError('중복 확인에 실패했어요. 다시 시도해 주세요.');
      },
    });
  };

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
      setProfileImageName(file.name);
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
    // 인증 직후 900ms 안에 '이전'을 누르면, 예약된 자동 이동이 나중에 발동해 사용자가
    // 되돌아온 단계를 덮어쓴다. 단계를 바꾸기 전에 예약을 취소한다.
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    if (step === 'account') {
      router.push('/terms?mode=signup');
      return;
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
          setNicknameCheck({ status: 'taken', value: normalizedNickname });
          setStep('account');
          setNicknameError('이미 사용 중인 닉네임이에요.');
          return;
        }
        if (nextError.code === 'PHONE_CONFLICT') {
          setProfileError('이미 가입된 휴대폰 번호예요.');
          return;
        }
        setEmailCheck({ status: 'taken', value: normalizedEmail });
        setStep('account');
        setEmailError('이미 가입된 이메일이에요.');
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
      setError(nextError instanceof Error ? nextError.message : '회원가입에 실패했어요.');
    }
  };
  const primary =
    step === 'account'
      ? {
          label: '본인인증 하기',
          disabled: checkNickname.isPending || checkEmail.isPending || !accountReady,
          onClick: goVerify,
        }
      : step === 'verify'
      ? {
          // 인증 성공 시 자동으로 넘어가므로 이 버튼은 되돌아온 사용자를 위한 경로다.
          label: '다음',
          disabled: !phoneProofToken,
          onClick: goProfile,
        }
      : {
          label: register.isPending ? '가입하는 중...' : '가입하고 계속',
          disabled: profileBlocked,
          onClick: () => { void submitAccount(); },
        };

  const disabledHint: string | null = primary.disabled
    ? step === 'account'
      ? !nicknameVerified
        ? '닉네임 중복 확인 후 다음으로 넘어갈 수 있어요.'
        : !emailVerified
          ? '이메일 중복 확인 후 다음으로 넘어갈 수 있어요.'
          : !passwordLongEnough
            ? '비밀번호는 8자 이상이어야 해요.'
            : '비밀번호 확인이 일치해야 해요.'
      : step === 'verify'
        ? isSendablePhone
          ? '인증번호 확인까지 마치면 다음으로 넘어가요.'
          : '휴대폰 번호를 숫자 11자리로 입력해 주세요.'
        : profileIssue
          ? SIGNUP_PROFILE_ERROR_MESSAGES[profileIssue]
          : uploadingProfileImage
          ? '프로필 사진을 업로드하는 중이에요.'
          : null
    : null;

  return (
    <AuthFrame
      // 이 화면만 상단바 없이 렌더돼 회원가입을 시작하면 빠져나갈 컨트롤이 없었다.
      // 뒤로가기 목적지는 이미 getSignupFormViewModel().backHref 로 선언돼 있던 '/terms?mode=signup'
      // (직전 단계)를 그대로 쓴다 — 약관 화면에 다시 /login 으로 나가는 뒤로가기가 있어
      // /signup → /terms → /login 으로 로그인 화면까지 이어진다.
      topTitle="회원가입"
      backHref="/terms?mode=signup"
      fixedAction={
        <>
          <button
            className={`tm-btn tm-btn-lg ${primary.disabled ? 'tm-btn-neutral' : 'tm-btn-primary'} tm-btn-block`}
            disabled={primary.disabled}
            type="button"
            onClick={primary.onClick}
          >
            {primary.label}
          </button>
          {disabledHint ? (
            <p className="tm-text-caption" role="status" style={{ margin: '6px 0 0', textAlign: 'center' }}>
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
        {/* 첫 단계에서 goBack() 은 상단 뒤로가기와 똑같이 /terms 로 나간다 — 같은 동작을 두 번
            보여주지 않도록, 이 인라인 버튼은 의미가 갈리는 두 번째 단계(프로필 → 계정)에서만 낸다. */}
        {step !== 'account' ? (
          <button className="tm-btn tm-btn-sm tm-btn-ghost tm-signup-back" type="button" onClick={goBack} aria-label="이전 단계">
            <ChevronLeftIcon size={18} strokeWidth={2.2} />이전
          </button>
        ) : null}
        <div className="tm-signup-hero">
          <h1 className="tm-text-heading tm-auth-heading">{copy.title}</h1>
          <p className="tm-text-body tm-auth-sub">{copy.sub}</p>
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
                <span className="tm-auth-field-with-action">
                  <input
                    className={`tm-input tm-auth-input ${nicknameError ? 'tm-auth-input-error' : nicknameVerified ? 'tm-auth-input-success' : ''}`}
                    minLength={2}
                    maxLength={40}
                    autoFocus
                    onChange={(event) => {
                      setNickname(event.target.value);
                      setNicknameCheck({ status: 'idle', value: '' });
                      setNicknameError(null);
                    }}
                    placeholder="활동 닉네임"
                    type="text"
                    value={nickname}
                    aria-invalid={nicknameError ? true : undefined}
                    aria-describedby={nicknameError || nicknameVerified ? 'signup-nickname-helper' : undefined}
                  />
                  <button className="tm-btn tm-btn-md tm-btn-neutral" disabled={checkNickname.isPending || normalizedNickname.length < 2} onClick={runNicknameCheck} type="button">
                    {checkNickname.isPending ? '확인 중' : '중복 확인'}
                  </button>
                </span>
                {nicknameError || nicknameVerified ? (
                  <span
                    id="signup-nickname-helper"
                    role={nicknameError ? 'alert' : undefined}
                    className={`tm-text-caption tm-auth-field-helper ${nicknameError ? 'tm-auth-field-helper-error' : 'tm-auth-field-helper-success'}`}
                  >
                    {nicknameError ?? '사용 가능한 닉네임이에요.'}
                  </span>
                ) : null}
              </label>

              <label className="tm-auth-field">
                <span className="tm-text-label">이메일<RequiredMark /></span>
                <span className="tm-auth-field-with-action">
                  <input
                    className={`tm-input tm-auth-input ${emailError ? 'tm-auth-input-error' : emailVerified ? 'tm-auth-input-success' : ''}`}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setEmailCheck({ status: 'idle', value: '' });
                      setEmailError(null);
                    }}
                    placeholder="예: name@email.com"
                    type="email"
                    value={email}
                    aria-invalid={emailError ? true : undefined}
                    aria-describedby={emailError || emailVerified ? 'signup-email-helper' : undefined}
                  />
                  <button className="tm-btn tm-btn-md tm-btn-neutral" disabled={checkEmail.isPending || !normalizedEmail.includes('@')} onClick={runEmailCheck} type="button">
                    {checkEmail.isPending ? '확인 중' : '중복 확인'}
                  </button>
                </span>
                {emailError || emailVerified ? (
                  <span
                    id="signup-email-helper"
                    role={emailError ? 'alert' : undefined}
                    className={`tm-text-caption tm-auth-field-helper ${emailError ? 'tm-auth-field-helper-error' : 'tm-auth-field-helper-success'}`}
                  >
                    {emailError ?? '사용 가능한 이메일이에요.'}
                  </span>
                ) : null}
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
                <PhoneVerificationCard
                  mode="public"
                  phone={phoneDigits}
                  onVerified={handlePhoneVerified}
                  surface="inset"
                />
              ) : null}

              {phoneProofToken ? (
                <div
                  className="tm-auth-inset"
                  role="status"
                  style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--blue50)' }}
                >
                  <span
                    aria-hidden="true"
                    style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--blue500)', display: 'inline-block' }}
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
              <section className="tm-auth-profile-upload">
                <label className="tm-auth-profile-preview-trigger" aria-label="프로필 사진 선택">
                  <div className="tm-auth-profile-preview" style={profileImageUrl ? { backgroundImage: cssUrl(profileImageUrl) } : undefined}>
                    {profileImageUrl ? null : <span className="tm-text-caption">{initials(realName || normalizedNickname)}</span>}
                  </div>
                  {profileImageUrl ? null : (
                    <span className="tm-auth-profile-preview-badge" aria-hidden="true">
                      <Camera size={13} strokeWidth={2.4} />
                    </span>
                  )}
                  <input className="sr-only" type="file" accept="image/*" onChange={selectProfileImage} disabled={uploadingProfileImage} />
                </label>
                <div>
                  <div className="tm-text-label">프로필 사진 <em className="tm-auth-optional">선택</em></div>
                  <div className="tm-auth-profile-upload-body" style={{ marginTop: 12 }}>
                    <label className="tm-btn tm-btn-md tm-btn-neutral">
                      {uploadingProfileImage ? '올리는 중' : profileImageUrl ? '사진 변경' : '사진 선택'}
                      <input className="sr-only" type="file" accept="image/*" onChange={selectProfileImage} disabled={uploadingProfileImage} />
                    </label>
                    {profileImageUrl ? (
                      <button className="tm-btn tm-btn-md tm-btn-ghost" type="button" disabled={uploadingProfileImage} onClick={() => { setProfileImageUrl(''); setProfileImageFile(null); setProfileImageName(''); }}>
                        제거
                      </button>
                    ) : null}
                  </div>
                  <div className="tm-text-caption" style={{ marginTop: 8 }}>{profileImageName || '이미지 1장 — 큰 사진은 자동으로 줄여 올려요'}</div>
                </div>
              </section>


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

function initials(value: string) {
  return value.trim().slice(0, 1) || 'T';
}
