'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/v1-ui/primitives';
import { useV1CheckEmail, useV1CheckNickname, useV1Register } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { saveStoredV1Session } from '@/lib/session-storage';
import { readSignupTermsAccepted } from '@/lib/signup-terms-storage';
import { AuthFrame } from './auth-page';
import { getSignupFormViewModel } from './auth.view-model';

type SignupFieldErrors = Partial<Record<'nickname' | 'email' | 'password' | 'passwordConfirm' | 'gender' | 'phone' | 'birthDate' | 'profileImage' | 'terms', string>>;
type SignupGender = 'male' | 'female';
type DuplicateCheckState = {
  status: 'idle' | 'available' | 'taken' | 'error';
  value: string;
};

export function SignupClient() {
  const model = getSignupFormViewModel();
  const router = useRouter();
  const register = useV1Register();
  const checkEmail = useV1CheckEmail();
  const checkNickname = useV1CheckNickname();
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<SignupGender | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [birthDateDigits, setBirthDateDigits] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [profileImageName, setProfileImageName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [requiredTermsAccepted, setRequiredTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});
  const [nicknameCheck, setNicknameCheck] = useState<DuplicateCheckState>({ status: 'idle', value: '' });
  const [emailCheck, setEmailCheck] = useState<DuplicateCheckState>({ status: 'idle', value: '' });

  useEffect(() => {
    setRequiredTermsAccepted(readSignupTermsAccepted());
  }, []);

  const passwordMismatch = passwordConfirm.length > 0 && password !== passwordConfirm;
  const nicknameVerified = nicknameCheck.status === 'available' && nicknameCheck.value === nickname.trim();
  const emailVerified = emailCheck.status === 'available' && emailCheck.value === email.trim().toLowerCase();
  const isBlocked = register.isPending || checkNickname.isPending || checkEmail.isPending || passwordMismatch || !requiredTermsAccepted || !gender || !nicknameVerified || !emailVerified;
  const disabledReason = !requiredTermsAccepted
    ? '필수 약관에 동의하면 가입할 수 있어요.'
    : passwordMismatch
      ? '비밀번호가 일치하지 않아요.'
      : !gender
        ? '성별을 선택해 주세요.'
        : !nicknameVerified
          ? '닉네임 중복 확인이 필요해요.'
          : !emailVerified
            ? '이메일 중복 확인이 필요해요.'
            : null;

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

  const runEmailCheck = () => {
    const nextEmail = email.trim().toLowerCase();
    setError(null);
    if (!nextEmail.includes('@')) {
      setFieldErrors((current) => ({ ...current, email: '이메일 형식을 확인해 주세요.' }));
      setEmailCheck({ status: 'idle', value: '' });
      return;
    }

    checkEmail.mutate(nextEmail, {
      onSuccess: (result) => {
        setEmailCheck({ status: result.available ? 'available' : 'taken', value: nextEmail });
        setFieldErrors((current) => ({ ...current, email: result.available ? undefined : '이미 가입된 이메일이에요.' }));
      },
      onError: () => {
        setEmailCheck({ status: 'error', value: nextEmail });
        setFieldErrors((current) => ({ ...current, email: '중복 확인에 실패했어요. 다시 시도해 주세요.' }));
      },
    });
  };

  const selectProfileImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFieldErrors((current) => ({ ...current, profileImage: undefined }));
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFieldErrors((current) => ({ ...current, profileImage: '이미지 파일만 선택할 수 있어요.' }));
      event.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setFieldErrors((current) => ({ ...current, profileImage: '프로필 사진은 2MB 이하 이미지만 선택해 주세요.' }));
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfileImageUrl(reader.result);
        setProfileImageName(file.name);
      }
    };
    reader.onerror = () => {
      setFieldErrors((current) => ({ ...current, profileImage: '이미지를 불러오지 못했어요. 다시 선택해 주세요.' }));
    };
    reader.readAsDataURL(file);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!requiredTermsAccepted) {
      setFieldErrors({ terms: '필수 약관에 동의해야 회원가입할 수 있어요.' });
      return;
    }

    if (!gender) {
      setFieldErrors({ gender: '성별을 선택해 주세요.' });
      return;
    }

    if (!nicknameVerified) {
      setFieldErrors({ nickname: '닉네임 중복 확인이 필요해요.' });
      return;
    }

    if (!emailVerified) {
      setFieldErrors({ email: '이메일 중복 확인이 필요해요.' });
      return;
    }

    if (password !== passwordConfirm) {
      setFieldErrors({ passwordConfirm: '비밀번호가 일치하지 않아요.' });
      return;
    }

    if (phoneDigits && phoneDigits.length !== 11) {
      setFieldErrors({ phone: '휴대폰 번호는 숫자 11자리로 입력해 주세요.' });
      return;
    }

    if (birthDateDigits && (birthDateDigits.length !== 8 || !isValidBirthDateDigits(birthDateDigits))) {
      setFieldErrors({ birthDate: '생년월일 형식이 맞지 않아요. 예: 1995-03-21' });
      return;
    }

    const optionalPayload = {
      ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      ...(phoneDigits ? { phone: phoneDigits } : {}),
      ...(birthDateDigits ? { birthDate: birthDateDigits } : {}),
      ...(profileImageUrl ? { profileImageUrl } : {}),
    };

    register.mutate(
      { nickname, email, password, gender, requiredTermsAccepted, ...optionalPayload },
      {
        onSuccess: (result) => {
          saveStoredV1Session(result.session);
          router.replace('/signup/complete');
        },
        onError: (nextError) => {
          const nextMessage = nextError instanceof Error ? nextError.message : '회원가입에 실패했어요.';

          if (nextError instanceof V1ApiError && nextError.statusCode === 409) {
            const duplicateField = nextError.code === 'NICKNAME_CONFLICT' ? 'nickname' : nextError.code === 'PHONE_CONFLICT' ? 'phone' : 'email';
            setFieldErrors({
              [duplicateField]: duplicateField === 'nickname'
                ? '이미 사용 중인 닉네임이에요.'
                : duplicateField === 'phone'
                  ? '이미 가입된 휴대폰 번호예요.'
                  : '이미 가입된 이메일이에요.',
            });
            setError('이미 가입된 정보예요. 기존 계정으로 로그인하거나 다른 정보를 사용해 주세요.');
            return;
          }

          if (nextError instanceof V1ApiError && nextError.code === 'VALIDATION_ERROR') {
            setError('입력 내용을 다시 확인해 주세요.');
            return;
          }

          if (nextError instanceof V1ApiError && nextError.code === 'TERMS_NOT_READY') {
            setFieldErrors({ terms: '필수 약관 문서가 아직 준비되지 않았어요.' });
            setError('필수 약관을 저장할 수 없어 가입을 완료하지 못했어요.');
            return;
          }

          setError(nextMessage);
        },
      },
    );
  };

  return (
    <AuthFrame
      topTitle="회원가입"
      backHref={model.backHref}
      fixedAction={
        <>
          <button className={`tm-btn tm-btn-lg ${isBlocked ? 'tm-btn-neutral' : 'tm-btn-primary'} tm-btn-block`} disabled={isBlocked} form="v1-signup-form" type="submit">
            {register.isPending ? '가입하는 중…' : isBlocked ? '입력을 확인해 주세요' : model.primary.label}
          </button>
          {disabledReason ? <div className="tm-text-micro tm-auth-fixed-reason">{disabledReason}</div> : null}
        </>
      }
    >
      <form className="tm-auth-body" id="v1-signup-form" onSubmit={submit}>
        <h1 className="tm-text-heading tm-auth-heading">{error || Object.keys(fieldErrors).length > 0 ? '가입 전\n확인이 필요해요' : model.title}</h1>
        <div className="tm-auth-form tm-auth-signup-form">
          <label className="tm-auth-field">
            <span className="tm-text-label">닉네임</span>
            <span className="tm-auth-field-with-action">
              <input
                className={`tm-input tm-auth-input ${fieldErrors.nickname ? 'tm-auth-input-error' : nicknameVerified ? 'tm-auth-input-success' : ''}`}
                minLength={2}
                onChange={(event) => {
                  setNickname(event.target.value);
                  setNicknameCheck({ status: 'idle', value: '' });
                  setFieldErrors((current) => ({ ...current, nickname: undefined }));
                }}
                placeholder="사용할 닉네임"
                required
                type="text"
                value={nickname}
              />
              <button className="tm-btn tm-btn-md tm-btn-neutral" disabled={checkNickname.isPending || nickname.trim().length < 2} onClick={runNicknameCheck} type="button">{checkNickname.isPending ? '확인 중' : '중복 확인'}</button>
            </span>
            {fieldErrors.nickname || nicknameVerified ? (
              <span className={`tm-text-caption tm-auth-field-helper ${fieldErrors.nickname ? 'tm-auth-field-helper-error' : 'tm-auth-field-helper-success'}`}>
                {fieldErrors.nickname ?? '사용 가능한 닉네임이에요.'}
              </span>
            ) : null}
          </label>
          <label className="tm-auth-field">
            <span className="tm-text-label">이메일</span>
            <span className="tm-auth-field-with-action">
              <input
                className={`tm-input tm-auth-input ${fieldErrors.email ? 'tm-auth-input-error' : emailVerified ? 'tm-auth-input-success' : ''}`}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setEmailCheck({ status: 'idle', value: '' });
                  setFieldErrors((current) => ({ ...current, email: undefined }));
                }}
                placeholder="you@example.com"
                required
                type="email"
                value={email}
              />
              <button className="tm-btn tm-btn-md tm-btn-neutral" disabled={checkEmail.isPending || !email.includes('@')} onClick={runEmailCheck} type="button">{checkEmail.isPending ? '확인 중' : '중복 확인'}</button>
            </span>
            {fieldErrors.email || emailVerified ? (
              <span className={`tm-text-caption tm-auth-field-helper ${fieldErrors.email ? 'tm-auth-field-helper-error' : 'tm-auth-field-helper-success'}`}>
                {fieldErrors.email ?? '사용 가능한 이메일이에요.'}
              </span>
            ) : null}
          </label>
          <div className="tm-auth-field">
            <span className="tm-text-label">성별</span>
            <div className="tm-auth-segmented" role="group" aria-label="성별 선택">
              {[
                ['male', '남성'],
                ['female', '여성'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`tm-auth-segment ${gender === value ? 'tm-auth-segment-active' : ''}`}
                  type="button"
                  onClick={() => {
                    setGender(value as SignupGender);
                    setFieldErrors((current) => ({ ...current, gender: undefined }));
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {fieldErrors.gender ? <span className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-error">{fieldErrors.gender}</span> : null}
          </div>
          <label className="tm-auth-field">
            <span className="tm-text-label">이름 <em className="tm-auth-optional">선택</em></span>
            <input
              className="tm-input tm-auth-input"
              maxLength={40}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="실명 또는 표시 이름"
              type="text"
              value={displayName}
            />
          </label>
          <label className="tm-auth-field">
            <span className="tm-text-label">휴대폰 번호 <em className="tm-auth-optional">선택</em></span>
            <input
              className={`tm-input tm-auth-input ${fieldErrors.phone ? 'tm-auth-input-error' : ''}`}
              inputMode="numeric"
              maxLength={13}
              onChange={(event) => {
                setPhoneDigits(toDigits(event.target.value, 11));
                setFieldErrors((current) => ({ ...current, phone: undefined }));
              }}
              placeholder="010-0000-0000"
              type="text"
              value={formatPhone(phoneDigits)}
            />
            {fieldErrors.phone ? <span className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-error">{fieldErrors.phone}</span> : null}
          </label>
          <label className="tm-auth-field">
            <span className="tm-text-label">생년월일 <em className="tm-auth-optional">선택</em></span>
            <input
              className={`tm-input tm-auth-input ${fieldErrors.birthDate ? 'tm-auth-input-error' : ''}`}
              inputMode="numeric"
              maxLength={10}
              onChange={(event) => {
                setBirthDateDigits(toDigits(event.target.value, 8));
                setFieldErrors((current) => ({ ...current, birthDate: undefined }));
              }}
              placeholder="예: 1995-03-21"
              type="text"
              value={formatBirthDate(birthDateDigits)}
            />
            {fieldErrors.birthDate ? <span className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-error">{fieldErrors.birthDate}</span> : null}
          </label>
          <div className="tm-auth-field">
            <span className="tm-text-label">프로필 사진 <em className="tm-auth-optional">선택</em></span>
            <div className="tm-auth-profile-upload">
              <div className="tm-auth-profile-preview" style={profileImageUrl ? { backgroundImage: `url(${profileImageUrl})` } : undefined}>
                {profileImageUrl ? null : <span className="tm-text-caption">사진</span>}
              </div>
              <div className="tm-auth-profile-upload-body">
                <label className="tm-btn tm-btn-md tm-btn-neutral">
                  {profileImageUrl ? '사진 변경' : '사진 선택'}
                  <input className="sr-only" type="file" accept="image/*" onChange={selectProfileImage} />
                </label>
                {profileImageUrl ? (
                  <button
                    className="tm-btn tm-btn-md tm-btn-ghost"
                    type="button"
                    onClick={() => {
                      setProfileImageUrl('');
                      setProfileImageName('');
                    }}
                  >
                    제거
                  </button>
                ) : null}
                <span className="tm-text-caption">{profileImageName || '이미지 1장, 2MB 이하'}</span>
              </div>
            </div>
            {fieldErrors.profileImage ? <span className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-error">{fieldErrors.profileImage}</span> : null}
          </div>
          <label className="tm-auth-field">
            <span className="tm-text-label">비밀번호</span>
            <input
              className={`tm-input tm-auth-input ${fieldErrors.password ? 'tm-auth-input-error' : ''}`}
              minLength={8}
              onChange={(event) => {
                setPassword(event.target.value);
                setFieldErrors((current) => ({ ...current, password: undefined, passwordConfirm: undefined }));
              }}
              placeholder="8자 이상"
              required
              type="password"
              value={password}
            />
            {fieldErrors.password ? <span className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-error">{fieldErrors.password}</span> : null}
          </label>
          <label className="tm-auth-field">
            <span className="tm-text-label">비밀번호 확인</span>
            <input
              className={`tm-input tm-auth-input ${fieldErrors.passwordConfirm || passwordMismatch ? 'tm-auth-input-error' : passwordConfirm.length > 0 ? 'tm-auth-input-success' : ''}`}
              minLength={8}
              onChange={(event) => {
                setPasswordConfirm(event.target.value);
                setFieldErrors((current) => ({ ...current, passwordConfirm: undefined }));
              }}
              placeholder="비밀번호 다시 입력"
              required
              type="password"
              value={passwordConfirm}
            />
            {fieldErrors.passwordConfirm || passwordMismatch ? (
              <span className="tm-text-caption tm-auth-field-helper tm-auth-field-helper-error">
                {fieldErrors.passwordConfirm ?? '비밀번호가 일치하지 않아요.'}
              </span>
            ) : null}
          </label>
        </div>
        {error ? (
          <Card pad={16} className="tm-auth-soft-card tm-auth-soft-card-error">
            <div className="tm-text-body-lg">가입을 완료하지 못했어요</div>
            <div className="tm-text-caption">{error}</div>
          </Card>
        ) : fieldErrors.terms ? (
          <Card pad={16} className="tm-auth-soft-card tm-auth-soft-card-warning">
            <div className="tm-text-body-lg">약관 확인이 필요해요</div>
            <div className="tm-text-caption">{fieldErrors.terms}</div>
          </Card>
        ) : null}
      </form>
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
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
