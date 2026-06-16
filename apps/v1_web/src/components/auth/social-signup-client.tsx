'use client';

import { ChangeEvent, FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/v1-ui/primitives';
import { useV1CheckNickname, useV1CompleteSocialProfile } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { saveStoredV1Session } from '@/lib/session-storage';
import { AuthFrame } from './auth-page';

type SocialSignupGender = 'male' | 'female';
type FieldErrors = Partial<Record<'nickname' | 'gender' | 'phone' | 'birthDate' | 'profileImage', string>>;
type DuplicateCheckState = {
  status: 'idle' | 'available' | 'taken' | 'error';
  value: string;
};

export function SocialSignupClient() {
  const router = useRouter();
  const completeProfile = useV1CompleteSocialProfile();
  const checkNickname = useV1CheckNickname();
  const [nickname, setNickname] = useState('');
  const [gender, setGender] = useState<SocialSignupGender | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [birthDateDigits, setBirthDateDigits] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [profileImageName, setProfileImageName] = useState('');
  const [nicknameCheck, setNicknameCheck] = useState<DuplicateCheckState>({ status: 'idle', value: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);

  const nicknameVerified = nicknameCheck.status === 'available' && nicknameCheck.value === nickname.trim();
  const isBlocked = completeProfile.isPending || checkNickname.isPending || !gender || !nicknameVerified;
  const disabledReason = !gender
      ? '성별을 선택해 주세요.'
      : !nicknameVerified
        ? '닉네임 중복 확인이 필요해요.'
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

    if (!gender) {
      setFieldErrors({ gender: '성별을 선택해 주세요.' });
      return;
    }

    if (!nicknameVerified) {
      setFieldErrors({ nickname: '닉네임 중복 확인이 필요해요.' });
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

    completeProfile.mutate(
      { nickname, gender, ...optionalPayload },
      {
        onSuccess: (result) => {
          saveStoredV1Session(result.session);
          router.replace(result.next?.route ?? '/onboarding/sport');
        },
        onError: (nextError) => {
          if (nextError instanceof V1ApiError && nextError.code === 'NICKNAME_CONFLICT') {
            setFieldErrors({ nickname: '이미 사용 중인 닉네임이에요.' });
            setError('다른 닉네임으로 다시 시도해 주세요.');
            return;
          }

          if (nextError instanceof V1ApiError && nextError.code === 'PHONE_CONFLICT') {
            setFieldErrors({ phone: '이미 가입된 휴대폰 번호예요.' });
            setError('이미 가입된 정보가 있어요. 기존 계정으로 로그인하거나 다른 휴대폰 번호를 사용해 주세요.');
            return;
          }

          if (nextError instanceof V1ApiError && nextError.code === 'TERMS_NOT_READY') {
            setError('필수 약관을 저장할 수 없어 가입을 완료하지 못했어요.');
            return;
          }

          if (nextError instanceof V1ApiError && nextError.code === 'TERMS_REQUIRED') {
            router.replace('/terms?mode=social');
            return;
          }

          if (nextError instanceof V1ApiError && nextError.code === 'SOCIAL_SIGNUP_EXPIRED') {
            setError('가입 가능 시간이 지났어요. 카카오 로그인부터 다시 시작해 주세요.');
            return;
          }

          setError(nextError instanceof Error ? nextError.message : '가입을 완료하지 못했어요.');
        },
      },
    );
  };

  return (
    <AuthFrame
      topTitle="카카오 가입"
      fixedAction={
        <>
          <button className={`tm-btn tm-btn-lg ${isBlocked ? 'tm-btn-neutral' : 'tm-btn-primary'} tm-btn-block`} disabled={isBlocked} form="v1-social-signup-form" type="submit">
            {completeProfile.isPending ? '저장 중' : isBlocked ? '입력 확인 후 계속' : '운동 설정으로 계속'}
          </button>
          {disabledReason ? <div className="tm-text-micro tm-auth-fixed-reason">{disabledReason}</div> : null}
        </>
      }
    >
      <form className="tm-auth-body" id="v1-social-signup-form" onSubmit={submit}>
        <h1 className="tm-text-heading tm-auth-heading">프로필을 완성하고 운동 설정을 이어가요</h1>
        <p className="tm-text-body tm-auth-sub">카카오 계정 확인이 됐어요. Teameet에서 사용할 정보만 입력해 주세요.</p>
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
                    setGender(value as SocialSignupGender);
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
        </div>
        {error ? (
          <Card pad={16} className="tm-auth-soft-card tm-auth-soft-card-error">
            <div className="tm-text-body-lg">가입을 완료하지 못했어요</div>
            <div className="tm-text-caption">{error}</div>
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
