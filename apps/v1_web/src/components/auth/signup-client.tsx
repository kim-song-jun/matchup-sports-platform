'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, ErrorState } from '@/components/v1-ui/primitives';
import { EyeIcon, EyeOffIcon } from '@/components/v1-ui/icons';
import {
  useV1CheckEmail,
  useV1CheckNickname,
  useV1Register,
  useV1UpdateProfile,
} from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { saveStoredV1Session } from '@/lib/session-storage';
import { readSignupTermsAccepted } from '@/lib/signup-terms-storage';
import { AuthFrame } from './auth-page';

// sport step은 onboarding 위저드(/onboarding/sport)가 담당.
// 인라인 wizard는 계정 생성(nickname→email→password) + 생년월일(birthdate)까지만.
type WizardStep = 'nickname' | 'email' | 'password' | 'birthdate';
const STEP_ORDER: WizardStep[] = ['nickname', 'email', 'password', 'birthdate'];

const STEP_COPY: Record<WizardStep, { title: string; sub: string }> = {
  nickname: { title: '어떤 이름으로\n활동할까요?', sub: '경기와 팀에서 보일 이름이에요. 나중에 바꿀 수 있어요.' },
  email: { title: '이메일을\n알려주세요', sub: '로그인과 알림에 사용해요.' },
  password: { title: '비밀번호를\n설정해 주세요', sub: '8자 이상으로 안전하게 만들어 주세요.' },
  birthdate: { title: '생년월일을\n알려주세요', sub: '연령대에 맞는 매칭에 쓰여요. 건너뛰어도 괜찮아요.' },
};

type DuplicateCheckState = { status: 'idle' | 'available' | 'taken' | 'error'; value: string };

export function SignupClient() {
  const router = useRouter();
  const register = useV1Register();
  const updateProfile = useV1UpdateProfile();
  const checkEmail = useV1CheckEmail();
  const checkNickname = useV1CheckNickname();

  const [step, setStep] = useState<WizardStep>('nickname');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [birthDate, setBirthDate] = useState(''); // ISO YYYY-MM-DD from the native date picker
  const [requiredTermsAccepted, setRequiredTermsAccepted] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nicknameCheck, setNicknameCheck] = useState<DuplicateCheckState>({ status: 'idle', value: '' });
  const [emailCheck, setEmailCheck] = useState<DuplicateCheckState>({ status: 'idle', value: '' });

  useEffect(() => {
    setRequiredTermsAccepted(readSignupTermsAccepted());
  }, []);

  const stepIndex = STEP_ORDER.indexOf(step);
  const copy = STEP_COPY[step];
  const today = new Date().toISOString().slice(0, 10);

  const nicknameVerified = nicknameCheck.status === 'available' && nicknameCheck.value === nickname.trim();
  const emailVerified = emailCheck.status === 'available' && emailCheck.value === email.trim().toLowerCase();
  const passwordMismatch = passwordConfirm.length > 0 && password !== passwordConfirm;
  const passwordMatch = passwordConfirm.length > 0 && password === passwordConfirm;
  const passwordTooShort = password.length > 0 && password.length < 8;
  const passwordLongEnough = password.length >= 8;
  // saving은 생년월일 저장 진행 중 표시에 사용
  const saving = updateProfile.isPending;

  const runNicknameCheck = () => {
    const next = nickname.trim();
    setFieldError(null);
    if (next.length < 2) {
      setFieldError('닉네임은 2자 이상 입력해 주세요.');
      setNicknameCheck({ status: 'idle', value: '' });
      return;
    }
    checkNickname.mutate(next, {
      onSuccess: (result) => {
        setNicknameCheck({ status: result.available ? 'available' : 'taken', value: next });
        setFieldError(result.available ? null : '이미 사용 중인 닉네임이에요.');
      },
      onError: () => {
        setNicknameCheck({ status: 'error', value: next });
        setFieldError('중복 확인에 실패했어요. 다시 시도해 주세요.');
      },
    });
  };

  const runEmailCheck = () => {
    const next = email.trim().toLowerCase();
    setFieldError(null);
    if (!next.includes('@')) {
      setFieldError('이메일 형식을 확인해 주세요.');
      setEmailCheck({ status: 'idle', value: '' });
      return;
    }
    checkEmail.mutate(next, {
      onSuccess: (result) => {
        setEmailCheck({ status: result.available ? 'available' : 'taken', value: next });
        setFieldError(result.available ? null : '이미 가입된 이메일이에요.');
      },
      onError: () => {
        setEmailCheck({ status: 'error', value: next });
        setFieldError('중복 확인에 실패했어요. 다시 시도해 주세요.');
      },
    });
  };

  const goBack = () => {
    setFieldError(null);
    setError(null);
    if (step === 'nickname') {
      router.push('/terms');
      return;
    }
    if (step === 'email') return setStep('nickname');
    if (step === 'password') return setStep('email');
    // birthdate: 계정이 이미 생성된 이후라 계정 단계로 돌아가지 않는다.
  };

  const submitAccount = () => {
    setError(null);
    register.mutate(
      { nickname: nickname.trim(), email: email.trim().toLowerCase(), password, requiredTermsAccepted },
      {
        onSuccess: (result) => {
          saveStoredV1Session(result.session);
          setStep('birthdate');
        },
        onError: (nextError) => {
          if (nextError instanceof V1ApiError && nextError.statusCode === 409) {
            if (nextError.code === 'NICKNAME_CONFLICT') {
              setNicknameCheck({ status: 'taken', value: nickname.trim() });
              setStep('nickname');
              setFieldError('이미 사용 중인 닉네임이에요.');
              return;
            }
            setEmailCheck({ status: 'taken', value: email.trim().toLowerCase() });
            setStep('email');
            setFieldError('이미 가입된 이메일이에요.');
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
        },
      },
    );
  };

  // 생년월일(선택)을 저장한 뒤 onboarding 위저드로 이동.
  // 종목·실력·지역 수집과 onboardingStatus 'completed' 확정은 위저드(/onboarding/sport)가 담당한다.
  const goToOnboarding = async () => {
    setError(null);
    try {
      if (birthDate) {
        await updateProfile.mutateAsync({
          displayName: nickname.trim(),
          nickname: nickname.trim(),
          email: email.trim().toLowerCase(),
          visibilityStatus: 'public',
          birthDate: birthDate.replace(/-/g, ''),
        });
      }
      router.replace('/onboarding/sport');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '저장에 실패했어요. 다시 시도해 주세요.');
    }
  };

  const primary: { label: string; disabled: boolean; onClick: () => void } =
    step === 'nickname'
      ? { label: '다음', disabled: checkNickname.isPending || !nicknameVerified, onClick: () => setStep('email') }
      : step === 'email'
        ? { label: '다음', disabled: checkEmail.isPending || !emailVerified, onClick: () => setStep('password') }
        : step === 'password'
          ? {
              label: register.isPending ? '가입하는 중…' : '가입하고 계속',
              disabled: register.isPending || !passwordLongEnough || !passwordMatch,
              onClick: submitAccount,
            }
          : {
              // birthdate
              label: saving ? '저장 중…' : '다음',
              disabled: saving,
              onClick: goToOnboarding,
            };

  const skip =
    step === 'birthdate'
      ? { label: '건너뛰기', onClick: () => { setBirthDate(''); void goToOnboarding(); } }
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
          {skip ? (
            <button className="tm-btn tm-btn-md tm-btn-ghost tm-signup-skip" type="button" onClick={skip.onClick} disabled={saving}>
              {skip.label}
            </button>
          ) : null}
        </>
      }
    >
      <div className="tm-auth-body">
        <div className="tm-signup-progress" aria-hidden="true">
          {STEP_ORDER.map((value, index) => (
            <span key={value} data-on={index <= stepIndex} />
          ))}
        </div>
        {step !== 'birthdate' ? (
          <button className="tm-btn tm-btn-sm tm-btn-ghost tm-signup-back" type="button" onClick={goBack} aria-label="이전 단계">← 이전</button>
        ) : null}
        <div className="tm-signup-hero">
          <h1 className="tm-text-heading tm-auth-heading">{copy.title}</h1>
          <p className="tm-text-body tm-auth-sub">{copy.sub}</p>
        </div>

        <form className="tm-auth-form tm-auth-signup-form" onSubmit={(event: FormEvent) => event.preventDefault()}>
          {step === 'nickname' ? (
            <label className="tm-auth-field">
              <span className="tm-text-label">닉네임</span>
              <span className="tm-auth-field-with-action">
                <input
                  className={`tm-input tm-auth-input ${fieldError ? 'tm-auth-input-error' : nicknameVerified ? 'tm-auth-input-success' : ''}`}
                  minLength={2}
                  autoFocus
                  onChange={(event) => {
                    setNickname(event.target.value);
                    setNicknameCheck({ status: 'idle', value: '' });
                    setFieldError(null);
                  }}
                  placeholder="사용할 닉네임"
                  type="text"
                  value={nickname}
                />
                <button className="tm-btn tm-btn-md tm-btn-neutral" disabled={checkNickname.isPending || nickname.trim().length < 2} onClick={runNicknameCheck} type="button">{checkNickname.isPending ? '확인 중' : '중복 확인'}</button>
              </span>
              {fieldError || nicknameVerified ? (
                <span className={`tm-text-caption tm-auth-field-helper ${fieldError ? 'tm-auth-field-helper-error' : 'tm-auth-field-helper-success'}`}>
                  {fieldError ?? '사용 가능한 닉네임이에요.'}
                </span>
              ) : null}
            </label>
          ) : null}

          {step === 'email' ? (
            <label className="tm-auth-field">
              <span className="tm-text-label">이메일</span>
              <span className="tm-auth-field-with-action">
                <input
                  className={`tm-input tm-auth-input ${fieldError ? 'tm-auth-input-error' : emailVerified ? 'tm-auth-input-success' : ''}`}
                  autoFocus
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setEmailCheck({ status: 'idle', value: '' });
                    setFieldError(null);
                  }}
                  placeholder="예: me@email.com"
                  type="email"
                  value={email}
                />
                <button className="tm-btn tm-btn-md tm-btn-neutral" disabled={checkEmail.isPending || !email.includes('@')} onClick={runEmailCheck} type="button">{checkEmail.isPending ? '확인 중' : '중복 확인'}</button>
              </span>
              {fieldError || emailVerified ? (
                <span className={`tm-text-caption tm-auth-field-helper ${fieldError ? 'tm-auth-field-helper-error' : 'tm-auth-field-helper-success'}`}>
                  {fieldError ?? '사용 가능한 이메일이에요.'}
                </span>
              ) : null}
            </label>
          ) : null}

          {step === 'password' ? (
            <>
              <label className="tm-auth-field">
                <span className="tm-text-label">비밀번호</span>
                <span className="tm-auth-password-field">
                  <input
                    className={`tm-input tm-auth-input ${passwordTooShort ? 'tm-auth-input-error' : passwordLongEnough ? 'tm-auth-input-success' : ''}`}
                    minLength={8}
                    autoFocus
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="8자 이상"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                  />
                  <button className="tm-auth-password-toggle" type="button" aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} aria-pressed={showPassword} onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? <EyeOffIcon size={20} strokeWidth={1.8} /> : <EyeIcon size={20} strokeWidth={1.8} />}
                  </button>
                </span>
                {passwordTooShort ? (
                  <span className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-error">8자 이상 입력해 주세요.</span>
                ) : passwordLongEnough ? (
                  <span className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-success">사용할 수 있는 비밀번호예요.</span>
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
                  />
                  <button className="tm-auth-password-toggle" type="button" aria-label={showPasswordConfirm ? '비밀번호 숨기기' : '비밀번호 보기'} aria-pressed={showPasswordConfirm} onClick={() => setShowPasswordConfirm((v) => !v)}>
                    {showPasswordConfirm ? <EyeOffIcon size={20} strokeWidth={1.8} /> : <EyeIcon size={20} strokeWidth={1.8} />}
                  </button>
                </span>
                {passwordMismatch ? (
                  <span className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-error">비밀번호가 일치하지 않아요.</span>
                ) : passwordMatch ? (
                  <span className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-success">비밀번호가 일치해요.</span>
                ) : null}
              </label>
            </>
          ) : null}

          {step === 'birthdate' ? (
            <label className="tm-auth-field">
              <span className="tm-text-label">생년월일 <em className="tm-auth-optional">선택</em></span>
              <input
                className="tm-input tm-auth-input"
                type="date"
                max={today}
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
              />
            </label>
          ) : null}
        </form>

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
