'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, DatePickerTextInput } from '@/components/v1-ui/primitives';
import { ChevronLeftIcon, EyeIcon, EyeOffIcon } from '@/components/v1-ui/icons';
import {
  useV1CheckEmail,
  useV1CheckNickname,
  useV1Register,
  useV1UpdateProfile,
  useV1UploadImages,
} from '@/hooks/use-v1-api';
import { cssUrl } from '@/lib/assets';
import { V1ApiError } from '@/lib/api-client';
import { saveStoredV1Session } from '@/lib/session-storage';
import { readSignupTermsAccepted } from '@/lib/signup-terms-storage';
import { AuthFrame } from './auth-page';

type WizardStep = 'account' | 'profile';
type DuplicateCheckState = { status: 'idle' | 'available' | 'taken' | 'error'; value: string };

const STEP_ORDER: WizardStep[] = ['account', 'profile'];

const STEP_COPY: Record<WizardStep, { title: string; sub: string }> = {
  account: {
    title: '가입 정보를\n확인해 주세요',
    sub: '닉네임과 이메일은 먼저 중복 확인이 필요해요. 비밀번호까지 입력하면 프로필 단계로 넘어가요.',
  },
  profile: {
    title: '프로필을\n완성해 주세요',
    sub: '대회 참여 시 이름, 휴대폰 번호, 생년월일은 본인 확인에 필요해요.',
  },
};

const onboardingDraftKey = 'teameet.v1.onboardingDraft';

export function SignupClient() {
  const router = useRouter();
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
  const [displayName, setDisplayName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [birthDateDigits, setBirthDateDigits] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [requiredTermsAccepted, setRequiredTermsAccepted] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nicknameCheck, setNicknameCheck] = useState<DuplicateCheckState>({ status: 'idle', value: '' });
  const [emailCheck, setEmailCheck] = useState<DuplicateCheckState>({ status: 'idle', value: '' });

  useEffect(() => {
    setRequiredTermsAccepted(readSignupTermsAccepted());
  }, []);

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
  const profileBlocked = register.isPending || updateProfile.isPending || uploadImages.isPending || uploadingProfileImage;

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

    if (file.size > 2 * 1024 * 1024) {
      setProfileError('프로필 사진은 2MB 이하 이미지로 선택해 주세요.');
      event.target.value = '';
      return;
    }

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
    if (step === 'account') {
      router.push('/terms');
      return;
    }
    setStep('account');
  };

  const goProfile = () => {
    if (!accountReady) return;
    setError(null);
    setProfileError(null);
    if (!displayName.trim()) {
      setDisplayName(normalizedNickname);
    }
    setStep('profile');
  };

  const submitAccount = async () => {
    // 로딩 중 재클릭 시 중복 제출 방지 — isPending 은 disabled 속성과 동일하게 리렌더
    // 이후에나 반영되는 값이라 동시 클릭까지 막지는 못하지만, 스피너가 보이는 동안의
    // 재클릭은 막는다(동시 클릭 방지가 필요하면 ref 락을 따로 둔다).
    if (profileBlocked) return;
    setError(null);
    setProfileError(null);

    if (phoneDigits && phoneDigits.length !== 11) {
      setProfileError('휴대폰 번호는 숫자 11자리로 입력해 주세요.');
      return;
    }

    if (birthDateDigits && (birthDateDigits.length !== 8 || !isValidBirthDateDigits(birthDateDigits))) {
      setProfileError('생년월일은 올바른 날짜로 입력해 주세요. 예: 1995-01-15');
      return;
    }

    const missingTournamentFields = [
      !displayName.trim() ? '이름' : null,
      !phoneDigits ? '휴대폰 번호' : null,
      !birthDateDigits ? '생년월일' : null,
    ].filter(Boolean);

    if (missingTournamentFields.length > 0) {
      const confirmed = window.confirm(
        `대회 참여 시 ${missingTournamentFields.join(', ')}은(는) 개인 확인을 위해 꼭 필요해요.\n지금 입력하지 않으면 대회 신청 전에 다시 입력해야 해요. 그래도 가입을 계속할까요?`,
      );
      if (!confirmed) return;
    }

    try {
      const result = await register.mutateAsync({
        nickname: normalizedNickname,
        displayName: displayName.trim() || normalizedNickname,
        email: normalizedEmail,
        password,
        phone: phoneDigits || undefined,
        birthDate: birthDateDigits || undefined,
        gender: gender || undefined,
        requiredTermsAccepted,
      });

      saveStoredV1Session(result.session);

      if (profileImageFile) {
        const uploadResult = await uploadImages.mutateAsync([profileImageFile]);
        const uploadedUrl = uploadResult.urls[0];
        if (!uploadedUrl) {
          throw new Error('프로필 사진 업로드 응답에 이미지 URL이 없어요.');
        }

        await updateProfile.mutateAsync({
          displayName: displayName.trim() || normalizedNickname,
          nickname: normalizedNickname,
          email: normalizedEmail,
          profileImageUrl: uploadedUrl,
          phone: phoneDigits || null,
          birthDate: birthDateDigits || null,
        });
      }

      window.sessionStorage.removeItem(onboardingDraftKey);
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
      if (nextError instanceof V1ApiError && nextError.code === 'TERMS_NOT_READY') {
        setError('필수 약관 문서가 아직 준비되지 않았어요.');
        return;
      }
      if (nextError instanceof V1ApiError && (nextError.code === 'TERMS_REQUIRED' || !requiredTermsAccepted)) {
        router.replace('/terms');
        return;
      }
      setError(nextError instanceof Error ? nextError.message : '회원가입에 실패했어요.');
    }
  };
  const primary =
    step === 'account'
      ? {
          label: '프로필 입력하기',
          disabled: checkNickname.isPending || checkEmail.isPending || !accountReady,
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
      : uploadingProfileImage
        ? '프로필 사진을 업로드하는 중이에요.'
        : null
    : null;

  return (
    <AuthFrame
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
        <button className="tm-btn tm-btn-sm tm-btn-ghost tm-signup-back" type="button" onClick={goBack} aria-label="이전 단계">
          <ChevronLeftIcon size={18} strokeWidth={2.2} />이전
        </button>
        <div className="tm-signup-hero">
          <h1 className="tm-text-heading tm-auth-heading">{copy.title}</h1>
          <p className="tm-text-body tm-auth-sub">{copy.sub}</p>
        </div>

        <form className="tm-auth-form tm-auth-signup-form" onSubmit={(event: FormEvent) => event.preventDefault()}>
          {step === 'account' ? (
            <>
              <label className="tm-auth-field">
                <span className="tm-text-label">닉네임</span>
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
                <span className="tm-text-label">이메일</span>
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
                <span className="tm-text-label">비밀번호</span>
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
                <span className="tm-text-label">비밀번호 확인</span>
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

          {step === 'profile' ? (
            <>
              <section className="tm-auth-soft-card" style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 14, alignItems: 'center' }}>
                <div className="tm-auth-profile-preview" style={profileImageUrl ? { backgroundImage: cssUrl(profileImageUrl) } : undefined}>
                  {profileImageUrl ? null : <span className="tm-text-caption">{initials(displayName || normalizedNickname)}</span>}
                </div>
                <div>
                  <div className="tm-text-label">프로필 사진 <em className="tm-auth-optional">선택</em></div>
                  <div className="tm-auth-profile-upload-body" style={{ marginTop: 10 }}>
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
                  <div className="tm-text-caption" style={{ marginTop: 6 }}>{profileImageName || '이미지 1장, 2MB 이하'}</div>
                </div>
              </section>

              <label className="tm-auth-field">
                <span className="tm-text-label">이름 <em className="tm-auth-optional">(선택)</em></span>
                <input
                  className="tm-input tm-auth-input"
                  maxLength={40}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="실명 또는 확인 가능한 이름"
                  type="text"
                  value={displayName}
                />
              </label>

              <label className="tm-auth-field">
                <span className="tm-text-label">휴대폰 번호 <em className="tm-auth-optional">(선택)</em></span>
                <input
                  className="tm-input tm-auth-input"
                  inputMode="numeric"
                  maxLength={13}
                  onChange={(event) => setPhoneDigits(toDigits(event.target.value, 11))}
                  placeholder="010-0000-0000"
                  value={formatPhone(phoneDigits)}
                />
              </label>

              <label className="tm-auth-field">
                <span className="tm-text-label">생년월일 <em className="tm-auth-optional">(선택)</em></span>
                <DatePickerTextInput
                  dateValue={formatBirthDate(birthDateDigits)}
                  inputClassName="tm-auth-input"
                  onDateChange={(value) => setBirthDateDigits(toDigits(value, 8))}
                  onTextChange={(value) => setBirthDateDigits(toDigits(value, 8))}
                  placeholder="예: 1995-01-15"
                  value={formatBirthDate(birthDateDigits)}
                />
              </label>

              <div className="tm-auth-field">
                <span className="tm-text-label" id="signup-gender-label">
                  성별 <em className="tm-auth-optional">(선택)</em>
                </span>
                <div
                  className="tm-auth-segmented"
                  role="radiogroup"
                  aria-labelledby="signup-gender-label"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={gender === 'male'}
                    className={`tm-auth-segment ${gender === 'male' ? 'tm-auth-segment-active' : ''}`}
                    style={{ minHeight: 44 }}
                    onClick={() => setGender((prev) => (prev === 'male' ? '' : 'male'))}
                  >
                    남성
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={gender === 'female'}
                    className={`tm-auth-segment ${gender === 'female' ? 'tm-auth-segment-active' : ''}`}
                    style={{ minHeight: 44 }}
                    onClick={() => setGender((prev) => (prev === 'female' ? '' : 'female'))}
                  >
                    여성
                  </button>
                </div>
              </div>

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

function toDigits(value: string, maxLength: number) {
  return value.replace(/\D/g, '').slice(0, maxLength);
}

function formatPhone(value: string) {
  if (value.length <= 3) return value;
  if (value.length <= 7) return `${value.slice(0, 3)}-${value.slice(3)}`;
  return `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}`;
}

function formatBirthDate(value: string) {
  if (value.length <= 4) return value;
  if (value.length <= 6) return `${value.slice(0, 4)}-${value.slice(4)}`;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`;
}

function isValidBirthDateDigits(value: string) {
  if (value.length !== 8) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function initials(value: string) {
  return value.trim().slice(0, 1) || 'T';
}
